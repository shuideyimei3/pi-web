#!/usr/bin/env bash
set -euo pipefail

CONFIG="${PI_WEB_SUPERVISOR_CONFIG:-$HOME/.config/pi-web/supervisord.conf}"

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing supervisor config: $CONFIG" >&2
  exit 1
fi

if ! supervisorctl -c "$CONFIG" status >/dev/null 2>&1; then
  supervisord -c "$CONFIG"
  for _ in {1..50}; do
    if supervisorctl -c "$CONFIG" status >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

supervisorctl -c "$CONFIG" reread
supervisorctl -c "$CONFIG" update

for program in pi-web-sessiond pi-web-web pi-web-client; do
  state="$(supervisorctl -c "$CONFIG" status "$program" 2>/dev/null | awk '{print $2}')"
  case "$state" in
    RUNNING|STARTING)
      ;;
    *)
      supervisorctl -c "$CONFIG" start "$program"
      ;;
  esac
done

supervisorctl -c "$CONFIG" status
