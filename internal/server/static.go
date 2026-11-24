package server

import (
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// Static は画面のファイルを配るハンドラを作る。
//
//   - キャッシュ: ファイル名にハッシュが付いた assets/ は 1 年そのまま使わせる。ほか (index.html など) は毎回確かめさせる
//   - ETag: 起動時に全ファイルの中身から 1 回だけ作る。確かめに来た時、変わっていなければ 304 (中身を送らない)
//   - 無いファイル・フォルダの一覧は 404 (フォルダの中身を見せない)
//
// 中身の種類 (Content-Type) は拡張子から決まる (.wasm も application/wasm になる)。
func Static(site fs.FS) (http.Handler, error) {
	etags, err := hashFiles(site)
	if err != nil {
		return nil, err
	}
	files := http.FileServerFS(site)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tag, ok := etags[fileName(r.URL.Path)]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", cacheControl(r.URL.Path))
		w.Header().Set("ETag", tag) // http.FileServer がこれを見て、If-None-Match に 304 を返す
		files.ServeHTTP(w, r)
	}), nil
}

// fileName は URL のパスを、配るファイルの名前にする ("/" と "/a/" は index.html)。
func fileName(urlPath string) string {
	name := strings.TrimPrefix(path.Clean("/"+urlPath), "/")
	if name == "" || strings.HasSuffix(urlPath, "/") {
		return path.Join(name, "index.html")
	}
	return name
}

// cacheControl は、ファイルごとのキャッシュの指定。
func cacheControl(urlPath string) string {
	if strings.HasPrefix(urlPath, "/assets/") {
		return "public, max-age=31536000, immutable" // Vite がファイル名に中身のハッシュを付けるので、変わることはない
	}
	return "no-cache" // 使う前に毎回確かめる (変わっていなければ 304)
}

// hashFiles は、全ファイルの ETag (中身の SHA-256 の先頭 16 桁) を作る。
func hashFiles(site fs.FS) (map[string]string, error) {
	etags := map[string]string{}
	err := fs.WalkDir(site, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := fs.ReadFile(site, name)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(b)
		etags[name] = `"` + hex.EncodeToString(sum[:8]) + `"`
		return nil
	})
	return etags, err
}
