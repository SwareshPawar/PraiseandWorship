# Phase 3 Fresh Runtime Parity Plan (2026-03-28)

Status: In progress
Scope: Stabilize local runtime behavior after feature parity restore, ensure production-only external loop source behavior, and clean admin UI entry points.

## 1) Objectives

- Keep localhost development fully local for app API calls.
- Prevent service worker fetch rejection noise during backend/network interruptions.
- Keep external loop library imports production-source only.
- Remove deprecated/legacy manager navigation from home admin UI.
- Ensure docs reflect actual current behavior.

## 2) Implemented Changes

### 2.1 Local API base hardening
- File: `scripts/core/api-base.js`
- Implemented:
	- Localhost runtime now resolves directly to local backend first.
	- `window.__API_BASE_URL__` remains explicit runtime override.
	- Stored `apiBaseUrl` from localStorage applies only in non-local runtime.
- Result:
	- Prevents accidental routing of local admin pages to remote backend hosts.

### 2.2 Service worker pass-through resiliency
- File: `service-worker.js`
- Implemented:
	- `simplePassThroughStrategy` returns structured `503` JSON when network and cache both fail.
	- Removed rejection propagation path that caused uncaught fetch-event warnings.
	- Cache versions bumped to `v2.5`.
- Result:
	- Browser console no longer floods with rejected promise warnings from SW fetch event failures.

### 2.3 Production-only external loop source
- Files:
	- `utils/external-loop-sources.js`
	- `api/external-loop-sources.js`
	- `server.js`
	- `loop-rhythm-manager.js`
	- `env.example`
- Implemented:
	- Source resolver default: `https://oldand-new.vercel.app`.
	- Metadata/group/import flow wired for production URL source.
- Result:
	- External loop discovery/import works without dual-local-runtime dependency.

### 2.4 Home admin UI cleanup
- File: `index.html`
- Implemented:
	- Removed legacy cards:
		- Loop Manager (Legacy)
		- Rhythm Sets Manager (Legacy)
- Result:
	- Navigation emphasizes current manager pages only.

## 3) Validation Evidence

- Diagnostics:
	- No lint/compile errors in updated files (`api-base.js`, `service-worker.js`, `index.html`, manager integration files).
- Runtime probe:
	- External source helper resolved `oldandnew` and loaded grouped metadata from production endpoint.
- Behavior check:
	- Service worker now logs fallback warning without unhandled fetch-event promise rejection.

## 4) Operational Notes

- After SW updates, run one-time reset flow:
	- Open `clear-sw.html`
	- Hard refresh (`Ctrl+F5`)
- Keep `OLDANDNEW_BASE_URL` documented and configurable for alternate production host if needed.

## 5) Remaining Phase 3 Tasks

- End-to-end localhost smoke test for:
	- `GET /api/external-loop-sources`
	- `GET /api/external-loop-sources/:sourceId`
	- `POST /api/external-loop-sources/:sourceId/import-loop`
	- `POST /api/external-loop-sources/:sourceId/import-rhythm-set`
- Confirm authenticated dataset test matrix in browser (non-empty rhythm/song collections).
- Add final sign-off snapshot to migration plan once the above matrix is complete.
