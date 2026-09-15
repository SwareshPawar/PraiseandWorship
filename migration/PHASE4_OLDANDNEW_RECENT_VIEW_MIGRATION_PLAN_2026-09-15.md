# Phase 4 OldandNew Recent View Migration Plan

Date: 2026-09-15
Status: In progress; Phases 1-4 implemented and validated
Source: `https://github.com/SwareshPawar/OldandNew.git`, branch `main`
Frozen source commit: `2aee0da7ba3c3b87e30301f3d4e3467536cce225`
Target baseline: PraiseandWorship `main` at `9c4ba0c74e88aded48dac88a1d5556be614a17c5`
Review window: 2026-09-08 through 2026-09-15

## 1. Objective

Adopt the recent OldandNew mobile view and standalone musical-tool improvements in PraiseandWorship without replacing PraiseandWorship-specific data, authentication, API routing, loop metadata, naming, deployment behavior, or visual identity.

This is an incremental frontend migration. It is not a repository merge, database migration, backend replacement, or wholesale file copy.

## 2. Discovery Summary

- PraiseandWorship has no commits in the review window and its worktree was clean during discovery.
- OldandNew has one concentrated change series on 2026-09-09.
- The main reusable work is the mobile application shell, mobile catalogue controls, preview action hierarchy, setlist state presentation, suggested-song drawer presentation, and three standalone browser-audio tools.
- OldandNew implements the mobile work with vanilla HTML, CSS, and script-tag-loaded modules. It adds no frontend framework or build dependency.
- PraiseandWorship already has a newer modular CSS shell and existing mobile panel state in `main1.js`. Source behavior must be adapted to those owners instead of replacing them.
- No database schema or API contract change is required for the view migration.

## 3. Recent Source Commit Inventory

| Commit | Change | Migration decision |
| --- | --- | --- |
| `f55ee68` | Mixed mobile migration documentation and SMTP/Render work | Do not cherry-pick. Use only the mobile design record as reference. |
| `fda4414` | Initial mobile modern mode migration | Port selectively as the behavioral baseline. |
| `a27314c` | Mobile content clearance and view-state fixes | Port the final state-restoration behavior. |
| `0cf73d5` | Mixed SMTP/Render changes plus frontend edits | Exclude SMTP/backend changes; recover only UI behavior represented by later commits. |
| `3c290d5` | Mobile UI and auto-scroll control fixes | Port the final auto-scroll and mobile-control behavior. |
| `7599cc8` | Service-worker automatic update and cache management | Hold as a separate decision because PraiseandWorship intentionally disables its service worker. |
| `53d51fb` | Merge commit | No direct migration action. |
| `3dd3b7b` | Favorites rendering and responsive sidebar polish | Adapt to PraiseandWorship namespaced favorites and modular styles. |
| `b7bd695` | Suggested-song drawer styling and click-bubbling fix | Port drawer event isolation and mobile presentation. |
| `2c99ab7` | Phase 6 suggested-song drawer and mobile UI completion | Port the completed Phase 6 presentation. |
| `3ba4787` | Standalone Pads & Tanpura and Tuner tools | Port as isolated browser-only tools after shell stabilization. |
| `d59e3bc` | Tune & Pitch refinement and new Metronome tool | Port both standalone tool changes. |
| `2aee0da` | Remove sidebar tools section and improve tuner note display | Port final tuner logic; preserve the final navigation decision and do not restore the removed sidebar section. |

## 4. Final Source Behavior To Adopt

The source change tracker contains experiments that were later removed. The migration must reproduce the final source state, not intermediate implementations.

Adopt:

- Exactly three persistent mobile destinations: Home, Songs, and More.
- Song Preview remains the performance surface, not a fourth primary destination.
- A mobile Home drawer that reuses existing sidebar actions and restores the underlying view and scroll state when closed.
- Compact mobile catalogue controls for filters, sort, and explicit multi-select.
- Existing single-song setlist actions plus batch add through the target's existing setlist functions.
- Mobile preview hierarchy with active setlist context, Setlist, AUTO, More, and direct recommendation access.
- Song-level More that delegates to existing information, edit, reset transpose, delete, and rhythm/loop actions.
- Existing Global, My, and Smart setlist rendering as the only setlist renderer.
- Mobile state that explicitly distinguishes catalogue mode from setlist mode.
- Favorites and setlist selections that close Home overlay state before showing content.
- Suggested-song drawer click isolation and return to the same song context when closed.
- Standalone Pads & Tanpura, Tune & Pitch, and Metronome tools.

Do not recreate removed source experiments:

- No duplicate mobile setlist drawer or second setlist renderer.
- No reparenting of `#setlistSection` into a drawer.
- No mobile Previous/Next song layer.
- No Back to Setlist control.
- No song-position counter in preview context.
- No long-press selection.
- No replacement routing architecture.
- No simplified replacement for the existing loop player.
- No restored sidebar Tools section removed by `2aee0da`.

## 5. Target-Specific Contracts To Preserve

### Product and data

- Categories remain Praise and Worship, not New and Old.
- PraiseandWorship genres, moods, artists, taals, recommendation weights, and rhythm-set IDs remain authoritative.
- MongoDB database and collection names remain unchanged.
- Existing song, user-data, setlist, smart-setlist, loop, and recommendation API contracts remain unchanged.

### Authentication and storage

- Preserve `pw_jwtToken`, `pw_currentUser`, `pw_favorites`, `pw_selectedSetlist`, `pw_mobileLastOpenedPanel`, `pw_darkMode`, and other `pw_*` keys.
- Do not replace target auth helpers or introduce OldandNew token/storage keys as primary keys.
- Preserve current admin checks and permission-aware UI.

### Runtime and deployment

- Preserve PraiseandWorship API-base selection, including localhost, Vercel, and canonical PraiseandWorship production hosts.
- Do not copy OldandNew CORS origins, database names, URLs, SMTP settings, Gmail settings, Render settings, Twilio settings, or environment variables.
- Do not replace `server.js` as part of this migration.
- Prefer existing `api/*.js` routes if a later UI defect reveals a genuine API gap.

### Audio and loop behavior

- Preserve current `loop-player-pad.js` and `loop-player-pad-ui.js` behavior, including canonical loop naming, metadata caching, cross-tab invalidation, and force-refresh handling.
- Reuse the active loop player in Song Preview. Do not copy OldandNew's whole `loop-player-pad.js` over the target.
- Standalone tools must remain browser-only and must not write song or loop data.

### Visual identity

- Preserve PraiseandWorship's current token system and visual identity.
- Translate source layout and interaction rules into the target's existing CSS modules.
- Do not copy OldandNew's cream/olive branding or monolithic `styles.css` wholesale.

## 6. Source-To-Target File Map

| Source | Target action | Notes |
| --- | --- | --- |
| `index.html` | Patch target `index.html` | Add only mobile shell, backdrop, catalogue controls, and navigation/tool entry points. Preserve target markup, auth, admin, PWA config, and script versions. |
| `main.js` | Adapt integration in `main1.js` | Expose narrowly scoped dependencies to feature modules; retain target business logic and `pw_*` state. |
| `scripts/features/mobile-ui.js` | Add adapted module | Use target panel/setlist functions and IDs. Avoid copying source business logic. |
| `scripts/features/song-preview-ui.js` | Add adapted module or extract only mobile presentation helpers | Preserve target preview renderer additions such as rhythm-set editing and loop integration. |
| `scripts/features/setlists.js` | Do not copy initially | Target setlist logic remains in `main1.js`; expose only required functions. Reconsider extraction after parity is stable. |
| `scripts/features/smart-setlists.js` | Do not copy initially | Preserve target smart-setlist and API behavior. |
| `styles.css` | Do not replace | Put mobile shell/layout rules in `styles/mobile.css`; use `styles/components.css` and `styles/panels.css` only when ownership requires it. |
| `loop-player-pad.js` | Compare narrowly, do not replace | Port only a proven standalone-tool compatibility hook if required. |
| `pads-tanpura.html`, `pads-tanpura.js` | Add and rebrand | Isolated browser-audio page; align navigation and target tokens. |
| `tuner.html`, `tuner.js` | Add and rebrand | Keep final `2aee0da` note-display logic and microphone permission handling. |
| `metronome.html`, `metronome.js` | Add and rebrand | Isolated browser-audio page; verify scheduling and background behavior. |
| `service-worker.js` | Decision-gated | Do not add until the existing no-service-worker policy is explicitly retired and tested. |
| `server.js` | No planned change | Recent source mail/deployment edits are outside scope. |
| `manifest.json` | Optional shortcut update | Add tool shortcuts only after tool routes and icons are verified. |

## 7. Migration Phases

### Phase 0 - Baseline And Source Freeze

Work:

- Keep `2aee0da` as the immutable source reference for this cycle.
- Capture target behavior at 360px, 375px, 412px, 768px, and 1024px.
- Record Home/Songs/Preview panel state, selected setlist, filters, favorites, transpose, recommendation drawer, auto-scroll, theme, and loop playback behavior.
- Verify login/admin visibility using PraiseandWorship data and auth.

Exit criteria:

- Baseline screenshots or notes exist for mobile and desktop.
- No source change after `2aee0da` enters this cycle without a plan revision.
- Existing console errors are separated from migration regressions.

### Phase 1 - Mobile Module Boundary And Shell

Work:

- Add an adapted `scripts/features/mobile-ui.js` IIFE with one-time listener guards.
- Add target script tags in dependency order without changing the existing `main1.js` and loop-player order until dependencies are explicit.
- Add the Home, Songs, and More mobile shell to `index.html`.
- Bridge Home and Songs to the existing `.sidebar`, `.songs-section`, and `.preview-section` state.
- Preserve `pw_mobileLastOpenedPanel` and current desktop panel behavior.
- Add Home backdrop/open/close state with panel and scroll restoration.
- Hide legacy floating mobile controls only while modern mobile mode is active.

Validation:

- `node --check scripts/features/mobile-ui.js`
- `node --check main1.js`
- Fresh-load browser checks at 360px, 375px, 412px, and 1024px.
- Confirm exactly three mobile destinations, no reload during navigation, and unchanged desktop controls.

Rollback:

- Remove the mobile shell script/markup and mobile-only selectors. Existing panel controls remain authoritative.

### Phase 2 - Catalogue Controls And Multi-Select

Work:

- Add compact Filters, Sort, and Select controls using existing target filter elements.
- Decorate existing song rows with mobile selection controls through a guarded observer.
- Keep Praise/Worship tabs and target filters; do not introduce New/Old assumptions.
- Batch-add selected IDs by calling the existing `addToSpecificSetlist()` path directly, including songs filtered out of the current DOM.
- Keep existing single-song add/remove behavior and permissions.
- Prevent observer loops by mutating row labels/classes only when values change.

Validation:

- Search, category tabs, key, genre, mood, artist, sort, and favorites at 360px and 412px.
- Select visible songs, change a filter, then batch-add the still-selected IDs.
- Reverse test mutations after verification.
- Confirm desktop catalogue markup and behavior at 1024px are unchanged.

Rollback:

- Remove the mobile catalogue toolbar and row decoration. Existing song rendering and single-add behavior remain intact.

### Phase 1 Implementation Record - 2026-09-15

Implemented:

- Added `scripts/features/mobile-ui.js` with guarded initialization, Home/Songs/More destination state, Home drawer lifecycle, overlay restoration, and `pw_mobileLastOpenedPanel` compatibility.
- Added the three-destination mobile shell, Home backdrop, and accessible close control to `index.html`.
- Added mobile-only shell, drawer, safe-area, focus, notification, and legacy-control isolation rules to `styles/mobile.css`.
- Kept `main1.js`, backend routes, database behavior, auth behavior, loop players, and service-worker policy unchanged.

Validation evidence:

- `node --check scripts/features/mobile-ui.js` passed.
- Workspace diagnostics reported no errors in the changed HTML, CSS, or JavaScript.
- `git -c core.whitespace=cr-at-eol diff --check` passed. The override is required because this checkout stores `index.html` as CRLF without repository-level `cr-at-eol` configuration.
- Browser checks passed at 375px for exactly three destinations, Home/Songs switching, remembered Home and Songs states across reload, Home overlay open/close, restored destination highlighting, More activation, and no horizontal overflow.
- Browser checks passed at 1024px for mobile-shell isolation and no horizontal overflow.
- Visual snapshots confirmed the 375px Songs shell, the 330px Home drawer with the close control contained in its header, and the unchanged desktop-only presentation boundary.

Environment note:

- Port `3001` was occupied by another process, so this workspace was served on `http://localhost:3002` for presentation testing.
- The existing frontend API base still points to `http://localhost:3001`; authenticated/data-backed testing on `3002` therefore produced expected cross-port CORS failures and remains part of the Phase 2 authenticated validation.

### Phase 2 Implementation Record - 2026-09-15

Implemented:

- Added compact mobile Filters, Sort, and explicit Select controls to the existing Songs sticky header.
- Reused the existing search and key, genre, mood, artist, and sort controls inside a mobile filter sheet.
- Added idempotent Praise/Worship row decoration with stable `data-song-id` selection state and one-time checkbox listeners.
- Added a contextual selection bar that targets the currently selected prefixed My or Global setlist value and treats Smart Setlists as read-only.
- Added a narrow `window.PraiseWorshipMobileDeps` adapter for the existing `addToSpecificSetlist()` and `showNotification()` functions.
- Kept existing catalogue rendering, filter algorithms, single-song actions, permissions, APIs, and database contracts unchanged.
- Applied the final source-approved automatic mobile panel width `min(88vw, 360px)` instead of legacy saved percentage widths.

Validation evidence:

- `node --check scripts/features/mobile-ui.js` and `node --check main1.js` passed.
- Workspace diagnostics reported no errors in the changed HTML, CSS, or JavaScript.
- `git -c core.whitespace=cr-at-eol diff --check` passed.
- Authenticated browser validation loaded 187 Praise catalogue rows; every row received exactly one selection control and no duplicate controls were created after rerenders.
- Two selected song IDs survived being filtered out and restored, returned checked after rerender, and retained the correct `2 songs selected` summary.
- A non-mutating adapter interception confirmed batch add submitted the exact selected numeric IDs with the real prefixed My Setlist value, then exited Select mode and cleared checkboxes. No database data was changed during this test.
- Mobile A-Z sorting produced an ordered title sequence through the existing sort handler.
- Filter sheet, backdrop, selection bar, selected-row state, and control text passed at 360px, 375px, and 412px without horizontal or control overflow.
- Computed Songs panel widths matched the intended responsive values: 316.8px at 360px, 330px at 375px, and 360px at 412px.
- At 1024px, catalogue controls, selection bar, and row checkboxes remained hidden and no horizontal overflow was present.
- Visual snapshots confirmed the corrected 375px filter sheet and contextual selection mode.

### Phase 3 - Mobile Preview, More, Auto-Scroll, And Suggestions

Work:

- Adapt the source mobile presentation helpers into `scripts/features/song-preview-ui.js` or a small target-owned mobile preview module.
- Keep `main1.js` as owner of target song rendering, transpose, recommendation, rhythm-set editing, and loop initialization.
- Add compact active-setlist context to the preview.
- Add the Setlist, AUTO, and More action row.
- Delegate AUTO to the existing auto-scroll state and show it exactly once on mobile.
- Delegate the recommendation control to the existing `#suggestedSongsDrawer` lifecycle.
- Add Song Information, Edit, Reset Transpose, permission-aware Delete, and Rhythm/Loop to Song-level More by triggering existing controls.
- Apply `stopPropagation()` only at drawer/menu boundaries where source regressions proved it necessary.

Validation:

- Open preview from catalogue, Favorites, Global Setlist, My Setlist, Smart Setlist, and a suggestion.
- Confirm current song, transpose, rhythm-set editor, loop player, recommendation context, and scroll state survive drawer/menu transitions.
- Confirm AUTO starts, pauses, stops at the end, and does not duplicate the existing control.
- Confirm non-admin users never receive admin-only actions.
- Confirm target desktop preview remains unchanged at 1024px.

Rollback:

- Remove mobile preview controls and styles; existing desktop/mobile preview controls remain available.

### Phase 3 Loading Stabilization - 2026-09-15

Regression:

- Song loading could remain visibly active indefinitely during the mobile preview migration.
- This matched the source migration's post-Phase 2B stabilization work around asynchronously injected loading overlays and mutation-driven row decoration.

Root causes and fixes:

- `hideLoading()` previously handled only the first `#loadingOverlay`. It now applies the source-proven cleanup to every matching overlay, adds the hidden class, forces `display: none !important`, and sets `aria-hidden="true"`.
- Mobile catalogue decoration now changes `mobile-selected` only when the row's current class state differs from the intended state.
- Mobile preview panel protection now adds/removes observed classes only when their state actually differs, preventing redundant observer work.
- The preview panel observer previously ran its protection logic even when no `.song-preview-container` existed. During mobile setlist initialization it called `closeHomeDrawer(false)`, mutated the same observed sidebar classes, and could continuously retrigger itself while the last painted progress message remained `Loading setlists...`.
- Preview protection now returns immediately unless an actual rendered song preview exists. Drawer cleanup and layout writes are also conditional, so an external panel mutation settles instead of feeding back into the observer.
- Script cache keys were bumped to `main1.js?v=20260915-2`, `mobile-ui.js?v=20260915-4`, and `song-preview-ui.js?v=20260915-4` so mobile clients do not retain the looping implementation.

Validation evidence:

- Fresh load at `http://localhost:3001/#song-434` progressed from the visible loading state to `100% / Ready!` without waiting for the 30-second safety timeout.
- The resulting loader was hidden with `display: none`, class `hide`, and `aria-hidden="true"`.
- The page contained one loader, 402 loaded songs, 187 rendered Praise rows, and 187 mobile row controls.
- DOM stability sampling over five seconds remained exactly at 4,271 nodes with no row/control growth, showing that the observers had settled rather than looping.
- A clean authenticated 375px run with the final asset versions advanced from `Loading setlists... 75%` to `Ready! 100%` in the next 400ms sample, then remained stable at 6,870 nodes for all subsequent samples.
- A second 375px reload repeated the successful completion with 414 rendered song rows, 402 catalogue selection controls, a hidden loader, and responsive Songs navigation.
- Syntax checks passed for `main1.js`, `scripts/features/mobile-ui.js`, and `scripts/features/song-preview-ui.js`.
- Full Phase 3 catalogue/Favorites/setlist/suggestion preview validation remains pending after this blocker fix.

### Phase 3 Implementation Record - 2026-09-15

Implemented:

- Added `scripts/features/song-preview-ui.js` as a presentation-only decorator around the authoritative `main1.js` preview renderer.
- Added mobile active-setlist context, recommendation access, Setlist/AUTO/More actions, and a Song-level More menu.
- Delegated Song Information, Edit Song, Reset Transpose, permission-aware Delete Song, Rhythm/Loop, setlist toggle, auto-scroll, and recommendations to existing target controls.
- Preserved the target rhythm-set editor, recommendation algorithm, transpose persistence, loop player, permissions, and desktop action row.
- Added explicit content-navigation authorization so All Songs, Favorites, Global, My, and Smart setlist actions can leave an active preview without being hidden again by preview protection.

Validation evidence:

- Preview actions successfully delegated to existing controls: Information expanded metadata, AUTO mirrored start/stop state, Reset returned transpose from `+1` to `0`, and recommendations populated with real song results.
- My, Global, and Smart setlist previews showed the correct active setlist context with exactly one mobile preview layer and no stale backdrop.
- Favorites opened its existing view with the Songs panel visible and no stale Home overlay; the current authenticated account had zero favorites, so a favorite-song preview was not available for this pass.
- Recommendation selection replaced the current song, rebuilt exactly one mobile preview layer, closed the recommendation drawer, and retained the expected preview integrations.
- At 360px, 375px, and 412px, mobile preview actions and context were visible with no action or page overflow.
- At 1024px, all mobile preview controls were hidden, the original desktop action row remained visible, and no horizontal overflow was present.
- No destructive edit, delete, setlist, rhythm assignment, or database action was performed during validation.

### Phase 4 - Setlist, Favorites, And Overlay State Stabilization

Work:

- Add an explicit mobile Songs-panel presentation state for catalogue versus setlist content.
- Keep target `#setlistSection` in its current parent and use it as the sole renderer.
- Close Home overlay state in capture phase before All Songs, Favorites, or setlist handlers display content.
- Preserve target Global, My, and Smart setlist functions, ordering, add/remove, edit/delete, refresh, and permission behavior.
- Ensure closing any overlay returns to the exact underlying panel without dimming, stale backdrops, or duplicate clicks.

Validation:

- Exercise All Songs -> Favorites -> My -> All Songs -> Global -> All Songs -> Smart.
- Open a song from every mode and verify Preview is immediately interactive with no stale backdrop.
- Confirm setlist selection does not create a second renderer or move `#setlistSection`.
- Confirm target `pw_selectedSetlist` restoration after reload.

Rollback:

- Remove only the derived mobile presentation class and capture-phase close hooks. Existing setlist renderers stay untouched.

### Phase 4 Implementation Record - 2026-09-15

Implemented:

- Added an explicit `.mobile-setlist-mode` presentation state owned by the existing All Songs, Favorites, and `openSetlistInMainSection()` transitions.
- Kept `#setlistSection` in its original `.songs-section` parent as the sole Global/My/Smart renderer.
- Hid only the catalogue sticky header while mobile setlist mode is active; desktop presentation remains unchanged.
- Added content-navigation authorization so active-preview protection permits All Songs, Favorites, and setlist navigation.
- Added one shared cancellation state for both saved-setlist restoration paths, preventing late asynchronous dropdown population from overriding an explicit All Songs or Favorites choice.

Validation evidence:

- All Songs -> My -> All Songs -> Global -> All Songs -> Smart -> All Songs produced the expected catalogue/setlist state, header visibility, and original `#setlistSection` presentation at 375px.
- Favorites cleared setlist mode, displayed the existing Favorites section, kept Songs visible, and left no stale Home backdrop.
- My, Global, and Smart song selection opened Preview immediately with the correct context and one mobile preview layer.
- A saved My Setlist restored normally after reload when the user did not override it.
- An explicit All Songs choice remained in catalogue mode after a 1.5-second settle window despite late asynchronous setlist rendering.
- At 1024px, the original sticky header and setlist section remained visible as appropriate, the mobile shell remained hidden, and no horizontal overflow appeared.
- No duplicate setlist renderer, drawer reparenting, Previous/Next layer, Back to Setlist control, or database mutation was introduced.

### Phase 5 - Standalone Musical Tools

Implement as three small slices so microphone/audio failures do not block the core mobile migration.

#### 5A. Pads & Tanpura

- Add and rebrand `pads-tanpura.html` and `pads-tanpura.js`.
- Use browser Web Audio only and require a user gesture before playback.
- Stop/disconnect audio on page hide and unload.
- Keep this page independent from song loop metadata and database APIs.

#### 5B. Tune & Pitch

- Add and rebrand `tuner.html` and `tuner.js` from final source HEAD.
- Preserve the final note-display correction from `2aee0da`.
- Handle unsupported browsers, denied microphone permission, silence, unstable pitch, and stream cleanup.
- Require HTTPS or localhost for microphone access.

#### 5C. Metronome

- Add and rebrand `metronome.html` and `metronome.js`.
- Preserve tempo limits, start/stop, accent, and tap-tempo behavior present in source.
- Verify timing after background/foreground transitions and stop audio on page hide.

Integration:

- Add tool access to the final source-approved mobile location without restoring the removed sidebar Tools section.
- Add consistent Back/Home navigation on each standalone page.
- Reuse target tokens and icons; add no server endpoint.

Validation:

- Desktop and mobile layout checks for each page.
- Real-device audio unlock checks on iOS Safari and Android Chrome.
- Microphone permission allow/deny/retry checks for Tune & Pitch.
- Confirm no tool modifies local song, setlist, user, or loop state.

Rollback:

- Remove tool navigation links and standalone files independently per tool.

### Phase 6 - Service Worker Decision Gate

Current target behavior intentionally unregisters service workers and clears PraiseandWorship caches in `main1.js`. OldandNew's `7599cc8` takes the opposite approach. This phase requires an explicit decision before implementation.

Option A, recommended for this migration:

- Keep the service worker disabled.
- Ship the mobile view and tools without offline caching changes.

Option B, separate follow-up:

- Port the source update lifecycle into a PraiseandWorship-specific `service-worker.js`.
- Use a new target-owned cache namespace and version.
- Exclude API/auth requests and mutable loop metadata from stale-first caching.
- Define update notification, `skipWaiting`, cache cleanup, and rollback behavior.
- Remove the unregister/clear policy from `main1.js` only after offline and update tests pass.

Required Option B validation:

- First install, reload, offline shell, online recovery, new-version activation, stale-cache eviction, logout/login, loop metadata refresh, and failed-network behavior.
- iOS Safari/PWA and Android Chrome/PWA checks.
- Confirm a bad worker can be retired without manual user intervention.

### Phase 7 - Release Verification

Functional matrix:

- Anonymous, authenticated user, and admin.
- All Songs, Favorites, Praise/Worship tabs, search, all filters, and sort.
- Single add/remove and multi-add for My and Global setlists with current permission rules.
- Global, My, and Smart setlist display and mutation flows.
- Preview, recommendation selection, transpose, auto-scroll, rhythm-set editing, and loop playback.
- Home/Songs/More transitions and overlay restoration.
- Pads & Tanpura, Tune & Pitch, and Metronome.
- Light and dark themes.

Responsive matrix:

- 360px, 375px, and 412px phones.
- 768px boundary.
- 1024px and 1440px desktop.
- Portrait and landscape where audio controls are visible.

Automated/static checks:

- `node --check` for every changed JavaScript file.
- Workspace diagnostics for every changed HTML, CSS, and JavaScript file.
- `git diff --check`.
- Playwright screenshots for the main states at mobile and desktop widths.
- Playwright assertions for one-time listener behavior, overlay closure, visible destinations, and no horizontal overflow.

Release criteria:

- No new syntax, console, or runtime errors.
- No horizontal overflow or overlapping controls at tested widths.
- Exactly three persistent mobile destinations.
- Desktop behavior and presentation remain unchanged except approved tool links.
- No API, schema, auth, or database change was introduced for presentation.
- All target-specific storage keys and production hosts remain intact.

## 8. Risk Register

| Risk | Level | Control |
| --- | --- | --- |
| Source `main.js` behavior overwrites target `main1.js` enhancements | High | Port through narrow dependency adapters; never replace the file. |
| Source monolithic CSS overrides target modular shell | High | Add mobile-scoped rules to existing CSS modules and test desktop after every slice. |
| Duplicate listeners or mutation-observer loops freeze the page | High | One-time binding markers, idempotent row decoration, and repeated-click tests. |
| Stale Home/drawer backdrop blocks Preview | High | Central close lifecycle invoked before content handlers; assert no open backdrop after navigation. |
| Setlist renderer duplication corrupts state | High | Never reparent or clone `#setlistSection`; derive presentation from existing state only. |
| OldandNew token/API/database assumptions leak into target | High | Audit all copied strings for `jwtToken`, OldandNew URLs, database names, categories, and storage keys. |
| Service worker reintroduces stale assets | High | Keep disabled by default; handle only in the decision-gated phase. |
| Browser audio does not unlock or clean up on mobile | Medium | Start from user gesture, handle visibility/unload, and test on real iOS/Android devices. |
| Tuner microphone permission or note detection is unreliable | Medium | Explicit permission/error states, silence threshold, final source detector logic, and real-device tests. |
| Source screenshots pass with OldandNew data but fail with PraiseandWorship content | Medium | Validate with long PraiseandWorship titles, categories, setlist names, and real target data. |

## 9. Initial Import Manifest

Create/adapt in the first implementation cycle:

- `scripts/features/mobile-ui.js`
- `scripts/features/song-preview-ui.js` only when Phase 3 begins
- `pads-tanpura.html`
- `pads-tanpura.js`
- `tuner.html`
- `tuner.js`
- `metronome.html`
- `metronome.js`

Patch incrementally:

- `index.html`
- `main1.js`
- `styles/mobile.css`
- `styles/components.css` only for shared tool components
- `styles/panels.css` only for panel-owned presentation
- `manifest.json` only after tool navigation is stable

Do not import in this cycle:

- OldandNew `server.js`
- OldandNew `styles.css` as a file
- OldandNew `main.js` as a file
- OldandNew SMTP, Render, auth, CORS, database, or deployment configuration
- OldandNew migration scripts or mobile migration documentation bundle
- OldandNew `service-worker.js` until Phase 6 Option B is approved

## 10. Recommended First Adoption Slice

Begin with Phase 1 only:

1. Add the mobile module boundary and three-destination shell.
2. Reuse existing target panel functions and `pw_mobileLastOpenedPanel` state.
3. Add only mobile-scoped CSS in `styles/mobile.css`.
4. Run syntax checks and browser checks at 360px, 412px, and 1024px.
5. Correct shell/state regressions before adding catalogue, preview, or tool behavior.

This first slice has no backend, database, auth, setlist mutation, audio, or service-worker change and is the cheapest way to verify that the source mobile architecture fits the current PraiseandWorship shell.