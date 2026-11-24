# qr-server — QR・バーコードリーダー (Go のサーバー版)

ブラウザで動く QR・バーコードリーダーの画面と API を、**実行ファイル 1 つ**で配るサーバー。
画面のファイルは実行ファイルに埋め込んであり、HTTPS の証明書も初回の起動で自動で作るので、LAN の PC に実行ファイルを置いて起動すれば、
同じネットワークのスマホや PC のブラウザから使える。Linux・Windows・Mac のどれでも同じ手順で作れる (Docker は要らない)。

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
HTTPS の証明書は初回の起動で自動で作るので、初回だけブラウザが警告を出す (「詳細」などから進む)。
同じネットワークのスマホからは、起動した時にログに出る URL (`https://<この PC の IP>:8443/`) で開く。
警告の理由・ファイアウォール・IP アドレスは [環境と HTTPS](docs/environment.md)。

## 文書

| 知りたいこと | 文書 |
|---|---|
| どう動いているか (構成・仕組み・ファイルの役割・使っているもの) | [アーキテクチャ](docs/architecture.md) |
| 機能を足してデプロイするまで (編集する所・コマンドとその意味・例) | [パイプライン](docs/pipeline.md) |
| OS ごとの注意・WSL・ファイアウォール・IP アドレス・HTTPS の証明書と警告 | [環境と HTTPS](docs/environment.md) |

## どこを直すか (早見表)

| やりたいこと | 直す所 |
|---|---|
| 読む種類を足す・外す・名前を変える | `frontend/src/formats.ts` の `FORMAT_INFO` (1 種類 1 行) |
| 読む種類の組み合わせ (プリセット) | `frontend/src/formats.ts` の `PRESETS` |
| 設定を足す・選択肢や既定値を変える (速さの調整も) | `frontend/src/settings.ts` の `SETTINGS` (1 設定 1 項目。画面・保存は自動) |
| 設定が変わった時の動き | `frontend/src/main.ts` の `store.subscribe` |
| 画面に出る文字 | `frontend/src/text.ts` |
| 見た目 (CSS) | `frontend/src/style.css` |
| API を足す | `server.go` の `newHandler` と「API」の節 |
| 起動オプションを足す | `main.go` の `main` |

手順の例は [パイプライン](docs/pipeline.md) の「例」。

## 構成

```
qr-server/
├─ main.go          起動 (起動オプション・画面の埋め込み・版)
├─ server.go        要求の受け方 (API・画面の配信・安全のためのヘッダ・ログ)
├─ cert.go          HTTPS の証明書 (初回の起動で自動で作り、次からは使い回す)
├─ *_test.go        テスト
├─ go.mod           外部の依存なし (標準ライブラリだけ)
├─ frontend/        画面のソース (Vite + TypeScript)。npm run build で ../web/ に出る
├─ web/             ブラウザに配るファイル (ビルドで作る。git に入れない)
├─ docs/            文書
├─ bin/・Dockerfile  この Mac 専用 (Docker で動かす決まりがあるため。ほかの PC では使わない)
└─ README.md        この索引
```

## 今の状態 (2026-11-24)

- 確かめたこと: この Mac で、偽のカメラによる読み取り・設定・履歴、HTTPS (証明書を初回に作り、2 回目の起動で使い回す)、3 つの OS 向けの実行ファイルができること
- まだ確かめていないこと: Windows・Linux の実機での起動とファイアウォール、本物のスマホとカメラ
- 詳しくは [アーキテクチャ](docs/architecture.md) の「確かめたこと」
