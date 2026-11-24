package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
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
	h, err := New(Deps{Site: site, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Version: "test"})
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
	first := get(h, "/", nil)
	tag := first.Header().Get("ETag")
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

func TestAPIAndHeaders(t *testing.T) {
	h := newTestServer(t)
	rec := get(h, "/api/health", nil)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Errorf("/api/health: status = %d type = %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	if rec := get(h, "/api/unknown", nil); rec.Code != 404 {
		t.Errorf("/api/unknown: status = %d (画面の index.html を返してはいけない)", rec.Code)
	}
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
