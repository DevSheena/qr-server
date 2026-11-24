# qr-server — QR・バーコードリーダー (Go のサーバー版)

ブラウザで動く QR・バーコードリーダーの画面と API を、**実行ファイル 1 つ**で配るサーバー。
画面のファイルは実行ファイルに埋め込んであり、HTTPS の証明書も初回の起動で自動で作るので、
LAN の PC に実行ファイルを置いて起動すれば、同じネットワークのスマホや PC のブラウザから使える。
Linux・Windows・Mac のどれでも、Node.js と Go だけで作れる (Docker は要らない)。

## すぐ試す

Node.js (22.12 以上) と Go (1.22 以上) を入れた PC で:

```bash
cd frontend
npm ci
npm run build
cd ..
go build
./qr-server
```

ブラウザで https://localhost:8443/ を開く (Windows の PowerShell では最後を `.\qr-server.exe`)。
初回だけブラウザが証明書の警告を出すので、「詳細」などから進む。
同じネットワークのスマホからは、起動した時にログに出る URL (`https://<この PC の IP>:8443/`) で開く。

## 文書

| 知りたいこと | 文書 |
|---|---|
| どう動いているか (全体の形・ファイルの役割・サーバーと画面の仕組み・使っているもの・変えない方がよい作り) | [アーキテクチャ](docs/architecture.md) |
| 機能を足す・直す (準備・くり返しの手順・コマンドの意味・例・テスト) | [機能を足す](docs/extending.md) |
| LAN の PC に置いて動かす (初回と更新・OS ごとの注意・ファイアウォール・IP アドレス・HTTPS の証明書と警告) | [デプロイ](docs/deploy.md) |
| この Mac で動かす (Docker を使う決まりがある Mac だけ) | [mac-docker](mac-docker/README.md) |

## どこを直すか (早見表)

| やりたいこと | 直す所 |
|---|---|
| 読む種類を足す・外す・名前を変える | `frontend/src/formats.ts` の `FORMAT_INFO` (1 種類 1 行) |
| 読む種類の組み合わせ (プリセット) | `frontend/src/formats.ts` の `PRESETS` |
| 設定を足す・選択肢や既定値を変える (速さの調整も) | `frontend/src/settings.ts` の `SETTINGS` (1 設定 1 項目。画面・保存は自動) |
| ある設定を変えた時に、ほかの設定も合わせて変える | `frontend/src/settings.ts` の `RULES` |
| 設定が変わった時の動き (カメラを開き直すなど) | `frontend/src/main.ts` の `store.subscribe` |
| zxing の細かい読み取りの指定 | `frontend/src/scanner/scanner.ts` の `zxingOptions` |
| 画面に出る文字 | `frontend/src/text.ts` (初めに出るボタンの名前は `index.html`、設定の項目は `settings.ts`) |
| 見た目 | `frontend/src/style.css` |
| 設定・履歴のようなシートを足す | `frontend/index.html` だけ |
| API を足す | `server.go` の `newHandler` と「API」の節 |

手順と例は [機能を足す](docs/extending.md)。

## 構成

```
qr-server/
├─ main.go・server.go・cert.go   サーバー (Go。標準ライブラリだけ)。テストは *_test.go
├─ go.mod
├─ frontend/       画面 (Vite + TypeScript)。npm run build で ../web/ に出る
├─ docs/           文書
├─ mac-docker/     この Mac 専用の手順 (ほかの PC では使わない)
└─ README.md       この索引
   (ビルドや起動でできるもの: web/・frontend/node_modules/・build/・qr-server(.exe)・qr-server.crt・qr-server.key。git に入れない)
```

ファイルごとの役割は [アーキテクチャ](docs/architecture.md) の「ファイルの役割」。

## 今の状態

- 確かめたこと: この Mac で、偽のカメラによる読み取り・設定・履歴・シート、カメラの開き直しの重なり、HTTPS と証明書の自動作成、3 つの OS 向けのビルド
- まだ確かめていないこと: Windows・Linux の実機での起動とファイアウォール、本物のスマホとカメラ、端末に証明書を「信頼する」と登録する手順
- git: この PC の中だけ (リモートのリポジトリには送っていない)
