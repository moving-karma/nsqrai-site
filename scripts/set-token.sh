#!/usr/bin/env bash
# Store the Squarespace API key locally. The key is never echoed, never written
# to shell history, and never leaves this machine.
set -euo pipefail

CONF_DIR="$HOME/.config/nsqrai"
CONF_FILE="$CONF_DIR/squarespace.env"

mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"

printf 'Paste the Squarespace API key (input is hidden), then press Enter:\n> '
IFS= read -rs SQSP_KEY
printf '\n'

if [ -z "${SQSP_KEY:-}" ]; then
  echo "No key entered. Nothing written." >&2
  exit 1
fi

umask 077
printf 'SQUARESPACE_API_KEY=%s\n' "$SQSP_KEY" > "$CONF_FILE"
chmod 600 "$CONF_FILE"
unset SQSP_KEY

echo "Stored in $CONF_FILE (mode 600)."
echo "Now verify with:  bash ~/work/nsqrai-site/scripts/verify-token.sh"
