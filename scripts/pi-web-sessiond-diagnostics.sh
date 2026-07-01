#!/usr/bin/env bash
set -euo pipefail

LOG="${PI_WEB_SESSIOND_DIAGNOSTICS_LOG:-/tmp/pi-web-sessiond-diagnostics.log}"
REPORT_DIR="${PI_WEB_NODE_REPORT_DIR:-/tmp/pi-web-node-reports}"
INTERVAL="${PI_WEB_SESSIOND_DIAGNOSTICS_INTERVAL:-5}"
HEAPSNAPSHOT_LIMIT="${PI_WEB_HEAPSNAPSHOT_NEAR_HEAP_LIMIT:-1}"

mkdir -p "$(dirname "$LOG")" "$REPORT_DIR"

append_node_option() {
  local option="$1"
  case " ${NODE_OPTIONS:-} " in
    *" $option "*) ;;
    *) NODE_OPTIONS="${NODE_OPTIONS:-}${NODE_OPTIONS:+ }$option" ;;
  esac
}

append_node_option "--report-on-fatalerror"
append_node_option "--report-on-signal"
append_node_option "--report-signal=SIGUSR2"
append_node_option "--report-directory=$REPORT_DIR"
append_node_option "--heapsnapshot-near-heap-limit=$HEAPSNAPSHOT_LIMIT"

if [[ "${PI_WEB_NODE_MAX_OLD_SPACE_MB:-}" != "" ]]; then
  append_node_option "--max-old-space-size=$PI_WEB_NODE_MAX_OLD_SPACE_MB"
fi

export NODE_OPTIONS

read_metric() {
  local path="$1"
  if [[ -r "$path" ]]; then
    tr -d "\n" < "$path"
  else
    printf "unavailable"
  fi
}

snapshot() {
  local reason="$1"
  {
    printf "\n[%s] %s\n" "$(date -Is)" "$reason"
    printf "node_options=%s\n" "${NODE_OPTIONS:-}"
    printf "memory.current=%s\n" "$(read_metric /sys/fs/cgroup/memory.current)"
    printf "memory.peak=%s\n" "$(read_metric /sys/fs/cgroup/memory.peak)"
    printf "pids.current=%s\n" "$(read_metric /sys/fs/cgroup/pids.current)"
    printf "pids.max=%s\n" "$(read_metric /sys/fs/cgroup/pids.max)"
    if [[ -r /sys/fs/cgroup/memory.events ]]; then
      sed "s/^/memory.events./" /sys/fs/cgroup/memory.events
    fi
    awk '/^(MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree|Committed_AS|CommitLimit):/ { print }' /proc/meminfo
    printf "zombies="
    ps -eo stat= | awk '$1 ~ /Z/ { z++ } END { print z + 0 }'
    printf "top_rss:\n"
    ps -eo pid,ppid,stat,rss,vsz,comm,args --sort=-rss | head -n 30
  } >> "$LOG" 2>&1 || true
}

monitor() {
  while true; do
    sleep "$INTERVAL"
    snapshot "periodic"
  done
}

snapshot "start"
monitor &
monitor_pid="$!"
child_pid=""

stop_monitor() {
  kill "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true
}

trap stop_monitor EXIT

node --no-wasm-tier-up dist/server/sessiond.js &
child_pid="$!"

set +e
wait "$child_pid"
status="$?"
set -e

snapshot "exit status=$status"
exit "$status"
