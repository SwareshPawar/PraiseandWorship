# Loop Audio File Serving & Access Analysis

## 1. URL PATTERNS USED

### Static File Serving
```
Base URL: {API_BASE_URL}/loops/
Pattern: {API_BASE_URL}/loops/{filename}
Example: https://praiseand-worship.vercel.app/loops/keherwa_4_4_LOOP1.wav
```

### Melodic Sample Files
```
Base URL: {API_BASE_URL}/loops/melodies/
Pattern: {API_BASE_URL}/loops/melodies/{sampleType}/{filename}
Example: https://praiseand-worship.vercel.app/loops/melodies/atmosphere/atmosphere_C.wav
```

### API Endpoints
```
GET  /api/loops/metadata           - Returns all loop metadata
POST /api/loops/upload-single      - Upload single loop file (admin only)
DELETE /api/loops/:loopId          - Delete loop by ID
POST /api/loops/:loopId/replace    - Replace existing loop
GET  /api/melodic-loops            - List available melodic samples
```

---

## 2. FRONTEND URL CONSTRUCTION

### Primary Method: `loop-player-pad-ui.js` (line 581)
```javascript
const loopMap = Object.entries({
    loop1: loopSet.files.loop1,
    loop2: loopSet.files.loop2,
    loop3: loopSet.files.loop3,
    fill1: loopSet.files.fill1,
    fill2: loopSet.files.fill2,
    fill3: loopSet.files.fill3
}).reduce((acc, [name, filename]) => {
    if (filename) {
        acc[name] = `${API_BASE_URL}/loops/${encodeURIComponent(filename)}`;
    }
    return acc;
}, {});
```

### Fallback URL Resolution: `loop-player-pad.js`

**Method: `_buildLoopAssetCandidates()` (line 720-750)**
Tries multiple base URLs in order:
1. `API_BASE_URL` (primary Vercel)
2. `API_BASE_URL_RENDER` (Render fallback)
3. `API_BASE_URL_VERCEL` (explicit Vercel)
4. `window.location.origin` (current domain)

```javascript
_buildLoopAssetCandidates(urlOrPath) {
    const raw = String(urlOrPath || '').trim();
    if (!raw) return [];

    const isAbsolute = /^https?:\/\//i.test(raw);
    const bases = this._getLoopAssetBaseUrls();
    
    if (isAbsolute) {
        return [raw];  // Use absolute URL as-is
    } else if (assetPath.toLowerCase().startsWith('/loops/')) {
        // Prepend each base URL to the path
        return bases.map(base => `${base}${assetPath}`);
    }
}
```

### Melodic Sample URLs: `loop-player-pad.js` (line 145-165)
```javascript
async _resolveMelodicSampleUrl(sampleType, effectiveKey, baseUrl) {
    const url = `${baseUrl}/loops/melodies/${sampleType}/${encodeURIComponent(match.filename)}`;
    // Or fallback:
    const url = `${baseUrl}/loops/melodies/${sampleType}/${sampleType}_${encodedKey}.wav`;
}
```

---

## 3. BACKEND API RESPONSES

### GET `/api/loops/metadata` Response Structure
```json
{
  "version": "2.0",
  "loops": [
    {
      "id": "dadra_3_4_medium_dholak_loop1",
      "filename": "dadra_3_4_medium_dholak_LOOP1.wav",
      "type": "loop",
      "number": 1,
      "rhythmFamily": "dadra",
      "rhythmSetNo": 1,
      "rhythmSetId": "dadra_1",
      "conditions": {
        "taal": "dadra",
        "timeSignature": "3/4",
        "tempo": "medium",
        "genre": "dholak"
      },
      "files": {
        "loop1": "dadra_3_4_medium_dholak_LOOP1.wav"
      },
      "metadata": {
        "duration": 0,
        "uploadedAt": "2026-02-15T14:19:00.495Z"
      }
    }
  ],
  "rhythmSets": [
    {
      "rhythmSetId": "dadra_1",
      "rhythmFamily": "dadra",
      "rhythmSetNo": 1,
      "fileCount": 6
    }
  ],
  "tempoRanges": {
    "slow": { "min": 0, "max": 80 },
    "medium": { "min": 80, "max": 120 },
    "fast": { "min": 120, "max": 999 }
  },
  "supportedTaals": ["dadra", "keherwa", "deepchandi", ...],
  "supportedGenres": ["dholak", "folk", "classical", ...],
  "supportedTimeSignatures": ["3/4", "4/4", "14/8", ...]
}
```

### Cached Response
- **TTL**: 30 seconds (`LOOPS_METADATA_CACHE_TTL = 30000`)
- **Location**: `loopsMetadataCache` in `loop-player-pad-ui.js`
- **Invalidation**: Cross-tab signal via `localStorage.loopsMetadataInvalidatedAt`

---

## 4. DATABASE STORAGE STRUCTURE

### File System Location
```
/loops/
  ├── loops-metadata.json
  ├── keherwa_4_4_LOOP1.wav
  ├── keherwa_4_4_LOOP2.wav
  ├── keherwa_4_4_LOOP3.wav
  ├── keherwa_4_4_FILL1.wav
  ├── keherwa_4_4_FILL2.wav
  ├── keherwa_4_4_FILL3.wav
  ├── dadra_3_4_medium_dholak_LOOP1.wav
  ├── dadra_3_4_medium_dholak_LOOP2.wav
  └── melodies/
      ├── atmosphere/
      │   ├── atmosphere_C.wav
      │   ├── atmosphere_C#.wav
      │   └── ...
      └── tanpura/
          ├── tanpura_C.wav
          ├── tanpura_C#.wav
          └── ...
```

### MongoDB Collection: `RhythmSets`
```javascript
{
  rhythmSetId: "dadra_1",
  rhythmFamily: "dadra",
  rhythmSetNo: 1,
  createdAt: "2026-02-15T14:19:00.000Z",
  updatedAt: "2026-02-15T14:19:00.000Z",
  status: "active",
  mappedSongCount: 5
}
```

### Loop File Naming Convention (v2.0)
```
Format: {taal}_{timeSignature}_{tempo}_{genre}_{TYPE}{number}.wav

Examples:
- dadra_3_4_medium_dholak_LOOP1.wav
- keherwa_4_4_fast_folk_LOOP2.wav
- deepchandi_14_8_slow_classical_FILL1.wav

Components:
- {taal}: Rhythm family (dadra, keherwa, deepchandi, etc.)
- {timeSignature}: 3/4, 4/4, 14/8, etc. (normalized to 3_4, 4_4, 14_8)
- {tempo}: slow, medium, fast (based on BPM ranges)
- {genre}: dholak, folk, classical, etc.
- {TYPE}: LOOP or FILL (uppercase)
- {number}: 1, 2, or 3
```

---

## 5. ERROR MESSAGES & LOGGING

### Client-Side Error Messages (in `loop-player-pad.js`)

**When loading fails:**
```javascript
console.warn(`Loop ${name} not found`);  // Line 1256
console.error(`Failed to fetch ${name}:`, error);  // Multiple locations
```

**When audio buffer missing:**
```javascript
if (!buffer) {
    console.warn(`Loop ${name} not found`);
    return;
}
```

**For melodic samples:**
```javascript
console.warn(`Melodic sample ${key} not found (also tried enharmonic equivalent)`);
```

### Server-Side Error Messages (in `/api/loops.js`)

**HTTP 404 Response:**
```javascript
return res.status(404).json({ error: 'Loop not found' });  // Line 209, 230
```

**Validation Errors:**
```javascript
// Missing required fields
{ error: 'Missing required fields for loop upload' }

// Invalid rhythm set
{ error: 'Invalid rhythmFamily/rhythmSetNo combination' }

// Filename derivation failed
{ error: 'Could not derive filename/id from provided metadata' }
```

### Serverless Runtime Limitations (in `/api/loops.js`)
```javascript
if (isServerlessRuntime()) {
    return res.status(501).json({
        error: 'Write operations are not supported in serverless runtime',
        message: 'Use local backend for loop file upload/replace/delete operations.'
    });
}
```

---

## 6. HARDCODED PATHS vs DYNAMIC PATHS

### Hardcoded (Backward Compatibility)
```javascript
// Default fallback in loop-player-pad.js (line 269-274)
loopMap = {
    'loop1': '/loops/keherwa_4_4_LOOP1.wav',
    'loop2': '/loops/keherwa_4_4_LOOP2.wav',
    'loop3': '/loops/keherwa_4_4_LOOP3.wav',
    'fill1': '/loops/keherwa_4_4_FILL1.wav',
    'fill2': '/loops/keherwa_4_4_FILL2.wav',
    'fill3': '/loops/keherwa_4_4_FILL3.wav'
};
```

### Dynamic (Runtime)
```javascript
// From API metadata via songs' rhythmSetId
const loopSet = rhythmSets.find(set => set.rhythmSetId === song.rhythmSetId);
const filename = loopSet.files.loop1;  // e.g., "dadra_3_4_medium_dholak_LOOP1.wav"
const url = `${API_BASE_URL}/loops/${encodeURIComponent(filename)}`;
```

---

## 7. LOADING FLOW

### Step 1: Fetch Metadata
```javascript
// In loop-player-pad-ui.js (line 52)
const requestUrl = `${API_BASE_URL}/api/loops/metadata`;
const metadata = await fetch(requestUrl).then(r => r.json());
```

### Step 2: Match Song to Rhythm Set
```javascript
// In loop-player-pad-ui.js (line ~568)
const rhythmSets = buildRhythmSetIndexFromMetadata(metadata);
const loopSet = rhythmSets.find(set => set.rhythmSetId === song.rhythmSetId);
```

### Step 3: Build URL Map
```javascript
// In loop-player-pad-ui.js (line 581)
const url = `${API_BASE_URL}/loops/${encodeURIComponent(filename)}`;
```

### Step 4: Fetch Raw Audio Data
```javascript
// In loop-player-pad.js (line 308)
const response = await this._fetchLoopAsset(url);
const arrayBuffer = await response.arrayBuffer();
this.rawAudioData.set(name, arrayBuffer);
```

### Step 5: Decode After User Gesture
```javascript
// In loop-player-pad.js (line 214)
const audioBuffer = await this.audioContext.decodeAudioData(rawData.slice());
this.audioBuffers.set(name, audioBuffer);
```

---

## 8. DEPLOYMENT CONSIDERATIONS

### Server Configuration
```javascript
// Server.js (line ~47)
const loopsStaticDir = path.join(__dirname, 'loops');
app.use('/loops', express.static(loopsStaticDir));
```

### CORS Origins Allowed
- `https://praiseand-worship.vercel.app` (primary)
- `https://praiseand-worship-*.vercel.app` (all preview deploys)
- `https://*-swareshs-projects.vercel.app` (user-specific Vercel)
- `https://swareshpawar.github.io` (GitHub Pages)
- `https://praiseandworship.onrender.com` (Render)
- `https://*.onrender.com` (all Render domains)

### Static File Size Limits
```javascript
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const loopUpload = multer({
    limits: { fileSize: 50 * 1024 * 1024 }  // 50MB
});
```

---

## 9. KEY TAKEAWAYS

| Aspect | Details |
|--------|---------|
| **Primary URL Pattern** | `{API_BASE_URL}/loops/{filename}` |
| **Frontend Construction** | URL built from metadata → song.rhythmSetId → loopSet.files |
| **Backend Storage** | `/loops/` directory + `loops-metadata.json` |
| **Metadata Source** | `/api/loops/metadata` endpoint |
| **Error Response** | HTTP 404 with `{ error: 'Loop not found' }` |
| **Hardcoded Fallback** | `keherwa_4_4_LOOP*.wav` (backward compatibility) |
| **Melodic Samples** | Separate path: `/loops/melodies/{type}/{key}.wav` |
| **Format Version** | v2.0 with structured naming convention |
| **Deployment** | Serverless runtime disables write operations |
