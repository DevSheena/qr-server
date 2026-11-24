package server

import (
	"log/slog"
	"net/http"
	"time"
)

// middleware は、ハンドラを包んで前後に処理を足すもの。
type middleware func(http.Handler) http.Handler

// chain は h を mws で包む。mws[0] がいちばん外側 (要求が最初に通る)。
func chain(h http.Handler, mws ...middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// securityHeaders は、どの返事にも付ける安全のためのヘッダ。
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")                                  // 中身の種類を推測させない
		h.Set("Referrer-Policy", "no-referrer")                                     // 読んだ URL を開いた時に、このページを相手に伝えない
		h.Set("X-Frame-Options", "DENY")                                            // ほかのサイトの中に埋め込ませない
		h.Set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()") // カメラはこのサイトだけ
		next.ServeHTTP(w, r)
	})
}

// accessLog は、要求ごとに 1 行ログを書く (方法・パス・状態・かかった時間)。
func accessLog(log *slog.Logger) middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			log.Info("要求", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds())
		})
	}
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
