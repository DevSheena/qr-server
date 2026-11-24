package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

var (
	quiet     = slog.New(slog.NewTextHandler(io.Discard, nil))
	testHosts = certHosts{Names: []string{"localhost"}, IPs: []net.IP{net.IPv4(127, 0, 0, 1), net.IPv4(192, 168, 1, 5)}}
	testNow   = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
)

func readBoth(t *testing.T, certFile, keyFile string) []byte {
	t.Helper()
	c, err1 := os.ReadFile(certFile)
	k, err2 := os.ReadFile(keyFile)
	if err1 != nil || err2 != nil {
		t.Fatalf("読めない: %v %v", err1, err2)
	}
	return append(c, k...)
}

func TestAutoCertIsMadeOnceAndReused(t *testing.T) {
	dir := t.TempDir()
	certFile, keyFile, err := autoCert(dir, testHosts, testNow, quiet)
	if err != nil {
		t.Fatal(err)
	}
	first := readBoth(t, certFile, keyFile)

	// 2 回目の起動では作り直さない (端末の警告が出直さないように)
	if _, _, err := autoCert(dir, testHosts, testNow.Add(24*time.Hour), quiet); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, readBoth(t, certFile, keyFile)) {
		t.Error("2 回目の起動で証明書が変わった")
	}

	// HTTPS のサーバーが読める組になっていて、IP アドレスと期限が入っている
	if _, err := tls.LoadX509KeyPair(certFile, keyFile); err != nil {
		t.Fatal(err)
	}
	cert, _ := readCert(certFile, keyFile)
	if len(missingIPs(cert, testHosts.IPs)) != 0 {
		t.Errorf("IP アドレスが入っていない: %v", cert.IPAddresses)
	}
	if !cert.NotAfter.Equal(testNow.Add(certValidity)) {
		t.Errorf("期限 = %v", cert.NotAfter)
	}
	if info, _ := os.Stat(keyFile); info.Size() == 0 {
		t.Error("秘密鍵が空")
	}
}

func TestAutoCertIsRemadeWhenExpired(t *testing.T) {
	dir := t.TempDir()
	certFile, keyFile, _ := autoCert(dir, testHosts, testNow, quiet)
	before := readBoth(t, certFile, keyFile)
	if _, _, err := autoCert(dir, testHosts, testNow.Add(certValidity+time.Hour), quiet); err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(before, readBoth(t, certFile, keyFile)) {
		t.Error("期限が切れても作り直していない")
	}
}

func TestAutoCertWarnsButKeepsCertWhenIPChanged(t *testing.T) {
	dir := t.TempDir()
	certFile, keyFile, _ := autoCert(dir, testHosts, testNow, quiet)
	before := readBoth(t, certFile, keyFile)

	var logged bytes.Buffer
	moved := certHosts{Names: testHosts.Names, IPs: []net.IP{net.IPv4(10, 0, 0, 7)}}
	if _, _, err := autoCert(dir, moved, testNow, slog.New(slog.NewTextHandler(&logged, nil))); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, readBoth(t, certFile, keyFile)) {
		t.Error("IP アドレスが変わっただけで作り直した")
	}
	if !strings.Contains(logged.String(), "10.0.0.7") {
		t.Errorf("入っていない IP アドレスをログで知らせていない: %s", logged.String())
	}
}

func TestAutoCertFailsOnBrokenFiles(t *testing.T) {
	dir := t.TempDir()
	certFile, _, _ := autoCert(dir, testHosts, testNow, quiet)
	if err := os.WriteFile(certFile, []byte("壊れた"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := autoCert(dir, testHosts, testNow, quiet); err == nil {
		t.Error("壊れた証明書を黙って使った")
	}
}

func TestSelfSignedCertDiffersEachTime(t *testing.T) {
	a, _, _ := selfSignedCert(testHosts, testNow)
	b, _, _ := selfSignedCert(testHosts, testNow)
	if bytes.Equal(a, b) {
		t.Error("同じ証明書ができた (鍵は毎回乱数から作るはず)")
	}
}

// 自動で作った証明書で、本当に HTTPS でつながるか。
// 端末が「この証明書を信頼する」と登録していればつながり、していなければ「発行元が分からない」で断られる (ブラウザの警告の理由)
func TestHTTPSWithAutoCert(t *testing.T) {
	certFile, keyFile, err := autoCert(t.TempDir(), testHosts, time.Now(), quiet)
	if err != nil {
		t.Fatal(err)
	}
	pair, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewUnstartedServer(newTestServer(t))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{pair}}
	srv.StartTLS()
	defer srv.Close()

	trusted := x509.NewCertPool()
	certPEM, _ := os.ReadFile(certFile)
	trusted.AppendCertsFromPEM(certPEM)
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: trusted}}}
	res, err := client.Get(srv.URL + "/api/health")
	if err != nil {
		t.Fatalf("信頼した端末でつながらない: %v", err)
	}
	res.Body.Close()

	var unknown x509.UnknownAuthorityError
	if _, err := (&http.Client{}).Get(srv.URL + "/api/health"); !errors.As(err, &unknown) {
		t.Errorf("信頼していない端末なのに、発行元が分からないと言わない: %v", err)
	}
}
