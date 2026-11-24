package main

// HTTPS の証明書。-cert・-key を指定しない時は、自己署名の証明書を初回の起動で作って実行ファイルと同じフォルダに保存し、
// 次からは同じものを使う (証明書が変わると、端末のブラウザがもう一度警告を出すので、変えない)。
//
// 証明書が証明するのは「この名前 (IP アドレス・ホスト名) でつながった相手は、この証明書の秘密鍵を持っている」ことだけ。
// 自己署名なので身元を保証する発行元が無く、ブラウザは警告を出す。アプリの中身が安全かどうかは証明しない。

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"slices"
	"time"
)

const (
	certFileName = "qr-server.crt" // 証明書 (端末に配って「信頼する」と登録する時も、このファイルを使う)
	keyFileName  = "qr-server.key" // 秘密鍵 (人に渡さない)
	// 有効期限。Apple の決まり (TLS の証明書は 398 日まで) に収める。切れたら起動した時に作り直す
	certValidity = 397 * 24 * time.Hour
)

// certHosts は証明書に入れる名前。端末が開く URL の名前がこのどれかと合わないと、ブラウザは別の理由でも警告する。
type certHosts struct {
	Names []string // ホスト名 (localhost とこの PC の名前)
	IPs   []net.IP // IP アドレス
}

// thisPCHosts は、この PC の名前と IP アドレス。
func thisPCHosts() certHosts {
	h := certHosts{Names: []string{"localhost"}, IPs: append([]net.IP{net.IPv4(127, 0, 0, 1)}, localIPv4s()...)}
	if name, err := os.Hostname(); err == nil && name != "" && name != "localhost" {
		h.Names = append(h.Names, name)
	}
	return h
}

// autoCert は、dir にある証明書と秘密鍵のファイルの場所を返す。
// 無ければ作る (初回)。期限が切れていれば作り直す。今の IP アドレスが入っていなければ、ログで知らせる (作り直しはしない)。
func autoCert(dir string, hosts certHosts, now time.Time, log *slog.Logger) (certFile, keyFile string, err error) {
	certFile, keyFile = filepath.Join(dir, certFileName), filepath.Join(dir, keyFileName)
	cert, err := readCert(certFile, keyFile)
	switch {
	case err == nil && now.Before(cert.NotAfter):
		if missing := missingIPs(cert, hosts.IPs); len(missing) > 0 {
			// 作り直すと証明書が変わり、すべての端末でまた警告が出るので、自動では作り直さない
			// (Wi-Fi や VPN の入り切りで IP アドレスが増えたり減ったりするたびに変わってしまう)
			log.Warn("証明書に、この PC の今の IP アドレスが入っていない。その IP アドレスで開くとブラウザが警告する。入れるには 2 つのファイルを消して起動し直す",
				"missing", missing, "cert", certFile, "key", keyFile)
		}
		return certFile, keyFile, nil
	case err == nil:
		log.Warn("証明書の期限が切れたので作り直す (端末では、もう一度だけ警告が出る)", "expired", cert.NotAfter)
	case !errors.Is(err, fs.ErrNotExist):
		return "", "", fmt.Errorf("証明書を読めない (%s と %s を消して起動し直すと作り直す): %w", certFile, keyFile, err)
	}

	certPEM, keyPEM, err := selfSignedCert(hosts, now)
	if err != nil {
		return "", "", err
	}
	if err := os.WriteFile(keyFile, keyPEM, 0o600); err != nil {
		return "", "", fmt.Errorf("秘密鍵を保存できない (%s に書き込めるか確かめる): %w", dir, err)
	}
	if err := os.WriteFile(certFile, certPEM, 0o644); err != nil {
		return "", "", fmt.Errorf("証明書を保存できない: %w", err)
	}
	log.Info("証明書を作った (端末では、初回だけ警告が出る)", "cert", certFile, "names", hosts.Names, "ips", hosts.IPs, "until", now.Add(certValidity).Format("2006-01-02"))
	return certFile, keyFile, nil
}

// readCert は証明書を読む。秘密鍵と組になっていなければエラー。
func readCert(certFile, keyFile string) (*x509.Certificate, error) {
	pair, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}
	return x509.ParseCertificate(pair.Certificate[0])
}

// missingIPs は、ips のうち証明書に入っていないもの。
func missingIPs(cert *x509.Certificate, ips []net.IP) []string {
	var missing []string
	for _, ip := range ips {
		if !slices.ContainsFunc(cert.IPAddresses, ip.Equal) {
			missing = append(missing, ip.String())
		}
	}
	return missing
}

// selfSignedCert は、hosts を入れた自己署名の証明書と秘密鍵 (どちらも PEM) を作る。鍵は毎回乱数から作るので、毎回違うものになる。
func selfSignedCert(hosts certHosts, now time.Time) (certPEM, keyPEM []byte, err error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "qr-server"},
		NotBefore:    now.Add(-time.Hour), // PC の時計が少しずれていても使えるように
		NotAfter:     now.Add(certValidity),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     hosts.Names,
		IPAddresses:  hosts.IPs,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key) // 自分で自分に署名する
	if err != nil {
		return nil, nil, err
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER}), nil
}

// exeDir は、この実行ファイルがあるフォルダ (自動で作る証明書の置き場所)。
func exeDir() (string, error) {
	p, err := os.Executable()
	if err != nil {
		return "", err
	}
	if p, err = filepath.EvalSymlinks(p); err != nil {
		return "", err
	}
	return filepath.Dir(p), nil
}
