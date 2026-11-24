package main

import (
	"io/fs"
	"strings"
	"testing"
)

// 画面のビルド結果がちゃんと埋め込まれているか (index.html と、ハッシュ付きの assets/)
func TestSiteIsEmbedded(t *testing.T) {
	site, err := siteFS()
	if err != nil {
		t.Fatal(err)
	}
	var assets []string
	err = fs.WalkDir(site, "assets", func(path string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			assets = append(assets, path)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range assets {
		if strings.HasPrefix(p, "assets/._") {
			t.Errorf("macOS の隠しファイルが混ざっている: %s", p)
		}
	}
	if len(assets) == 0 {
		t.Error("assets/ が空")
	}
}
