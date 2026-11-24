#!/bin/bash
# 画面 (frontend/) をビルドして web/ に出し、web/ を埋め込んだ Go の実行ファイルを作る。どちらも上限つきのコンテナの中で動かす。
#   bin/build.sh          この Mac の Docker 用 (arm64)
#   bin/build.sh amd64    デプロイ先用 (Cloud Run などは amd64)
# 出力: web/ (ブラウザに配るファイル) と build/linux-<CPU>/qr-server (これ 1 つで動く)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=bin/env.sh
source "$ROOT/bin/env.sh"
ARCH="${1:-$(host_arch)}"
remove_dot_underscore

# 画面の依存 (package.json か package-lock.json が変わった時だけ入れ直す)
MARK="$ROOT/frontend/.installed"
if [ ! -f "$MARK" ] || [ "$ROOT/frontend/package.json" -nt "$MARK" ] || [ "$ROOT/frontend/package-lock.json" -nt "$MARK" ]; then
  APP_MEM=1g APP_CPUS=2 "$ROOT/bin/run.sh" "${NODE_RUN[@]}" -- npm ci --no-audit --no-fund 2>&1 | tail -3
  touch "$MARK"
fi

# 画面: frontend/ → web/
APP_MEM="${BUILD_MEM:-512m}" APP_CPUS=2 "$ROOT/bin/run.sh" "${NODE_RUN[@]}" -- npm run build 2>&1 | grep -v '^$' | tail -8

# サーバー: web/ を埋め込んだ実行ファイル。版 (git のコミット) は /api/health で返す
VERSION=$(git -C "$ROOT" describe --always --dirty 2>/dev/null || echo dev)
OUT="build/linux-$ARCH/$APP"
APP_MEM="${GO_MEM:-768m}" APP_CPUS=2 "$ROOT/bin/run.sh" "${GO_RUN[@]}" --env GOOS=linux --env GOARCH="$ARCH" -- \
  go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$OUT" .
echo "[$APP] できた: $OUT ($(wc -c < "$ROOT/$OUT" | awk '{printf "%.1f MB", $1/1e6}'), 版 $VERSION)"
