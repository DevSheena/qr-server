package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	rec := httptest.NewRecorder()
	New(Deps{Version: "abc123"}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var got HealthResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got != (HealthResponse{Status: "ok", Version: "abc123"}) {
		t.Errorf("got %+v", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
}

func TestUnknownAPIIsJSON404(t *testing.T) {
	for _, path := range []string{"/api/nope", "/api/"} {
		rec := httptest.NewRecorder()
		New(Deps{}).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		var got ErrorResponse
		if rec.Code != http.StatusNotFound || json.NewDecoder(rec.Body).Decode(&got) != nil || got.Error == "" {
			t.Errorf("%s: status = %d body = %+v", path, rec.Code, got)
		}
	}
}
