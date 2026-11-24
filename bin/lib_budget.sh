#!/bin/bash
# Docker の全体予算の判定と、全プロジェクト共通の鍵 (グローバル規約 R2)。
#
# 参考実装: /Volumes/KIOXIA/investment1/deploy/launchd/inv1_docker_ensure.sh (2026-11-14 時点) を写して縮めたもの。
# **鍵の形は investment1・voice と同じにしておくこと。片方だけ変えると排他にならない。**
#   鍵: /tmp/docker_budget.lock というディレクトリを mkdir で作れた者が持ち主。中は pid ファイル 1 つ。
#       放すのは pid が自分の時だけ (rm -f pid; rmdir)。rm -rf はしない。
#   残った鍵の回収: 持ち主の pid が不在 / pid が無いまま 10 秒 / pid が鍵より後に始まった (再利用) の時だけ。
#       回収は鍵のディレクトリを消さず、中に reclaim を mkdir できた 1 人が pid を書き換える。
#   予算 (メモリ): ホスト実メモリ × 0.60 と Docker VM − 1GiB の小さい方。走行中の**全**コンテナを数える
#       (上限の無いコンテナは今の実使用量で)。investment1 の日次が容量待ちの間の予約 (need) も数える。
#   予算 (CPU): ホストのスレッド数 − 2。走行中の全コンテナの NanoCpus を合算する。
#   鍵はコンテナが docker ps に出るまで持つ (出る前に放すと、その隙に別の起動がこのコンテナを数えずに判定する)。

CL_LOCK="/tmp/docker_budget.lock"
CL_LOCK_WAIT_S="${CL_LOCK_WAIT_S:-60}"
CL_LOCK_NOPID_S=10
CL_DAILY_NEED="/tmp/inv1_daily.lock/need"   # investment1 の日次の予約 (読むだけ)
CL_DOCKER_Q_S=30

# 秒数で打ち切る (macOS に timeout は無い。SIGALRM では docker CLI が止まらないので TERM → KILL)
cl_timeout() {
  local s="$1"; shift
  perl -e '
    my $s = shift;
    my $pid = fork();
    die "fork: $!" unless defined $pid;
    if ($pid == 0) { exec { $ARGV[0] } @ARGV; exit 127 }
    local $SIG{ALRM} = sub { kill "TERM", $pid; sleep 2; kill "KILL", $pid; waitpid($pid, 0); exit 124 };
    alarm $s;
    waitpid($pid, 0);
    alarm 0;
    exit(($? & 127) ? 128 + ($? & 127) : ($? >> 8));
  ' "$s" "$@"
}
cl_dq() { cl_timeout "$CL_DOCKER_Q_S" docker "$@"; }

# Docker Desktop に届くか。起動は試みない (R4: 自動起動しない)
cl_docker_up() {
  local ctx
  ctx=$(docker context show 2>/dev/null || echo '?')
  if [ "$ctx" != "desktop-linux" ]; then
    echo "[${APP:-docker}] docker context が desktop-linux ではない ($ctx)。R3/R4 により何もしない" >&2
    return 1
  fi
  if ! cl_timeout 30 docker ps >/dev/null 2>&1; then
    echo "[${APP:-docker}] Docker Desktop に届かない。open -a Docker で手動起動すること (自動起動はしない)" >&2
    return 1
  fi
}

_cl_mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0; }
_cl_pid_alive() { kill -0 "$1" 2>/dev/null || ps -p "$1" >/dev/null 2>&1; }
_cl_pid_started_after() {
  local et
  et=$(ps -o etime= -p "$1" 2>/dev/null | tr -d ' ') || return 1
  [ -n "$et" ] || return 1
  awk -v e="$et" -v now="$(date +%s)" -v t="$2" 'BEGIN{ d = 0
    if (index(e, "-")) { d = substr(e, 1, index(e, "-") - 1); e = substr(e, index(e, "-") + 1) }
    n = split(e, p, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + p[i]
    exit !(now - (d * 86400 + s) > t + 2) }'
}
_cl_lock_stale() {
  local holder="$1" now mt
  now=$(date +%s)
  if [ -z "$holder" ]; then
    mt=$(_cl_mtime "$CL_LOCK/pid"); [ "$mt" -gt 0 ] || mt=$(_cl_mtime "$CL_LOCK")
    if [ "$mt" -gt 0 ] && [ $((now - mt)) -gt "$CL_LOCK_NOPID_S" ]; then echo "pid の無いまま $((now - mt)) 秒"; return 0; fi
    return 1
  fi
  if ! _cl_pid_alive "$holder"; then echo "pid $holder は不在"; return 0; fi
  mt=$(_cl_mtime "$CL_LOCK/pid")
  if [ "$mt" -gt 0 ] && _cl_pid_started_after "$holder" "$mt"; then echo "pid $holder は再利用された別のプロセス"; return 0; fi
  return 1
}
_cl_write_pid() { ( set -C; echo "$1" > "$CL_LOCK/pid" ) 2>/dev/null; }
_cl_lock_takeover() {
  local seen="$1" why="$2" who="$3" sub="$CL_LOCK/reclaim" now
  if ! mkdir "$sub" 2>/dev/null; then
    if [ -d "$sub" ] && [ $(( $(date +%s) - $(_cl_mtime "$sub") )) -gt "$CL_LOCK_NOPID_S" ]; then rmdir "$sub" 2>/dev/null; fi
    return 1
  fi
  now=$(cat "$CL_LOCK/pid" 2>/dev/null || true)
  if [ "$now" != "$seen" ] || { [ -n "$now" ] && ! _cl_lock_stale "$now" >/dev/null; }; then rmdir "$sub" 2>/dev/null; return 1; fi
  rm -f "$CL_LOCK/pid" 2>/dev/null
  if ! _cl_write_pid "$who"; then rmdir "$sub" 2>/dev/null; return 1; fi
  rmdir "$sub" 2>/dev/null
  [ "$(cat "$CL_LOCK/pid" 2>/dev/null || true)" = "$who" ] || return 1
  echo "[budget] 残った鍵を引き継いだ (${why})" >&2
  return 0
}
cl_lock_acquire() {
  local who="$1" waited=0 holder why
  if [ -e "$CL_LOCK" ] && [ ! -d "$CL_LOCK" ]; then echo "[budget] $CL_LOCK が通常ファイルとして在る" >&2; return 3; fi
  while :; do
    if mkdir "$CL_LOCK" 2>/dev/null; then
      _cl_write_pid "$who" && return 0
    else
      holder=$(cat "$CL_LOCK/pid" 2>/dev/null || true)
      if [ -d "$CL_LOCK" ] && why=$(_cl_lock_stale "$holder"); then _cl_lock_takeover "$holder" "$why" "$who" && return 0; fi
    fi
    waited=$((waited + 1))
    if [ "$waited" -gt "$CL_LOCK_WAIT_S" ]; then echo "[budget] 鍵を ${CL_LOCK_WAIT_S} 秒取れない (持ち主 pid=${holder:-不明})" >&2; return 3; fi
    sleep 1
  done
}
cl_lock_release() {
  local who="$1"
  [ "$(cat "$CL_LOCK/pid" 2>/dev/null || true)" = "$who" ] || return 0
  rm -f "$CL_LOCK/pid" 2>/dev/null || true
  rmdir "$CL_LOCK" 2>/dev/null || true
}
# コンテナが docker ps に出たら (または持ち主が終わったら、または secs 秒後に) 鍵を放す見張りを裏で立てる
cl_lock_release_when_up() {
  local name="$1" who="$2" secs="${3:-60}"
  trap '' INT TERM HUP
  ( end=$(( $(date +%s) + secs ))
    while [ "$(date +%s)" -lt "$end" ]; do
      _cl_pid_alive "$who" || break
      cl_timeout 10 docker ps -q --filter "name=^${name}\$" 2>/dev/null | grep -q . && break
      sleep 0.25
    done
    cl_lock_release "$who" ) >/dev/null 2>&1 &
  trap - INT TERM HUP
}

cl_to_bytes() {
  awk -v s="$1" 'BEGIN{u=tolower(substr(s,length(s)));n=s+0
    if(u=="g")n*=1024^3; else if(u=="m")n*=1024^2; else if(u=="k")n*=1024
    printf "%d", n}'
}
cl_mem_budget_bytes() {
  local total b vm
  total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  b=$(awk -v t="${total:-0}" 'BEGIN{printf "%d", t*0.60}')
  vm=$(cl_dq info --format '{{.MemTotal}}' 2>/dev/null) || vm=0
  case "$vm" in ''|*[!0-9]*) vm=0 ;; esac
  if [ "$vm" -le 1073741824 ]; then echo 0; return 0; fi
  if [ "$b" -gt $((vm - 1073741824)) ]; then b=$((vm - 1073741824)); fi
  echo "$b"
}
# 走行中の全コンテナのメモリ (上限があれば上限、無ければ実使用量)。数えられなければ 1
cl_mem_used_bytes() {
  local ids lim unl="" n=0 total=0 id m u
  ids=$(cl_dq ps -q 2>/dev/null) || return 1
  [ -n "$ids" ] || { echo 0; return 0; }
  # shellcheck disable=SC2086
  lim=$(cl_dq inspect --format '{{.Id}} {{.HostConfig.Memory}}' $ids 2>/dev/null) || return 1
  while read -r id m; do
    [ -n "$id" ] || continue
    if [ "${m:-0}" -gt 0 ]; then total=$((total + m)); else unl="$unl $id"; n=$((n + 1)); fi
  done <<EOF
$lim
EOF
  if [ "$n" -gt 0 ]; then
    # shellcheck disable=SC2086
    u=$(cl_dq stats --no-stream --format '{{.MemUsage}}' $unl 2>/dev/null) || return 1
    u=$(printf '%s\n' "$u" | awk 'NF { v=$1; x=v+0; sub(/^[0-9.]+/, "", v)
          if (v=="KiB"||v=="kB") x*=1024; else if (v=="MiB"||v=="MB") x*=1048576; else if (v=="GiB"||v=="GB") x*=1073741824
          s+=x } END { printf "%d", s+0 }')
    total=$((total + ${u:-0}))
  fi
  echo "$total"
}
cl_daily_reserved_bytes() {
  local age
  if [ -f "$CL_DAILY_NEED" ] && ! cl_dq ps -q --filter 'name=^inv1_daily$' 2>/dev/null | grep -q .; then
    age=$(( $(date +%s) - $(_cl_mtime "$CL_DAILY_NEED") ))
    if [ "$age" -lt 3600 ]; then cl_to_bytes "$(cat "$CL_DAILY_NEED" 2>/dev/null)"; return 0; fi
  fi
  echo 0
}
# 判定。<メモリ要求 (例 1g)> <CPU 要求 (例 2)>。0 = 入る / 70 = 入らない / 1 = 数えられない。鍵を持って呼ぶ
cl_budget_fits() {
  local want_m want_c budget used res ids used_c ncpu budget_c
  want_m=$(cl_to_bytes "$1")
  want_c=$(awk -v s="$2" 'BEGIN{printf "%d", (s+0)*1000}')
  budget=$(cl_mem_budget_bytes)
  [ "${budget:-0}" -gt 0 ] || { echo "[budget] 予算が分からない (docker info を読めない)" >&2; return 1; }
  used=$(cl_mem_used_bytes) || { echo "[budget] 走行中のコンテナを数えられない" >&2; return 1; }
  res=$(cl_daily_reserved_bytes)
  if [ $((used + res + want_m)) -gt "$budget" ]; then
    echo "[budget] メモリ予算超過: 走行中 $((used/1048576))MiB + 予約 $((res/1048576))MiB + 要求 $((want_m/1048576))MiB > 予算 $((budget/1048576))MiB" >&2
    cl_dq ps --format '[budget]   走行中: {{.Names}} ({{.Image}}) {{.Status}}' >&2 2>/dev/null || true
    return 70
  fi
  ncpu=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 0)
  budget_c=$(( (ncpu - 2) * 1000 ))
  ids=$(cl_dq ps -q 2>/dev/null) || return 1
  used_c=0
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    used_c=$(cl_dq inspect --format '{{.HostConfig.NanoCpus}}' $ids 2>/dev/null | awk '{s+=$1} END{printf "%d", (s+0)/1000000}') || return 1
  fi
  if [ "$ncpu" -gt 2 ] && [ $((used_c + want_c)) -gt "$budget_c" ]; then
    echo "[budget] CPU 予算超過: 走行中 $((used_c/1000)) + 要求 $((want_c/1000)) > 予算 $((budget_c/1000))" >&2
    cl_dq ps --format '[budget]   走行中: {{.Names}} ({{.Image}}) {{.Status}}' >&2 2>/dev/null || true
    return 70
  fi
  echo "[budget] OK: メモリ 走行中 $((used/1048576))MiB + 要求 $((want_m/1048576))MiB / 予算 $((budget/1048576))MiB, CPU 走行中 $((used_c/1000)) + 要求 $((want_c/1000)) / 予算 $((budget_c/1000))" >&2
  return 0
}
