package main

import (
	"encoding/json"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

// 埋め込んだ web/ の代わりに、メモリ上のファイルを渡す
func newTestServer(t *testing.T) http.Handler {
	t.Helper()
	site := fstest.MapFS{
		"index.html":                    {Data: []byte("<!doctype html><title>qr</title>")},
		"third-party-licenses.txt":      {Data: []byte("licenses")},
		"assets/index-AbC123.js":        {Data: []byte("console.log(1)")},
		"assets/zxing_reader-XyZ9.wasm": {Data: []byte("\x00asm")},
	}
	h, err := newHandler(site, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func get(h http.Handler, path string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	rec := get(newTestServer(t), "/api/health", nil)
	var got healthResponse
	if rec.Code != http.StatusOK || json.NewDecoder(rec.Body).Decode(&got) != nil {
		t.Fatalf("status = %d", rec.Code)
	}
	if got != (healthResponse{Status: "ok", Version: "test"}) {
		t.Errorf("got %+v", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
}

func TestUnknownAPIIsJSON404(t *testing.T) {
	h := newTestServer(t)
	for _, path := range []string{"/api/nope", "/api/"} {
		rec := get(h, path, nil)
		var got errorResponse
		if rec.Code != http.StatusNotFound || json.NewDecoder(rec.Body).Decode(&got) != nil || got.Error == "" {
			t.Errorf("%s: status = %d body = %+v (画面の index.html を返してはいけない)", path, rec.Code, got)
		}
	}
}

func TestStatic(t *testing.T) {
	h := newTestServer(t)
	tests := []struct {
		path        string
		status      int
		cache       string
		contentType string
	}{
		{"/", 200, "no-cache", "text/html; charset=utf-8"},
		{"/third-party-licenses.txt", 200, "no-cache", "text/plain; charset=utf-8"},
		{"/assets/index-AbC123.js", 200, "public, max-age=31536000, immutable", "text/javascript; charset=utf-8"},
		{"/assets/zxing_reader-XyZ9.wasm", 200, "public, max-age=31536000, immutable", "application/wasm"},
		{"/assets/", 404, "", ""},       // フォルダの一覧は見せない
		{"/nope.html", 404, "", ""},     // 無いファイル
		{"/../index.html", 307, "", ""}, // 上の階層には出られない (ServeMux がきれいなパスへ転送する)
	}
	for _, tt := range tests {
		rec := get(h, tt.path, nil)
		if rec.Code != tt.status {
			t.Errorf("%s: status = %d, want %d", tt.path, rec.Code, tt.status)
			continue
		}
		if tt.status != http.StatusOK {
			continue
		}
		if got := rec.Header().Get("Cache-Control"); got != tt.cache {
			t.Errorf("%s: Cache-Control = %q, want %q", tt.path, got, tt.cache)
		}
		if got := rec.Header().Get("Content-Type"); got != tt.contentType {
			t.Errorf("%s: Content-Type = %q, want %q", tt.path, got, tt.contentType)
		}
	}
}

func TestETagReturns304WhenUnchanged(t *testing.T) {
	h := newTestServer(t)
	tag := get(h, "/", nil).Header().Get("ETag")
	if tag == "" {
		t.Fatal("ETag が無い")
	}
	if rec := get(h, "/", map[string]string{"If-None-Match": tag}); rec.Code != http.StatusNotModified {
		t.Errorf("status = %d, want 304", rec.Code)
	}
	if rec := get(h, "/", map[string]string{"If-None-Match": `"old"`}); rec.Code != http.StatusOK {
		t.Errorf("変わった時の status = %d, want 200", rec.Code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	h := newTestServer(t)
	for _, path := range []string{"/", "/api/health", "/nope"} {
		if got := get(h, path, nil).Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("%s: 安全のためのヘッダが無い", path)
		}
	}
}

func TestFileName(t *testing.T) {
	for in, want := range map[string]string{
		"/":              "index.html",
		"/index.html":    "index.html",
		"/sub/":          "sub/index.html",
		"/assets/a.js":   "assets/a.js",
		"/../etc/passwd": "etc/passwd",
	} {
		if got := fileName(in); got != want {
			t.Errorf("fileName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestOpenURLs(t *testing.T) {
	if got := openURLs("192.168.1.5:8443", true); len(got) != 1 || got[0] != "https://192.168.1.5:8443/" {
		t.Errorf("got %v", got)
	}
	if got := openURLs(":8080", false); len(got) == 0 || got[0] != "http://localhost:8080/" {
		t.Errorf("got %v", got)
	}
}

func TestCertAndKeyGoTogether(t *testing.T) {
	err := run(":0", "cert.pem", "", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err == nil || !strings.Contains(err.Error(), "-cert と -key") {
		t.Errorf("err = %v", err)
	}
}

// 画面のビルド結果がちゃんと埋め込まれているか (index.html と、ハッシュ付きの assets/。macOS の隠しファイルは除く)
func TestSiteIsEmbedded(t *testing.T) {
	site, err := siteFS()
	if err != nil {
		t.Fatal(err)
	}
	assets, err := fs.Glob(site, "assets/*")
	if err != nil || len(assets) == 0 {
		t.Fatalf("assets/ が空 (%v)", err)
	}
	for _, p := range assets {
		if strings.HasPrefix(p, "assets/._") {
			t.Errorf("macOS の隠しファイルが混ざっている: %s", p)
		}
	}
}
