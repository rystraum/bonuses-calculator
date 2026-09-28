#!/bin/bash
# Starts the Bonus Calculator API (Phoenix release) in the foreground.
# Loaded by ~/Library/LaunchAgents/com.rystraum.bonuses-api.plist
set -euo pipefail

ROOT="/Volumes/Code/personal/bonuses-calculator"
RELEASE="$ROOT/bonus_calculator_backend/_build/prod/rel/bonus_calculator_backend"

# The data volume may not be mounted yet when launchd starts us at login.
# Wait briefly for it; exit cleanly (no KeepAlive respawn) if it never appears.
for _ in $(seq 1 30); do
	[ -d "$ROOT" ] && break
	sleep 1
done
if [ ! -d "$ROOT" ]; then
	echo "$(date): $ROOT not mounted; giving up until next login" >&2
	exit 0
fi

set -a
# shellcheck source=bonuses-api.env
source "$ROOT/deploy/bonuses-api.env"
set +a

# Keep schema up to date across deploys; server is exec'd only if this succeeds.
"$RELEASE/bin/migrate"

exec "$RELEASE/bin/server"
