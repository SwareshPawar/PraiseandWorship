# Feature Migration Playbook

This document defines a safe process to migrate features from a source repository into this app.

## 1) Current App Baseline

Architecture in this repo:
- Frontend: static HTML/CSS/JS (`index.html`, `main-organized.js`, `styles.css`, related pages)
- API (serverless style): `api/*.js` with shared helpers (`api/_db.js`, `api/_auth.js`)
- API (monolith style): `server.js` with Express routes and MongoDB
- Shared auth logic: `utils/auth.js`
- Data store: MongoDB (`PraiseAndWorship` database)

Important migration rule:
- Prefer integrating new backend logic into `api/*.js` and shared helper modules first, then keep `server.js` aligned only if still needed.

## 2) Migration Principles

- Migrate by feature slice, not by bulk file copy.
- Keep each feature behind a clear API contract and test each contract before moving to the next feature.
- Never merge schema-changing code without migration/backfill scripts and rollback notes.
- Keep environment variable names explicit and documented before code merge.
- Preserve existing user flows while feature flags or guarded rollout are in place.

## 3) Phased Plan

## Phase A: Discovery
- Identify source repo path and branch/tag to copy from.
- Build source inventory using `tools/export-repo-inventory.ps1`.
- Fill `FEATURE_MIGRATION_INTAKE.md`.
- Rank candidate features by user value and migration risk.

Exit criteria:
- Approved top-priority feature list with owners and target release order.

## Phase B: Feature Mapping
- For each feature, map:
  - Source files (frontend/backend/scripts/config)
  - Target files in this repo
  - Data model and env var deltas
  - Dependencies and external services
- Create a migration bundle manifest (`migration-manifest.txt`) for review.

Exit criteria:
- Manifest reviewed; no unknown dependencies.

## Phase C: Controlled Import
- Copy files with `tools/build-migration-bundle.ps1` into a timestamped bundle.
- Port code in small PR-sized units.
- Add/update tests or verification scripts for each imported slice.

Exit criteria:
- Feature runs locally and on preview deployment; no regressions in existing flows.

## Phase D: Data + Config Rollout
- Apply schema migrations in dry-run mode first.
- Apply env var updates in deployment platform (Vercel/Render/etc.)
- Run smoke tests for auth, songs, setlists, and admin/user flows.

Exit criteria:
- Production-ready checklist completed.

## 4) Feature Slice Template

Use this template per feature:

- Feature name:
- User value:
- Source files:
- Target files:
- API endpoints added/changed:
- DB collections/fields changed:
- New env vars:
- Backward compatibility risks:
- Test plan:
- Rollback plan:

## 5) Suggested Initial Migration Order

1. Low-risk UI-only features (no backend changes)
2. Read-only backend features (new GET endpoints)
3. Auth-adjacent features
4. Write-path features (POST/PUT/PATCH/DELETE)
5. Data model migrations and background jobs

## 6) Command Reference

Generate source inventory:

```powershell
./tools/export-repo-inventory.ps1 -SourceRepoPath "C:\path\to\source-repo"
```

Create migration bundle from manifest:

```powershell
./tools/build-migration-bundle.ps1 -SourceRepoPath "C:\path\to\source-repo" -ManifestPath "./migration-manifest.txt"
```

Both commands produce outputs under `migration/` by default.
