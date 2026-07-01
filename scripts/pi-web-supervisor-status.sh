#!/usr/bin/env bash
set -euo pipefail

CONFIG="${PI_WEB_SUPERVISOR_CONFIG:-$HOME/.config/pi-web/supervisord.conf}"

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing supervisor config: $CONFIG" >&2
  exit 1
fi

supervisorctl -c "$CONFIG" status
