package config

import "testing"

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestLoad(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		addr    string
		tls     bool
		wantErr bool
	}{
		{name: "既定", env: nil, addr: ":8080"},
		{name: "PORT", env: map[string]string{"PORT": "3000"}, addr: ":3000"},
		{name: "HTTPS", env: map[string]string{"TLS_CERT_FILE": "c.pem", "TLS_KEY_FILE": "k.pem"}, addr: ":8080", tls: true},
		{name: "PORT が数でない", env: map[string]string{"PORT": "http"}, wantErr: true},
		{name: "PORT が範囲の外", env: map[string]string{"PORT": "70000"}, wantErr: true},
		{name: "証明書だけ", env: map[string]string{"TLS_CERT_FILE": "c.pem"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := Load(env(tt.env))
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if c.Addr != tt.addr || c.TLS() != tt.tls {
				t.Errorf("Addr = %q TLS = %v, want %q %v", c.Addr, c.TLS(), tt.addr, tt.tls)
			}
		})
	}
}
