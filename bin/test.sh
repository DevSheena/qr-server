#!/bin/bash
# テストを全部流す: 画面 (型の確かめ + vitest) と Go (vet + test)。どちらも上限つきのコンテナの中で動かす。
# Go の main パッケージは web/ を埋め込むので、web/ が無ければ先に画面をビルドする。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=bin/env.sh
source "$ROOT/bin/env.sh"
remove_dot_underscore

echo "[$APP] 画面のテスト"
APP_MEM="${NODE_TEST_MEM:-512m}" APP_CPUS=2 "$ROOT/bin/run.sh" "${NODE_RUN[@]}" -- sh -c 'npx tsc --noEmit && npx vitest run' 2>&1 | grep -v '^$' | tail -20

if [ ! -f "$ROOT/web/index.html" ]; then
  APP_MEM=512m APP_CPUS=2 "$ROOT/bin/run.sh" "${NODE_RUN[@]}" -- npm run build 2>&1 | tail -3
fi
echo "[$APP] Go のテスト"
APP_MEM="${GO_TEST_MEM:-768m}" APP_CPUS=2 "$ROOT/bin/run.sh" "${GO_RUN[@]}" -- sh -c 'go vet ./... && go test ./...'
