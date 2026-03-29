# Phase 2 Migration Plan - Same Branch Missing Features

Date: 2026-03-28
Status: In progress (branch/context verified once, next cycle started)
Scope: Migrate remaining missing features from the same source branch used previously, using updated project docs as reference.

Fresh restart note (2026-03-28):
- Target branch re-verified as `main`.
- Source of truth refreshed from `https://github.com/SwareshPawar/OldandNew/tree/main` (commit `180004b`) via local clone under `.migration-src/OldandNew`.

## 0.1) Fresh Migration Inventory (OldandNew main -> PraiseandWorship main)

Architecture and module adoption items:
- Adopt modular helper layer used by new admin pages:
  - `scripts/core/api-base.js`
  - `scripts/core/auth-client.js`
  - `scripts/shared/rhythm-set.js`
  - `scripts/shared/admin-page.js`
- Keep current multi-backend support (`pw_admin_backend`) while adopting modular page pattern.
- Keep current token compatibility (`pw_jwtToken`) while supporting source module token key (`jwtToken`).

Rhythm loop manager adoption items:
- Import and enable `loop-rhythm-manager.html` and `loop-rhythm-manager.js` (new unified loop + rhythm-set workspace).
- Add missing backend parity endpoints required by the page where absent:
  - `DELETE /api/rhythm-sets/:rhythmSetId/loops/:loopType`
  - `POST /api/rhythm-sets/loops/swap`
  - `POST /api/rhythm-sets/loops/assign`
  - `POST /api/rhythm-sets/loops/copy`
  - `POST /api/rhythm-sets/duplicate`

Rhythm assignment page adoption items:
- Import and enable `rhythm-mapper.html` and `rhythm-mapper.js`.
- Ensure mapper-required APIs are available and consistent:
  - `GET /api/songs`
  - `GET /api/rhythm-sets`
  - `PUT /api/songs/:id/rhythm-set` (single assign)
  - optional batch assignment endpoint parity if needed.

Backend parity items:
- Compare and port safe `server.js` deltas for rhythm loop operations first (non-breaking, high impact).
- Defer profile-learning APIs to dedicated slice after core manager pages are stable:
  - `/api/rhythm-set-profiles`
  - `/api/profile-scoring-config`

Execution priority (fresh start):
1. Import and wire pages + helper scripts.
2. Add/verify missing rhythm loop operation endpoints.
3. Run local smoke tests for loop-rhythm-manager and rhythm-mapper flows.
4. Add profile-based recommendation parity in a separate controlled slice.

## 0) Migration Status

Completed:
- Rhythm Sets Manager and Loop Manager screens have been fully renewed with a modern, modular structure:
  - Clear separation of management and assignment panels.
  - Advanced filtering, status, and admin controls.
  - Consistent, mobile-friendly UI and feedback.
- JavaScript is now split by feature (pad, UI, manager, etc.), and main logic is modularized (see main-organized.js and related files).
- Loop reading and assignment logic is no longer monolithic; each feature is in its own JS file for maintainability and clarity.
- Branch/context check completed once and verified on current target branch (`main`) with expected Phase 2 migration artifacts present.
- Stream B baseline: loop metadata moved to DB-first read path with JSON fallback.
- Stream B baseline: one-time LoopsMetadata DB seed migration completed successfully.
- Stream B baseline: metadata read path verified to resolve from database.
- Stream A calibration: recommendation weights tuned from mapped-song calibration run and applied to RecommendationWeights in DB.
- Stream A calibration artifact: migration/RECOMMENDATION_WEIGHT_CALIBRATION_2026-03-28.md generated with profile comparison and selected weights.
- Stream A continuation: manager recommendation details panel added to show source, score, confidence, reason, and top candidates from backend response (with local fallback details when backend is unavailable).
- Stream C continuation: rhythm manager alert UX now uses explicit info/success/warning/error visual states.

Started:
- Stream A implementation: backend rhythm-set recommendation scoring upgraded to weighted compatibility scoring (taal/time/tempo/genre/mood) with confidence and reason output.
- Stream A implementation: rhythm manager recommendation flow switched to backend recommendation endpoint first, with local scoring fallback.

Next:
- Review all new features and UI/UX in rhythm-sets-manager.html and loop-manager.html for migration completeness.
- Audit modular JS files for any new logic or helper functions not present in the old monolithic main.js.
- Ensure all CRUD, admin, and feedback flows are present and match the new structure.
- Update or add migration steps for any missing features or architectural changes.
- Begin implementation of any missing or improved features as per this plan.
- Stream A continuation: run second-pass calibration after expanding mapped-song sample size beyond current 10 songs to reduce overfitting risk.
- Stream C continuation: add status-based rhythm-set filtering and advanced row-editing parity items.

Started (new cycle):
- New cycle kickoff recorded after branch/context verification.
- Priority start: continue Stream C parity with status-based rhythm-set filtering implementation and verification evidence capture.
- Stream C status-filter parity completed: rhythm manager status filter wiring added and manually validated in browser (filter state + table re-render + filter change handler + info message feedback).
- Validation evidence: filter transitions confirmed for `inactive`, `archived`, and `all` with expected UI feedback text (`Showing X of Y rhythm sets...`) in manager page.
- Validation scope note: current run was in no-auth/no-data state (`0 of 0`); authenticated dataset validation remains part of Phase E matrix.
- Fresh-start kickoff implementation completed:
  - Imported source pages: `loop-rhythm-manager.html`, `loop-rhythm-manager.js`, `rhythm-mapper.html`, `rhythm-mapper.js`.
  - Imported modular helpers: `scripts/core/api-base.js`, `scripts/core/auth-client.js`, `scripts/shared/rhythm-set.js`, `scripts/shared/admin-page.js`.
  - Wired new pages in `index.html` admin manager cards while retaining legacy manager pages for rollback safety.
  - Added compatibility updates so imported modules resolve PraiseandWorship API hosts and `pw_jwtToken`.
  - Backend parity kickoff completed in `api/rhythm-sets.js`:
    - Added `POST /api/rhythm-sets/duplicate`.
    - Added `POST /api/rhythm-sets/loops/swap`.
    - Added `POST /api/rhythm-sets/:rhythmSetId/loops/assign`.
    - Added `POST /api/rhythm-sets/:rhythmSetId/loops/copy`.
    - Added `DELETE /api/rhythm-sets/:rhythmSetId/loops/:loopType`.
    - Added `DELETE /api/rhythm-sets/:rhythmSetId` with mapped-song guard and `DELETE /api/rhythm-sets/:rhythmSetId/force`.
    - Updated `PUT /api/rhythm-sets/:rhythmSetId` parity behavior:
      - preserves existing `status`/`notes` when not supplied (prevents accidental reset during note edits),
      - returns `updatedSongsCount` on rename to match imported manager UI expectations.
  - Profile-learning API parity slice completed:
    - Added `GET /api/rhythm-set-profiles` via `api/rhythm-set-profiles.js`.
    - Added `GET/PUT /api/profile-scoring-config` via `api/profile-scoring-config.js`.
    - Added `GET /api/rhythm-sets/:rhythmSetId/profile` in `api/rhythm-sets.js`.
    - Added `POST /api/rhythm-sets/:rhythmSetId/profile/recalculate` in `api/rhythm-sets.js`.
    - Added shared profile computation helper `utils/rhythm-set-profile-manager.js` and wired recalculate route to it.
  - Song preview parity fix completed (secondary metadata):
    - Restored admin Rhythm Set editor inside `secondaryMetaInfo` in `main1.js` (dropdown + save action).
    - Added backend endpoint parity `PATCH /api/songs/:id/rhythm-set` in `api/songs.js`.
    - Added missing preview CSS classes for rhythm-set editor controls in `styles.css`.
  - Backend side-effect parity for song rhythm-set changes completed in `api/songs.js`:
    - Added/ensured RhythmSets document upsert on song create/update/rhythm-set patch when assigned.
    - Added mapped-song count recompute for new and previous rhythm sets after assignment changes.
    - Added RhythmSetProfiles refresh on rhythm-set transitions (old/new) to keep profile-learning data in sync.
  - Local runtime parity fixes completed for direct smoke testing on `server.js`:
    - Added missing `PATCH /api/songs/:id/rhythm-set` route to remove local 404 during preview rhythm-set changes.
    - Added rhythm-set side-effect sync on local server path (RhythmSets ensure/recompute + profile refresh).
  - Loop loading parity/performance fixes completed:
    - Added TTL + cross-tab invalidation support to loop metadata cache in `loop-player-pad-ui.js`.
    - Added force-refresh fallback when mapped rhythm set is not found in cached metadata.
    - Added loop file replacement signal handling (`loopFilesReplacedAt`) with force reload path.
    - Made prewarm non-blocking to reduce perceived delay before controls become usable.
    - Reduced melodic sample 404 noise and startup delay by resolving sample existence from `/api/melodic-loops` inventory before fetching audio, with fallback probing only when inventory is unavailable.
  - External loop source policy finalized for this cycle:
    - External import source is production URL only (OldandNew), no sibling local-repo scan dependency.
    - Added/verified source, group, loop import, and rhythm-set import APIs for local runtime and serverless path.
  - Local runtime stabilization completed:
    - Hardened `scripts/core/api-base.js` to always prefer localhost API in local runtime.
    - Prevented stale localStorage API base values from forcing remote backend hosts while on localhost.
  - Service worker fetch resilience update completed:
    - Updated pass-through strategy to return structured 503 JSON instead of rethrowing fetch failures.
    - Bumped SW cache versions to force update and avoid stale behavior.
  - Admin home navigation cleanup completed:
    - Removed legacy manager cards from `index.html` Feature Managers section.

## 1) Source Of Truth

Primary references:
- FEATURE_PARITY_MASTER_GAP_ANALYSIS.md
- RHYTHM_SETS_MANAGER_GAPS.md
- FEATURE_MIGRATION_PLAYBOOK.md

Planning assumption:
- Source repository and branch are the same as the previous migration cycle.
- This plan targets only the currently missing or partially implemented items.

Verification note:
- Branch and migration context re-verified once on 2026-03-28 before continuing Phase 2 execution.

## 2) Missing Feature Backlog (Consolidated)

### Stream A - Recommendation Parity
- Tune recommendation scoring quality against real production-like song data.
- Complete compatibility checks not fully implemented in rhythm manager:
  - tempo compatibility
  - time-signature compatibility
  - genre/mood weighting parity
- Add transparent recommendation confidence/reason output consistency where needed.
- Ensure rhythm-set preview interactions remain the primary path for selecting and validating song-to-loop assignment.

Target files:
- rhythm-sets-manager.js
- api/rhythm-sets.js
- api/recommendation-weights.js
- main1.js

Risk: Medium

### Stream B - Write-Path Deployment Parity
- Finalize loop asset storage strategy for deployed runtime.
- Finalize serverless write behavior for upload/replace/delete flows.
- Make loop metadata DB-first (MongoDB) with safe file fallback only for resilience.
- Keep loop metadata synchronized between runtime writes and database updates.
- Ensure loop metadata updates driven by rhythm-set preview/rhythm-set-id changes propagate consistently.
- Validate deployed write operations end-to-end.
- Ensure all loop assets in this repository are rendered in UI and available for assignment to songs in both local and production environments.

Target files:
- api/loops.js
- api/melodic-loops.js
- api/_loops.js
- utils/loops.js
- server.js
- DEPLOYMENT.md

Risk: High

### Stream C - Rhythm Sets Manager Parity Enhancements
- Add enhanced stats display parity (mapped/unmapped/status breakdown).
- Upgrade alert UX from generic info messages to clear success/warning/error states.
- Implement advanced row editing and rename workflow parity where still missing.
- Add status-based rhythm-set filtering and remaining manager UX parity items.

Target files:
- rhythm-sets-manager.js
- rhythm-sets-manager.html
- styles.css
- api/rhythm-sets.js

Risk: Medium

### Stream D - Strict Function Name Parity (Audit Backlog)
- Implement wrappers or aliases for high-impact missing function names in:
  - main1.js
  - rhythm-sets-manager.js
  - backend modules (modular API first, server.js only where required)
- Re-run parity scripts until missing count reaches agreed target.

Target files:
- main1.js
- rhythm-sets-manager.js
- api/*.js (as needed)
- server.js (only if modular approach cannot cover parity requirement)

Risk: Medium

### Stream E - Validation And Release Readiness
- Cross-browser validation (Chrome, Firefox, Safari, Edge).
- Mobile and PWA workflow validation (Android Chrome, iOS Safari, install flow).
- Auth/admin/songs/setlists smoke tests in deployed environment.

Target files:
- test-api-endpoints.html
- test-vercel*.js
- test-production*.js
- deployment docs for evidence tracking

Risk: Medium

## 3) Execution Phases

## Phase A - Discovery Refresh (1 day)
Tasks:
- Confirm source branch/tag and freeze migration input.
- Re-run inventory and parity baseline against current target.
- Lock final feature list from Streams A-E.

Exit criteria:
- Approved and frozen migration scope.

## Phase B - Recommendation + Manager Core (2-3 days)
Tasks:
- Implement Stream A items in rhythm recommendation flow.
- Implement Stream C parity items that do not change backend contracts.

Exit criteria:
- Recommendation output stable and explainable.
- Manager UI parity gaps reduced and testable.

## Phase C - Write-Path Runtime Strategy (2 days)
Tasks:
- Implement Stream B storage/runtime decisions.
- Add fallback/error behavior for serverless constraints.

Exit criteria:
- Upload/replace/delete behavior defined for local and deployed runtime.
- DB-backed loop metadata is authoritative in production and local.
- Loop rendering and song assignment parity validated against repository loop assets.

## Phase D - Strict Name Parity Wrappers (1-2 days)
Tasks:
- Add minimal wrappers/aliases for agreed strict parity names.
- Keep architecture modular; avoid large monolith regressions.

Exit criteria:
- Missing function name count reaches planned threshold.

## Phase E - Validation + Hardening (2 days)
Tasks:
- Execute Stream E browser/mobile/deployment test matrix.
- Fix regressions and produce release checklist sign-off.

Exit criteria:
- All smoke tests pass and migration marked ready.

## 4) Feature Slice Checklist (Use Per PR)

For each migrated slice:
- Feature name:
- Source files:
- Target files:
- API contract impact:
- DB/schema impact:
- Env var impact:
- Rollback method:
- Verification evidence:

## 5) Recommended PR Order

1. Recommendation scoring completion (low regression risk)
2. Rhythm manager UI and stats parity
3. Write-path runtime/storage updates
4. Strict function parity wrappers
5. Validation-only PRs and documentation updates

## 6) Validation Matrix

Core functional checks:
- Song selection, assignment, recommendation, preview playback.
- Rhythm set CRUD and status filtering.
- Loop and melodic upload/replace/delete behavior.
- Auth and admin guarded operations.
- Loop metadata fetch and loop preview resolution using DB-backed metadata.
- Loop-to-song assignment flow verified using rhythm-set-id preview/update path.

Environment checks:
- Local development runtime.
- Deployed backend runtime.
- Browser matrix: Chrome, Firefox, Safari, Edge.
- Mobile matrix: Android Chrome, iOS Safari, PWA install.

## 7) Rollback Strategy

- Keep each migration slice in isolated PRs.
- Use feature flags or guarded code paths for risky write-path changes.
- For deployment runtime changes, keep previous behavior as fallback until smoke tests pass.
- Do not remove legacy path until validation is complete.

## 8) Definition Of Done

Migration is complete when:
- All Stream A-E tasks are either done or explicitly deferred with approval.
- Deployed smoke tests pass for auth, songs, setlists, admin, and write paths.
- Parity audit rerun is attached with updated missing count and rationale.
- Documentation updated with final behavior and known constraints.
