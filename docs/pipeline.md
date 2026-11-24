# パイプライン (機能を足してデプロイするまで)

[← 索引 (README)](../README.md)

## 必要なもの (開発する PC)

| もの | 版 | 使い道 |
|---|---|---|
| Node.js | 22.12 以上の 22、または 24 以上 (偶数の版) | 画面のビルドとテスト |
| Go | 1.22 以上 | サーバーのビルドとテスト |
| git | — | 変更の記録。あれば、どのコミットから作ったかが実行ファイルに入る |

インターネットを使うのは `npm ci` (画面の依存を入れる) だけ。動かす PC (LAN) には何も入れなくてよい (実行ファイルだけ)。
OS ごとの注意は [環境と HTTPS](environment.md)。

## 1 回の流れ

```
直す → テスト → ビルド → 手元で動かす → git に記録 → 動かす PC 用に作る → 置いて起動 → 版を確かめる
```

```bash
# 0. 初回と、frontend/package-lock.json が変わった時だけ
cd frontend
npm ci

# 1. テスト (画面)
npm test
npx tsc --noEmit

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

そのあと「デプロイ」の節の通りに、動かす PC 用に作って置く。

## コマンドの意味

| コマンド | 意味 |
|---|---|
| `npm ci` | `package-lock.json` に書いた通りの版で、依存を `node_modules/` に入れる。lock を書き換えないので、どの PC でも同じものが入る |
| `npm install <名前>` | 依存を足す・版を上げる時だけ使う (`package.json` と `package-lock.json` が書き換わる) |
| `npm run build` | `package.json` の `build` を実行する: ライセンス文を作る → 型の確かめ → Vite でまとめて `../web/` に出す |
| `npm test` | 画面のテスト (vitest)。`*.test.ts` を全部流す |
| `npx tsc --noEmit` | 型の確かめだけ (ファイルは作らない)。`npx` は、`node_modules/` に入れた道具を実行するコマンド |
| `go build` | `web/` を埋め込んで実行ファイルを作る (`qr-server`、Windows は `qr-server.exe`) |
| `go test ./...` | このフォルダ以下の Go のテストを全部流す |
| `go vet ./...` | 間違いやすい書き方を探す (任意) |
| `go run .` | その場でコンパイルして 1 回だけ実行する (実行ファイルは残らない。証明書も一時フォルダに作られて残らないので、ふだんは `go build` を使う) |
| `./qr-server` | サーバーを起動する (HTTPS の :8443)。動いている間だけサーバーになり、Ctrl+C で止まる。初回は隣に証明書を作る |

**Vite は要るのか:** 作る時だけ要る (動かす PC には要らない)。TypeScript を JavaScript にし、zxing の Worker と WASM を含めてまとめ、小さくし、ファイル名にハッシュを付ける。詳しくは [アーキテクチャ](architecture.md) の「ビルドで何が起きるか」。

## 例

### 読む種類を足す・外す

`frontend/src/formats.ts` の `FORMAT_INFO` に 1 行足す (外す時は消す)。キーはブラウザ内蔵の読み取り (BarcodeDetector) の名前、`zxing` は zxing-wasm の名前。

```ts
export const FORMAT_INFO = {
  qr_code: { label: 'QR', zxing: 'QRCode' },
  // ...
  aztec: { label: 'Aztec', zxing: 'Aztec' },
} as const;
```

設定の画面のチェックボックスにも、自動で出る。よく使う組み合わせは `PRESETS` に足す。

### 設定の選択肢や既定値を変える

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

### 設定を足す

例: 「枠を出さない」を足す。

1. `frontend/src/settings.ts` の `SETTINGS` に 1 行足す (同じ見出しのチェックは 1 行にまとまる)

   ```ts
   hideBoxes: check('表示・動作', '枠を出さない', false),
   ```

2. 値を使う所に書く。設定の値は `store.value.<名前>` で読める (型も付く)。ここでは `frontend/src/main.ts` の `drawOverlay` で、描く枠を空にする

   ```ts
   overlay.draw({ video: size, mirror: s.mirror, roi: ..., boxes: s.hideBoxes ? [] : boxes });
   ```

3. 変わった瞬間に何かする必要がある時だけ、`main.ts` の `store.subscribe` に 1 行足す (例: カメラを開き直す)

### API を足す

1. `server.go` の `newHandler` の「API」の所に 1 行足し、ハンドラを「API」の節に書く

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

### 画面を増やす

| 増やし方 | すること |
|---|---|
| 今のページに、重ねて出す画面 (設定・履歴のような「シート」) を足す | `index.html` に `<aside id="..." class="sheet" hidden>` を足す → `elements.ts` に要素を足す → `main.ts` の `new Sheets({...})` に登録する |
| 別のページを足す (例: 管理画面) | 下の 3 つ |

別のページを足す (例: `/admin.html`):

1. `frontend/admin.html` を作る (中で `<script type="module" src="/src/admin.ts"></script>` を読む)
2. `frontend/src/admin.ts` を作る
3. `frontend/vite.config.ts` の `build` に、ページを並べる (frontend から見た場所)

   ```ts
   build: { target: 'es2022', outDir: '../web', emptyOutDir: true, rolldownOptions: { input: ['index.html', 'admin.html'] } },
   ```

Go の側は何も変えなくてよい (`web/` を丸ごと埋め込むので、`/admin.html` で開ける)。

### CSS を増やす

- 今のページの見た目: `frontend/src/style.css` に足す
- ページごとに分ける: `frontend/src/admin.css` を作り、そのページの TS の先頭で `import './admin.css';` と書く。Vite がまとめて小さくし、ファイル名にハッシュを付ける

## デプロイ (LAN の PC に置く)

### 1. 動かす PC 用に作る

開発する PC と同じ OS なら、`go build` だけでよい。違う OS 用は GOOS・GOARCH を付ける。

```bash
# Linux / Mac / WSL で
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o qr-server-linux
```

```powershell
# Windows の PowerShell で (終わったら Remove-Item Env:GOOS, Env:GOARCH, Env:CGO_ENABLED)
$env:CGO_ENABLED="0"; $env:GOOS="linux"; $env:GOARCH="amd64"; go build -o qr-server-linux
```

| 動かす PC | GOOS | GOARCH | できるファイルの名前の例 |
|---|---|---|---|
| Linux (Intel・AMD) | `linux` | `amd64` | `qr-server-linux` |
| Windows (Intel・AMD) | `windows` | `amd64` | `qr-server.exe` |
| Mac (M シリーズ) | `darwin` | `arm64` | `qr-server-mac` |

**Linux 用は `CGO_ENABLED=0` を付ける。** 付けないと、作った PC の C のライブラリ (glibc) に頼る実行ファイルになり、別の Linux では動かないことがある。

### 2. 置いて起動する

1. 実行ファイルを、USB や scp で動かす PC の、書き込めるフォルダにコピーする
2. 前の版が動いていれば Ctrl+C で止め、実行ファイルだけを置き換える (隣の `qr-server.crt`・`qr-server.key` は残す。消すと証明書が変わり、すべての端末でまた警告が出る)
3. 起動する

   ```bash
   ./qr-server-linux
   ```

   初回は、同じフォルダに証明書 (`qr-server.crt`・`qr-server.key`) ができる。ログに出る「開く URL」を控える
4. 別の端末で `https://<動かす PC の IP>:8443/api/health` を開き、`version` が記録したコミットと同じか確かめる (初回は警告を越える)

PC を起動した時に自動で立ち上げる設定 (Linux の systemd、Windows のタスク スケジューラ など) は、まだ用意していない。

## うまくいかない時

| 症状 | 原因と対処 |
|---|---|
| `go build` が `pattern web: no matching files found` で止まる | 画面をまだビルドしていない。`frontend` で `npm run build` |
| `npm ci` が lock と合わないと言って止まる | `package.json` だけ書き換えた。`npm install` で lock も直す |
| 起動すると `address already in use` (Windows では `Only one usage of each socket address`) | そのポートを別のプログラムが使っている。`-addr :8081` などに変える |
| スマホでカメラが始まらない | HTTP で開いている (`-http` を付けて起動した)。HTTPS で開く ([環境と HTTPS](environment.md)) |
| 起動すると「秘密鍵を保存できない」で止まる | 実行ファイルのフォルダに書き込めない。書き込めるフォルダに置く |
| ログに「証明書に、この PC の今の IP アドレスが入っていない」 | IP アドレスが変わった。`qr-server.crt`・`qr-server.key` を消して起動し直す (端末ではもう一度警告が出る) |
| ほかの端末から開けない | ファイアウォールか IP アドレスの間違い ([環境と HTTPS](environment.md)) |
| 画面を直したのに変わらない | `npm run build` と `go build` をやり直し、サーバーを起動し直す |
