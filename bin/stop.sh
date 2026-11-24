#!/bin/bash
# このアプリのコンテナ (ラベル <アプリ>=1) だけを止める。他のプロジェクトのコンテナには触らない (R5)。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=bin/env.sh
source "$ROOT/bin/env.sh"
ids=$(docker ps -q --filter "label=$VOL=1")
if [ -z "$ids" ]; then echo "[$APP] 動いているコンテナは無い"; exit 0; fi
docker ps --filter "label=$VOL=1" --format "[$APP] 止める: {{.Names}} {{.Status}}"
# shellcheck disable=SC2086
docker stop $ids >/dev/null
echo "[$APP] 停止した。ほかに走っているコンテナ:"
docker ps --format '  {{.Names}} ({{.Image}}) {{.Status}}'
