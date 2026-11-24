#!/bin/bash
# スマホ用の配信 (同じ Wi-Fi) に使う自己署名の証明書を、無い時だけ作る。build/devcert/ に置き、作り直さず使い回す
# (作り直すと、スマホでまた証明書の警告を越える必要があるため)。本番では使わない (デプロイ先が HTTPS を付ける)。
#   bin/devcert.sh [IP]   IP は証明書に入れる Mac の IP (省略可)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR="$ROOT/build/devcert"
[ -f "$DIR/cert.pem" ] && [ -f "$DIR/key.pem" ] && exit 0
mkdir -p "$DIR"
SAN="DNS:localhost,IP:127.0.0.1${1:+,IP:$1}"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 825 \
  -subj "/CN=qr-server (dev)" -addext "subjectAltName=$SAN" \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" 2>/dev/null
chmod 644 "$DIR/key.pem" # 配信のコンテナ (root ではない利用者) が読めるように。手元の試し用なので構わない
echo "[devcert] 自己署名の証明書を作った: $DIR ($SAN)"
