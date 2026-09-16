# Plan: Make Metronome / Pads & Tanpura / Tuner Work As In-App Tabs

## 1. Problem Statement

Today `tuner.html`, `pads-tanpura.html`, and `metronome.html` are **separate HTML documents**. Navigating to them from the app (or back to Home/Songs/Setlist from them) is a full browser navigation:

- `scripts/features/tool-page-nav.js` → `navigateToApp()` sets a couple of `localStorage`/`sessionStorage` flags and does `window.location.href = 'index.html'`.
- The tool pages' own nav buttons (`data-app-destination="home|songs|setlist"`) do the same full navigation back into `index.html`.

Every hop between a tool page and the main app is a **full page reload**: `index.html` re-parses, `main1.js` (13.9k lines / ~640KB) re-executes from scratch, songs/setlists are re-rendered from cache, and any in-progress audio (metronome ticking, pads/tanpura drone) is hard-stopped because the page unloads.

Goal: make these three tools feel like **tabs inside the same running app** — instant switch, no reload, and (stretch goal) audio from Pads/Metronome could keep playing while you browse Songs/Setlist.

## 2. Why This Is Feasible (good news)

Audited the current code and there are no fundamental blockers:

- **Tool scripts are small and self-contained**: `metronome.js` (107 lines), `pads-tanpura.js` (82 lines), `tuner.js` (185 lines). Each is an IIFE that only touches its own DOM ids and sets up listeners on `DOMContentLoaded`.
- **No CSS collisions**: grepped `styles.css` + `styles/*.css` for `.tool-card`, `.tool-button`, `.tool-select`, `.tool-info` — only defined in `styles/tool-pages.css`. Safe to load alongside the main app styles.
- **`main1.js` already has a client-side history pattern**: it uses `history.pushState`/`replaceState` + a `popstate` listener for song deep-linking (`#song-<id>`), so extending this pattern to tool tabs is consistent with existing conventions, not a new paradigm.
- **Audio is already lazy-initialized**: `AudioContext` is only created on first user interaction (Start/Play tap) in all three tools, and each has `pagehide`/`visibilitychange` cleanup already. This makes them safe to mount ahead of time without side effects.
- **One real conflict found**: `pads-tanpura.js` declares `const API_BASE_URL = window.AppApiBase ? ... : window.location.origin;` at top level. `main1.js` also declares `let API_BASE_URL = ...`. Loaded together in one document, this throws `SyntaxError: Identifier 'API_BASE_URL' has already been declared` and breaks the whole page. This must be fixed as part of the migration (rename/remove the duplicate declaration in `pads-tanpura.js`).

## 3. Recommended Approach

**In-page "tool views" pattern** (no iframes, no separate bundler/router library):

1. Move the *inner content* of each tool page (everything inside `<main class="tool-page-container">…</main>`, plus the header title/subtitle) into `index.html` as hidden `<section class="tool-view" id="toolView-metronome" data-tool-view="metronome" hidden>` blocks — one per tool.
2. Load `metronome.js`, `pads-tanpura.js`, `tuner.js` (and `tool-pages.css`) once, globally, inside `index.html`, same as `main1.js`/`mobile-ui.js` already are.
3. Add a small new controller, `scripts/features/tool-views.js`, responsible for:
   - Showing/hiding the requested tool view and hiding the normal app panels (home/songs/setlist/preview) while a tool view is active — mirrors the existing "one panel visible at a time" logic in `mobile-ui.js`.
   - Updating the bottom nav / "More" menu active states.
   - Pushing/popping browser history state (`history.pushState({ tool: 'metronome' }, ...)`) so the Back button returns to the previous app view instead of leaving the SPA — following the same `popstate` pattern `main1.js` already uses for songs.
   - Calling each tool's own stop/cleanup function (already exist: `metronome`'s `stop()`, `pads-tanpura`'s `stopAudio()`, `tuner`'s `cleanup()`) whenever the user navigates away from that tool view, not just on page unload.
4. Keep `tuner.html` / `pads-tanpura.html` / `metronome.html` as **thin redirect stubs** (e.g. `location.replace('index.html?tool=metronome')`) so old bookmarks, the PWA `manifest.json` shortcuts, and any shared links keep working — they just immediately hand off into the SPA instead of rendering a full standalone page.
5. `index.html` reads `?tool=metronome|pads|tuner` (or a `#tool=...` hash, consistent with the existing `#song-<id>` pattern) on load and activates that tab automatically after the app has initialized.

This avoids a bigger rewrite (no need for iframes, no need to convert `main1.js` into a real framework/router) while directly fixing the "full reload on every tool switch" problem.

## 4. Step-by-Step Migration Plan

### Phase 0 — Groundwork / safety (small)
- Fix the `API_BASE_URL` double-declaration in `pads-tanpura.js` (drop its local const, use the one `main1.js` already exposes on `window`).
- Confirm no other top-level `const`/`let`/`function` name collisions between `tuner.js`, `metronome.js`, `pads-tanpura.js`, and `main1.js` (quick grep of top-level identifiers).

### Phase 1 — Markup extraction (medium)
- Copy the tool-specific markup from each of the 3 HTML files into `index.html` as hidden `<section data-tool-view="...">` blocks, right next to the existing panels.
- Copy `styles/tool-pages.css` link into `index.html`'s `<head>` (verify final visual parity against the standalone pages).
- Add `<script>` tags for `metronome.js`, `pads-tanpura.js`, `tuner.js`, `loop-player-pad.js` (already loaded) into `index.html` if not already present.

### Phase 2 — Tab controller (medium)
- Build `scripts/features/tool-views.js`:
  - `showToolView(name)` — hides app panels + other tool views, shows the requested one, updates nav active state, updates `document.title`, pushes history state.
  - `hideToolView()` — calls the active tool's cleanup, restores whatever app panel (home/songs/setlist) was active before, pops/replaces history state.
  - `popstate` handler that reacts to Back/Forward between tool views and app panels.
- Wire the existing "More" tools menu (`.mobile-tools-item` links in `index.html`, `.tool-menu` links in the tool pages) to call `showToolView()` instead of `<a href="...">` navigation.
- Wire each tool page's bottom-nav Home/Songs/Setlist buttons (now living inside `index.html` as part of the tool view) to call `hideToolView()` + the existing `MobileUI.activateDestination(...)`.

### Phase 3 — Standalone-page compatibility (small)
- Convert `tuner.html`, `pads-tanpura.html`, `metronome.html` into redirect stubs pointing at `index.html?tool=...`.
- Update `manifest.json` shortcut URLs if needed (or leave as-is if the stub redirect approach is used, since the shortcut still "works", just now hands off into the SPA).
- Add `?tool=`/`#tool=` parsing on `index.html` load to auto-activate the right tab (for PWA shortcuts, bookmarks, and browser back/forward across a full reload).

### Phase 4 — Audio/state polish (small–medium)
- Ensure switching tabs always stops the *other* tool's audio (metronome ticking shouldn't keep going once you jump to Tuner, unless we deliberately want cross-tab playback later — decide desired behavior here).
- Re-verify dark mode class application, since tool pages currently set `dark-mode` on `<body>` via `tool-page-nav.js`; in the merged SPA this is already handled by `index.html`'s own dark mode logic, so `tool-page-nav.js`'s dark-mode line becomes redundant and should be removed for the embedded case (kept only in the redirect stub, if needed at all).

### Phase 5 — Cleanup & regression pass (small)
- Remove now-unused parts of `scripts/features/tool-page-nav.js` (full-page navigation helpers) once everything routes through `tool-views.js`.
- Manual test pass: switch between Home ↔ Songs ↔ Setlist ↔ Metronome ↔ Pads ↔ Tuner repeatedly, confirm: no reload/flash, audio stops correctly when leaving a tool, Back button behaves, PWA shortcuts still open the right tab, desktop layout unaffected (tool views should probably only be reachable via the "More" menu on both mobile and desktop, matching today's behavior).

## 5. Relative Effort / Complexity

| Phase | Complexity | Files touched (approx.) |
|---|---|---|
| 0. Groundwork | Low | `pads-tanpura.js` |
| 1. Markup extraction | Medium | `index.html`, `tuner.html`, `pads-tanpura.html`, `metronome.html` |
| 2. Tab controller | Medium–High | new `scripts/features/tool-views.js`, `scripts/features/mobile-ui.js`, `index.html` |
| 3. Standalone compatibility | Low | `tuner.html`, `pads-tanpura.html`, `metronome.html`, `manifest.json` |
| 4. Audio/state polish | Low–Medium | `tuner.js`, `pads-tanpura.js`, `metronome.js`, `scripts/features/tool-page-nav.js` |
| 5. Cleanup & regression pass | Low | `scripts/features/tool-page-nav.js`, manual QA |

Overall this is a **medium-sized, self-contained frontend change** — no backend/API changes, no new dependencies, no build tooling needed. The main risk areas to watch during implementation are (a) the `API_BASE_URL` collision, (b) making sure only one "panel or tool view" is ever visible at a time (reusing the exclusivity pattern already in `mobile-ui.js`), and (c) verifying visual parity after merging `tool-pages.css` into the main app's stylesheet set.

## 6. Decisions (confirmed by product owner, 2026-09-16)

1. **Standalone pages stay reachable.** `tuner.html`, `pads-tanpura.html`, `metronome.html` remain fully working, directly linkable/shareable pages — they are **not** converted into redirect stubs. The SPA tab controller is an *additional* internal navigation path used only when the user is already inside `index.html`; opening one of these URLs directly (bookmark, shared link, PWA shortcut) still renders the full standalone page exactly as today.
2. **Cross-tab audio persists.** Switching from Metronome/Pads & Tanpura to Home/Songs/Setlist (or another tool) inside the SPA must **not** stop the ticking/drone — it keeps playing in the background, since it's the same document/`AudioContext` and nothing unloads. Exception: the Tuner's **microphone capture** still stops when you navigate away from the Tuner view (privacy/battery — no reason to keep listening in the background), but its **tone generator** playback should be treated the same as Metronome/Pads and allowed to persist if it's already an accepted pattern (open question resolved as: mic → stop on leave, tone generator/metronome/pads → keep playing on leave, always stoppable via their own Stop/Play toggle or a global mini-player control).
3. **Full desktop parity + a new entry point.** Today these tools are **only reachable from the mobile bottom-nav "More" menu** — there is no desktop entry point at all. Fix: add a new collapsible **"Tools" folder** in the sidebar, using the exact same `setlist-folder` / `folder-header` / `folder-icon` pattern as the existing Global/My/Smart Setlist folders (same markup lives in both the desktop sidebar and the mobile Home panel, since it's one shared element that's just laid out differently per breakpoint). It contains links to Tune & Pitch / Pads & Tanpura / Metronome.

These decisions update Phase 3 and Phase 4 below (superseding the "redirect stub" idea) and add a new Phase 1.5.

### Revised Phase 3 — Standalone-page compatibility (small, revised)
- ~~Convert tool pages into redirect stubs~~ **(dropped — pages stay standalone).**
- Instead: when a tool page is opened as a real standalone document (not embedded), its own Home/Songs/Setlist nav buttons keep doing what `tool-page-nav.js` does today (full navigate to `index.html`) — that part of the current behavior is fine and unchanged, since arriving at a shared link is a distinct session from the running SPA.
- `index.html` gains `?tool=metronome|pads|tuner` handling so the new sidebar "Tools" folder links (and the mobile "More" menu) can deep-link into the embedded tab without a full reload **when already inside the app**, and so a fresh load of `index.html?tool=...` (e.g. from a PWA shortcut pointed at the app root) opens straight into that tab too.

### New Phase 1.5 — Desktop entry point (small)
- Add a `#toolsFolderHeader` / `#toolsFolderContent` / `#toolsFolderIcon` block to the sidebar in `index.html`, styled identically to the Setlist folders, containing the 3 tool links (reusing the existing icons: `fa-wave-square`, `fa-guitar`, `fa-drum`).
- Add a matching collapse/expand click handler in `main1.js` alongside `attachSetlistEventListeners()` (same toggle-chevron/display logic, no "add" button needed since it's static links, not user-generated content).
- Until Phase 2's tab controller exists, these links behave like the current mobile "More" menu links (normal page navigation to the standalone tool page) — once `tool-views.js` lands, the same links get rewired to call `showToolView()` instead, removing the reload for both desktop and mobile in one change.

### Revised Phase 4 — Audio/state polish (small–medium, revised)
- `hideToolView()` must **not** call `metronome.js`'s `stop()` or `pads-tanpura.js`'s `stopAudio()` when navigating away — only `tuner.js`'s `stopMicrophone()`/mic-related cleanup runs on leave. Playback-oriented state (BPM running, pad/tanpura playing) survives the tab switch.
- Add a lightweight "now playing" affordance (e.g. a small pulsing dot on the Metronome/Pads nav icon while their audio is active, both in the bottom nav and the new sidebar Tools folder) so users know audio is still running after they've navigated elsewhere, with an easy way back to stop it.
- The existing `pagehide`/`visibilitychange` listeners in each tool's script continue to guard against real backgrounding/unload (browser tab hidden or app closed) — that's unrelated to in-app tab switching and should stay as-is.

## 7. Updated Effort Table

| Phase | Complexity | Files touched (approx.) |
|---|---|---|
| 0. Groundwork | Low | `pads-tanpura.js` |
| 1. Markup extraction | Medium | `index.html`, `tuner.html`, `pads-tanpura.html`, `metronome.html` |
| 1.5. Desktop entry point (new) | Low | `index.html`, `main1.js` |
| 2. Tab controller | Medium–High | new `scripts/features/tool-views.js`, `scripts/features/mobile-ui.js`, `index.html` |
| 3. Standalone compatibility (revised) | Low | `index.html`, `scripts/features/tool-page-nav.js` |
| 4. Audio/state polish (revised) | Medium | `tuner.js`, `pads-tanpura.js`, `metronome.js`, new `tool-views.js` |
| 5. Cleanup & regression pass | Low | `scripts/features/tool-page-nav.js`, manual QA |

No open questions remain — ready to start with Phase 0 → Phase 1.5, then Phase 2 (the tab controller) is the core/riskiest piece and worth its own review checkpoint before Phase 3–5.

