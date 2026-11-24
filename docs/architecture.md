# アーキテクチャ

[← 索引 (README)](../README.md)

## 全体の形

```
【作る時】 frontend/ ──npm run build (Vite)──▶ web/ ──go build (埋め込む)──▶ qr-server (実行ファイル 1 つ)

【使う時】 スマホ・PC のブラウザ ──HTTPS──▶ qr-server (LAN の PC)
              │  画面のファイルを受け取る (初回だけ。あとはブラウザのキャッシュ)
              └─ カメラの映像の読み取りは、ブラウザの中で行う
```

- **読み取りはブラウザの中で行う。** カメラの映像はサーバーに送らない。サーバーの仕事は、画面のファイルを配ることと API だけ
- 画面のファイル (HTML・JS・CSS・WASM) は実行ファイルの中に入っているので、動かす PC に置くのは実行ファイル (と HTTPS の証明書・鍵) だけ
- 外部のサービスやインターネットにはつながない (LAN の中だけで動く)

## サーバー (Go)

Go の標準ライブラリだけで書いている (外部の依存なし)。ファイルは 2 つ。

| ファイル | 中身 |
|---|---|
| `main.go` | 起動オプションを読み、埋め込んだ画面を取り出し、待ち受けを始める。版を決める |
| `server.go` | 要求の受け方。「API」「画面のファイル」「共通 (ヘッダ・ログ)」の 3 節 |

### 起動オプション

| オプション | 既定 | 意味 |
|---|---|---|
| `-addr` | `:8080` | 待ち受けるアドレス。`:8443` なら、この PC のすべての IP アドレスの 8443 番 |
| `-cert` | なし | HTTPS の証明書 (PEM)。`-key` と一緒に指定すると HTTPS で待つ |
| `-key` | なし | HTTPS の秘密鍵 (PEM) |

`./qr-server -h` で一覧が出る。起動すると、ほかの端末から開く URL をログに出す。止めるのは Ctrl+C (止める時に処理中の要求は待たない)。

### 要求の振り分け

| 要求 | 返すもの |
|---|---|
| `GET /api/health` | `{"status":"ok","version":"c0c2bcc"}`。動いているかと、どの版が動いているかの確認用 |
| `/api/` の下のそれ以外 | JSON の 404 (`{"error":"not found"}`) |
| それ以外 | 画面のファイル。無ければ 404 (フォルダの中身の一覧は見せない) |

- **キャッシュ:** `assets/` のファイルは名前に中身のハッシュが付く (Vite が付ける) ので、ブラウザに 1 年そのまま使わせる。`index.html` などは使う前に毎回確かめさせ、変わっていなければ 304 (中身を送らない)。そのための ETag は起動時に 1 回だけ計算する
- **安全のためのヘッダ:** 中身の種類を推測させない・ほかのサイトに埋め込ませない・読んだ URL を開いた時にこのページを伝えない・カメラはこのサイトだけ
- **ログ:** 要求ごとに 1 行 (方法・パス・状態・時間)。標準エラー出力に出す
- **版:** git が入った PC で `go build` すると、Go がコミットを記録するので、その先頭 7 桁 (コミットしていない変更があれば `-dirty`)。記録が無ければ `dev`

## 画面 (frontend)

TypeScript で書き、React などの枠組みは使わない (ブラウザの DOM を直接扱う)。1 ページ (`index.html`) の上に、設定と履歴を「シート」として重ねて出す。

### 流れ

```
カメラ (camera.ts)
  └▶ 映像の画面ごとに (scan-loop.ts) ── 前の解析が終わるまで次は読まない
       └▶ 解析する画像を作る (frame.ts) ── 読む範囲・縮小
            └▶ 読み取り (scanner/) ── 内蔵 (BarcodeDetector) と zxing を並べて走らせる
                 ├▶ 記録と表示 (history.ts → results-view.ts) ── 最後に読んだ内容・履歴・振動と音
                 └▶ 枠の追跡 (tracks.ts)
画面の描画ごとに ── 枠の描画 (overlay.ts) ── 先読みした位置に枠を描く
```

設定は 1 つのストアにまとめている:

```
settings.ts の SETTINGS (表) ─▶ SettingsStore (保存・読み込み・変化の知らせ)
                                   ├▶ settings-view.ts (設定の画面を表から作る)
                                   └▶ main.ts の store.subscribe (変わった時の動き)
```

### ファイルの役割

| ファイル | 役割 |
|---|---|
| `main.ts` | 部品を作ってつなぐ。設定が変わった時の動きもここ |
| `formats.ts` | 読む種類の表 (`FORMAT_INFO`) とプリセット (`PRESETS`) |
| `settings.ts` | 設定の表 (`SETTINGS`)・保存と読み込み・決まりごと |
| `settings-view.ts` | 設定の画面 (表から作るので、普段は触らない) |
| `camera.ts` | カメラを開く・止める・ライト・カメラの一覧 |
| `scan-loop.ts` | 読み取りの繰り返し (頻度の上限、1 秒あたりの回数) |
| `frame.ts` | 解析する画像 (読む範囲で切り出し・縮小し、座標を元に戻す) |
| `scanner/plan.ts` | どの種類を内蔵と zxing のどちらで読むか |
| `scanner/scanner.ts` | 読み取りの中心 (2 つを並べて走らせ、結果を揃える) |
| `scanner/normalize.ts` | 結果を揃える (種類の名前、UPC-A の表記、読まない種類を捨てる) |
| `scanner/zxing.worker.ts` | zxing で読む Worker (画面の処理を止めないよう、別のスレッドで動く) |
| `scanner/zxing-client.ts`・`zxing-protocol.ts` | Worker とのやりとり |
| `scanner/browser.ts` | ブラウザの部品 (BarcodeDetector・Worker) を読み取りに渡す |
| `scanner/types.ts` | 読み取りで使う型 |
| `tracks.ts` | 枠の追跡と先読み (数値は `TRACKING`) |
| `overlay.ts` | カメラの上の描画 (枠・名札・読む範囲) |
| `history.ts` / `results-view.ts` | 読んだ内容の記録 / 表示 |
| `text.ts` | 画面に出す文字 |
| `sheets.ts` / `notify.ts` | 設定・履歴のシートの開け閉め / 振動と音 |
| `geometry.ts` / `math.ts` / `dom.ts` / `elements.ts` | 座標の計算 / 数の計算 / DOM の道具 / HTML の要素の取り出し |
| `style.css` | 見た目 |
| `*.test.ts` | テスト (元のファイルの隣に置く) |

### 読み取りの仕組み

- **内蔵 (BarcodeDetector):** Android の Chrome や Mac の Chrome にある、ブラウザ内蔵の読み取り。速い
- **zxing (zxing-wasm):** 内蔵が無い環境 (iPhone の Safari・Firefox) と、内蔵が読めない種類のための予備。C++ の zxing-cpp を WASM にしたもの
- **方式「自動」(既定):** 内蔵が読める種類は内蔵で、読めない種類だけ zxing で読む。zxing は読む種類を絞るほど速いので、必要な種類だけに絞る
- **UPC-A:** UPC-A は「先頭が 0 の 13 桁の EAN-13」と同じなので、どちらで読んでも 12 桁の UPC-A に揃える
- **枠の先読み:** 結果が出るまでの遅れの分だけ、コードの動く速さから先の位置を予想して枠を描く (動かした時に枠が遅れない)

### テストしやすくするための作り

- 計算はできるだけ「同じ入力なら同じ結果」の関数 (純粋関数) にしてある。テストはこれを直接確かめる
- ブラウザの部品 (BarcodeDetector・Worker・localStorage) は外から渡す形にしてある。テストでは偽物を渡す

## ビルドで何が起きるか

`npm run build` の中身 (`frontend/package.json` の `build`):

1. `node scripts/prepare.mjs` … 配る画面に入れるライセンス文 (`third-party-licenses.txt`) を作る
2. `tsc --noEmit` … 型の確かめ (間違いがあればここで止まる)
3. `vite build` … 画面をまとめて `../web/` に出す

Vite がすること:

| すること | 理由 |
|---|---|
| TypeScript を JavaScript にする | ブラウザは TypeScript を読めない |
| 自分のコードと、ライブラリのうち使っている部分だけを 1 つにまとめる | 読み込むファイルを減らす。使っていない部分は削る |
| 小さくする (minify) | 改行や空白を除き、名前を短くする |
| ファイル名に中身のハッシュを付ける | 中身が変われば名前が変わるので、長くキャッシュさせても古いものが残らない |
| zxing の Worker と WASM を別のファイルとして出す | Worker は別のスレッドで動かすため |

できるもの (大きさは今の版):

| ファイル | 大きさ |
|---|---|
| `index.html` | 2.7 KB |
| `assets/index-*.js` (画面) | 25 KB |
| `assets/zxing.worker-*.js` | 37 KB |
| `assets/zxing_reader-*.wasm` | 947 KB |
| `assets/index-*.css` | 6.5 KB |
| `third-party-licenses.txt` | 11 KB |

ビルドの道具 (TypeScript・Vite・vitest) とテストのファイルは、配るファイルには入らない。
`go build` は `web/` の中身を実行ファイルに埋め込む (`.` や `_` で始まるファイルは除く)。

## 使っているもの

| 区分 | もの | ライセンス | 入れ方 |
|---|---|---|---|
| 読み取り (主) | BarcodeDetector | — | ブラウザ内蔵 |
| 読み取り (予備) | zxing-wasm 3.1.6 (中身は zxing-cpp) | MIT / Apache-2.0 | npm |
| 画面の言語 | TypeScript 5.9 | Apache-2.0 | npm (ビルドだけ) |
| 画面のビルド | Vite 8 | MIT | npm (ビルドだけ) |
| 画面のテスト | vitest 5 | MIT | npm (テストだけ) |
| サーバー | Go の標準ライブラリ | BSD | Go に付いてくる |

- npm のパッケージは npm 公式 (registry.npmjs.org) から入れる。版と改ざん確認用のハッシュは `frontend/package-lock.json` に記録してある (`npm ci` はハッシュが合わないと止まる)
- 配るファイルに入るライブラリは zxing-wasm だけ。そのライセンス文は画面の設定のいちばん下からリンクしている

## テスト

| 対象 | 場所 | 確かめていること |
|---|---|---|
| 画面 | `frontend/src/*.test.ts` (6 ファイル・58 件) | 読む種類の名前の対応、内蔵と zxing の振り分け、UPC-A、枠の追跡と先読み、設定の読み込みと決まりごと、履歴、画面の文字、座標の計算、Worker とのやりとり |
| サーバー | `server_test.go` | API、画面の配信 (種類・キャッシュ・304・404)、安全のためのヘッダ、起動オプション、画面が埋め込まれていること |

## 確かめたこと (2026-11-24、Mac M4 の Chrome、この Mac の Docker で)

| 項目 | 結果 |
|---|---|
| 読み取り (自動 = 内蔵 / zxing だけ) | どちらも読めた (動く QR を映した偽のカメラ) |
| 枠の先読み | 枠のずれ 26 px → 11 px |
| 設定の画面 | 表から作られ、変えると保存された。前面カメラにすると左右反転も付いた |
| 履歴・1 つ読んだら止める・停止・スマホの幅 | 動いた |
| サーバー | `/api/health`、304、`.wasm` の種類、404、HTTPS |
| 3 つの OS 向けのビルド | Linux (amd64)・Windows (amd64 の exe)・Mac (arm64) の実行ファイルができた |

まだ確かめていないこと: Windows・Linux の実機での起動とファイアウォール、本物のスマホとカメラ。
