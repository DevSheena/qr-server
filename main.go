// qr-server は、QR・バーコードリーダーの画面 (web/) と API を 1 つの実行ファイルで配るサーバー。
//
// 画面のファイルは go:embed で実行ファイルに埋め込むので、本番ではこの実行ファイル 1 つを置くだけで動く。
// web/ は frontend/ のビルド結果なので、先に bin/build.sh で作ること (無いと go build が通らない)。
//
// 設定は環境変数 (internal/config): PORT (既定 8080)、TLS_CERT_FILE と TLS_KEY_FILE (両方あれば HTTPS)。
package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"qr-server/internal/config"
	"qr-server/internal/server"
)

// webFiles はブラウザに配るファイル (frontend/ のビルド結果)。
// ドットや _ で始まるファイル (macOS の ._* など) は go:embed が自動で除く。
//
//go:embed web
var webFiles embed.FS

// version はビルドの時に -ldflags "-X main.version=..." で入れる (bin/build.sh)。/api/health で返す。
var version = "dev"

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("止まった", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	site, err := siteFS()
	if err != nil {
		return err
	}
	// Cloud Run などは止める時に SIGTERM を送る。受けたら、処理中の要求を待ってから止まる
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	h, err := server.New(server.Deps{Site: site, Log: log, Version: version})
	if err != nil {
		return err
	}
	return server.Serve(ctx, cfg, h, log)
}

// siteFS は埋め込んだ web/ の中身 (index.html がある階層) を返す。
func siteFS() (fs.FS, error) {
	site, err := fs.Sub(webFiles, "web")
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(site, "index.html"); err != nil {
		return nil, fmt.Errorf("web/index.html が埋め込まれていない (先に bin/build.sh で画面をビルドする): %w", err)
	}
	return site, nil
}
