// Package server は HTTP の入口。/api/ の下を API (internal/api) に、それ以外を画面のファイル (static.go) に振り分け、
// どの返事にも共通のヘッダとログを付ける (middleware.go)。
package server

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"qr-server/internal/api"
	"qr-server/internal/config"
)

// Deps はサーバーが使うもの。外から渡すので、テストでは偽物 (fstest.MapFS など) を渡せる。
type Deps struct {
	// Site はブラウザに配るファイル (web/ の中身。index.html がある階層)。
	Site    fs.FS
	Log     *slog.Logger
	Version string
}

// New は、すべての要求を受けるハンドラを作る。
func New(d Deps) (http.Handler, error) {
	static, err := Static(d.Site)
	if err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api.New(api.Deps{Version: d.Version}))
	mux.Handle("/", static)
	return chain(mux, accessLog(d.Log), securityHeaders), nil
}

// Serve は cfg の通りに待ち受け、ctx が終わったら (SIGTERM など)、処理中の要求を待ってから止まる。
func Serve(ctx context.Context, cfg config.Config, h http.Handler, log *slog.Logger) error {
	srv := &http.Server{Addr: cfg.Addr, Handler: h, ReadHeaderTimeout: 10 * time.Second}
	errc := make(chan error, 1)
	go func() {
		log.Info("待ち受けを始める", "addr", cfg.Addr, "https", cfg.TLS())
		if cfg.TLS() {
			errc <- srv.ListenAndServeTLS(cfg.CertFile, cfg.KeyFile)
		} else {
			errc <- srv.ListenAndServe()
		}
	}()
	select {
	case err := <-errc:
		return err // 待ち受けられなかった (ポートが使われているなど)
	case <-ctx.Done():
	}
	log.Info("止める (処理中の要求を待つ)")
	sctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil {
		return err
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
