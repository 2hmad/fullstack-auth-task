#!/usr/bin/env bash
# Checks the security properties of a running `docker compose up` stack from the outside.
# Usage: scripts/verify-stack.sh [base-url]     Set COMPOSE_PROJECT_NAME for another project.
set -uo pipefail
cd "$(dirname "$0")/.."

base_url=${1:-http://localhost:8080}
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

status_is() { # status_is <expected> <curl arguments...>
  local expected=$1 actual
  shift
  actual=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  [ "$actual" = "$expected" ] || { echo "      expected $expected, got $actual"; return 1; }
}

has_security_headers() {
  local headers header
  headers=$(curl -sI "$base_url$1" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  for header in "content-security-policy: .*frame-ancestors 'none'" 'x-content-type-options: nosniff' \
    'strict-transport-security: ' 'referrer-policy: '; do
    grep -q "^$header" <<<"$headers" || { echo "      missing '$header'"; return 1; }
  done
}

mongosh_in_container() { # runs JavaScript in the mongo container; output on stdout
  docker compose exec -T mongo sh -c 'mongosh --quiet --norc "$@"' mongosh "$@" 2>&1
}

# Distinguishes "refused" from "could not run": each check looks for the server's own error code.
# 13 = Unauthorized, 18 = AuthenticationFailed.
code_of() { echo "try { $1; print('ALLOWED') } catch (e) { print('CODE ' + e.code) }"; }

anonymous_is_denied() {
  local output
  output=$(mongosh_in_container mongodb://localhost/auth-app --eval "$(code_of "$1")")
  [ "$output" = 'CODE 13' ] || { echo "      got: $output"; return 1; }
}

wrong_password_is_denied() {
  local output
  output=$(mongosh_in_container mongodb://localhost/auth-app \
    --eval "$(code_of "db.auth('auth-app-api', 'wrong')")")
  [ "$output" = 'CODE 18' ] || { echo "      got: $output"; return 1; }
}

app_user() { # app_user <expected> <javascript>
  local output
  output=$(mongosh_in_container mongodb://localhost/auth-app \
    --eval 'db.auth(process.env.MONGO_APP_USERNAME, process.env.MONGO_APP_PASSWORD) || quit(1)' \
    --eval "$(code_of "$2")")
  [ "$output" = "$1" ] || { echo "      got: $output"; return 1; }
}

mongo_port_is_not_published() {
  # From the container itself: `docker compose port` words "no port" differently across versions.
  local container published
  container=$(docker compose ps --quiet mongo) && [ -n "$container" ] || return 1
  published=$(docker inspect --format \
    '{{range .NetworkSettings.Ports}}{{range .}}{{.HostIp}}:{{.HostPort}} {{end}}{{end}}' \
    "$container") || return 1
  [ -z "$published" ] || { echo "      published on $published"; return 1; }
}

echo '# MongoDB'
check 'port is not published' mongo_port_is_not_published
check 'anonymous read is denied' anonymous_is_denied 'db.users.findOne()'
check 'anonymous write is denied' anonymous_is_denied 'db.users.insertOne({ probe: 1 })'
check 'a wrong password is denied' wrong_password_is_denied
check 'the API user can read its database' app_user ALLOWED 'db.users.findOne()'
check 'the API user cannot read another database' \
  app_user 'CODE 13' "db.getSiblingDB('admin').system.users.findOne()"
check 'the API user cannot create users' \
  app_user 'CODE 13' "db.createUser({ user: 'probe', pwd: 'probe', roles: [] })"

echo '# API, through nginx'
check 'GET /api/docs is closed' status_is 404 "$base_url/api/docs"
check 'GET /api/docs-json is closed' status_is 404 "$base_url/api/docs-json"
check 'a protected route needs a token' status_is 401 "$base_url/api/v1/users/me"
check 'a cross-site POST is refused' status_is 403 -X POST "$base_url/api/v1/auth/logout" \
  -H 'Sec-Fetch-Site: cross-site' -H 'Origin: https://evil.example'

echo '# Security headers'
asset=$(curl -s "$base_url/" | grep -o '/assets/[^"]*\.js' | head -n 1)
check 'the page references a script to test' test -n "$asset"
for path in / /signin "${asset:-/assets/missing.js}"; do
  check "on $path" has_security_headers "$path"
done

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo 'all checks passed'
