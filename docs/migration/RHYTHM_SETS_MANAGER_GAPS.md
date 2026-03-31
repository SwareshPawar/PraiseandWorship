# Rhythm Sets Manager - Feature Gap Analysis

**Date:** March 10, 2026  
**Comparison:** Current PraiseandWorship vs OldandNew Migration Bundle  
**Status:** Tracking document with verified implementation state

---

## Overview

The current Rhythm Sets Manager now includes the core song mapping workflow from the OldandNew repository. This document tracks remaining enhancement and parity gaps.

### Key Remaining Gaps
- ⏳ Enhanced recommendation scoring (tempo/time signature/genre/mood)
- ⏳ Enhanced statistics (mapped/unmapped/status breakdown)
- ⏳ Alert UX parity (`setInfo()` currently used instead of color-coded alerts)
- ⏳ Advanced row editing/rename workflows
- ⏳ Full integration and cross-browser validation

---

## 1. Song Management Features

### 1.1 Load Songs Data
- **Function:** `loadSongs()`
- **Status:** ✅ COMPLETED
- **Location in OldandNew:** rhythm-sets-manager.js (line referenced in grep)
- **Purpose:** Fetch all songs from `/api/songs` endpoint
- **Dependencies:** 
  - Songs API endpoint must return song data
  - Database schema with songs collection
- **Implementation Notes:**
  - Should load song metadata: id, title, taal, timeSignature, tempo, genre, mood
  - Must include current rhythm set assignment (rhythmSetId field)
  - Store in global songs array for filtering/display

### 1.2 Render Songs Table
- **Function:** `renderSongsTable()`
- **Status:** ✅ COMPLETED
- **Location in OldandNew:** rhythm-sets-manager.js
- **Purpose:** Display songs in HTML table with current rhythm set assignments
- **UI Elements Added:**
  - `<table>` with columns: Song | Current Rhythm Set | Action
  - `<tbody id="songsTableBody">` container
  - Song search input: `<input id="songSearchInput">`
  - Song table wrapper: `<div class="song-table-wrap">`
- **Implementation Notes:**
  - Each row shows song title, assigned rhythm set, and "Select" button
  - Highlights selected song row
  - Displays unmapped songs with visual indicator

### 1.3 Song Selection State
- **Function:** `setSelectedSong(songId)`
- **Status:** ✅ COMPLETED
- **Purpose:** Track currently selected song for assignment
- **UI Elements Added:**
  - Selected song card: `<div id="selectedSongCard">`
  - Display: song title, taal, tempo, time signature, current rhythm set
- **Implementation Notes:**
  - Updates global `selectedSong` object
  - Refreshes selected song card display
  - Enables/disables Assign and Recommend buttons based on selection

### 1.4 Song Filtering
- **Function:** `filterSongs()`
- **Status:** ✅ COMPLETED
- **Location in OldandNew:** rhythm-sets-manager.js
- **Purpose:** Search songs by title, id, taal, or rhythm set name
- **UI Integration:**
  - Bound to `songSearchInput` keyup event
  - Filters songsTableBody rows in real-time
- **Implementation Notes:**
  - Case-insensitive search
  - Matches against multiple fields: title, songId, taal, rhythmSetId

---

## 2. Assignment Workflow (PRIORITY)

### 2.1 Assign Rhythm Set to Song
- **Function:** `assignSelectedRhythmSet()`
- **Status:** ✅ COMPLETED (USER PRIORITY)
- **Location in OldandNew:** rhythm-sets-manager.js
- **Purpose:** Core feature - assign selected rhythm set to selected song
- **UI Elements Added:**
  - Assign button: `<button id="assignBtn" class="btn btn-success">`
  - Rhythm set dropdown: `<select id="mapperRhythmSetSelect">`
- **API Requirements:**
  - PUT `/api/songs/:songId` endpoint to update rhythmSetId (already exists in server.js)
  - Request body: `{ rhythmSetId: "keherwa_1" }`
- **Implementation Notes:**
  - Validates: both song and rhythm set must be selected
  - Shows loading state via setInfo() during API call
  - Updates songs table after successful assignment
  - Refreshes statistics (Mapped Songs count)
  - Displays success/error alerts

### 2.2 Render Rhythm Set Dropdown
- **Function:** `renderRhythmSetSelect()`
- **Status:** ✅ COMPLETED
- **Purpose:** Populate dropdown with available rhythm sets for assignment
- **Implementation Notes:**
  - Loads from existing rhythm sets data
  - Format: "family_setNo (status)" - e.g., "keherwa_1 (active)"
  - Sorts alphabetically by family, then by set number
  - Filters out archived sets

---

## 3. AI Recommendation System

### 3.1 Recommend Rhythm Set
- **Function:** `recommendForSelectedSong()`
- **Status:** ✅ COMPLETED (Basic Algorithm)
- **Location in OldandNew:** rhythm-sets-manager.js
- **Purpose:** AI-powered recommendation based on song attributes
- **UI Elements Added:**
  - Recommend button: `<button id="recommendBtn" class="btn btn-warning">`
- **Algorithm Implemented:**
  1. ✅ Match song taal → rhythm family
  2. ⏳ Compare tempo ranges (slow/medium/fast) - TODO
  3. ⏳ Check time signature compatibility - TODO
  4. ⏳ Genre/mood weight matching - TODO
  5. ✅ Prefer complete sets (all 6 files)
- **API Requirements:**
  - May need `/api/recommendation-weights` for genre/mood scoring (future enhancement)
- **Implementation Notes:**
  - Auto-selects top recommendation in dropdown
  - Shows reasoning in info message
  - Fallback: if no match, shows all active sets
  - **Next Step:** Add tempo/time signature/genre matching for better recommendations

---

## 4. Audio Preview System

### 4.1 Play Loop Preview
- **Function:** `playPreview(loopPath)`
- **Status:** ✅ COMPLETED
- **Location in OldandNew:** rhythm-sets-manager.js
- **Purpose:** Play selected rhythm set loop files for preview before assignment
- **UI Elements Added:**
  - Preview buttons container: `<div id="previewButtons">`
  - Preview buttons dynamically generated for each loop file (Loop1, Loop2, Loop3, Fill1, Fill2, Fill3)
- **Implementation Notes:**
  - Uses HTML5 Audio API
  - Loads from `/loops/` directory
  - Supports wav/mp3 formats
  - Stops current audio before playing new
  - Toggle play/pause with icon change

### 4.2 Stop Preview
- **Function:** `stopPreview()`
- **Status:** ✅ COMPLETED
- **UI Elements Added:**
  - Stop button: `<button id="stopPreviewBtn" class="btn btn-secondary">`
- **Implementation Notes:**
  - Pauses and resets all audio elements
  - Clears active preview button highlight (resets icons to play)

### 4.3 Render Preview Buttons
- **Function:** `renderPreviewButtons()`
- **Status:** ✅ COMPLETED
- **Purpose:** Dynamically generate preview buttons for selected rhythm set's loop files
- **Implementation Notes:**
  - Shows only files that exist for the selected rhythm set
  - Button labels: "LOOP1", "LOOP2", "LOOP3", "FILL1", "FILL2", "FILL3"
  - Binds click handlers to playPreview()
  - Highlights currently playing button with pause icon

---

## 5. Metadata and Helper Functions

### 5.1 Load Loops Metadata
- **Function:** `loadLoopsMetadata()`
- **Status:** ✅ COMPLETED
- **Purpose:** Load loops-metadata.json to map loop files to rhythm sets
- **Implementation Notes:**
  - Fetches from `/api/loops/metadata`
  - Stores in loopsByRhythmSet Map globally for preview button generation
  - Required for file path resolution

### 5.2 Resolve Loop Rhythm Set ID
- **Function:** `resolveLoopRhythmSetId(loopData)`
- **Status:** ✅ COMPLETED
- **Purpose:** Normalize loop data to extract rhythm family and set number
- **Implementation Notes:**
  - Parses loop file naming conventions
  - Handles legacy formats
  - Returns standardized format: "family_setNo"

### 5.3 Normalize Rhythm Family
- **Function:** `normalizeRhythmFamily(family)`
- **Status:** ✅ COMPLETED
- **Purpose:** Standardize rhythm family names (e.g., uppercase/lowercase, variations)
- **Implementation Notes:**
  - Converts to lowercase
  - Replaces spaces with underscores
  - Removes special characters
  - Handles common variations (e.g., "Keherwa" → "keherwa")

### 5.4 Parse and Build Rhythm Set ID
- **Functions:** `parseRhythmSetId(id)`, `buildRhythmSetId(family, setNo)`
- **Status:** ✅ COMPLETED
- **Purpose:** Convert between string and object representations
- **Implementation Notes:**
  - Parse: "keherwa_2" → { family: "keherwa", setNo: 2 }
  - Build: { family: "keherwa", setNo: 2 } → "keherwa_2"

---

## 6. UI/UX Enhancements

### 6.1 Alert ⚠️ Using `setInfo()` instead (functionally equivalent)
- **Purpose:** User-friendly success/error/warning messages
- **Implementation Notes:**
  - Current implementation uses setInfo() for all messages
  - Could be enhanced with color-coded alerts (success/error/warning)
  - Auto-dismiss functionality not implemented yet

### 6.2 Selected Set Metadata Display
- **Function:** `updateSelectedSetMeta()`
- **Status:** ✅ COMPLETED
- **UI Element Added:** `<div id="selectedSetMeta">`
- **Purpose:** Show details of selected rhythm set: family, loops, status
- **Implementation Notes:**
  - Displays when rhythm set selected in dropdown
  - Shows: "keherwa_1: 6/6 files (active)"

### 6.3 HTML Escaping
- **Function:** `escapeHtml(text)`
- **Status:** ✅ COMPLETED
- **Purpose:** Prevent XSS when rendering user input in DOM
- **Implementation Notes:**
  - Escapes: `<, >, &, ", '`
  - Usedlementation Notes:**
  - Escape: `<, >, &, ", '`
  - Use for song titles, rhythm set notes, any user-generated content

---

## 7. Statistics and Data Display

### 7.1 Enhanced Stats Display
- **Function:** `setStats(data)`
- **Status:** ⚠️ Partially implemented (current has basic stats)
- **Missing Stats in UI:**
  - Unmapped Songs count: `<div class="value" id="statUnmappedSongs">`
  - Mapped Songs count update based on actual song assignments
- **OldandNew Stats:**
  - Rhythm Sets (total)
  - Mapped Songs (songs with rhythmSetId)
  - Unmapped Songs (songs without rhythmSetId)
  - Complete Sets (rhythm sets with all 6 files)
- **Current Stats:**
  - Total Rhythm Sets
  - Complete Sets
  - Mapped Songs (static)
  - Backend (connection status)

---

## 8. Row Editing Features

### 8.1 Save Rhythm Set Row
- **Function:** `saveRhythmSetRow(rowElement)`
- **Status:** ⚠️ Different implementation in current repo (`saveRhythmSet()`)
- **Purpose:** Save inline edits to rhythm set metadata
- **Implementation Notes:**
  - Current implementation uses separate save button
  - OldandNew allows inline editing in table rows
  - May need to compare workflows to decide which is better

### 8.2 Rename Rhythm Set Row
- **Function:** `renameRhythmSetRow(rowElement)`
- **Status:** ❌ Missing
- **Purpose:** Rename rhythm set (family/setNo) with file updates
- **Implementation Notes:**
  - Must update database document
  - Must rename associated loop files on disk
  - Complex operation - requires careful validation

### 8.3 Get Rename Payload
- **Function:** `getRenamePayloadFromRow(rowElement)`
- **Status:** ❌ Missing
- **Purpose:** Extract new family/setNo values from edited table row
- **Implementation Notes:**
  - Parse row input fields
  - Validate format: family_setNo
  - Return payload for API request


## COMPLETION STATUS (March 10, 2026 - Updated)

### ✅ Completed Features (Phases 1-2 + Most of Phase 4)
1. **Song Management** (Phase 1)
   - loadSongs() - Fetches all songs from API
   - renderSongsTable() - Displays songs with rhythm set assignments
   - setSelectedSong() - Tracks selected song with detailed card
   - filterSongs() - Real-time search by title/taal/rhythm set
   - escapeHtml() - Security for user input
   - updateMappedStats() - Live statistics

2. **Assignment Workflow** (Phase 2)
   - assignSelectedRhythmSet() - Core assign function with PUT API call
   - renderRhythmSetSelect() - Populates dropdown with active sets
   - recommendForSelectedSong() - Basic taal-matching algorithm

3. **Audio Preview System** (Phase 4) ⭐ NEW
   - playPreview() - HTML5 Audio playback with toggle play/pause
   - stopPreview() - Stop current audio and reset icons
   - renderPreviewButtons() - Dynamic buttons for available loop files
   - loadLoopsMetadata() - Fetch and map loop files to rhythm sets
   - Preview buttons show: LOOP1, LOOP2, LOOP3, FILL1, FILL2, FILL3

4. **Metadata and Helpers** (Phase 5 - Partial)
   - loadLoopsMetadata() - Loads loops-metadata.json
   - resolveLoopRhythmSetId() - Maps loop data to rhythm set IDs
   - normalizeRhythmFamily() - Standardizes rhythm family names
   - parseRhythmSetId() - Parses "family_setNo" format
   - buildRhythmSetId() - Builds "family_setNo" format
   - updateSelectedSetMeta() - Shows rhythm set details in UI

5. **UI/Layout**
   - Two-column grid layout (Song Mapping | Rhythm Set Management)
   - Song table with scrolling (max-height: 300px)
   - Selected song card with highlight
   - Assign/Recommend buttons disabled until song selected
   - Preview buttons container with dynamic loop file buttons
   - Stop Preview button
   - Font Awesome icons added
   - Rhythm set metadata display

6. **Event Handling**
   - Song search keyup filtering
   - Assign button click
   - Recommend button click
   - Stop Preview button click
   - Rhythm set dropdown change → updates preview buttons and metadata
   - Individual loop preview button clicks

7. **Authentication**
   - All functions use pw_jwtToken
   - Proper error handling for missing/invalid tokens

### ⏳ Next Priority Features (Phase 3 Enhancements)

1. **Enhanced Recommendation Algorithm** (Medium Priority)
   - ⏳ Add tempo compatibility checking (slow: <80, medium: 80-120, fast: >120)
   - ⏳ Add time signature matching (4/4, 3/4, 6/8, etc.)
   - ⏳ Integrate genre/mood weights from recommendation-weights API
   - ⏳ Display confidence score or reasoning
   - ⏳ Rank multiple compatible sets

2. **Enhanced Statistics** (Low Priority)
   - ⏳ Separate Mapped/Unmapped songs counts in UI
   - ⏳ Show rhythm sets by status (active/inactive/archived)
   - ⏳ File completeness percentages

3. **Alert System Enhancement** (Low Priority)
   - ⏳ Color-coded alerts (success green, error red, warning yellow)
   - ⏳ Auto-dismiss with configurable delay
   - ⏳ Replace current setInfo() with showAlert()

4. **Advanced Features** (Future)
   - ⏳ Inline table editing for rhythm sets (saveRhythmSetRow)
   - ⏳ Rhythm set renaming (complex - includes file operations)
   - ⏳ Bulk song assignment
   - ⏳ Preview volume controls
   - ⏳ Loop/repeat mode for previews

---
---

## 9. Event Wiring and Initialization

### 9.1 Wire Events
- **Function:** DOMContentLoaded setup block
- **Status:** ✅ IMPLEMENTED
- **Bound Event Handlers:**
  - `#songSearchInput` keyup → `filterSongs()`
  - `#assignBtn` click → `assignSelectedRhythmSet()`
  - `#recommendBtn` click → `recommendForSelectedSong()`
  - `#stopPreviewBtn` click → `stopPreview()`
  - `#mapperRhythmSetSelect` change → `updateSelectedSetMeta()` + `renderPreviewButtons()`
  - Song row selection via rendered table actions → `setSelectedSong()`

### 9.2 Initialize Data
- **Function:** `loadData()`
- **Status:** ✅ IMPLEMENTED
- **Current Initialization:**
  1. Load loops metadata
  2. Load rhythm sets
  3. Load songs
  4. Render rhythm sets and songs UI
  5. Refresh stats and assignment controls

---

## 10. CSS and UI Layout Status

### Implemented UI Classes/Elements
- `.song-table-wrap`
- `.current-song`
- `.preview-buttons`
- `.small-note`
- `.main-grid`
- Song Mapping panel with search, selection card, assign/recommend controls, preview buttons, and stop preview action

### Remaining UI Work
- ⏳ Optional visual parity refinements for alerts and advanced statistics display

---

## Implementation Priority

### Phase 1: Foundation (Days 1-2)
1. ✅ Add Songs table HTML structure
3. ✅ Implement loadSongs() and renderSongsTable()
4. ✅ Add song selection (setSelectedSong())
5. ✅ Implement filterSongs() for search

### Phase 2: Core Assignment (Days 3-4)
1. ✅ Add Assign/Recommend button UI
2. ✅ Implement renderRhythmSetSelect()
3. ✅ **Implement assignSelectedRhythmSet()** (PRIORITY)
4. ✅ Backend PUT `/api/songs/:id` endpoint already exists
5. ⏳ Test full assignment workflow (USER TESTING)

### Phase 3: Recommendation Engine (Days 5-6)
1. ✅ Implement recommendForSelectedSong() basic algorithm
2. ⏳ Add tempo compatibility checking
3. ⏳ Add time signature matching
4. ⏳ Integrate genre/mood weights
5. ⏳ Display confidence score

### Phase 4: Audio Preview (Days 7-8)
1. ✅ Implement playPreview() and stopPreview()
2. ✅ Add renderPreviewButtons() for selected rhythm set
3. ✅ Add audio controls to UI (Stop Preview button)
4. ✅ Load loops metadata (loadLoopsMetadata())
5. ⏳ Test audio playback across browsers (USER TESTING)

### Phase 5: Polish and Helpers (Days 9-10)
1. ✅ Implement metadata loading functions (loadLoopsMetadata, resolveLoopRhythmSetId)
2. ⚠️ Alert system (using setInfo() - could enhance)
3. ✅ Implement HTML escaping for security
4. ⏳ Add enhanced statistics display
5. ✅ Wire all event listeners
6. ⏳ Full integration testing (USER TESTING)

---

## API Requirements

### Existing Endpoints
- ✅ GET `/api/rhythm-sets` - Fetch all rhythm sets
- ✅ POST `/api/rhythm-sets` - Create new rhythm set
- ✅ GET `/api/loops/metadata` - Load loops metadata
- ✅ GET `/api/songs` - Songs endpoint present and used

### New/Modified Endpoints Needed
- ✅ PUT `/api/songs/:id` - Update song rhythmSetId for assignment
- ⏳ GET `/api/recommendation-weights` - Genre/mood weights for AI recommendation (optional)

---

## Testing Checklist

### Assignment Workflow
- [ ] Select song from table
- [ ] Selected song displays in card with details
- [ ] Rhythm set dropdown populates with active sets
- [ ] Assign button updates database
- [ ] Songs table refreshes with new assignment
- [ ] Statistics update (Mapped/Unmapped counts)

### Recommendation
- [ ] Recommend button suggests best rhythm set
- [ ] Recommendation matches song taal
- [ ] Tempo compatibility checked
- [ ] Genre/mood weights applied
- [ ] Dropdown auto-selects recommendation

### Preview
- [ ] Preview buttons appear for selected rhythm set
- [ ] Clicking button plays correct loop file
- [ ] Audio stops when new loop plays
- [ ] Stop Preview button halts playback
- [ ] Preview works for all 6 file types

### Search and Filter
- [ ] Search by song title works
- [ ] Search by taal works
- [ ] Search by rhythm set name works
- [ ] Filter updates table in real-time
- [ ] Case-insensitive search

---

## Notes

- **Database Schema:** Ensure songs collection has `rhythmSetId` field (string, nullable)
- **Authentication:** All functions must use `pw_jwtToken` from localStorage (not `jwtToken`)
- **File Paths:** Loop files stored in `/loops/` with naming convention: `{taal}_{time}_{tempo}_{genre}_{TYPE}{number}.wav`
- **Rhythm Set Format:** Always use `family_setNo` format (e.g., "keherwa_1")
- **Error Handling:** All API calls should have try/catch with user-friendly error messages
- **Performance:** Consider pagination if song list exceeds 100+ items

---

## Questions for Discussion

1. Should we implement inline table editing (OldandNew style) or keep separate edit forms?
2. Do we need rhythm set renaming functionality, or is it too risky with file operations?
3. Should recommendation algorithm be purely client-side or have backend component?
4. What audio format should we standardize on (wav, mp3, or both)?
5. Should archived rhythm sets be hidden from assignment dropdown?

---

**Last Updated:** March 10, 2026  
**Next Review:** After Phase 3 enhancements and integration testing
