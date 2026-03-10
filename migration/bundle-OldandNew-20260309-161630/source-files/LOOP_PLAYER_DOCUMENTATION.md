# Loop Player System v3.0 - Documentation

**Version**: 3.0.0  
**Last Updated**: March 9, 2026

**Changelog**:
- v3.0.0: Switched to deterministic `rhythmSetId` runtime flow, added Rhythm Mapper admin workspace, and documented rename/recompute lifecycle
- v2.0.4: Added comprehensive Function Reference section
- v2.0.3: Added tempo BPM-to-category conversion details and genre array documentation
- v2.0.2: Updated with matching algorithm details
- v2.0.1: Added troubleshooting and admin sections
- v2.0.0: Complete rewrite with technical matching logic

---

## Overview

The Loop Player System provides dynamic rhythm accompaniment for songs using pre-recorded audio loops. The current runtime resolves loops deterministically using `song.rhythmSetId` (`rhythmFamily_setNo`) instead of condition scoring at playback time.

## System Architecture

### Components

1. **Loop Files** (`/loops/` folder)
   - WAV audio files following naming convention
   - Organized by conditions (taal, time, tempo, genre)

2. **Metadata** (`/loops/loops-metadata.json`)
   - JSON database of all available loops
   - Maps files to matching conditions
   - Stores loop descriptions and timestamps

3. **Loop Manager** (`loop-manager.html` + `loop-manager.js`)
   - Admin interface for uploading and managing loops
   - Auto-generates filenames based on conditions
   - Visual preview and management

4. **Rhythm Mapper** (`rhythm-sets-manager.html` + `rhythm-sets-manager.js`)
   - Standalone admin workspace for rhythm set lifecycle
   - Create, edit, rename, and recompute rhythm sets
   - Map songs to rhythm sets and preview available loops

5. **Player Engine** (`loop-player-pad.js`)
   - Web Audio API-based loop player
   - Seamless loop switching
   - Auto-fill feature for transitions

6. **UI Integration** (`loop-player-pad-ui.js`)
   - 6-pad interface (3 loops + 3 fills)
   - Deterministic loop set resolution by `song.rhythmSetId`
   - Volume and tempo controls (90-110% range)
   - Tempo reset button for quick return to 100%

7. **API Endpoints** (`server.js`)
   - `/api/loops/metadata` - Get loops metadata
   - `/api/loops/upload` - Upload new loop set (legacy bulk upload)
   - `/api/loops/upload-single` - Upload individual file with auto-rename (v2.0)
   - `/api/loops/:id` - Delete loop
   - `/api/rhythm-sets` - List/create/update rhythm sets
   - `/api/rhythm-sets/recommend` - Recommendation endpoint for mapping
   - `/api/rhythm-sets/:rhythmSetId/recompute` - Recompute derived metadata
   - `/api/song-metadata` - Provides rhythm families used by dropdowns

8. **Melodic Pads** (`loop-player-pad.js` + `melodic-loops-manager.html`)
   - Atmosphere and tanpura pads per key
   - Samples served from `/loops/melodies/{type}/{type}_{key}.wav`
   - Uses `API_BASE_URL` for production-safe loading
   - Minor/major keys share pads (e.g., Cm -> C)

## Deterministic Rhythm Set Flow (Current)

1. Songs are stored with `rhythmFamily`, `rhythmSetNo`, and canonical `rhythmSetId`.
2. Loop uploads persist rhythm set fields in metadata and keep set definitions in sync.
3. Runtime player resolves loop set by `song.rhythmSetId` only.
4. If no valid set is available, the loop UI is hidden and deterministic mapping is required.
5. Admin workflow: create/manage set -> upload/verify loops -> map songs -> preview -> recompute as needed.

## File Naming Convention v2.0

### Format
```
{taal}_{time_signature}_{tempo}_{genre}_{TYPE}{number}.wav
```

### Components
- **taal**: keherwa, dadra, rupak, jhaptal, teental, ektaal
- **time_signature**: 4_4, 3_4, 6_8, 7_8 (slash replaced with underscore)
- **tempo**: slow (<80 BPM), medium (80-120 BPM), fast (>120 BPM)
- **genre**: acoustic, rock, rd (rhythm & drums), qawalli, blues
- **TYPE**: LOOP or FILL (uppercase)
- **number**: 1, 2, or 3

### Examples
```
keherwa_4_4_medium_acoustic_LOOP1.wav
dadra_6_8_fast_rock_FILL2.wav
teental_4_4_slow_qawalli_LOOP3.wav
```

## Matching Logic (Legacy Reference)

This section documents the older condition-scoring model kept for historical context. Current playback behavior is deterministic by `rhythmSetId`.

### Song Data Structure

**Important**: Songs store data as follows:
```javascript
{
  id: 805,
  title: "Kajra mohabbat wala",
  taal: "Keherwa",                    // String (any case - converted to lowercase)
  time: "4/4",                         // String OR timeSignature: "4/4"
  bpm: 121,                            // Number (actual BPM)
  tempo: "121",                        // Optional: legacy field (string BPM)
  genres: ["Old", "Hindi", "Qawalli"]  // Array (multi-select)
}
```

**Key Points**:
- `taal`: Stored with any casing (UI shows "Keherwa"), matching code converts to lowercase
- `bpm`: Numeric BPM value, automatically converted to tempo category during matching
- `genres`: **Array** of genre strings (multi-select field), not single string
- System handles backward compatibility if old songs have `genre` (string) instead of `genres` (array)

### Tempo BPM-to-Category Conversion

**How Tempo Matching Works:**

Songs store **numeric BPM** (e.g., `bpm: 121`), but loop filenames use **categories** (`slow`, `medium`, `fast`).

The system automatically converts BPM to category:
```javascript
function getTempoCategory(bpm) {
    if (!bpm) return 'medium';
    const bpmNum = parseInt(bpm);
    if (bpmNum < 80) return 'slow';
    if (bpmNum > 120) return 'fast';
    return 'medium';
}
```

**Conversion Table:**
| BPM Range | Category | Loop Filename Uses |
|-----------|----------|-------------------|
| < 80 | `slow` | `*_slow_*.wav` |
| 80-120 | `medium` | `*_medium_*.wav` |
| > 120 | `fast` | `*_fast_*.wav` |

**Example:**
- Song has `bpm: 121`
- System converts: `121 > 120` → `"fast"`
- Matches loops: `keherwa_4_4_**fast**_qawalli_*.wav` ✅

**Important**: Do NOT store tempo categories in songs! Always store numeric BPM:
```javascript
// ✅ CORRECT
{ bpm: 121 }

// ❌ WRONG
{ tempo: "fast" }
```

### How Matching Works

When a song is played, the system:

1. **Extracts and Normalizes Song Data**
   ```javascript
   const songTaal = (song.taal || '').toLowerCase().trim();  // "Keherwa" → "keherwa"
   const songTime = (song.time || song.timeSignature || '').trim();  // "4/4"
   const songGenres = (song.genres || []).map(g => g.toLowerCase());  // ["Qawalli"] → ["qawalli"]
   const songTempo = getTempoCategory(song.bpm || song.tempo);  // 121 → "fast"
   ```

2. **Filters by Required Conditions** (MUST match - COMPULSORY)
2. **Filters by Required Conditions** (MUST match - COMPULSORY)
   - **Taal**: Flexible substring matching (case-insensitive)
     - `"keherwa"` in song matches `"keherwa"` in loop ✅
     - `"keherwa slow"` in song matches `"keherwa"` in loop ✅ (contains)
   - **Time signature**: Exact match or equivalent (e.g., 6/8 ≡ 3/4)
   - If EITHER condition doesn't match, loop set is completely filtered out

3. **Ranks by Optional Conditions** (Boost score for best match selection)
   - **Genre match**: +5 points
     - Checks if ANY genre in song's genres array matches loop genre
     - Uses flexible matching: "Qawalli" contains "qawalli" ✅
   - **Tempo match**: +3 points
     - BPM automatically converted to category for matching
   - **Complete set** (6 files): +2 points
   - **Base score** for taal + time match: 10 points

4. **Selects Best Match**
   - Loop set with highest score is loaded
   - If no match found (score < 10), loop player is hidden

### Match Quality Levels
- **Perfect Match** (18+ points): All conditions match (Required + Genre + Tempo + Complete)
- **Excellent Match** (15+ points): Required + Genre OR Tempo + Complete
- **Good Match** (10-14 points): Required only (Taal + Time)
- **No Match** (< 10 points): Player hidden

### Required vs Optional Conditions

**COMPULSORY (Required):**
- ✅ **Taal** - Loop won't show if this doesn't match
- ✅ **Time Signature** - Loop won't show if this doesn't match

**OPTIONAL (Scoring):**
- Genre - Helps select best match when multiple options exist
- Tempo - Helps select best match when multiple options exist
- Complete Set - Slightly favors complete 6-file sets

**Example**: A song with Taal=Keherwa and Time=4/4 will ONLY see loops that have Keherwa and 4/4. Among multiple keherwa_4_4_* loop sets, the one with matching genre/tempo scores highest.

### Example Matching

**Song**: "Kajra mohabbat wala" (Song ID 805)
```javascript
{
  taal: "Keherwa",                    // Converted to "keherwa"
  time: "4/4",                         // Exact match needed
  bpm: 121,                            // Converted to "fast" (121 > 120)
  genres: ["Old", "Mid", "Hindi", "Qawalli", "Female"]  // Array checked
}
```

**Available Loop Sets**:
1. `keherwa_4_4_fast_qawalli_*` → **Score: 20** (Perfect - all match)
   - Taal: "keherwa" = "keherwa" ✅ (+10 base)
   - Time: "4/4" = "4/4" ✅ (required)
   - Tempo: "fast" = "fast" ✅ (+3)
   - Genre: "qawalli" in ["qawalli", ...] ✅ (+5)
   - Complete set ✅ (+2)

2. `keherwa_4_4_medium_acoustic_*` → **Score: 12** (Good)
   - Taal: ✅ (+10)
   - Time: ✅ (required)
   - Tempo: "medium" ≠ "fast" ❌ (0)
   - Genre: "acoustic" not in genres ❌ (0)
   - Complete set ✅ (+2)

3. `dadra_6_8_fast_qawalli_*` → **Filtered out** (taal/time mismatch)
   - Taal: "dadra" ≠ "keherwa" ❌
   - Time: "6/8" ≠ "4/4" ❌

**Result**: System loads `keherwa_4_4_fast_qawalli_*` loops (score: 20)

## Melodic Pads (Atmosphere/Tanpura)

### How Melodic Pads Load

- Samples are fetched from `${API_BASE_URL}/loops/melodies/{type}/{type}_{key}.wav`.
- Availability checks use GET requests to avoid HEAD restrictions on some CDNs.
- Major and minor keys share the same pad samples (for example, Cm uses C).

### Sample Naming

```
atmosphere_C.wav
tanpura_C.wav
atmosphere_C#.wav
tanpura_C#.wav
```

## Using the Loop Manager

### Accessing
- Navigate to `/loop-manager.html` (requires admin authentication)
- OR click "Loop Manager" link in Admin Panel popup (from main app)
- For song mapping and set management, use `/rhythm-sets-manager.html` (Rhythm Mapper)

### Uploading a New Loop Set v2.0

**Upload Method**: Individual file uploads with automatic renaming

1. **Select Conditions**
   - Choose Taal, Time Signature, Tempo, Genre
   - Filename pattern is generated and displayed automatically
   - All 6 upload buttons show expected filenames

2. **Upload Files Individually**
   - **6 Upload Slots**: Loop 1, Loop 2, Loop 3, Fill 1, Fill 2, Fill 3
   - For each slot:
     1. Click "Choose File" and select your WAV file
     2. Upload button becomes enabled (green)
     3. Click "Upload" button for that slot
     4. File is automatically renamed to match the pattern
     5. Status indicator shows success (✅) or error (❌)
   
3. **File Requirements**
   - Format: WAV (uncompressed)
   - Sample rate: 44.1kHz or 48kHz
   - Bit depth: 16-bit or 24-bit
   - No specific naming required (auto-renamed on server)

**Benefits of Individual Upload:**
- Upload files one at a time or all at once
- Replace individual files without re-uploading entire set
- Better error handling per file
- Clear status feedback for each upload
- No need to rename files manually

### Managing Loops

- **Preview**: Click play button to preview any loop
- **Delete**: Click trash icon to remove a loop file
- **Stats**: View total loop sets, taals, genres, and files

## Technical Specifications

### Audio Requirements
- **Format**: WAV (uncompressed) only
- **Sample Rate**: 44.1kHz or 48kHz recommended
- **Bit Depth**: 16-bit or 24-bit
- **Channels**: Stereo or Mono
- **Duration**: 
  - Loops: 2-8 bars typically
  - Fills: 1-2 bars typically
- **Seamlessness**: Loop start/end should align perfectly

### File Size Limits
- Individual file: < 10MB recommended
- Loop set (6 files): < 50MB total
- Consider Vercel deployment limits

### Browser Compatibility
- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support (iOS requires user gesture)
- Opera: ✅ Full support

## API Reference

### GET /api/loops/metadata
Get all loops metadata

**Response:**
```json
{
  "version": "2.0",
  "loops": [{
    "id": "keherwa_4_4_medium_acoustic_loop1",
    "filename": "keherwa_4_4_medium_acoustic_LOOP1.wav",
    "type": "loop",
    "number": 1,
    "conditions": {
      "taal": "keherwa",
      "timeSignature": "4/4",
      "tempo": "medium",
      "genre": "acoustic"
    },
    "metadata": {
      "duration": 0,
      "uploadedAt": "2026-02-15T10:00:00Z",
      "description": "Acoustic keherwa loop"
    }
  }],
  "tempoRanges": {...},
  "supportedTaals": [...],
  "supportedGenres": [...],
  "supportedTimeSignatures": [...]
}
```

### POST /api/loops/upload
Upload new loop set (legacy bulk upload)

**Authorization**: Required (Bearer token)

**Form Data**:
- `taal`: String
- `timeSignature`: String
- `tempo`: String (slow|medium|fast)
- `genre`: String
- `description`: String (optional)
- `loopFiles`: File[] (6 WAV files)

**Response:**
```json
{
  "success": true,
  "uploaded": 6,
  "files": ["keherwa_4_4_medium_acoustic_LOOP1.wav", ...],
  "pattern": "keherwa_4_4_medium_acoustic"
}
```

### POST /api/loops/upload-single
Upload individual file with automatic renaming (v2.0)

**Authorization**: Required (Bearer token)

**Form Data**:
- `taal`: String (e.g., "keherwa")
- `timeSignature`: String (e.g., "4/4")
- `tempo`: String (slow|medium|fast|very_fast)
- `genre`: String (e.g., "acoustic")
- `type`: String ("loop" or "fill")
- `number`: Number (1, 2, or 3)
- `file`: File (single WAV file)

**Response:**
```json
{
  "success": true,
  "filename": "keherwa_4_4_medium_acoustic_LOOP1.wav",
  "loopId": "keherwa_4_4_medium_acoustic_loop1"
}
```

### DELETE /api/loops/:loopId
Delete a loop file

**Authorization**: Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "deleted": "keherwa_4_4_medium_acoustic_LOOP1.wav"
}
```

## Function Reference

### Core Loop Player Engine Functions

**File**: `loop-player-pad.js`

#### Audio Playback Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `loadLoops(loopMap, songId)` | loopMap: Object, songId: Number | Promise<void> | Load and decode loop audio files for a song. Checks if reload is needed before loading. |
| `needsLoopReload(songId, newLoopMap)` | songId: Number, newLoopMap: Object | Boolean | Determines if loops need reloading by comparing song ID and loop URLs. |
| `play(loopKey)` | loopKey: String | void | Start playing a specific loop (loop1, loop2, loop3). |
| `stop()` | None | void | Stop all loop playback. |
| `switchLoop(newLoopKey, useAutoFill)` | newLoopKey: String, useAutoFill: Boolean | void | Switch to a different loop with optional auto-fill transition. |
| `setVolume(value)` | value: Number (0-1) | void | Set volume for rhythm loops. |
| `setTempo(tempoMultiplier)` | tempoMultiplier: Number | void | Adjust playback tempo (0.9-1.1 = 90%-110%). |

#### Internal Audio Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `_decodeAudioData(url, loopKey)` | url: String, loopKey: String | Promise<AudioBuffer> | Decode WAV file into AudioBuffer. |
| `_startLoop(loopKey)` | loopKey: String | void | Start Web Audio API loop playback. |
| `_stopLoop()` | None | void | Stop current loop source node. |
| `_playFill(fillKey, onEndedCallback)` | fillKey: String, callback: Function | void | Play fill transition, call callback when done. |

#### Melodic Pad Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `playMelodicPad(type, key)` | type: 'atmosphere'\|'tanpura', key: String | Promise<void> | Play melodic pad sample (e.g., atmosphere_C.wav). |
| `stopMelodicPad(type)` | type: String | void | Stop melodic pad playback. |
| `setMelodicVolume(value)` | value: Number (0-1) | void | Set volume for atmosphere and tanpura pads (with 0.4x ratio between them). |
| `checkMelodicAvailability(type, key)` | type: String, key: String | Promise<Boolean> | Check if melodic sample file exists on server. |
| `getMelodicUrl(type, key)` | type: String, key: String | String | Get URL for melodic sample file. |
| `normalizeKeyForMelodic(key)` | key: String | String | Normalize key to handle enharmonic equivalents (G# → Ab). |

#### Utility Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `_initializeSilent()` | None | void | Initialize AudioContext without playing sound (for availability checks). |
| `_restoreVolumeFromSilent()` | None | void | Restore proper volume levels after silent initialization. |

---

### Loop Player UI and Matching Functions

**File**: `loop-player-pad-ui.js`

#### Initialization Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `initializeLoopPlayer(songId)` | songId: Number | Promise<void> | Main initialization function. Finds matching loops and sets up UI. |
| `getLoopsMetadata()` | None | Promise<Object> | Load loops metadata from API (cached). |
| `setupLoopPlayerEventListeners(songId, loopMap)` | songId: Number, loopMap: Object | void | Setup all event listeners with clone-replace pattern to prevent duplicates. |

#### Matching Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `findMatchingLoopSet(song)` | song: Object | Promise<{loopSet, score}\|null> | Find best matching loop set for song based on taal, time, tempo, genre. |
| `getTempoCategory(bpm)` | bpm: Number\|String | String | Convert BPM number to tempo category: <80="slow", 80-120="medium", >120="fast". |
| `areTimeSignaturesEquivalent(time1, time2)` | time1: String, time2: String | Boolean | Check if time signatures are equivalent (e.g., 6/8 ≡ 3/4). |
| `getMatchQuality(score)` | score: Number | Object | Get match quality label and description from score (0-20 points). |
| `shouldShowLoopPlayer(song)` | song: Object | Promise<Boolean> | Check if song has matching loops available. |

#### UI Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getLoopPlayerHTML(songId)` | songId: Number | String | Generate complete loop player HTML structure. |
| `toggleLoopPlayer(songId)` | songId: Number | void | Toggle expand/collapse state (saves to localStorage). |
| `cleanupLoopPlayer()` | None | void | Clean up loop player state and stop all playback. |
| `showLoopPlayer(songId)` | songId: Number | void | Show loop player UI. |
| `hideLoopPlayer(songId)` | songId: Number | void | Hide loop player (no matching loops found). |

#### Melodic Pad Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getTransposeLevel(song)` | song: Object | Number | Get transpose level from global/user settings. |
| `getEffectiveKey(song, transposeLevel)` | song: Object, transposeLevel: Number | String | Calculate effective key after transposing. |
| `updateMelodicPadAvailability(songId)` | songId: Number | Promise<void> | Check and update availability status of melodic pads. |

#### Global Variables

| Variable | Type | Description |
|----------|------|-------------|
| `loopPlayerInstance` | Object\|null | Singleton instance of loop player engine. |
| `loopsMetadataCache` | Object\|null | Cached loops metadata from `/api/loops/metadata`. |
| `window.getLoopPlayerInstance()` | Function | Global accessor function for loop player instance. |

---

## Deployment Considerations

### Vercel Deployment

1. **Commit loop files to Git**
   ```bash
   git add loops/*.wav loops/loops-metadata.json
   git commit -m "Add loop files"
   git push
   ```

2. **Verify vercel.json routes**
   - Static routes for `/loops/` folder configured
   - API routes for loop management configured

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Test**
   - Check `/loops/filename.wav` accessibility
   - Test loop manager upload
   - Verify song matching works

### GitHub Pages (Alternative)
⚠️ **Not Recommended** - GitHub Pages is static only, cannot handle:
- API endpoints for upload/delete
- Dynamic metadata management
- Authentication

Use Vercel, Netlify, or similar platforms that support serverless functions.

## Migration from v1.0

### Old Format
```
keherwa_4_4_LOOP1.wav
```

### New Format
```
keherwa_4_4_medium_acoustic_LOOP1.wav
```

### Migration Steps

1. **Analyze existing loops**
   - Identify tempo category (slow/medium/fast)
   - Identify genre (acoustic/rock/rd/qawalli/blues)

2. **Rename files**
   - Manually rename following new convention
   - Or use Loop Manager to re-upload with conditions

3. **Update metadata**
   - Ensure `loops-metadata.json` includes all files
   - Or use API to register after renaming

4. **Test matching**
   - Verify songs find correct loops
   - Check match quality scores

## Troubleshooting

### Loop Player Not Showing
- ❌ **Song missing taal or time**: Add metadata to song
- ❌ **No matching loops**: Upload loops for that taal/time combination
- ❌ **Metadata not loaded**: Check `/api/loops/metadata` endpoint
- ❌ **Mismatch in conditions**: Taal AND Time Signature must both match
- ❌ **Taal case mismatch**: Use lowercase taals in database ("keherwa" not "Keherwa") - or run `normalize-loop-data.js`
- ❌ **Genre not in array**: Ensure song has `genres: ["Genre"]` array, not `genre: "Genre"` string
- ❌ **BPM missing**: Add numeric BPM to song for tempo matching

### Loops Not Playing
- ❌ **AudioContext blocked**: Ensure user clicked play button first (browser autoplay policy)
- ❌ **File not found**: Check `/loops/` folder and filenames
- ❌ **Wrong format**: Ensure files are WAV, not MP3
- ❌ **Corrupt files**: Check browser console for "Failed to decode" warnings

### Corrupt or Invalid Audio Files
**Symptom**: Some loop pads don't work, console shows "Failed to decode" warnings

**Cause**: WAV file is corrupt, has invalid headers, or unsupported encoding

**Solution**:
1. Re-export the audio file from your DAW/audio editor
2. Use standard settings: 44.1kHz, 16-bit, PCM encoding
3. Test file in audio player before uploading
4. Delete corrupt file and re-upload

**Note**: App will continue working with partial loop set (graceful degradation)

### Upload Failed
- ❌ **Not authenticated**: Login as admin first
- ❌ **Wrong format**: Only WAV files accepted
- ❌ **File too large**: Compress or optimize WAV files (< 10MB per file recommended)
- ❌ **Server error**: Check server logs and network tab in DevTools

### Match Score Too Low
- ✅ **Add more specific loops**: Create loops matching song's genre/tempo
- ✅ **Update song metadata**: Add genres array and BPM to songs
- ✅ **Check taal spelling**: Ensure match (case-insensitive, flexible substring)
- ✅ **Check genre array**: Use browser console to verify `song.genres` is an array
- ✅ **Verify BPM category**: Check if song BPM converts to expected tempo:
  ```javascript
  // In browser console:
  console.log('BPM:', window.currentSong?.bpm);
  console.log('Converts to:', window.currentSong?.bpm < 80 ? 'slow' : 
                             window.currentSong?.bpm > 120 ? 'fast' : 'medium');
  ```

### Data Inconsistencies
If you have many songs with data quality issues, run the normalization script:
```bash
node normalize-loop-data.js
```

This script will:
- Convert all taals to lowercase for consistency
- Ensure all songs have `genres` array (converts old `genre` string)
- Validate BPM is numeric (not string)
- Generate a data quality report
- Update metadata safely with audit trail

## Best Practices

### For Administrators

1. **Organize by condition sets**
   - Create full sets (6 files) at once
   - Use consistent naming

2. **Quality over quantity**
   - High-quality recordings only
   - Seamless loops with proper start/end points

3. **Test before production**
   - Preview all loops in Loop Manager
   - Test with actual songs

### For Developers

1. **Extend matching logic**
   - Modify `findMatchingLoopSet()` for custom scoring
   - Add new conditions as needed

2. **Add new tempo ranges**
   - Update `tempoRanges` in metadata schema
   - Modify `getTempoCategory()` function

3. **Support new genres**
   - Add to `supportedGenres` array
   - Update Loop Manager dropdown

## Future Enhancements

### Planned Features
- [ ] Multiple loop sets per condition (user selection)
- [ ] BPM-based playback rate adjustment
- [ ] Loop waveform visualization
- [ ] Batch upload for many loop sets
- [ ] Cloud storage integration (S3, Cloudinary)
- [ ] AI-based tempo/genre detection

### Possible Improvements
- Real-time loop recording
- MIDI synchronization
- Per-song loop customization
- Loop mixing/layering
- Export custom loop patterns

## Support

For issues or questions:
1. Check this documentation
2. Review code comments in source files
3. Test with browser DevTools console open
4. Check server logs for API errors

---

**Version**: 2.0.3  
**Last Updated**: February 28, 2026 - 11:45 AM  
**Author**: Loop Player System Team  

**Changes in v2.0.3** (February 28, 2026):
- **CRITICAL FIX**: Genre array matching bug - songs with multi-select genres now properly match loops
- Added flexible genre matching (partial string match) for better compatibility
- Clarified tempo BPM-to-category conversion system
- Updated documentation to reflect actual data structure (genres array, not genre string)

**Changes in v2.0.2**:
- Individual file upload system with auto-renaming
- Tempo reset button added
- Graceful error handling for corrupt audio files
- Admin panel integration (Loop Manager link)
- Clarified compulsory vs optional matching conditions
- Melodic pads use API_BASE_URL and GET checks for production support
- Major/minor key normalization for melodic pads
