#!/bin/bash
# ビルドして、本番と同じイメージで配信する (前のものが動いていれば作り直して入れ替える)。
#   <アプリ>-local … http://localhost:<LOCAL>/   (この Mac の中だけ。HTTP。localhost はカメラを使える)
#   <アプリ>-lan   … https://<Mac の IP>:<LAN>/ (同じ Wi-Fi のスマホから。自己署名の HTTPS。スマホのカメラには HTTPS が要る)
#   LAN=0 bin/serve.sh … スマホ用の配信を止める (Mac 用は立てる)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=bin/env.sh
source "$ROOT/bin/env.sh"

"$ROOT/bin/image.sh"
IMAGE="$APP:dev"
# コンテナの中では既定の :8080 で待つ。サーバーはメモリをほとんど使わない (実測は README)
SERVE=(--image "$IMAGE" --detach)
restart() { # <名前> <run.sh のオプション...> [-- <サーバーの起動オプション...>]
  local name="$1"; shift
  docker rm -f "$name" >/dev/null 2>&1 || true
  APP_MEM=64m APP_CPUS=0.5 "$ROOT/bin/run.sh" --name "$name" "${SERVE[@]}" "$@" >/dev/null
}

restart "$APP-local" --publish "127.0.0.1:$LOCAL_PORT:8080"
echo "[$APP] この Mac: http://localhost:$LOCAL_PORT/"

if [ "${LAN:-1}" = "0" ]; then
  docker rm -f "$APP-lan" >/dev/null 2>&1 && echo "[$APP] スマホ用の配信を止めた" || true
  exit 0
fi
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
"$ROOT/bin/devcert.sh" "${IP:-}"
restart "$APP-lan" --publish "0.0.0.0:$LAN_PORT:8080" --volume "$ROOT/build/devcert:/certs:ro" \
  -- -cert /certs/cert.pem -key /certs/key.pem
echo "[$APP] スマホ (同じ Wi-Fi): https://${IP:-<Mac の IP>}:$LAN_PORT/ (最初の 1 回だけ証明書の警告が出るので「詳細」から進む)"
