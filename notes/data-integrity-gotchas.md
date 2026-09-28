# Data Integrity Gotchas

## Finalize-time snapshots must REPLACE, not append

**Symptom:** a finalized distribution's dividends are exactly doubled — every
shareholder appears twice and total shares are 2× (e.g. 7,880 instead of
3,940).

**Cause:** the seed import (`seed_import.ex`) writes `distribution_shareholders`
snapshot rows for imported **drafts** (the import spec carries per-distribution
shareholder lists). When that draft is later finalized,
`snapshot_shareholders/1` used to insert a fresh frozen set **on top of** the
import-written rows. The live computation (`Calculator.compute/2`) prefers
snapshot rows whenever any exist, so it saw both sets.

**Fix (applied 2026-09-28):** `snapshot_shareholders/1` now
`Repo.delete_all`s existing rows for the distribution before inserting.
Any future snapshot writer must do the same.

**Rule of thumb:** rows in `distribution_shareholders` (and any other
snapshot table) are owned by *two* writers — import and finalize — so every
writer must be idempotent per distribution.

## deploy.sh restarts bypass launchd supervision

`deploy/deploy.sh backend` kills the beam and restarts it with bare `nohup`.
That leaves the API running **outside** the launchd job's `KeepAlive` (the
job records a clean exit 0 and stays idle). After any deploy, put the service
back under supervision:

```bash
launchctl kickstart -k "gui/$(id -u)/com.rystraum.bonuses-api"
```

Otherwise a crash won't self-heal until the next login.
