// Package config は、環境変数からサーバーの設定を読む。
//
// 設定を足す時: Config に項目を足し、Load で読む (既定値もここで決める)。
package config

import (
	"errors"
	"fmt"
	"strconv"
	"time"
)

// Config はサーバーの設定。
type Config struct {
	// Addr は待ち受けるアドレス (":8080" など)。
	Addr string
	// CertFile と KeyFile は HTTPS の証明書と鍵。空なら HTTP で待つ
	// (本番はデプロイ先が HTTPS を付けるので空。手元でスマホから試す時だけ自己署名の証明書を渡す)。
	CertFile string
	KeyFile  string
	// ShutdownTimeout は、止める時に処理中の要求を待つ最大の時間。
	ShutdownTimeout time.Duration
}

// TLS は HTTPS で待つか。
func (c Config) TLS() bool { return c.CertFile != "" }

// Load は環境変数から設定を読む。getenv を受け取るのは、テストで差し替えるため (本番は os.Getenv)。
func Load(getenv func(string) string) (Config, error) {
	port := getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return Config{}, fmt.Errorf("PORT が正しくない: %q", port)
	}
	c := Config{
		Addr:            ":" + port,
		CertFile:        getenv("TLS_CERT_FILE"),
		KeyFile:         getenv("TLS_KEY_FILE"),
		ShutdownTimeout: 10 * time.Second,
	}
	if (c.CertFile == "") != (c.KeyFile == "") {
		return Config{}, errors.New("TLS_CERT_FILE と TLS_KEY_FILE は両方指定する")
	}
	return c, nil
}
