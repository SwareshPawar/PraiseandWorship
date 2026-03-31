# Feature Migration Intake

Complete this before migrating features from the source repo.

## A) Source Repo Identification

- Source repo local path:
- Source repo remote URL:
- Branch/tag/commit to migrate from:
- Is source stable in production? (yes/no):

## B) Feature Prioritization

List top features to migrate first.

| Priority | Feature | Why it matters | Risk (Low/Med/High) |
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## C) Technical Stack Differences

- Frontend framework differences:
- Backend framework differences:
- Database differences:
- Auth/session differences:
- External services (email/SMS/payments/storage/etc.):

## D) Data Model Delta

- Collections/tables used by source features:
- New fields required in existing collections:
- Data migration/backfill required:
- Data retention/privacy constraints:

## E) API and Contract Delta

- New endpoints needed:
- Existing endpoint behavior changes:
- Request/response contract differences:
- Rate limits/security constraints:

## F) Environment and Secrets

List all source env vars required by the migrated features.

| Variable | Required? | Purpose | Target platform configured? |
|---|---|---|---|
|  |  |  |  |

## G) File Ownership and Constraints

- Files that must not be overwritten in this repo:
- Files safe to replace:
- Shared utility modules that should be merged carefully:

## H) Testing and Release Plan

- Local verification steps:
- Preview deployment checks:
- Production smoke tests:
- Rollback triggers and rollback method:
