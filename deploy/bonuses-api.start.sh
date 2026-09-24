#!/bin/bash
# Starts the Bonus Calculator API (Phoenix release) in the foreground.
# Loaded by /Library/LaunchDaemons/com.rystraum.bonuses-api.plist
# TEMPORARY: launchd cannot access /Volumes/Code (TCC). Exit cleanly so
# launchd stops respawning; services are started manually until this is
# resolved (relocate to home dir or grant Full Disk Access).
echo "$(date): manual mode - launchd start disabled" >> /Users/rystraum/Library/Logs/bonuses/manual-mode.log
exit 0

set -euo pipefail

ROOT="/Volumes/Code/personal/bonuses-calculator"
RELEASE="$ROOT/bonus_calculator_backend/_build/prod/rel/bonus_calculator_backend"

set -a
# shellcheck source=bonuses-api.env
source "$ROOT/deploy/bonuses-api.env"
set +a

# Keep schema up to date across deploys; server is exec'd only if this succeeds.
"$RELEASE/bin/migrate"

exec "$RELEASE/bin/server"
