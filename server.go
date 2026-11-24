package main

// 要求の受け方: /api/ の下は API、それ以外は画面のファイル。どの返事にも安全のためのヘッダを付け、要求ごとに 1 行ログを書く。
//
// API を足す時: newHandler の「API」の所に mux.HandleFunc を 1 行足し、ハンドラを下の「API」の節に書く
// (返事は writeJSON / writeError で書く)。

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"
)

// newHandler は、すべての要求を受けるハンドラを作る。site は画面のファイル (テストではメモリ上のファイルを渡す)。
func newHandler(site fs.FS, version string, log *slog.Logger) (http.Handler, error) {
	static, err := staticHandler(site)
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	// API
	mux.HandleFunc("GET /api/health", health(version))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not found") // 知らない API は JSON の 404 (画面を返さない)
	})
	// 画面
	mux.Handle("/", static)
	return withAccessLog(log, withSecurityHeaders(mux)), nil
}

// ---------- API ----------

// healthResponse は GET /api/health の返事。動いているかと、どの版 (git のコミット) が動いているかを確かめる。
type healthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func health(version string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, healthResponse{Status: "ok", Version: version})
	}
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v) // 書けない時は相手が切れている。できることは無い
}

// ---------- 画面のファイル ----------

// staticHandler は画面のファイルを配る。
//
//   - キャッシュ: ファイル名にハッシュが付いた assets/ は 1 年そのまま使わせる。ほか (index.html など) は毎回確かめさせる
//   - ETag: 起動時に全ファイルの中身から 1 回だけ作る。確かめに来た時、変わっていなければ 304 (中身を送らない)
//   - 無いファイル・フォルダの一覧は 404 (フォルダの中身を見せない)
//
// 中身の種類 (Content-Type) は拡張子から決まる (.wasm も application/wasm になる)。
func staticHandler(site fs.FS) (http.Handler, error) {
	etags, err := hashFiles(site)
	if err != nil {
		return nil, err
	}
	files := http.FileServerFS(site)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tag, ok := etags[fileName(r.URL.Path)]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", cacheControl(r.URL.Path))
		w.Header().Set("ETag", tag) // http.FileServer がこれを見て、If-None-Match に 304 を返す
		files.ServeHTTP(w, r)
	}), nil
}

// fileName は URL のパスを、配るファイルの名前にする ("/" と "/a/" は index.html)。
func fileName(urlPath string) string {
	name := strings.TrimPrefix(path.Clean("/"+urlPath), "/")
	if name == "" || strings.HasSuffix(urlPath, "/") {
		return path.Join(name, "index.html")
	}
	return name
}

// cacheControl は、ファイルごとのキャッシュの指定。
func cacheControl(urlPath string) string {
	if strings.HasPrefix(urlPath, "/assets/") {
		return "public, max-age=31536000, immutable" // Vite がファイル名に中身のハッシュを付けるので、変わることはない
	}
	return "no-cache" // 使う前に毎回確かめる (変わっていなければ 304)
}

// hashFiles は、全ファイルの ETag (中身の SHA-256 の先頭 16 桁) を作る。
func hashFiles(site fs.FS) (map[string]string, error) {
	etags := map[string]string{}
	err := fs.WalkDir(site, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := fs.ReadFile(site, name)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(b)
		etags[name] = `"` + hex.EncodeToString(sum[:8]) + `"`
		return nil
	})
	return etags, err
}

// ---------- 共通 (安全のためのヘッダ・ログ) ----------

// withSecurityHeaders は、どの返事にも安全のためのヘッダを付ける。
func withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")                                  // 中身の種類を推測させない
		h.Set("Referrer-Policy", "no-referrer")                                     // 読んだ URL を開いた時に、このページを相手に伝えない
		h.Set("X-Frame-Options", "DENY")                                            // ほかのサイトの中に埋め込ませない
		h.Set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()") // カメラはこのサイトだけ
		next.ServeHTTP(w, r)
	})
}

// withAccessLog は、要求ごとに 1 行ログを書く (方法・パス・状態・かかった時間)。
func withAccessLog(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Info("要求", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds())
	})
}

// statusRecorder は、返した状態 (200・404 など) を覚える。
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Unwrap は http.ResponseController が元の ResponseWriter を使えるようにする。
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }
