# 機能を足す・直す

[← 索引 (README)](../README.md)

## 準備 (開発する PC)

| もの | 版 | 使い道 |
|---|---|---|
| Node.js | 22.12 以上の 22、または 24 以上 (偶数の版) | 画面のビルドとテスト |
| Go | 1.22 以上 | サーバーのビルドとテスト |
| git | — | 変更の記録。あれば、どのコミットから作ったかが実行ファイルに入る |

インターネットを使うのは `npm ci` (画面の依存を入れる) だけ。OS ごとの注意は [デプロイ](deploy.md) の「OS ごとの注意」。
この Mac (Docker を使う決まりがある Mac) では、同じことを `mac-docker/dev.sh` で行う ([mac-docker](../mac-docker/README.md))。

## くり返しの手順

```bash
# 0. 初回と、frontend/package-lock.json が変わった時だけ
cd frontend
npm ci

# 1. テスト (画面)
npm run typecheck
npm test

# 2. 画面のビルド (frontend/ → ../web/)
npm run build
cd ..

# 3. テスト (サーバー。web/ が要るので画面のビルドの後)
go test ./...

# 4. 実行ファイルを作って、手元で動かす (https://localhost:8443/ を開く。初回だけブラウザが警告する。Ctrl+C で止める)
go build
./qr-server

# 5. 記録する
git add -A
git commit -m "何を変えたか"
```

LAN の PC に置くのは [デプロイ](deploy.md)。

## コマンドの意味

| コマンド | 意味 |
|---|---|
| `npm ci` | `package-lock.json` に書いた通りの版で、依存を `node_modules/` に入れる。lock を書き換えないので、どの PC でも同じものが入る |
| `npm install <名前>` | 依存を足す・版を上げる時だけ使う (`package.json` と `package-lock.json` が書き換わる) |
| `npm run typecheck` | 型の確かめだけ (ファイルは作らない) |
| `npm test` | 画面のテスト (vitest)。`*.test.ts` を全部流す |
| `npm run build` | 型の確かめのあと、Vite でまとめて `../web/` に出す |
| `go build` | `web/` を埋め込んで実行ファイルを作る (`qr-server`、Windows は `qr-server.exe`) |
| `go test ./...` | Go のテストを全部流す |
| `go vet ./...` | 間違いやすい書き方を探す (任意) |
| `go run .` | その場でコンパイルして 1 回だけ実行する (実行ファイルは残らない。証明書も一時フォルダに作られて毎回変わるので、ふだんは `go build` を使う) |

**Vite は要るのか:** 作る時だけ要る (動かす PC には要らない)。TypeScript を JavaScript にし、zxing の Worker と WASM を含めてまとめ、小さくし、ファイル名にハッシュを付ける ([アーキテクチャ](architecture.md) の「ビルドで何が起きるか」)。

## 例

### 読む種類を足す・外す

`frontend/src/formats.ts` の `FORMAT_INFO` に 1 行足す (外す時は消す)。表の順が、設定の画面に並ぶ順になる。

```ts
export const FORMAT_INFO = {
  qr_code: { label: 'QR', zxing: 'QRCode' },
  // ...
  aztec: { label: 'Aztec', zxing: 'Aztec' },
} as const;
```

- キーは BarcodeDetector (ブラウザ内蔵) の名前、`zxing` は zxing-wasm の名前。この 2 つは、記号を除いて小文字にすると同じになる (例: `qr_code` と `QRCode` はどちらも `qrcode`)。読んだ結果の種類はこの決まりで見分ける (テストで確かめている)
- 設定の画面のチェックボックスにも、自動で出る。よく使う組み合わせは `PRESETS` に足す

### 設定の選択肢・既定値・説明を変える (速さの調整も)

`frontend/src/settings.ts` の `SETTINGS` を直す。例: 「読む範囲」に「中央 50%」を足す。

```ts
roi: select<number>(
  '読む範囲',
  1, // 既定値
  [
    [1, '全体'],
    [0.8, '中央 80%'],
    [0.6, '中央 60%'],
    [0.5, '中央 50%'], // ← 足した行 ([値, 表示])
    [0.4, '中央 40%'],
  ],
  { note: '絞ると zxing は約 3 倍速い。黄色の枠の中にコードをかざす' },
),
```

画面・保存・読み込みは自動で付いてくる (保存した値が選択肢に無くなった時は既定に戻る)。
設定の画面に出ない細かい値は、zxing の指定が `scanner/scanner.ts` の `zxingOptions`、枠の先読みが `tracks.ts` の `TRACKING`。

### 設定を足す

例: 「枠を出さない」を足す。

1. `frontend/src/settings.ts` の `SETTINGS` に 1 行足す (同じ見出しのチェックは 1 行にまとまる。説明はチェックの下に出る)

   ```ts
   hideBoxes: check('表示・動作', '枠を出さない', false),
   ```

2. 値を使う所に書く。設定の値は `store.value.<名前>` で読める (型も付く)。ここでは `frontend/src/main.ts` の `drawOverlay` で、描く枠を空にする

   ```ts
   overlay.draw({ video: size, mirror: s.mirror, roi: ..., boxes: s.hideBoxes ? [] : boxes });
   ```

3. 変わった瞬間に何かする必要がある時だけ、`main.ts` の `store.subscribe` に 1 行足す (例: カメラを開き直す)

### ある設定を変えた時に、ほかの設定も合わせて変える

`frontend/src/settings.ts` の `RULES` に 1 行足す。変える内容 (patch) を受け取り、合わせて変える内容を返す。
今ある決まりは「前面カメラを選んだら左右反転にする」。設定の画面の部品は、変えた設定だけを渡せばよい (決まりは必ず通る)。

```ts
const RULES: readonly Rule[] = [
  ({ camera, mirror }) => ((camera === 'user' || camera === 'environment') && mirror === undefined ? { mirror: camera === 'user' } : {}),
  // 例: 解像度を 1920×1080 にしたら、縮小を 1/2 にする
  ({ res, scale }) => (res === '1920x1080' && scale === undefined ? { scale: 0.5 } : {}),
];
```

### 画面に出る文字を変える

| 文字 | 場所 |
|---|---|
| お知らせ・ボタンが書き換わる時の名前・説明 | `frontend/src/text.ts` (`MSG`・`LABEL` など) |
| 初めに出るボタンの名前・見出し | `frontend/index.html` |
| 設定の項目の名前・選択肢・説明 | `frontend/src/settings.ts` の `SETTINGS` |
| 読む種類の名前・プリセットの名前 | `frontend/src/formats.ts` |

### API を足す

1. `server.go` の `newHandler` の「API」の所に 1 行足し、ハンドラを「API」の節に書く (API が増えてファイルが長くなったら、「API」の節を `api.go` に移す)

   ```go
   mux.HandleFunc("GET /api/time", serverTime)
   ```

   ```go
   // serverTime はサーバーの時刻を返す
   func serverTime(w http.ResponseWriter, _ *http.Request) {
   	writeJSON(w, http.StatusOK, map[string]string{"time": time.Now().Format(time.RFC3339)})
   }
   ```

2. `server_test.go` にテストを足す

   ```go
   func TestServerTime(t *testing.T) {
   	if rec := get(newTestServer(t), "/api/time", nil); rec.Code != http.StatusOK {
   		t.Errorf("status = %d", rec.Code)
   	}
   }
   ```

3. 画面から呼ぶ (同じサーバーから出ているので、URL は `/api/...` だけでよい)

   ```ts
   const { time } = await (await fetch('/api/time')).json();
   ```

### 設定・履歴のような「シート」を足す

`frontend/index.html` だけを直す (つなぎは `sheets.ts` が HTML から組み立てる)。

```html
<!-- 操作ボタンに足す: aria-controls にシートの id -->
<button class="tool" aria-expanded="false" aria-controls="helpSheet">ヘルプ</button>

<!-- シートを足す: class="sheet" と hidden。閉じるボタンに data-close -->
<aside id="helpSheet" class="sheet" hidden aria-label="ヘルプ">
  <header>
    <h2>ヘルプ</h2>
    <button class="tool close" data-close>閉じる</button>
  </header>
  <div class="sheet-body">...</div>
</aside>
```

中身をコードで作る時は、`frontend/src/elements.ts` に要素を足して `main.ts` から書き込む。

### 別のページを足す (例: `/admin.html`)

1. `frontend/admin.html` を作る (中で `<script type="module" src="/src/admin.ts"></script>` を読む)
2. `frontend/src/admin.ts` を作る
3. `frontend/vite.config.ts` の `build` に、ページを並べる (frontend から見た場所)

   ```ts
   build: { target: 'es2022', outDir: '../web', emptyOutDir: true, rolldownOptions: { input: ['index.html', 'admin.html'] } },
   ```

Go の側は何も変えなくてよい (`web/` を丸ごと埋め込むので、`/admin.html` で開ける)。

### CSS を足す

- 今のページの見た目: `frontend/src/style.css` に足す (場所ごとに節を分けてある)
- ページごとに分ける: `frontend/src/admin.css` を作り、そのページの TS の先頭で `import './admin.css';` と書く。Vite がまとめて小さくし、ファイル名にハッシュを付ける

## テストを書く

- 画面: 元のファイルの隣に、同じ名前の `*.test.ts` を置く (例: `history.ts` → `history.test.ts`)。計算は純粋関数にしてテストし、ブラウザの部品が要る所は偽物を渡す (例: `camera.test.ts`・`scanner/scanner.test.ts`)
- サーバー: `*_test.go`。画面のファイルは `fstest.MapFS` で渡す (`server_test.go` の `newTestServer`)

## うまくいかない時 (開発)

| 症状 | 原因と対処 |
|---|---|
| `go build` が `pattern web: no matching files found` で止まる | 画面をまだビルドしていない。`frontend` で `npm run build` |
| `npm ci` が lock と合わないと言って止まる | `package.json` だけ書き換えた。`npm install` で lock も直す |
| `npm ci` が Node の版で警告する | Node が古い。22.12 以上の 22、または 24 以上にする |
| 画面を直したのに変わらない | `npm run build` と `go build` をやり直し、サーバーを起動し直す |
| 設定を足したのに画面に出ない | `SETTINGS` の表に足したか。読む種類のように表の外の設定は、`settings-view.ts` に行を足す |
