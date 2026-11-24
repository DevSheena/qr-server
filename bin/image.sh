#!/bin/bash
# 本番用の Docker イメージを作る (中身は bin/build.sh で作った実行ファイル 1 つだけ)。
#   bin/image.sh          この Mac で動かす用 (arm64)。タグ qr-server:dev
#   bin/image.sh amd64    デプロイ先用。タグ qr-server:<版>-amd64
# Dockerfile はコピーだけで、重い処理 (ビルド) は bin/build.sh が上限つきのコンテナで済ませる (規約 R1)。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=bin/env.sh
source "$ROOT/bin/env.sh"
ARCH="${1:-$(host_arch)}"

"$ROOT/bin/build.sh" "$ARCH"
remove_dot_underscore
if [ "$ARCH" = "$(host_arch)" ]; then
  TAG="$APP:dev"
else
  TAG="$APP:$(git -C "$ROOT" describe --always --dirty 2>/dev/null || echo dev)-$ARCH"
fi
docker build --quiet --platform "linux/$ARCH" -t "$TAG" "$ROOT" >/dev/null
echo "[$APP] イメージ: $TAG ($(docker image inspect "$TAG" --format '{{.Size}}' | awk '{printf "%.1f MB", $1/1e6}'))"
