// qr-server は、QR・バーコードリーダーの画面 (web/) と API を 1 つの実行ファイルで配るサーバー。
//
// 画面のファイルは go:embed で実行ファイルに埋め込むので、動かす PC にはこの実行ファイル 1 つ
// (HTTPS で動かすなら、証明書と鍵も) を置くだけでよい。
// web/ は frontend/ のビルド結果なので、go build の前に frontend で npm run build を実行しておくこと (README)。
//
// 使い方:
//
//	qr-server                                          HTTP で待つ (既定 :8080)
//	qr-server -addr :8443 -cert cert.pem -key key.pem   HTTPS で待つ (スマホのカメラには HTTPS が要る)
//
// ファイルの分け方: main.go は起動、server.go は要求の受け方 (API・画面の配信・共通のヘッダとログ)。
package main

import (
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"os"
	"runtime/debug"
	"time"
)

// webFiles はブラウザに配るファイル (frontend/ のビルド結果)。
// ドットや _ で始まるファイル (macOS の ._* など) は go:embed が自動で除く。
//
//go:embed web
var webFiles embed.FS

// version は版。bin/build.sh (Docker) は -ldflags "-X main.version=..." で入れる。
// 空なら、go build が記録した git のコミットを使う (appVersion)。
var version string

func main() {
	addr := flag.String("addr", ":8080", "待ち受けるアドレス。:8443 なら、この PC のすべての IP アドレスの 8443 番")
	cert := flag.String("cert", "", "HTTPS の証明書 (PEM)。-key と一緒に指定すると HTTPS で待つ")
	key := flag.String("key", "", "HTTPS の秘密鍵 (PEM)")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(*addr, *cert, *key, log); err != nil {
		log.Error("止まった", "err", err)
		os.Exit(1)
	}
}

func run(addr, cert, key string, log *slog.Logger) error {
	if (cert == "") != (key == "") {
		return errors.New("-cert と -key は両方指定する")
	}
	site, err := siteFS()
	if err != nil {
		return err
	}
	h, err := newHandler(site, appVersion(), log)
	if err != nil {
		return err
	}
	https := cert != ""
	log.Info("待ち受けを始める", "addr", addr, "https", https, "version", appVersion())
	for _, u := range openURLs(addr, https) {
		log.Info("開く URL", "url", u)
	}
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 10 * time.Second}
	if https {
		return srv.ListenAndServeTLS(cert, key)
	}
	return srv.ListenAndServe()
}

// siteFS は埋め込んだ web/ の中身 (index.html がある階層) を返す。
func siteFS() (fs.FS, error) {
	site, err := fs.Sub(webFiles, "web")
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(site, "index.html"); err != nil {
		return nil, fmt.Errorf("web/index.html が埋め込まれていない (先に frontend で npm run build を実行する): %w", err)
	}
	return site, nil
}

// appVersion は /api/health で返す版 (git のコミットの先頭 7 桁。コミットしていない変更があれば -dirty)。
func appVersion() string {
	if version != "" {
		return version
	}
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	rev, dirty := "", false
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	if len(rev) < 7 {
		return "dev"
	}
	if dirty {
		return rev[:7] + "-dirty"
	}
	return rev[:7]
}

// openURLs は、ほかの端末から開く URL (この PC の IPv4 アドレスごと)。起動した時にログに出す。
func openURLs(addr string, https bool) []string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil
	}
	scheme := "http"
	if https {
		scheme = "https"
	}
	hosts := []string{host}
	if host == "" { // すべての IP アドレスで待つ時
		hosts = []string{"localhost"}
		addrs, _ := net.InterfaceAddrs()
		for _, a := range addrs {
			if ip, ok := a.(*net.IPNet); ok && ip.IP.To4() != nil && !ip.IP.IsLoopback() {
				hosts = append(hosts, ip.IP.String())
			}
		}
	}
	urls := make([]string, len(hosts))
	for i, h := range hosts {
		urls[i] = fmt.Sprintf("%s://%s/", scheme, net.JoinHostPort(h, port))
	}
	return urls
}
