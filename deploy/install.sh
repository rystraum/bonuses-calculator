#!/bin/bash
# Installs the Bonus Calculator LaunchDaemons (requires sudo).
# Idempotent: safe to re-run after editing the plists.
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")" && pwd)"

SUDO=/usr/bin/sudo
CP=/bin/cp
CHOWN=/usr/sbin/chown
CHMOD=/bin/chmod
MKDIR=/bin/mkdir
LAUNCHCTL=/bin/launchctl

"$MKDIR" -p /Users/rystraum/Library/Logs/bonuses

$SUDO $CP "$DEPLOY/com.rystraum.bonuses-api.plist" "$DEPLOY/com.rystraum.bonuses-frontend.plist" /Library/LaunchDaemons/
$SUDO $CHOWN root:wheel /Library/LaunchDaemons/com.rystraum.bonuses-api.plist /Library/LaunchDaemons/com.rystraum.bonuses-frontend.plist
$SUDO $CHMOD 644 /Library/LaunchDaemons/com.rystraum.bonuses-api.plist /Library/LaunchDaemons/com.rystraum.bonuses-frontend.plist

for label in com.rystraum.bonuses-api com.rystraum.bonuses-frontend; do
	$SUDO $LAUNCHCTL bootout "system/$label" 2>/dev/null || true
	$SUDO $LAUNCHCTL bootstrap "system" "/Library/LaunchDaemons/$label.plist"
	$SUDO $LAUNCHCTL kickstart -k "system/$label"
done

echo "Installed. Check status with:"
echo "  sudo launchctl print system/com.rystraum.bonuses-api"
echo "  sudo launchctl print system/com.rystraum.bonuses-frontend"
