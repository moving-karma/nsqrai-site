#!/usr/bin/env bash
# Verify the stored Squarespace API key by asking the API which website it
# belongs to. Prints the site identity and the key's granted permissions.
set -euo pipefail

CONF_FILE="$HOME/.config/nsqrai/squarespace.env"
API="https://api.squarespace.com/1.0"
UA="nsqrai-site/1.0"

if [ ! -f "$CONF_FILE" ]; then
  echo "No key stored yet. Run: bash ~/work/nsqrai-site/scripts/set-token.sh" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; . "$CONF_FILE"; set +a

call() { # $1 = path
  curl -sS -w '\n%{http_code}' \
    -H "Authorization: Bearer ${SQUARESPACE_API_KEY}" \
    -H "User-Agent: ${UA}" \
    "${API}$1"
}

echo "=== Which website does this key belong to? ==="
resp="$(call /authorization/website)"
code="$(printf '%s' "$resp" | tail -n1)"
body="$(printf '%s' "$resp" | sed '$d')"

case "$code" in
  200) printf '%s\n' "$body" | jq '{id, title: .websiteTitle, url: .identifier, siteUrl: .url}' 2>/dev/null || printf '%s\n' "$body" ;;
  401) echo "HTTP 401 — key is invalid, revoked, or mistyped." >&2; exit 1 ;;
  403) echo "HTTP 403 — key is valid but lacks permission for this endpoint." >&2 ;;
  *)   echo "HTTP $code"; printf '%s\n' "$body" ;;
esac

echo
echo "=== Which scopes actually work? ==="
for path in "/profiles?filter=isCustomer,true" "/commerce/orders?limit=1" "/commerce/inventory?limit=1"; do
  r="$(call "$path")"; c="$(printf '%s' "$r" | tail -n1)"
  label="${path%%\?*}"
  case "$c" in
    200) echo "  OK        $label" ;;
    401|403) echo "  no scope  $label  (HTTP $c)" ;;
    *) echo "  HTTP $c   $label" ;;
  esac
done
