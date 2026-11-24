// Package api は /api/ の下の JSON の API。
//
// API を足す時: New の中に mux.HandleFunc を 1 行足し、ハンドラをこのパッケージに書く (返事は writeJSON / writeError)。
// ハンドラが使う部品 (データベースなど) は Deps に足して、外から渡す (テストでは偽物を渡せるように)。
package api

import (
	"encoding/json"
	"net/http"
)

// Deps は API が使うもの。
type Deps struct {
	// Version はサーバーの版 (git のコミット)。
	Version string
}

// New は /api/ の下を受け持つハンドラを返す。
func New(d Deps) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health(d.Version))
	// 知らない API は JSON で 404 (画面の index.html を返さない)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not found")
	})
	return mux
}

// HealthResponse は GET /api/health の返事。デプロイ先の生存確認と、どの版が動いているかの確認に使う。
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func health(version string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, HealthResponse{Status: "ok", Version: version})
	}
}

// ErrorResponse は失敗の時の返事。
type ErrorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v) // 書けない時は相手が切れている。できることは無い
}
