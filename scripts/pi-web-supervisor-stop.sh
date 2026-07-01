#!/usr/bin/env bash
set -euo pipefail

CONFIG="${PI_WEB_SUPERVISOR_CONFIG:-$HOME/.config/pi-web/supervisord.conf}"

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing supervisor config: $CONFIG" >&2
  exit 0
fi

if ! supervisorctl -c "$CONFIG" status >/dev/null 2>&1; then
  echo "PI WEB supervisord is not running."
  exit 0
fi

supervisorctl -c "$CONFIG" stop pi-web-client pi-web-web pi-web-sessiond || true
supervisorctl -c "$CONFIG" shutdown
