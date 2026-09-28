# Launchd & TCC Ops Notes

## Why the services live in user LaunchAgents, not LaunchDaemons

`/Volumes/Code` is an **external USB APFS volume**. macOS TCC protects removable
volumes per-app, and launchd-spawned processes get no grant — so any daemon or
agent running `bash` against that volume fails with `Operation not permitted`
(EPERM), respawn-looping forever. Terminal works because it holds the grant.

- Jobs run as `gui/$(id -u)` LaunchAgents (`~/Library/LaunchAgents/`), which
  start at login and die at logout.
- Consequence: the machine must be **logged in** (and the USB volume mounted)
  for the app to serve.

## The TCC workaround: `~/bin/launchd-bash`

The grant is attached to the executable launchd spawns. The plists therefore
spawn a tiny wrapper (`deploy/launchd-bash.c`, compiled to `~/bin/launchd-bash`)
that just `exec`s `/bin/bash`, and **that wrapper holds Full Disk Access**.
Children (migrations, Phoenix/BEAM, node) inherit the grant.

Gotchas learned the hard way:

- A **copy of `/bin/bash` does not work** — macOS kills it (SIGKILL) because a
  copied platform binary loses its status. Compile the wrapper instead
  (`clang -O2 -o ~/bin/launchd-bash deploy/launchd-bash.c`).
- If the wrapper is ever rebuilt/replaced, its TCC grant follows the
  file (path + cdhash) — you may need to re-add it in
  System Settings → Privacy & Security → Full Disk Access.
- `UserName` is invalid in LaunchAgents (plist refused); root LaunchDaemons
  can't receive user TCC grants at all.

## Housekeeping

- Stale `/Library/LaunchDaemons/com.rystraum.bonuses-*.plist` files must be
  removed (`sudo`) or they fail-loop and spam the shared logs —
  `deploy/install.sh` does this automatically on re-run.
- `launchctl bootout` is async: re-`bootstrap` immediately after can fail with a
  transient EIO. `install.sh` sleeps + retries.
- Check health: `launchctl print gui/$(id -u)/com.rystraum.bonuses-api | grep
  state`, logs in `~/Library/Logs/bonuses/`. Note the API returns 404 on `/` and
  401 on `/api/*` unauthenticated — both mean "up", not "down".
