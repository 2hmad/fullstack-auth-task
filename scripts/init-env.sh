#!/bin/sh
# Creates .env (docker compose) and apps/api/.env (local development) with random secrets.
# Existing files are left alone. Needs only sh and openssl.
set -eu
umask 077
cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo ".env already exists: left as it is"
else
  jwt_secret=$(openssl rand -base64 32)
  root_password=$(openssl rand -hex 24)
  app_password=$(openssl rand -hex 24)
  printf 'JWT_SECRET=%s\nMONGO_ROOT_PASSWORD=%s\nMONGO_APP_PASSWORD=%s\n' \
    "$jwt_secret" "$root_password" "$app_password" > .env
  echo "created .env"
fi

mongo_password=$(sed -n 's/^MONGO_APP_PASSWORD=//p' .env)
if [ -z "$mongo_password" ] || ! grep -q '^MONGO_ROOT_PASSWORD=.' .env; then
  printf '%b\n' "error: .env has no MONGO_ROOT_PASSWORD or MONGO_APP_PASSWORD; add them (see .env.example),\n  or move it away and run this again" >&2
  exit 1
fi

if [ -e apps/api/.env ]; then
  echo "apps/api/.env already exists: left as it is"
else
  jwt_secret=$(openssl rand -base64 32)
  mongo_uri="mongodb://auth-app-api:${mongo_password}@localhost:27017/auth-app?authSource=auth-app"
  sed -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" \
      -e "s|^MONGODB_URI=.*|MONGODB_URI=${mongo_uri}|" \
      apps/api/.env.example > apps/api/.env
  echo "created apps/api/.env"
fi
