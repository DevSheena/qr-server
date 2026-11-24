#!/bin/bash
# この Mac 専用: ビルド・テスト・配信を、上限つきの Docker コンテナの中で動かす (グローバル規約 R1/R2)。
# ほかの PC では使わない (README の通り、npm と go を直接使う)。中でしていることは README の手順と同じ。
#
#   mac-docker/dev.sh serve          ビルドして配信 (Mac: http://localhost:5187/ 、スマホ: https://<Mac の IP>:5188/)
#   mac-docker/dev.sh test           テスト (画面: 型の確かめ + vitest、Go: vet + test)
#   mac-docker/dev.sh build [CPU]    ビルドだけ (build/linux-<CPU>/qr-server。CPU は arm64 か amd64、既定はこの Mac)
#   mac-docker/dev.sh stop           このアプリのコンテナだけを止める
#   LAN=0 mac-docker/dev.sh serve    スマホ用の配信を立てない
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
APP=$(basename "$ROOT")
VOL=$(echo "$APP" | tr -d '-')
RUN="$HERE/run.sh"

NODE_IMAGE=node:24.21.0-bookworm-slim
GO_IMAGE=golang:1.27.4-alpine
LOCAL_PORT=5187 # この Mac 用 (HTTP)
LAN_PORT=5188   # スマホ用 (HTTPS)

# 画面 (frontend/) を動かすコンテナ。exFAT はシンボリックリンクを作れないので、node_modules は名前付きボリュームに置く
NODE=(--image "$NODE_IMAGE" --workdir /app/frontend --volume "$ROOT:/app"
      --volume "${VOL}_node_modules:/app/frontend/node_modules" --volume "${VOL}_npm_cache:/root/.npm")
# Go を動かすコンテナ。イメージに git が無いので版は -ldflags で入れる (GOFLAGS=-buildvcs=false)
GO=(--image "$GO_IMAGE" --workdir /app --volume "$ROOT:/app"
    --volume "${VOL}_gomod:/go/pkg/mod" --volume "${VOL}_gocache:/root/.cache/go-build"
    --env GOFLAGS=-buildvcs=false --env GOTOOLCHAIN=local --env CGO_ENABLED=0)

host_arch() { case "$(uname -m)" in arm64 | aarch64) echo arm64 ;; *) echo amd64 ;; esac; }

# macOS が exFAT に作る ._ ファイルは、ビルドやテストに混ざると壊すので消す (依存と git の中は触らない)
clean() { find "$ROOT" -name '._*' -not -path '*/node_modules/*' -not -path '*/.git/*' -delete 2>/dev/null || true; }

# 画面の依存 (package.json か package-lock.json が変わった時だけ入れ直す)。上限は実測 (README)
deps() {
  local mark="$ROOT/frontend/.installed"
  if [ ! -f "$mark" ] || [ "$ROOT/frontend/package.json" -nt "$mark" ] || [ "$ROOT/frontend/package-lock.json" -nt "$mark" ]; then
    APP_MEM=1g APP_CPUS=2 "$RUN" "${NODE[@]}" -- npm ci --no-audit --no-fund 2>&1 | tail -3
    touch "$mark"
  fi
}

build_web() { APP_MEM=512m APP_CPUS=2 "$RUN" "${NODE[@]}" -- npm run build 2>&1 | grep -v '^$' | tail -8; }

build_go() { # <CPU>
  local version out="build/linux-$1/$APP"
  version=$(git -C "$ROOT" describe --always --dirty 2>/dev/null || echo dev)
  APP_MEM=768m APP_CPUS=2 "$RUN" "${GO[@]}" --env GOOS=linux --env GOARCH="$1" -- \
    go build -trimpath -ldflags "-s -w -X main.version=$version" -o "$out" .
  echo "[$APP] できた: $out (版 $version)"
}

cmd_build() { clean; deps; build_web; build_go "${1:-$(host_arch)}"; }

cmd_test() {
  clean
  deps
  APP_MEM=512m APP_CPUS=2 "$RUN" "${NODE[@]}" -- sh -c 'npm run typecheck && npm test' 2>&1 | grep -v '^$' | tail -6
  [ -f "$ROOT/web/index.html" ] || build_web # Go の main は web/ を埋め込むので、無ければ先に作る
  APP_MEM=768m APP_CPUS=2 "$RUN" "${GO[@]}" -- sh -c 'go vet ./... && go test ./...'
}

# 本番と同じく、実行ファイルを置いたフォルダで起動する (証明書もそのフォルダに自動で作る)。サーバーのメモリは実測 6〜8 MiB
cmd_serve() {
  cmd_build
  local dir="$ROOT/build/linux-$(host_arch)"
  restart() { # <名前> <公開するポート> <サーバーの起動オプション...>
    local name="$1" publish="$2"; shift 2
    docker rm -f "$name" >/dev/null 2>&1 || true
    APP_MEM=64m APP_CPUS=0.5 "$RUN" --name "$name" --detach --image "$GO_IMAGE" --workdir /srv --volume "$dir:/srv" \
      --publish "$publish" -- ./"$APP" "$@" >/dev/null
  }
  restart "$APP-local" "127.0.0.1:$LOCAL_PORT:8080" -http
  echo "[$APP] この Mac: http://localhost:$LOCAL_PORT/"
  if [ "${LAN:-1}" = "0" ]; then
    docker rm -f "$APP-lan" >/dev/null 2>&1 || true
    return
  fi
  restart "$APP-lan" "0.0.0.0:$LAN_PORT:8443"
  local ip
  ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<Mac の IP>')
  echo "[$APP] スマホ (同じ Wi-Fi): https://$ip:$LAN_PORT/ (初回だけ証明書の警告が出るので「詳細」から進む)"
}

# このアプリのコンテナ (ラベル <アプリ>=1) だけを止める。他のプロジェクトのコンテナには触らない (R5)
cmd_stop() {
  local ids
  ids=$(docker ps -q --filter "label=$VOL=1")
  [ -n "$ids" ] || { echo "[$APP] 動いているコンテナは無い"; return; }
  docker ps --filter "label=$VOL=1" --format "[$APP] 止める: {{.Names}} {{.Status}}"
  # shellcheck disable=SC2086
  docker stop $ids >/dev/null
  echo "[$APP] 停止した。ほかに走っているコンテナ:"
  docker ps --format '  {{.Names}} ({{.Image}}) {{.Status}}'
}

case "${1:-}" in
  build) shift; cmd_build "$@" ;;
  test) cmd_test ;;
  serve) cmd_serve ;;
  stop) cmd_stop ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
