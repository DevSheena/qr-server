// qr-server は、QR・バーコードリーダーの画面 (web/) と API を 1 つの実行ファイルで配るサーバー。
//
// 画面のファイルは go:embed で実行ファイルに埋め込むので、動かす PC にはこの実行ファイル 1 つを置くだけでよい。
// HTTPS の証明書も、初回の起動で実行ファイルの隣に自動で作る (cert.go)。
// web/ は frontend/ のビルド結果なので、go build の前に frontend で npm run build を実行しておくこと (README)。
//
// 使い方:
//
//	qr-server                                  HTTPS で待つ (:8443。証明書は自動)
//	qr-server -cert my.crt -key my.key          HTTPS で待つ (社内で発行した証明書など、持っている証明書を使う)
//	qr-server -http                            HTTP で待つ (:8080。スマホのカメラは使えない)
//
// ファイルの分け方: main.go は起動、server.go は要求の受け方、cert.go は HTTPS の証明書。
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

// version は版。mac-docker/dev.sh (この Mac の Docker。git が無い) は -ldflags "-X main.version=..." で入れる。
// 空なら、go build が記録した git のコミットを使う (appVersion)。
var version string

// options は起動オプション。
type options struct {
	addr      string // 待ち受けるアドレス (空なら HTTPS は :8443、HTTP は :8080)
	plainHTTP bool   // HTTPS ではなく HTTP で待つ
	cert, key string // 使う証明書と秘密鍵 (空なら自動で作ったもの)
}

func main() {
	var o options
	flag.StringVar(&o.addr, "addr", "", "待ち受けるアドレス。既定は HTTPS なら :8443、-http なら :8080 (この PC のすべての IP アドレスで待つ)")
	flag.BoolVar(&o.plainHTTP, "http", false, "HTTPS ではなく HTTP で待つ (スマホのカメラは使えない)")
	flag.StringVar(&o.cert, "cert", "", "使う証明書 (PEM)。省くと、初回の起動で実行ファイルの隣に作った証明書を使う")
	flag.StringVar(&o.key, "key", "", "使う秘密鍵 (PEM)。-cert と一緒に指定する")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(o, log); err != nil {
		log.Error("止まった", "err", err)
		os.Exit(1)
	}
}

// validate は、一緒に使えない起動オプションを見つける。
func (o options) validate() error {
	if (o.cert == "") != (o.key == "") {
		return errors.New("-cert と -key は両方指定する")
	}
	if o.plainHTTP && o.cert != "" {
		return errors.New("-http と -cert は一緒に使えない")
	}
	return nil
}

// listenAddr は待ち受けるアドレス。指定が無ければ、HTTPS は :8443、HTTP は :8080。
func (o options) listenAddr() string {
	switch {
	case o.addr != "":
		return o.addr
	case o.plainHTTP:
		return ":8080"
	default:
		return ":8443"
	}
}

func run(o options, log *slog.Logger) error {
	if err := o.validate(); err != nil {
		return err
	}
	addr := o.listenAddr()
	site, err := siteFS()
	if err != nil {
		return err
	}
	h, err := newHandler(site, appVersion(), log)
	if err != nil {
		return err
	}
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 10 * time.Second}

	if o.plainHTTP {
		logStart(log, addr, false)
		return srv.ListenAndServe()
	}
	cert, key := o.cert, o.key
	if cert == "" {
		dir, err := exeDir()
		if err != nil {
			return err
		}
		if cert, key, err = autoCert(dir, thisPCHosts(), time.Now(), log); err != nil {
			return err
		}
	}
	logStart(log, addr, true)
	return srv.ListenAndServeTLS(cert, key)
}

// logStart は、待ち受けを始めることと、ほかの端末から開く URL をログに出す。
func logStart(log *slog.Logger, addr string, https bool) {
	log.Info("待ち受けを始める (止める時は Ctrl+C)", "addr", addr, "https", https, "version", appVersion())
	for _, u := range openURLs(addr, https) {
		log.Info("開く URL", "url", u)
	}
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

// openURLs は、ほかの端末から開く URL (この PC の IPv4 アドレスごと)。
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
		for _, ip := range localIPv4s() {
			hosts = append(hosts, ip.String())
		}
	}
	urls := make([]string, len(hosts))
	for i, h := range hosts {
		urls[i] = fmt.Sprintf("%s://%s/", scheme, net.JoinHostPort(h, port))
	}
	return urls
}

// localIPv4s は、この PC の IPv4 アドレス (127.0.0.1 などの自分自身を指すものは除く)。
func localIPv4s() []net.IP {
	addrs, _ := net.InterfaceAddrs()
	var ips []net.IP
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil && !n.IP.IsLoopback() {
			ips = append(ips, n.IP.To4())
		}
	}
	return ips
}
