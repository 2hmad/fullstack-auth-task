#!/usr/bin/env bash
# Checks the security properties of a deployment over HTTPS, from the outside, without an account.
# Usage: scripts/verify-deployment.sh https://your-host
# It uses up this machine's sign-in budget for a minute.
set -uo pipefail

base_url=${1:?usage: scripts/verify-deployment.sh https://your-host}
base_url=${base_url%/}
failures=0

check() { # check <description> <command...>
  local description=$1
  shift
  if "$@"; then
    echo "ok    $description"
  else
    echo "FAIL  $description"
    failures=$((failures + 1))
  fi
}

status_of() { curl -s -m 30 -o /dev/null -w '%{http_code}' "$@"; }

status_is() { # status_is <expected> <curl arguments...>
  local expected=$1 actual
  shift
  actual=$(status_of "$@")
  [ "$actual" = "$expected" ] || { echo "      expected $expected, got $actual"; return 1; }
}

headers_of() { curl -s -m 30 -o /dev/null -D - "$@" | tr -d '\r' | tr '[:upper:]' '[:lower:]'; }

has_headers() { # has_headers <path> <header pattern...>
  local headers header path=$1
  shift
  headers=$(headers_of "$base_url$path")
  for header in "$@"; do
    grep -q "^$header" <<<"$headers" || { echo "      missing '$header'"; return 1; }
  done
}

redirects_to_https() {
  grep -q "^location: https://" <<<"$(headers_of "${base_url/https:/http:}/signin")"
}

ready_for_signin() {
  local status
  status=$(attempt 192.0.2.250)
  [ "$status" = 401 ] || { echo "      expected 401, got $status"; return 1; }
}

attempt() { # attempt <claimed client address>; a different account each time
  status_of -X POST "$base_url/api/v1/auth/signin" -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: $1" -H "X-Real-IP: $1" -H "Forwarded: for=$1" \
    -d "{\"email\":\"probe-$RANDOM$RANDOM@example.com\",\"password\":\"Wrong-pass1!\"}"
}

# A client that claims a new address each time must still run out of attempts (5 per minute).
spoofed_addresses_are_limited() {
  local n status
  for n in 1 2 3 4 5 6 7 8; do
    status=$(attempt "192.0.2.$n")
    [ "$status" = 429 ] && return 0
  done
  echo "      no 429 after $n more attempts; last status $status"
  return 1
}

# The limit must count clients, not everyone together: visitors behind other addresses keep theirs.
# That needs a second network, so it is not checked here.

echo '# Pages'
check 'the app answers' status_is 200 "$base_url/"
check 'client-side routes load the app' status_is 200 "$base_url/signin"
check 'a missing asset is a 404' status_is 404 "$base_url/assets/missing.js"
check 'plain HTTP redirects to HTTPS' redirects_to_https

echo '# API'
check 'a protected route needs a token' status_is 401 "$base_url/api/v1/users/me"
check 'GET /api/docs is closed' status_is 404 "$base_url/api/docs"
check 'GET /api/docs-json is closed' status_is 404 "$base_url/api/docs-json"
check 'a cross-site POST is refused' status_is 403 -X POST "$base_url/api/v1/auth/logout" \
  -H 'Sec-Fetch-Site: cross-site' -H 'Origin: https://evil.example'
check 'sign-in reaches the database' ready_for_signin
check 'made-up client addresses do not avoid the limit' spoofed_addresses_are_limited

echo '# Security headers'
asset=$(curl -s -m 30 "$base_url/" | grep -o '/assets/[^"]*\.js' | head -n 1)
check 'the page references a script to test' test -n "$asset"
for path in / /signin "${asset:-/assets/missing.js}"; do
  check "on $path" has_headers "$path" "content-security-policy: .*frame-ancestors 'none'" \
    'x-content-type-options: nosniff' 'strict-transport-security: ' 'referrer-policy: '
done
check 'on the API, with responses never stored' has_headers /api/v1/users/me \
  'content-security-policy: ' 'x-content-type-options: nosniff' 'strict-transport-security: ' \
  'cache-control: no-store'

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo 'all checks passed'
