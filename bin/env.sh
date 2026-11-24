# bin/ の各スクリプトが読む共通の値。イメージやポートを変える時はここだけを直す。
# 使い方: ROOT を決めてから source する。
APP=$(basename "$ROOT")          # qr-server (コンテナ名の頭)
VOL=$(echo "$APP" | tr -d '-')    # 名前付きボリュームとラベルの頭 (qrserver)

NODE_IMAGE=node:24.21.0-bookworm-slim
GO_IMAGE=golang:1.27.4-alpine

# 配信のポート (この Mac 用 / スマホ用)
LOCAL_PORT=5187
LAN_PORT=5188

# 画面のビルド (frontend/) に使うコンテナの指定。
# exFAT はシンボリックリンクを作れず、macOS の ._ ファイルが混ざるので、node_modules は名前付きボリュームに置く
NODE_RUN=(--image "$NODE_IMAGE" --workdir /app/frontend
          --volume "$ROOT:/app"
          --volume "${VOL}_node_modules:/app/frontend/node_modules"
          --volume "${VOL}_npm_cache:/root/.npm")

# Go のビルドとテストに使うコンテナの指定。依存とビルドのキャッシュは名前付きボリュームに置いて使い回す。
# GOFLAGS=-buildvcs=false: イメージに git が無いので、git の情報を埋め込まない (版は bin/build.sh が -ldflags で入れる)
GO_RUN=(--image "$GO_IMAGE" --workdir /app
        --volume "$ROOT:/app"
        --volume "${VOL}_gomod:/go/pkg/mod"
        --volume "${VOL}_gocache:/root/.cache/go-build"
        --env GOFLAGS=-buildvcs=false --env GOTOOLCHAIN=local --env CGO_ENABLED=0)

# この Mac の Docker の CPU の種類 (arm64 / amd64)
host_arch() {
  case "$(uname -m)" in
    arm64 | aarch64) echo arm64 ;;
    x86_64 | amd64) echo amd64 ;;
    *) uname -m ;;
  esac
}

# macOS が exFAT に作る ._ ファイルは、ビルドやテストに混ざると壊すので消す (依存と git の中は触らない)
remove_dot_underscore() {
  find "$ROOT" -name '._*' -not -path '*/node_modules/*' -not -path '*/.git/*' -delete 2>/dev/null || true
}
