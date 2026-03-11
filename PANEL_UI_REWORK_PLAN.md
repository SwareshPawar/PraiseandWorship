# Praise and Worship Panel UI Rework Plan (JamRoom Referenced)

Last Updated: March 11, 2026
Owner: Frontend/UI
Scope: Full visual modernization of the main app shell and related panel-driven flows, while preserving existing behavior.

## 1. Goal

Modernize the full application UI using JamRoom design patterns (tokens, surfaces, typography rhythm, component consistency), while keeping the Praise and Worship app information architecture:

- Desktop: Home Panel -> Songs List Panel -> Song Preview Panel
- Mobile: Show one panel at a time
- Setlists: Select setlist -> songs panel updates -> click song -> preview updates

This is a style and structure refactor, not a feature rewrite.

## 2. What Exists Today (Verified)

Primary files currently driving this behavior:

- index.html: main 3-panel markup and global/my/smart setlist sections
- styles.css: very large, duplicated style rules and repeated media-query blocks
- main1.js: panel state logic, mobile nav buttons, swipe gestures, panel persistence

Current strengths:

- Panel logic already supports one-panel mobile mode using pw_mobileLastOpenedPanel
- Setlist and song selection data flow is already in place
- Light and dark mode exist

Current pain points:

- styles.css is monolithic and has repeated/overlapping rules for the same selectors
- Multiple style patterns coexist (legacy + newer blocks), causing inconsistent visuals
- Inline style attributes in markup reduce maintainability and consistency
- Panel toggle patterns are mixed (draggable legacy toggles + mobile fixed toggles)

## 3. JamRoom Elements Worth Reusing

Reference source:

- JamRoom/public/css/shared.css
- JamRoom/public/js/shared/theme.js
- JamRoom/public/js/shared/navigation.js

Reusable design-system practices:

- Token-first CSS variables for spacing, radius, elevation, semantic colors
- Clear light/dark theme switching through data-theme and localStorage persistence
- Consistent card/surface system and border/shadow rhythm
- Unified button/input/navigation component styling
- Mobile-first spacing and breakpoint discipline

Important adaptation note:

- Do not copy JamRoom branding directly.
- Reuse the system approach and component architecture, then map to Praise and Worship visual identity.

## 4. UX Structure To Keep (And Simplify)

### 4.1 Desktop Layout (3 Panel)

- Left Panel (Home/Navigation): auth actions, all songs, setlist folders, app controls
- Middle Panel (Songs List): filters, tabs, search, song list
- Right Panel (Preview): lyrics, metadata, playback/transpose/actions

### 4.2 Mobile Layout (1 Panel At A Time)

- Home panel and Songs panel remain mutually exclusive
- Preview remains full width under active panel context
- Keep state memory (home or songs) between sessions

### 4.3 Setlist Flow (Global + User)

- Global/My/Smart setlist selector in Home panel
- Selecting a setlist loads songs into Songs panel
- Clicking a song updates Preview panel
- Keep this flow unchanged functionally; improve visual hierarchy and touch affordances

## 5. Proposed UI Architecture

### 5.1 CSS File Split

Replace single giant stylesheet with staged modular CSS:

1. styles/tokens.css
2. styles/base.css
3. styles/layout-shell.css
4. styles/components.css
5. styles/panels.css
6. styles/modals-admin.css
7. styles/mobile.css

Temporary migration mode:

- Keep legacy styles.css loaded last only for not-yet-migrated selectors
- Remove migrated sections phase by phase

### 5.2 Token Strategy

Define tokens similar to JamRoom system, but tuned for this app:

- Color: brand, semantic, text, surface, border, focus ring
- Typography: single family, font sizes, line-height scale
- Layout: spacing scale, panel widths, max content widths
- Radius and shadows: consistent elevations
- Motion: short and moderate transitions, no heavy animations

### 5.3 Panel State Contract

Keep existing JS behavior but normalize control entry points:

- Single source for setMobilePanelVisibility(home|songs)
- Single observer for persisting mobile panel state
- Remove duplicate control logic between legacy draggable and modern mobile controls

## 6. Visual Direction (Modern, Not Outlook-like)

- Keep 3-panel productivity clarity, but reduce hard edges and crowded visual noise
- Use elevated surfaces with clean spacing rhythm and consistent section headers
- Increase typographic hierarchy:
  - Panel title
  - Secondary labels
  - Body/list text
- Replace dense borders with subtle separators and elevation
- Keep moderate motion only for panel reveal, hover, and active item state

## 7. Simplification Decisions (Recommended)

1. Retire draggable panel toggles on mobile and keep one fixed bottom panel switch control.
2. Keep one canonical panel toggle system in JS.
3. Remove inline style attributes from index.html and move all into modular CSS.
4. Standardize all tabs, pills, list items, and action buttons through shared component classes.
5. Keep admin dense, but use same tokens and components for visual consistency.

## 8. Migration Plan (Phased)

### Phase 0: Baseline and Safety

- Snapshot visual baseline of desktop and mobile states
- Add migration guard class on body (for incremental rollout)
- Define acceptance checklist before edits

### Phase 1: Theme and Tokens Foundation

- Introduce tokens.css and data-theme implementation pattern
- Keep existing dark-mode support while shifting variables to new tokens
- Validate contrast in both themes

### Phase 2: Shell and Panel Layout

- Build clean panel shell styles in layout-shell.css and panels.css
- Implement stable desktop 3-column feel and mobile 1-panel behavior
- Preserve current panel visibility logic from main1.js

### Phase 3: Components and Setlist UX

- Standardize sidebar list entries, folder headers, dropdown, and setlist cards
- Standardize songs list item and active state visuals
- Standardize preview typography blocks and metadata chips

### Phase 4: Modals and Admin Alignment

- Move modal styles to modals-admin.css
- Replace inline modal styles and hardcoded colors
- Ensure admin remains functional but visually in same design family

### Phase 5: Cleanup and Deletion of Legacy Rules

- Remove migrated blocks from styles.css
- Remove duplicate media query blocks
- Keep only a minimal compatibility layer

### Phase 6: QA and Sign-off

- Desktop: 1366, 1440, ultrawide
- Mobile: 360, 390, 412 widths
- Validate setlist selection flow and panel persistence
- Validate light/dark parity and no horizontal overflow

## 9. Acceptance Criteria

- Full app matches one unified visual language
- Three-panel desktop flow is clear and modern
- Mobile shows one panel at a time with reliable switching
- Global/My/Smart setlist flow feels direct and uncluttered
- No regressions in selection, preview, auth, and admin flows
- styles.css reduced significantly and modular CSS adopted

## 10. Implementation Order (Practical)

1. Introduce token + theme foundation files
2. Move shell/panel CSS first (highest visual impact)
3. Migrate sidebar and songs list components
4. Migrate preview + modal/admin components
5. Remove duplicate/legacy style sections

## 11. Risks and Controls

Risks:

- Visual regressions from cascading legacy selectors
- Temporary duplication while both old and new styles coexist
- Mobile edge interactions affected by panel style changes

Controls:

- Migrate in small selector groups
- Keep side-by-side visual checks at each phase
- Preserve main1.js panel-state functions until CSS migration is stable

## 12. Suggested Next Execution Step

Start Phase 1 and Phase 2 in a single pull request:

- Add modular CSS scaffold and token system
- Move panel shell styles first
- Keep behavior unchanged
- Test desktop and mobile panel switching before touching deep component styles
