# qr-server — QR・バーコードリーダー (Go のサーバー版)

[qr-reader](../qr-reader/README.md) の画面を、Go のサーバーから配る形にしたもの。
**画面のファイルを Go の実行ファイルに埋め込む (go:embed) ので、本番ではこの実行ファイル 1 つを置くだけで動く。**
画面の見た目と動きは qr-reader と同じで、コードは読みやすく分け直した (下の「qr-reader から変えたこと」)。

## 構成

```
qr-server/
├─ main.go            起動。web/ を go:embed で実行ファイルに埋め込む
├─ go.mod             Go 1.27。外部の依存なし (標準ライブラリだけ)
├─ internal/
│   ├─ config/        環境変数から設定を読む
│   ├─ server/        入口: /api/ と画面を振り分け、共通のヘッダ・ログ・キャッシュ
│   └─ api/           API (/api/...)
├─ frontend/          画面のソース (Vite + TypeScript)。ビルドすると ../web/ に出る
├─ web/               ブラウザに配るファイル (ビルドで作る。git に入れない)
├─ build/             実行ファイル (build/linux-<CPU>/qr-server) と試し用の証明書 (git に入れない)
├─ Dockerfile         本番用のイメージ。実行ファイル 1 つをコピーするだけ
└─ bin/               Docker で動かす手順 (下の「動かし方」)
```

## 仕組み

```
frontend/ ──Vite──▶ web/ ──go:embed──▶ qr-server (実行ファイル 1 つ) ──▶ Docker イメージ ──▶ デプロイ先
```

| 要求 | 返すもの |
|---|---|
| `GET /api/health` | `{"status":"ok","version":"<git のコミット>"}`。生存確認と、どの版が動いているかの確認用 |
| `/api/` の下のそれ以外 | JSON の 404 (画面を返さない) |
| それ以外 | `web/` のファイル。無ければ 404 (フォルダの一覧は見せない) |

- **キャッシュ:** `assets/` (ファイル名に中身のハッシュが付く) は 1 年使わせる。`index.html` などは毎回確かめさせ、変わっていなければ 304 (ETag は起動時に 1 回だけ計算)
- **安全のためのヘッダ:** 中身の種類を推測させない・ほかのサイトに埋め込ませない・カメラはこのサイトだけ、など (`internal/server/middleware.go`)
- **ログ:** 要求ごとに 1 行 (方法・パス・状態・時間)
- **止める時:** SIGTERM (Cloud Run などが送る) を受けたら、処理中の要求を待ってから止まる

### 設定 (環境変数)

| 名前 | 既定 | 意味 |
|---|---|---|
| `PORT` | 8080 | 待ち受けるポート。Cloud Run などは自分で決めて渡す |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | なし | 両方あれば HTTPS で待つ。本番はデプロイ先が HTTPS を付けるので不要。手元でスマホから試す時だけ使う |

## 動かし方

Docker Desktop が動いていること (自動では起動しない。止まっていれば `open -a Docker`)。
どれも上限つきのコンテナの中で動き、全プロジェクト共通の予算判定と鍵 (`/tmp/docker_budget.lock`) を通る (グローバル規約 R1/R2)。

```bash
bin/serve.sh        # ビルド → イメージ → 配信 (前のものは入れ替える)
bin/test.sh         # テスト (画面: 型の確かめ + vitest、Go: vet + test)
bin/stop.sh         # このアプリのコンテナだけを止める
bin/image.sh amd64  # デプロイ用のイメージ (qr-server:<版>-amd64)
```

- この Mac: http://localhost:5187/
- スマホ (同じ Wi-Fi): https://<Mac の IP>:5188/ (自己署名。最初の 1 回だけ証明書の警告を「詳細」から進む。証明書は `build/devcert/` に作って使い回す)
- `LAN=0 bin/serve.sh` でスマホ用の配信を止める

**`go build` を直接打つと失敗する** (`web/` が無いため)。必ず `bin/build.sh` を通す (画面をビルドしてから Go をビルドする)。

### コンテナの上限 (実測、2026-11-24、Mac M4)

| 作業 | ピーク | 上限 |
|---|---|---|
| 画面の依存のインストール (`npm ci`) | 548 MiB | 1 GiB |
| 画面のビルド | 205 MiB | 512 MiB |
| 画面のテスト | 253 MiB | 512 MiB |
| Go のビルド・テスト (キャッシュなし) | 393 MiB | 768 MiB |
| 配信 (サーバー 1 つ) | 6〜8 MiB | 64 MiB・CPU 0.5 |

イメージは 17.7 MB (中身は実行ファイル 7.8 MB と、最小の土台 distroless/static)。

## デプロイ

デプロイ先はまだ決めていない。どこでも、`bin/image.sh amd64` で作ったイメージを送れば動く (Cloud Run などは amd64。この Mac は arm64)。
デプロイ先では `PORT` を渡し、HTTPS はデプロイ先に付けてもらう (カメラには HTTPS が要る)。

## 直し方 (どこを触るか)

| やりたいこと | 触る所 |
|---|---|
| API を足す | `internal/api/api.go` の `New` に 1 行足し、ハンドラを同じパッケージに書く。使う部品は `Deps` で渡す |
| サーバーの設定を足す | `internal/config/config.go` の `Config` と `Load` |
| 画面の設定を足す | `frontend/src/settings.ts` (`Settings`・`DEFAULTS`・`PARSERS`) と `settings-view.ts` の行。変わった時の動きは `main.ts` の `store.subscribe` |
| 読む種類を足す | `frontend/src/formats.ts` (`FORMATS`・`FMT_LABEL`・`ZXING_NAME`。書き忘れはビルドで分かる) |
| 画面の文字を変える | `frontend/src/text.ts` |
| ポート・イメージを変える | `bin/env.sh` |

### 画面のファイル (frontend/src)

| ファイル | 役割 |
|---|---|
| `main.ts` | 部品を作ってつなぐだけ |
| `camera.ts` / `scan-loop.ts` | カメラ / 読み取りの繰り返し (前の解析が終わるまで次は読まない) |
| `scanner/` | 読み取り。`plan.ts` 内蔵と zxing の振り分け、`normalize.ts` 結果を揃える (UPC-A の表記など)、`zxing-client.ts` Worker とのやりとり |
| `frame.ts` | 解析する画像 (読む範囲・縮小) |
| `tracks.ts` / `overlay.ts` | 枠の追跡と先読み / 描画 |
| `history.ts` / `results-view.ts` | 読んだ内容の記録 / 表示 |
| `settings.ts` / `settings-view.ts` / `form.ts` | 設定の保存と決まりごと / 設定の画面 / 汎用の部品 |
| `sheets.ts` / `notify.ts` / `text.ts` | シートの開閉 / 振動・音 / 画面の文字 |
| `geometry.ts` / `math.ts` / `formats.ts` / `dom.ts` / `elements.ts` | 座標 / 数 / 読む種類 / DOM の道具 / HTML の要素 |

## qr-reader から変えたこと

- **配り方:** Vite の配信 → Go のサーバー。画面は実行ファイルに埋め込む。手元のスマホ用の HTTPS も Go が受け持つ
- **画面のコード:** 800 行の `main.ts` を役割ごとのファイルに分けた。計算は純粋関数にし、ブラウザの部品 (BarcodeDetector・Worker・localStorage) は外から渡す (テストでは偽物を渡す)
- **設定:** 1 つのストアに集め、変わった時の動きを `main.ts` の 1 か所にまとめた。保存した値は 1 つずつ型を確かめて読む (壊れた値で動かなくならない)
- **直した不具合になりうる所:**
  - zxing の Worker が落ちた時に、読み取りが待ったまま止まる → 待っている要求を失敗にする
  - 画面を裏から戻すたびに、読み取りの予約が 2 重になる → 前の予約を取り消してから予約し直す
  - 設定を続けて変えた時に、古い準備の終わりで新しい設定が上書きされる → 後の設定だけを使う
- **テスト:** 画面 57 件 (vitest)・Go 4 パッケージ。qr-reader にはテストが無かった

## 確かめたこと (2026-11-24、Mac M4 の Chrome)

動く QR を映した偽のカメラで確かめた。

| 項目 | 結果 |
|---|---|
| 読み取り (自動 = 内蔵) | 読めた。11 ms・58 回/秒 |
| 方式「zxing だけ」 | zxing で読めた。設定の説明も切り替わった |
| 枠の先読み (左右に往復) | 枠のずれ 26 px → 11 px (qr-reader の計測と同じ程度) |
| 読む種類・保存 | チェックを外すと合うプリセットに変わり、localStorage に保存された |
| 1 つ読んだら止める・タップで続ける・履歴を消す・停止 | 動いた |
| スマホの幅 (375px) | ページ全体がスクロールしない。設定は下から重なる |
| サーバー | `/api/health`、304、`.wasm` の種類、フォルダの一覧の 404、HTTPS (5188) |

**まだ確かめていないこと:** 実際のスマホ (iPhone の Safari・Android の Chrome) と本物のカメラ、デプロイ先での動き。
