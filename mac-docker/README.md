# mac-docker (この Mac 専用)

[← 索引 (README)](../README.md)

このリポジトリを置いている Mac には、「重い処理は、メモリと CPU の上限を付けた Docker のコンテナの中で動かす」という決まりがある
(グローバル規約 R1/R2。複数のプロジェクトが同じ Mac を使うため)。そのための手順がこのフォルダ。
**ほかの PC では使わない。** そちらは README の通り、npm と go を直接使う。中でしていることは同じ。

```bash
mac-docker/dev.sh serve          # ビルドして配信 (Mac: http://localhost:5187/ 、スマホ: https://<Mac の IP>:5188/)
mac-docker/dev.sh test           # テスト (画面: 型の確かめ + vitest、Go: vet + test)
mac-docker/dev.sh build [CPU]    # ビルドだけ (build/linux-<CPU>/qr-server。CPU は arm64 か amd64)
mac-docker/dev.sh stop           # このアプリのコンテナだけを止める
LAN=0 mac-docker/dev.sh serve    # スマホ用の配信を立てない
```

| ファイル | 中身 |
|---|---|
| `dev.sh` | 上のコマンド。使うイメージとポートもここ |
| `run.sh` | コンテナを上限つきで起動する唯一の入口。走行中の全コンテナの割当を合算し、予算を超えるなら起動しない |
| `lib_budget.sh` | 予算の判定と、全プロジェクト共通の鍵 (`/tmp/docker_budget.lock`)。ほかのプロジェクトと同じ形にしておくこと |

- 配信は、本番と同じく `build/linux-arm64/` に置いた実行ファイルを、そのフォルダで起動する (証明書もそこに自動で作る)
- コンテナの中から見た IP アドレスで証明書を作るので、スマホでは名前が合わないという警告も出る (この Mac で試す時だけ。進めば使える)
- 画面の依存 (`node_modules`) と Go のキャッシュは、Docker の名前付きボリューム (`qrserver_*`) に置く (exFAT はシンボリックリンクを作れないため)

## コンテナの上限 (実測、2026-11-24、Mac M4)

| 作業 | メモリのピーク | 上限 |
|---|---|---|
| 画面の依存のインストール (`npm ci`) | 548 MiB | 1 GiB |
| 画面のビルド・テスト | 205〜253 MiB | 512 MiB |
| Go のビルド・テスト (キャッシュなし) | 393 MiB | 768 MiB |
| 配信 (サーバー 1 つ) | 6〜8 MiB | 64 MiB・CPU 0.5 |
