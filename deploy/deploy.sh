#!/bin/bash
# Deploy script for bonuses.rystraum.com / bonuses-api.rystraum.com.
#
# Usage: deploy/deploy.sh [frontend|backend|all]   (default: all)
#
# - Builds with the production API base baked in and VERIFIES the bundle
#   before restarting (this is the check that used to get skipped).
# - Backend: migrates the prod DB, rebuilds the release, restarts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
LOGS="$HOME/Library/Logs/bonuses"
FRONTEND="$ROOT/bonus_calculator_frontend"
BACKEND="$ROOT/bonus_calculator_backend"
RELEASE="$BACKEND/_build/prod/rel/bonus_calculator_backend"

export HOME="${HOME:-/Users/rystraum}"
export PATH="$HOME/.asdf/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$LOGS"

# shellcheck disable=SC1091
set -a
source "$DEPLOY/bonuses-api.env"
set +a

VITE_API_BASE="https://bonuses-api.rystraum.com/api"

wait_for() {
  local url="$1" deadline=$((SECONDS + ${2:-30}))
  while (( SECONDS < deadline )); do
    local code
    code=$(curl -s -m 2 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)
    [[ "$code" == "200" ]] && return 0
    sleep 1
  done
  echo "ERROR: $url did not come up within ${2:-30}s" >&2
  return 1
}

deploy_frontend() {
  echo "==> Building frontend (VITE_API_BASE=$VITE_API_BASE)"
  if ! (cd "$FRONTEND" && VITE_API_BASE="$VITE_API_BASE" npm run build) > "$LOGS/frontend-build.log" 2>&1; then
    tail -20 "$LOGS/frontend-build.log" >&2
    echo "ERROR: frontend build failed — not restarting" >&2
    return 1
  fi

  # Verify the bundle before touching the running service.
  grep -q "✓ built" "$LOGS/frontend-build.log" || { echo "ERROR: build marker missing" >&2; return 1; }
  if ! grep -q "$VITE_API_BASE" "$FRONTEND"/dist/assets/index-*.js; then
    echo "ERROR: $VITE_API_BASE missing from bundle — not restarting" >&2
    return 1
  fi
  if grep -q "localhost:4000" "$FRONTEND"/dist/assets/index-*.js; then
    echo "ERROR: localhost:4000 fallback present in bundle — not restarting" >&2
    return 1
  fi

  echo "==> Restarting frontend on 30300"
  pkill -f "vite preview" 2>/dev/null || true
  sleep 2
  (cd "$FRONTEND" && nohup node_modules/.bin/vite preview --port 30300 --strictPort --host 127.0.0.1 \
    > "$LOGS/bonuses-frontend.out.log" 2> "$LOGS/bonuses-frontend.err.log" &)
  wait_for "http://localhost:30300/" 30
  echo "==> Frontend up — https://bonuses.rystraum.com"
}

deploy_backend() {
  echo "==> Migrating production DB"
  (cd "$BACKEND" && MIX_ENV=prod mix ecto.migrate)

  echo "==> Building release"
  (cd "$BACKEND" && MIX_ENV=prod mix release --overwrite)

  echo "==> Restarting backend on 30301"
  pkill -f "bonus_calculator" 2>/dev/null || true
  sleep 3
  (cd "$BACKEND" && nohup "$RELEASE/bin/server" \
    > "$LOGS/bonuses-api.out.log" 2> "$LOGS/bonuses-api.err.log" &)
  wait_for "http://localhost:30301/robots.txt" 60
  echo "==> Backend up — https://bonuses-api.rystraum.com"
}

case "${1:-all}" in
  frontend) deploy_frontend ;;
  backend)  deploy_backend ;;
  all)      deploy_backend && deploy_frontend ;;
  *) echo "Usage: $0 [frontend|backend|all]" >&2; exit 1 ;;
esac
