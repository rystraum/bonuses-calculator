# Build & Deploy Gotchas

## Frontend must be built with `VITE_API_BASE`

**Symptom:** UI loads but every API call fails with
`localhost:4000/api/... ERR_CONNECTION_REFUSED` — even on the deployed site.

**Cause:** `src/lib/store.tsx` reads `import.meta.env.VITE_API_BASE` at **build
time** and falls back to `http://localhost:4000/api`. A plain `npm run build`
silently bakes the dev fallback into the bundle. This is exactly what
`deploy.sh`'s guard (`grep VITE_API_BASE dist/assets/index-*.js`) exists to catch.

**Rule:** never build for deploy outside `deploy.sh`. If you must:

```bash
cd bonus_calculator_frontend
VITE_API_BASE="https://bonuses-api.rystraum.com/api" npm run build
```

`.env.production` also pins the prod URL as a backstop for bare `npm run build`,
but the explicit env var remains the source of truth.

## Verify after any rebuild

```bash
grep -l "bonuses-api.rystraum.com" dist/assets/index-*.js   # must match
grep -l "localhost:4000" dist/assets/index-*.js             # must NOT match
```

`vite preview` serves straight from `dist/`, so a rebuild is live immediately —
no restart needed. Users may need a hard refresh (⌘⇧R) to pick up the new bundle.
