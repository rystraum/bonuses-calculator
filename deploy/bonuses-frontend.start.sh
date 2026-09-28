#!/bin/bash
# Serves the built frontend (vite preview) in the foreground.
# Loaded by ~/Library/LaunchAgents/com.rystraum.bonuses-frontend.plist
set -euo pipefail

ROOT="/Volumes/Code/personal/bonuses-calculator"
FRONTEND="$ROOT/bonus_calculator_frontend"

# The data volume may not be mounted yet when launchd starts us at login.
# Wait briefly for it; exit cleanly (no KeepAlive respawn) if it never appears.
for _ in $(seq 1 30); do
	[ -d "$FRONTEND" ] && break
	sleep 1
done
if [ ! -d "$FRONTEND" ]; then
	echo "$(date): $FRONTEND not mounted; giving up until next login" >&2
	exit 0
fi

export PATH="/Users/rystraum/.asdf/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/rystraum"

cd "$FRONTEND"
exec node_modules/.bin/vite preview --port 30300 --strictPort --host 127.0.0.1
