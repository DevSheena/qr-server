# qr-server — QR・バーコードリーダー (Go のサーバー版)

ブラウザで動く QR・バーコードリーダーの画面と API を、**実行ファイル 1 つ**で配るサーバー。
画面のファイルは実行ファイルに埋め込む (go:embed) ので、LAN の PC にはこの実行ファイル (と HTTPS の証明書) を置くだけで動く。
Linux・Windows・Mac のどれでも、同じ手順で作って動かせる (Docker は要らない)。

## 必要なもの (開発する PC)

| もの | 版 | 使い道 |
|---|---|---|
| Node.js | 22 以上 | 画面のビルドとテスト (frontend/) |
| Go | 1.22 以上 | サーバーのビルドとテスト |
| git | — | 無くても動く。あれば、どのコミットから作ったかが /api/health に出る |

ビルドの時にインターネットを使うのは、画面の依存を入れる `npm ci` だけ。動かす PC (LAN) はインターネットが無くてよい。

## 作る (どの OS も同じ)

```bash
cd frontend
npm ci          # 初回と、package-lock.json が変わった時だけ
npm run build   # 画面をビルドして ../web/ に出す
cd ..
go build        # web/ を埋め込んだ実行ファイル qr-server (Windows は qr-server.exe) ができる
```

`go build` は `web/` が無いと失敗するので、画面を変えたら必ず `npm run build` から。

## 動かす

```bash
./qr-server                                          # HTTP: http://<この PC の IP>:8080/
./qr-server -addr :8443 -cert cert.pem -key key.pem   # HTTPS: https://<この PC の IP>:8443/
```

- Windows の PowerShell では `.\qr-server.exe -addr :8443 -cert cert.pem -key key.pem`
- 起動すると、ほかの端末から開く URL をログに出す。止める時は Ctrl+C
- **スマホのカメラは HTTPS でないと使えない** (この PC の中で localhost で開く時だけは HTTP でよい)
- 初回は OS のファイアウォールが聞いてくることがある。Windows は「プライベート ネットワーク」を許可。Linux は使うポートを開ける

### HTTPS の証明書を作る

Go に付いてくる道具で作れる (どの OS も同じ。`--host` には、この PC の IP アドレスを書く):

```bash
go run "$(go env GOROOT)/src/crypto/tls/generate_cert.go" --host 192.168.1.10,localhost
```

今いるフォルダに `cert.pem` (証明書) と `key.pem` (秘密鍵) ができる。有効期限は 1 年。
自分で作った証明書なので、端末ごとに初回だけ警告が出る (「詳細」などから進む)。社内の証明書があれば、それを `-cert`・`-key` に渡す。
秘密鍵は人に渡さない (`*.pem` は git に入れない設定にしてある)。

### ほかの OS 用に作る

開発する PC と動かす PC の OS が違う時は、GOOS・GOARCH を付けて作り、できた 1 つのファイルを持っていく。

```bash
GOOS=linux GOARCH=amd64 go build -o qr-server-linux     # Linux / Mac / WSL で
```

PowerShell では `$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o qr-server-linux` (終わったら `Remove-Item Env:GOOS, Env:GOARCH`)。
GOOS は `linux`・`windows`・`darwin` (Mac)、GOARCH は `amd64` (Intel・AMD)・`arm64` (Apple の M シリーズなど)。

## テスト

```bash
cd frontend
npm test        # 画面 (vitest。純粋な関数とつなぎ目)
npx tsc --noEmit  # 型の確かめ
cd ..
go test ./...   # サーバー (web/ が要るので、先に npm run build)
```

## 構成

```
qr-server/
├─ main.go        起動 (起動オプション・web/ の埋め込み・版)
├─ server.go      要求の受け方 (API・画面の配信・安全のためのヘッダ・ログ)
├─ server_test.go
├─ go.mod         外部の依存なし (標準ライブラリだけ)
├─ frontend/      画面のソース (Vite + TypeScript)。ビルドすると ../web/ に出る
├─ web/           ブラウザに配るファイル (ビルドで作る。git に入れない)
├─ bin/・Dockerfile  この Mac 用 (下の「この Mac で動かす」)
└─ README.md
```

```
frontend/ ──npm run build──▶ web/ ──go build (埋め込む)──▶ qr-server (1 ファイル) ──▶ LAN の PC で動かす
```

| 要求 | 返すもの |
|---|---|
| `GET /api/health` | `{"status":"ok","version":"<git のコミット>"}`。動いているかと、どの版が動いているかの確認用 |
| `/api/` の下のそれ以外 | JSON の 404 |
| それ以外 | `web/` のファイル。`assets/` は 1 年キャッシュ、ほかは毎回確かめる (変わっていなければ 304)。無ければ 404 |

## どこを直すか

| やりたいこと | 直す所 |
|---|---|
| 読む種類を足す・外す・名前を変える | `frontend/src/formats.ts` の `FORMAT_INFO` の表 (1 種類 1 行) |
| 読む種類の組み合わせ (プリセット) | `frontend/src/formats.ts` の `PRESETS` と `DEFAULT_PRESET_ID` |
| 設定を足す・選択肢や既定値や説明を変える (速さの調整も) | `frontend/src/settings.ts` の `SETTINGS` の表 (1 設定 1 項目)。画面・保存・読み込みは自動で付いてくる |
| 設定が変わった時の動き | `frontend/src/main.ts` の `store.subscribe` (1 つの動きが 1 行) |
| 設定の値をどこで使っているか | `main.ts` の `store.value.<名前>` (例: `roi`・`scale` は `scanOnce`、`hz` は `ScanLoop`) |
| zxing の細かい指定 (縮小して探す・一度に読む数) | `frontend/src/scanner/zxing.worker.ts` の `readerOptions` |
| 枠の先読み・枠を残す時間の数値 | `frontend/src/tracks.ts` の `TRACKING` |
| 画面に出る文字 | `frontend/src/text.ts` (設定の文字は `settings.ts` の表) |
| API を足す | `server.go` の `newHandler` に 1 行足し、ハンドラを「API」の節に書く |
| 起動オプションを足す | `main.go` の `main` (`flag.String` など) |

### 画面のファイル (frontend/src)

| ファイル | 役割 |
|---|---|
| `main.ts` | 部品を作ってつなぐ。設定が変わった時の動きもここ |
| `formats.ts` / `settings.ts` | 読む種類の表 / 設定の表・保存・読み込み |
| `settings-view.ts` | 設定の画面 (表から作るので、普段は触らない) |
| `camera.ts` / `scan-loop.ts` / `frame.ts` | カメラ / 読み取りの繰り返し / 解析する画像 (読む範囲・縮小) |
| `scanner/` | 読み取り。`plan.ts` 内蔵と zxing の振り分け、`normalize.ts` 結果を揃える (UPC-A の表記など)、`zxing.worker.ts` zxing |
| `tracks.ts` / `overlay.ts` | 枠の追跡と先読み / 描画 |
| `history.ts` / `results-view.ts` | 読んだ内容の記録 / 表示 (最後に読んだ内容と履歴) |
| `text.ts` / `sheets.ts` / `notify.ts` | 画面の文字 / 設定・履歴のシート / 振動と音 |
| `geometry.ts` / `math.ts` / `dom.ts` / `elements.ts` | 座標 / 数 / DOM の道具 / HTML の要素 |
| `*.test.ts` | テスト (元のファイルの隣) |

## 使っているもの

| 区分 | もの | ライセンス |
|---|---|---|
| 読み取り (主) | BarcodeDetector (ブラウザ内蔵。ライブラリ不要) | — |
| 読み取り (予備) | zxing-wasm 3.1.6 (中身は zxing-cpp。iPhone の Safari など内蔵が無い環境用) | MIT / Apache-2.0 |
| 画面 | TypeScript 5.9、Vite 8 (ビルドだけ)、vitest 5 (テスト) | — |
| サーバー | Go (標準ライブラリだけ) | BSD |

npm のパッケージは npm 公式 (registry.npmjs.org) から入れ、版と改ざん確認用のハッシュを `frontend/package-lock.json` に記録している。
配るファイルに入るのは zxing-wasm だけで、そのライセンス文はビルドの時に `web/third-party-licenses.txt` に作り、画面の設定の下からリンクしている。

## この Mac で動かす (Docker)

このリポジトリを置いている Mac では、重い処理を上限つきのコンテナで動かす決まり (グローバル規約 R1/R2) があるので、`bin/` の手順で動かす。
ほかの PC では使わない (Mac 専用のコマンドを使っている)。

```bash
bin/serve.sh   # ビルド → 配信 (Mac: http://localhost:5187/ 、スマホ: https://<Mac の IP>:5188/)
bin/test.sh    # テスト
bin/stop.sh    # このアプリのコンテナだけを止める
```

コンテナの上限 (実測、2026-11-24、Mac M4): 依存のインストール 548 MiB → 1 GiB、画面のビルド 205 MiB・テスト 253 MiB → 512 MiB、Go のビルド・テスト 393 MiB → 768 MiB、配信 6〜8 MiB → 64 MiB。

## 確かめたこと (2026-11-24、Mac M4 の Chrome)

動く QR を映した偽のカメラと、この Mac の Docker で確かめた。

| 項目 | 結果 |
|---|---|
| 読み取り (自動 = 内蔵 / zxing だけ) | どちらも読めた |
| 枠の先読み | 枠のずれ 26 px → 11 px |
| 設定の画面 | 表から前と同じ行・説明で作られ、変えると保存された。前面カメラにすると左右反転も付いた |
| 履歴・1 つ読んだら止める・停止・スマホの幅 | 動いた |
| サーバー | `/api/health`、304、`.wasm` の種類、404、HTTPS |
| 3 つの OS 向けのビルド | Linux (amd64)・Windows (amd64 の exe)・Mac (arm64) の実行ファイルができた。証明書を作る道具も動いた |

**まだ確かめていないこと:** Windows・Linux の実機での起動と、ファイアウォール、本物のスマホとカメラ。
