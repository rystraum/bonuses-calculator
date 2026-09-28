#!/bin/bash
# Installs the Bonus Calculator LaunchAgents into the user's GUI session.
# Also removes the stale root LaunchDaemons from the pre-TCC-fix setup (sudo).
# Jobs start at login and stop at logout. Idempotent: safe to re-run after edits.
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/bonuses"
LAUNCHCTL=/bin/launchctl
UID_=$(id -u)

/bin/mkdir -p "$LAUNCH_AGENTS" "$LOGS"

for label in com.rystraum.bonuses-api com.rystraum.bonuses-frontend; do
	/bin/cp "$DEPLOY/$label.plist" "$LAUNCH_AGENTS/$label.plist"
	/bin/chmod 644 "$LAUNCH_AGENTS/$label.plist"

	$LAUNCHCTL bootout "gui/$UID_/$label" 2>/dev/null || true
	# bootout is async; give it a moment and retry bootstrap on the transient
	# EIO that follows an immediate re-bootstrap
	for attempt in 1 2 3; do
		sleep 1
		if $LAUNCHCTL bootstrap "gui/$UID_" "$LAUNCH_AGENTS/$label.plist" 2>/dev/null; then
			break
		fi
		done
	$LAUNCHCTL kickstart -k "gui/$UID_/$label"
done

echo "Installed into $LAUNCH_AGENTS and started. Check status with:"
echo "  launchctl print gui/$UID_/com.rystraum.bonuses-api"
echo "  launchctl print gui/$UID_/com.rystraum.bonuses-frontend"
echo "Logs: $LOGS"

# Remove stale root LaunchDaemons from the pre-TCC-fix setup (root can't get the
# TCC grant, so they respawn-fail forever and spam the shared log files).
# Non-fatal: if sudo needs a password, prints the commands to run by hand.
if [ -f /Library/LaunchDaemons/com.rystraum.bonuses-api.plist ] || [ -f /Library/LaunchDaemons/com.rystraum.bonuses-frontend.plist ]; then
	if /usr/bin/sudo -n true 2>/dev/null; then
		for label in com.rystraum.bonuses-api com.rystraum.bonuses-frontend; do
			/usr/bin/sudo /bin/launchctl bootout "system/$label" 2>/dev/null || true
			/usr/bin/sudo /bin/rm -f "/Library/LaunchDaemons/$label.plist"
		done
		echo "Removed stale root LaunchDaemons."
	else
		cat >&2 <<'EOF'
Stale root LaunchDaemons still present; remove them by hand (they fail-loop without TCC access):
  sudo launchctl bootout system/com.rystraum.bonuses-api
  sudo launchctl bootout system/com.rystraum.bonuses-frontend
  sudo rm /Library/LaunchDaemons/com.rystraum.bonuses-api.plist \
          /Library/LaunchDaemons/com.rystraum.bonuses-frontend.plist
EOF
	fi
fi
