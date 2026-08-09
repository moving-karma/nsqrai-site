#!/usr/bin/env bash
# Report which credentials are filled in, WITHOUT printing their values.
# Safe to run and safe to paste the output into chat.
set -euo pipefail

CONF="$HOME/.config/nsqrai/credentials.env"

if [ ! -f "$CONF" ]; then
  echo "MISSING: $CONF" >&2
  exit 1
fi

perms="$(stat -f '%Lp' "$CONF")"
echo "File:  $CONF"
echo "Perms: $perms $([ "$perms" = "600" ] && echo '(correct — private to you)' || echo '(SHOULD BE 600 — run: chmod 600 the file)')"
echo

# shellcheck disable=SC1090
set -a; . "$CONF"; set +a

status() { # $1 = var name
  local name="$1" val="${!1:-}"
  if [ -z "$val" ]; then
    printf '  %-24s empty\n' "$name"
  else
    printf '  %-24s set (%d chars, ends ...%s)\n' "$name" "${#val}" "${val: -4}"
  fi
}

echo "Credentials:"
status SQUARESPACE_API_KEY
status LEADS_ENDPOINT_URL
status CLOUDFLARE_API_TOKEN
status CLOUDFLARE_ACCOUNT_ID
