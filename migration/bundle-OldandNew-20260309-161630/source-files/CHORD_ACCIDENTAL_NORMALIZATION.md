# Chord Accidental Normalization (Eb/Bb Policy)

**Date:** March 9, 2026  
**Scope:** Frontend, backend, API behavior, setlists, melodic loops, and database migration  
**Status:** Implemented and verified

## 1) Policy Implemented
The application now uses canonical accidental spellings:
- Allowed canonical outputs: `C C# D Eb E F F# G G# A Bb B`
- `D#` is treated as equivalent to `Eb`
- `A#` is treated as equivalent to `Bb`
- Legacy values are accepted as input where needed, then normalized to canonical output

## 2) Code Changes Completed

### Frontend (`main.js`)
1. Added normalization constants and helpers:
- `CHORDS` canonical set updated to include `Eb` and `Bb`
- `NOTE_TO_SEMITONE`
- `normalizeBaseNote(note)`
- `normalizeKeySignature(key)`
- `normalizeSingleChordToken(chordToken)`
- `normalizeChordAccidentals(chord)`
- `normalizeSongAccidentals(song)`

2. Applied normalization at runtime boundaries:
- Cache hydration and delta/full sync paths normalize songs before use
- Cache update path normalizes song before merge/update
- Add song, edit song, and manual song submissions normalize `key`
- Manual chord input normalization applied before save
- Song preview `originalKey` and display key now use canonical key

3. Fixed transpose behavior:
- `transposeSingleChord` normalizes input base notes before indexing
- Legacy roots like `Ab`, `Db`, `Gb`, `D#`, and `A#` now transpose correctly
- Sorting of chord roots now uses canonical order via normalization

4. Stability fix:
- `hasInlineChords` resets `INLINE_CHORD_REGEX.lastIndex` before `.test()`

### UI (`index.html`)
1. Manual-song key dropdown changed:
- Replaced `D#` option with `Eb`
- Replaced `A#` option with `Bb`

### Backend (`server.js`)
1. Added normalization utility layer:
- `CANONICAL_CHROMATIC`
- `NOTE_TO_INDEX`
- `KEY_VARIANTS_BY_CANONICAL`
- `normalizeBaseNote`, `normalizeKeySignature`
- `normalizeChordToken`, `normalizeManualChords`, `normalizeLyricsChords`
- `normalizeSongAccidentals`
- `expandKeyFilterVariants`

2. Applied normalization to songs API:
- `/api/songs` GET returns normalized songs
- `/api/songs` POST normalizes request body before insert
- `/api/songs/:id` PUT normalizes request body before update
- `/api/songs/scan` expands legacy key variants for matching and returns canonical keys

3. Applied normalization to setlist flows:
- Manual songs in `/api/global-setlists/add-song` normalized before persistence
- Manual songs in `/api/my-setlists/add-song` normalized before persistence
- `/api/global-setlists/:id/transpose` returns normalized `newKey`

4. Melodic loop key handling normalized:
- Added `MELODIC_KEYS = CANONICAL_CHROMATIC`
- Added `normalizeMelodicKey(key)`
- Added `findExistingMelodicFile(type, key)`
- Endpoints accept legacy key inputs but normalize behavior/output to canonical keys
- File lookup supports legacy filenames (`D#`/`A#`) and canonical filenames (`Eb`/`Bb`)

### Database Migration
1. New script created: `migrate-chord-accidentals.js`
2. Collections covered:
- `OldNewSongs`
- `GlobalSetlists` embedded `songs`
- `MySetlists` embedded `songs`
- `SmartSetlists` embedded `songs`
- `UserData.songKeys`
3. Fields normalized:
- `key`
- `manualChords`
- `lyrics` (chord-only lines and inline chords)
- `songKeys` map values in `UserData`
4. Supports dry run using `--dry-run`

## 3) Migration Execution Results
Commands run:
- `node migrate-chord-accidentals.js --dry-run`
- `node migrate-chord-accidentals.js`
- `node migrate-chord-accidentals.js --dry-run`

Observed results:
- Pre-run dry check: `165` documents would update
- Live run: `165` documents updated
- Post-run dry check: `0` documents remaining

## 4) Validation Performed
1. Editor diagnostics:
- `main.js`: no errors
- `server.js`: no errors
- `index.html`: no errors
- `migrate-chord-accidentals.js`: no errors

2. Node parser checks:
- `node --check server.js`
- `node --check migrate-chord-accidentals.js`

Both checks passed.

## 5) If You Want to Reverse Canonical Policy to D#/A#
Use this section when intentionally changing canonical output back to `D#` and `A#`.

1. Update canonical scales and mappings in frontend:
- File: `main.js`
- Update `CHORDS` to sharp-canonical version: `C C# D D# E F F# G G# A A# B`
- Keep `NOTE_TO_SEMITONE` accepting flats, but map canonical output to sharp form
- Review helpers: `normalizeBaseNote`, `normalizeKeySignature`, `normalizeChordAccidentals`
- Review transpose functions: `transposeChord`, `transposeSingleChord`
- Review sort behavior that uses `CHORDS`

2. Update canonical scales and mappings in backend:
- File: `server.js`
- Update `CANONICAL_CHROMATIC` to sharp-canonical version
- Update `KEY_VARIANTS_BY_CANONICAL` so `D#` includes `Eb` variant and `A#` includes `Bb` variant
- Keep acceptance of flat inputs through `NOTE_TO_INDEX`
- Review: `normalizeSongAccidentals`, `expandKeyFilterVariants`, melodic key helpers

3. Update UI key sources:
- File: `index.html`
- Revert manual key dropdown entries from `Eb/Bb` to `D#/A#`

4. Update migration strategy for reverse conversion:
- File: `migrate-chord-accidentals.js`
- Create a reverse variant or parameterized mode to convert `Eb -> D#` and `Bb -> A#`
- Re-run dry/live/dry sequence after edits

5. Update melodic loop file naming policy:
- File: `server.js`
- If canonical filenames must become sharp-based, decide one of these:
- Option A: keep dual-lookup forever (least risky)
- Option B: rename files in `loops/melodies/atmosphere` and `loops/melodies/tanpura` from `_Eb/_Bb` to `_D#/_A#`
- If Option B is chosen, update any admin/export scripts that assume canonical filename format

6. Re-verify behavior after reversal:
- Run parser checks: `node --check server.js` and `node --check main.js`
- Run migration dry run and live run
- Validate transposition for `Ab`, `Db`, `Gb`, `Eb`, `Bb`, `D#`, `A#`
- Validate songs scan filters and setlist transpose responses

## 6) Critical Places to Revisit During Any Future Accidental Policy Change
- `main.js`
- `server.js`
- `index.html`
- `migrate-chord-accidentals.js`
- `loops/melodies/atmosphere/` filenames
- `loops/melodies/tanpura/` filenames
- Any future docs/scripts referencing canonical key arrays
