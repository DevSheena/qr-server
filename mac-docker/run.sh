#!/bin/bash
# この Mac 専用: このアプリのコンテナを、上限つき・全体予算の判定つきで起動する唯一の入口 (グローバル規約 R1/R2)。
# 何を・どこで動かすか (イメージ・マウント) は呼ぶ側 (dev.sh) が渡す。
#
# 使い方:
#   APP_MEM=1g APP_CPUS=2 mac-docker/run.sh --image <イメージ> [オプション] -- <コマンド...>
# オプション:
#   --image <イメージ>   使うイメージ (必須)
#   --name <名前>       コンテナ名 (既定 <アプリ>-run-<pid>)
#   --detach            裏で動かす (配信用)。止めるのは dev.sh stop
#   --workdir <場所>    コンテナの中の作業ディレクトリ
#   --publish <指定>    docker run -p と同じ。何度でも
#   --env K=V           コンテナの中の環境変数。何度でも
#   --volume <指定>     docker run -v と同じ。何度でも
# 上限は必ず環境変数で渡す (APP_MEM / APP_CPUS)。前景でコマンドを動かした時は、終わりにメモリのピークを表示する。上限はこの実測で決める。
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
APP=$(basename "$(dirname "$HERE")") # qr-server (コンテナ名の頭)
VOL=$(echo "$APP" | tr -d '-')       # ラベルの頭 (qrserver)。dev.sh stop はこのラベルで止める
# shellcheck source=mac-docker/lib_budget.sh
source "$HERE/lib_budget.sh"

MEM="${APP_MEM:-}"
CPUS="${APP_CPUS:-}"
if [ -z "$MEM" ] || [ -z "$CPUS" ]; then
  echo "[$APP] APP_MEM と APP_CPUS を指定すること (例: APP_MEM=1g APP_CPUS=2 mac-docker/run.sh --image ... -- npm ci)" >&2
  exit 64
fi
NAME="$APP-run-$$"
DETACH=0
IMAGE=""
OPTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --image) IMAGE="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --detach) DETACH=1; shift ;;
    --workdir) OPTS+=(-w "$2"); shift 2 ;;
    --publish) OPTS+=(-p "$2"); shift 2 ;;
    --env) OPTS+=(-e "$2"); shift 2 ;;
    --volume) OPTS+=(-v "$2"); shift 2 ;;
    --) shift; break ;;
    *) echo "[$APP] 知らないオプション: $1" >&2; exit 64 ;;
  esac
done
[ -n "$IMAGE" ] || { echo "[$APP] --image が無い" >&2; exit 64; }
[ $# -gt 0 ] || { echo "[$APP] コマンドが無い (-- の後に書く)" >&2; exit 64; }

cl_docker_up || exit 69

trap 'cl_lock_release $$' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
cl_lock_acquire $$ || exit 3
rc=0; cl_budget_fits "$MEM" "$CPUS" || rc=$?
if [ "$rc" -ne 0 ]; then
  echo "[$APP] 起動しない (予算判定 rc=$rc)。走行中のジョブが終わるのを待つか、上限を下げること" >&2
  exit "$rc"
fi
cl_lock_release_when_up "$NAME" $$

COMMON=(--name "$NAME" --memory="$MEM" --memory-swap="$MEM" --cpus="$CPUS" --label "$VOL=1"
        -e UV_THREADPOOL_SIZE="$(awk -v c="$CPUS" 'BEGIN{n=int(c); print (n<1?1:n)}')"
        ${OPTS[@]+"${OPTS[@]}"})

if [ "$DETACH" -eq 1 ]; then
  docker run -d --rm "${COMMON[@]}" "$IMAGE" "$@"
  exit $?
fi
TTY=(-i); [ -t 0 ] && [ -t 1 ] && TTY=(-it)
# 終わりにメモリのピークを表示する (上限を実測で決めるため)
# shellcheck disable=SC2016
exec docker run --rm "${TTY[@]}" "${COMMON[@]}" "$IMAGE" \
  sh -c 'rc=0; "$@" || rc=$?; p=$(cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo 0); echo "['"$APP"'] メモリのピーク: $((p/1048576)) MiB (上限 '"$MEM"', CPU '"$CPUS"')" >&2; exit $rc' app "$@"
