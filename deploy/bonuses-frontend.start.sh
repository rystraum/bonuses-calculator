#!/bin/bash
# Serves the built frontend (vite preview) in the foreground.
# Loaded by /Library/LaunchDaemons/com.rystraum.bonuses-frontend.plist
# TEMPORARY: launchd cannot access /Volumes/Code (TCC). Exit cleanly so
# launchd stops respawning; services are started manually until this is
# resolved (relocate to home dir or grant Full Disk Access).
echo "$(date): manual mode - launchd start disabled" >> /Users/rystraum/Library/Logs/bonuses/manual-mode.log
exit 0

set -euo pipefail

ROOT="/Volumes/Code/personal/bonuses-calculator"
FRONTEND="$ROOT/bonus_calculator_frontend"

export PATH="/Users/rystraum/.asdf/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/rystraum"

cd "$FRONTEND"
exec node_modules/.bin/vite preview --port 30300 --strictPort --host 127.0.0.1
