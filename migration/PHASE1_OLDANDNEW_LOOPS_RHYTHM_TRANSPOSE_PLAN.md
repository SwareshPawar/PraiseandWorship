# Phase 1 Plan: OldandNew -> PraiseandWorship (Loops, Rhythms, Chords Transpose)

## Goal
Migrate three feature areas from `OldandNew` into this repo without breaking current auth, songs, or setlist flows:
- Loop playback + loop management
- Rhythm set mapping/recommendation
- Chord transpose behavior improvements

## Current Status
- Slice 1: Completed in `main1.js` only (as requested), including context-aware transpose precedence and opening-context propagation.
- Slice 2: Read-only APIs implemented and wired in `vercel.json`:
  - `api/loops-metadata.js`
  - `api/rhythm-sets.js`
  - `api/melodic-loops.js`
  - `api/song-metadata.js` (compatibility endpoint for manager UI metadata hydration)
- Slice 3: Manager UI integration started and wired from admin panel:
  - `loop-manager.html` + `loop-manager.js` (read-only)
  - `rhythm-sets-manager.html` + `rhythm-sets-manager.js` (read-only)
  - `melodic-loops-manager.html` + `melodic-loops-manager.js` (read-only)
  - Admin modal now includes a `Feature Managers` tab to launch these pages.
- Slice 4: Write APIs and manager write actions implemented:
  - `api/loops.js` added for loop upload-single, replace, and delete.
  - `api/melodic-loops.js` expanded to support upload, replace, and delete.
  - `api/rhythm-sets.js` expanded with create, update/rename, recompute, and recommend.
  - Manager pages now include admin write controls for these operations.
  - Runtime guard: write operations return `501` on serverless runtimes (`VERCEL`/Lambda).
- Validation: static checks pass; handler-level smoke tests pass for metadata endpoints.
- Environment note: `api/rhythm-sets.js` requires `MONGODB_URI` to return data; without it, the endpoint returns server error as expected.

## Source Artifacts Already Collected
- Curated manifest: `migration-manifest-oldandnew-loops-rhythm-transpose.txt`
- Bundle report: `migration/bundle-OldandNew-20260309-161630/copy-report.md`
- Source bundle: `migration/bundle-OldandNew-20260309-161630/source-files`
- Source inventory: `migration/inventory-OldandNew-20260309-161427`

Bundle snapshot:
- Copied entries: 100 (report count)
- Effective files present: 99
- WAV assets: 75

## Important Architecture Note
- Source feature backend is implemented mostly in `source-files/server.js`.
- Target repo uses serverless routes in `api/*.js` plus some legacy `server.js` usage.
- Migration should port backend features into dedicated `api/*.js` endpoints first, then keep `server.js` aligned only as needed.

## Phase 1 Execution Slices

### Slice 1: Chord Transpose Logic (Lowest Risk)
Source references:
- `migration/bundle-OldandNew-20260309-161630/source-files/main.js`
- `migration/bundle-OldandNew-20260309-161630/source-files/test-transpose-priority.html`
- `migration/bundle-OldandNew-20260309-161630/source-files/CHORD_ACCIDENTAL_NORMALIZATION.md`

Target integration points:
- `main1.js`
- `index.html`

Tasks:
1. Extract transpose/chord normalization helpers from source `main.js`.
2. Merge into target `main1.js` behind current UI flow.
3. Validate per-song transpose vs global transpose priority behavior.

Execution note:
- Start Slice 2 only after Slice 1 is validated.

Exit checks:
- No regressions in current song rendering.
- Existing transpose values in user data still apply.

### Slice 2: Read-Only Loop/Rhythm APIs
Source references:
- `migration/bundle-OldandNew-20260309-161630/source-files/server.js`
- `migration/bundle-OldandNew-20260309-161630/source-files/loops/loops-metadata.json`

Target new API routes (proposed):
- `api/loops-metadata.js` -> GET metadata
- `api/rhythm-sets.js` -> GET rhythm sets summary
- `api/melodic-loops.js` -> GET melodic loop listing

Tasks:
1. Port read-only route logic from source `server.js` into separate `api/*.js` handlers.
2. Reuse target auth/db helpers (`api/_auth.js`, `api/_db.js`) where auth is required.
3. Keep responses backward compatible with source manager UIs.

Exit checks:
- `GET` endpoints return valid JSON in local and deployed env.
- No write/delete behavior yet.

### Slice 3: Loop and Rhythm Management UIs
Source references:
- `migration/bundle-OldandNew-20260309-161630/source-files/loop-manager.html`
- `migration/bundle-OldandNew-20260309-161630/source-files/loop-manager.js`
- `migration/bundle-OldandNew-20260309-161630/source-files/rhythm-sets-manager.html`
- `migration/bundle-OldandNew-20260309-161630/source-files/rhythm-sets-manager.js`
- `migration/bundle-OldandNew-20260309-161630/source-files/melodic-loops-manager.html`
- `migration/bundle-OldandNew-20260309-161630/source-files/melodic-loops-manager.js`

Tasks:
1. Add manager pages to target app navigation in admin-only area.
2. Update API base URL strategy to match target deployment config.
3. Ensure JWT auth handling aligns with target token storage.

Exit checks:
- Admin can open each manager page.
- Read-only data loads from target APIs.

### Slice 4: Write APIs and File Uploads (Higher Risk)
Source references:
- Write/upload endpoints in `migration/bundle-OldandNew-20260309-161630/source-files/server.js`
- Assets in `migration/bundle-OldandNew-20260309-161630/source-files/loops`

Tasks:
1. Implement upload/replace/delete APIs in target architecture.
2. Decide persistent storage strategy for loop assets (repo assets vs object storage).
3. Add role checks for admin-only writes.

Exit checks:
- Upload and replacement flow works end-to-end.
- Deployed environment handles storage constraints.

## Environment Variables to Confirm for This Feature Set
From source inventory, likely relevant:
- `MONGODB_URI`
- `JWT_SECRET`
- `NODE_ENV`
- `PORT`
- `VERCEL`
- `TWILIO_*` and `EMAIL_*` only if password reset/auth paths are reused from source

## Data/Asset Strategy
- Source loop metadata file: `loops/loops-metadata.json`
- Source loop assets copied under bundle `source-files/loops/**`
- Keep source assets in migration bundle until write APIs and hosting strategy are finalized.

## Risks and Controls
- Risk: backend route mismatch (Express monolith vs serverless routes).
  Control: port in slices to dedicated `api/*.js` files.
- Risk: large audio assets in deployment.
  Control: validate hosting limits before enabling uploads in production.
- Risk: auth token handling differences.
  Control: keep target auth helper usage as source of truth.

## Ready-to-Run Commands
Generate inventory (already done once):
```powershell
./tools/export-repo-inventory.ps1 -SourceRepoPath "C:\Users\SwaResH\Documents\REPOS\OldandNew"
```

Build curated bundle (already done once):
```powershell
./tools/build-migration-bundle.ps1 -SourceRepoPath "C:\Users\SwaResH\Documents\REPOS\OldandNew" -ManifestPath "./migration-manifest-oldandnew-loops-rhythm-transpose.txt"
```
