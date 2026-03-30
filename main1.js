// Service worker is intentionally disabled to avoid stale asset/cache behavior.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.getRegistrations()
            .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
            .then(() => {
                console.log('Service Worker: Disabled and unregistered existing registrations');
            })
            .catch((err) => {
                console.warn('Service Worker: Failed to unregister existing registrations', err);
            });
    });
}

if ('caches' in window) {
    window.addEventListener('load', () => {
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('pw-'))
                    .map((key) => caches.delete(key))
            ))
            .then(() => {
                console.log('Cache Storage: Cleared Praise & Worship caches');
            })
            .catch((err) => {
                console.warn('Cache Storage: Failed to clear Praise & Worship caches', err);
            });
    });
}
// --- GLOBAL CONSTANTS AND VARIABLES ---
// --- Cache expiry times in milliseconds (move to top to avoid ReferenceError) ---
const CACHE_EXPIRY = {
    songs: 5 * 60 * 1000,      // 5 minutes
    userdata: 10 * 60 * 1000,  // 10 minutes
    setlists: 2 * 60 * 1000    // 2 minutes
};  
let deferredPrompt;
// Global variables for app state
let jwtToken = localStorage.getItem('pw_jwtToken') || '';
let currentUser = null;
let isDarkMode = localStorage.getItem('pw_darkMode') === 'true';
let songs = []; // Global songs array

// Expose to window for mobile.html access
window.jwtToken = jwtToken;
window.currentUser = currentUser;

// Initialize currentUser from localStorage
try {
    const storedUser = localStorage.getItem('pw_currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        window.currentUser = currentUser;
    }
} catch (e) {
    // Failed to parse stored user data - continue with default
}

const PW_GENRES = [
    "Praise",
    "Worship",
    "Hymns",
    "Hindi",
    "Marathi",
    "English",
    "Contemporary",
    "Desi",
    "Gospel",
    "Meditative",
    "Traditional",
    "Celebration",
    "Thanksgiving",
    "Love",
    "Others"
];

const PW_VOCAL_TAGS = ['Male', 'Female', 'Duet'];


const PW_KEYS = [
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
    "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"
];
const PW_CATEGORIES = ["Praise", "Worship"];
const PW_TIMES = ["4/4", "3/4", "2/4", "6/8", "5/4", "7/8","12/8","14/8"];
const PW_TAALS = [
    "Keherwa", "Keherwa Slow", "Dadra", "Dadra Slow", "RD Pattern", "Desi Drum", "Western", "Waltz", "Rock", "Jazz", "March Rhythm","EkTaal", "JhapTaal", "TeenTaal","Rupak", "Deepchandi", "Garba"
];

const PW_MOODS = [
    "Dance", "Christmas", "Easter", "Action", "Forgiveness","Thanksgiving","Good Friday", "Holy Spirit","Love","Qawalli","Miracle"
];

const PW_ARTISTS = [
  // Legendary Male Singers
    "Traditional","New","Old","Favorites","Rock","Evergreen"
];


const PW_TIME_GENRE_MAP = {
    "4/4": [
        "Keherwa", "Keherwa Slow","Keherwa Bhajani",  "Bhangra", "Pop", "Rock", "Jazz"
    ],
    "3/4": ["Waltz","Western", "Darda"],
    "2/4": ["Waltz","Western", "March", "Polka", "Samba"],
    "6/8": ["Rock","Dadra", "Dadra Slow","Dadra Bhajani", "Bhangra in 6/8", "Garba",],
    "5/4": ["JhapTaal", "Sultaal", "Jazz 5-beat"],
    "7/8": ["Rupak", "Rupak Ghazal", "Deepchandi"],
    "12/8": ["EkTaal","Chautaal", "Afro-Cuban 12/8", "Doha Taal", "Ballad 12/8"],
    "14/8": ["Deepchandi","Dhamaar"],
    "16/8": ["TeenTaal"]
};

const DEFAULT_RECOMMENDATION_WEIGHTS = {
    language: 20,
    scale: 25,
    timeSignature: 20,
    taal: 15,
    tempo: 5,
    genre: 5,
    vocal: 5,
    mood: 5,
    rhythmCategory: 0
};

let recommendationWeights = (() => {
    try {
        const stored = JSON.parse(
            localStorage.getItem('pw_recommendationWeights')
            || localStorage.getItem('recommendationWeights')
            || '{}'
        );
        return { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...(stored || {}) };
    } catch {
        return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
    }
})();

function setRecommendationWeightsState(nextWeights) {
    recommendationWeights = {
        ...DEFAULT_RECOMMENDATION_WEIGHTS,
        ...(nextWeights || {})
    };

    // Keep compatibility for legacy code that still reads window/global WEIGHTS.
    globalThis.PW_RECOMMENDATION_WEIGHTS = recommendationWeights;
    globalThis.WEIGHTS = recommendationWeights;
    return recommendationWeights;
}

setRecommendationWeightsState(recommendationWeights);

// --- CHORD TYPES: single source of truth ---
const PW_CHORD_TYPES = [
    // Longest patterns first to prevent partial matches
    "madd13", "madd11", "madd9", "madd7", "madd4", "madd2", // Minor add chords
    "add13", "add11", "add9", "add7", "add6", "add4", "add2", // Major add chords
    "maj13", "maj11", "maj9", "maj7", "maj", // Major chord variations
    "min13", "min11", "min9", "min7", "min", // Minor chord variations (full names)
    "m7sus4", "m7sus2", "7sus4", "7sus2", "7b13", "7#13", "7b11", "7#11", "7b9", "7#9", "7b5", "7#5", // 7th chord variations (longest first)
    "m13", "m11", "m9", "m7", "m", // Minor chord variations (short names)
    "dim7", "dim", "aug7", "aug", // Diminished and augmented
    "sus4", "sus2", "sus", // Suspended chords
    "b13", "#13", "b11", "#11", "b9", "#9", "b5", "#5", // Altered extensions
    "13", "11", "9", "7", "6", "5" // Basic numbered chords (7 should come last)
];

// Dynamic API base URL for local/dev/prod (Global scope)
const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const IS_GITHUB_PAGES = window.location.hostname.endsWith('github.io');
const API_BASE_URL_VERCEL = window.location.hostname.includes('vercel.app')
    ? window.location.origin
    : 'https://praiseand-worship.vercel.app';
let API_BASE_URL = IS_LOCALHOST
    ? 'http://localhost:3001'
    : (IS_GITHUB_PAGES ? API_BASE_URL_VERCEL : window.location.origin); // Same-origin API on Vercel/custom domain

// Backend selection is locked to local dev or Vercel.
function getStoredBackend() {
    return 'vercel';
}

function setBackend(backend) {
    if (IS_LOCALHOST) {
        API_BASE_URL = 'http://localhost:3001';
    } else if (IS_GITHUB_PAGES) {
        API_BASE_URL = API_BASE_URL_VERCEL;
    } else {
        API_BASE_URL = window.location.origin;
    }
    localStorage.setItem('pw_admin_backend', 'vercel');
    console.log('🔄 Backend fixed to: VERCEL - URL:', API_BASE_URL);
}

setBackend(getStoredBackend());
// Frontend: GitHub Pages (https://swareshpawar.github.io/PraiseandWorship/)
// Backend: Vercel same-origin (or Vercel hosted API for GitHub Pages)

console.log('API_BASE_URL:', API_BASE_URL);

// --- CHORD REGEXES: always use CHORD_TYPES ---
const PW_CHORDS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const PW_NOTE_TO_SEMITONE = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    'E#': 5,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
    Cb: 11
};
const PW_CHORD_TYPE_REGEX = PW_CHORD_TYPES.join("|");
const PW_CHORD_REGEX = new RegExp(`([A-G](?:#|b)?)(?:${PW_CHORD_TYPE_REGEX})?(?:\\/[A-G](?:#|b)?)?`, "gi");
const PW_CHORD_LINE_REGEX = new RegExp(`^(\\s*[A-G](?:#|b)?(?:${PW_CHORD_TYPE_REGEX})?(?:\\/[A-G](?:#|b)?)?[\\s\\-\\/\\|]*)+$`, "i");
const PW_INLINE_CHORD_REGEX = new RegExp(`[\\[(]([A-G](?:#|b)?(?:${PW_CHORD_TYPE_REGEX})?(?:\\/[A-G](?:#|b)?)?)[\\])]`, "gi");

function dedupeElementById(id) {
    const selector = `[id="${id}"]`;
    const matches = document.querySelectorAll(selector);
    if (!matches || matches.length <= 1) return;

    // Keep first match in document order and remove extras.
    for (let i = 1; i < matches.length; i += 1) {
        matches[i].remove();
    }
}

function dedupeFixedControls() {
    [
        'toggle-sidebar',
        'toggle-songs',
        'toggle-all-panels',
        'toggleSuggestedSongs',
        'toggleAutoScroll',
        'keepScreenOnBtn',
        'floatingStopBtn'
    ].forEach(dedupeElementById);
}

// Chord Normalization Functions
function normalizeBaseNote(note) {
    if (!note || typeof note !== 'string') return note;
    const normalizedInput = note.charAt(0).toUpperCase() + note.slice(1);
    const semitone = PW_NOTE_TO_SEMITONE[normalizedInput];
    if (semitone === undefined) return note;
    const canonical = PW_CHORDS[semitone];
    return note === note.toLowerCase() ? canonical.toLowerCase() : canonical;
}

function normalizeKeySignature(key) {
    if (!key || typeof key !== 'string') return key;
    const match = key.trim().match(/^([A-Ga-g][#b]?)(m?)$/);
    if (!match) return key;
    return `${normalizeBaseNote(match[1])}${match[2] || ''}`;
}

function normalizeSingleChordToken(chordToken) {
    if (!chordToken || typeof chordToken !== 'string') return chordToken;
    const match = chordToken.match(/^([A-Ga-g][#b]?)(.*)$/);
    if (!match) return chordToken;
    return `${normalizeBaseNote(match[1])}${match[2] || ''}`;
}

function normalizeChordAccidentals(chord) {
    if (!chord || typeof chord !== 'string') return chord;
    if (!chord.includes('/')) return normalizeSingleChordToken(chord);
    const [baseChord, bassNote] = chord.split('/');
    const normalizedBase = normalizeSingleChordToken(baseChord);
    const normalizedBass = bassNote ? normalizeSingleChordToken(bassNote) : '';
    return normalizedBass ? `${normalizedBase}/${normalizedBass}` : normalizedBase;
}

function normalizeSongAccidentals(song) {
    if (!song || typeof song !== 'object') return song;
    const normalizedSong = { ...song };
    if (typeof normalizedSong.key === 'string') {
        normalizedSong.key = normalizeKeySignature(normalizedSong.key);
    }
    if (typeof normalizedSong.manualChords === 'string' && normalizedSong.manualChords.trim()) {
        normalizedSong.manualChords = normalizedSong.manualChords
            .split(',')
            .map(c => normalizeChordAccidentals(c.trim()))
            .filter(Boolean)
            .join(', ');
    }
    return normalizedSong;
}

// Rhythm Normalization Functions
const RHYTHM_CATEGORIES = ["Indian", "Western", "Others"];

function normalizeRhythmFamilyValue(value) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '');
}

function buildRhythmSetIdValue(rhythmFamily, rhythmSetNo) {
    const family = normalizeRhythmFamilyValue(rhythmFamily);
    const setNo = parseInt(rhythmSetNo, 10);
    if (!family || !Number.isInteger(setNo) || setNo <= 0) {
        return '';
    }
    return `${family}_${setNo}`;
}

function normalizeRhythmCategoryValue(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'indian') return 'Indian';
    if (normalized === 'western') return 'Western';
    if (normalized === 'others' || normalized === 'other') return 'Others';
    return '';
}

function updateRhythmSetIdPreview(familyInputId, setNoInputId, previewInputId) {
    const familyEl = document.getElementById(familyInputId);
    const setNoEl = document.getElementById(setNoInputId);
    const previewEl = document.getElementById(previewInputId);
    if (!familyEl || !setNoEl || !previewEl) return;

    const previewValue = buildRhythmSetIdValue(familyEl.value, setNoEl.value);
    previewEl.value = previewValue || '';
}

function bindRhythmSetPreviewSync(familyInputId, setNoInputId, previewInputId) {
    const familyEl = document.getElementById(familyInputId);
    const setNoEl = document.getElementById(setNoInputId);
    if (!familyEl || !setNoEl) return;

    const listenerKey = `_rhythmPreviewBound_${previewInputId}`;

    if (!familyEl[listenerKey]) {
        familyEl.addEventListener('change', () => updateRhythmSetIdPreview(familyInputId, setNoInputId, previewInputId));
        familyEl[listenerKey] = true;
    }

    if (!setNoEl[listenerKey]) {
        setNoEl.addEventListener('input', () => updateRhythmSetIdPreview(familyInputId, setNoInputId, previewInputId));
        setNoEl[listenerKey] = true;
    }

    updateRhythmSetIdPreview(familyInputId, setNoInputId, previewInputId);
}

function populateRhythmFamilyDropdown(dropdownId, rhythmFamilies) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const selectedValue = dropdown.value;
    dropdown.innerHTML = '<option value="">Auto-assign from recommendation</option>';

    rhythmFamilies.forEach(family => {
        const option = document.createElement('option');
        option.value = family;
        option.textContent = family;
        dropdown.appendChild(option);
    });

    if (selectedValue && rhythmFamilies.includes(selectedValue)) {
        dropdown.value = selectedValue;
    }
}

function populateRhythmCategoryDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const selectedValue = normalizeRhythmCategoryValue(dropdown.value);
    dropdown.innerHTML = '<option value="">Select Rhythm Category</option>';

    RHYTHM_CATEGORIES.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        dropdown.appendChild(option);
    });

    if (selectedValue) {
        dropdown.value = selectedValue;
    }
}

// Notification throttling system to prevent duplicate backend notifications
let recentNotifications = new Map(); // Map to track recent notifications
const NOTIFICATION_THROTTLE_TIME = 10000; // 10 seconds throttle for backend notifications

function throttledShowNotification(message, type = 'info', duration = 3000) {
    const key = `${message}_${type}`;
    const now = Date.now();
    
    // Check if this exact notification was shown recently
    if (recentNotifications.has(key)) {
        const lastShown = recentNotifications.get(key);
        if (now - lastShown < NOTIFICATION_THROTTLE_TIME) {
            // Skip showing this notification as it was shown recently
            return;
        }
    }
    
    // Show the notification and record the time
    recentNotifications.set(key, now);
    showNotification(message, type, duration);
    
    // Clean up old entries to prevent memory leaks
    for (const [k, timestamp] of recentNotifications.entries()) {
        if (now - timestamp > NOTIFICATION_THROTTLE_TIME * 2) {
            recentNotifications.delete(k);
        }
    }
}

// Re-initialize variables from localStorage (no redeclaration)
jwtToken = localStorage.getItem('pw_jwtToken') || '';
isDarkMode = localStorage.getItem('pw_darkMode') === 'true';
window.jwtToken = jwtToken;

// Update currentUser from localStorage again if needed
try {
    const storedUser = localStorage.getItem('pw_currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        window.currentUser = currentUser;
    }
} catch {}

function populateGenreDropdown(id, timeSignature) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '';
    let options = PW_GENRES;
    if (timeSignature && PW_TIME_GENRE_MAP[timeSignature]) {
        options = PW_TIME_GENRE_MAP[timeSignature];
    }
    options.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        select.appendChild(opt);
    });
}

// Global data cache to prevent redundant API calls (moved outside DOMContentLoaded for global access)
window.dataCache = {
    songs: null,
    userdata: null,
    'global-setlists': null,
    'my-setlists': null,
    lastFetch: {
        songs: null,
        userdata: null,
        'global-setlists': null,
        'my-setlists': null
    },
    lastSyncTimestamp: {
        songs: null,
        userdata: null,
        'global-setlists': null,
        'my-setlists': null
    }
};



// Initialize cache from localStorage on page load
try {
    const storedSongs = localStorage.getItem('pw_songs');
    const storedSongsTimestamp = localStorage.getItem('pw_songsTimestamp');
    const storedSyncTimestamp = localStorage.getItem('pw_songsSyncTimestamp');

    function isCacheFresh(type, timestamp) {
        if (!timestamp) return false;
        const cacheAge = Date.now() - parseInt(timestamp);
        const expiry = CACHE_EXPIRY[type] || CACHE_EXPIRY.setlists;
        return cacheAge < expiry;
    }

    if (storedSongs && storedSongsTimestamp) {
        if (isCacheFresh('songs', storedSongsTimestamp)) {
            window.dataCache.songs = JSON.parse(storedSongs);
            window.dataCache.lastFetch.songs = parseInt(storedSongsTimestamp);
            if (storedSyncTimestamp) {
                window.dataCache.lastSyncTimestamp.songs = storedSyncTimestamp;
            }
        } else {
            const cacheAge = Date.now() - parseInt(storedSongsTimestamp);
            const expiry = CACHE_EXPIRY.songs;
            localStorage.removeItem('pw_songs');
            localStorage.removeItem('pw_songsTimestamp');
            localStorage.removeItem('pw_songsSyncTimestamp');
        }
    } else {
        // No cached songs found, will fetch from API
    }
} catch (e) {
    console.warn('Error loading songs from localStorage:', e);
}


// Initialization state to prevent duplicate loading
let initializationState = {
    isInitializing: false,
    isInitialized: false,
    initPromise: null
};

// Enhanced authFetch function using a single active backend (no cross-backend failover)
async function authFetch(url, options = {}) {
    const headers = options.headers || {};
    if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;

    // Helper to build fetch options
    function buildFetchOptions(url) {
    const frontendOrigin = `${window.location.protocol}//${window.location.host}`;
    const backendUrl = new URL(url);
    const backendOrigin = `${backendUrl.protocol}//${backendUrl.host}`;
    const shouldUseCors = frontendOrigin !== backendOrigin;
    
        return {
            ...options,
            headers: {
                ...headers,
                'Content-Type': headers['Content-Type'] || 'application/json',
                'Accept': headers['Accept'] || 'application/json'
            },
            mode: shouldUseCors ? 'cors' : 'same-origin',
            credentials: shouldUseCors ? 'include' : 'same-origin'
        };
    }

    // If localhost, use direct URL. Otherwise, normalize /api paths to the active backend.
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
    let fetchUrl = url;
    if (!isLocalhost && url.includes('/api/')) {
        fetchUrl = API_BASE_URL + url.substring(url.indexOf('/api/'));
    }

    const controller = new AbortController();
    const timeoutDuration = isLocalhost ? 30000 : 15000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
    try {
        const fetchOptions = { ...buildFetchOptions(fetchUrl), signal: controller.signal };
        const response = await fetch(fetchUrl, fetchOptions);
        if (response.ok && !isLocalhost) {
            throttledShowNotification('✅ Connected to Vercel backend', 'success', 2000);
        }
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Optimized fetch with caching (authFetch handles retries)
async function cachedFetch(endpoint, forceRefresh = false, retries = 2) {
    const cacheKey = endpoint.replace(`${API_BASE_URL}/api/`, '').split('/')[0].split('?')[0];
    const now = Date.now();
    // Check if we have cached data and it's still fresh
    if (!forceRefresh && window.dataCache[cacheKey] && window.dataCache.lastFetch[cacheKey]) {
        const cacheAge = now - window.dataCache.lastFetch[cacheKey];
        const expiry = CACHE_EXPIRY[cacheKey] || CACHE_EXPIRY.setlists;
        
        if (cacheAge < expiry) {
            console.log(`📦 Using cached data for ${cacheKey} (${Math.round(cacheAge/1000)}s old)`);
            return { ok: true, json: () => Promise.resolve(window.dataCache[cacheKey]) };
        }
    }

    // Retry logic for failed requests
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await authFetch(endpoint);
            
            if (response.ok) {
                const data = await response.json();
                window.dataCache[cacheKey] = data;
                window.dataCache.lastFetch[cacheKey] = now;
                console.log(`💾 Cached fresh data for ${cacheKey}`);
                return { ok: true, json: () => Promise.resolve(data) };
            }
            
            // If not a 5xx error, don't retry
            if (response.status < 500) {
                return response;
            }
            
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
            
            // Try to use stale cached data as fallback
            if (window.dataCache[cacheKey]) {
                const cacheAge = now - (window.dataCache.lastFetch[cacheKey] || 0);
                console.log(`📦 Using stale cached data for ${cacheKey} (${Math.round(cacheAge/1000)}s old) due to error (attempt ${attempt + 1}/${retries + 1})`);
                
                if (isRenderBackend) {
                    throttledShowNotification(`⚠️ Using cached data - Render backend unavailable`, 'warning', 4000);
                }
                
                return { 
                    ok: true, 
                    json: () => Promise.resolve(window.dataCache[cacheKey]),
                    fromCache: true,
                    stale: true
                };
            }
            
            // If not last attempt, wait with exponential backoff
            if (attempt < retries) {
                const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                console.log(`⏳ Retrying in ${waitTime/1000}s... (attempt ${attempt + 1}/${retries + 1})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    // All retries failed and no cache available
    console.error(`❌ All ${retries + 1} attempts failed for ${cacheKey}`);
    throw lastError;
}

// Invalidate specific cache entries when data changes (moved to global scope)
function invalidateCache(cacheKeys) {
    if (typeof cacheKeys === 'string') cacheKeys = [cacheKeys];
    
    cacheKeys.forEach(key => {
        window.dataCache[key] = null;
        window.dataCache.lastFetch[key] = null;
    });
}

// Efficiently update song cache without invalidating entire cache
function updateSongInCache(song, isNewSong = false) {
    if (!song || !song.id) {
        console.error(`❌ Cannot update cache - invalid song data:`, song);
        return false;
    }
    
    // Update window.dataCache.songs
    if (!window.dataCache.songs) {
        window.dataCache.songs = [];
    }
    
    if (isNewSong) {
        // Check for duplicate before adding
        const existingIndex = window.dataCache.songs.findIndex(s => s.id === song.id);
        if (existingIndex !== -1) {
            console.log(`⚠️ Song ID ${song.id} already exists in cache, updating instead of adding`);
            window.dataCache.songs[existingIndex] = song;
        } else {
            window.dataCache.songs.push(song);
        }
    } else {
        // Update existing song in cache
        const index = window.dataCache.songs.findIndex(s => s.id === song.id);
        if (index !== -1) {
            window.dataCache.songs[index] = song;
        } else {
            // Fallback: add as new song if not found
            window.dataCache.songs.push(song);
        }
    }
    
    // Update global songs array
    if (isNewSong) {
        const globalExistingIndex = songs.findIndex(s => s.id === song.id);
        if (globalExistingIndex !== -1) {
            songs[globalExistingIndex] = song;
        } else {
            songs.push(song);
        }
    } else {
        const globalIndex = songs.findIndex(s => s.id === song.id);
        if (globalIndex !== -1) {
            songs[globalIndex] = song;
        } else {
            songs.push(song);
        }
    }
    
    const songTimestamp = song.updatedAt || song.createdAt || new Date().toISOString();
    const currentSyncTime = window.dataCache.lastSyncTimestamp.songs;
    if (!currentSyncTime || songTimestamp > currentSyncTime) {
        window.dataCache.lastSyncTimestamp.songs = songTimestamp;
    }

    // Update localStorage with validation
    try {
    localStorage.setItem('pw_songs', JSON.stringify(window.dataCache.songs));
    localStorage.setItem('pw_songsTimestamp', Date.now().toString());
    localStorage.setItem('pw_songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs || new Date().toISOString());
        return true;
    } catch (error) {
        console.error(`❌ Failed to update localStorage:`, error);
        return false;
    }
}

// Background prefetching to improve perceived performance
async function prefetchData() {
    // Only prefetch if not already in progress and user has been idle for 2 seconds
    if (document.hidden) return; // Don't prefetch if tab is not visible
    
    const prefetchPromises = [];
    
    // Prefetch songs if cache is getting stale
    if (window.dataCache.lastFetch.songs) {
        const songsAge = Date.now() - window.dataCache.lastFetch.songs;
        if (songsAge > CACHE_EXPIRY.songs * 0.8) { // Refresh when 80% expired
            prefetchPromises.push(cachedFetch(`${API_BASE_URL}/api/songs`, true).catch(() => {}));
        }
    }
    
    // Prefetch user data if logged in and cache is getting stale
    if (jwtToken && window.dataCache.lastFetch.userdata) {
        const userdataAge = Date.now() - window.dataCache.lastFetch.userdata;
        if (userdataAge > CACHE_EXPIRY.userdata * 0.8) {
            prefetchPromises.push(cachedFetch(`${API_BASE_URL}/api/userdata`, true).catch(() => {}));
        }
    }
    
    // Execute prefetch promises without blocking
    if (prefetchPromises.length > 0) {
        Promise.allSettled(prefetchPromises);
    }
}

// Schedule background prefetching
let prefetchTimer;
function schedulePrefetch() {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(prefetchData, 2000); // Wait 2 seconds of inactivity
}

// Add event listeners for user activity to trigger prefetching
document.addEventListener('mousedown', schedulePrefetch);
document.addEventListener('keydown', schedulePrefetch);
document.addEventListener('scroll', schedulePrefetch);

// Disable Live Server WebSocket if it's causing delays

// Global loading functions
function showLoading(percent, message = null) {
    const overlay = document.getElementById('loadingOverlay');
    const percentEl = document.getElementById('loadingPercent');
    const messageEl = document.getElementById('loadingMessage');
    if (overlay) overlay.style.display = 'flex';
    if (percentEl && typeof percent === 'number') percentEl.textContent = percent + '%';
    if (messageEl && message) messageEl.textContent = message;
    
    // Safety timeout - hide loading after 30 seconds max
    clearTimeout(window.loadingTimeout);
    window.loadingTimeout = setTimeout(() => {
        console.warn('Loading timeout reached, forcing hide');
        hideLoading();
    }, 30000);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        console.log('Loading hidden');
    }
    
    // Clear the safety timeout
    clearTimeout(window.loadingTimeout);
}

// Debug function to manually hide loader
window.forceHideLoader = function() {
    hideLoading();
};

// Global function to get current filter values
function getCurrentFilterValues() {
    const keyFilter = document.getElementById('keyFilter');
    const genreFilter = document.getElementById('genreFilter');
    const moodFilter = document.getElementById('moodFilter');
    const artistFilter = document.getElementById('artistFilter');
    
    return {
        key: keyFilter ? keyFilter.value : 'Key',
        genre: genreFilter ? genreFilter.value : 'Genre',
        mood: moodFilter ? moodFilter.value : 'Mood',
        artist: artistFilter ? artistFilter.value : 'Artist'
    };
}

// Global progress tracking system for entire app initialization
const loadingTasks = {
    // Song loading phase: 0-70%
    spinnerInit: { weight: 3, completed: false },
    fetchSongs: { weight: 30, completed: false },
    processSongs: { weight: 12, completed: false },
    populateDropdowns: { weight: 7, completed: false },
    loadUserData: { weight: 10, completed: false },
    renderSongs: { weight: 8, completed: false },
    // Setlist loading phase: 70-80%
    loadSetlists: { weight: 10, completed: false },
    // UI setup phase: 80-95%
    setupUI: { weight: 15, completed: false },
    // Final phase: 95-100%
    finalSetup: { weight: 5, completed: false }
};

let currentProgress = 0;

function resetLoadingProgress() {
    Object.keys(loadingTasks).forEach((key) => {
        loadingTasks[key].completed = false;
    });
    currentProgress = 0;
}

// Global progress update function - callable from any initialization phase
function updateProgress(taskName, customPercent = null) {
    if (customPercent !== null) {
        const task = loadingTasks[taskName];
        if (task) {
            const taskProgress = (customPercent / 100) * task.weight;
            currentProgress = Object.keys(loadingTasks).reduce((total, key) => {
                if (key === taskName) return total + taskProgress;
                return total + (loadingTasks[key].completed ? loadingTasks[key].weight : 0);
            }, 0);
        }
    } else if (loadingTasks[taskName]) {
        loadingTasks[taskName].completed = true;
        currentProgress = Object.keys(loadingTasks).reduce((total, key) => {
            return total + (loadingTasks[key].completed ? loadingTasks[key].weight : 0);
        }, 0);
    }

    const roundedProgress = Math.min(100, Math.round(currentProgress));

    let message = 'Initializing...';
    if (roundedProgress < 70) {
        message = 'Loading songs...';
    } else if (roundedProgress < 80) {
        message = 'Loading setlists...';
    } else if (roundedProgress < 95) {
        message = 'Setting up UI...';
    } else if (roundedProgress < 100) {
        message = 'Finalizing...';
    } else {
        message = 'Ready!';
    }

    showLoading(roundedProgress, message);
}

// Global songs loading function with progress tracking
async function loadSongsWithProgress(forceRefresh = false) {
    try {
        updateProgress('spinnerInit');
        
        const hasCachedSongs = Array.isArray(window.dataCache.songs) && window.dataCache.songs.length > 0;
        const lastSyncTime = window.dataCache.lastSyncTimestamp.songs;
        const shouldDeltaSync = hasCachedSongs && !!lastSyncTime && !forceRefresh;

        let syncSuccessful = false;

        if (shouldDeltaSync) {
            songs = window.dataCache.songs.slice();
            window.songs = songs;

            updateProgress('fetchSongs', 20);
            await new Promise(resolve => setTimeout(resolve, 80));

            try {
                const [deltaSongsResponse, deletedIdsResponse] = await Promise.all([
                    authFetch(`${API_BASE_URL}/api/songs?since=${encodeURIComponent(lastSyncTime)}`),
                    authFetch(`${API_BASE_URL}/api/songs/deleted?since=${encodeURIComponent(lastSyncTime)}`)
                ]);

                updateProgress('fetchSongs', 60);

                if (deltaSongsResponse.ok && deletedIdsResponse.ok) {
                    const deltaSongs = await deltaSongsResponse.json();
                    const deletedIds = await deletedIdsResponse.json();

                    updateProgress('fetchSongs');
                    updateProgress('processSongs', 30);

                    const songMap = new Map(songs.map(song => [String(song.id), song]));
                    (Array.isArray(deltaSongs) ? deltaSongs : []).forEach(song => {
                        if (!song || song.id === undefined || song.id === null) return;
                        songMap.set(String(song.id), song);
                    });

                    updateProgress('processSongs', 70);

                    const deletedSet = new Set((Array.isArray(deletedIds) ? deletedIds : []).map(id => String(id)));
                    songs = Array.from(songMap.values()).filter(song => !deletedSet.has(String(song.id)));

                    window.songs = songs;
                    window.dataCache.songs = songs;
                    window.dataCache.lastFetch.songs = Date.now();
                    window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();

                    localStorage.setItem('pw_songs', JSON.stringify(songs));
                    localStorage.setItem('pw_songsTimestamp', Date.now().toString());
                    localStorage.setItem('pw_songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);

                    updateProgress('processSongs');
                    syncSuccessful = true;
                }
            } catch (err) {
                console.warn('Delta sync failed, falling back to full sync:', err);
            }
        }

        if (!syncSuccessful) {
            let response;
            try {
                updateProgress('fetchSongs', 10);
                await new Promise(resolve => setTimeout(resolve, 100));

                response = await cachedFetch(`${API_BASE_URL}/api/songs`, true);

                updateProgress('fetchSongs', 80);
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
                console.error('Error fetching songs:', err);
                hideLoading();
                return;
            }

            if (!response.ok) {
                hideLoading();
                return;
            }

            updateProgress('fetchSongs');

            let allSongs = [];
            try {
                updateProgress('processSongs', 20);
                await new Promise(resolve => setTimeout(resolve, 50));

                allSongs = await response.json();

                updateProgress('processSongs', 60);
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error('Error processing songs JSON:', e);
                hideLoading();
                return;
            }

            const seen = new Set();
            const unique = [];
            for (const s of allSongs) {
                const key = String(s.id);
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(s);
                }
            }

            window.songs = unique;
            songs = unique;

            window.dataCache.songs = unique;
            window.dataCache.lastFetch.songs = Date.now();
            window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();

            localStorage.setItem('pw_songs', JSON.stringify(unique));
            localStorage.setItem('pw_songsTimestamp', Date.now().toString());
            localStorage.setItem('pw_songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
            updateProgress('processSongs');
        }

        // Load user data if authenticated
        if (currentUser && currentUser.id) {
            try {
                updateProgress('loadUserData', 30);
                const userDataResponse = await cachedFetch(`${API_BASE_URL}/api/userdata`);
                if (userDataResponse.ok) {
                    const userData = await userDataResponse.json();
                    window.userData = userData;
                    updateProgress('loadUserData', 80);
                }
            } catch (err) {
                // Error loading user data - continue without it
            }
        }
        updateProgress('loadUserData'); // Mark user data loading as complete
        
        // Render songs
        updateProgress('renderSongs', 30);
        if (typeof renderSongs === 'function') {
            try {
                const filters = getCurrentFilterValues();
                renderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                updateProgress('renderSongs', 80);
            } catch (err) {
                console.warn('Error rendering songs:', err);
            }
        }
        if (typeof updateSongCount === 'function') {
            try {
                updateSongCount();
            } catch (err) {
                console.warn('Error updating song count:', err);
            }
        }
        updateProgress('renderSongs'); // Mark rendering as complete
        
        // Populate dropdowns for fresh data
        updateProgress('populateDropdowns', 50);
        await new Promise(resolve => setTimeout(resolve, 50));
        updateProgress('populateDropdowns'); // Mark as completed
        
        return songs;
        
    } catch (error) {
        console.error('Error in loadSongsWithProgress:', error);
        // Always hide loading on error
        hideLoading();
        return [];
    }
}

function showAuthChoiceModal() {
    let modal = document.getElementById('authChoiceModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'authChoiceModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="text-align:center;">
                <h3>Welcome!</h3>
                <p>Please login or register to continue.</p>
                <button id="authLoginBtn" class="btn btn-primary" style="margin:8px 0 8px 0;width:80%;">Login</button>
                <button id="authRegisterBtn" class="btn btn-secondary" style="margin-bottom:8px;width:80%;">Register</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('authLoginBtn').onclick = () => {
            modal.style.display = 'none';
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'flex';
        };
        document.getElementById('authRegisterBtn').onclick = () => {
            modal.style.display = 'none';
            const registerModal = document.getElementById('registerModal');
            if (registerModal) registerModal.style.display = 'flex';
        };
    }
    modal.style.display = 'flex';
}

// Merge all DOMContentLoaded logic into one handler
document.addEventListener('DOMContentLoaded', () => {
    dedupeFixedControls();

    // Create mobile replica panel toggles immediately, even before async init completes.
    addMobileTouchNavigation();
    if (!window.__pwMobileNavResizeBound) {
        window.__pwMobileNavResizeBound = true;
        window.addEventListener('resize', addMobileTouchNavigation);
    }

    // Always fetch latest weights on app load
    fetchRecommendationWeights();
    
    // Auth state is already initialized globally - no need to reload

    // Backup mechanism to hide loader if it gets stuck
    setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay && overlay.style.display !== 'none') {
            console.warn('Loader backup timeout - force hiding');
            hideLoading();
        }
    }, 45000); // 45 seconds max loading time

    async function updateLocalTransposeCache() {
        const token = localStorage.getItem('pw_jwtToken');
        if (currentUser && currentUser.id && token && isJwtValid(token)) {
            try {
                const response = await cachedFetch(`${API_BASE_URL}/api/userdata`);
                if (response.ok) {
                    const userData = await response.json();
                    if (userData.transpose) {
                        localStorage.setItem('pw_transposeCache', JSON.stringify(userData.transpose));
                    }
                }
            } catch {}
        }
    }
    updateLocalTransposeCache();

    // Inject spinner overlay if absent
    if (!document.getElementById('loadingOverlay')) {
        fetch('spinner.html')
            .then(r => r.text())
            .then(html => document.body.insertAdjacentHTML('beforeend', html))
            .catch(() => {});
    }

    // Gate initialization for unauthenticated users (match Other repo behavior).
    const token = localStorage.getItem('pw_jwtToken');
    const isAuthenticated = token && isJwtValid(token);
    if (!isAuthenticated) {
        if (token && !isJwtValid(token)) {
            localStorage.removeItem('pw_jwtToken');
            localStorage.removeItem('pw_currentUser');
            jwtToken = '';
            currentUser = null;
            window.jwtToken = '';
            window.currentUser = null;
        }

        showLoading(0, 'Please sign in to continue');
        setTimeout(() => {
            hideLoading();
            showAuthChoiceModal();
        }, 500);
    } else if (!initializationState.isInitialized && !initializationState.isInitializing) {
        // Show loading immediately
        showLoading(0, 'Initializing...');
        window.init();
    }

    // Populate dropdowns once
    populateDropdown('keyFilter', ['Key', ...PW_KEYS]);
    populateDropdown('genreFilter', ['Genre', ...PW_GENRES]);
    populateDropdown('moodFilter', ['Mood', ...PW_MOODS]);
    populateDropdown('artistFilter', ['Artist', ...PW_ARTISTS]);
    populateDropdown('songKey', PW_KEYS);
    populateDropdown('editSongKey', PW_KEYS);
    populateDropdown('songCategory', PW_CATEGORIES);
    populateDropdown('editSongCategory', PW_CATEGORIES);
    populateDropdown('songTime', PW_TIMES);
    populateDropdown('editSongTime', PW_TIMES);
    populateDropdown('songTaal', PW_TAALS);
    populateDropdown('editSongTaal', PW_TAALS);
    populateDropdown('songArtist', PW_ARTISTS);
    populateDropdown('editSongArtist', PW_ARTISTS);
    populateDropdown('songMood', PW_MOODS);
    populateDropdown('editSongMood', PW_MOODS);
    populateRhythmCategoryDropdown('songRhythmCategory');
    populateRhythmCategoryDropdown('editSongRhythmCategory');
    bindRhythmSetPreviewSync('songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview');
    bindRhythmSetPreviewSync('editSongRhythmFamily', 'editSongRhythmSetNo', 'editSongRhythmSetIdPreview');
    if (isAuthenticated) {
        hydrateRhythmFamilies().catch((err) => console.warn('Failed to hydrate rhythm families:', err));
    }

    // Genre multiselect (lazy setup; only once each)
    setupGenreMultiselect('songGenre', 'genreDropdown', 'selectedGenres');
    setupGenreMultiselect('editSongGenre', 'editGenreDropdown', 'editSelectedGenres');
    
    // Mood and Artist multiselects
    setupMoodMultiselect('songMood', 'moodDropdown', 'selectedMoods');
    setupMoodMultiselect('editSongMood', 'editMoodDropdown', 'editSelectedMoods');
    setupArtistMultiselect('songArtist', 'artistDropdown', 'selectedArtists');
    setupArtistMultiselect('editSongArtist', 'editArtistDropdown', 'editSelectedArtists');

    // Theme
    isDarkMode = localStorage.getItem('pw_darkMode') === 'true';
    applyTheme(isDarkMode);
    const themeToggleBtn = document.getElementById('themeToggle');
    function updateThemeToggleBtn() {
        if (!themeToggleBtn) return;
        themeToggleBtn.setAttribute('aria-pressed', String(isDarkMode));
        themeToggleBtn.innerHTML = isDarkMode
            ? '<i class="fas fa-sun"></i><span>Light Mode</span>'
            : '<i class="fas fa-moon"></i><span>Dark Mode</span>';
    }
    updateThemeToggleBtn();
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            localStorage.setItem('pw_darkMode', isDarkMode);
            applyTheme(isDarkMode);
            updateThemeToggleBtn();
        });
    }

    // Auth UI
    if (typeof updateAuthButtons === 'function') updateAuthButtons();
    if (jwtToken && isJwtValid(jwtToken) && typeof loadUserData === 'function') {
        loadUserData().then(() => {
            if (typeof updateAuthButtons === 'function') updateAuthButtons();
        });
    } else if (!isJwtValid(jwtToken)) {
        localStorage.removeItem('pw_jwtToken');
        jwtToken = '';
        if (typeof updateAuthButtons === 'function') updateAuthButtons();
    }

    // Tap tempo
    setupTapTempo('tapTempoBtn', 'songTempo');
    setupTapTempo('editTapTempoBtn', 'editSongTempo');

    // Sort filter
    const sortFilter = document.getElementById('sortFilter');
    if (sortFilter) {
        sortFilter.addEventListener('change', () => {
            const activeTab = document.getElementById('PraiseTab')?.classList.contains('active') ? 'Praise' : 'Worship';
            if (typeof renderSongs === 'function') {
                const filters = getCurrentFilterValues();
                renderSongs(activeTab, filters.key, filters.genre, filters.mood, filters.artist);
            }
        });
    }

    initScreenWakeLock();

    // Add Song button(s)
    function openAddSong() {
        const modal = document.getElementById('addSongModal');
        if (modal) {
            modal.style.display = 'flex';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) modalContent.scrollTop = 0;
        }

        hydrateRhythmFamilies().catch(() => {});
        const addRhythmFamily = document.getElementById('songRhythmFamily');
        const addRhythmSetNo = document.getElementById('songRhythmSetNo');
        const addRhythmCategory = document.getElementById('songRhythmCategory');
        if (addRhythmFamily) addRhythmFamily.value = '';
        if (addRhythmSetNo) addRhythmSetNo.value = '';
        if (addRhythmCategory) addRhythmCategory.value = '';
        updateRhythmSetIdPreview('songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview');
    }
    ['addSongBelowFavoritesBtn', 'openAddSongModal'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', openAddSong);
        
    });

    // Login modal
    const loginBtn = document.getElementById('loginBtn');
    const loginModal = document.getElementById('loginModal');
    const closeLoginModal = document.getElementById('closeLoginModal');
    if (loginBtn && loginModal) {
        loginBtn.addEventListener('click', () => loginModal.style.display = 'flex');
    }
    if (closeLoginModal && loginModal) {
        closeLoginModal.addEventListener('click', () => loginModal.style.display = 'none');
    }

    // Register modal
    const registerBtn = document.getElementById('registerBtn');
    const registerModal = document.getElementById('registerModal');
    const closeRegisterModal = document.getElementById('closeRegisterModal');
    if (registerBtn && registerModal) {
        registerBtn.addEventListener('click', () => registerModal.style.display = 'flex');
    }
    if (closeRegisterModal && registerModal) {
        closeRegisterModal.addEventListener('click', () => registerModal.style.display = 'none');
    }

    // Forms
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        if (registerForm._submitListener) {
            registerForm.removeEventListener('submit', registerForm._submitListener);
        }
        
        registerForm._submitListener = async e => {
            e.preventDefault();
            const capitalizeFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
            const firstName = capitalizeFirst(document.getElementById('registerFirstName').value.trim());
            const lastName = capitalizeFirst(document.getElementById('registerLastName').value.trim());
            const username = document.getElementById('registerUsername').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const phone = document.getElementById('registerPhone').value.trim();
            const password = document.getElementById('registerPassword').value;
            const errorDiv = document.getElementById('registerError');
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
            try {
                const res = await authFetch(`${API_BASE_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ firstName, lastName, username, email, phone, password })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    registerModal.style.display = 'none';
                    if (typeof showNotification === 'function') showNotification('Registration successful! Please login.');
                } else {
                    errorDiv.textContent = data.error || 'Registration failed';
                    errorDiv.style.display = 'block';
                }
            } catch {
                errorDiv.textContent = 'Network error';
                errorDiv.style.display = 'block';
            }
        };
        
        registerForm.addEventListener('submit', registerForm._submitListener);

        initScreenWakeLock();
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        if (loginForm._submitListener) {
            loginForm.removeEventListener('submit', loginForm._submitListener);
        }
        
        loginForm._submitListener = async e => {
            e.preventDefault();
            const rawLoginInput = document.getElementById('loginUsername').value;
            const loginInput = String(rawLoginInput || '')
                .trim()
                .replace(/\s+/g, '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '');
            const normalizedLoginInput = loginInput.toLowerCase();
            const password = document.getElementById('loginPassword').value;
            const errorDiv = document.getElementById('loginError');
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
            try {
                const res = await authFetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernameOrEmail: normalizedLoginInput, password })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.token) {
                    localStorage.setItem('pw_jwtToken', data.token);
                    if (data.user) localStorage.setItem('pw_currentUser', JSON.stringify(data.user));
                    jwtToken = data.token;
                    currentUser = data.user;
                    window.jwtToken = jwtToken;
                    window.currentUser = currentUser;
                    
                    // Update UI without page reload
                    updateAuthButtons();

                    if (!initializationState.isInitialized && !initializationState.isInitializing) {
                        showLoading(0, 'Initializing...');
                        await window.init();
                    } else {
                        await loadUserData();
                        await loadMySetlists();
                        renderMySetlists();
                        renderSmartSetlists();
                    }
                    
                    // Update mobile UI if on mobile view
                    if (typeof window.mobileApp !== 'undefined' && typeof window.mobileApp.refreshSetlists === 'function') {
                        window.mobileApp.refreshSetlists();
                    }
                    
                    // Close login modal
                    document.getElementById('loginModal').style.display = 'none';
                    
                    showNotification('Login successful!', 2000);
                } else {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.style.display = 'block';
                }
            } catch {
                errorDiv.textContent = 'Network error';
                errorDiv.style.display = 'block';
            }
        };
        
        loginForm.addEventListener('submit', loginForm._submitListener);
    }

    // Final init hooks (if defined externally)
    if (typeof addEventListeners === 'function') addEventListeners();
    // Remove duplicate loadSongsFromFile call - handled by window.init()
    
    // Force initial display to none for both setlist folders
    setTimeout(() => {
        const globalSetlistContent = document.getElementById('globalSetlistContent');
        const mySetlistContent = document.getElementById('mySetlistContent');
        if (globalSetlistContent) globalSetlistContent.style.display = 'none';
        if (mySetlistContent) mySetlistContent.style.display = 'none';
        
        // Test click simulation
        window.testGlobalSetlistClick = () => {
            const globalHeader = document.getElementById('globalSetlistHeader');
            if (globalHeader) {
                globalHeader.click();
            }
        };
        
        window.testMySetlistClick = () => {
            const myHeader = document.getElementById('mySetlistHeader');
            if (myHeader) {
                myHeader.click();
            }
        };
    }, 100);

});



// Enhanced PWA Installation Handler
let installPromptAvailable = false;
let isAppInstalled = false;

// Check if app is already installed
function checkAppInstallStatus() {
    // Check for standalone display mode (PWA is installed)
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        isAppInstalled = true;
        console.log('✅ PWA is already installed and running in standalone mode');
        hideInstallButton();
        return true;
    }
    
    // Check for iOS Safari standalone mode
    if (window.navigator && window.navigator.standalone === true) {
        isAppInstalled = true;
        console.log('✅ PWA is installed on iOS Safari');
        hideInstallButton();
        return true;
    }
    
    return false;
}

// Show install button with enhanced styling
function showInstallButton() {
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn && !isAppInstalled) {
        installBtn.style.display = 'block';
        installBtn.classList.add('pwa-install-ready');
        installBtn.innerHTML = `
            <i class="fas fa-download"></i>
            <span>Install App</span>
        `;
        console.log('📱 PWA install button shown');
    }
}

// Hide install button
function hideInstallButton() {
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.style.display = 'none';
        installBtn.classList.remove('pwa-install-ready');
        console.log('🔒 PWA install button hidden');
    }
}

// Update install button text during installation
function updateInstallButtonProgress(text) {
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) {
        installBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>${text}</span>
        `;
        installBtn.disabled = true;
    }
}

// Handle beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('🎯 PWA install prompt intercepted');
    e.preventDefault(); // Prevent default browser install prompt
    deferredPrompt = e;
    installPromptAvailable = true;
    
    // Only show button if app is not already installed
    if (!checkAppInstallStatus()) {
        showInstallButton();
    }
});

// Enhanced install button click handler
document.getElementById('installAppBtn')?.addEventListener('click', async () => {
    if (!deferredPrompt || !installPromptAvailable) {
        console.warn('⚠️ No install prompt available');
        showNotification('Installation not available at this time', 'error');
        return;
    }
    
    try {
        updateInstallButtonProgress('Installing...');
        
        // Trigger the install prompt
        console.log('🚀 Triggering PWA installation');
        deferredPrompt.prompt();
        
        // Wait for user response
        const choiceResult = await deferredPrompt.userChoice;
        console.log('👤 User choice:', choiceResult.outcome);
        
        if (choiceResult.outcome === 'accepted') {
            console.log('✅ PWA installation accepted');
            updateInstallButtonProgress('Installing App...');
            showNotification('📱 Installing Praise & Worship App...', 'success');
            
            // Wait a moment for installation to complete
            setTimeout(() => {
                isAppInstalled = true;
                hideInstallButton();
                showNotification('🎉 App installed successfully! You can now access it from your home screen.', 'success');
            }, 2000);
        } else {
            console.log('❌ PWA installation declined');
            const installBtn = document.getElementById('installAppBtn');
            if (installBtn) {
                installBtn.innerHTML = `
                    <i class="fas fa-download"></i>
                    <span>Install App</span>
                `;
                installBtn.disabled = false;
            }
            showNotification('Installation cancelled', 'info');
        }
    } catch (error) {
        console.error('❌ PWA installation error:', error);
        showNotification('Installation failed. Please try again.', 'error');
        
        const installBtn = document.getElementById('installAppBtn');
        if (installBtn) {
            installBtn.innerHTML = `
                <i class="fas fa-download"></i>
                <span>Install App</span>
            `;
            installBtn.disabled = false;
        }
    } finally {
        // Clean up
        deferredPrompt = null;
        installPromptAvailable = false;
    }
});

// Listen for app installation completion
window.addEventListener('appinstalled', (e) => {
    console.log('🎉 PWA was successfully installed');
    isAppInstalled = true;
    hideInstallButton();
    showNotification('🎊 Praise & Worship app installed! Launch it from your home screen for the best experience.', 'success');
    
    // Track installation for analytics if needed
    if (typeof gtag !== 'undefined') {
        gtag('event', 'pwa_installed', {
            event_category: 'PWA',
            event_label: 'App Installation'
        });
    }
});

// Check for display mode changes (app being opened in standalone mode)
if (window.matchMedia) {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    standaloneQuery.addEventListener('change', (e) => {
        if (e.matches) {
            console.log('📱 App opened in standalone mode');
            isAppInstalled = true;
            hideInstallButton();
        }
    });
}

// Service worker messaging is intentionally disabled.

// Initialize install status on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAppInstallStatus();
    
    // Add additional mobile-specific install instructions
    if (isMobileDevice() && !isAppInstalled) {
        console.log('📱 Mobile device detected - PWA installation recommended');
        
        // Show mobile-specific install hint after a delay
        setTimeout(() => {
            if (!isAppInstalled && !installPromptAvailable) {
                showMobileInstallHint();
            }
        }, 10000); // Show hint after 10 seconds if no install prompt
    }
});

// Detect mobile devices
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

// Show mobile-specific install instructions
function showMobileInstallHint() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    let message = '';
    if (isIOS) {
        message = '💡 Tip: Tap the share button (📤) and select "Add to Home Screen" to install this app!';
    } else if (isAndroid) {
        message = '💡 Tip: Tap the menu (⋮) and select "Add to Home Screen" or "Install App" to get the full app experience!';
    } else {
        message = '💡 Tip: Look for "Install App" or "Add to Home Screen" in your browser menu for the best experience!';
    }
    
    showNotification(message, 'info', 8000);
}

// --- FIXED helper implementations (fill in if previously incomplete) ---

function setupTapTempo(buttonId, inputId) {
    let tapTimes = [];
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    
    btn.addEventListener('click', () => {
        const now = Date.now();
        tapTimes.push(now);
        // Only keep last 6 taps
        if (tapTimes.length > 6) tapTimes.shift();
        if (tapTimes.length >= 2) {
            const intervals = [];
            for (let i = 1; i < tapTimes.length; i++) {
                intervals.push(tapTimes[i] - tapTimes[i - 1]);
            }
            const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const bpm = Math.round(60000 / avgMs);
            input.value = bpm;
        }
        // Reset if last tap was >2s ago
        if (tapTimes.length > 1 && now - tapTimes[tapTimes.length - 2] > 2000) {
            tapTimes = [now];
        }
    });
    
    // Double-click to reset
    btn.addEventListener('dblclick', () => {
        tapTimes = [];
        input.value = '';
    });
    
    // Space key support
    input.addEventListener('keydown', e => {
        if (e.code === 'Space') {
            e.preventDefault();
            btn.click();
        }
    });
}

function populateDropdown(id, options, withLabel = false) {
    const select = document.getElementById(id);
        if (!select) return; // Ensure the select element exists
    select.innerHTML = '';
    if (withLabel) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = 'Select...';
        select.appendChild(opt);
    }
        options.forEach(val => { // Populate dropdown options
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        select.appendChild(opt);
    });
}

function renderGenreOptions(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = PW_GENRES
        .map((g, index) => {
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isFirstItem}" data-value="${g}">${g}</div>`;
        })
        .join('');
}

function renderGenreOptionsWithSelections(dropdownId, genreList, selections) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = genreList
        .map((genre, index) => {
            const isSelected = selections.has(genre) ? ' selected' : '';
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isSelected}${isFirstItem}" data-value="${genre}">${genre}</div>`;
        })
        .join('');
}

function renderMoodOptions(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = PW_MOODS
        .map((m, index) => {
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isFirstItem}" data-value="${m}">${m}</div>`;
        })
        .join('');
}

function renderArtistOptions(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = PW_ARTISTS
        .map((a, index) => {
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isFirstItem}" data-value="${a}">${a}</div>`;
        })
        .join('');
}

function renderMoodOptionsWithSelections(dropdownId, moodList, selections) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = moodList
        .map((mood, index) => {
            const isSelected = selections.has(mood) ? ' selected' : '';
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isSelected}${isFirstItem}" data-value="${mood}">${mood}</div>`;
        })
        .join('');
}

function renderArtistOptionsWithSelections(dropdownId, artistList, selections) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = artistList
        .map((artist, index) => {
            const isSelected = selections.has(artist) ? ' selected' : '';
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isSelected}${isFirstItem}" data-value="${artist}">${artist}</div>`;
        })
        .join('');
}

// Global multiselect management
let multiselectInstances = new Map();
let globalClickListenerAdded = false;
let globalKeyListenerAdded = false;

function addGlobalClickListener() {
    if (globalClickListenerAdded) return;
    
    document.addEventListener('click', (e) => {
        multiselectInstances.forEach((instance, key) => {
            const { dropdown, input, selectedContainer } = instance;
            
            // Check if click is outside the entire multiselect component
            const isClickInsideDropdown = dropdown.contains(e.target);
            const isClickOnInput = e.target === input;
            const isClickInSelectedContainer = selectedContainer && selectedContainer.contains(e.target);
            const isClickOnRemoveTag = e.target.classList.contains('remove-tag');
            
            // Get the multiselect container for this dropdown
            const multiselectContainer = dropdown.closest('.multiselect-container') || 
                                       input.closest('.multiselect-container');
            const isClickInThisMultiselect = multiselectContainer && multiselectContainer.contains(e.target);
            
            // Only close if click is truly outside this entire multiselect component
            // Don't close if clicking on remove tag buttons
            if (!isClickInsideDropdown && !isClickOnInput && !isClickInSelectedContainer && 
                !isClickInThisMultiselect && !isClickOnRemoveTag) {
                dropdown.classList.remove('show');
                if (instance.updateInput) {
                    instance.updateInput();
                }
            }
        });
    });
    globalClickListenerAdded = true;
    
    // Also add global escape key listener
    addGlobalKeyListener();
}

function addGlobalKeyListener() {
    if (globalKeyListenerAdded) return;
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close all open dropdowns
            multiselectInstances.forEach((instance) => {
                if (instance.dropdown.classList.contains('show')) {
                    instance.dropdown.classList.remove('show');
                    if (instance.updateInput) {
                        instance.updateInput();
                    }
                    // Also blur the input to remove focus
                    instance.input.blur();
                }
            });
        }
    });
    globalKeyListenerAdded = true;
}

function setupGenreMultiselect(inputId, dropdownId, selectedId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const selectedContainer = document.getElementById(selectedId);
    if (!input || !dropdown || !selectedContainer) return;

    // Store selections to preserve during search
    dropdown._genreSelections = new Set();

    // Render genre options
    renderGenreOptions(dropdownId);

    // Remove previous listeners if any
    if (input._genreClickListener) input.removeEventListener('click', input._genreClickListener);
    if (input._genreFocusListener) input.removeEventListener('focus', input._genreFocusListener);
    if (input._genreInputListener) input.removeEventListener('input', input._genreInputListener);
    if (dropdown._genreListener) dropdown.removeEventListener('click', dropdown._genreListener);

    // Make input searchable
    input.removeAttribute('readonly');
    input.style.cursor = 'text';
    input.placeholder = 'Search genres...';

    // Handle search input
    input._genreInputListener = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredGenres = PW_GENRES.filter(genre => 
            genre.toLowerCase().includes(searchTerm)
        );
        
        // Render filtered options while preserving selections
        renderGenreOptionsWithSelections(dropdownId, filteredGenres, dropdown._genreSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('input', input._genreInputListener);

    // Handle click to show all options
    input._genreClickListener = (e) => {
        e.stopPropagation();
        // Show all options with current selections when clicked
    renderGenreOptionsWithSelections(dropdownId, PW_GENRES, dropdown._genreSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.toggle('show');
    };
    input.addEventListener('click', input._genreClickListener);

    // Show dropdown on focus
    input._genreFocusListener = (e) => {
        // Show all options with current selections when focused
    renderGenreOptionsWithSelections(dropdownId, PW_GENRES, dropdown._genreSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('focus', input._genreFocusListener);

    // Add keyboard navigation support
    if (input._genreKeyListener) input.removeEventListener('keydown', input._genreKeyListener);
    input._genreKeyListener = (e) => {
        if (!dropdown.classList.contains('show')) return;
        
        const options = dropdown.querySelectorAll('.multiselect-option');
        let currentHighlighted = dropdown.querySelector('.multiselect-option.highlighted');
        let currentIndex = currentHighlighted ? Array.from(options).indexOf(currentHighlighted) : -1;
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                // Remove previous highlight
                if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                // Move to next option
                currentIndex = (currentIndex + 1) % options.length;
                options[currentIndex].classList.add('highlighted');
                // Scroll into view
                options[currentIndex].scrollIntoView({ block: 'nearest' });
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                // Remove previous highlight
                if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                // Move to previous option
                currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
                options[currentIndex].classList.add('highlighted');
                // Scroll into view
                options[currentIndex].scrollIntoView({ block: 'nearest' });
                break;
                
            case ' ':
            case 'Enter':
                e.preventDefault();
                if (currentHighlighted) {
                    const value = currentHighlighted.dataset.value;
                    
                    // Toggle selection in our Set
                    if (dropdown._genreSelections.has(value)) {
                        dropdown._genreSelections.delete(value);
                        currentHighlighted.classList.remove('selected');
                    } else {
                        dropdown._genreSelections.add(value);
                        currentHighlighted.classList.add('selected');
                    }
                    
                    updateSelectedGenres(selectedId, dropdownId);
                    input.value = '';  // Clear search input
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                dropdown.classList.remove('show');
                input.blur();
                break;
        }
    };
    input.addEventListener('keydown', input._genreKeyListener);

    // Register this instance for global click handling
    multiselectInstances.set(inputId, {
        dropdown: dropdown,
        input: input,
        selectedContainer: selectedContainer,
        updateInput: () => {
            input.value = '';  // Clear search input after selection
        }
    });
    addGlobalClickListener();

    // Select/deselect genres
    dropdown._genreListener = (e) => {
        const option = e.target.closest('.multiselect-option');
        if (!option) return;
        
        const value = option.dataset.value;
        
        // Toggle selection in our Set
        if (dropdown._genreSelections.has(value)) {
            dropdown._genreSelections.delete(value);
            option.classList.remove('selected');
        } else {
            dropdown._genreSelections.add(value);
            option.classList.add('selected');
        }
        
        updateSelectedGenres(selectedId, dropdownId);
        input.value = '';  // Clear search input
    };
    dropdown.addEventListener('click', dropdown._genreListener);
}

function updateSelectedGenres(selectedId, dropdownId) {
    const container = document.getElementById(selectedId);
    const dropdown = document.getElementById(dropdownId);
    if (!container || !dropdown) return;
    container.innerHTML = '';
    
    // Use the stored selections instead of DOM queries
    const selectedValues = Array.from(dropdown._genreSelections || []);
    selectedValues.forEach(value => {
        const span = document.createElement('span');
        span.className = 'multiselect-tag';
        span.innerHTML = `${value} <span class="remove-tag" data-value="${value}">×</span>`;
        container.appendChild(span);
    });
    
    // Add click listeners to remove tags
    container.querySelectorAll('.remove-tag').forEach(removeBtn => {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent dropdown from closing
            const value = e.target.dataset.value;
            
            // Remove from stored selections
            dropdown._genreSelections.delete(value);
            
            // Remove from visible dropdown options if present
            const option = dropdown.querySelector(`[data-value="${value}"]`);
            if (option) option.classList.remove('selected');
            
            updateSelectedGenres(selectedId, dropdownId);
        });
    });
}

function setupMoodMultiselect(inputId, dropdownId, selectedId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const selectedContainer = document.getElementById(selectedId);
    if (!input || !dropdown || !selectedContainer) return;

    // Store selections to preserve during search
    dropdown._moodSelections = new Set();

    // Render mood options
    renderMoodOptions(dropdownId);

    // Remove previous listeners if any
    if (input._moodClickListener) input.removeEventListener('click', input._moodClickListener);
    if (input._moodFocusListener) input.removeEventListener('focus', input._moodFocusListener);
    if (input._moodInputListener) input.removeEventListener('input', input._moodInputListener);
    if (dropdown._moodListener) dropdown.removeEventListener('click', dropdown._moodListener);

    // Make input searchable
    input.removeAttribute('readonly');
    input.style.cursor = 'text';
    input.placeholder = 'Search moods...';

    // Handle search input
    input._moodInputListener = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredMoods = PW_MOODS.filter(mood => 
            mood.toLowerCase().includes(searchTerm)
        );
        
        // Render filtered options while preserving selections
        renderMoodOptionsWithSelections(dropdownId, filteredMoods, dropdown._moodSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('input', input._moodInputListener);

    // Handle click to show all options
    input._moodClickListener = (e) => {
        e.stopPropagation();
        // Show all options with current selections when clicked
    renderMoodOptionsWithSelections(dropdownId, PW_MOODS, dropdown._moodSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.toggle('show');
    };
    input.addEventListener('click', input._moodClickListener);

    // Show dropdown on focus
    input._moodFocusListener = (e) => {
        // Show all options with current selections when focused
    renderMoodOptionsWithSelections(dropdownId, PW_MOODS, dropdown._moodSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('focus', input._moodFocusListener);

    // Add keyboard navigation support
    if (input._moodKeyListener) input.removeEventListener('keydown', input._moodKeyListener);
    input._moodKeyListener = (e) => {
        if (!dropdown.classList.contains('show')) return;
        
        const options = dropdown.querySelectorAll('.multiselect-option');
        let currentHighlighted = dropdown.querySelector('.multiselect-option.highlighted');
        let currentIndex = currentHighlighted ? Array.from(options).indexOf(currentHighlighted) : -1;
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                // Remove previous highlight
                if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                // Move to next option
                currentIndex = (currentIndex + 1) % options.length;
                options[currentIndex].classList.add('highlighted');
                // Scroll into view
                options[currentIndex].scrollIntoView({ block: 'nearest' });
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                // Remove previous highlight
                if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                // Move to previous option
                currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
                options[currentIndex].classList.add('highlighted');
                // Scroll into view
                options[currentIndex].scrollIntoView({ block: 'nearest' });
                break;
                
            case ' ':
            case 'Enter':
                e.preventDefault();
                if (currentHighlighted) {
                    const value = currentHighlighted.dataset.value;
                    
                    // Toggle selection in our Set
                    if (dropdown._moodSelections.has(value)) {
                        dropdown._moodSelections.delete(value);
                        currentHighlighted.classList.remove('selected');
                    } else {
                        dropdown._moodSelections.add(value);
                        currentHighlighted.classList.add('selected');
                    }
                    
                    updateSelectedMoods(selectedId, dropdownId);
                    input.value = '';  // Clear search input
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                dropdown.classList.remove('show');
                input.blur();
                break;
        }
    };
    input.addEventListener('keydown', input._moodKeyListener);

    // Register this instance for global click handling
    multiselectInstances.set(inputId, {
        dropdown: dropdown,
        input: input,
        selectedContainer: selectedContainer,
        updateInput: () => {
            input.value = '';  // Clear search input after selection
        }
    });
    addGlobalClickListener();

    // Select/deselect moods
    dropdown._moodListener = (e) => {
        const option = e.target.closest('.multiselect-option');
        if (!option) return;
        
        const value = option.dataset.value;
        
        // Toggle selection in our Set
        if (dropdown._moodSelections.has(value)) {
            dropdown._moodSelections.delete(value);
            option.classList.remove('selected');
        } else {
            dropdown._moodSelections.add(value);
            option.classList.add('selected');
        }
        
        updateSelectedMoods(selectedId, dropdownId);
        input.value = '';  // Clear search input
    };
    dropdown.addEventListener('click', dropdown._moodListener);
}

function updateSelectedMoods(selectedId, dropdownId) {
    const container = document.getElementById(selectedId);
    const dropdown = document.getElementById(dropdownId);
    if (!container || !dropdown) return;
    container.innerHTML = '';
    
    // Use the stored selections instead of DOM queries
    const selectedValues = Array.from(dropdown._moodSelections || []);
    selectedValues.forEach(value => {
        const span = document.createElement('span');
        span.className = 'multiselect-tag';
        span.innerHTML = `${value} <span class="remove-tag" data-value="${value}">×</span>`;
        container.appendChild(span);
    });
    
    // Add click listeners to remove tags
    container.querySelectorAll('.remove-tag').forEach(removeBtn => {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent dropdown from closing
            const value = e.target.dataset.value;
            
            // Remove from stored selections
            dropdown._moodSelections.delete(value);
            
            // Remove from visible dropdown options if present
            const option = dropdown.querySelector(`[data-value="${value}"]`);
            if (option) option.classList.remove('selected');
            
            updateSelectedMoods(selectedId, dropdownId);
        });
    });
}

function setupArtistMultiselect(inputId, dropdownId, selectedId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const selectedContainer = document.getElementById(selectedId);
    if (!input || !dropdown || !selectedContainer) return;

    // Store selections to preserve during search
    dropdown._artistSelections = new Set();

    // Render artist options
    renderArtistOptions(dropdownId);

    // Remove previous listeners if any
    if (input._artistClickListener) input.removeEventListener('click', input._artistClickListener);
    if (input._artistFocusListener) input.removeEventListener('focus', input._artistFocusListener);
    if (input._artistInputListener) input.removeEventListener('input', input._artistInputListener);
    if (dropdown._artistListener) dropdown.removeEventListener('click', dropdown._artistListener);

    // Make input searchable
    input.removeAttribute('readonly');
    input.style.cursor = 'text';
    input.placeholder = 'Search artists...';

    // Handle search input
    input._artistInputListener = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredArtists = PW_ARTISTS.filter(artist => 
            artist.toLowerCase().includes(searchTerm)
        );
        
        // Render filtered options while preserving selections
        renderArtistOptionsWithSelections(dropdownId, filteredArtists, dropdown._artistSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('input', input._artistInputListener);

    // Handle click to show all options
    input._artistClickListener = (e) => {
        e.stopPropagation();
        // Show all options with current selections when clicked
    renderArtistOptionsWithSelections(dropdownId, PW_ARTISTS, dropdown._artistSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.toggle('show');
    };
    input.addEventListener('click', input._artistClickListener);

    // Show dropdown on focus
    input._artistFocusListener = (e) => {
        // Show all options with current selections when focused
    renderArtistOptionsWithSelections(dropdownId, PW_ARTISTS, dropdown._artistSelections);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('focus', input._artistFocusListener);

    // Add keyboard navigation support
    if (input._artistKeyListener) input.removeEventListener('keydown', input._artistKeyListener);
    input._artistKeyListener = (e) => {
        if (!dropdown.classList.contains('show')) return;
        
        const options = dropdown.querySelectorAll('.multiselect-option');
        let currentHighlighted = dropdown.querySelector('.multiselect-option.highlighted');
        let currentIndex = currentHighlighted ? Array.from(options).indexOf(currentHighlighted) : -1;
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                // Remove previous highlight
                if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                // Move to next option
                currentIndex = (currentIndex + 1) % options.length;
                options[currentIndex].classList.add('highlighted');
                // Scroll into view
                options[currentIndex].scrollIntoView({ block: 'nearest' });
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                // Remove previous highlight
                if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                // Move to previous option
                currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
                options[currentIndex].classList.add('highlighted');
                // Scroll into view
                options[currentIndex].scrollIntoView({ block: 'nearest' });
                break;
                
            case ' ':
            case 'Enter':
                e.preventDefault();
                if (currentHighlighted) {
                    const value = currentHighlighted.dataset.value;
                    
                    // Toggle selection in our Set
                    if (dropdown._artistSelections.has(value)) {
                        dropdown._artistSelections.delete(value);
                        currentHighlighted.classList.remove('selected');
                    } else {
                        dropdown._artistSelections.add(value);
                        currentHighlighted.classList.add('selected');
                    }
                    
                    updateSelectedArtists(selectedId, dropdownId);
                    input.value = '';  // Clear search input
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                dropdown.classList.remove('show');
                input.blur();
                break;
        }
    };
    input.addEventListener('keydown', input._artistKeyListener);

    // Register this instance for global click handling
    multiselectInstances.set(inputId, {
        dropdown: dropdown,
        input: input,
        selectedContainer: selectedContainer,
        updateInput: () => {
            input.value = '';  // Clear search input after selection
        }
    });
    addGlobalClickListener();

    // Select/deselect artists
    dropdown._artistListener = (e) => {
        const option = e.target.closest('.multiselect-option');
        if (!option) return;
        
        const value = option.dataset.value;
        
        // Toggle selection in our Set
        if (dropdown._artistSelections.has(value)) {
            dropdown._artistSelections.delete(value);
            option.classList.remove('selected');
        } else {
            dropdown._artistSelections.add(value);
            option.classList.add('selected');
        }
        
        updateSelectedArtists(selectedId, dropdownId);
        input.value = '';  // Clear search input
    };
    dropdown.addEventListener('click', dropdown._artistListener);
}

function updateSelectedArtists(selectedId, dropdownId) {
    const container = document.getElementById(selectedId);
    const dropdown = document.getElementById(dropdownId);
    if (!container || !dropdown) return;
    container.innerHTML = '';
    
    // Use the stored selections instead of DOM queries
    const selectedValues = Array.from(dropdown._artistSelections || []);
    selectedValues.forEach(value => {
        const span = document.createElement('span');
        span.className = 'multiselect-tag';
        span.innerHTML = `${value} <span class="remove-tag" data-value="${value}">×</span>`;
        container.appendChild(span);
    });
    
    // Add click listeners to remove tags
    container.querySelectorAll('.remove-tag').forEach(removeBtn => {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent dropdown from closing
            const value = e.target.dataset.value;
            
            // Remove from stored selections
            dropdown._artistSelections.delete(value);
            
            // Remove from visible dropdown options if present
            const option = dropdown.querySelector(`[data-value="${value}"]`);
            if (option) option.classList.remove('selected');
            
            updateSelectedArtists(selectedId, dropdownId);
        });
    });
}

// Generic searchable multiselect function
function setupSearchableMultiselect(inputId, dropdownId, selectedId, dataArray, allowMultiple = true) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const selectedContainer = document.getElementById(selectedId);
    if (!input || !dropdown || !selectedContainer) return;

    // Store original data for filtering
    dropdown.dataset.originalData = JSON.stringify(dataArray);
    
    // Create a property to track all selections (not just visible ones)
    dropdown._allSelections = new Set();
    
    // Render initial options (no selections initially)
    renderMultiselectOptions(dropdownId, dataArray, []);

    // Remove previous listeners if any
    if (input._multiselectListener) input.removeEventListener('input', input._multiselectListener);
    if (input._clickListener) input.removeEventListener('click', input._clickListener);
    if (dropdown._multiselectListener) dropdown.removeEventListener('click', dropdown._multiselectListener);

    // Make input searchable
    input.removeAttribute('readonly');
    input.style.cursor = 'text';
    input.placeholder = `Search and select...`;

    // Filter options as user types
    input._multiselectListener = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredData = dataArray.filter(item => 
            item.toLowerCase().includes(searchTerm)
        );
        
        // Use the stored selections instead of reading from DOM
        const selectedValues = Array.from(dropdown._allSelections || []);
        
        renderMultiselectOptions(dropdownId, filteredData, selectedValues);
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.add('show');
    };
    input.addEventListener('input', input._multiselectListener);

    // Show dropdown on click
    input._clickListener = (e) => {
        e.stopPropagation();
        
        // Use the stored selections instead of reading from DOM
        const selectedValues = Array.from(dropdown._allSelections || []);
        
        // If dropdown is being opened, ensure all options are shown with proper states
        if (!dropdown.classList.contains('show')) {
            renderMultiselectOptions(dropdownId, dataArray, selectedValues);
        }
        
        // Close all other dropdowns before opening this one
        multiselectInstances.forEach((instance) => {
            if (instance.dropdown !== dropdown) {
                instance.dropdown.classList.remove('show');
            }
        });
        dropdown.classList.toggle('show');
    };
    input.addEventListener('click', input._clickListener);

    // Register this instance for global click handling
    multiselectInstances.set(inputId, {
        dropdown: dropdown,
        input: input,
        selectedContainer: selectedContainer,
        updateInput: () => updateSearchableInput(inputId, selectedId)
    });
    addGlobalClickListener();

    // Select/deselect options
    dropdown._multiselectListener = (e) => {
        const option = e.target.closest('.multiselect-option');
        if (!option) return;
        
        const value = option.dataset.value;
        
        if (allowMultiple) {
            option.classList.toggle('selected');
            
            // Update stored selections
            if (option.classList.contains('selected')) {
                dropdown._allSelections.add(value);
            } else {
                dropdown._allSelections.delete(value);
            }
        } else {
            // Single select - clear all others first
            dropdown.querySelectorAll('.multiselect-option.selected').forEach(opt => {
                opt.classList.remove('selected');
            });
            option.classList.add('selected');
            dropdown.classList.remove('show');
            
            // Update stored selections for single select
            dropdown._allSelections.clear();
            dropdown._allSelections.add(value);
        }
        
        updateSelectedMultiselect(selectedId, dropdownId, allowMultiple, inputId);
        updateSearchableInput(inputId, selectedId);
    };
    dropdown.addEventListener('click', dropdown._multiselectListener);
}

function renderMultiselectOptions(dropdownId, dataArray, selectedValues = []) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.innerHTML = dataArray
        .map(item => {
            const isSelected = selectedValues.includes(item) ? ' selected' : '';
            return `<div class="multiselect-option${isSelected}" data-value="${item}">${item}</div>`;
        })
        .join('');
}

function updateSelectedMultiselect(selectedId, dropdownId, allowMultiple, inputId = null) {
    const container = document.getElementById(selectedId);
    const dropdown = document.getElementById(dropdownId);
    if (!container || !dropdown) return;
    
    container.innerHTML = '';
    
    // Use stored selections instead of DOM selections
    const selectedValues = Array.from(dropdown._allSelections || []);
    
    if (allowMultiple) {
        selectedValues.forEach(value => {
            const span = document.createElement('span');
            span.className = 'multiselect-tag';
            span.innerHTML = `${value} <span class="remove-tag" data-value="${value}">×</span>`;
            container.appendChild(span);
        });
        
        // Add click listeners to remove tags
        container.querySelectorAll('.remove-tag').forEach(removeBtn => {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent dropdown from closing
                const value = e.target.dataset.value;
                
                // Remove from stored selections
                dropdown._allSelections.delete(value);
                
                // Remove from visible dropdown options if present
                const option = dropdown.querySelector(`[data-value="${value}"]`);
                if (option) option.classList.remove('selected');
                
                updateSelectedMultiselect(selectedId, dropdownId, allowMultiple, inputId);
                if (inputId) updateSearchableInput(inputId, selectedId);
            });
        });
    } else {
        // Single select - just show the selected value
        if (selectedValues.length > 0) {
            const span = document.createElement('span');
            span.className = 'selected-single-option';
            span.textContent = selectedValues[0];
            container.appendChild(span);
        }
    }
}

function updateSearchableInput(inputId, selectedId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(selectedId);
    if (!input || !container) return;
    
    const selected = container.querySelectorAll('.multiselect-tag, .selected-single-option');
    if (selected.length === 0) {
        input.value = '';
    } else if (selected.length === 1 && selected[0].classList.contains('selected-single-option')) {
        input.value = selected[0].textContent;
    } else {
        // Clear input field when multiple items are selected instead of showing count
        input.value = '';
    }
}

function applyTheme(isDark) {
    const body = document.body;
    const toggle = document.getElementById('themeToggle');
    
    // Apply theme class
    body.classList.toggle('dark-mode', isDark);
    
    // Update toggle button if present
    if (toggle) {
        toggle.setAttribute('aria-pressed', String(isDark));
        if (isDark) {
            toggle.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
        } else {
            toggle.innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
        }
    }
    
    // Redraw preview if function exists
    if (typeof redrawPreviewOnThemeChange === 'function') {
        redrawPreviewOnThemeChange();
    }
}


// JWT helpers
function getJwtExpiry(token) {
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (!payload.exp) return null;
        return payload.exp * 1000;
    } catch {
        return null;
    }
}
function isJwtValid(token) {
    const exp = getJwtExpiry(token);
    return !!(token && exp && Date.now() < exp);
}

// Backend health check function for Render deployment
async function checkBackendHealth() {
    try {
        console.log('🏥 Checking backend health...');
        
        // Skip health check if we know it's not available (localhost backend from remote frontend)
        const isLocalFrontend = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isLocalBackend = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
        
        if (isLocalBackend && !isLocalFrontend) {
            console.log('🔧 Skipping health check - localhost backend not available from remote frontend');
            return false;
        }
        
        throttledShowNotification('🔌 Connecting to backend...', 'info', 2000);
        
        // Use authFetch with built-in retry logic for Render backend
        const healthResponse = await authFetch(`${API_BASE_URL}/api/health`, {
            method: 'GET'
        });
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            console.log('✅ Backend health check passed:', healthData);
            throttledShowNotification('✅ Connected to backend successfully!', 'success', 2000);
            return true;
        } else {
            console.warn('⚠️ Backend health check failed with status:', healthResponse.status);
            throttledShowNotification('⚠️ Backend connection issues detected', 'warning', 3000);
            return false;
        }
    } catch (error) {
        console.error('❌ Backend health check failed:', error);
        
        if (error.message.includes('timeout') || error.message.includes('taking too long')) {
            throttledShowNotification('⏰ Backend is warming up (Render free tier) - using cached data...', 'info', 5000);
        } else if (error.message.includes('unavailable after multiple attempts')) {
            throttledShowNotification('🔄 Backend temporarily unavailable - app will work in offline mode', 'warning', 6000);
        } else {
            throttledShowNotification('🔄 Backend connection failed - using cached data where possible', 'warning', 4000);
        }
        
        return false;
    }
}

// Robust theme switching function
// Global async init function for app initialization
window.init = async function init() {
    // Prevent multiple simultaneous initializations
    if (initializationState.isInitializing) {
        return initializationState.initPromise;
    }
    
    if (initializationState.isInitialized) {
        return Promise.resolve();
    }
    
    initializationState.isInitializing = true;
    initializationState.initPromise = performInitialization();
    
    try {
        await initializationState.initPromise;
        initializationState.isInitialized = true;
    } catch (error) {
        console.error('Initialization failed:', error);
        hideLoading();
        if (typeof showNotification === 'function') {
            showNotification('Failed to load app. Please refresh the page.');
        }
    } finally {
        initializationState.isInitializing = false;
    }
    
    return initializationState.initPromise;
};

// Backward compatibility: some cached/legacy HTML still calls bare init().
if (typeof globalThis.init !== 'function') {
    globalThis.init = (...args) => window.init(...args);
}

async function performInitialization() {
    // Show loader immediately at 0%
    resetLoadingProgress();
    showLoading(0, 'Initializing...');

    // Check backend health first (important for cross-origin setup)
    const backendHealthy = await checkBackendHealth();
    
    // Restore JWT and user state
    jwtToken = localStorage.getItem('pw_jwtToken') || '';
    if (jwtToken && isJwtValid(jwtToken)) {
        updateAuthButtons();
        if (backendHealthy) {
            await loadUserData();
        } else {
            console.log('⚠️ Skipping user data load due to backend issues - using cached data');
        }
    } else {
        updateAuthButtons();
    }
    
    // Theme and UI setup
    if (typeof applyTheme === 'function') applyTheme(isDarkMode);
    
    // Genre multiselects
    if (typeof setupGenreMultiselect === 'function') {
        setupGenreMultiselect('songGenre', 'genreDropdown', 'selectedGenres');
        setupGenreMultiselect('editSongGenre', 'editGenreDropdown', 'editSelectedGenres');
    }
    
    // Mood and Artist multiselects
    if (typeof setupMoodMultiselect === 'function') {
        setupMoodMultiselect('songMood', 'moodDropdown', 'selectedMoods');
        setupMoodMultiselect('editSongMood', 'editMoodDropdown', 'editSelectedMoods');
        setupArtistMultiselect('songArtist', 'artistDropdown', 'selectedArtists');
        setupArtistMultiselect('editSongArtist', 'editArtistDropdown', 'editSelectedArtists');
    }
    
    // Always show loading and load songs - let loadSongsWithProgress handle caching
    await loadSongsWithProgress();
    
    // Load setlists efficiently (70-80%)
    updateProgress('loadSetlists', 20);
    await loadGlobalSetlists();
    updateProgress('loadSetlists', 50);
    if (jwtToken && isJwtValid(jwtToken)) {
        await loadMySetlists();
    }
    updateProgress('loadSetlists', 90);
    
    // Ensure setlist folders have initial content
    renderGlobalSetlists();
    renderMySetlists();
    renderSmartSetlists();
    
    // Populate setlist dropdown after setlists are loaded
    populateSetlistDropdown();
    updateProgress('loadSetlists');
    
    // Update button states after loading setlist data
    setTimeout(() => {
        updateAllSetlistButtonStates();
    }, 500); // Small delay to ensure dropdown is populated
    
    // Settings and UI setup (80-95%)
    updateProgress('setupUI', 10);
    loadSettings();
    addEventListeners();
    addPanelToggles();
    updateProgress('setupUI', 30);
    addMobileTouchNavigation();

    if (!window.__pwMobileNavResizeBound) {
        window.__pwMobileNavResizeBound = true;
        window.addEventListener('resize', () => {
            addMobileTouchNavigation();
        });
    }
    updateProgress('setupUI', 50);

    renderSongs('Praise', '', '', '', '');
    applyLyricsBackground(document.getElementById('PraiseTab').classList.contains('active'));
    // connectWebSocket(); // Removed - not needed and may cause delays
    updateSongCount();
    updateProgress('setupUI', 70);
    initScreenWakeLock();
    setupModalClosing();
    setupSuggestedSongsClosing();
    setupModals();
    setupSmartSetlistHandlers();
    setupWindowCloseConfirmation();
    updateProgress('setupUI', 90);
    function resolvePreviewContextFromCurrentView(defaultContext = 'all-songs') {
        if (currentSetlistType === 'global') return 'global-setlist';
        if (currentSetlistType === 'my') return 'user-setlist';
        if (currentSetlistType === 'smart') return 'smart-setlist';
        return defaultContext;
    }

    // Handle initial page load with hash
    if (window.location.hash) {
        const songId = parseInt(window.location.hash.replace('#song-', ''));
        const song = songs.find(s => s.id === songId);
        if (song) {
            const historyContext = resolvePreviewContextFromCurrentView('all-songs');
            navigationHistory = [song.id];
            currentHistoryPosition = 0;
            history.replaceState({ songId: song.id, position: 0, openingContext: historyContext }, '', `#song-${song.id}`);
            showPreview(song, true, historyContext);
        }
    }
    window.addEventListener('popstate', (event) => {
        if (event.state?.modalOpen) {
            if (currentModal) closeModal(currentModal);
            return;
        }
        if (event.state?.position !== undefined) {
            isNavigatingHistory = true;
            currentHistoryPosition = event.state.position;
            const songId = navigationHistory[currentHistoryPosition];
            const song = songs.find(s => s.id === songId);
            if (song) {
                const historyContext = event.state?.openingContext || resolvePreviewContextFromCurrentView('all-songs');
                showPreview(song, true, historyContext);
            } else {
                songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics">No song is selected</div>';
            }
        }
    });
    // Admin panel button
    if (typeof updateAdminPanelBtn === 'function') updateAdminPanelBtn();

    updateProgress('setupUI');

    // Final setup (95-100%)
    updateProgress('finalSetup', 50);
    updateProgress('finalSetup');

    setTimeout(() => {
        hideLoading();
    }, 300);
}

// --- JWT expiry helpers: must be at the very top ---
// ===== GENRE MULTISELECT LOGIC =====
// Helper to update Taal dropdowns based on selected time signature
function updateTaalDropdown(timeSelectId, taalSelectId, selectedTaal = null) {
    const timeSelect = document.getElementById(timeSelectId);
    const taalSelect = document.getElementById(taalSelectId);
    if (!timeSelect || !taalSelect) return;
    const selectedTime = timeSelect.value;
    const taals = PW_TIME_GENRE_MAP[selectedTime] || [];
    taalSelect.innerHTML = '';
    // Add default option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select Genre or Taal';
    defaultOpt.disabled = true;
    defaultOpt.selected = !selectedTaal;
    taalSelect.appendChild(defaultOpt);
    taals.forEach(taal => {
        const opt = document.createElement('option');
        opt.value = taal;
        opt.textContent = taal;
        if (selectedTaal && selectedTaal === taal) opt.selected = true;
        taalSelect.appendChild(opt);
    });
}
    // Dynamic Taal dropdown for Add Song
    const songTimeSelect = document.getElementById('songTime');
    const songTaalSelect = document.getElementById('songTaal');
    if (songTimeSelect && songTaalSelect) {
        songTimeSelect.addEventListener('change', () => updateTaalDropdown('songTime', 'songTaal'));
        updateTaalDropdown('songTime', 'songTaal'); // Initial population
    }
    // Dynamic Taal dropdown for Edit Song
    const editSongTimeSelect = document.getElementById('editSongTime');
    const editSongTaalSelect = document.getElementById('editSongTaal');
    if (editSongTimeSelect && editSongTaalSelect) {
        editSongTimeSelect.addEventListener('change', () => updateTaalDropdown('editSongTime', 'editSongTaal'));
        updateTaalDropdown('editSongTime', 'editSongTaal'); // Initial population
    }
// ...existing code...



// Initialize genre multiselects on DOMContentLoaded

// Always define notificationEl first so it's available to all functions
    const notificationEl = document.getElementById('notification');

    // Initialize songs and setlists
    // Remove duplicate isDarkMode initialization; handled in DOMContentLoaded
        let socket = null;
        // songs is now global - don't redeclare it here
        let lastSongsFetch = null; // ISO string of last fetch
        let pw_favorites = [];
        let keepScreenOn = false;
        let autoScrollSpeed = localStorage.getItem('autoScrollSpeed') || 1500;
        let suggestedSongsDrawerOpen = false;
        let isScrolling = false;

        // New setlist variables
        let globalSetlists = [];
        let mySetlists = [];
        let smartSetlists = []; // Smart setlists loaded from server
        let currentViewingSetlist = null;
        let currentSetlistType = null; // 'global', 'my', or 'smart'

        // Expose setlist arrays to window for mobile.html access
        window.globalSetlists = globalSetlists;
        window.mySetlists = mySetlists;
        window.smartSetlists = smartSetlists;

        // Update currentUser from localStorage (no redeclaration needed)
        try {
            const s = localStorage.getItem('pw_currentUser');
            currentUser = s ? JSON.parse(s) : null;
        } catch { 
            currentUser = null; 
        }
         isDarkMode = localStorage.getItem('pw_darkMode') === 'true';




        if (API_BASE_URL.includes('localhost')) {
            // Using LOCAL backend
        } else {
            // Using PROD backend
        }


        // Restore JWT token and user state on every refresh
        if (!jwtToken && localStorage.getItem('pw_jwtToken')) {
            jwtToken = localStorage.getItem('pw_jwtToken');
        }

        // On script load, update UI and user data if logged in and token is valid
        if (jwtToken && isJwtValid(jwtToken)) {
            loadUserData().then(() => {
                updateAuthButtons();
            });
        } else if (jwtToken && !isJwtValid(jwtToken)) {
            // Remove expired token only if it is actually expired
            localStorage.removeItem('pw_jwtToken');
            jwtToken = '';
            updateAuthButtons();
        } else {
            updateAuthButtons();
        }

            
        async function loadSongsFromFile() {
            // Always use cached data - actual fetching is handled by loadSongsWithProgress()
            if (window.dataCache.songs && window.dataCache.songs.length > 0) {
                songs = window.dataCache.songs;
                return songs;
            }
            
            // If no cached data, fallback to empty array
            songs = [];
            return songs;
        }
    
        function connectWebSocket() {
            if (!window.WebSocket) {
                return;
            }
        }
    
        function updateSongCount() {
            document.getElementById('totalSongs').textContent = songs.length;
            document.getElementById('PraiseCount').textContent = songs.filter(s => s.category === 'Praise').length;
            document.getElementById('WorshipCount').textContent = songs.filter(s => s.category === 'Worship').length;
        }
    
        // Old setlist arrays removed - now using dropdown setlist system only

        // DOM Elements
        const PraiseTab = document.getElementById('PraiseTab');
        const WorshipTab = document.getElementById('WorshipTab');
        const PraiseContent = document.getElementById('PraiseContent');
        const WorshipContent = document.getElementById('WorshipContent');
        const keyFilter = document.getElementById('keyFilter');
        const genreFilter = document.getElementById('genreFilter');
        const moodFilter = document.getElementById('moodFilter');
        const artistFilter = document.getElementById('artistFilter');
        const songPreviewEl = document.getElementById('songPreview');
        const showAllEl = document.getElementById('showAll');
        const showFavoritesEl = document.getElementById('showFavorites');
        const setlistSection = document.getElementById('setlistSection');
        const PraiseSetlistSongs = document.getElementById('PraiseSetlistSongs');
        const WorshipSetlistSongs = document.getElementById('WorshipSetlistSongs');
        const PraiseSetlistTab = document.getElementById('PraiseSetlistTab');
        const WorshipSetlistTab = document.getElementById('WorshipSetlistTab');
        const deleteSection = document.getElementById('deleteSection');
        const deleteContent = document.getElementById('deleteContent');
        const favoritesSection = document.getElementById('favoritesSection');
        const favoritesContent = document.getElementById('favoritesContent');
        const addSongModal = document.getElementById('addSongModal');
        const openAddSongModal = document.getElementById('openAddSongModal');
        const newSongForm = document.getElementById('newSongForm');
        const editSongModal = document.getElementById('editSongModal');
        const editSongForm = document.getElementById('editSongForm');
        const deleteSongModal = document.getElementById('deleteSongModal');
        const deleteSongForm = document.getElementById('deleteSongForm');
        const cancelDeleteSong = document.getElementById('cancelDeleteSong');
        const downloadBtn = document.getElementById('downloadSongsBtn');
        const deleteAllSongsBtn = document.getElementById('deleteAllSongsBtn');
        const confirmDeleteAllModal = document.getElementById('confirmDeleteAllModal');
        const cancelDeleteAll = document.getElementById('cancelDeleteAll');
        const confirmDeleteAll = document.getElementById('confirmDeleteAll');
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearch');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const toggleSongsBtn = document.getElementById('toggle-songs');
    const toggleAllPanelsBtn = document.getElementById('toggle-all-panels');
    const keepScreenOnBtn = document.getElementById('keepScreenOnBtn');
    const editSetlistSectionBtn = document.getElementById('editSetlistSectionBtn');
    const resequenceSetlistSectionBtn = document.getElementById('resequenceSetlistSectionBtn');
    if (resequenceSetlistSectionBtn) {
        resequenceSetlistSectionBtn.onclick = async function() {
            if (currentSetlistType === 'smart') {
                showNotification('Smart setlists cannot be resequenced manually', 'error');
                return;
            }
            if (!window.setlistResequenceMode) {
                window.setlistResequenceMode = true;
                resequenceSetlistSectionBtn.textContent = 'Save Sequence';
                refreshSetlistDisplay();
            } else {
                // Save new sequence to backend
                const endpoint = currentSetlistType === 'global' ? '/api/global-setlists' : (currentSetlistType === 'my' ? '/api/my-setlists' : null);
                if (!endpoint) return;
                const currentSetlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
                await authFetch(`${API_BASE_URL}${endpoint}/${currentSetlistId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: currentViewingSetlist.name,
                        description: currentViewingSetlist.description,
                        songs: currentViewingSetlist.songs
                    })
                });
                window.setlistResequenceMode = false;
                resequenceSetlistSectionBtn.textContent = 'Resequence';
                refreshSetlistDisplay();
                showNotification('Setlist sequence saved!', 'success');
            }
        };
    }
    const deleteSetlistSectionBtn = document.getElementById('deleteSetlistSectionBtn');
    const setlistSectionActions = document.getElementById('setlistSectionActions');

    document.getElementById('loginBtn').onclick = () => showLoginModal();
    document.getElementById('logoutBtn').onclick = () => logout();
    
    // Password reset functionality
    let currentResetData = null; // Store identifier and method for OTP verification
    
    // Setup password reset event listeners
    setupPasswordResetEventListeners();
    // --- Admin Panel Logic ---
    async function fetchUsers() {
        try {
            const res = await authFetch(`${API_BASE_URL}/api/users`);
            if (!res.ok) {
                return [];
            }
            return res.json();
        } catch (err) {
            return [];
        }
    }
    async function markAdmin(userId) {
        try {
            const res = await authFetch(`${API_BASE_URL}/api/users/${userId}/admin`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isAdmin: true })
            });
            if (res.ok) {
                showAdminNotification('User marked as admin');
                loadUsers();
            } else {
                showAdminNotification('Failed to update user');
            }
        } catch (err) {
            showAdminNotification('Failed to update user');
        }
    }
    function showAdminNotification(msg) {
        const n = document.getElementById('adminNotification');
        n.textContent = msg;
        n.classList.add('show');
        n.style.display = 'block';
        setTimeout(() => {
            n.classList.remove('show');
            n.style.display = 'none';
        }, 2000);
    }
    function renderUsers(users) {
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        
        // Sort users with admin users first
        const sortedUsers = users.sort((a, b) => {
            if (a.isAdmin && !b.isAdmin) return -1;
            if (!a.isAdmin && b.isAdmin) return 1;
            // Secondary sort by username with null safety
            const usernameA = a.username || '';
            const usernameB = b.username || '';
            return usernameA.localeCompare(usernameB);
        });
        
        sortedUsers.forEach(user => {
            let displayName = '';
            if (user.username && user.username.trim()) {
                displayName = user.username.trim();
            } else if (user.name && user.name.trim()) {
                displayName = user.name.trim();
            } else if (user.firstName && user.firstName.trim()) {
                displayName = user.firstName.trim();
                if (user.lastName && user.lastName.trim()) {
                    displayName += ' ' + user.lastName.trim();
                }
            } else if (user.email && user.email.trim()) {
                displayName = user.email.trim();
            } else {
                displayName = 'Unknown User';
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="max-width:180px;overflow-wrap:break-word;">${displayName}</td>
                <td>${user.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}</td>
                <td>
                    <button class="btn" ${user.isAdmin ? 'disabled' : ''} onclick="markAdmin('${user._id}')">Mark Admin</button>
                </td>
                <td>
                    <button class="btn btn-danger" ${!user.isAdmin ? 'disabled' : ''} onclick="removeAdminRole('${user._id}')">Remove Admin</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    async function loadUsers() {
        const users = await fetchUsers();
        renderUsers(users);
    }
    
    // Load weights into form
    async function loadWeightsToForm() {
        await fetchRecommendationWeights();
        document.getElementById('weightLanguage').value = recommendationWeights.language;
        document.getElementById('weightScale').value = recommendationWeights.scale;
        document.getElementById('weightTimeSignature').value = recommendationWeights.timeSignature;
        document.getElementById('weightTaal').value = recommendationWeights.taal;
        document.getElementById('weightTempo').value = recommendationWeights.tempo;
        document.getElementById('weightGenre').value = recommendationWeights.genre;
        document.getElementById('weightVocal').value = recommendationWeights.vocal;
        document.getElementById('weightMood').value = recommendationWeights.mood;
        document.getElementById('weightRhythmCategory').value = recommendationWeights.rhythmCategory ?? 0;
    }
    
    function showAdminPanelModal() {
        document.getElementById('adminPanelModal').style.display = 'flex';
        
        // Set active tab
        document.getElementById('userMgmtTab').classList.add('active');
        document.getElementById('userMgmtTabContent').classList.add('active');
        document.getElementById('userMgmtTabContent').style.display = 'block';
        
        // Hide other tabs
        document.getElementById('weightsTab').classList.remove('active');
        document.getElementById('weightsTabContent').classList.remove('active');
        document.getElementById('weightsTabContent').style.display = 'none';
        document.getElementById('duplicateDetectionTab').classList.remove('active');
        document.getElementById('duplicateDetectionTabContent').classList.remove('active');
        document.getElementById('duplicateDetectionTabContent').style.display = 'none';
        document.getElementById('backendMgmtTab').classList.remove('active');
        document.getElementById('backendMgmtTabContent').classList.remove('active');
        document.getElementById('backendMgmtTabContent').style.display = 'none';
        document.getElementById('featureManagersTab').classList.remove('active');
        document.getElementById('featureManagersTabContent').classList.remove('active');
        document.getElementById('featureManagersTabContent').style.display = 'none';
        
        // Load users and set up functions
        loadUsers();
        window.markAdmin = markAdmin;
    }
    // Setup admin panel event handlers
    function setupAdminPanelEventHandlers() {
        console.log('🔧 Setting up admin panel event handlers...');
        
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        if (adminPanelBtn) {
            adminPanelBtn.onclick = () => showAdminPanelModal();
            console.log('✅ Admin panel button handler set');
        } else {
            console.log('⚠️ Admin panel button not found');
        }

        // Setup tab handlers with error checking
        setupAdminTabHandler('userMgmtTab', 'userMgmtTabContent', null);
        setupAdminTabHandler('weightsTab', 'weightsTabContent', loadWeightsToForm);
        setupAdminTabHandler('duplicateDetectionTab', 'duplicateDetectionTabContent', renderDuplicateDetection);
        setupAdminTabHandler('backendMgmtTab', 'backendMgmtTabContent', initializeBackendManagement);
        setupAdminTabHandler('featureManagersTab', 'featureManagersTabContent', null);
    }
    
    function setupAdminTabHandler(tabId, contentId, initFunction) {
        const tabElement = document.getElementById(tabId);
        if (!tabElement) {
            console.log(`⚠️ Tab element ${tabId} not found`);
            return;
        }
        
        tabElement.onclick = function() {
            console.log(`🖱️ ${tabId} clicked!`);
            
            // Remove active from all tabs
            const allTabs = ['userMgmtTab', 'weightsTab', 'duplicateDetectionTab', 'backendMgmtTab', 'featureManagersTab'];
            const allContents = ['userMgmtTabContent', 'weightsTabContent', 'duplicateDetectionTabContent', 'backendMgmtTabContent', 'featureManagersTabContent'];
            
            allTabs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });
            
            allContents.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('active');
                    el.style.display = 'none';
                }
            });
            
            // Set active tab
            const activeTab = document.getElementById(tabId);
            const activeContent = document.getElementById(contentId);
            
            if (activeTab) {
                activeTab.classList.add('active');
                console.log(`✅ ${tabId} set to active`);
            }
            
            if (activeContent) {
                activeContent.classList.add('active');
                activeContent.style.display = 'block';
                console.log(`✅ ${contentId} set to active`);
                console.log(`Display style: ${getComputedStyle(activeContent).display}`);
            } else {
                console.log(`❌ Content element ${contentId} not found`);
            }
            
            // Run initialization function if provided
            if (initFunction && typeof initFunction === 'function') {
                try {
                    initFunction();
                } catch (error) {
                    console.error(`❌ Error running init function for ${tabId}:`, error);
                }
            }
        };
        
        console.log(`✅ Handler set for ${tabId}`);
    }

    // Initialize admin panel after DOM is ready
    document.addEventListener('DOMContentLoaded', setupAdminPanelEventHandlers);



    // --- Backend Management Logic ---
    function initializeBackendManagement() {
        console.log('🔧 Initializing Backend Management...');
        try {
            updateBackendStatus();
            setupBackendEventListeners();
            checkAllBackendHealth();
            console.log('✅ Backend Management initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing Backend Management:', error);
        }
    }

    function updateBackendStatus() {
        console.log('📊 Updating backend status...');
        const statusElement = document.getElementById('currentBackendStatus');
        const apiUrlElement = document.getElementById('currentApiUrl');
        
        console.log('Current backend: vercel');
        console.log('Status element:', statusElement);
        console.log('API URL element:', apiUrlElement);
        
        if (!statusElement || !apiUrlElement) {
            console.error('❌ Backend status elements not found!');
            return;
        }
        
        statusElement.textContent = 'Vercel';
        statusElement.style.background = '#0070f3';
        statusElement.style.color = 'white';
        
        apiUrlElement.textContent = API_BASE_URL;
        console.log('✅ Backend status updated');
    }

    function setupBackendEventListeners() {
        console.log('🎧 Setting up backend event listeners...');
        const renderBtn = document.getElementById('switchToRenderBtn');
        const vercelBtn = document.getElementById('switchToVercelBtn');
        const healthBtn = document.getElementById('checkHealthBtn');
        
        console.log('Render button:', renderBtn);
        console.log('Vercel button:', vercelBtn);
        console.log('Health button:', healthBtn);
        
        if (renderBtn) {
            renderBtn.disabled = true;
            renderBtn.title = 'Render fallback disabled';
        }
        
        if (vercelBtn) {
            vercelBtn.onclick = () => switchBackend('vercel');
        } else {
            console.error('❌ Switch to Vercel button not found!');
        }
        
        if (healthBtn) {
            healthBtn.onclick = checkAllBackendHealth;
        } else {
            console.error('❌ Check Health button not found!');
        }
        
        console.log('✅ Backend event listeners setup complete');
    }

    function switchBackend(backend) {
        if (backend !== 'vercel') {
            showBackendNotification('Render fallback is disabled. Using Vercel only.', 'info');
            return;
        }

        setBackend('vercel');
        updateBackendStatus();
        showBackendNotification(`✅ Using VERCEL backend. All API calls now use ${API_BASE_URL}`, 'success');
        
        // Optionally refresh data to test the new backend
        setTimeout(() => {
            checkAllBackendHealth();
        }, 1000);
    }

    async function checkSpecificBackendHealth(url, name) {
        try {
            // Validate URL parameter
            if (!url) {
                console.error('❌ checkSpecificBackendHealth called with undefined URL');
                return { status: 'error', message: '❌ Invalid URL' };
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const response = await fetch(`${url}/api/health`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return { status: 'online', message: `✅ Online (${response.status})` };
            } else {
                return { status: 'error', message: `❌ Error (${response.status})` };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { status: 'timeout', message: '⏱️ Timeout (>10s)' };
            }
            return { status: 'offline', message: `❌ Offline (${error.message})` };
        }
    }

    async function checkAllBackendHealth() {
        const renderStatusEl = document.getElementById('renderHealthStatus');
        const vercelStatusEl = document.getElementById('vercelHealthStatus');

        if (renderStatusEl) {
            renderStatusEl.textContent = 'Disabled';
            renderStatusEl.style.color = '#6c757d';
        }
        if (vercelStatusEl) {
            vercelStatusEl.textContent = 'Checking...';
        }

        const vercelHealth = await checkSpecificBackendHealth(API_BASE_URL_VERCEL, 'Vercel');

        if (vercelStatusEl) {
            vercelStatusEl.textContent = `${vercelHealth.message} (Primary - Vercel)`;
            vercelStatusEl.style.color = vercelHealth.status === 'online' ? '#28a745' : '#dc3545';
        }
    }

    function showBackendNotification(msg, type = 'info') {
        const n = document.getElementById('backendNotification');
        n.textContent = msg;
        n.className = `notification show ${type}`;
        n.style.display = 'block';
        setTimeout(() => {
            n.classList.remove('show');
            setTimeout(() => n.style.display = 'none', 300);
        }, 4000);
    }

    // --- Duplicate Detection Logic ---
    function stringSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        str1 = str1.toLowerCase();
        str2 = str2.toLowerCase();
        const len1 = str1.length;
        const len2 = str2.length;
        const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        for (let i = 0; i <= len1; i++) dp[i][0] = i;
        for (let j = 0; j <= len2; j++) dp[0][j] = j;
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }
        const maxLen = Math.max(len1, len2);
        return maxLen === 0 ? 1 : 1 - dp[len1][len2] / maxLen;
    }

    function findDuplicateSongs() {
        const duplicates = [];
        for (let i = 0; i < songs.length; i++) {
            for (let j = i + 1; j < songs.length; j++) {
                const s1 = songs[i];
                const s2 = songs[j];
                const titleSim = stringSimilarity(s1.title, s2.title);
                const lyricsSim = stringSimilarity(s1.lyrics, s2.lyrics);
                if (titleSim >= 0.8 || lyricsSim >= 0.8) {
                    duplicates.push({
                        song1: s1,
                        song2: s2,
                        titleSim,
                        lyricsSim
                    });
                }
            }
        }
        return duplicates;
    }

    function renderDuplicateDetection() {
        const container = document.getElementById('duplicateDetectionTabContent');
        container.innerHTML = '<h3>Duplicate Songs (≥80% match)</h3>';
        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'duplicateLoading';
        loadingDiv.innerHTML = '<span>Detecting duplicates, please wait...</span>';
        loadingDiv.style.padding = '12px';
        container.appendChild(loadingDiv);

        // Limit to first 500 songs for performance
        const limitedSongs = songs.slice(0, 500);
        const duplicates = [];
        // Track shown pairs to avoid duplicates
        const shownPairs = new Set();
        // 1. Exact match detection using hash maps
        const titleMap = new Map();
        const lyricsMap = new Map();
        limitedSongs.forEach(song => {
            const t = song.title.trim().toLowerCase();
            const l = song.lyrics.trim().toLowerCase();
            if (titleMap.has(t)) {
                const other = titleMap.get(t);
                const key = [Math.min(song.id, other.id), Math.max(song.id, other.id)].join('_');
                if (!shownPairs.has(key)) {
                    duplicates.push({ song1: song, song2: other, titleSim: 1, lyricsSim: stringSimilarity(song.lyrics, other.lyrics) });
                    shownPairs.add(key);
                }
            } else {
                titleMap.set(t, song);
            }
            if (lyricsMap.has(l)) {
                const other = lyricsMap.get(l);
                const key = [Math.min(song.id, other.id), Math.max(song.id, other.id)].join('_');
                if (!shownPairs.has(key)) {
                    duplicates.push({ song1: song, song2: other, titleSim: stringSimilarity(song.title, other.title), lyricsSim: 1 });
                    shownPairs.add(key);
                }
            } else {
                lyricsMap.set(l, song);
            }
        });

        // 2. Fuzzy match detection for likely candidates
        // Group songs by first letter and similar length
        const groups = {};
        limitedSongs.forEach(song => {
            const key = song.title[0].toLowerCase() + '_' + song.title.length;
            if (!groups[key]) groups[key] = [];
            groups[key].push(song);
        });

        // Fast similarity check: normalized common chars
        function fastSimilarity(a, b) {
            if (!a || !b) return 0;
            a = a.toLowerCase();
            b = b.toLowerCase();
            let matches = 0;
            for (let ch of a) {
                if (b.includes(ch)) matches++;
            }
            return matches / Math.max(a.length, b.length);
        }

        Object.values(groups).forEach(group => {
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const s1 = group[i];
                    const s2 = group[j];
                    const key = [Math.min(s1.id, s2.id), Math.max(s1.id, s2.id)].join('_');
                    if (shownPairs.has(key)) continue;
                    // Only do expensive check if fastSimilarity > 0.6
                    if (fastSimilarity(s1.title, s2.title) > 0.6 || fastSimilarity(s1.lyrics, s2.lyrics) > 0.6) {
                        const titleSim = stringSimilarity(s1.title, s2.title);
                        const lyricsSim = stringSimilarity(s1.lyrics, s2.lyrics);
                        if (titleSim >= 0.8 || lyricsSim >= 0.8) {
                            duplicates.push({ song1: s1, song2: s2, titleSim, lyricsSim });
                            shownPairs.add(key);
                        }
                    }
                }
            }
        });

        loadingDiv.remove();
        if (duplicates.length === 0) {
            container.innerHTML += '<p>No duplicates found.</p>';
            return;
        }
        let batchSize = 20;
        let currentBatch = 0;
        function renderBatch() {
            const start = currentBatch * batchSize;
            const end = Math.min(start + batchSize, duplicates.length);
            for (let idx = start; idx < end; idx++) {
                const dup = duplicates[idx];
                const div = document.createElement('div');
                div.className = 'duplicate-pair';
                div.innerHTML = `
                    <div class="duplicate-row" style="display:flex;align-items:flex-start;gap:32px;padding:16px 12px;margin-bottom:16px;border:1px solid #e0e0e0;border-radius:8px;background:#fafbfc;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                        <div class="duplicate-song" style="flex:1;min-width:220px;">
                            <div style="font-weight:600;font-size:1.08em;margin-bottom:4px;color:#2d6cdf;"><i class="fas fa-music"></i> Song 1</div>
                            <div style="font-size:1.04em;margin-bottom:2px;"><b>${dup.song1.title}</b></div>
                            <div style="color:#888;font-size:0.97em;margin-bottom:6px;">ID: ${dup.song1.id}</div>
                            <button class="btn btn-delete" style="margin-right:8px;" onclick="deleteSingleDuplicateSong(${dup.song1.id})">Delete</button>
                            <button class="btn btn-view" onclick="viewSingleLyrics(${dup.song1.id}, '${dup.song2.id}')">View Lyrics</button>
                        </div>
                        <div class="duplicate-song" style="flex:1;min-width:220px;">
                            <div style="font-weight:600;font-size:1.08em;margin-bottom:4px;color:#d14b4b;"><i class="fas fa-music"></i> Song 2</div>
                            <div style="font-size:1.04em;margin-bottom:2px;"><b>${dup.song2.title}</b></div>
                            <div style="color:#888;font-size:0.97em;margin-bottom:6px;">ID: ${dup.song2.id}</div>
                            <button class="btn btn-delete" style="margin-right:8px;" onclick="deleteSingleDuplicateSong(${dup.song2.id})">Delete</button>
                            <button class="btn btn-view" onclick="viewSingleLyrics(${dup.song2.id}, '${dup.song1.id}')">View Lyrics</button>
                        </div>
                        <div class="duplicate-meta" style="flex-basis:180px;min-width:140px;text-align:center;align-self:center;">
                            <div style="font-size:0.98em;margin-bottom:4px;"><span style="color:#2d6cdf;font-weight:600;">Title Similarity:</span> ${(dup.titleSim*100).toFixed(1)}%</div>
                            <div style="font-size:0.98em;"><span style="color:#d14b4b;font-weight:600;">Lyrics Similarity:</span> ${(dup.lyricsSim*100).toFixed(1)}%</div>
                        </div>
                    </div>
                    <div id="lyricsCompare${dup.song1.id}_${dup.song2.id}" style="display:none;"></div>
                    <div id="lyricsSingle${dup.song1.id}_${dup.song2.id}" style="display:none;"></div>
                    <div id="lyricsSingle${dup.song2.id}_${dup.song1.id}" style="display:none;"></div>
                `;
// Show lyrics for a single song in duplicate pair
window.viewSingleLyrics = function(songId, otherId) {
    const song = songs.find(s => s.id == songId);
    const lyricsDiv = document.getElementById(`lyricsSingle${songId}_${otherId}`);
    if (!lyricsDiv) return;
    lyricsDiv.style.display = lyricsDiv.style.display === 'none' ? 'block' : 'none';
    lyricsDiv.innerHTML = `<pre style='background:#f9f9f9;padding:8px;border:1px solid #ccc;'><b>${song.title}:</b>\n${song.lyrics}</pre>`;
}
                container.appendChild(div);
            }
            if (end < duplicates.length) {
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.textContent = `Load More (${duplicates.length - end} remaining)`;
                loadMoreBtn.className = 'btn';
                loadMoreBtn.style.margin = '12px 0';
                loadMoreBtn.onclick = function() {
                    loadMoreBtn.remove();
                    currentBatch++;
                    renderBatch();
                };
                container.appendChild(loadMoreBtn);
            }
        }
        renderBatch();
    }

    window.viewLyrics = function(id1, id2) {
        const song1 = songs.find(s => s.id === id1);
        const song2 = songs.find(s => s.id === id2);
        const lyricsDiv = document.getElementById(`lyricsCompare${id1}_${id2}`);
        if (!lyricsDiv) return;
        lyricsDiv.style.display = lyricsDiv.style.display === 'none' ? 'block' : 'none';
        lyricsDiv.innerHTML = `<pre style='background:#f9f9f9;padding:8px;border:1px solid #ccc;'><b>${song1.title}:</b>\n${song1.lyrics}\n\n<b>${song2.title}:</b>\n${song2.lyrics}</pre>`;
    }

    // Centralized song deletion logic
    async function deleteSongById(songId, postDeleteCallback) {
        try {
            const resp = await authFetch(`${API_BASE_URL}/api/songs/${songId}`, {
                method: 'DELETE'
            });
            if (resp.ok) {
                // Remove from global songs array
                songs = songs.filter(s => s.id !== songId);
                
                // Remove from cache if it exists
                if (window.dataCache && window.dataCache.songs) {
                    window.dataCache.songs = window.dataCache.songs.filter(s => s.id !== songId);
                }
                
                // Remove from localStorage
                localStorage.setItem('pw_songs', JSON.stringify(songs));
                localStorage.setItem('pw_songsTimestamp', Date.now().toString());
                window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();
                localStorage.setItem('pw_songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
                
                showNotification('Song deleted successfully');
                
                if (typeof postDeleteCallback === 'function') postDeleteCallback();
            } else if (resp.status === 404) {
                showNotification('Song not found in backend (already deleted)');
                // Do NOT remove from local list
            } else {
                showNotification('Failed to delete song from backend');
            }
        } catch (err) {
            showNotification('Error deleting song from backend');
        }
        updateSongCount();
    }

    window.deleteSingleDuplicateSong = async function(songId) {
        await deleteSongById(songId, renderDuplicateDetection);
    }

    // ====================== SETLIST MANAGEMENT FUNCTIONS ======================

    // Populate setlist dropdown
    function setupCustomDropdownHandlers() {
        const dropdownArrow = document.getElementById('dropdownArrow');
        const dropdownMainArea = document.getElementById('dropdownMainArea');
        const dropdownMenu = document.getElementById('dropdownMenu');
        const customDropdown = document.querySelector('.custom-setlist-dropdown');
        
        if (!dropdownArrow || !dropdownMainArea || !dropdownMenu || !customDropdown) {
            return;
        }
        
        // Remove existing event listeners to avoid duplicates
        dropdownArrow.removeEventListener('click', handleDropdownArrowClick);
        dropdownMainArea.removeEventListener('click', handleDropdownMainAreaClick);
        
        // Arrow click - toggle dropdown menu
        dropdownArrow.addEventListener('click', handleDropdownArrowClick);
        
        // Main area click - open selected setlist (like sidebar setlist-items)
        dropdownMainArea.addEventListener('click', handleDropdownMainAreaClick);
        
        // Click outside to close dropdown
        document.addEventListener('click', (e) => {
            if (!customDropdown.contains(e.target)) {
                closeDropdownMenu();
            }
        });
        
        // Handle option clicks
        dropdownMenu.addEventListener('click', (e) => {
            if (e.target.classList.contains('dropdown-option')) {
                const value = e.target.dataset.value || '';
                const text = e.target.textContent;
                selectDropdownOption(value, text);
                closeDropdownMenu();
            }
        });
    }
    
    function handleDropdownArrowClick(e) {
        e.stopPropagation();
        const dropdownMenu = document.getElementById('dropdownMenu');
        const isOpen = dropdownMenu.style.display === 'block';
        
        if (isOpen) {
            closeDropdownMenu();
        } else {
            openDropdownMenu();
        }
    }
    
    function handleDropdownMainAreaClick(e) {
        e.stopPropagation();
        const setlistDropdown = document.getElementById('setlistDropdown');
        const selectedValue = setlistDropdown.value;
        
        if (selectedValue && selectedValue !== '') {
            // Use the same logic as setlist-item click handlers
            console.log('Opening setlist from dropdown main area:', selectedValue);
            
            // Parse the selection to get type and ID
            if (selectedValue.startsWith('global_')) {
                const setlistId = selectedValue.replace('global_', '');
                showGlobalSetlistInMainSection(setlistId);
            } else if (selectedValue.startsWith('my_')) {
                const setlistId = selectedValue.replace('my_', '');
                showMySetlistInMainSection(setlistId);
            } else if (selectedValue.startsWith('smart_')) {
                const setlistId = selectedValue.replace('smart_', '');
                showSmartSetlistInMainSection(setlistId);
            }
        } else {
            // No setlist selected, show a helpful message
            showNotification('Please select a setlist first', 'info');
        }
    }
    
    function openDropdownMenu() {
        const dropdownMenu = document.getElementById('dropdownMenu');
        const dropdownArrow = document.getElementById('dropdownArrow');
        
        dropdownMenu.style.display = 'block';
        dropdownArrow.style.transform = 'rotate(180deg)';
    }
    
    function closeDropdownMenu() {
        const dropdownMenu = document.getElementById('dropdownMenu');
        const dropdownArrow = document.getElementById('dropdownArrow');
        
        dropdownMenu.style.display = 'none';
        dropdownArrow.style.transform = 'rotate(0deg)';
    }
    
    function selectDropdownOption(value, text) {
        const setlistDropdown = document.getElementById('setlistDropdown');
        const dropdownText = document.getElementById('dropdownText');
        
        // Update the hidden select element
        setlistDropdown.value = value;
        
        // Update the display text
        updateCustomDropdownDisplay(value);
        
        // Save to localStorage (clear if empty selection)
        if (value && value !== '') {
            localStorage.setItem('pw_selectedSetlist', value);
        } else {
            localStorage.removeItem('pw_selectedSetlist');
        }
        
        // Update styling
        updateSetlistDropdownStyle(!!value);
        
        // Trigger change event if needed
        const changeEvent = new Event('change', { bubbles: true });
        setlistDropdown.dispatchEvent(changeEvent);
    }
    
    function updateCustomDropdownDisplay(value) {
        const dropdownText = document.getElementById('dropdownText');
        const setlistDropdown = document.getElementById('setlistDropdown');
        
        if (value && value !== '' && dropdownText && setlistDropdown) {
            const selectedOption = setlistDropdown.querySelector(`option[value="${value}"]`);
            if (selectedOption) {
                dropdownText.textContent = selectedOption.textContent;
                dropdownText.style.fontStyle = 'normal';
                dropdownText.style.color = '';
            }
        } else if (dropdownText) {
            dropdownText.textContent = 'Select a Setlist';
            dropdownText.style.fontStyle = 'italic';
            dropdownText.style.color = '#aaa';
        }
    }

    function populateSetlistDropdown() {
        const setlistDropdown = document.getElementById('setlistDropdown');
        const dropdownMenu = document.getElementById('dropdownMenu');
        const dropdownText = document.getElementById('dropdownText');
        
        if (!setlistDropdown) {
            return;
        }
        
        // Check if we're on mobile (no custom dropdown elements)
        const isMobile = !dropdownMenu || !dropdownText;
        
        // Store the current selection to preserve it
        const currentSelection = setlistDropdown.value;
        
        // Clear existing options and menu items
        setlistDropdown.innerHTML = '<option value="">Select a Setlist</option>';
        if (dropdownMenu) dropdownMenu.innerHTML = '';
        
        // Check if we have real data
        let hasGlobalData = globalSetlists && globalSetlists.length > 0;
        let hasMyData = mySetlists && mySetlists.length > 0;
        let hasSmartData = smartSetlists && smartSetlists.length > 0;
        
        // Add default option to custom dropdown (desktop only)
        if (!isMobile) {
            const defaultOption = document.createElement('div');
            defaultOption.className = 'dropdown-option';
            defaultOption.dataset.value = '';
            defaultOption.textContent = 'Select a Setlist';
            defaultOption.style.cssText = 'font-style: italic; color: #aaa;';
            dropdownMenu.appendChild(defaultOption);
        }
        
        // Only show real setlists that exist in the database
        // Add real My Setlists first with compact suffix (if user is logged in)
        if (currentUser && hasMyData) {
            mySetlists.forEach(setlist => {
                // Add to original select (works for both mobile and desktop)
                const option = document.createElement('option');
                option.value = `my_${setlist._id}`;
                option.textContent = `${setlist.name} (My)`;
                setlistDropdown.appendChild(option);
                
                // Add to custom dropdown with suffix (desktop only)
                if (!isMobile) {
                    const customOption = document.createElement('div');
                    customOption.className = 'dropdown-option';
                    customOption.dataset.value = `my_${setlist._id}`;
                    customOption.dataset.type = 'my';
                    customOption.dataset.setlistId = setlist._id;
                    customOption.innerHTML = `${setlist.name} <span style="color: #888; font-size: 0.85em; float: right;">(My)</span>`;
                    dropdownMenu.appendChild(customOption);
                }
            });
        }
        
        // Add real Global Setlists second with compact suffix
        if (hasGlobalData) {
            globalSetlists.forEach(setlist => {
                // Add to original select (works for both mobile and desktop)
                const option = document.createElement('option');
                option.value = `global_${setlist._id}`;
                option.textContent = `${setlist.name} (Global)`;
                setlistDropdown.appendChild(option);
                
                // Add to custom dropdown with suffix (desktop only)
                if (!isMobile) {
                    const customOption = document.createElement('div');
                    customOption.className = 'dropdown-option';
                    customOption.dataset.value = `global_${setlist._id}`;
                    customOption.dataset.type = 'global';
                    customOption.dataset.setlistId = setlist._id;
                    customOption.innerHTML = `${setlist.name} <span style="color: #888; font-size: 0.85em; float: right;">(Global)</span>`;
                    dropdownMenu.appendChild(customOption);
                }
            });
        }

        // Add Smart Setlists with compact suffix
        if (currentUser && hasSmartData) {
            smartSetlists.forEach(setlist => {
                const smartId = setlist._id || setlist.id;

                const option = document.createElement('option');
                option.value = `smart_${smartId}`;
                option.textContent = `${setlist.name} (Smart)`;
                setlistDropdown.appendChild(option);

                if (!isMobile) {
                    const customOption = document.createElement('div');
                    customOption.className = 'dropdown-option';
                    customOption.dataset.value = `smart_${smartId}`;
                    customOption.dataset.type = 'smart';
                    customOption.dataset.setlistId = smartId;
                    customOption.innerHTML = `${setlist.name} <span style="color: #888; font-size: 0.85em; float: right;">(Smart)</span>`;
                    dropdownMenu.appendChild(customOption);
                }
            });
        }
        
        // Show helpful message when no setlists are available
        if (!hasGlobalData && !hasMyData && !hasSmartData) {
            const helpOption = document.createElement('option');
            helpOption.value = '';
            helpOption.disabled = true;
            helpOption.textContent = currentUser ? 'Create your first setlist to get started' : 'Login to create and access setlists';
            setlistDropdown.appendChild(helpOption);
            
            // Add to custom dropdown (desktop only)
            if (!isMobile) {
                const helpCustomOption = document.createElement('div');
                helpCustomOption.className = 'dropdown-option';
                helpCustomOption.style.color = '#888';
                helpCustomOption.style.fontStyle = 'italic';
                helpCustomOption.textContent = currentUser ? 'Create your first setlist to get started' : 'Login to create and access setlists';
                dropdownMenu.appendChild(helpCustomOption);
            }
        }
        
        // Set up custom dropdown event handlers
        setupCustomDropdownHandlers();
        
        // Restore the previous selection if it still exists
        if (currentSelection) {
            const optionExists = Array.from(setlistDropdown.options).some(option => option.value === currentSelection);
            if (optionExists) {
                setlistDropdown.value = currentSelection;
                updateCustomDropdownDisplay(currentSelection);
                updateSetlistDropdownStyle(true);
            }
        } else {
            // If no current selection, check localStorage
            const savedSelection = localStorage.getItem('pw_selectedSetlist');
            if (savedSelection) {
                const optionExists = Array.from(setlistDropdown.options).some(option => option.value === savedSelection);
                if (optionExists) {
                    setlistDropdown.value = savedSelection;
                    updateCustomDropdownDisplay(savedSelection);
                    updateSetlistDropdownStyle(true);
                }
            }
        }
    }

    function updateSetlistDropdownStyle(hasSelection) {
        const setlistDropdown = document.getElementById('setlistDropdown');
        if (!setlistDropdown) return;
        
        if (hasSelection) {
            setlistDropdown.style.backgroundColor = '#e8f5e8';
            setlistDropdown.style.border = '2px solid #28a745';
            setlistDropdown.style.fontWeight = 'bold';
        } else {
            setlistDropdown.style.backgroundColor = '';
            setlistDropdown.style.border = '';
            setlistDropdown.style.fontWeight = '';
        }
    }

    // Initialize song selection with checkboxes for setlist creation (Worship and Praise songs)
    function initializeSetlistSongSelection(prefix) {
        const searchInput = document.getElementById(`${prefix}SetlistSongSearch`);
        const worshipSongList = document.getElementById(`${prefix}WorshipSongSelectionList`);
        const praiseSongList = document.getElementById(`${prefix}PraiseSongSelectionList`);
        const selectAllWorshipCheckbox = document.getElementById(`${prefix}SelectAllWorshipSongs`);
        const selectAllPraiseCheckbox = document.getElementById(`${prefix}SelectAllPraiseSongs`);
        const selectedCountSpan = document.getElementById(`${prefix}SelectedCount`);
        const selectedWorshipCountSpan = document.getElementById(`${prefix}SelectedWorshipCount`);
        const selectedPraiseCountSpan = document.getElementById(`${prefix}SelectedPraiseCount`);
        
        // Tab elements
        const worshipSongsTab = document.getElementById(`${prefix}WorshipSongsTab`);
        const praiseSongsTab = document.getElementById(`${prefix}PraiseSongsTab`);
        const worshipSongsContent = document.getElementById(`${prefix}WorshipSongsContent`);
        const praiseSongsContent = document.getElementById(`${prefix}PraiseSongsContent`);
        const worshipSongsCount = document.getElementById(`${prefix}WorshipSongsCount`);
        const praiseSongsCount = document.getElementById(`${prefix}PraiseSongsCount`);
        
        // Filter elements
        const keyFilter = document.getElementById(`${prefix}KeyFilter`);
        const genreFilter = document.getElementById(`${prefix}GenreFilter`);
        const moodFilter = document.getElementById(`${prefix}MoodFilter`);
        const artistFilter = document.getElementById(`${prefix}ArtistFilter`);
        
        if (!searchInput || !worshipSongList || !praiseSongList || !selectAllWorshipCheckbox || !selectAllPraiseCheckbox || 
            !selectedCountSpan || !selectedWorshipCountSpan || !selectedPraiseCountSpan ||
            !worshipSongsTab || !praiseSongsTab || !worshipSongsContent || !praiseSongsContent) {
            return;
        }

        let selectedSongs = [];
        let filteredWorshipSongs = [];
        let filteredPraiseSongs = [];
        let currentFilters = {
            search: '',
            key: '',
            genre: '',
            mood: '',
            artist: ''
        };

        // Initialize filter dropdowns
        function initializeFilters() {
            // Clear existing options
            [keyFilter, genreFilter, moodFilter, artistFilter].forEach(filter => {
                if (filter) {
                    while (filter.options.length > 1) {
                        filter.removeChild(filter.lastChild);
                    }
                }
            });

            // Populate key filter
            if (keyFilter) {
                PW_KEYS.forEach(key => {
                    const option = document.createElement('option');
                    option.value = key;
                    option.textContent = key;
                    keyFilter.appendChild(option);
                });
            }

            // Populate genre filter
            if (genreFilter) {
                const genres = [...new Set(songs.flatMap(song => 
                    typeof song.genre === 'string' ? song.genre.split(',').map(g => g.trim()) : []
                ))].sort();
                genres.forEach(genre => {
                    const option = document.createElement('option');
                    option.value = genre;
                    option.textContent = genre;
                    genreFilter.appendChild(option);
                });
            }

            // Populate mood filter
            if (moodFilter) {
                const moods = [...new Set(songs.flatMap(song => 
                    typeof song.mood === 'string' ? song.mood.split(',').map(m => m.trim()) : []
                ))].sort();
                moods.forEach(mood => {
                    const option = document.createElement('option');
                    option.value = mood;
                    option.textContent = mood;
                    moodFilter.appendChild(option);
                });
            }

            // Populate artist filter
            if (artistFilter) {
                const artists = [...new Set(songs.map(song => song.artist || song.originalArtist).filter(Boolean))].sort();
                artists.forEach(artist => {
                    const option = document.createElement('option');
                    option.value = artist;
                    option.textContent = artist;
                    artistFilter.appendChild(option);
                });
            }
        }

        // Apply all filters to songs
        function applyFilters(songsToFilter) {
            return songsToFilter.filter(song => {
                // Search filter
                if (currentFilters.search) {
                    const searchLower = currentFilters.search.toLowerCase();
                    const songText = `${song.title} ${song.artist || ''} ${song.originalArtist || ''}`.toLowerCase();
                    if (!songText.includes(searchLower)) return false;
                }

                // Key filter
                if (currentFilters.key && song.key !== currentFilters.key) return false;

                // Genre filter
                if (currentFilters.genre) {
                    const songGenres = typeof song.genre === 'string' ? 
                        song.genre.split(',').map(g => g.trim()) : [];
                    if (!songGenres.includes(currentFilters.genre)) return false;
                }

                // Mood filter
                if (currentFilters.mood) {
                    const songMoods = typeof song.mood === 'string' ? 
                        song.mood.split(',').map(m => m.trim()) : [];
                    if (!songMoods.includes(currentFilters.mood)) return false;
                }

                // Artist filter
                if (currentFilters.artist) {
                    const songArtist = song.artist || song.originalArtist || '';
                    if (songArtist !== currentFilters.artist) return false;
                }

                return true;
            });
        }

        // Separate songs into worship and praise based on the `category` property
        function categorizeSongs() {
            const worshipSongs = songs.filter(song => song.category === PW_CATEGORIES[1]);
            const praiseSongs = songs.filter(song => song.category === PW_CATEGORIES[0]);
            
            // Apply filters
            filteredWorshipSongs = applyFilters(worshipSongs);
            filteredPraiseSongs = applyFilters(praiseSongs);
            
            // Update counts
            if (worshipSongsCount) worshipSongsCount.textContent = filteredWorshipSongs.length;
            if (praiseSongsCount) praiseSongsCount.textContent = filteredPraiseSongs.length;
            
            return { worshipSongs: filteredWorshipSongs, praiseSongs: filteredPraiseSongs };
        }

        // Filter and display songs based on current filters
        function filterAndDisplaySongs() {
            categorizeSongs();
            renderSongLists();
            updateSelectAllStates();
        }

        // Render both worship and praise song lists
        function renderSongLists() {
            renderSongList(worshipSongList, filteredWorshipSongs, 'worship');
            renderSongList(praiseSongList, filteredPraiseSongs, 'praise');
        }

        // Render a specific song list with checkboxes
        function renderSongList(container, songList, category) {
            console.log(`renderSongList called for ${category} with ${songList.length} songs`);
            container.innerHTML = '';
            
            if (songList.length === 0) {
                container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No ${category} songs found</div>`;
                return;
            }

            songList.forEach(song => {
                const songItem = document.createElement('div');
                songItem.className = 'song-checkbox-item';
                
                const isSelected = selectedSongs.includes(song.id);
                songItem.innerHTML = `
                    <input type="checkbox" id="${prefix}_${category}_song_${song.id}" ${isSelected ? 'checked' : ''}>
                    <div class="song-checkbox-details">
                        <div class="song-checkbox-title">${song.title}</div>
                        <div class="song-checkbox-artist">${song.artist || song.originalArtist || 'Unknown Artist'} | ${song.key || 'No Key'}</div>
                    </div>
                `;

                const checkbox = songItem.querySelector('input[type="checkbox"]');
                
                // Handle checkbox change
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        if (!selectedSongs.includes(song.id)) {
                            selectedSongs.push(song.id);
                        }
                    } else {
                        selectedSongs = selectedSongs.filter(id => id !== song.id);
                    }
                    updateSelectedSongsDisplay();
                    updateSelectAllStates();
                });

                // Handle clicking on the item (not just checkbox)
                songItem.addEventListener('click', (e) => {
                    if (e.target.type !== 'checkbox') {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                });

                container.appendChild(songItem);
            });
        }

        // Update the selected songs display
        function updateSelectedSongsDisplay() {
            // Get already categorized songs without re-filtering
            const selectedWorshipSongs = selectedSongs.filter(id => {
                const song = songs.find(s => s.id === id);
                return song && song.category === 'Worship';
            });
            const selectedPraiseSongs = selectedSongs.filter(id => {
                const song = songs.find(s => s.id === id);
                return song && song.category === 'Praise';
            });
            
            selectedCountSpan.textContent = selectedSongs.length;
            selectedWorshipCountSpan.textContent = selectedWorshipSongs.length;
            selectedPraiseCountSpan.textContent = selectedPraiseSongs.length;
            
            // Get the separate tab containers
            const selectedWorshipSongsList = document.getElementById(`${prefix}SelectedWorshipSongsList`);
            const selectedPraiseSongsList = document.getElementById(`${prefix}SelectedPraiseSongsList`);
            
            // Clear both containers
            if (selectedWorshipSongsList) selectedWorshipSongsList.innerHTML = '';
            if (selectedPraiseSongsList) selectedPraiseSongsList.innerHTML = '';
            
            // Helper to render a resequencable list
            function renderResequencableList(songIds, container, category) {
                songIds.forEach((songId, idx) => {
                    const song = songs.find(s => s.id === songId);
                    if (song) {
                        const selectedItem = document.createElement('div');
                        selectedItem.className = 'selected-song-item';
                        selectedItem.draggable = true;
                        selectedItem.dataset.songId = songId;
                        selectedItem.innerHTML = `
                            <div class="selected-song-title">${song.title}</div>
                            <div class="selected-song-artist">${song.artist || song.originalArtist || 'Unknown Artist'}</div>
                            <div class="selected-song-actions">
                                <button class="move-up-btn" title="Move Up" ${idx === 0 ? 'disabled' : ''}>&uarr;</button>
                                <button class="move-down-btn" title="Move Down" ${idx === songIds.length - 1 ? 'disabled' : ''}>&darr;</button>
                            </div>
                        `;
                        // Arrow button logic
                        selectedItem.querySelector('.move-up-btn').onclick = function() {
                            const arr = category === 'Worship' ? selectedWorshipSongs : selectedPraiseSongs;
                            if (idx > 0) {
                                const temp = arr[idx - 1];
                                arr[idx - 1] = arr[idx];
                                arr[idx] = temp;
                                // Update main selectedSongs order
                                const mainIdx = selectedSongs.indexOf(arr[idx]);
                                const prevIdx = selectedSongs.indexOf(arr[idx - 1]);
                                if (mainIdx > -1 && prevIdx > -1) {
                                    selectedSongs.splice(mainIdx, 1);
                                    selectedSongs.splice(prevIdx, 0, arr[idx]);
                                }
                                updateSelectedSongsDisplay();
                            }
                        };
                        selectedItem.querySelector('.move-down-btn').onclick = function() {
                            const arr = category === 'Worship' ? selectedWorshipSongs : selectedPraiseSongs;
                            if (idx < arr.length - 1) {
                                const temp = arr[idx + 1];
                                arr[idx + 1] = arr[idx];
                                arr[idx] = temp;
                                // Update main selectedSongs order
                                const mainIdx = selectedSongs.indexOf(arr[idx]);
                                const nextIdx = selectedSongs.indexOf(arr[idx + 1]);
                                if (mainIdx > -1 && nextIdx > -1) {
                                    selectedSongs.splice(mainIdx, 1);
                                    selectedSongs.splice(nextIdx, 0, arr[idx]);
                                }
                                updateSelectedSongsDisplay();
                            }
                        };
                        container.appendChild(selectedItem);
                    }
                });
                // Drag-and-drop logic
                let dragSrcEl = null;
                container.addEventListener('dragstart', function(e) {
                    const item = e.target.closest('.selected-song-item');
                    if (!item) return;
                    dragSrcEl = item;
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.dataset.songId);
                });
                container.addEventListener('dragend', function(e) {
                    if (dragSrcEl) dragSrcEl.classList.remove('dragging');
                    dragSrcEl = null;
                });
                container.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const item = e.target.closest('.selected-song-item');
                    if (item && item !== dragSrcEl) {
                        item.classList.add('drag-over');
                    }
                });
                container.addEventListener('dragleave', function(e) {
                    const item = e.target.closest('.selected-song-item');
                    if (item) item.classList.remove('drag-over');
                });
                container.addEventListener('drop', function(e) {
                    e.preventDefault();
                    const item = e.target.closest('.selected-song-item');
                    if (!item || !dragSrcEl || item === dragSrcEl) return;
                    item.classList.remove('drag-over');
                    // Update order in category array
                    const draggedId = dragSrcEl.dataset.songId;
                    const targetId = item.dataset.songId;
                    const arr = category === 'Worship' ? selectedWorshipSongs : selectedPraiseSongs;
                    const oldIndex = arr.indexOf(draggedId);
                    const newIndex = arr.indexOf(targetId);
                    if (oldIndex > -1 && newIndex > -1) {
                        const [removed] = arr.splice(oldIndex, 1);
                        let insertAt = newIndex;
                        if (oldIndex < newIndex) {
                            insertAt = newIndex - 1;
                        }
                        arr.splice(insertAt, 0, removed);
                        // Update main selectedSongs order
                        const mainIdx = selectedSongs.indexOf(draggedId);
                        selectedSongs.splice(mainIdx, 1);
                        const targetMainIdx = selectedSongs.indexOf(targetId);
                        selectedSongs.splice(insertAt + (category === 'Worship' ? 0 : selectedWorshipSongs.length), 0, draggedId);
                        updateSelectedSongsDisplay();
                    }
                });
            }

            // Show selected worship songs in worship tab
            if (selectedWorshipSongs.length > 0 && selectedWorshipSongsList) {
                renderResequencableList(selectedWorshipSongs, selectedWorshipSongsList, 'Worship');
            }

            // Show selected praise songs in praise tab
            if (selectedPraiseSongs.length > 0 && selectedPraiseSongsList) {
                renderResequencableList(selectedPraiseSongs, selectedPraiseSongsList, 'Praise');
            }
        }

        // Update select all checkbox states for both categories
        function updateSelectAllStates() {
            // Get current filtered songs without re-rendering
            const worshipSongs = songs.filter(song => song.category === 'Worship');
            const praiseSongs = songs.filter(song => song.category === 'Praise');
            const currentFilteredWorshipSongs = applyFilters(worshipSongs);
            const currentFilteredPraiseSongs = applyFilters(praiseSongs);
            
            updateSelectAllState(selectAllWorshipCheckbox, currentFilteredWorshipSongs, 'worship');
            updateSelectAllState(selectAllPraiseCheckbox, currentFilteredPraiseSongs, 'praise');
        }

        // Update select all checkbox state for a specific category
        function updateSelectAllState(checkbox, filteredSongs, category) {
            const filteredSongIds = filteredSongs.map(song => song.id);
            const selectedFilteredSongs = selectedSongs.filter(id => filteredSongIds.includes(id));
            
            if (filteredSongs.length === 0) {
                checkbox.checked = false;
                checkbox.indeterminate = false;
            } else if (selectedFilteredSongs.length === filteredSongs.length) {
                checkbox.checked = true;
                checkbox.indeterminate = false;
            } else if (selectedFilteredSongs.length > 0) {
                checkbox.checked = false;
                checkbox.indeterminate = true;
            } else {
                checkbox.checked = false;
                checkbox.indeterminate = false;
            }
        }

        // Handle select all checkboxes
        function handleSelectAll(checkbox, filteredSongs) {
            const filteredSongIds = filteredSongs.map(song => song.id);
            
            if (checkbox.checked) {
                // Add all filtered songs to selection
                filteredSongIds.forEach(songId => {
                    if (!selectedSongs.includes(songId)) {
                        selectedSongs.push(songId);
                    }
                });
            } else {
                // Remove all filtered songs from selection
                selectedSongs = selectedSongs.filter(id => !filteredSongIds.includes(id));
            }
            
            updateSelectedSongsDisplay();
            renderSongLists();
            updateSelectAllStates();
        }

        // Event listeners for select all checkboxes
        selectAllWorshipCheckbox.addEventListener('change', (e) => {
            handleSelectAll(e.target, filteredWorshipSongs);
        });

        selectAllPraiseCheckbox.addEventListener('change', (e) => {
            handleSelectAll(e.target, filteredPraiseSongs);
        });

        // Handle search input
        searchInput.addEventListener('input', (e) => {
            filterAndDisplaySongs(e.target.value.trim());
        });

        // Store selected songs for form submission
        function getSelectedSongs() {
            return selectedSongs;
        }

        // Set selected songs (for editing existing setlists)
        function setSelectedSongs(songIds) {
            selectedSongs = songIds || [];
            updateSelectedSongsDisplay();
            filterAndDisplaySongs(searchInput.value.trim());
        }

        // Clear all selections
        function clearSelection() {
            selectedSongs = [];
            updateSelectedSongsDisplay();
            filterAndDisplaySongs();
            if (searchInput) searchInput.value = '';
            // Reset all filters
            currentFilters = { search: '', key: '', genre: '', mood: '', artist: '' };
            if (keyFilter) keyFilter.value = '';
            if (genreFilter) genreFilter.value = '';
            if (moodFilter) moodFilter.value = '';
            if (artistFilter) artistFilter.value = '';
        }

        // Tab functionality
        function initializeTabs() {
            // Main tab functionality for both My Setlist and Global Setlist modals
            if (prefix === 'my') {
                const selectedSongsMainTab = document.getElementById('selectedSongsMainTab');
                const addSongsMainTab = document.getElementById('addSongsMainTab');
                const selectedSongsContent = document.getElementById('selectedSongsContent');
                const addSongsContent = document.getElementById('addSongsContent');
                
                if (selectedSongsMainTab && addSongsMainTab && selectedSongsContent && addSongsContent) {
                    selectedSongsMainTab.addEventListener('click', () => {
                        selectedSongsMainTab.classList.add('active');
                        addSongsMainTab.classList.remove('active');
                        selectedSongsContent.classList.add('active');
                        addSongsContent.classList.remove('active');
                    });
                    
                    addSongsMainTab.addEventListener('click', () => {
                        addSongsMainTab.classList.add('active');
                        selectedSongsMainTab.classList.remove('active');
                        addSongsContent.classList.add('active');
                        selectedSongsContent.classList.remove('active');
                    });
                }
            } else if (prefix === 'global') {
                const globalSelectedSongsMainTab = document.getElementById('globalSelectedSongsMainTab');
                const globalAddSongsMainTab = document.getElementById('globalAddSongsMainTab');
                const globalSelectedSongsContent = document.getElementById('globalSelectedSongsContent');
                const globalAddSongsContent = document.getElementById('globalAddSongsContent');
                
                if (globalSelectedSongsMainTab && globalAddSongsMainTab && globalSelectedSongsContent && globalAddSongsContent) {
                    globalSelectedSongsMainTab.addEventListener('click', () => {
                        globalSelectedSongsMainTab.classList.add('active');
                        globalAddSongsMainTab.classList.remove('active');
                        globalSelectedSongsContent.classList.add('active');
                        globalAddSongsContent.classList.remove('active');
                    });
                    
                    globalAddSongsMainTab.addEventListener('click', () => {
                        globalAddSongsMainTab.classList.add('active');
                        globalSelectedSongsMainTab.classList.remove('active');
                        globalAddSongsContent.classList.add('active');
                        globalSelectedSongsContent.classList.remove('active');
                    });
                }
            }
            
            // Song selection tabs
            if (worshipSongsTab && praiseSongsTab && worshipSongsContent && praiseSongsContent) {
                worshipSongsTab.addEventListener('click', () => {
                    worshipSongsTab.classList.add('active');
                    praiseSongsTab.classList.remove('active');
                    worshipSongsContent.classList.add('active');
                    praiseSongsContent.classList.remove('active');
                });

                praiseSongsTab.addEventListener('click', () => {
                    praiseSongsTab.classList.add('active');
                    worshipSongsTab.classList.remove('active');
                    praiseSongsContent.classList.add('active');
                    worshipSongsContent.classList.remove('active');
                });
            }
            
            // Selected songs tabs
            const selectedWorshipTab = document.getElementById(`${prefix}SelectedWorshipTab`);
            const selectedPraiseTab = document.getElementById(`${prefix}SelectedPraiseTab`);
            const selectedWorshipContent = document.getElementById(`${prefix}SelectedWorshipContent`);
            const selectedPraiseContent = document.getElementById(`${prefix}SelectedPraiseContent`);
            
            if (selectedWorshipTab && selectedPraiseTab && selectedWorshipContent && selectedPraiseContent) {
                selectedWorshipTab.addEventListener('click', () => {
                    selectedWorshipTab.classList.add('active');
                    selectedPraiseTab.classList.remove('active');
                    selectedWorshipContent.classList.add('active');
                    selectedPraiseContent.classList.remove('active');
                });

                selectedPraiseTab.addEventListener('click', () => {
                    selectedPraiseTab.classList.add('active');
                    selectedWorshipTab.classList.remove('active');
                    selectedPraiseContent.classList.add('active');
                    selectedWorshipContent.classList.remove('active');
                });
            }
        }

        // Event listeners for filters
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentFilters.search = e.target.value.trim();
                filterAndDisplaySongs();
            });
        }

        if (keyFilter) {
            keyFilter.addEventListener('change', (e) => {
                currentFilters.key = e.target.value;
                filterAndDisplaySongs();
            });
        }

        if (genreFilter) {
            genreFilter.addEventListener('change', (e) => {
                currentFilters.genre = e.target.value;
                filterAndDisplaySongs();
            });
        }

        if (moodFilter) {
            moodFilter.addEventListener('change', (e) => {
                currentFilters.mood = e.target.value;
                filterAndDisplaySongs();
            });
        }

        if (artistFilter) {
            artistFilter.addEventListener('change', (e) => {
                currentFilters.artist = e.target.value;
                filterAndDisplaySongs();
            });
        }

        // Event listeners for select all checkboxes
        if (selectAllWorshipCheckbox) {
            selectAllWorshipCheckbox.addEventListener('change', (e) => {
                handleSelectAll(e.target, filteredWorshipSongs);
            });
        }

        if (selectAllPraiseCheckbox) {
            selectAllPraiseCheckbox.addEventListener('change', (e) => {
                handleSelectAll(e.target, filteredPraiseSongs);
            });
        }

        // Initialize everything
        initializeFilters();
        initializeTabs();
        filterAndDisplaySongs();

        // Return public methods
        return {
            getSelectedSongs,
            setSelectedSongs,
            clearSelection
        };
    }

    // Load global setlists
    async function loadGlobalSetlists(forceRefresh = false) {
        try {
            // Skip if already cached and not forcing refresh
            if (!forceRefresh && window.dataCache['global-setlists']) {
                globalSetlists = window.dataCache['global-setlists'];
                window.globalSetlists = globalSetlists; // Update window reference
                return globalSetlists;
            }
            
            const res = await cachedFetch(`${API_BASE_URL}/api/global-setlists`, forceRefresh);
            if (res.ok) {
                globalSetlists = await res.json();
                window.globalSetlists = globalSetlists; // Update window reference
                // Only update dropdown, do not re-render sidebar here
                populateSetlistDropdown(); // Update dropdown when global setlists load
                return globalSetlists;
            }
        } catch (err) {
            console.error('Failed to load global setlists:', err);
        }
        return [];
    }

    // Load my setlists
    async function loadMySetlists(forceRefresh = false) {
        if (!jwtToken) return [];
        try {
            // Skip if already cached and not forcing refresh
            if (!forceRefresh && window.dataCache['my-setlists']) {
                mySetlists = window.dataCache['my-setlists'];
                window.mySetlists = mySetlists; // Update window reference
                return mySetlists;
            }
            
            const res = await cachedFetch(`${API_BASE_URL}/api/my-setlists`, forceRefresh);
            if (res.ok) {
                mySetlists = await res.json();
                window.mySetlists = mySetlists; // Update window reference
                // Only update dropdown, do not re-render sidebar here
                populateSetlistDropdown(); // Update dropdown when my setlists load
                return mySetlists;
            }
        } catch (err) {
            console.error('Failed to load my setlists:', err);
        }
        return [];
    }

    // Function to refresh setlist data only (without updating button states)
    async function refreshSetlistDataOnly() {
        try {
            // Invalidate cache before reloading
            invalidateCache(['global-setlists', 'my-setlists']);
            
            // Reload both global and personal setlists
            await loadGlobalSetlists();
            if (jwtToken) {
                await loadMySetlists();
                await loadSmartSetlistsFromServer();
            } else {
                smartSetlists = [];
                window.smartSetlists = smartSetlists;
            }
            
            // Update dropdown with latest data
            populateSetlistDropdown();
            
            // Re-render the currently viewing setlist if one is open
            if (currentViewingSetlist) {
                // Update currentViewingSetlist with fresh data from the arrays
                if (currentSetlistType === 'global') {
                    const updated = findSetlistById(globalSetlists, currentViewingSetlist._id || currentViewingSetlist.id);
                    if (updated) currentViewingSetlist = updated;
                } else if (currentSetlistType === 'my') {
                    const updated = findSetlistById(mySetlists, currentViewingSetlist._id || currentViewingSetlist.id);
                    if (updated) currentViewingSetlist = updated;
                } else if (currentSetlistType === 'smart') {
                    const updated = findSetlistById(smartSetlists, currentViewingSetlist._id || currentViewingSetlist.id);
                    if (updated) currentViewingSetlist = updated;
                }
                renderSetlistSongs(); // Update modal view
                refreshSetlistDisplay(); // Update main setlist view
            }
            
            // Update all setlist button states to reflect current setlist membership
            updateAllSetlistButtonStates();
            
            // Refresh the setlist display if it's currently showing
            if (setlistSection && setlistSection.style.display === 'block') {
                // Setlist display is now handled by dropdown-based system
                // No need to refresh legacy setlists
            }
        } catch (error) {
            console.error('Error refreshing setlist data:', error);
        }
    }

    // Function to refresh all setlist data and update UI immediately
    async function refreshSetlistDataAndUI() {
        try {
            // Reload both global and personal setlists
            await loadGlobalSetlists();
            if (jwtToken) {
                await loadMySetlists();
                await loadSmartSetlistsFromServer();
            } else {
                smartSetlists = [];
                window.smartSetlists = smartSetlists;
            }
            
            // Update dropdown with latest data
            populateSetlistDropdown();
            
            // Update all setlist button states across the interface
            updateAllSetlistButtonStates();
            
            // Refresh the setlist display if it's currently showing
            if (setlistSection && setlistSection.style.display === 'block') {
                // Setlist display is now handled by dropdown-based system
                // No need to refresh legacy setlists
            }
        } catch (error) {
            console.error('Error refreshing setlist data:', error);
        }
    }

    function getComparableId(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'object' && value.toString) return value.toString();
        return String(value);
    }

    function findSetlistById(setlists, setlistId) {
        const targetId = getComparableId(setlistId);
        return setlists.find(s => getComparableId(s && (s._id || s.id)) === targetId);
    }

    function resolveSongFromSetlistItem(item) {
        if (typeof item === 'object' && item !== null) {
            if (item.lyrics || item.title) return item;
            const objectSongId = item.id;
            return songs.find(s => getComparableId(s.id) === getComparableId(objectSongId)) || null;
        }

        return songs.find(s => getComparableId(s.id) === getComparableId(item)) || null;
    }

    function canManageSmartSetlist(setlist) {
        if (!setlist || !currentUser) return false;
        const isOwner = getComparableId(setlist.createdBy) === getComparableId(currentUser.id)
            || getComparableId(setlist.createdByUsername) === getComparableId(currentUser.username);
        return isOwner || (isAdmin() && setlist.isAdminCreated);
    }

    function setMultiselectSelections(dropdownId, selectedValues) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown || !dropdown._selections) return;

        dropdown._selections.clear();
        (selectedValues || []).forEach(value => {
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                dropdown._selections.add(String(value));
            }
        });
    }

    function applySmartSetlistConditionsToForm(conditions = {}) {
        setMultiselectSelections('smartKeyDropdown', conditions.keys);
        setMultiselectSelections('smartTimeDropdown', conditions.times);
        setMultiselectSelections('smartTaalDropdown', conditions.taals);
        setMultiselectSelections('smartMoodDropdown', conditions.moods);
        setMultiselectSelections('smartGenreDropdown', conditions.genres);
        setMultiselectSelections('smartCategoryDropdown', conditions.categories);

        updateSelectedDisplay('smartConditionKey', 'smartSelectedKeys', document.getElementById('smartKeyDropdown')?._selections || new Set());
        updateSelectedDisplay('smartConditionTime', 'smartSelectedTimes', document.getElementById('smartTimeDropdown')?._selections || new Set());
        updateSelectedDisplay('smartConditionTaal', 'smartSelectedTaals', document.getElementById('smartTaalDropdown')?._selections || new Set());
        updateSelectedDisplay('smartConditionMood', 'smartSelectedMoods', document.getElementById('smartMoodDropdown')?._selections || new Set());
        updateSelectedDisplay('smartConditionGenre', 'smartSelectedGenres', document.getElementById('smartGenreDropdown')?._selections || new Set());
        updateSelectedDisplay('smartConditionCategory', 'smartSelectedCategories', document.getElementById('smartCategoryDropdown')?._selections || new Set());

        const tempoMinInput = document.getElementById('smartTempoMin');
        const tempoMaxInput = document.getElementById('smartTempoMax');
        if (tempoMinInput) tempoMinInput.value = conditions.tempoMin ?? '';
        if (tempoMaxInput) tempoMaxInput.value = conditions.tempoMax ?? '';
    }

    function provided(value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
    }

    function findSongById(songId) {
        const targetId = getComparableId(songId);
        if (!targetId) return null;
        return songs.find(song => (
            getComparableId(song && song.id) === targetId
        )) || null;
    }

    function cleanChordName(chordName) {
        const raw = String(chordName || '').replace(/[\[\](){}]/g, '').trim();
        return normalizeChordAccidentals(raw);
    }

    function getRootNote(chordName) {
        const cleaned = cleanChordName(chordName);
        const match = String(cleaned || '').match(/^([A-G](?:#|b)?)/i);
        if (!match) return '';
        return normalizeBaseNote(match[1].charAt(0).toUpperCase() + match[1].slice(1));
    }

    function extractDistinctChords(text) {
        const source = String(text || '');
        if (!source.trim()) return [];

        const regex = new RegExp(PW_CHORD_REGEX.source, 'gi');
        const matches = source.match(regex) || [];
        const distinct = new Set();

        matches.forEach(token => {
            const cleaned = cleanChordName(token);
            if (provided(cleaned)) distinct.add(cleaned);
        });

        return Array.from(distinct);
    }

    function insertTextAtCursor(textarea, text) {
        if (!textarea) return;
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const currentValue = textarea.value;
        const scrollTop = textarea.scrollTop;

        const beforeText = currentValue.substring(0, startPos);
        const afterText = currentValue.substring(endPos);

        let insertText = String(text || '');
        if (beforeText && !beforeText.endsWith('\n')) {
            insertText = `\n${insertText}`;
        }

        textarea.value = `${beforeText}${insertText}${afterText}`;

        const newPos = startPos + insertText.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
        textarea.scrollTop = scrollTop;
    }

    function setupSongStructureTags() {
        document.querySelectorAll('.structure-tag-btn').forEach(button => {
            if (button.dataset.boundStructureTag === 'true') return;
            button.dataset.boundStructureTag = 'true';

            button.addEventListener('click', event => {
                event.preventDefault();
                const tag = button.getAttribute('data-tag');
                const targetId = button.getAttribute('data-target');
                const textarea = document.getElementById(targetId);
                if (textarea && provided(tag)) {
                    insertTextAtCursor(textarea, tag);
                }
            });
        });
    }

    function createSongItem(song) {
        return createSetlistSongElement(song);
    }

    function populateMultiselect(dropdownId, inputId, selectedId, values) {
        setMultiselectSelections(dropdownId, values || []);
        const selections = document.getElementById(dropdownId)?._selections || new Set();
        updateSelectedDisplay(inputId, selectedId, selections);
    }

    function updateSmartSetlistForm(smartSetlist) {
        if (!smartSetlist) return;

        const setlistIdInput = document.getElementById('smartSetlistId');
        const nameInput = document.getElementById('smartSetlistName');
        const descriptionInput = document.getElementById('smartSetlistDescription');

        if (setlistIdInput) setlistIdInput.value = smartSetlist.id || smartSetlist._id || '';
        if (nameInput) nameInput.value = smartSetlist.name || '';
        if (descriptionInput) descriptionInput.value = smartSetlist.description || '';

        applySmartSetlistConditionsToForm(smartSetlist.conditions || {});
    }

    function scanSongsWithConditions(conditions = {}) {
        return getSongsMatchingSmartConditions(conditions);
    }

    async function renderSetlists() {
        await Promise.all([
            renderGlobalSetlists(),
            renderMySetlists(),
            renderSmartSetlists()
        ]);
    }

    function handleSetlistClick(setlistOrId, type = 'my') {
        const normalizedType = String(type || 'my').toLowerCase();
        const setlistId = typeof setlistOrId === 'object'
            ? getComparableId(setlistOrId._id || setlistOrId.id)
            : getComparableId(setlistOrId);

        if (!setlistId) return;

        if (normalizedType === 'global') {
            showGlobalSetlistInMainSection(setlistId);
            return;
        }

        if (normalizedType === 'smart') {
            showSmartSetlistInMainSection(setlistId);
            return;
        }

        const setlist = findSetlistById(mySetlists, setlistId);
        if (setlist) {
            openSetlistInMainSection(setlist, 'my');
        }
    }

    function restoreNormalView() {
        const showAll = document.getElementById('showAll');
        if (showAll) {
            showAll.click();
            return;
        }

        const praiseTab = document.getElementById('PraiseTab');
        if (praiseTab) praiseTab.click();
    }

    function toggleTheme() {
        isDarkMode = !isDarkMode;
        localStorage.setItem('pw_darkMode', isDarkMode ? 'true' : 'false');
        applyTheme(isDarkMode);

        const themeToggleBtn = document.getElementById('themeToggle');
        if (themeToggleBtn) {
            themeToggleBtn.setAttribute('aria-pressed', String(isDarkMode));
            themeToggleBtn.innerHTML = isDarkMode
                ? '<i class="fas fa-sun"></i><span>Light Mode</span>'
                : '<i class="fas fa-moon"></i><span>Dark Mode</span>';
        }
    }

    function createSmartSetlist() {
        updateSmartSetlistForm({ id: '', name: '', description: '', conditions: {} });

        const modalTitle = document.getElementById('smartSetlistModalTitle');
        const submitButton = document.getElementById('smartSetlistSubmit');
        const scanResults = document.getElementById('scanResults');
        const songResults = document.getElementById('smartSongsResults');

        if (modalTitle) modalTitle.textContent = 'Create Smart Setlist';
        if (submitButton) submitButton.textContent = 'Create Smart Setlist';
        if (scanResults) scanResults.style.display = 'none';
        if (songResults) songResults.style.display = 'none';

        if (typeof smartSetlistScanResults !== 'undefined') {
            smartSetlistScanResults = [];
        }

        if (typeof initializeSmartSetlistMultiselects === 'function') {
            initializeSmartSetlistMultiselects();
        }

        openModal('smartSetlistModal');
    }

    async function loadRhythmSets(forceRefresh = false) {
        if (!forceRefresh && Array.isArray(loadRhythmSets._cache)) {
            return loadRhythmSets._cache;
        }

        try {
            const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            loadRhythmSets._cache = Array.isArray(data) ? data : [];
            return loadRhythmSets._cache;
        } catch (error) {
            console.warn('Failed to load rhythm sets:', error);
            return [];
        }
    }

    function renderRhythmSetsTable(rows = [], targetId = 'rhythmSetsTableBody') {
        const tbody = document.getElementById(targetId);
        if (!tbody) return;

        tbody.innerHTML = '';
        (rows || []).forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.rhythmSetId || '';
            tr.innerHTML = `
                <td>${item.rhythmSetId || '-'}</td>
                <td>${item.rhythmFamily || '-'}</td>
                <td>${item.rhythmSetNo || '-'}</td>
                <td>${item.status || 'active'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function saveRhythmSetRow(row) {
        const rhythmSetId = getComparableId(row?.rhythmSetId || row?.id || row?.dataset?.id);
        if (!rhythmSetId) return;

        const body = {
            status: row?.status || row?.dataset?.status || 'active'
        };

        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Failed to save rhythm set (${response.status})`);
        }

        showRhythmSetsNotification(`Saved ${rhythmSetId}`, 'success');
    }

    async function recomputeRhythmSetRow(row) {
        const rhythmSetId = getComparableId(row?.rhythmSetId || row?.id || row?.dataset?.id);
        if (!rhythmSetId) return;

        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}/recompute`, {
            method: 'PUT'
        });

        if (!response.ok) {
            throw new Error(`Failed to recompute rhythm set (${response.status})`);
        }

        showRhythmSetsNotification(`Recomputed ${rhythmSetId}`, 'success');
    }

    function showRhythmSetsNotification(message, type = 'info') {
        showNotification(message, type);
    }

    async function hydrateRhythmFamilies() {
        const rhythmSets = await loadRhythmSets();
        const families = Array.from(new Set(
            [
                ...PW_TAALS,
                ...rhythmSets.map(item => String(item?.rhythmFamily || '').trim())
            ].filter(Boolean)
        )).sort((a, b) => a.localeCompare(b));

        populateRhythmFamilyDropdown('songRhythmFamily', families);
        populateRhythmFamilyDropdown('editSongRhythmFamily', families);
        populateRhythmCategoryDropdown('songRhythmCategory');
        populateRhythmCategoryDropdown('editSongRhythmCategory');
        updateRhythmSetIdPreview('songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview');
        updateRhythmSetIdPreview('editSongRhythmFamily', 'editSongRhythmSetNo', 'editSongRhythmSetIdPreview');

        return families;
    }

    async function createRhythmSetFromForm(formValues = null) {
        const payload = formValues || {
            rhythmFamily: document.getElementById('rhythmSetFamilyInput')?.value || '',
            rhythmSetNo: document.getElementById('rhythmSetNoInput')?.value || '',
            status: document.getElementById('rhythmSetStatusInput')?.value || 'active',
            notes: document.getElementById('rhythmSetNotesInput')?.value || ''
        };

        if (!provided(payload.rhythmFamily) || !provided(payload.rhythmSetNo)) {
            showRhythmSetsNotification('Rhythm family and set number are required.', 'error');
            return null;
        }

        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Failed to create rhythm set (${response.status})`);
        }

        showRhythmSetsNotification(`Created ${data.rhythmSetId || 'rhythm set'}`, 'success');
        return data;
    }

    const MOBILE_PANEL_STATE_KEY = 'pw_mobileLastOpenedPanel';

    function getMobilePanelState(sidebar, songsSection) {
        const isSidebarHidden = sidebar?.classList.contains('hidden');
        const isSongsHidden = songsSection?.classList.contains('hidden');

        if (!isSidebarHidden && isSongsHidden) return 'home';
        if (isSidebarHidden && !isSongsHidden) return 'songs';
        return null;
    }

    function persistMobilePanelState(sidebar, songsSection) {
        if (window.innerWidth > 768 || !sidebar || !songsSection) return;
        const state = getMobilePanelState(sidebar, songsSection);
        if (state) {
            localStorage.setItem(MOBILE_PANEL_STATE_KEY, state);
        }
    }

    function applySavedMobilePanelState(sidebar, songsSection) {
        if (window.innerWidth > 768 || !sidebar || !songsSection) return false;

        const savedState = localStorage.getItem(MOBILE_PANEL_STATE_KEY);
        switch (savedState) {
            case 'songs':
                sidebar.classList.add('hidden');
                songsSection.classList.remove('hidden');
                return true;
            case 'home':
                sidebar.classList.remove('hidden');
                songsSection.classList.add('hidden');
                return true;
            default:
                return false;
        }
    }

    function ensureMobilePanelStateObserver(sidebar, songsSection) {
        if (!sidebar || !songsSection || window.__pwMobilePanelStateObserverBound) return;

        const observer = new MutationObserver(() => {
            persistMobilePanelState(sidebar, songsSection);
        });

        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        observer.observe(songsSection, { attributes: true, attributeFilter: ['class'] });

        window.__pwMobilePanelStateObserverBound = true;
        window.__pwMobilePanelStateObserver = observer;

        persistMobilePanelState(sidebar, songsSection);
    }

    function setMobilePanelVisibility(panel) {
        const sidebar = document.querySelector('.sidebar');
        const songsSection = document.querySelector('.songs-section');
        const previewSection = document.querySelector('.preview-section');

        if (!sidebar || !songsSection || window.innerWidth > 768) return;

        const normalizedPanel = panel === 'songs' ? 'songs' : 'home';

        if (normalizedPanel === 'songs') {
            songsSection.classList.remove('hidden');
            sidebar.classList.add('hidden');
            if (previewSection) previewSection.classList.remove('full-width');
        } else {
            sidebar.classList.remove('hidden');
            songsSection.classList.add('hidden');
            if (previewSection) previewSection.classList.add('full-width');
        }

        persistMobilePanelState(sidebar, songsSection);
    }

    function openRememberedMobilePanel() {
        const rememberedPanel = localStorage.getItem(MOBILE_PANEL_STATE_KEY) === 'songs' ? 'songs' : 'home';
        setMobilePanelVisibility(rememberedPanel);
    }

    function openAlternateMobilePanel() {
        const sidebar = document.querySelector('.sidebar');
        const songsSection = document.querySelector('.songs-section');
        if (!sidebar || !songsSection || window.innerWidth > 768) return;

        const currentState = getMobilePanelState(sidebar, songsSection);
        if (currentState === 'songs') {
            setMobilePanelVisibility('home');
        } else {
            setMobilePanelVisibility('songs');
        }
    }

    function openSuggestedSongsDrawerFromSwipe() {
        const drawer = document.getElementById('suggestedSongsDrawer');
        if (!drawer || window.innerWidth > 768) return;

        if (!drawer.classList.contains('open')) {
            if (typeof toggleSuggestedSongsDrawer === 'function') {
                toggleSuggestedSongsDrawer();
            } else {
                document.getElementById('toggleSuggestedSongs')?.click();
            }
        }
    }

    function ensureMobilePanelSwipeGestures() {
        if (window.__pwMobilePanelSwipeBound) return;

        const EDGE_ZONE_PX = 32;
        const MIN_HORIZONTAL_SWIPE_PX = 72;
        const MAX_SWIPE_DURATION_MS = 500;

        let swipeStartX = 0;
        let swipeStartY = 0;
        let swipeStartTime = 0;

        // Edge swipes avoid conflicts with normal vertical scrolling in the song/lyrics area.
        document.addEventListener('touchstart', (e) => {
            if (window.innerWidth > 768 || e.touches.length !== 1) return;

            const target = e.target;
            if (target && target.closest && target.closest('input, textarea, select, .modal, .modal-content')) {
                return;
            }

            const touch = e.touches[0];
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
            swipeStartTime = Date.now();
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (window.innerWidth > 768 || e.changedTouches.length !== 1) return;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - swipeStartX;
            const dy = touch.clientY - swipeStartY;
            const dt = Date.now() - swipeStartTime;

            if (dt > MAX_SWIPE_DURATION_MS || Math.abs(dx) < MIN_HORIZONTAL_SWIPE_PX) return;
            if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;

            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const fromLeftEdge = swipeStartX <= EDGE_ZONE_PX;
            const fromRightEdge = viewportWidth > 0 && swipeStartX >= (viewportWidth - EDGE_ZONE_PX);

            if (fromLeftEdge && dx > 0) {
                const isUpperHalf = viewportHeight > 0 ? swipeStartY <= (viewportHeight / 2) : true;
                setMobilePanelVisibility(isUpperHalf ? 'home' : 'songs');
                return;
            }

            if (fromRightEdge && dx < 0) {
                openSuggestedSongsDrawerFromSwipe();
            }
        }, { passive: true });

        window.__pwMobilePanelSwipeBound = true;
    }

    function createMobileNavButtons() {
        const sidebar = document.querySelector('.sidebar');
        const songsSection = document.querySelector('.songs-section');
        if (!sidebar || !songsSection) return null;

        const isMobile = window.innerWidth <= 768;

        // Remove any stale containers, then rebuild once.
        document.querySelectorAll('.mobile-nav-container').forEach((node) => node.remove());

        const mobileNavContainer = document.createElement('div');
        mobileNavContainer.id = 'mobileNavButtons';
        mobileNavContainer.className = 'mobile-nav-container';
        const bothPanelsButton = isMobile ? '' : `
            <button class="mobile-nav-btn mobile-nav-both" title="Toggle Both Panels" aria-label="Toggle Both Panels">
                <i class="fas fa-eye"></i>
            </button>`;
        mobileNavContainer.innerHTML = `
            <button class="mobile-nav-btn mobile-nav-sidebar" title="Toggle Sidebar" aria-label="Toggle Sidebar">
                <i class="fas fa-home"></i>
            </button>
            <button class="mobile-nav-btn mobile-nav-songs" title="Toggle Songs" aria-label="Toggle Songs">
                <i class="fas fa-list"></i>
            </button>
            ${bothPanelsButton}
        `;
        document.body.appendChild(mobileNavContainer);

        const syncBothIcon = () => {
            const bothIcon = mobileNavContainer.querySelector('.mobile-nav-both i');
            if (!bothIcon) return;
            const areBothHidden = sidebar.classList.contains('hidden') && songsSection.classList.contains('hidden');
            bothIcon.className = areBothHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
        };

        const sidebarBtn = mobileNavContainer.querySelector('.mobile-nav-sidebar');
        const songsBtn = mobileNavContainer.querySelector('.mobile-nav-songs');
        const bothBtn = mobileNavContainer.querySelector('.mobile-nav-both');

        if (sidebarBtn) {
            sidebarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('hidden');
                if (!sidebar.classList.contains('hidden')) {
                    songsSection.classList.add('hidden');
                }
                syncBothIcon();
                updatePositions();
            });
        }

        if (songsBtn) {
            songsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                songsSection.classList.toggle('hidden');
                if (!songsSection.classList.contains('hidden')) {
                    sidebar.classList.add('hidden');
                }
                syncBothIcon();
                updatePositions();
            });
        }

        if (bothBtn) {
            bothBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const areBothHidden = sidebar.classList.contains('hidden') && songsSection.classList.contains('hidden');
                sidebar.classList.toggle('hidden', !areBothHidden);
                songsSection.classList.toggle('hidden', !areBothHidden);
                syncBothIcon();
                updatePositions();
            });
        }

        syncBothIcon();
        return mobileNavContainer;
    }

    function handleSwipeGesture(direction) {
        const normalized = String(direction || '').toLowerCase();

        if (normalized === 'back' && currentHistoryPosition > 0) {
            history.back();
            return;
        }

        if (normalized === 'home' || normalized === 'up') {
            setMobilePanelVisibility('home');
            return;
        }

        if (normalized === 'setlist' || normalized === 'down') {
            setMobilePanelVisibility('songs');
        }
    }

    function addMobileTouchNavigation() {
        const nav = createMobileNavButtons();
        applyToggleButtonsVisibility(normalizeToggleButtonsVisibility(localStorage.getItem('toggleButtonsVisibility') || 'hide'));
        ensureMobilePanelSwipeGestures();
        return nav;
    }

    function initializeFloatingStopButton() {
        const floatingStopBtn = document.getElementById('floatingStopBtn');
        if (!floatingStopBtn || floatingStopBtn.dataset.boundClick === 'true') return;

        floatingStopBtn.dataset.boundClick = 'true';
        floatingStopBtn.addEventListener('click', stopCurrentlyPlayingSong);
    }

    function showFloatingStopButton(songId, songTitle) {
        currentlyPlayingSongs.add(songId);
        currentPlayingSongId = songId;

        const floatingStopBtn = document.getElementById('floatingStopBtn');
        const floatingStopText = document.getElementById('floatingStopText');
        if (!floatingStopBtn) return;

        if (floatingStopText) {
            const title = String(songTitle || 'Song');
            floatingStopText.textContent = title.length > 12 ? `${title.slice(0, 12)}...` : title;
        }

        floatingStopBtn.style.display = 'flex';
    }

    function hideFloatingStopButton(songId) {
        currentlyPlayingSongs.delete(songId);

        if (currentPlayingSongId === songId) {
            currentPlayingSongId = currentlyPlayingSongs.size
                ? Array.from(currentlyPlayingSongs)[0]
                : null;
        }

        if (!currentPlayingSongId) {
            const floatingStopBtn = document.getElementById('floatingStopBtn');
            if (floatingStopBtn) floatingStopBtn.style.display = 'none';
        }
    }

    function stopCurrentlyPlayingSong() {
        const loopPlayer = window.getLoopPlayerInstance && window.getLoopPlayerInstance();
        if (loopPlayer) {
            if (loopPlayer.isPlaying && typeof loopPlayer.pause === 'function') {
                loopPlayer.pause();
            }
            if (typeof loopPlayer.stopAllMelodicPads === 'function') {
                loopPlayer.stopAllMelodicPads();
            }
        }

        if (currentPlayingSongId) {
            hideFloatingStopButton(currentPlayingSongId);
        }
    }

    window.showFloatingStopButton = showFloatingStopButton;
    window.hideFloatingStopButton = hideFloatingStopButton;
    window.stopCurrentlyPlayingSong = stopCurrentlyPlayingSong;
    initializeFloatingStopButton();

    // Function to update all setlist button states based on current setlist data
    function updateAllSetlistButtonStates() {
        const setlistDropdown = document.getElementById('setlistDropdown');
        if (!setlistDropdown || !setlistDropdown.value) {
            return;
        }

        const selectedSetlistId = setlistDropdown.value;
        let currentSetlist = null;

        if (selectedSetlistId.startsWith('global_')) {
            const actualId = selectedSetlistId.replace('global_', '');
            currentSetlist = findSetlistById(globalSetlists, actualId);
        } else if (selectedSetlistId.startsWith('my_')) {
            const actualId = selectedSetlistId.replace('my_', '');
            currentSetlist = findSetlistById(mySetlists, actualId);
        } else if (selectedSetlistId.startsWith('smart_')) {
            const actualId = selectedSetlistId.replace('smart_', '');
            currentSetlist = findSetlistById(smartSetlists, actualId);
        }

        if (!currentSetlist || !Array.isArray(currentSetlist.songs)) {
            return;
        }

        songs.forEach(song => {
            const isInSetlist = currentSetlist.songs.some(setlistSong => {
                const resolvedSong = resolveSongFromSetlistItem(setlistSong);
                return resolvedSong && getComparableId(resolvedSong.id) === getComparableId(song.id);
            });

            updateSetlistButtonState(song.id, isInSetlist);
        });
    }

    // Show setlist description in sidebar
    function showSetlistDescription(setlist, type) {
        const containerMap = {
            global: 'globalSetlistDescriptionContainer',
            my: 'mySetlistDescriptionContainer',
            smart: 'smartSetlistDescriptionContainer'
        };
        const textMap = {
            global: 'globalSetlistDescriptionText',
            my: 'mySetlistDescriptionText',
            smart: 'smartSetlistDescriptionText'
        };

        const container = document.getElementById(containerMap[type]);
        const textElement = document.getElementById(textMap[type]);

        if (container && textElement && setlist.description) {
            textElement.textContent = setlist.description;
            container.style.display = 'block';
        }
    }

    // Hide setlist description in sidebar
    function hideSetlistDescription(type) {
        const containerMap = {
            global: 'globalSetlistDescriptionContainer',
            my: 'mySetlistDescriptionContainer',
            smart: 'smartSetlistDescriptionContainer'
        };
        const container = document.getElementById(containerMap[type]);

        if (container) {
            container.style.display = 'none';
        }
    }

    // Show/hide description for dropdown setlist
    function showDropdownSetlistDescription(setlistId) {
        const container = document.getElementById('setlistDescriptionContainer');
        const textElement = document.getElementById('setlistDescriptionText');

        if (!container || !textElement) return;

        if (!setlistId) {
            container.style.display = 'none';
            return;
        }

        let setlist = null;
        if (setlistId.startsWith('global_')) {
            const actualId = setlistId.replace('global_', '');
            setlist = findSetlistById(globalSetlists, actualId);
        } else if (setlistId.startsWith('my_')) {
            const actualId = setlistId.replace('my_', '');
            setlist = findSetlistById(mySetlists, actualId);
        } else if (setlistId.startsWith('smart_')) {
            const actualId = setlistId.replace('smart_', '');
            setlist = findSetlistById(smartSetlists, actualId);
        }

        if (setlist && setlist.description) {
            textElement.textContent = setlist.description;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    // Render global setlists in sidebar
    async function renderGlobalSetlists() {
        const content = document.getElementById('globalSetlistContent');
        if (!content) return;

        // Fetch latest global setlists from backend
        await loadGlobalSetlists(true);

        content.innerHTML = '';
        if (globalSetlists.length === 0) {
            const testMsg = document.createElement('li');
            testMsg.innerHTML = '<div style="padding: 10px; color: #888; font-style: italic;">No global setlists available</div>';
            content.appendChild(testMsg);
        }
        globalSetlists.forEach(setlist => {
            const canManageGlobal = !!currentUser?.isAdmin;
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="setlist-item" data-setlist-id="${setlist._id}" data-type="global">
                    <span>${setlist.name}</span>
                    <div class="setlist-actions">
                        ${canManageGlobal ? `
                            <button class="setlist-action-btn edit-setlist" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="setlist-action-btn delete-setlist" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
            content.appendChild(li);
        });

        // Add event listeners
        content.querySelectorAll('.setlist-item').forEach(item => {
            const setlistId = item.dataset.setlistId;
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.setlist-actions button')) {
                    showGlobalSetlistInMainSection(setlistId);
                    const setlist = findSetlistById(globalSetlists, setlistId);
                    if (setlist) {
                        hideSetlistDescription('my');
                        hideSetlistDescription('smart');
                        showSetlistDescription(setlist, 'global');
                    }
                }
            });
            item.querySelector('.edit-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                editGlobalSetlist(setlistId);
            });
            item.querySelector('.delete-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteGlobalSetlist(setlistId);
            });
            item.querySelector('.resequence-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                window.setlistResequenceMode = true;
                showGlobalSetlistInMainSection(setlistId);
            });
        });
    }

    // Render my setlists in sidebar
    async function renderMySetlists() {
        const content = document.getElementById('mySetlistContent');
        if (!content) return;

        // Fetch latest my setlists from backend
        await loadMySetlists(true);

        content.innerHTML = '';
        if (mySetlists.length === 0) {
            const testMsg = document.createElement('li');
            if (jwtToken) {
                testMsg.innerHTML = '<div style="padding: 10px; color: #888; font-style: italic;">No personal setlists created</div>';
            } else {
                testMsg.innerHTML = '<div style="padding: 10px; color: #888; font-style: italic;">Login to create your setlists</div>';
            }
            content.appendChild(testMsg);
        }
        mySetlists.forEach(setlist => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="setlist-item" data-setlist-id="${setlist._id}" data-type="my">
                    <span>${setlist.name}</span>
                    <div class="setlist-actions">
                        <button class="setlist-action-btn edit-setlist" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="setlist-action-btn delete-setlist" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            content.appendChild(li);
        });

        // Add event listeners
        content.querySelectorAll('.setlist-item').forEach(item => {
            const setlistId = item.dataset.setlistId;
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.setlist-actions button')) {
                    showMySetlistInMainSection(setlistId);
                    const setlist = findSetlistById(mySetlists, setlistId);
                    if (setlist) {
                        hideSetlistDescription('global');
                        hideSetlistDescription('smart');
                        showSetlistDescription(setlist, 'my');
                    }
                }
            });
            item.querySelector('.edit-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                editMySetlist(setlistId);
            });
            item.querySelector('.delete-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteMySetlist(setlistId);
            });
            item.querySelector('.resequence-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                window.setlistResequenceMode = true;
                showMySetlistInMainSection(setlistId);
            });
        });
    }

    // Display global setlist in main songs section
    
    // Load Smart Setlists from server
    async function loadSmartSetlistsFromServer() {
        console.log('📋 Loading Smart Setlists from server...');
        
        if (!currentUser) {
            console.log('📋 No user logged in, clearing Smart Setlists');
            smartSetlists = [];
            window.smartSetlists = smartSetlists;
            populateSetlistDropdown();
            return;
        }
        
        try {
            const token = localStorage.getItem('pw_jwtToken');
            if (!token) {
                console.log('📋 No JWT token found, clearing Smart Setlists');
                smartSetlists = [];
                window.smartSetlists = smartSetlists;
                populateSetlistDropdown();
                return;
            }
            
            console.log('📋 Making request to /api/smart-setlists...');
            const response = await fetch(`${API_BASE_URL}/api/smart-setlists`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                smartSetlists = await response.json();
                window.smartSetlists = smartSetlists;
                populateSetlistDropdown();
                console.log(`📋 Loaded ${smartSetlists.length} Smart Setlists from server:`, smartSetlists.map(s => s.name));
            } else {
                console.warn('📋 Failed to load smart setlists from server - HTTP', response.status);
                smartSetlists = [];
                window.smartSetlists = smartSetlists;
                populateSetlistDropdown();
            }
        } catch (error) {
            console.error('📋 Error loading smart setlists from server:', error);
            smartSetlists = [];
            window.smartSetlists = smartSetlists;
            populateSetlistDropdown();
        }
    }
    
    // Render Smart Setlists in sidebar
    async function renderSmartSetlists() {
        const content = document.getElementById('smartSetlistContent');
        if (!content) return;

        // Load smart setlists from server
        await loadSmartSetlistsFromServer();

        content.innerHTML = '';
        if (smartSetlists.length === 0) {
            const testMsg = document.createElement('li');
            if (jwtToken) {
                testMsg.innerHTML = '<div style="padding: 10px; color: #888; font-style: italic;">No smart setlists created</div>';
            } else {
                testMsg.innerHTML = '<div style="padding: 10px; color: #888; font-style: italic;">Login to create smart setlists</div>';
            }
            content.appendChild(testMsg);
        }
        smartSetlists.forEach(setlist => {
            const setlistId = getComparableId(setlist._id || setlist.id);
            const canManage = canManageSmartSetlist(setlist);
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="setlist-item" data-setlist-id="${setlistId}" data-type="smart">
                    <span>${setlist.name}</span>
                    <div class="setlist-actions">
                        ${canManage ? `
                            <button class="setlist-action-btn refresh-setlist" title="Update Setlist">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="setlist-action-btn edit-setlist" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="setlist-action-btn delete-setlist" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
            content.appendChild(li);
        });

        // Add event listeners
        content.querySelectorAll('.setlist-item').forEach(item => {
            const setlistId = item.dataset.setlistId;
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.setlist-actions button')) {
                    showSmartSetlistInMainSection(setlistId);
                    const setlist = findSetlistById(smartSetlists, setlistId);
                    if (setlist) {
                        hideSetlistDescription('global');
                        hideSetlistDescription('my');
                        showSetlistDescription(setlist, 'smart');
                    }
                }
            });
            item.querySelector('.refresh-setlist')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await updateSmartSetlist(setlistId);
            });
            item.querySelector('.edit-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                editSmartSetlist(setlistId);
            });
            item.querySelector('.delete-setlist')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteSmartSetlist(setlistId);
            });
        });
    }
    
    function normalizeSetlistSongCategory(category) {
        const value = String(category || '').trim().toLowerCase();
        if (value === 'praise' || value === 'old') return 'Praise';
        if (value === 'worship' || value === 'new') return 'Worship';
        return '';
    }

    function getSetlistSongItems(setlist) {
        if (!setlist) return [];

        if (Array.isArray(setlist.songs)) {
            return setlist.songs;
        }

        if (setlist.songs && typeof setlist.songs === 'object') {
            const legacyBuckets = [
                setlist.songs.praise,
                setlist.songs.Praise,
                setlist.songs.praiseSongs,
                setlist.songs.PraiseSongs,
                setlist.songs.worship,
                setlist.songs.Worship,
                setlist.songs.worshipSongs,
                setlist.songs.WorshipSongs
            ].filter(Array.isArray);

            if (legacyBuckets.length > 0) {
                return legacyBuckets.flat();
            }
        }

        if (Array.isArray(setlist.songIds)) {
            return setlist.songIds;
        }

        return [];
    }

    function openSetlistInMainSection(setlist, type) {
        if (!setlist) return;

        const typePrefix = type === 'global' ? 'global' : (type === 'my' ? 'my' : 'smart');
        const context = type === 'global' ? 'global-setlist' : (type === 'my' ? 'user-setlist' : 'smart-setlist');
        const resolvedSetlistId = getComparableId(setlist._id || setlist.id);

        currentViewingSetlist = setlist;
        currentSetlistType = type;

        const setlistHeader = document.getElementById('setlistViewHeader');
        if (setlistHeader) {
            setlistHeader.textContent = setlist.name;
        }

        configureSetlistSectionActions(type, setlist);
        clearSetlistSelections();

        const PraiseContent = document.getElementById('PraiseContent');
        const WorshipContent = document.getElementById('WorshipContent');
        const setlistSection = document.getElementById('setlistSection');
        const deleteSection = document.getElementById('deleteSection');
        const favoritesSection = document.getElementById('favoritesSection');

        if (PraiseContent) {
            PraiseContent.classList.remove('active');
            PraiseContent.style.display = 'none';
        }
        if (WorshipContent) {
            WorshipContent.classList.remove('active');
            WorshipContent.style.display = 'none';
        }
        if (setlistSection) setlistSection.style.display = 'block';
        if (deleteSection) deleteSection.style.display = 'none';
        if (favoritesSection) favoritesSection.style.display = 'none';

        document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));

        if (!window.updatingFromFolderNav) {
            window.updatingFromFolderNav = true;
            selectDropdownOption(`${typePrefix}_${resolvedSetlistId}`, setlist.name);
            showDropdownSetlistDescription(`${typePrefix}_${resolvedSetlistId}`);
            setTimeout(() => {
                window.updatingFromFolderNav = false;
            }, 100);
        }

        const setlistSongItems = getSetlistSongItems(setlist);
        const setlistSongs = setlistSongItems.map(resolveSongFromSetlistItem).filter(Boolean);

        const praiseSongs = [];
        const worshipSongs = [];

        setlistSongs.forEach(song => {
            const normalizedCategory = normalizeSetlistSongCategory(song.category || song.Category);
            if (normalizedCategory === 'Worship') {
                worshipSongs.push(song);
            } else {
                // Default unknown categories to Praise tab so songs are still visible.
                praiseSongs.push(song);
            }
        });

        const PraiseSetlistTab = document.getElementById('PraiseSetlistTab');
        const WorshipSetlistTab = document.getElementById('WorshipSetlistTab');
        const PraiseSetlistSongs = document.getElementById('PraiseSetlistSongs');
        const WorshipSetlistSongs = document.getElementById('WorshipSetlistSongs');

        if (PraiseSetlistTab) PraiseSetlistTab.textContent = `Praise (${praiseSongs.length})`;
        if (WorshipSetlistTab) WorshipSetlistTab.textContent = `Worship (${worshipSongs.length})`;

        if (PraiseSetlistSongs && WorshipSetlistSongs) {
            displaySetlistSongs(praiseSongs, PraiseSetlistSongs, context);
            displaySetlistSongs(worshipSongs, WorshipSetlistSongs, context);
        }

        if (PraiseSetlistTab && WorshipSetlistTab && PraiseSetlistSongs && WorshipSetlistSongs) {
            if (praiseSongs.length > 0 || worshipSongs.length === 0) {
                PraiseSetlistTab.classList.add('active');
                WorshipSetlistTab.classList.remove('active');
                PraiseSetlistSongs.style.display = 'block';
                WorshipSetlistSongs.style.display = 'none';
            } else {
                PraiseSetlistTab.classList.remove('active');
                WorshipSetlistTab.classList.add('active');
                PraiseSetlistSongs.style.display = 'none';
                WorshipSetlistSongs.style.display = 'block';
            }

            PraiseSetlistTab.onclick = () => {
                PraiseSetlistTab.classList.add('active');
                WorshipSetlistTab.classList.remove('active');
                PraiseSetlistSongs.style.display = 'block';
                WorshipSetlistSongs.style.display = 'none';
            };

            WorshipSetlistTab.onclick = () => {
                WorshipSetlistTab.classList.add('active');
                PraiseSetlistTab.classList.remove('active');
                WorshipSetlistSongs.style.display = 'block';
                PraiseSetlistSongs.style.display = 'none';
            };
        }

        if (window.innerWidth <= 768) {
            const songsSection = document.querySelector('.songs-section');
            const sidebar = document.querySelector('.sidebar');
            const previewSection = document.querySelector('.preview-section');
            if (songsSection) songsSection.classList.remove('hidden');
            if (sidebar) sidebar.classList.add('hidden');
            if (previewSection) previewSection.classList.remove('full-width');
        }

        if (type === 'smart') {
            showNotification(`Showing smart setlist: ${setlist.name} (${setlistSongs.length} songs)`);
        }
    }

    // Show Smart Setlist in main section
    function showSmartSetlistInMainSection(setlistId) {
        const smartSetlist = findSetlistById(smartSetlists, setlistId);
        if (!smartSetlist) {
            console.error('Smart setlist not found:', setlistId);
            showNotification('Smart setlist not found', 'error');
            return;
        }

        openSetlistInMainSection(smartSetlist, 'smart');
    }

    function goBackToSidebar(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        currentViewingSetlist = null;
        currentSetlistType = null;
        window.setlistResequenceMode = false;

        const setlistSection = document.getElementById('setlistSection');
        const setlistActions = document.getElementById('setlistSectionActions');
        const setlistHeader = document.getElementById('setlistViewHeader');
        const PraiseContent = document.getElementById('PraiseContent');
        const WorshipContent = document.getElementById('WorshipContent');

        if (setlistSection) setlistSection.style.display = 'none';
        if (setlistActions) {
            setlistActions.style.display = 'none';
            setlistActions.innerHTML = '';
        }
        if (setlistHeader) setlistHeader.textContent = 'Setlist View';
        if (PraiseContent) {
            PraiseContent.classList.add('active');
            PraiseContent.style.display = 'block';
        }
        if (WorshipContent) {
            WorshipContent.classList.remove('active');
            WorshipContent.style.display = 'none';
        }

        const setlistDropdown = document.getElementById('setlistDropdown');
        if (setlistDropdown) {
            selectDropdownOption('', 'Select a Setlist');
        }
        hideSetlistDescription('global');
        hideSetlistDescription('my');
        hideSetlistDescription('smart');

        if (typeof renderSongs === 'function') {
            const filters = getCurrentFilterValues();
            renderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
        }

        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const songsSection = document.querySelector('.songs-section');
            const previewSection = document.querySelector('.preview-section');
            if (sidebar) sidebar.classList.remove('hidden');
            if (songsSection) songsSection.classList.add('hidden');
            if (previewSection) previewSection.classList.add('full-width');
        }
    }

    window.goBackToSidebar = goBackToSidebar;
    window.restoreNormalView = goBackToSidebar;
    
    // Initialize Smart Setlist multiselects
    function initializeSmartSetlistMultiselects() {
        setupMultiselect('smartConditionKey', 'smartKeyDropdown', 'smartSelectedKeys');
        setupMultiselect('smartConditionTime', 'smartTimeDropdown', 'smartSelectedTimes');
        setupMultiselect('smartConditionTaal', 'smartTaalDropdown', 'smartSelectedTaals');
        setupMultiselect('smartConditionMood', 'smartMoodDropdown', 'smartSelectedMoods');
        setupMultiselect('smartConditionGenre', 'smartGenreDropdown', 'smartSelectedGenres');
        setupMultiselect('smartConditionCategory', 'smartCategoryDropdown', 'smartSelectedCategories');
    }
    
    // Generic multiselect setup function
    function setupMultiselect(inputId, dropdownId, selectedId) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        const selected = document.getElementById(selectedId);
        
        if (!input || !dropdown || !selected) {
            return;
        }

        if (input._multiselectInitialized) {
            return;
        }
        
        const selections = new Set();
        
        // Toggle dropdown on input click
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.multiselect-dropdown.show').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
            });
            dropdown.classList.toggle('show');
        });
        
        // Handle option selection
        dropdown.addEventListener('click', (e) => {
            if (e.target.classList.contains('multiselect-option')) {
                const value = e.target.getAttribute('data-value');
                
                if (value === '') {
                    selections.clear();
                } else {
                    if (selections.has(value)) {
                        selections.delete(value);
                    } else {
                        selections.add(value);
                        selections.delete('');
                    }
                }
                updateSelectedDisplay(inputId, selectedId, selections);
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${dropdownId}`)) {
                dropdown.classList.remove('show');
            }
        });
        
        dropdown._selections = selections;
        input._multiselectInitialized = true;
    }
    
    // Update selected display for multiselect
    function updateSelectedDisplay(inputId, selectedId, selections) {
        const input = document.getElementById(inputId);
        const selected = document.getElementById(selectedId);
        
        if (selections.size === 0) {
            input.value = '';
            selected.innerHTML = '';
        } else {
            const values = Array.from(selections);
            input.value = values.join(', ');
            
            selected.innerHTML = values.map(value => `
                <div class="selected-item">
                    ${value}
                    <span class="remove-selected" data-value="${value}" data-input="${inputId}">×</span>
                </div>
            `).join('');
            
            // Add remove listeners
            selected.querySelectorAll('.remove-selected').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const valueToRemove = e.target.getAttribute('data-value');
                    selections.delete(valueToRemove);
                    updateSelectedDisplay(inputId, selectedId, selections);
                });
            });
        }
    }
    
    // Get Smart Setlist conditions
    function getSmartSetlistConditions() {
        const getSelections = (dropdownId) => {
            const dropdown = document.getElementById(dropdownId);
            return dropdown && dropdown._selections ? Array.from(dropdown._selections).filter(v => v !== '') : [];
        };
        
        return {
            keys: getSelections('smartKeyDropdown'),
            tempoMin: parseInt(document.getElementById('smartTempoMin').value) || null,
            tempoMax: parseInt(document.getElementById('smartTempoMax').value) || null,
            times: getSelections('smartTimeDropdown'),
            taals: getSelections('smartTaalDropdown'),
            moods: getSelections('smartMoodDropdown'),
            genres: getSelections('smartGenreDropdown'),
            categories: getSelections('smartCategoryDropdown')
        };
    }
    
    // Scan songs based on smart setlist conditions
    async function scanSongsForSmartSetlist() {
        const conditions = getSmartSetlistConditions();
        console.log('Scanning songs with conditions:', conditions);
        const matchingSongs = getSongsMatchingSmartConditions(conditions);
        
        console.log(`Found ${matchingSongs.length} songs matching conditions`);
        displayScanResults(matchingSongs);
        return matchingSongs;
    }
    
    // Display scan results in tabs
    function displayScanResults(songs) {
        const resultsDiv = document.getElementById('smartSongsResults');
        const praiseSongsDiv = document.getElementById('smartPraiseSongs');
        const worshipSongsDiv = document.getElementById('smartWorshipSongs');
        
        if (!resultsDiv || !praiseSongsDiv || !worshipSongsDiv) {
            console.log('Scan results elements not ready yet');
            return;
        }
        
        if (!songs || !Array.isArray(songs)) {
            songs = [];
        }
        
        const praiseSongs = songs.filter(song => song && song.category === 'Praise');
        const worshipSongs = songs.filter(song => song && song.category === 'Worship');
        
        // Update counts
        const praiseCountEl = document.getElementById('smartPraiseCount');
        const worshipCountEl = document.getElementById('smartWorshipCount');
        const totalCountEl = document.getElementById('scanResultCount');
        
        if (praiseCountEl) praiseCountEl.textContent = praiseSongs.length;
        if (worshipCountEl) worshipCountEl.textContent = worshipSongs.length;
        if (totalCountEl) totalCountEl.textContent = songs.length;
        
        // Render song lists
        praiseSongsDiv.innerHTML = renderSmartSongsList(praiseSongs);
        worshipSongsDiv.innerHTML = renderSmartSongsList(worshipSongs);
        
        // Add click event listeners
        document.querySelectorAll('.smart-scan-song').forEach(songDiv => {
            songDiv.addEventListener('click', () => {
                const songId = parseInt(songDiv.dataset.songId);
                const song = songs.find(s => s.id === songId);
                if (song) showPreview(song, false, 'smart-scan');
            });
        });
        
        // Show results
        resultsDiv.style.display = 'block';
        document.getElementById('scanResults').style.display = 'block';
        
        // Setup tab switching
        setupSmartSongTabs();
        
        // Store scan results globally
        window.smartSetlistScanResults = songs;
    }
    
    // Render songs list for smart setlist
    function renderSmartSongsList(songs) {
        if (!songs || songs.length === 0) {
            return '<div class="no-songs">No songs found</div>';
        }
        
        return songs.map(song => {
            return `
                <div class="song-item smart-scan-song" data-song-id="${song.id}">
                    <div class="song-title">${song.title}</div>
                    <div class="song-metadata">
                        <span class="song-number">#${song.songNumber || song.id}</span>
                        ${song.key ? `<span class="song-key">${song.key}</span>` : ''}
                        ${song.mood ? `<span class="song-mood">${song.mood}</span>` : ''}
                        ${song.tempo ? `<span class="song-tempo">${song.tempo} BPM</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Setup smart song tabs
    function setupSmartSongTabs() {
        const praiseTab = document.getElementById('smartPraiseTab');
        const worshipTab = document.getElementById('smartWorshipTab');
        const praiseSongs = document.getElementById('smartPraiseSongs');
        const worshipSongs = document.getElementById('smartWorshipSongs');
        
        if (!praiseTab || !worshipTab || !praiseSongs || !worshipSongs) return;
        
        praiseTab.addEventListener('click', () => {
            praiseTab.classList.add('active');
            worshipTab.classList.remove('active');
            praiseSongs.classList.add('active');
            worshipSongs.classList.remove('active');
        });
        
        worshipTab.addEventListener('click', () => {
            worshipTab.classList.add('active');
            praiseTab.classList.remove('active');
            worshipSongs.classList.add('active');
            praiseSongs.classList.remove('active');
        });
    }
    
    // Create Smart Setlist with scanned songs
    async function createSmartSetlistWithSongs(formData, existingSetlistId = null) {
        try {
            const token = localStorage.getItem('pw_jwtToken');
            if (!token) {
                showNotification('Please login to create smart setlists');
                return null;
            }

            const isUpdate = !!existingSetlistId;
            const endpoint = isUpdate
                ? `${API_BASE_URL}/api/smart-setlists/${existingSetlistId}`
                : `${API_BASE_URL}/api/smart-setlists`;

            const response = await fetch(endpoint, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const payload = await response.json().catch(() => ({}));
            if (response.ok) {
                showNotification(`Smart setlist "${formData.name}" ${isUpdate ? 'updated' : 'created'} successfully!`);
                await renderSmartSetlists();
                document.getElementById('smartSetlistModal').style.display = 'none';
                document.getElementById('smartSetlistForm').reset();
                const submitBtn = document.getElementById('smartSetlistSubmit');
                if (submitBtn) submitBtn.textContent = 'Create Smart Setlist';
                const modalTitle = document.getElementById('smartSetlistModalTitle');
                if (modalTitle) modalTitle.textContent = 'Create Smart Setlist';
                window.smartSetlistScanResults = [];
                currentModal = null;
                return payload;
            }

            showNotification(`Error ${isUpdate ? 'updating' : 'creating'} smart setlist: ${payload.error || payload.message || response.statusText}`, 'error');
            return null;
        } catch (error) {
            console.error('Error saving smart setlist:', error);
            showNotification('Error saving smart setlist. Check console for details.', 'error');
            return null;
        }
    }

    function getSongsMatchingSmartConditions(conditions = {}) {
        return songs.filter(song => {
            if ((conditions.keys || []).length > 0 && !(conditions.keys || []).includes(song.key)) {
                return false;
            }

            if (conditions.tempoMin && song.tempo < conditions.tempoMin) {
                return false;
            }
            if (conditions.tempoMax && song.tempo > conditions.tempoMax) {
                return false;
            }

            if ((conditions.times || []).length > 0 && !(conditions.times || []).includes(song.time || song.timeSignature)) {
                return false;
            }

            if ((conditions.taals || []).length > 0 && !(conditions.taals || []).includes(song.taal)) {
                return false;
            }

            if ((conditions.moods || []).length > 0) {
                const songMoods = String(song.mood || '').split(',').map(m => m.trim()).filter(Boolean);
                if (!songMoods.some(m => (conditions.moods || []).includes(m))) {
                    return false;
                }
            }

            if ((conditions.genres || []).length > 0) {
                const songGenres = song.genres || (song.genre ? [song.genre] : []);
                if (!songGenres.some(g => (conditions.genres || []).includes(g))) {
                    return false;
                }
            }

            if ((conditions.categories || []).length > 0 && !(conditions.categories || []).includes(song.category)) {
                return false;
            }

            return true;
        });
    }

    async function updateSmartSetlist(setlistId) {
        const smartSetlist = findSetlistById(smartSetlists, setlistId);
        if (!smartSetlist) {
            showNotification('Smart setlist not found', 'error');
            return;
        }

        if (!canManageSmartSetlist(smartSetlist)) {
            showNotification('You do not have permission to update this smart setlist', 'error');
            return;
        }

        showNotification('Updating smart setlist...');
        const refreshedSongs = getSongsMatchingSmartConditions(smartSetlist.conditions || {});
        const updated = await createSmartSetlistWithSongs({
            name: smartSetlist.name,
            description: smartSetlist.description || '',
            conditions: smartSetlist.conditions || {},
            songs: refreshedSongs
        }, getComparableId(smartSetlist._id || smartSetlist.id));

        if (updated && currentSetlistType === 'smart' && getComparableId(currentViewingSetlist?._id || currentViewingSetlist?.id) === getComparableId(smartSetlist._id || smartSetlist.id)) {
            showSmartSetlistInMainSection(getComparableId(updated._id || updated.id || smartSetlist._id || smartSetlist.id));
        }
    }

    function editSmartSetlist(setlistId) {
        const smartSetlist = findSetlistById(smartSetlists, setlistId);
        if (!smartSetlist) {
            showNotification('Smart setlist not found', 'error');
            return;
        }

        if (!canManageSmartSetlist(smartSetlist)) {
            showNotification('You do not have permission to edit this smart setlist', 'error');
            return;
        }

        const modal = document.getElementById('smartSetlistModal');
        const form = document.getElementById('smartSetlistForm');
        const nameInput = document.getElementById('smartSetlistName');
        const descriptionInput = document.getElementById('smartSetlistDescription');
        const idInput = document.getElementById('smartSetlistId');
        const modalTitle = document.getElementById('smartSetlistModalTitle');
        const submitBtn = document.getElementById('smartSetlistSubmit');

        if (!modal || !form || !nameInput || !descriptionInput || !idInput) return;

        form.reset();
        initializeSmartSetlistMultiselects();
        nameInput.value = smartSetlist.name || '';
        descriptionInput.value = smartSetlist.description || '';
        idInput.value = getComparableId(smartSetlist._id || smartSetlist.id);
        if (modalTitle) modalTitle.textContent = 'Edit Smart Setlist';
        if (submitBtn) submitBtn.textContent = 'Update Smart Setlist';

        applySmartSetlistConditionsToForm(smartSetlist.conditions || {});

        const existingSongs = (smartSetlist.songs || []).map(resolveSongFromSetlistItem).filter(Boolean);
        displayScanResults(existingSongs);
        window.smartSetlistScanResults = existingSongs;

        modal.style.display = 'flex';
        currentModal = modal;
    }

    async function deleteSmartSetlist(setlistId) {
        const smartSetlist = findSetlistById(smartSetlists, setlistId);
        if (!smartSetlist) {
            showNotification('Smart setlist not found', 'error');
            return;
        }

        if (!canManageSmartSetlist(smartSetlist)) {
            showNotification('You do not have permission to delete this smart setlist', 'error');
            return;
        }

        if (!confirm(`Delete smart setlist "${smartSetlist.name}"?`)) {
            return;
        }

        try {
            const response = await authFetch(`${API_BASE_URL}/api/smart-setlists/${getComparableId(smartSetlist._id || smartSetlist.id)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                showNotification(payload.error || 'Failed to delete smart setlist', 'error');
                return;
            }

            smartSetlists = smartSetlists.filter(s => getComparableId(s._id || s.id) !== getComparableId(smartSetlist._id || smartSetlist.id));
            window.smartSetlists = smartSetlists;
            await renderSmartSetlists();

            if (currentSetlistType === 'smart' && getComparableId(currentViewingSetlist?._id || currentViewingSetlist?.id) === getComparableId(smartSetlist._id || smartSetlist.id)) {
                goBackToSidebar();
            }

            showNotification('Smart setlist deleted', 'success');
        } catch (error) {
            console.error('Failed to delete smart setlist:', error);
            showNotification('Failed to delete smart setlist', 'error');
        }
    }

    function configureSetlistSectionActions(type, setlist) {
        const actions = document.getElementById('setlistSectionActions');
        if (!actions) return;

        const canEditGlobal = !!currentUser?.isAdmin;
        const canManageSmart = canManageSmartSetlist(setlist);
        const showEditDelete = type === 'my' || (type === 'global' && canEditGlobal) || (type === 'smart' && canManageSmart);
        const showResequence = type === 'my' || (type === 'global' && canEditGlobal);
        const showManualAdd = type === 'my' || (type === 'global' && canEditGlobal);

        actions.style.display = 'flex';
        actions.innerHTML = `
            <button class="btn btn-secondary setlist-action-btn back-to-menu-btn" title="Back to Menu" aria-label="Back to Menu">
                <i class="fas fa-arrow-left"></i>
            </button>
            ${showEditDelete ? `
                <button class="btn btn-secondary setlist-action-btn setlist-edit-btn" title="Edit Setlist" aria-label="Edit Setlist">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger setlist-action-btn setlist-delete-btn" title="Delete Setlist" aria-label="Delete Setlist">
                    <i class="fas fa-trash"></i>
                </button>
            ` : ''}
            ${type === 'smart' && canManageSmart ? `
                <button class="btn btn-primary setlist-action-btn smart-refresh-btn-header" title="Update Smart Setlist" aria-label="Update Smart Setlist">
                    <i class="fas fa-sync"></i>
                </button>
            ` : ''}
            ${showResequence ? `
                <button class="btn btn-primary setlist-action-btn setlist-resequence-btn" title="Resequence Setlist" aria-label="Resequence Setlist">
                    <i class="fas fa-random"></i>
                </button>
            ` : ''}
            ${showManualAdd ? `
                <button class="btn btn-primary setlist-action-btn setlist-add-manual-btn" title="Add Song" aria-label="Add Song to Setlist">
                    <i class="fas fa-plus"></i>
                </button>
            ` : ''}
        `;

        actions.querySelector('.back-to-menu-btn')?.addEventListener('click', (e) => goBackToSidebar(e));

        actions.querySelector('.setlist-edit-btn')?.addEventListener('click', () => {
            const currentId = getComparableId(setlist._id || setlist.id);
            if (type === 'global') editGlobalSetlist(currentId);
            if (type === 'my') editMySetlist(currentId);
            if (type === 'smart') editSmartSetlist(currentId);
        });

        actions.querySelector('.setlist-delete-btn')?.addEventListener('click', () => {
            const currentId = getComparableId(setlist._id || setlist.id);
            if (type === 'global') deleteGlobalSetlist(currentId);
            if (type === 'my') deleteMySetlist(currentId);
            if (type === 'smart') deleteSmartSetlist(currentId);
        });

        actions.querySelector('.smart-refresh-btn-header')?.addEventListener('click', () => {
            updateSmartSetlist(getComparableId(setlist._id || setlist.id));
        });

        actions.querySelector('.setlist-add-manual-btn')?.addEventListener('click', () => {
            openAddManualSongModal();
        });

        actions.querySelector('.setlist-resequence-btn')?.addEventListener('click', async () => {
            if (!currentViewingSetlist || currentSetlistType === 'smart') return;

            const button = actions.querySelector('.setlist-resequence-btn');
            if (!window.setlistResequenceMode) {
                window.setlistResequenceMode = true;
                if (button) button.innerHTML = '<i class="fas fa-save"></i> Save Sequence';
                refreshSetlistDisplay();
                return;
            }

            const endpoint = currentSetlistType === 'global' ? '/api/global-setlists' : '/api/my-setlists';
            const currentSetlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
            await authFetch(`${API_BASE_URL}${endpoint}/${currentSetlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: currentViewingSetlist.name,
                    description: currentViewingSetlist.description,
                    songs: currentViewingSetlist.songs
                })
            });

            window.setlistResequenceMode = false;
            if (button) button.innerHTML = '<i class="fas fa-random"></i>';
            refreshSetlistDisplay();
            showNotification('Setlist sequence saved!', 'success');
        });
    }

    // Display global setlist in main songs section
    function showGlobalSetlistInMainSection(setlistId) {
        const setlist = findSetlistById(globalSetlists, setlistId);
        if (!setlist) return;
        openSetlistInMainSection(setlist, 'global');
    }

    // Display my setlist in main songs section
    function showMySetlistInMainSection(setlistId) {
        const setlist = findSetlistById(mySetlists, setlistId);
        if (!setlist) return;
        openSetlistInMainSection(setlist, 'my');
    }

    // Function to display setlist songs in the new simplified UI
    function displaySetlistSongs(songs, container, context = null) {
        container.innerHTML = '';
        const resolvedContext = context || (currentSetlistType === 'global' ? 'global-setlist' : 'user-setlist');

        // Resequence mode: enable drag-and-drop for all songs, hide remove buttons, show save button after drag
        const isResequenceMode = !!window.setlistResequenceMode;

        if (!songs || songs.length === 0) {
            container.innerHTML = '<p class="setlist-empty-message">This setlist is empty.</p>';
            return;
        }

        // Remove Save New Sequence button; resequenceSetlistSectionBtn will handle saving

        const ul = document.createElement('ul');
        ul.className = 'setlist-songs-list';

        songs.forEach((song, index) => {
            if (!song) return;
            let transposeLevel = 0;

            if (resolvedContext === 'global-setlist' && currentViewingSetlist && currentViewingSetlist.songTransposes && song.id in currentViewingSetlist.songTransposes) {
                transposeLevel = currentViewingSetlist.songTransposes[song.id] || 0;
            } else {
                try {
                    const localTranspose = JSON.parse(localStorage.getItem('pw_transposeCache') || '{}');
                    if (song.id && typeof localTranspose[song.id] === 'number') {
                        transposeLevel = localTranspose[song.id];
                    } else if (window.userData && window.userData.transpose && song.id in window.userData.transpose && typeof window.userData.transpose[song.id] === 'number') {
                        transposeLevel = window.userData.transpose[song.id];
                    }
                } catch (e) {
                    transposeLevel = 0;
                }
            }

            const displayKey = song.key ? (transposeLevel !== 0 ? transposeChord(song.key, transposeLevel) : song.key) : '';
            const li = document.createElement('li');
            li.className = 'setlist-song-item';
            li.dataset.songId = song.id;
            // Enable drag-and-drop for all songs in resequence mode
            if (isResequenceMode) {
                li.setAttribute('draggable', 'true');
            } else if (currentSetlistType === 'my' || (currentSetlistType === 'global' && currentUser && currentUser.isAdmin)) {
                li.setAttribute('draggable', 'true');
            }
            li.innerHTML = `
                <div class="setlist-song-info">
                    <span class="setlist-song-number">${index + 1}.</span>
                    <div class="setlist-song-details">
                        <div class="setlist-song-title">${song.title}</div>
                        <div class="setlist-song-meta">
                            ${displayKey || '-'} | ${song.tempo || '-'} | ${song.time || song.timeSignature || '-'} | ${song.taal || '-'}
                        </div>
                    </div>
                </div>
                <div class="setlist-song-actions">
                    ${(currentSetlistType === 'my' || (currentSetlistType === 'global' && currentUser && currentUser.isAdmin)) ? `<button class="remove-from-setlist-btn" data-song-id="${song.id}" title="Remove from setlist" type="button">×</button>` : ''}
                </div>`;

            // Add click handler for song info (not the remove button)
            const songInfo = li.querySelector('.setlist-song-info');
            songInfo.addEventListener('click', () => {
                clearSetlistSelections();
                li.classList.add('selected');
                showPreview(song, false, resolvedContext);
            });

            // Add click handler for remove button (if it exists)
            const removeBtn = li.querySelector('.remove-from-setlist-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentSetlistType === 'smart') {
                        showNotification('Smart setlist songs are updated via Smart conditions', 'error');
                        return;
                    }
                    if (currentSetlistType === 'global' && (!currentUser || !currentUser.isAdmin)) {
                        showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
                        return;
                    }
                    await removeSongFromSetlist(song.id);
                });
            }
            ul.appendChild(li);
        });

        // Drag-and-drop logic for resequence mode
        if (isResequenceMode) {
            let dragSrcEl = null;
            ul.addEventListener('dragstart', function(e) {
                const li = e.target.closest('.setlist-song-item');
                if (!li) return;
                dragSrcEl = li;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', li.dataset.songId);
                li.classList.add('dragging');
            });
            ul.addEventListener('dragend', function(e) {
                if (dragSrcEl) dragSrcEl.classList.remove('dragging');
                dragSrcEl = null;
            });
            ul.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const li = e.target.closest('.setlist-song-item');
                if (li && li !== dragSrcEl) {
                    li.classList.add('drag-over');
                }
            });
            ul.addEventListener('dragleave', function(e) {
                const li = e.target.closest('.setlist-song-item');
                if (li) li.classList.remove('drag-over');
            });
            ul.addEventListener('drop', function(e) {
                e.preventDefault();
                const li = e.target.closest('.setlist-song-item');
                if (!li || !dragSrcEl || li === dragSrcEl) return;
                li.classList.remove('drag-over');
                // Update setlist order in memory only
                const draggedId = dragSrcEl.dataset.songId;
                const targetId = li.dataset.songId;
                const oldIndex = currentViewingSetlist.songs.findIndex(id => id == draggedId);
                const newIndex = currentViewingSetlist.songs.findIndex(id => id == targetId);
                if (oldIndex > -1 && newIndex > -1) {
                    // Remove dragged item
                    const [removed] = currentViewingSetlist.songs.splice(oldIndex, 1);
                    // Insert at correct index
                    let insertAt = newIndex;
                    if (oldIndex < newIndex) {
                        insertAt = newIndex - 1;
                    }
                    currentViewingSetlist.songs.splice(insertAt, 0, removed);
                }
                // Refresh the setlist display to show new order
                refreshSetlistDisplay();
            });
        }

        container.appendChild(ul);
    }

    // Function to remove a song from the current viewing setlist
    async function removeSongFromSetlist(songId) {
        if (!currentViewingSetlist) {
            return;
        }

        if (currentSetlistType === 'smart') {
            showNotification('Smart setlist songs are updated via Smart conditions', 'error');
            return;
        }

        if (currentSetlistType === 'global' && (!currentUser || !currentUser.isAdmin)) {
            showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
            return;
        }

        // Update setlist on server
        const endpoint = currentSetlistType === 'global' ? '/api/global-setlists' : (currentSetlistType === 'my' ? '/api/my-setlists' : null);
        if (!endpoint) {
            showNotification('Unsupported setlist type for remove action', 'error');
            return;
        }

        const currentSetlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
        if (!currentSetlistId) {
            showNotification('Unable to update setlist: invalid setlist id', 'error');
            return;
        }

        const targetSongId = getComparableId(songId);

        // Find the song index - handle both regular song IDs and manual song objects
        const songIndex = currentViewingSetlist.songs.findIndex(item => {
            if (typeof item === 'object' && item !== null) {
                return getComparableId(item.id) === targetSongId;
            }
            return getComparableId(item) === targetSongId;
        });
        
        if (songIndex === -1) {
            return;
        }

        // Remove song from setlist
        const [removedItem] = currentViewingSetlist.songs.splice(songIndex, 1);
        
        authFetch(`${API_BASE_URL}${endpoint}/${currentSetlistId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: currentViewingSetlist.name,
                description: currentViewingSetlist.description,
                songs: currentViewingSetlist.songs
            })
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('FORBIDDEN_ACCESS');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(async (updatedSetlist) => {
            // Check if the response is actually a valid setlist or just a success message
            if (updatedSetlist.error) {
                throw new Error(updatedSetlist.error);
            }
            
            // If we get a success message instead of the setlist data, keep the current setlist
            // and just refresh the display since the server-side update succeeded
            if (updatedSetlist.message && !updatedSetlist._id) {
                // The songs were already removed from currentViewingSetlist locally
                // so we just need to update the local arrays
                const setlists = currentSetlistType === 'global' ? globalSetlists : mySetlists;
                const setlistIndex = setlists.findIndex(s => getComparableId(s && (s._id || s.id)) === currentSetlistId);
                if (setlistIndex !== -1) {
                    setlists[setlistIndex] = currentViewingSetlist; // Update with our local version
                }
            } else {
                // If we get actual setlist data, use it
                const setlists = currentSetlistType === 'global' ? globalSetlists : mySetlists;
                const setlistIndex = setlists.findIndex(s => getComparableId(s && (s._id || s.id)) === currentSetlistId);
                if (setlistIndex !== -1) {
                    setlists[setlistIndex] = updatedSetlist;
                    currentViewingSetlist = updatedSetlist;
                }
            }

            // Refresh the setlist display
            refreshSetlistDisplay();

            // Also update modal view if it's open
            if (document.getElementById('setlistViewModal').style.display !== 'none') {
                renderSetlistSongs();
            }

            // Update all song buttons to reflect the new setlist state
            updateAllSetlistButtonStates();
            
            // Refresh setlist data from backend to ensure synchronization
            await refreshSetlistDataOnly();
            
            // Show success notification
            showNotification('Song removed from setlist', 'success');
        })
        .catch(error => {
            console.error('Error removing song from setlist:', error);
            
            // Handle specific error types
            if (error.message === 'FORBIDDEN_ACCESS') {
                showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
            } else {
                showNotification('❌ Failed to remove song from setlist', 'error');
            }
            
            // Revert the change on error - but only if currentViewingSetlist is still valid
            if (currentViewingSetlist && currentViewingSetlist.songs && Array.isArray(currentViewingSetlist.songs)) {
                currentViewingSetlist.songs.splice(songIndex, 0, removedItem);
                refreshSetlistDisplay();
            } else {
                // Instead of reloading, try to refresh setlist data
                refreshSetlistDataOnly().catch(console.error);
            }
        });
    }

    // Function to refresh the current setlist display
    function refreshSetlistDisplay() {
        if (!currentViewingSetlist || !currentSetlistType) {
            return;
        }

        // Call the appropriate display function based on setlist type
        const setlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
        
        if (currentSetlistType === 'global') {
            showGlobalSetlistInMainSection(setlistId);
        } else if (currentSetlistType === 'my') {
            showMySetlistInMainSection(setlistId);
        } else if (currentSetlistType === 'smart') {
            showSmartSetlistInMainSection(setlistId);
        }
    }

    // Function to clear all song selections in setlist
    function clearSetlistSelections() {
        const selectedItems = document.querySelectorAll('.setlist-song-item.selected');
        selectedItems.forEach(item => {
            item.classList.remove('selected');
        });
    }

    // Open setlist view modal
    function openSetlistView(setlistId, type) {
        const setlists = type === 'global' ? globalSetlists : mySetlists;
        const setlist = findSetlistById(setlists, setlistId);
        if (!setlist) return;

        currentViewingSetlist = setlist;
        currentSetlistType = type;

        const modal = document.getElementById('setlistViewModal');
        const title = document.getElementById('setlistViewTitle');
        const description = document.getElementById('setlistViewDescription');
        const editBtn = document.getElementById('editSetlistBtn');
        const deleteBtn = document.getElementById('deleteSetlistBtn');

        title.textContent = setlist.name;
        description.textContent = setlist.description || 'No description';

        // Show/hide edit and delete buttons based on permissions
        const canEdit = (type === 'global' && currentUser?.isAdmin) || (type === 'my');
        editBtn.style.display = canEdit ? 'block' : 'none';
        deleteBtn.style.display = canEdit ? 'block' : 'none';

        renderSetlistSongs();
        modal.style.display = 'flex';

        // Add submit event listener to update setlist and UI immediately
        if (form) {
            form.onsubmit = async function(e) {
                e.preventDefault();
                const setlistId = document.getElementById('globalSetlistId').value;
                const name = document.getElementById('globalSetlistName').value.trim();
                const description = document.getElementById('globalSetlistDescription').value.trim();
                const selectedSongs = modal.songSelector.getSelectedSongs();
                const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${setlistId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description, songs: selectedSongs })
                });
                if (res.ok) {
                    // Update local setlist
                    const updatedSetlist = await res.json();
                    const idx = globalSetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === getComparableId(setlistId));
                    if (idx !== -1) globalSetlists[idx] = updatedSetlist;
                    // Update dropdown and sidebar immediately
                    renderGlobalSetlists();
                    populateSetlistDropdown();
                    showNotification('Setlist updated!', 'success');
                    modal.style.display = 'none';
                } else {
                    showNotification('Failed to update setlist', 'error');
                }
            };
        }
    }

    // Render setlist songs in the view modal
    function renderSetlistSongs() {
        if (!currentViewingSetlist) return;

        const praiseSongs = document.getElementById('setlistPraiseSongs');
        const worshipSongs = document.getElementById('setlistWorshipSongs');

        const praiseSetlistSongs = currentViewingSetlist.songs.filter(songId => {
            const song = songs.find(s => s.id === songId);
            return song && song.category === 'Praise';
        });

        const worshipSetlistSongs = currentViewingSetlist.songs.filter(songId => {
            const song = songs.find(s => s.id === songId);
            return song && song.category === 'Worship';
        });

        praiseSongs.innerHTML = '';
        worshipSongs.innerHTML = '';

        // Render Praise songs
        praiseSetlistSongs.forEach(songId => {
            const song = songs.find(s => s.id === songId);
            if (song) {
                const songEl = createSetlistSongElement(song);
                praiseSongs.appendChild(songEl);
            }
        });

        // Render Worship songs
        worshipSetlistSongs.forEach(songId => {
            const song = songs.find(s => s.id === songId);
            if (song) {
                const songEl = createSetlistSongElement(song);
                worshipSongs.appendChild(songEl);
            }
        });

        if (praiseSetlistSongs.length === 0) {
            praiseSongs.innerHTML = '<p class="no-songs">No Praise songs in this setlist</p>';
        }

        if (worshipSetlistSongs.length === 0) {
            worshipSongs.innerHTML = '<p class="no-songs">No Worship songs in this setlist</p>';
        }
    }

    // Create setlist song element
    function createSetlistSongElement(song) {
        const div = document.createElement('div');
        div.className = 'setlist-song-item';
        const removableSongId = getComparableId(song.id);
        div.innerHTML = `
            <div class="setlist-song-info">
                <div class="setlist-song-title">${song.title}</div>
                <div class="setlist-song-meta">${song.key} | ${song.artistDetails || 'Unknown'}</div>
            </div>
            ${(currentSetlistType !== 'smart' && (currentSetlistType !== 'global' || (currentUser && currentUser.isAdmin))) ? 
                `<button class="remove-from-setlist" onclick='removeFromSetlist(${JSON.stringify(removableSongId)})' title="Remove from setlist">
                    <i class="fas fa-times"></i>
                </button>` : 
                ''
            }
        `;

        div.addEventListener('click', (e) => {
            if (!e.target.closest('.remove-from-setlist')) {
                selectSong(song.id);
                document.getElementById('setlistViewModal').style.display = 'none';
            }
        });

        return div;
    }

    // Remove song from setlist
    window.removeFromSetlist = async function(songId) {
        if (!currentViewingSetlist || !currentSetlistType) {
            return;
        }

        if (currentSetlistType === 'smart') {
            showNotification('Smart setlist songs are updated via Smart conditions', 'error');
            return;
        }

        // Check if user has permission to modify global setlists
        if (currentSetlistType === 'global' && (!currentUser || !currentUser.isAdmin)) {
            showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
            return;
        }

        const targetSongId = getComparableId(songId);
        const updatedSongs = currentViewingSetlist.songs.filter(item => {
            if (typeof item === 'object' && item !== null) {
                return getComparableId(item.id) !== targetSongId;
            }
            return getComparableId(item) !== targetSongId;
        });
        
        try {
            const endpoint = currentSetlistType === 'global' ? 'global-setlists' : 'my-setlists';
            const currentSetlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
            
            const res = await authFetch(`${API_BASE_URL}/api/${endpoint}/${currentSetlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (!res.ok) {
                if (res.status === 403) {
                    showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
                    return;
                }
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            currentViewingSetlist.songs = updatedSongs;
            
            // Update the setlist in the appropriate array
            if (currentSetlistType === 'global') {
                const index = globalSetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === currentSetlistId);
                if (index !== -1) globalSetlists[index] = currentViewingSetlist;
            } else {
                const index = mySetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === currentSetlistId);
                if (index !== -1) mySetlists[index] = currentViewingSetlist;
            }

            renderSetlistSongs();
            refreshSetlistDisplay(); // Also update the main setlist display
            
            // Refresh setlist data from backend to ensure synchronization
            await refreshSetlistDataOnly();
            
            showNotification('Song removed from setlist');
        } catch (err) {
            console.error('Failed to remove song from setlist:', err);
            showNotification('❌ Failed to remove song from setlist', 'error');
        }
    }

    // Create new global setlist (admin only)
    function createGlobalSetlist() {
        if (!currentUser?.isAdmin) {
            showNotification('Only admins can create global setlists');
            return;
        }

        const modal = document.getElementById('globalSetlistModal');
        const title = document.getElementById('globalSetlistModalTitle');
        const form = document.getElementById('globalSetlistForm');
        const submitBtn = document.getElementById('globalSetlistSubmit');

        title.textContent = 'Create Global Setlist';
        submitBtn.textContent = 'Create Setlist';
        if (form) form.reset();
        document.getElementById('globalSetlistId').value = '';

        // Initialize song selection with checkboxes
        modal.songSelector = initializeSetlistSongSelection('global');

        modal.style.display = 'flex';

        // Add submit event listener to refresh setlists after creation
        if (form) {
            form.onsubmit = async function(e) {
                // ...existing code for setlist creation...
                setTimeout(async () => {
                    await refreshSetlistDataAndUI();
                    renderGlobalSetlists();
                    renderMySetlists();
                    // Select the newly added setlist in dropdown
                    const dropdown = document.getElementById('setlistDropdown');
                    const nameInput = document.getElementById('globalSetlistName'); // or 'mySetlistName'
                    const newSetlist = globalSetlists.find(s => s.name === nameInput.value); // or mySetlists
                    if (dropdown && newSetlist) {
                        dropdown.value = `global_${newSetlist._id}`; // or `my_${newSetlist._id}`
                        dropdown.dispatchEvent(new Event('change'));
                    }
                }, 100);
            };
        }

    }

    // Edit global setlist
    function editGlobalSetlist(setlistId) {
        if (!currentUser?.isAdmin) {
            showNotification('Only admins can edit global setlists');
            return;
        }

        const setlist = findSetlistById(globalSetlists, setlistId);
        if (!setlist) return;

        const modal = document.getElementById('globalSetlistModal');
        const title = document.getElementById('globalSetlistModalTitle');
        const form = document.getElementById('globalSetlistForm');
        const submitBtn = document.getElementById('globalSetlistSubmit');

        title.textContent = 'Edit Global Setlist';
        submitBtn.textContent = 'Update Setlist';
        
        document.getElementById('globalSetlistId').value = getComparableId(setlist._id || setlist.id);
        document.getElementById('globalSetlistName').value = setlist.name;
        document.getElementById('globalSetlistDescription').value = setlist.description || '';

        // Initialize song selection with checkboxes and pre-select existing songs
        modal.songSelector = initializeSetlistSongSelection('global');
        
        // Pre-select the songs that are already in this setlist
        if (modal.songSelector && setlist.songs && setlist.songs.length > 0) {
            modal.songSelector.setSelectedSongs(setlist.songs);
        }

        modal.style.display = 'flex';
    }

    // Delete global setlist
    function deleteGlobalSetlist(setlistId) {
        if (!currentUser?.isAdmin) {
            showNotification('Only admins can delete global setlists');
            return;
        }

        const setlist = findSetlistById(globalSetlists, setlistId);
        if (!setlist) return;

        const modal = document.getElementById('confirmDeleteSetlistModal');
        const message = document.getElementById('deleteSetlistMessage');
        
        message.textContent = `Are you sure you want to delete the global setlist "${setlist.name}"?`;
        modal.style.display = 'flex';

        document.getElementById('confirmDeleteSetlist').onclick = async () => {
            try {
                const targetSetlistId = getComparableId(setlist._id || setlist.id || setlistId);
                const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${targetSetlistId}`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    globalSetlists = globalSetlists.filter(s => getComparableId(s && (s._id || s.id)) !== targetSetlistId);
                    renderGlobalSetlists();
                    showNotification('Global setlist deleted');
                    modal.style.display = 'none';
                } else if (res.status === 403) {
                    showNotification('❌ Access denied: Only administrators can delete global setlists', 'error');
                    modal.style.display = 'none';
                } else {
                    showNotification('Failed to delete global setlist');
                }
            } catch (err) {
                console.error('Failed to delete global setlist:', err);
                showNotification('Failed to delete global setlist');
            }
        };
    }

    // Create new my setlist
    function createMySetlist() {
        if (!jwtToken) {
            showNotification('Please log in to create setlists');
            return;
        }

        const modal = document.getElementById('mySetlistModal');
        const title = document.getElementById('mySetlistModalTitle');
        const mySetlistForm = document.getElementById('mySetlistForm');
        const submitBtn = document.getElementById('mySetlistSubmit');

        title.textContent = 'Create My Setlist';
        submitBtn.textContent = 'Create Setlist';
        mySetlistForm.reset();
        document.getElementById('mySetlistId').value = '';

        // Initialize song selection with checkboxes
        modal.songSelector = initializeSetlistSongSelection('my');

        modal.style.display = 'flex';

        // Add submit event listener to refresh setlists after creation
        mySetlistForm.onsubmit = async function(e) {
            // ...existing code for setlist creation...
            setTimeout(async () => {
                await refreshSetlistDataAndUI();
                renderGlobalSetlists();
                renderMySetlists();
                renderSmartSetlists();
                // Select the newly added setlist in dropdown
                const dropdown = document.getElementById('setlistDropdown');
                const nameInput = document.getElementById('globalSetlistName'); // or 'mySetlistName'
                const newSetlist = globalSetlists.find(s => s.name === nameInput.value); // or mySetlists
                if (dropdown && newSetlist) {
                    dropdown.value = `global_${newSetlist._id}`; // or `my_${newSetlist._id}`
                    dropdown.dispatchEvent(new Event('change'));
                }
            }, 100);
        };
    }

    // Edit my setlist
    function editMySetlist(setlistId) {
        const setlist = findSetlistById(mySetlists, setlistId);
        if (!setlist) return;

        const modal = document.getElementById('mySetlistModal');
        const title = document.getElementById('mySetlistModalTitle');
        const form = document.getElementById('mySetlistForm');
        const submitBtn = document.getElementById('mySetlistSubmit');

        title.textContent = 'Edit My Setlist';
        submitBtn.textContent = 'Update Setlist';
        
        document.getElementById('mySetlistId').value = getComparableId(setlist._id || setlist.id);
        document.getElementById('mySetlistName').value = setlist.name;
        document.getElementById('mySetlistDescription').value = setlist.description || '';

        // Initialize song selection with checkboxes and pre-select existing songs
        modal.songSelector = initializeSetlistSongSelection('my');
        
        // Pre-select the songs that are already in this setlist
        if (modal.songSelector && setlist.songs && setlist.songs.length > 0) {
            modal.songSelector.setSelectedSongs(setlist.songs);
        }

        modal.style.display = 'flex';
    }

    // Delete my setlist
    function deleteMySetlist(setlistId) {
        const setlist = findSetlistById(mySetlists, setlistId);
        if (!setlist) return;

        const modal = document.getElementById('confirmDeleteSetlistModal');
        const message = document.getElementById('deleteSetlistMessage');
        
        message.textContent = `Are you sure you want to delete the setlist "${setlist.name}"?`;
        modal.style.display = 'flex';

        document.getElementById('confirmDeleteSetlist').onclick = async () => {
            try {
                const targetSetlistId = getComparableId(setlist._id || setlist.id || setlistId);
                const res = await authFetch(`${API_BASE_URL}/api/my-setlists/${targetSetlistId}`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    mySetlists = mySetlists.filter(s => getComparableId(s && (s._id || s.id)) !== targetSetlistId);
                    renderMySetlists();
                    showNotification('Setlist deleted');
                    modal.style.display = 'none';
                }
            } catch (err) {
                console.error('Failed to delete setlist:', err);
                showNotification('Failed to delete setlist');
            }
        };
    }

    // Manual Song Addition Functions
    function openAddManualSongModal() {
        const modal = document.getElementById('addManualSongModal');
        if (modal) {
            modal.style.display = 'flex';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) modalContent.scrollTop = 0;
            document.getElementById('manualSongTitle').focus();
            // Clear existing results
            document.getElementById('existingSongsResults').style.display = 'none';
            document.getElementById('manualSongForm').reset();
        }
    }

    function closeAddManualSongModal() {
        const modal = document.getElementById('addManualSongModal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('existingSongsResults').style.display = 'none';
        }
    }

    function handleSongTitleSearch() {
        const title = document.getElementById('manualSongTitle').value.trim();
        const resultsContainer = document.getElementById('existingSongsResults');
        const resultsList = document.getElementById('existingSongsList');
        
        if (title.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        // Search for matching songs
        const matchingSongs = songs.filter(song => 
            song.title.toLowerCase().includes(title.toLowerCase())
        ).slice(0, 10); // Limit to 10 results

        if (matchingSongs.length > 0) {
            resultsList.innerHTML = matchingSongs.map(song => `
                <div class="existing-song-item" onclick="selectExistingSong('${song.id}')">
                    <div class="song-title">${song.title}</div>
                    <div class="song-details">
                        ${song.key || 'Unknown Key'} • ${song.time || song.timeSignature || 'Unknown Time'} • ${song.tempo || 'Unknown BPM'}
                    </div>
                </div>
            `).join('');
            resultsContainer.style.display = 'block';
        } else {
            resultsContainer.style.display = 'none';
        }
    }

    async function selectExistingSong(songId) {
        const song = songs.find(s => getComparableId(s.id) === getComparableId(songId));
        if (song && currentViewingSetlist) {
            // Add existing song to setlist
            const success = await addSongToCurrentSetlist(song);
            
            // Only close modal if song was successfully added
            if (success) {
                closeAddManualSongModal();
            }
        }
    }

    async function handleManualSongSubmit(e) {
        e.preventDefault();
        
        const title = document.getElementById('manualSongTitle').value.trim();
        const key = document.getElementById('manualSongKey').value;
        const timeSignature = document.getElementById('manualSongTime').value;
        const tempo = document.getElementById('manualSongTempo').value;
        const category = document.getElementById('manualSongCategory').value;

        if (!title || !key || !timeSignature || !category) {
            showNotification('Please fill in all required fields');
            return;
        }

        // Create manual song object
        const manualSong = {
            id: 'manual_' + Date.now(),
            title: title,
            key: key,
            time: timeSignature,
            tempo: tempo,
            category: category,
            isManualEntry: true,
            lyrics: '(Manual entry - no lyrics available)'
        };

        try {
            // Add to current setlist
            if (currentViewingSetlist && currentSetlistType) {
                const success = await addManualSongToSetlist(manualSong);
                if (success) {
                    closeAddManualSongModal();
                    showNotification(`"${title}" added to setlist`);
                }
                // If not successful, addManualSongToSetlist already showed the error notification
            }
        } catch (error) {
            console.error('Error adding manual song:', error);
            showNotification('Failed to add song to setlist');
        }
    }

    async function addManualSongToSetlist(manualSong) {
        const setlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
        const isGlobal = currentSetlistType === 'global';
        
        // Check for duplicates in current setlist
        const currentSetlist = isGlobal 
            ? findSetlistById(globalSetlists, setlistId)
            : findSetlistById(mySetlists, setlistId);
            
        if (currentSetlist && currentSetlist.songs) {
            // Check if song with same title already exists in setlist
            const isDuplicate = currentSetlist.songs.some(song => {
                // Handle different song data structures
                let songTitle = '';
                
                if (typeof song === 'object') {
                    // Direct song object
                    songTitle = song.title || '';
                } else if (typeof song === 'string') {
                    // Song ID - look up in global songs array
                    const foundSong = songs.find(s => getComparableId(s.id) === getComparableId(song));
                    songTitle = foundSong ? foundSong.title : '';
                }
                
                // Also check for manual song IDs
                if (typeof song === 'string' && song.startsWith('manual_')) {
                    // This might be a manual song ID - check existing manual songs in setlist
                    const manualSongInList = currentSetlist.songs.find(s => 
                        typeof s === 'object' && getComparableId(s.id) === getComparableId(song)
                    );
                    if (manualSongInList) {
                        songTitle = manualSongInList.title || '';
                    }
                }
                
                return songTitle.toLowerCase().trim() === manualSong.title.toLowerCase().trim();
            });
            
            if (isDuplicate) {
                showNotification(`"${manualSong.title}" is already in this setlist`);
                return false;
            }
        }
        
        try {
            const endpoint = isGlobal 
                ? `${API_BASE_URL}/api/global-setlists/add-song`
                : `${API_BASE_URL}/api/my-setlists/add-song`;

            const res = await authFetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    setlistId: setlistId,
                    songId: manualSong.id,
                    manualSong: manualSong
                })
            });

            if (res.ok) {
                // Update local setlist data
                if (isGlobal) {
                    const setlist = findSetlistById(globalSetlists, setlistId);
                    if (setlist) {
                        setlist.songs = setlist.songs || [];
                        setlist.songs.push(manualSong);
                    }
                } else {
                    const setlist = findSetlistById(mySetlists, setlistId);
                    if (setlist) {
                        setlist.songs = setlist.songs || [];
                        setlist.songs.push(manualSong);
                    }
                }

                // Refresh setlist view
                refreshSetlistDisplay();
                return true;
            } else {
                throw new Error('Failed to add manual song to setlist');
            }
        } catch (error) {
            console.error('Error adding manual song to setlist:', error);
            return false;
        }
    }

    async function addSongToCurrentSetlist(song) {
        if (!currentViewingSetlist || !currentSetlistType) return false;

        const setlistId = getComparableId(currentViewingSetlist._id || currentViewingSetlist.id);
        const isGlobal = currentSetlistType === 'global';
        
        // Check for duplicates in current setlist
        const currentSetlist = isGlobal 
            ? findSetlistById(globalSetlists, setlistId)
            : findSetlistById(mySetlists, setlistId);
            
        if (currentSetlist && currentSetlist.songs) {
            // Check if song is already in setlist
            const isDuplicate = currentSetlist.songs.some(existingSong => {
                // Handle different data structures
                if (typeof existingSong === 'object') {
                    // Song object - compare IDs and titles
                    return (getComparableId(existingSong.id) === getComparableId(song.id)) || 
                           (existingSong.title?.toLowerCase().trim() === song.title?.toLowerCase().trim());
                } else {
                    // Song ID - compare with song's ID
                    return getComparableId(existingSong) === getComparableId(song.id);
                }
            });
            
            if (isDuplicate) {
                showNotification(`"${song.title}" is already in this setlist`);
                return false;
            }
        }
        
        const endpoint = isGlobal 
            ? `${API_BASE_URL}/api/global-setlists/add-song`
            : `${API_BASE_URL}/api/my-setlists/add-song`;

        try {
            const res = await authFetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    setlistId: setlistId,
                    songId: song.id 
                })
            });

            if (res.ok) {
                // Update local setlist data
                if (isGlobal) {
                    const setlist = findSetlistById(globalSetlists, setlistId);
                    if (setlist) {
                        setlist.songs = setlist.songs || [];
                        setlist.songs.push(song);
                    }
                } else {
                    const setlist = findSetlistById(mySetlists, setlistId);
                    if (setlist) {
                        setlist.songs = setlist.songs || [];
                        setlist.songs.push(song);
                    }
                }

                // Refresh setlist view
                refreshSetlistDisplay();
                showNotification(`"${song.title}" added to setlist`);
                return true;
            } else {
                showNotification('Failed to add song to setlist');
                return false;
            }
        } catch (error) {
            console.error('Error adding song to setlist:', error);
            showNotification('Failed to add song to setlist');
            return false;
        }
    }

    // ====================== END SETLIST MANAGEMENT FUNCTIONS ======================

    // Populate setlist dropdown in song preview
    function populateSetlistDropdownForSong(song) {
        const globalSetlistsDropdown = document.getElementById('globalSetlistsDropdown');
        const mySetlistsDropdown = document.getElementById('mySetlistsDropdown');
        
        if (!globalSetlistsDropdown || !mySetlistsDropdown) return;

        // Populate global setlists
        globalSetlistsDropdown.innerHTML = '<div class="setlist-dropdown-title">Global Setlists</div>';
        globalSetlists.forEach(setlist => {
            const isInSetlist = setlist.songs.includes(song.id);
            const item = document.createElement('div');
            item.className = `setlist-dropdown-item ${isInSetlist ? 'in-setlist' : ''}`;
            item.innerHTML = `
                <i class="fas ${isInSetlist ? 'fa-check' : 'fa-list'}"></i>
                <span>${setlist.name}</span>
            `;
            item.addEventListener('click', () => {
                if (isInSetlist) {
                    removeFromSpecificSetlist(song.id, setlist._id);
                } else {
                    addToSpecificSetlist(song.id, setlist._id);
                }
                document.getElementById('previewSetlistDropdown').style.display = 'none';
            });
            globalSetlistsDropdown.appendChild(item);
        });

        if (globalSetlists.length === 0) {
            const noItem = document.createElement('div');
            noItem.className = 'setlist-dropdown-item';
            noItem.style.opacity = '0.6';
            noItem.style.cursor = 'default';
            noItem.innerHTML = '<i class="fas fa-info-circle"></i><span>No global setlists available</span>';
            globalSetlistsDropdown.appendChild(noItem);
        }

        // Populate my setlists
        mySetlistsDropdown.innerHTML = '<div class="setlist-dropdown-title">My Setlists</div>';
        if (jwtToken) {
            mySetlists.forEach(setlist => {
                const isInSetlist = setlist.songs.includes(song.id);
                const item = document.createElement('div');
                item.className = `setlist-dropdown-item ${isInSetlist ? 'in-setlist' : ''}`;
                item.innerHTML = `
                    <i class="fas ${isInSetlist ? 'fa-check' : 'fa-list'}"></i>
                    <span>${setlist.name}</span>
                `;
                item.addEventListener('click', () => {
                    if (isInSetlist) {
                        removeFromSpecificSetlist(song.id, setlist._id);
                    } else {
                        addToSpecificSetlist(song.id, setlist._id);
                    }
                    document.getElementById('previewSetlistDropdown').style.display = 'none';
                });
                mySetlistsDropdown.appendChild(item);
            });

            if (mySetlists.length === 0) {
                const noItem = document.createElement('div');
                noItem.className = 'setlist-dropdown-item';
                noItem.style.opacity = '0.6';
                noItem.style.cursor = 'default';
                noItem.innerHTML = '<i class="fas fa-plus"></i><span>Create your first personal setlist</span>';
                mySetlistsDropdown.appendChild(noItem);
            }
        } else {
            const loginItem = document.createElement('div');
            loginItem.className = 'setlist-dropdown-item';
            loginItem.style.opacity = '0.6';
            loginItem.style.cursor = 'default';
            loginItem.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Login to create and access personal setlists</span>';
            mySetlistsDropdown.appendChild(loginItem);
        }
    }


    // Add song to global setlist
    async function addToGlobalSetlist(songId, setlistId) {
        if (!currentUser?.isAdmin) {
            showNotification('Only admins can add songs to global setlists');
            return;
        }

        const targetSetlistId = getComparableId(setlistId);
        const setlist = findSetlistById(globalSetlists, targetSetlistId);
        if (!setlist) return;

        if ((setlist.songs || []).some(item => {
            if (typeof item === 'object' && item !== null) {
                return getComparableId(item.id) === getComparableId(songId);
            }
            return getComparableId(item) === getComparableId(songId);
        })) {
            showNotification('Song already in setlist');
            return;
        }

        try {
            const updatedSongs = [...(setlist.songs || []), songId];
            const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${targetSetlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = globalSetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === targetSetlistId);
                if (index !== -1) globalSetlists[index] = setlist;
                
                // Notification removed - handled by unified setlist system
                // showNotification(`Added to "${setlist.name}"`);
            }
        } catch (err) {
            console.error('Failed to add song to global setlist:', err);
            showNotification('Failed to add song to setlist');
        }
    }

    // Remove song from global setlist
    async function removeFromGlobalSetlist(songId, setlistId) {
        if (!currentUser?.isAdmin) {
            showNotification('Only admins can modify global setlists');
            return;
        }

        const targetSetlistId = getComparableId(setlistId);
        const setlist = findSetlistById(globalSetlists, targetSetlistId);
        if (!setlist) return;

        try {
            const updatedSongs = (setlist.songs || []).filter(item => {
                if (typeof item === 'object' && item !== null) {
                    return getComparableId(item.id) !== getComparableId(songId);
                }
                return getComparableId(item) !== getComparableId(songId);
            });
            const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${targetSetlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = globalSetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === targetSetlistId);
                if (index !== -1) globalSetlists[index] = setlist;
                
                // Notification removed - handled by unified setlist system
                // showNotification(`Removed from "${setlist.name}"`);
            }
        } catch (err) {
            console.error('Failed to remove song from global setlist:', err);
            showNotification('Failed to remove song from setlist');
        }
    }

    // Add song to my setlist
    async function addToMySetlist(songId, setlistId) {
        if (!jwtToken) {
            showNotification('Please login to add songs to your setlists');
            return;
        }

        const targetSetlistId = getComparableId(setlistId);
        const setlist = findSetlistById(mySetlists, targetSetlistId);
        if (!setlist) return;

        if ((setlist.songs || []).some(item => {
            if (typeof item === 'object' && item !== null) {
                return getComparableId(item.id) === getComparableId(songId);
            }
            return getComparableId(item) === getComparableId(songId);
        })) {
            showNotification('Song already in setlist');
            return;
        }

        try {
            const updatedSongs = [...(setlist.songs || []), songId];
            const res = await authFetch(`${API_BASE_URL}/api/my-setlists/${targetSetlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = mySetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === targetSetlistId);
                if (index !== -1) mySetlists[index] = setlist;
                
                // Notification removed - handled by unified setlist system
                // showNotification(`Added to "${setlist.name}"`);
            }
        } catch (err) {
            console.error('Failed to add song to setlist:', err);
            showNotification('Failed to add song to setlist');
        }
    }

    // Remove song from my setlist
    async function removeFromMySetlist(songId, setlistId) {
        if (!jwtToken) {
            showNotification('Please login to modify your setlists');
            return;
        }

        const targetSetlistId = getComparableId(setlistId);
        const setlist = findSetlistById(mySetlists, targetSetlistId);
        if (!setlist) return;

        try {
            const updatedSongs = (setlist.songs || []).filter(item => {
                if (typeof item === 'object' && item !== null) {
                    return getComparableId(item.id) !== getComparableId(songId);
                }
                return getComparableId(item) !== getComparableId(songId);
            });
            const res = await authFetch(`${API_BASE_URL}/api/my-setlists/${targetSetlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = mySetlists.findIndex(s => getComparableId(s && (s._id || s.id)) === targetSetlistId);
                if (index !== -1) mySetlists[index] = setlist;
                
                // Notification removed - handled by unified setlist system
                // showNotification(`Removed from "${setlist.name}"`);
            }
        } catch (err) {
            console.error('Failed to remove song from setlist:', err);
            showNotification('Failed to remove song from setlist');
        }
    }

        // Show login modal (local/JWT)
        function showLoginModal() {
            let modal = document.getElementById('loginModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'loginModal';
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-content">
                        <span class="close-modal" onclick="this.closest('.modal').style.display='none'">×</span>
                        <h3>Login</h3>
                        <input id="loginUsername" type="text" placeholder="Username" style="width:100%;margin-bottom:10px;">
                        <input id="loginPassword" type="password" placeholder="Password" style="width:100%;margin-bottom:10px;">
                        <button id="loginSubmitBtn" class="btn btn-primary" style="width:100%;">Login</button>
                        <div style="margin-top:10px;text-align:center;">
                            <a href="#" id="showRegisterLink">Register</a>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                document.getElementById('loginSubmitBtn').onclick = login;
                document.getElementById('showRegisterLink').onclick = (e) => {
                    e.preventDefault();
                    modal.style.display = 'none';
                    showRegisterModal();
                };
            }
            modal.style.display = 'flex';
        }

        function showRegisterModal() {
            let modal = document.getElementById('registerModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'registerModal';
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-content">
                        <span class="close-modal" onclick="this.closest('.modal').style.display='none'">×</span>
                        <h3>Register</h3>
                        <input id="registerUsername" type="text" placeholder="Username" style="width:100%;margin-bottom:10px;">
                        <input id="registerPassword" type="password" placeholder="Password" style="width:100%;margin-bottom:10px;">
                        <button id="registerSubmitBtn" class="btn btn-primary" style="width:100%;">Register</button>
                    </div>
                `;
                document.body.appendChild(modal);
                document.getElementById('registerSubmitBtn').onclick = register;
            }
            modal.style.display = 'flex';
        }

        async function login() {
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            try {
                const res = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    jwtToken = data.token;
                    localStorage.setItem('pw_jwtToken', jwtToken);
                    currentUser = data.user;
                    localStorage.setItem('pw_currentUser', JSON.stringify(currentUser));
                    window.jwtToken = jwtToken;
                    window.currentUser = currentUser;
                    document.getElementById('loginModal').style.display = 'none';
                    showNotification('Login successful!');
                    // If user is admin, reload page to ensure all admin UI loads
                    if (currentUser && (currentUser.isAdmin === true || currentUser.isAdmin === 'true')) {
                        setTimeout(() => { window.location.reload(); }, 500);
                    } else {
                        updateAuthButtons();
                        if (!initializationState.isInitialized && !initializationState.isInitializing) {
                            showLoading(0, 'Initializing...');
                            await window.init();
                        } else {
                            await loadUserData();
                            await loadMySetlists(); // Load user's setlists after login
                        }
                    }
                } else {
                    showNotification(data.error || 'Login failed');
                }
            } catch (err) {
                showNotification('Login error');
            }
        }

        async function register() {
            const username = document.getElementById('registerUsername').value;
            const password = document.getElementById('registerPassword').value;
            try {
                const res = await fetch(`${API_BASE_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    document.getElementById('registerModal').style.display = 'none';
                    showNotification('Registration successful! Please login.');
                } else {
                    showNotification(data.error || 'Registration failed');
                }
            } catch (err) {
                showNotification('Registration error');
            }
        }

        function logout() {
            // Prevent multiple logout calls
            if (!jwtToken && !currentUser) {
                return;
            }
            
            console.log('🔓 Logging out user...');
            
            // Clear all authentication data
            jwtToken = '';
            currentUser = null;
            window.jwtToken = '';
            window.currentUser = null;
            
            // Remove from localStorage with correct keys
            localStorage.removeItem('pw_jwtToken');
            localStorage.removeItem('pw_currentUser');
            
            // Clear any other user-specific data
            pw_favorites = [];
            localStorage.removeItem('pw_favorites');
            
            showNotification('Logged out successfully');
            updateAuthButtons();
            
            // Reload page after logout to ensure all admin UI is removed
            setTimeout(() => { window.location.reload(); }, 500);
        }
    // Auth0 NAMESPACE removed

    
        // Auto-scroll and chord variables
    let autoScrollInterval = null;
    let isUserScrolling = false;
    let isAutoScrollEnabled = false;
    let autoScrollDirection = 'down';
    // Use global PW_CHORDS, PW_CHORD_TYPES, PW_CHORD_TYPE_REGEX, CHORD_LINE_REGEX, INLINE_CHORD_REGEX
        
        let currentlyPlayingSongs = new Set();
        let currentPlayingSongId = null;
        let navigationHistory = [];
        let currentHistoryPosition = -1;
        let isNavigatingHistory = false;
        let isAnyModalOpen = false;
        let currentModal = null;
        let userDataSaveQueue = Promise.resolve();

        // Search history
        let searchHistory = JSON.parse(localStorage.getItem('pw_searchHistory')) || [];
    
        // Initialize the application

        function queueSaveUserData() {
            // Add the save to the end of the queue
            userDataSaveQueue = userDataSaveQueue.then(() => saveUserData());
            return userDataSaveQueue;
        }

        function setupSuggestedSongsClosing() {
            const drawer = document.getElementById('suggestedSongsDrawer');
            const toggleBtn = document.getElementById('toggleSuggestedSongs');
            
            // Click outside to close
            document.addEventListener('click', (e) => {
                if (suggestedSongsDrawerOpen && 
                    !e.target.closest('#suggestedSongsDrawer') && 
                    e.target !== toggleBtn) {
                    closeSuggestedSongsDrawer();
                }
            });
            
            // Escape key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && suggestedSongsDrawerOpen) {
                    closeSuggestedSongsDrawer();
                }
            });
            
            // Ensure close button works
            document.getElementById('closeSuggestedSongs').addEventListener('click', closeSuggestedSongsDrawer);
        }
        

        function setupModalClosing() {
            document.querySelectorAll('.close-modal').forEach(button => {
                button.addEventListener('click', () => {
                    const modal = button.closest('.modal');
                    if (modal) {
                        modal.style.display = 'none';
                    }
                });
            });
            
            // Remove the outside click handler completely
        }
    
        function renderFavorites() {
            favoritesContent.innerHTML = '';
            // Update pw_favorites count in showFavoritesEl
            if (showFavoritesEl) {
                showFavoritesEl.innerHTML = `Favorites (<span class="pw_favorites-count">${pw_favorites.length}</span>)`;
            }
        
            if (pw_favorites.length === 0) {
                favoritesContent.innerHTML = '<p>No favorite songs yet.</p>';
                return;
            }
        
            const favoriteSongs = songs.filter(song => pw_favorites.includes(song.id));
            renderSongs(favoriteSongs, favoritesContent);
        }

        let wakeLock = null;
    
        async function initScreenWakeLock() {
            if ('wakeLock' in navigator && document.visibilityState === 'visible') {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                    keepScreenOn = true;
                    showNotification('Screen will stay on');
                    wakeLock.addEventListener('release', () => {
                        keepScreenOn = false;
                        showNotification('Screen may sleep');
                    });
                } catch (err) {
                    showNotification('Failed to keep screen on');
                }
            }
        }

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
                await initScreenWakeLock();
            } else if (wakeLock) {
                try {
                    await wakeLock.release();
                } catch (e) {}
                wakeLock = null;
                keepScreenOn = false;
                showNotification('Screen may sleep');
            }
        });


        function updateAuthButtons() {
            const isLoggedIn = !!jwtToken;
            const userGreeting = document.getElementById('userGreeting');
            if (userGreeting) {
                if (isLoggedIn && currentUser && currentUser.firstName && currentUser.lastName) {
                    userGreeting.textContent = `Hi, ${currentUser.firstName} ${currentUser.lastName}`;
                    userGreeting.style.display = 'block';
                } else if (isLoggedIn && currentUser && currentUser.username) {
                    userGreeting.textContent = `Hi, ${currentUser.username}`;
                    userGreeting.style.display = 'block';
                } else {
                    userGreeting.textContent = '';
                    userGreeting.style.display = 'none';
                }
            }
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) loginBtn.style.display = isLoggedIn ? 'none' : 'block';
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'block' : 'none';
            const registerBtn = document.getElementById('registerBtn');
            if (registerBtn) registerBtn.style.display = isLoggedIn ? 'none' : 'block';
            const isAdminUser = isAdmin();
            const adminPanelBtn = document.getElementById('adminPanelBtn');
            if (adminPanelBtn) adminPanelBtn.style.display = isAdminUser ? 'block' : 'none';
            const deleteAllSongsBtn = document.getElementById('deleteAllSongsBtn');
            if (deleteAllSongsBtn) deleteAllSongsBtn.style.display = isAdminUser ? 'block' : 'none';
            if (!isLoggedIn) {
                const deleteSection = document.getElementById('deleteSection');
                if (deleteSection) deleteSection.style.display = 'none';
            }

            // Update setlist add button visibility
            const addGlobalSetlistBtn = document.getElementById('addGlobalSetlistBtn');
            const addMySetlistBtn = document.getElementById('addMySetlistBtn');
            const addSmartSetlistBtn = document.getElementById('addSmartSetlistBtn');
            const globalSetlistContent = document.getElementById('globalSetlistContent');
            const mySetlistContent = document.getElementById('mySetlistContent');
            const smartSetlistContent = document.getElementById('smartSetlistContent');
            if (addGlobalSetlistBtn && globalSetlistContent) {
                addGlobalSetlistBtn.style.display = (isAdminUser && globalSetlistContent.style.display === 'block') ? 'block' : 'none';
            }
            if (addMySetlistBtn && mySetlistContent) {
                addMySetlistBtn.style.display = (isLoggedIn && mySetlistContent.style.display === 'block') ? 'block' : 'none';
            }
            if (addSmartSetlistBtn && smartSetlistContent) {
                addSmartSetlistBtn.style.display = (isLoggedIn && smartSetlistContent.style.display === 'block') ? 'block' : 'none';
            }
        }

    // --- Admin Panel Logic ---
    //const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://oldandnew.onrender.com';
    async function fetchUsers() {
        const jwtToken = localStorage.getItem('pw_jwtToken');
        const res = await fetch(`${API_BASE_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${jwtToken}` }
        });
        if (!res.ok) return [];
        return res.json();
    }
    async function markAdmin(userId) {
        const jwtToken = localStorage.getItem('pw_jwtToken');
        const res = await fetch(`${API_BASE_URL}/api/users/${userId}/admin`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isAdmin: true })
        });
        if (res.ok) {
            showAdminNotification('User marked as admin');
            loadUsers();
        } else {
            showAdminNotification('Failed to update user');
        }
    }
    function showAdminNotification(msg) {
        const n = document.getElementById('adminNotification');
        n.textContent = msg;
        n.style.display = 'block';
        setTimeout(() => n.style.display = 'none', 2000);
    }
    function renderUsers(users) {
        const tbody = document.querySelector('#usersTable tbody');
        tbody.innerHTML = '';
        
        // Sort users with admin users first
        const sortedUsers = users.sort((a, b) => {
            if (a.isAdmin && !b.isAdmin) return -1;
            if (!a.isAdmin && b.isAdmin) return 1;
            // Secondary sort by username with null safety
            const usernameA = a.username || '';
            const usernameB = b.username || '';
            return usernameA.localeCompare(usernameB);
        });
        
        sortedUsers.forEach(user => {
            let displayName = '';
            if (user.username && user.username.trim()) {
                displayName = user.username.trim();
            } else if (user.name && user.name.trim()) {
                displayName = user.name.trim();
            } else if (user.firstName && user.firstName.trim()) {
                displayName = user.firstName.trim();
                if (user.lastName && user.lastName.trim()) {
                    displayName += ' ' + user.lastName.trim();
                }
            } else if (user.email && user.email.trim()) {
                displayName = user.email.trim();
            } else {
                displayName = 'Unknown User';
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${displayName}</td>
                <td>${user.isAdmin ? '<span style=\"color:green;font-weight:bold;\">Admin</span>' : ''}</td>
                <td>
                    <button class=\"btn\" ${user.isAdmin ? 'disabled' : ''} onclick=\"markAdmin('${user._id}')\">Mark Admin</button>
                </td>
                <td>
                    <button class=\"btn btn-danger\" ${!user.isAdmin ? 'disabled' : ''} onclick=\"removeAdminRole('${user._id}')\">Remove Admin</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    async function loadUsers() {
        const users = await fetchUsers();
        renderUsers(users);
    }
    // Duplicate showAdminPanelModal function removed - using the one defined earlier
        // window.addEventListener('DOMContentLoaded', updateAuthButtons);
    
        async function toggleScreenWakeLock() {
            if (!('wakeLock' in navigator)) return;
            
            if (!keepScreenOn) {
                try {
                    const wakeLock = await navigator.wakeLock.request('screen');
                    keepScreenOn = true;
                    keepScreenOnBtn.classList.add('active');
                    showNotification('Screen will stay on');
                } catch (err) {
                    showNotification('Failed to keep screen on');
                }
            } else {
                keepScreenOn = false;
                keepScreenOnBtn.classList.remove('active');
                showNotification('Screen may sleep');
            }
        }
    
        function showNotification(message, typeOrDuration = 3000) {
            // Handle both old format (duration) and new format (type)
            let duration = 3000;
            let type = 'info';
            
            if (typeof typeOrDuration === 'string') {
                type = typeOrDuration;
                duration = 3000;
            } else if (typeof typeOrDuration === 'number') {
                duration = typeOrDuration;
                type = 'info';
            }
            
            notificationEl.textContent = message;
            notificationEl.classList.remove('error', 'success', 'info');
            notificationEl.classList.add('show', type);
            
            setTimeout(() => {
                notificationEl.classList.remove('show', 'error', 'success', 'info');
            }, duration);
        }
    

        function normalizeToggleButtonsVisibility(value) {
            const normalized = String(value || '').trim().toLowerCase();
            if (normalized === 'show' || normalized === 'hide-all' || normalized === 'draggable-only') {
                return normalized;
            }
            return 'hide';
        }

        function normalizePreviewLyricsSize(value) {
            const normalized = String(value || '').trim().toLowerCase();
            if (normalized === 'down-2' || normalized === 'down-1' || normalized === 'up-1' || normalized === 'up-2' || normalized === 'up-3') {
                return normalized;
            }
            return 'default';
        }

        function resolvePreviewLyricsFontSize(size) {
            switch (size) {
                case 'down-2':
                    return '0.78rem';
                case 'down-1':
                    return '0.84rem';
                case 'up-1':
                    return '0.96rem';
                case 'up-2':
                    return '1.02rem';
                case 'up-3':
                    return '1.12rem';
                default:
                    return '0.9rem';
            }
        }

        function applyPreviewLyricsSize(size) {
            const normalizedSize = normalizePreviewLyricsSize(size);
            const fontSize = resolvePreviewLyricsFontSize(normalizedSize);
            document.documentElement.style.setProperty('--preview-lyrics-font-size', fontSize);
            return normalizedSize;
        }

        function loadSettings() {
            const savedHeader = localStorage.getItem("sidebarHeader");
            if (savedHeader) document.querySelector(".sidebar-header h2").textContent = savedHeader;

            // Set default values for mobile/desktop in percentage
            let sidebarWidth = localStorage.getItem("sidebarWidth");
            let songsPanelWidth = localStorage.getItem("songsPanelWidth");
            if (!sidebarWidth || !songsPanelWidth) {
                if (window.innerWidth <= 700) {
                    sidebarWidth = "60";
                    songsPanelWidth = "60";
                } else {
                    sidebarWidth = "20";
                    songsPanelWidth = "20";
                }
            }
            const previewMargin = localStorage.getItem("previewMargin") || "10";
            const savedAutoScrollSpeed = localStorage.getItem("autoScrollSpeed") || "1500";
            const toggleButtonsVisibility = normalizeToggleButtonsVisibility(localStorage.getItem("toggleButtonsVisibility") || "hide");
            const previewLyricsSize = normalizePreviewLyricsSize(localStorage.getItem("previewLyricsSize") || "up-2");

            document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}%`);
            document.documentElement.style.setProperty('--songs-panel-width', `${songsPanelWidth}%`);
            document.documentElement.style.setProperty('--preview-margin-left', `${previewMargin}px`);

            document.getElementById('panelWidthInput').value = sidebarWidth;
            document.getElementById('previewMarginInput').value = previewMargin;
            document.getElementById('autoScrollSpeedInput').value = savedAutoScrollSpeed;
            const toggleButtonsVisibilityEl = document.getElementById("toggleButtonsVisibility");
            if (toggleButtonsVisibilityEl) {
                toggleButtonsVisibilityEl.value = toggleButtonsVisibility;
            }
            const previewLyricsSizeEl = document.getElementById("previewLyricsSize");
            if (previewLyricsSizeEl) {
                previewLyricsSizeEl.value = previewLyricsSize;
            }
            
            autoScrollSpeed = parseInt(savedAutoScrollSpeed);

            applyToggleButtonsVisibility(toggleButtonsVisibility);
            applyPreviewLyricsSize(previewLyricsSize);
        }
    
            
        function applyLyricsBackground(isNew) {
            const lyricsContainer = document.querySelector(".song-lyrics");
            if (!lyricsContainer) return;
            lyricsContainer.classList.remove("lyrics-bg-New", "lyrics-bg-Old");
            lyricsContainer.classList.add(isNew ? "lyrics-bg-New" : "lyrics-bg-Old");
        }

        function applyToggleButtonsVisibility(visibility) {
            const normalizedVisibility = normalizeToggleButtonsVisibility(visibility);
            const showDraggableButtons = normalizedVisibility === 'show' || normalizedVisibility === 'draggable-only';
            const showStationaryMobileButtons = normalizedVisibility === 'show' || normalizedVisibility === 'hide';
            const toggleButtons = document.querySelectorAll('.panel-toggle.draggable');

            // Legacy draggable panel toggles appear only in explicit "show" mode.
            toggleButtons.forEach(button => {
                if (button.closest('.mobile-nav-container')) return;
                button.style.display = showDraggableButtons ? '' : 'none';
            });

            // Stationary mobile panel toggles can be hidden via the "hide-all" mode.
            const mobileNavContainer = document.querySelector('.mobile-nav-container');
            if (mobileNavContainer) {
                mobileNavContainer.style.display = showStationaryMobileButtons ? 'flex' : 'none';
            }

            document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
                btn.style.display = showStationaryMobileButtons ? 'flex' : 'none';
            });
        }
    
        function addPanelToggles() {
            const sidebar = document.querySelector('.sidebar');
            const songsSection = document.querySelector('.songs-section');
            const previewSection = document.querySelector('.preview-section');
    
            if (!sidebar || !songsSection || !previewSection || !toggleSidebarBtn || !toggleSongsBtn || !toggleAllPanelsBtn) {
                return;
            }
    
            toggleSidebarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't toggle if the button was just dragged
                if (toggleSidebarBtn._wasDragged) {
                    toggleSidebarBtn._wasDragged = false;
                    return;
                }
                sidebar.classList.toggle('hidden');
                if (window.innerWidth <= 768) {
                    if (!sidebar.classList.contains('hidden')) {
                        songsSection.classList.add('hidden');
                    }
                }
                updatePositions();
            });
    
            toggleSongsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't toggle if the button was just dragged
                if (toggleSongsBtn._wasDragged) {
                    toggleSongsBtn._wasDragged = false;
                    return;
                }
                songsSection.classList.toggle('hidden');
                if (window.innerWidth <= 768) {
                    if (!songsSection.classList.contains('hidden')) {
                        sidebar.classList.add('hidden');
                    }
                }
                updatePositions();
            });
    
            toggleAllPanelsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Don't toggle if the button was just dragged
                if (toggleAllPanelsBtn._wasDragged) {
                    toggleAllPanelsBtn._wasDragged = false;
                    return;
                }
                const areBothHidden = sidebar.classList.contains('hidden') && songsSection.classList.contains('hidden');
                sidebar.classList.toggle('hidden', !areBothHidden);
                songsSection.classList.toggle('hidden', !areBothHidden);
                toggleAllPanelsBtn.querySelector('i').className = areBothHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
                updatePositions();
            });
    
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 768 &&
                    !e.target.closest('.sidebar') &&
                    !e.target.closest('.songs-section') &&
                    !e.target.closest('.panel-toggle') &&
                    !e.target.closest('.modal')) {
                    sidebar.classList.add('hidden');
                    songsSection.classList.add('hidden');
                    toggleAllPanelsBtn.querySelector('i').className = 'fas fa-eye';
                    updatePositions();
                }
            });
    
            if (window.innerWidth > 768) {
                sidebar.classList.remove('hidden');
                songsSection.classList.remove('hidden');
            } else {
                const restored = applySavedMobilePanelState(sidebar, songsSection);
                if (!restored) {
                    sidebar.classList.remove('hidden');
                    songsSection.classList.add('hidden');
                    persistMobilePanelState(sidebar, songsSection);
                }
                ensureMobilePanelStateObserver(sidebar, songsSection);
            }
            updatePositions();
    
            window.addEventListener('resize', () => {
                updatePositions();
                if (window.innerWidth <= 768) {
                    ensureMobilePanelStateObserver(sidebar, songsSection);
                    persistMobilePanelState(sidebar, songsSection);
                }
            });
        }
    
        function updatePositions() {
            if (window.innerWidth > 768) {
                if (document.querySelector('.sidebar').classList.contains('hidden')) {
                    document.querySelector('.songs-section').style.left = '0';
                    document.querySelector('.preview-section').style.marginLeft =
                        document.querySelector('.songs-section').classList.contains('hidden') ?
                        'var(--preview-margin-left)' :
                        'calc(var(--songs-panel-width) + var(--preview-margin-left))';
                } else {
                    document.querySelector('.songs-section').style.left = 'var(--sidebar-width)';
                    document.querySelector('.preview-section').style.marginLeft =
                        document.querySelector('.songs-section').classList.contains('hidden') ?
                        'calc(var(--sidebar-width) + var(--preview-margin-left))' :
                        'calc(var(--sidebar-width) + var(--songs-panel-width) + var(--preview-margin-left))';
                }
            } else {
                document.querySelector('.songs-section').style.left = '0';
                document.querySelector('.preview-section').style.marginLeft = '0';
                const songsPanel = document.querySelector('.songs-section');
                const previewSection = document.querySelector('.preview-section');
                if (songsPanel && previewSection) {
                    if (songsPanel.classList.contains('hidden')) {
                        previewSection.classList.add('full-width');
                    } else {
                        previewSection.classList.remove('full-width');
                    }
                }
            }
        }
    
        function saveSongs(toFile = false) {
            if (toFile) {
                try {
                    const data = {
                        songs: songs
                    };
                } catch (err) {
                    // Error saving to file
                }
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'update',
                        songs: songs
                    }));
                }
            }
    
            localStorage.setItem('pw_songs', JSON.stringify(songs));
            localStorage.setItem('pw_songsTimestamp', Date.now().toString());
            if (window.dataCache && window.dataCache.lastSyncTimestamp) {
                window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();
                localStorage.setItem('pw_songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
            }
            const embedded = document.getElementById('embeddedSongs');
            if (embedded) {
                embedded.textContent = JSON.stringify(songs, null, 2);
            }
        }

        // Add this function
        function optimizeMemoryUsage() {
            // Clean up large data structures when not needed
            // Removed artificial truncation of songs array to 500 items
            
            if (searchHistory.length > 50) {
                searchHistory = searchHistory.slice(0, 50);
                localStorage.setItem('pw_searchHistory', JSON.stringify(searchHistory));
            }
            
            // Force garbage collection (works in most modern browsers)
            if (window.gc) {
                window.gc();
            } else if (window.CollectGarbage) {
                window.CollectGarbage();
            } else {
                try {
                    // Memory optimization without logging
                    if (window.performance && window.performance.memory) {
                        // Memory check performed silently
                    }
                } catch(e) {}
            }
        }

        // Call periodically (every 5 minutes)
        setInterval(optimizeMemoryUsage, 300000);
    
   

        async function loadUserData() {
            try {
                const response = await cachedFetch(`${API_BASE_URL}/api/userdata`);
                if (response.ok) {
                    const data = await response.json();
                    // Always update pw_favorites from backend (map from favorites)
                    pw_favorites = Array.isArray(data.favorites) ? data.favorites : [];
                    if (!Array.isArray(pw_favorites)) pw_favorites = [];
                    if (data.user && data.user.username) {
                        currentUser = data.user;
                        localStorage.setItem('pw_currentUser', JSON.stringify(currentUser));
                    }
                    updateAuthButtons();
                        // Force re-render songs to update favorite icons for both tabs
                        const filters = getCurrentFilterValues();
                        renderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                        renderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                        // Always re-render pw_favorites list after loading
                        if (typeof renderFavorites === 'function') {
                            renderFavorites();
                        }
                } else if (response.status === 401 || response.status === 403) {
                    logout();
                    showNotification('Session expired. Please log in again.');
                } else {
                    let msg = 'Failed to load user data';
                    try {
                        const errData = await response.json();
                        if (errData && errData.error) msg = errData.error;
                    } catch {}
                    showNotification(msg);
                }
            } catch (err) {
                showNotification('Network error: Failed to load user data');
            }
        }

        async function saveUserData() {
            try {
                // No cap on pw_favorites, send all
                const limitedFavorites = Array.isArray(pw_favorites) ? pw_favorites : [];
                // Use name, email, transpose as expected by backend
                const name = currentUser && currentUser.username ? currentUser.username : '';
                const email = currentUser && currentUser.email ? currentUser.email : '';
                let transpose = {};
                try {
                    transpose = JSON.parse(localStorage.getItem('pw_transposeCache') || '{}');
                } catch (e) { transpose = {}; }
                const response = await authFetch(`${API_BASE_URL}/api/userdata`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        favorites: limitedFavorites,
                        name,
                        email: currentUser && currentUser.email ? currentUser.email : '',
                        username: currentUser && currentUser.username ? currentUser.username : '',
                        transpose
                    })
                });
                if (!response.ok) {
                    showNotification('Failed to save user data');
                    return false;
                }
                // Optionally check response for success
                const data = await response.json();
                if (data && data.message === 'User data updated') {
                    // Success! Invalidate userdata cache so next fetch gets fresh data
                    invalidateCache(['userdata']);
                    return true;
                } else {
                    showNotification('Failed to save user data');
                    return false;
                }
            } catch (err) {
                showNotification('Error saving user data');
                return false;
            }
        }

        // queueSaveUserData().then(success => {
        //     if (success) {
        //         showNotification('Favorites saved!');
        //     } else {
        //         showNotification('Failed to save pw_favorites.');
        //     }
        // });
    
        function downloadSongs() {
            const data = {
                songs: songs,
                pw_favorites: pw_favorites
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'songs-backup.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    
        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.songs && Array.isArray(data.songs)) {
                        songs = data.songs;
                        pw_favorites = data.pw_favorites || [];
                        saveSongs();
                        queueSaveUserData();
                        
                        if (PraiseTab.classList.contains('active')) {
                            renderSongs('Praise', keyFilter.value, genreFilter.value);
                        } else {
                            renderSongs('Worship', keyFilter.value, genreFilter.value);
                        }
                        showNotification('Songs loaded successfully!');
                    } else {
                        throw new Error('Invalid file format');
                    }
                } catch (err) {
                    showNotification('Could not load file: ' + err.message);
                }
            };
            reader.onerror = function () {
                showNotification('Error reading file');
            };
            reader.readAsText(file);
        }
    
        function handleMergeUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.songs && Array.isArray(data.songs)) {
                        const existingIds = new Set(songs.map(s => s.id));
                        const newSongs = data.songs.filter(song => !existingIds.has(song.id));
                        const nextId = Math.max(0, ...songs.map(s => s.id)) + 1;
    
                        newSongs.forEach((song, index) => {
                            song.id = nextId + index;
                        });
    
                        songs = [...songs, ...newSongs];
                        saveSongs();
    
                        showNotification(`${newSongs.length} new songs merged successfully.`);
                        if (PraiseTab.classList.contains('active')) {
                            const filters = getCurrentFilterValues();
                            renderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                        } else {
                            const filters = getCurrentFilterValues();
                            renderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                        }
                    } else {
                        throw new Error('Invalid file format');
                    }
                } catch (err) {
                    showNotification('Could not merge file: ' + err.message);
                }
            };
            reader.readAsText(file);
        }
    
        function isDuplicateSong(title, lyrics, currentId = null) {
            // Normalize input
            const t = title.trim().toLowerCase();
            const l = lyrics.trim().toLowerCase();
            // Check for exact title or lyrics match
            for (const song of songs) {
                if (currentId && song.id === currentId) continue;
                if (song.title.trim().toLowerCase() === t || song.lyrics.trim().toLowerCase() === l) {
                    return true;
                }
            }
            // Fuzzy match: only compare with similar length and first letter
            for (const song of songs) {
                if (currentId && song.id === currentId) continue;
                if (song.title[0].toLowerCase() === title[0].toLowerCase() && Math.abs(song.title.length - title.length) < 3) {
                    // Fast similarity check
                    let matches = 0;
                    for (let ch of t) {
                        if (song.title.toLowerCase().includes(ch)) matches++;
                    }
                    if (matches / Math.max(song.title.length, t.length) > 0.6) {
                        // Expensive check
                        const titleSim = stringSimilarity(song.title, title);
                        if (titleSim >= 0.8) return true;
                    }
                }
                if (song.lyrics[0].toLowerCase() === lyrics[0].toLowerCase() && Math.abs(song.lyrics.length - lyrics.length) < 10) {
                    let matches = 0;
                    for (let ch of l) {
                        if (song.lyrics.toLowerCase().includes(ch)) matches++;
                    }
                    if (matches / Math.max(song.lyrics.length, l.length) > 0.6) {
                        const lyricsSim = stringSimilarity(song.lyrics, lyrics);
                        if (lyricsSim >= 0.8) return true;
                    }
                }
            }
            return false;
        }
    
        function saveSearchQuery(query) {
            if (!query.trim()) return;
    
            searchHistory = searchHistory.filter(item => item.toLowerCase() !== query.toLowerCase());
            searchHistory.unshift(query);
    
            if (searchHistory.length > 10) {
                searchHistory = searchHistory.slice(0, 10);
            }
    
            localStorage.setItem('pw_searchHistory', JSON.stringify(searchHistory));
        }

        function getVocalTags(genres) {
    return genres ? genres.filter(g => PW_VOCAL_TAGS.includes(g)) : [];
        }
        function getNonVocalGenres(genres) {
            return genres ? genres.filter(g => !PW_VOCAL_TAGS.includes(g)) : [];
        }

        function getMoodTags(moodString) {
            if (!moodString || typeof moodString !== 'string') return [];
            return moodString.split(',').map(mood => mood.trim()).filter(mood => mood);
        }

        function getMoodMatchScore(mood1, mood2) {
            const moods1 = getMoodTags(mood1);
            const moods2 = getMoodTags(mood2);
            if (!moods1.length || !moods2.length) return 0;
            const commonMoods = moods1.filter(m => moods2.includes(m));
            return commonMoods.length / Math.max(moods1.length, moods2.length);
        }

        function getVocalMatchScore(genres1, genres2) {
            const vocals1 = getVocalTags(genres1);
            const vocals2 = getVocalTags(genres2);
            return vocals1.length && vocals2.length ?
                vocals1.filter(v => vocals2.includes(v)).length / Math.max(vocals1.length, vocals2.length) : 0;
        }
    
        function showSearchHistory() {
            const dropdown = document.getElementById('searchHistoryDropdown');
            dropdown.innerHTML = '';

            if (searchHistory.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            const header = document.createElement('div');
            header.className = 'search-history-header';
            header.textContent = 'Recent Searches';
            dropdown.appendChild(header);

            // Add clear history button
            const clearBtn = document.createElement('div');
            clearBtn.className = 'search-history-item';
            clearBtn.style.fontWeight = 'bold';
            clearBtn.style.cursor = 'pointer';
            clearBtn.textContent = 'Clear History';
            clearBtn.addEventListener('click', () => {
                searchHistory = [];
                localStorage.setItem('pw_searchHistory', JSON.stringify(searchHistory));
                dropdown.style.display = 'none';
            });
            dropdown.appendChild(clearBtn);

            searchHistory.forEach(query => {
                const item = document.createElement('div');
                item.className = 'search-history-item';
                item.textContent = query;

                item.addEventListener('click', () => {
                    document.getElementById('searchInput').value = query;
                    dropdown.style.display = 'none';
                    const event = new Event('input', { bubbles: true });
                    document.getElementById('searchInput').dispatchEvent(event);
                });

                dropdown.appendChild(item);
            });

            dropdown.style.display = 'block';
        }
    
        function highlightText(text, query) {
            if (!query) return text;
    
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        return text.replace(regex, match => `<span class="highlight">${match}</span>`);
    }

    // Debouncing mechanism for renderSongs
    let renderSongsTimeout = null;
    let lastRenderParams = null;

    function debouncedRenderSongs(categoryOrSongs, filterOrContainer, genreFilterValue, moodFilterValue, artistFilterValue) {
        // Create parameter signature for comparison
        const currentParams = JSON.stringify([categoryOrSongs, filterOrContainer, genreFilterValue, moodFilterValue, artistFilterValue]);
        
        // Get calling function for debugging
        const stack = new Error().stack.split('\n');
        const caller = stack[1] ? stack[1].trim() : 'unknown';
        
        // If parameters are exactly the same as last call, skip entirely
        if (currentParams === lastRenderParams) {
            console.log('renderSongs skipped - identical parameters');
            return;
        }
        
        // Clear any pending render
        if (renderSongsTimeout) {
            clearTimeout(renderSongsTimeout);
        }
        
        // Schedule new render after 50ms delay
        renderSongsTimeout = setTimeout(() => {
            lastRenderParams = currentParams;
            renderSongs(categoryOrSongs, filterOrContainer, genreFilterValue, moodFilterValue, artistFilterValue);
            renderSongsTimeout = null;
        }, 50);
    }

    function renderSongs(categoryOrSongs, filterOrContainer, genreFilterValue, moodFilterValue, artistFilterValue) {
        let songsToRender;
        let container;            if (typeof categoryOrSongs === 'string') {
                const category = categoryOrSongs;
                const keyFilterValue = filterOrContainer;
                
                songsToRender = songs
                    .filter(song => song.category === category)
                    .filter(song => {
                        // If 'Key' or empty, show all
                        return !keyFilterValue || keyFilterValue === 'Key' || song.key === keyFilterValue;
                    })
                    .filter(song => {
                        // If 'Genre' or empty, show all
                        return !genreFilterValue || genreFilterValue === 'Genre' || (song.genres ? song.genres.includes(genreFilterValue) : song.genre === genreFilterValue);
                    })
                    .filter(song => {
                        // If 'Mood' or empty, show all
                        return !moodFilterValue || moodFilterValue === 'Mood' || song.mood === moodFilterValue;
                    })
                    .filter(song => {
                        // If 'Artist' or empty, show all
                        return !artistFilterValue || artistFilterValue === 'Artist' || song.artistDetails === artistFilterValue;
                    });
                
                // --- Prioritize search results: title matches first, then lyrics matches ---
                const searchTerm = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
                
                if (searchTerm) {
                    songsToRender.sort((a, b) => {
                        // Check title matches
                        const aTitleMatch = a.title && a.title.toLowerCase().includes(searchTerm);
                        const bTitleMatch = b.title && b.title.toLowerCase().includes(searchTerm);
                        
                        // If both have title matches or both don't, check lyrics
                        if (aTitleMatch === bTitleMatch) {
                            const aLyricsMatch = a.lyrics && a.lyrics.toLowerCase().includes(searchTerm);
                            const bLyricsMatch = b.lyrics && b.lyrics.toLowerCase().includes(searchTerm);
                            
                            // Prioritize lyrics matches over non-matches
                            if (aLyricsMatch && !bLyricsMatch) return -1;
                            if (!aLyricsMatch && bLyricsMatch) return 1;
                            
                            // If both have same match status, maintain original order
                            return 0;
                        }
                        
                        // Prioritize title matches over non-title matches
                        return aTitleMatch ? -1 : 1;
                    });
                }
            
        
                // Sorting logic
                const sortValue = document.getElementById('sortFilter')?.value || 'recent';
                if (sortValue === 'az') {
                    songsToRender.sort((a, b) => a.title.localeCompare(b.title));
                } else if (sortValue === 'za') {
                    songsToRender.sort((a, b) => b.title.localeCompare(a.title));
                } else if (sortValue === 'oldest') {
                    songsToRender.sort((a, b) => {
                        if (a.createdAt && b.createdAt) return new Date(a.createdAt) - new Date(b.createdAt);
                        return (a.id || 0) - (b.id || 0);
                    });
                } else {
                    // Default: recently added (by createdAt desc, fallback to id desc)
                    songsToRender.sort((a, b) => {
                        if (a.createdAt && b.createdAt) return new Date(b.createdAt) - new Date(a.createdAt);
                        return (b.id || 0) - (a.id || 0);
                    });
                }
                container = category === 'Praise' ? document.getElementById('PraiseContent') : document.getElementById('WorshipContent');
            } else {
                songsToRender = categoryOrSongs;
                container = filterOrContainer;
            }

            // Update visible song count below songs-section
            const visibleSongCountEl = document.getElementById('visibleSongCount');
            if (visibleSongCountEl) {
                visibleSongCountEl.textContent = `Songs displayed: ${songsToRender.length}`;
            }
            
            // Clean up existing event listeners before clearing container
            const existingSongItems = container.querySelectorAll('.song-item');
            existingSongItems.forEach(item => {
                // Remove favorite button listeners
                const favBtn = item.querySelector('.favorite-btn');
                if (favBtn && favBtn._favListener) {
                    favBtn.removeEventListener('click', favBtn._favListener);
                }
                
                // Remove setlist button listeners
                const setlistBtn = item.querySelector('.toggle-setlist');
                if (setlistBtn && setlistBtn._setlistListener) {
                    setlistBtn.removeEventListener('click', setlistBtn._setlistListener);
                }
                
                // Remove edit button listeners
                const editBtn = item.querySelector('.edit-song');
                if (editBtn && editBtn._editListener) {
                    editBtn.removeEventListener('click', editBtn._editListener);
                }
                
                // Remove delete button listeners
                const deleteBtn = item.querySelector('.delete-song');
                if (deleteBtn && deleteBtn._deleteListener) {
                    deleteBtn.removeEventListener('click', deleteBtn._deleteListener);
                }
                
                // Remove main div listeners
                if (item._divListener) {
                    item.removeEventListener('click', item._divListener);
                }
            });
            
            container.innerHTML = '';
            if (songsToRender.length === 0) {
                container.innerHTML = '<p>No songs found.</p>';
                return;
            }
            const activeSongId = songPreviewEl && songPreviewEl.dataset.songId ? parseInt(songPreviewEl.dataset.songId) : null;
            songsToRender.forEach(song => {
                const div = document.createElement('div');
                div.className = 'song-item';
                div.dataset.songId = song.id;
                if (activeSongId === song.id) {
                    div.classList.add('active-song');
                }
                
                // Check if song is in the currently selected setlist
                let isInSetlist = false;
                const selectedSetlistDropdown = document.getElementById('setlistDropdown');
                const selectedSetlist = selectedSetlistDropdown ? selectedSetlistDropdown.value : '';
                
                if (selectedSetlist) {
                    // Check if song is in the currently selected setlist
                    isInSetlist = isSongInCurrentSetlist(song.id, selectedSetlist);
                }
                // No fallback to old system - if no setlist selected, buttons show "Add"
                
                const isFavorite = Array.isArray(pw_favorites) && pw_favorites.includes(song.id);
                const displayGenres = song.genres ? song.genres.join(', ') : song.genre || '';
                div.innerHTML = `
                <div class="song-header">
                    <span class="song-title">${song.title}</span>
                    <button class="favorite-btn ${isFavorite ? 'favorited' : ''}" data-song-id="${song.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="song-meta">${song.key} | ${song.tempo} | ${song.time || song.timeSignature} | ${song.taal || ''} | ${displayGenres}</div>
                <div class="song-actions">
                    <button class="btn ${isInSetlist ? 'btn-delete' : 'btn-primary'} toggle-setlist">
                        ${isInSetlist ? 'Remove' : 'Add'}
                    </button>
                    <button class="btn btn-edit edit-song">Edit</button>
                    <button class="btn btn-delete delete-song" style="display:none;">Delete</button>
                </div>
            `;
                
                // Add event listeners with proper cleanup
                const favoriteBtn = div.querySelector('.favorite-btn');
                const setlistBtn = div.querySelector('.toggle-setlist');
                const editBtn = div.querySelector('.edit-song');
                const deleteBtn = div.querySelector('.delete-song');
                
                // Favorite button listener
                const favListener = (e) => {
                    e.stopPropagation();
                    toggleFavorite(song.id);
                };
                favoriteBtn.addEventListener('click', favListener);
                favoriteBtn._favListener = favListener; // Store reference for cleanup
                
                // Setlist toggle listener
                const setlistListener = (e) => {
                    e.stopPropagation();
                    const songId = parseInt(div.dataset.songId);
                    const song = songs.find(s => s.id === songId);
                    if (!song) return;
                    
                    // Check which setlist is currently selected in the dropdown
                    const selectedSetlistDropdown = document.getElementById('setlistDropdown');
                    const selectedSetlist = selectedSetlistDropdown ? selectedSetlistDropdown.value : '';
                    
                    if (selectedSetlist) {
                        // A specific setlist is selected - add/remove to/from that setlist
                        checkSongInSetlistAndToggle(songId, selectedSetlist);
                    } else {
                        // No specific setlist selected - show notification to select one
                        showNotification('Please select a setlist from the dropdown first');
                    }
                };
                setlistBtn.addEventListener('click', setlistListener);
                setlistBtn._setlistListener = setlistListener; // Store reference for cleanup
                
                // Edit button listener
                const editListener = (e) => {
                    e.stopPropagation();
                    editSong(song.id);
                };
                editBtn.addEventListener('click', editListener);
                editBtn._editListener = editListener; // Store reference for cleanup
                
                // Delete button (admin only)
                if (isAdmin()) {
                    deleteBtn.style.display = '';
                    const deleteListener = (e) => {
                        e.stopPropagation();
                        openDeleteSongModal(song.id);
                    };
                    deleteBtn.addEventListener('click', deleteListener);
                    deleteBtn._deleteListener = deleteListener; // Store reference for cleanup
                }
                
                // Main div click listener for preview
                const divListener = () => {
                    showPreview(song, false, 'all-songs');
                    // Re-render songs to update active highlight
                    const activeTab = document.getElementById('PraiseTab').classList.contains('active') ? 'Praise' : 'Worship';
                    renderSongs(activeTab, keyFilter.value, genreFilter.value);
                    if (window.innerWidth <= 768) {
                        document.querySelector('.songs-section').classList.add('hidden');
                        document.querySelector('.sidebar').classList.add('hidden');
                        document.querySelector('.preview-section').classList.add('full-width');
                    }
                };
                div.addEventListener('click', divListener);
                div._divListener = divListener; // Store reference for cleanup
                
                container.appendChild(div);
            });
        }

        function resetApplicationState() {
            // Clear all data from memory
            songs = [];
            pw_favorites = [];
            searchHistory = [];
            navigationHistory = [];
            currentHistoryPosition = -1;
            
            // Clear all local storage
            localStorage.removeItem('pw_songs');
            localStorage.removeItem('pw_songsTimestamp');
            localStorage.removeItem('pw_songsSyncTimestamp');
            localStorage.removeItem('pw_favorites');
            localStorage.removeItem('pw_searchHistory');
            localStorage.removeItem('pw_darkMode');
            localStorage.removeItem('sidebarHeader');
            localStorage.removeItem('setlistText');
            localStorage.removeItem('sidebarWidth');
            localStorage.removeItem('songsPanelWidth');
            localStorage.removeItem('previewMargin');
            localStorage.removeItem('autoScrollSpeed');
            localStorage.removeItem('sessionResetOption');
            localStorage.removeItem('memoryOptimization');
            
            // Reset UI
            songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics">No song is selected</div>';
            PraiseContent.innerHTML = '<p>No songs found.</p>';
            WorshipContent.innerHTML = '<p>No songs found.</p>';
            PraiseSetlistSongs.innerHTML = '<p>Your Praise setlist is empty.</p>';
            WorshipSetlistSongs.innerHTML = '<p>Your Worship setlist is empty.</p>';
            deleteContent.innerHTML = '<p>No songs available to delete.</p>';
            favoritesContent.innerHTML = '<p>No favorite songs yet.</p>';
            
            // Reset filters and search
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            document.getElementById('searchResults').classList.remove('active');
            keyFilter.value = '';
            genreFilter.value = '';
            
            // Reset counters
            document.getElementById('totalSongs').textContent = '0';
            document.getElementById('PraiseCount').textContent = '0';
            document.getElementById('WorshipCount').textContent = '0';
            
            // Reset theme to light mode if it was dark
            if (document.body.classList.contains('dark-mode')) {
                document.body.classList.remove('dark-mode');
                document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
                localStorage.setItem('pw_darkMode', 'false');
            }
            
            // Show default view
            PraiseTab.click();
            showAllEl.click();
            
            showNotification('Application has been reset to initial state');
            
            // Reload the page to ensure complete reset
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }
    
        function getSuggestedSongs(currentSongId) {
            const currentSong = songs.find(song => song.id === parseInt(currentSongId));
            if (!currentSong) return [];

            // Filter songs from the same category only
            const sameCategorySongs = songs.filter(song => 
                song.id !== parseInt(currentSongId) && 
                song.category === currentSong.category
            );

            
            // Define known language tags
            const LANGUAGE_TAGS = ['English', 'Marathi', 'Spanish', 'Hindi', 'French', 'Tamil', 'Telugu', 'Punjabi', 'Bengali'];

            // Use global/configurable WEIGHTS

            // Time signature compatible pairs
            const TIME_SIGNATURE_COMPATIBILITY = {
                '6/8': ['3/4'],
                '3/4': ['6/8']
            };

            // Harmonic relationships (Circle of Fifths + Relative Major/Minor)
            const HARMONIC_RELATIONS = {
                // Major keys: [dominant, subdominant, relative minor]
                'C': ['G', 'F', 'Am'],
                'G': ['D', 'C', 'Em'],
                'D': ['A', 'G', 'F#m'],
                'A': ['E', 'D', 'C#m'],
                'E': ['B', 'A', 'G#m'],
                'B': ['F#', 'E', 'G#m'],
                'F#': ['C#', 'B', 'Ebm'],
                'C#': ['G#', 'F#', 'Bbm'],
                'F': ['C', 'Bb', 'Dm'],
                'Bb': ['F', 'Eb', 'Gm'],
                'Eb': ['Bb', 'Ab', 'Cm'],
                'Ab': ['Eb', 'Db', 'Fm'],
                'Db': ['Ab', 'Gb', 'Bbm'],
                'Gb': ['Db', 'Cb', 'Ebm'],
                
                // Minor keys: [dominant, subdominant, relative major]
                'Am': ['Em', 'Dm', 'C'],
                'Em': ['Bm', 'Am', 'G'],
                'Bm': ['F#m', 'Em', 'D'],
                'F#m': ['C#m', 'Bm', 'A'],
                'C#m': ['G#m', 'F#m', 'E'],
                'G#m': ['Ebm', 'C#m', 'B'],
                'Ebm': ['Bbm', 'G#m', 'F#'],
                'Bbm': ['Fm', 'Ebm', 'C#'],
                'Dm': ['Am', 'Gm', 'F'],
                'Gm': ['Dm', 'Cm', 'Bb'],
                'Cm': ['Gm', 'Fm', 'Eb'],
                'Fm': ['Cm', 'Bbm', 'Ab'],
                'Bbm': ['Fm', 'Ebm', 'Db']
            };

            // Determine current song's scale type
            const isCurrentMajor = currentSong.key && !currentSong.key.endsWith('m');
            const isCurrentMinor = currentSong.key && currentSong.key.endsWith('m');

            // Helper functions
            const isMajor = key => key && !key.endsWith('m');
            const isMinor = key => key && key.endsWith('m');
            const isSameScaleType = (key1, key2) => (isMajor(key1) && isMajor(key2)) || (isMinor(key1) && isMinor(key2));

            const getTempoSimilarity = (tempo1, tempo2) => {
                if (!tempo1 || !tempo2) return 0;
                const bpm1 = parseInt(tempo1) || 0;
                const bpm2 = parseInt(tempo2) || 0;
                if (!bpm1 || !bpm2) return 0;
                const diff = Math.abs(bpm1 - bpm2);
                const score = 1 - Math.pow(diff / 35, 2);
                return Math.max(0, score);
            };

            const getLanguagesFromGenres = genres => 
                genres ? genres.filter(genre => LANGUAGE_TAGS.includes(genre)) : [];
            
            const getNonLanguageGenres = genres => 
                genres ? genres.filter(genre => !LANGUAGE_TAGS.includes(genre)) : [];

            const getLanguageMatchScore = (genres1, genres2) => {
                const langs1 = getLanguagesFromGenres(genres1);
                const langs2 = getLanguagesFromGenres(genres2);
                return langs1.length && langs2.length ? 
                    langs1.filter(lang => langs2.includes(lang)).length / Math.max(langs1.length, langs2.length) : 0;
            };

            const getGenreMatchScore = (genres1, genres2) => {
                const genresA = getNonLanguageGenres(genres1);
                const genresB = getNonLanguageGenres(genres2);
                return genresA.length && genresB.length ? 
                    genresA.filter(g => genresB.includes(g)).length / Math.max(genresA.length, genresB.length) : 0;
            };

            // Score each song
            const scoredSongs = sameCategorySongs.map(song => {
                const details = {
                    sameScaleType: isSameScaleType(currentSong.key, song.key),
                    scalePriority: 0,
                    languageScore: 0,
                    languages: [],
                    timeMatchType: 'none', // 'exact', 'compatible', or 'none'
                    taalMatch: false,
                    tempoSimilarity: 0,
                    genreMatch: 0,
                    vocalScore: 0,
                    moodScore: 0
                };

                let score = 0;

                // 1. Language match
                details.languageScore = getLanguageMatchScore(
                    currentSong.genres || (currentSong.genre ? [currentSong.genre] : []),
                    song.genres || (song.genre ? [song.genre] : [])
                );
                score += recommendationWeights.language * details.languageScore;
                details.languages = getLanguagesFromGenres(song.genres || (song.genre ? [song.genre] : []));

                // 2. Scale relationships
                if (currentSong.key && song.key) {
                    if (currentSong.key === song.key) {
                        score += recommendationWeights.scale;
                        details.scalePriority = 4;
                    } 
                    else if ((isCurrentMajor && song.key === HARMONIC_RELATIONS[currentSong.key]?.[2]) ||
                            (isCurrentMinor && currentSong.key === HARMONIC_RELATIONS[song.key]?.[2])) {
                        score += recommendationWeights.scale * 0.9;
                        details.scalePriority = 3;
                    }
                    else if (HARMONIC_RELATIONS[currentSong.key]?.includes(song.key)) {
                        score += recommendationWeights.scale * 0.8;
                        details.scalePriority = 2;
                    }
                    else if (details.sameScaleType) {
                        score += recommendationWeights.scale * 0.5;
                        details.scalePriority = 1;
                    }
                }

                // 3. Time signature matching - handle both .time and .timeSignature properties
                const currentTime = currentSong.time || currentSong.timeSignature;
                const songTime = song.time || song.timeSignature;
                if (currentTime === songTime) {
                    details.timeMatchType = 'exact';
                    score += recommendationWeights.timeSignature;
                } 
                else if (TIME_SIGNATURE_COMPATIBILITY[currentTime]?.includes(songTime)) {
                    details.timeMatchType = 'compatible';
                    score += recommendationWeights.timeSignature * 0.9;
                }

                // 4. Taal match
                details.taalMatch = currentSong.taal === song.taal;
                if (details.taalMatch) score += recommendationWeights.taal;

                // 5. Tempo similarity
                details.tempoSimilarity = getTempoSimilarity(currentSong.tempo, song.tempo);
                score += recommendationWeights.tempo * details.tempoSimilarity;

                // 6. Non-language genres
                details.genreMatch = getGenreMatchScore(
                    currentSong.genres || (currentSong.genre ? [currentSong.genre] : []),
                    song.genres || (song.genre ? [song.genre] : [])
                );
                score += recommendationWeights.genre * details.genreMatch;

                // 7. Vocal tags match
                details.vocalScore = getVocalMatchScore(
                    currentSong.genres || (currentSong.genre ? [currentSong.genre] : []),
                    song.genres || (song.genre ? [song.genre] : [])
                );
                score += recommendationWeights.vocal * details.vocalScore;

                // 8. Mood match
                details.moodScore = getMoodMatchScore(currentSong.mood, song.mood);
                score += recommendationWeights.mood * details.moodScore;

                // 9. Rhythm category match (Indian/Western/Others)
                const currentRhythmCategory = normalizeRhythmCategoryValue(currentSong.rhythmCategory || '');
                const songRhythmCategory = normalizeRhythmCategoryValue(song.rhythmCategory || '');
                details.rhythmCategoryScore = (currentRhythmCategory && songRhythmCategory && currentRhythmCategory === songRhythmCategory) ? 1 : 0;
                score += (recommendationWeights.rhythmCategory || 0) * details.rhythmCategoryScore;

                return {
                    ...song,
                    matchScore: Math.min(Math.round(score), 100),
                    matchDetails: {
                        ...details,
                        languageScore: Math.round(details.languageScore * 100),
                        tempoSimilarity: Math.round(details.tempoSimilarity * 100),
                        genreMatch: Math.round(details.genreMatch * 100),
                        vocalScore: Math.round(details.vocalScore * 100),
                        moodScore: Math.round(details.moodScore * 100),
                        rhythmCategoryScore: Math.round(details.rhythmCategoryScore * 100)
                    }
                };
            });

            // Sort by priority
            return scoredSongs.sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);
        }      
    
        function showSuggestedSongs() {
            const currentSongId = songPreviewEl.dataset.songId;
            if (!currentSongId) return;

            const suggestedSongs = getSuggestedSongs(currentSongId);
            const suggestedSongsContent = document.getElementById('suggestedSongsContent');
            suggestedSongsContent.innerHTML = '';

            if (suggestedSongs.length === 0) {
                suggestedSongsContent.innerHTML = '<p>No suggested songs found</p>';
                return;
            }

            suggestedSongs.forEach(song => {
                const div = document.createElement('div');
                div.className = 'suggested-song-item';
                div.innerHTML = `
                    <div class="suggested-song-title">${song.title}</div>
                    <div class="suggested-song-meta">
                        ${song.key || '-'} | ${song.tempo || '-'} | ${song.time || song.timeSignature || '-'} | ${song.taal || '-'}
                    </div>
                    <div class="suggested-song-mood">
                        Mood: ${song.mood || 'Not specified'}
                    </div>
                    <div class="suggested-song-match">Match Score: ${song.matchScore}%</div>
                `;
                // <div class="suggested-song-meta">
                //         Language Match: ${song.languageScore}% |
                //         ${song.scaleMatch ? '✓ Same Scale' : '✗ Different Scale'} |
                //         ${song.timeMatch ? '✓ Same Time Signature' : '✗ Different Time Signature'} |
                //         ${song.taalMatch ? '✓ Same Taal' : '✗ Different Taal'} |
                //         Tempo Match: ${song.tempoSimilarity}% |
                //         Genre Match: ${song.genreMatch}%
                //     </div>
                div.addEventListener('click', () => {
                    showPreview(song, false, 'all-songs');
                    closeSuggestedSongsDrawer();
                });
                suggestedSongsContent.appendChild(div);
            });
        }

        async function saveRecommendationWeightsToBackend(weights) {
            try {
                const res = await authFetch(`${API_BASE_URL}/api/recommendation-weights`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('pw_jwtToken') || ''}`
                    },
                    body: JSON.stringify(weights)
                });
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('pw_recommendationWeights', JSON.stringify(weights));
                    setRecommendationWeightsState(weights);
                    return { success: true, message: data.message || 'Weights updated' };
                } else {
                    const err = await res.json();
                    return { success: false, message: err.error || 'Failed to update weights' };
                }
            } catch (e) {
                return { success: false, message: 'Network error' };
            }
        }


        async function fetchRecommendationWeights() {
            try {
                const res = await authFetch(`${API_BASE_URL}/api/recommendation-weights`);
                if (res.ok) {
                    const data = await res.json();
                    const localLastModified = recommendationWeights.lastModified || localStorage.getItem('pw_recommendationWeightsLastModified');
                    if (!localLastModified || !data.lastModified || data.lastModified !== localLastModified) {
                        setRecommendationWeightsState(data);
                        localStorage.setItem('pw_recommendationWeights', JSON.stringify(data));
                        localStorage.setItem('pw_recommendationWeightsLastModified', data.lastModified || '');
                    }
                }
            } catch (e) { /* fallback to local */ }
        }
    
        function toggleSuggestedSongsDrawer() {
            const drawer = document.getElementById('suggestedSongsDrawer');
            const toggleBtn = document.getElementById('toggleSuggestedSongs');
            
            if (suggestedSongsDrawerOpen) {
                drawer.classList.remove('open');
                if (toggleBtn) toggleBtn.style.right = '';
            } else {
                showSuggestedSongs();
                drawer.classList.add('open');
                if (toggleBtn) toggleBtn.style.right = '';
            }
            
            suggestedSongsDrawerOpen = !suggestedSongsDrawerOpen;
        }
    
        function closeSuggestedSongsDrawer() {
            const drawer = document.getElementById('suggestedSongsDrawer');
            const toggleBtn = document.getElementById('toggleSuggestedSongs');
            
            drawer.classList.remove('open');
            if (toggleBtn) toggleBtn.style.right = '';
            suggestedSongsDrawerOpen = false;
        }
    
        function renderDeleteSongs() {
            deleteContent.innerHTML = '';
            if (songs.length === 0) {
                deleteContent.innerHTML = '<p>No songs available to delete.</p>';
                return;
            }
            songs
                .sort((a, b) => a.title.localeCompare(b.title))
                .forEach(song => {
                    const div = document.createElement('div');
                    div.className = 'song-item';
                    div.innerHTML = `
                        <div class="song-title">${song.title}</div>
                        <div class="song-meta">${song.key} | ${song.tempo} | ${song.time || song.timeSignature} | ${song.genre} | ${song.category}</div>
                        <div class="song-actions">
                            <button class="btn btn-delete delete-song">Delete</button>
                        </div>
                    `;
                    div.querySelector('.delete-song').addEventListener('click', (e) => {
                        e.stopPropagation();
                        openDeleteSongModal(song.id);
                    });
                    div.addEventListener('click', () => {
                        showPreview(song, false, 'all-songs');
                    });
                    deleteContent.appendChild(div);
                });
        }

        // Helper function to get current filter values
        function getCurrentFilterValues() {
            return {
                key: keyFilter ? keyFilter.value : '',
                genre: genreFilter ? genreFilter.value : '',
                mood: moodFilter ? moodFilter.value : '',
                artist: artistFilter ? artistFilter.value : ''
            };
        }

        function isAdmin() {
            const isAdminDebugEnabled = (() => {
                try {
                    const queryFlag = new URLSearchParams(window.location.search).get('pwDebugAdminUi');
                    if (queryFlag === '1' || queryFlag === 'true') return true;
                    const stored = localStorage.getItem('pw_debug_admin_ui');
                    return stored === '1' || stored === 'true';
                } catch {
                    return false;
                }
            })();

            const logAdminDebug = (stage, details) => {
                if (!isAdminDebugEnabled) return;
                try {
                    console.log(`[AdminUI Debug] ${stage}`, details || {});
                } catch {
                    // no-op
                }
            };

            const toBool = (value) => {
                if (value === true) return true;
                if (typeof value === 'string') {
                    const normalized = value.trim().toLowerCase();
                    return normalized === 'true' || normalized === '1' || normalized === 'yes';
                }
                if (typeof value === 'number') return value === 1;
                return false;
            };

            // Prefer hydrated user state; this is refreshed via /api/userdata and survives token-claim drift.
            if (currentUser && toBool(currentUser.isAdmin)) {
                logAdminDebug('isAdmin-via-currentUser', {
                    currentUserId: currentUser.id || currentUser._id || null,
                    currentUserIsAdmin: currentUser.isAdmin
                });
                return true;
            }

            if (!jwtToken) {
                logAdminDebug('isAdmin-false-no-token', {
                    currentUserId: currentUser && (currentUser.id || currentUser._id) || null,
                    currentUserIsAdmin: currentUser ? currentUser.isAdmin : null
                });
                return false;
            }
            try {
                const payload = JSON.parse(atob(jwtToken.split('.')[1]));
                if (!payload) {
                    logAdminDebug('isAdmin-false-empty-payload');
                    return false;
                }

                if (toBool(payload.isAdmin)) {
                    logAdminDebug('isAdmin-via-payload-flag', { payloadIsAdmin: payload.isAdmin });
                    return true;
                }
                if (payload.user && toBool(payload.user.isAdmin)) {
                    logAdminDebug('isAdmin-via-payload-user-flag', { payloadUserIsAdmin: payload.user.isAdmin });
                    return true;
                }

                const roles = Array.isArray(payload.roles)
                    ? payload.roles
                    : (Array.isArray(payload.user && payload.user.roles) ? payload.user.roles : []);
                const roleBasedAdmin = roles.some(role => String(role || '').trim().toLowerCase() === 'admin');
                logAdminDebug('isAdmin-role-check', {
                    roleBasedAdmin,
                    roles,
                    payloadIsAdmin: payload.isAdmin,
                    payloadUserIsAdmin: payload.user ? payload.user.isAdmin : null
                });
                return roleBasedAdmin;
            } catch {
                logAdminDebug('isAdmin-false-token-parse-failed');
                return false;
            }
        }

        function attachPreviewEventListeners(song) {
            // Favorite button event listener is attached after rendering preview HTML, not here.

            // Transpose controls
            document.getElementById('transpose-up')?.addEventListener('click', () => {
                let currentLevel = parseInt(document.getElementById('transpose-level').textContent);
                currentLevel = isNaN(currentLevel) ? 0 : currentLevel;
                document.getElementById('transpose-level').textContent = currentLevel + 1;
                updatePreviewWithTransposition(currentLevel + 1);
            });

            document.getElementById('transpose-down')?.addEventListener('click', () => {
                let currentLevel = parseInt(document.getElementById('transpose-level').textContent);
                currentLevel = isNaN(currentLevel) ? 0 : currentLevel;
                document.getElementById('transpose-level').textContent = currentLevel - 1;
                updatePreviewWithTransposition(currentLevel - 1);
            });

            document.getElementById('transposeReset').addEventListener('click', () => {
                document.getElementById('transpose-level').textContent = 0;
                updatePreviewWithTransposition(0);
            });

            // Save transpose button event listener
            const saveTransposeBtn = document.getElementById('saveTransposeBtn');
            if (saveTransposeBtn) {
                saveTransposeBtn.addEventListener('click', async () => {
                    const level = parseInt(document.getElementById('transpose-level').textContent);
                    if (!currentUser || !currentUser.id || !song.id) {
                        showNotification('Login required to save transpose');
                        return;
                    }
                    // Calculate new key
                    const originalKey = song.key || '';
                    const newKey = transposeSingleChord(originalKey, level);
                    // Load userData first
                    let userData = {};
                    try {
                        const response = await authFetch(`${API_BASE_URL}/api/userdata`);
                        if (response.ok) {
                            userData = await response.json();
                        }
                    } catch (e) {}
                    if (!userData.transpose) userData.transpose = {};
                    userData.transpose[song.id] = level;
                    if (!userData.songKeys) userData.songKeys = {};
                    userData.songKeys[song.id] = newKey;
                    // Save to backend
                    let saveSuccess = false;
                    try {
                        const putResponse = await authFetch(`${API_BASE_URL}/api/userdata`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(userData)
                        });
                        if (putResponse.ok) {
                            showNotification('Transpose saved!');
                            song.key = newKey;
                            saveSuccess = true;
                        } else {
                            showNotification('Failed to save transpose');
                        }
                    } catch (e) {
                        showNotification('Network error saving transpose');
                    }
                    // Update localStorage cache immediately regardless of backend result
                    let localTranspose = {};
                    try {
                        localTranspose = JSON.parse(localStorage.getItem('pw_transposeCache') || '{}');
                    } catch (e) { localTranspose = {}; }
                    localTranspose[song.id] = level;
                    localStorage.setItem('pw_transposeCache', JSON.stringify(localTranspose));
                });
            }
            // Setup auto-scroll if needed
            setupAutoScroll();
        }
    
        async function showPreview(song, fromHistory = false, openingContext = 'all-songs') {
            if (!song || typeof song !== 'object') return;

            const previewSongId = song.id;
            if (!previewSongId) {
                showNotification('Unable to open song preview: missing song ID');
                return;
            }
            song = { ...song, id: previewSongId };

            // Function to get display name for createdBy/updatedBy fields
            function getDisplayName(createdBy) {
                // If it looks like a user ID (ObjectId format), try to get the firstName from currentUser
                if (createdBy && createdBy.length === 24 && /^[0-9a-fA-F]+$/.test(createdBy)) {
                    // This looks like a MongoDB ObjectId, check if it's the current user
                    if (currentUser && currentUser._id === createdBy) {
                        return currentUser.firstName || currentUser.username || 'Unknown User';
                    }
                    // For other users, we don't have their data, so return a generic name
                    return 'User';
                }
                
                // If it's the current user's username, replace with firstName
                if (currentUser && createdBy === currentUser.username) {
                    return currentUser.firstName || currentUser.username || 'Unknown User';
                }
                
                // If it's already a firstName or other username, return it as is
                return createdBy || 'Unknown User';
            }

            // Update history if this is a new navigation (not from back/forward)
            if (!fromHistory && !isNavigatingHistory && !currentModal) {
                if (currentHistoryPosition < navigationHistory.length - 1) {
                    navigationHistory = navigationHistory.slice(0, currentHistoryPosition + 1);
                }
                
                navigationHistory.push(song.id);
                currentHistoryPosition = navigationHistory.length - 1;
                
                history.pushState({ 
                    songId: song.id, 
                    position: currentHistoryPosition,
                    openingContext
                }, '', `#song-${song.id}`);
            }

            // Clear the preview and reset state
            songPreviewEl.innerHTML = '';
            songPreviewEl.dataset.songId = song.id;
            songPreviewEl.dataset.originalLyrics = song.lyrics;
            songPreviewEl.dataset.originalKey = song.key;
            songPreviewEl.dataset.openingContext = openingContext;

            // Check if song is in current setlist and pw_favorites
            const setlistDropdown = document.getElementById('setlistDropdown');
            const currentSetlistValue = setlistDropdown ? setlistDropdown.value : '';
            const isInSetlist = currentSetlistValue ? isSongInCurrentSetlist(song.id, currentSetlistValue) : false;
            const isFavorite = pw_favorites.includes(song.id);

            // Use localStorage for transpose cache, update only on page refresh
            let transposeLevel = 0;
            let userData = {};
            let localTranspose = {};
            const hasGlobalSetlistTranspose = openingContext === 'global-setlist' && currentViewingSetlist && currentViewingSetlist.songTransposes && song.id in currentViewingSetlist.songTransposes;

            if (hasGlobalSetlistTranspose) {
                transposeLevel = currentViewingSetlist.songTransposes[song.id] || 0;
            } else {
                try {
                    localTranspose = JSON.parse(localStorage.getItem('pw_transposeCache') || '{}');
                } catch (e) { localTranspose = {}; }

                if (song.id && typeof localTranspose[song.id] === 'number') {
                    transposeLevel = localTranspose[song.id];
                } else {
                    // Use cached userData if available, or fetch if not cached yet
                    if (currentUser && currentUser.id && song.id) {
                        if (window.userData && window.userData.transpose && song.id in window.userData.transpose && typeof window.userData.transpose[song.id] === 'number') {
                            // Use cached userData
                            transposeLevel = window.userData.transpose[song.id];
                        } else if (!window.userDataFetched && !window.fetchingUserData) {
                            // Only fetch once per session if not already cached
                            window.fetchingUserData = true;
                            try {
                                const response = await authFetch(`${API_BASE_URL}/api/userdata`);
                                if (response.ok) {
                                    userData = await response.json();
                                    window.userData = userData;
                                    window.userDataFetched = true;
                                    if (userData.transpose && song.id in userData.transpose && typeof userData.transpose[song.id] === 'number') {
                                        transposeLevel = userData.transpose[song.id];
                                    }
                                }
                            } catch (e) {
                                // Failed to fetch user data
                            } finally {
                                window.fetchingUserData = false;
                            }
                        }
                    }
                }
            }
            // Build chords display for metadata
            const chordsDisplay = song.chords && song.chords.length > 0 
                ? song.chords.join(', ') 
                : '';
            const isAdminUser = isAdmin();
            const shouldRenderSecondaryMeta = Boolean(
                chordsDisplay || song.artistDetails || song.mood || song.genres || song.genre || song.rhythmCategory || isAdminUser || typeof getLoopPlayerHTML === 'function'
            );
            const isAdminUiDebugEnabled = (() => {
                try {
                    const queryFlag = new URLSearchParams(window.location.search).get('pwDebugAdminUi');
                    if (queryFlag === '1' || queryFlag === 'true') return true;
                    const stored = localStorage.getItem('pw_debug_admin_ui');
                    return stored === '1' || stored === 'true';
                } catch {
                    return false;
                }
            })();
            if (isAdminUiDebugEnabled) {
                console.log('[AdminUI Debug] showPreview-render-decision', {
                    songId: song.id,
                    title: song.title,
                    isAdminUser,
                    shouldRenderSecondaryMeta,
                    hasChords: Boolean(chordsDisplay),
                    hasArtist: Boolean(song.artistDetails),
                    hasMood: Boolean(song.mood),
                    hasGenresArray: Boolean(song.genres && song.genres.length),
                    hasGenre: Boolean(song.genre),
                    hasRhythmCategory: Boolean(song.rhythmCategory),
                    currentUserIsAdmin: currentUser ? currentUser.isAdmin : null
                });
            }
            
            const displayKey = song.key || 'N/A';
            
            // Build the preview HTML
            songPreviewEl.innerHTML = `
<div class="song-preview-container">
    <div class="song-slide">
        <!-- HEADER SECTION -->
        <div class="song-preview-header">
            <h2 class="song-preview-title">${song.title}</h2>
            <button class="favorite-btn${isFavorite ? ' favorited' : ''}" id="previewFavoriteBtn" data-song-id="${song.id}" title="${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}">
                <i class="fas fa-heart"></i>
            </button>
        </div>

        <!-- METADATA SECTION -->
        <div class="song-preview-metadata">
            <div class="preview-meta-group primary-info">
                <span class="preview-meta-label">Key</span>
                <span class="preview-meta-value preview-key" id="current-key">${displayKey}</span>
                ${song.tempo ? `<span class="preview-meta-chip"><i class="fas fa-drum"></i> ${song.tempo}</span>` : ''}
                ${(song.time || song.timeSignature) ? `<span class="preview-meta-chip"><i class="fas fa-clock"></i> ${song.time || song.timeSignature}</span>` : ''}
                ${song.taal ? `<span class="preview-meta-chip"><i class="fas fa-music"></i> ${song.taal}</span>` : ''}
            </div>
            ${shouldRenderSecondaryMeta ? `
            <button class="preview-meta-toggle" id="toggleMetaBtn">
                <span class="toggle-text">More Info</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="preview-meta-group secondary-info collapsed" id="secondaryMetaInfo">
                ${chordsDisplay ? `
                <div class="preview-meta-row chords-row">
                    <span class="preview-meta-label">Chords</span>
                    <span class="preview-meta-value chords-display">${chordsDisplay}</span>
                </div>` : ''}
                ${song.artistDetails ? `
                <div class="preview-meta-row">
                    <span class="preview-meta-label">Artist</span>
                    <span class="preview-meta-value">${song.artistDetails}</span>
                </div>` : ''}
                ${song.mood ? `
                <div class="preview-meta-row">
                    <span class="preview-meta-label">Mood</span>
                    <span class="preview-meta-value preview-mood">${song.mood}</span>
                </div>` : ''}
                ${song.genres ? `
                <div class="preview-meta-row">
                    <span class="preview-meta-label">Genres</span>
                    <span class="preview-meta-value">${song.genres.join(', ')}</span>
                </div>` : song.genre ? `
                <div class="preview-meta-row">
                    <span class="preview-meta-label">Genre</span>
                    <span class="preview-meta-value">${song.genre}</span>
                </div>` : ''}
                ${song.rhythmCategory ? `
                <div class="preview-meta-row">
                    <span class="preview-meta-label">Rhythm Category</span>
                    <span class="preview-meta-value">${song.rhythmCategory}</span>
                </div>` : ''}
                ${isAdminUser ? `
                <div class="preview-meta-row preview-rhythm-set-row">
                    <span class="preview-meta-label">Rhythm Set</span>
                    <div class="preview-rhythm-set-editor">
                        <select class="preview-rhythm-set-select" id="previewRhythmSetSelect">
                            <option value="">-- Loading... --</option>
                        </select>
                        <button class="preview-rhythm-set-save-btn" id="previewRhythmSetSaveBtn" title="Save Rhythm Set">
                            <i class="fas fa-save"></i> Save
                        </button>
                    </div>
                </div>` : ''}
                <div class="preview-meta-row preview-loop-startup-row">
                    <span class="preview-meta-label">Loop Startup</span>
                    <div class="preview-meta-value" id="loopStartupConfigHost-${song.id}"></div>
                </div>
            </div>` : ''}
        </div>

        <div class="song-preview-actions">
            <button class="preview-action-btn preview-setlist-btn ${isInSetlist ? 'remove' : 'add'}" id="previewSetlistBtn">
                <i class="fas ${isInSetlist ? 'fa-check' : 'fa-plus'}"></i>
                <span>${isInSetlist ? 'In Setlist' : 'Add to Setlist'}</span>
            </button>
            <button class="preview-action-btn preview-edit-btn" id="previewEditBtn">
                <i class="fas fa-edit"></i>
                <span>Edit</span>
            </button>
            ${isAdminUser ? `<button class="preview-action-btn preview-delete-btn" id="previewDeleteBtn">
                <i class="fas fa-trash-alt"></i>
                <span>Delete</span>
            </button>` : ''}
        </div>

        <!-- TRANSPOSE SECTION -->
        <div class="song-preview-transpose">
            <div class="preview-transpose-label">
                <i class="fas fa-music"></i>
                <span>Transpose</span>
            </div>
            <button class="preview-transpose-btn transpose-down" id="transpose-down" title="Transpose Down">
                <i class="fas fa-minus"></i>
            </button>
            <span class="preview-transpose-display" id="transpose-level">${transposeLevel}</span>
            <button class="preview-transpose-btn transpose-up" id="transpose-up" title="Transpose Up">
                <i class="fas fa-plus"></i>
            </button>
            <button class="preview-transpose-btn preview-reset" id="transposeReset" title="Reset Transpose">
                <i class="fas fa-undo"></i>
            </button>
            <button class="preview-transpose-btn preview-save" id="saveTransposeBtn" title="Save Transpose">
                <i class="fas fa-save"></i>
            </button>
            <button class="auto-scroll-btn" id="toggleAutoScroll" title="Auto Scroll - Automatically scroll through song lyrics at set speed" aria-label="Toggle Auto Scroll">
                <i class="fas fa-play"></i>
            </button>
        </div>

        <!-- AUDIT SECTION -->
        ${song.updatedAt && song.updatedBy || song.createdBy && song.createdAt ? `
        <div class="song-preview-audit">
            ${song.updatedAt && song.updatedBy
                ? `<div class="preview-audit-info">
                    <i class="fas fa-edit"></i>
                    <span>Updated by <strong>${getDisplayName(song.updatedBy)}</strong> on ${new Date(song.updatedAt).toLocaleDateString()}</span>
                   </div>`
                : `<div class="preview-audit-info">
                    <i class="fas fa-plus"></i>
                    <span>Added by <strong>${getDisplayName(song.createdBy)}</strong> on ${new Date(song.createdAt).toLocaleDateString()}</span>
                   </div>`
            }
        </div>` : ''}

        ${typeof getLoopPlayerHTML === 'function' ? getLoopPlayerHTML(song.id) : ''}
        
        <!-- LYRICS SECTION -->
        <div class="song-lyrics" id="preview-lyrics-container">Loading lyrics...</div>
        <!-- Add these new swipe indicators -->
        <div class="swipe-indicator prev">←</div>
        <div class="swipe-indicator next">→</div>
    </div>
</div>
`;

            // Show the modal immediately
            songPreviewEl.style.display = 'block';
            document.body.style.overflow = 'hidden';

            if (isAdminUiDebugEnabled) {
                console.log('[AdminUI Debug] showPreview-dom-presence-after-render', {
                    songId: song.id,
                    secondaryMetaExists: Boolean(document.getElementById('secondaryMetaInfo')),
                    toggleMetaBtnExists: Boolean(document.getElementById('toggleMetaBtn')),
                    previewRhythmSetSelectExists: Boolean(document.getElementById('previewRhythmSetSelect')),
                    previewRhythmSetSaveBtnExists: Boolean(document.getElementById('previewRhythmSetSaveBtn')),
                    previewDeleteBtnExists: Boolean(document.getElementById('previewDeleteBtn'))
                });
            }

            // Set the transpose-level element to the loaded value before attaching listeners
            document.getElementById('transpose-level').textContent = transposeLevel;
            
            // Attach all event listeners
            attachPreviewEventListeners(song);
            
            // Load and format lyrics asynchronously for better performance
            setTimeout(() => {
                const lyricsContainer = document.getElementById('preview-lyrics-container');
                if (lyricsContainer) {
                    lyricsContainer.innerHTML = formatLyricsWithChords(song.lyrics, transposeLevel);
                }
                
                // Initialize loop player for this song
                if (typeof initializeLoopPlayer === 'function') {
                    const loopInitPromise = initializeLoopPlayer(song.id);
                    if (isAdminUiDebugEnabled && loopInitPromise && typeof loopInitPromise.then === 'function') {
                        loopInitPromise
                            .then(() => {
                                const startupEl = document.getElementById(`loopStartupConfig-${song.id}`);
                                let startupDisplay = null;
                                try {
                                    startupDisplay = startupEl ? getComputedStyle(startupEl).display : null;
                                } catch {
                                    startupDisplay = null;
                                }
                                console.log('[AdminUI Debug] loop-startup-after-init', {
                                    songId: song.id,
                                    loopStartupConfigExists: Boolean(startupEl),
                                    loopStartupDisplay: startupDisplay,
                                    loopStartupLoopExists: Boolean(document.getElementById(`loopStartupLoop-${song.id}`)),
                                    loopStartupFillExists: Boolean(document.getElementById(`loopStartupFill-${song.id}`)),
                                    loopStartupTempoExists: Boolean(document.getElementById(`loopStartupTempo-${song.id}`)),
                                    loopStartupSaveBtnExists: Boolean(document.getElementById(`loopStartupSaveBtn-${song.id}`))
                                });
                            })
                            .catch((error) => {
                                console.warn('[AdminUI Debug] loop-startup-init-error', {
                                    songId: song.id,
                                    message: error && error.message ? error.message : String(error)
                                });
                            });
                    }
                }
            }, 10);
            
            // Ensure transpose UI and lyrics are updated to the correct value
            updatePreviewWithTransposition(transposeLevel);
            
            // Reset navigation flag if this was a history navigation
            if (isNavigatingHistory) {
                setTimeout(() => { isNavigatingHistory = false; }, 100);
            }



            

        
            const previewFavBtn = document.getElementById('previewFavoriteBtn');
            if (previewFavBtn) {
                // Remove previous listener if any
                if (previewFavBtn._favListener) previewFavBtn.removeEventListener('click', previewFavBtn._favListener);
                previewFavBtn._favListener = () => {
                    toggleFavorite(song.id);
                };
                previewFavBtn.addEventListener('click', previewFavBtn._favListener);
            }
            
            // Handle metadata toggle
            const toggleMetaBtn = document.getElementById('toggleMetaBtn');
            const secondaryMetaInfo = document.getElementById('secondaryMetaInfo');
            if (toggleMetaBtn && secondaryMetaInfo) {
                toggleMetaBtn.addEventListener('click', () => {
                    const isCollapsed = secondaryMetaInfo.classList.contains('collapsed');
                    if (isCollapsed) {
                        secondaryMetaInfo.classList.remove('collapsed');
                        toggleMetaBtn.classList.add('expanded');
                        toggleMetaBtn.querySelector('.toggle-text').textContent = 'Less Info';
                        toggleMetaBtn.querySelector('i').classList.remove('fa-chevron-down');
                        toggleMetaBtn.querySelector('i').classList.add('fa-chevron-up');
                    } else {
                        secondaryMetaInfo.classList.add('collapsed');
                        toggleMetaBtn.classList.remove('expanded');
                        toggleMetaBtn.querySelector('.toggle-text').textContent = 'More Info';
                        toggleMetaBtn.querySelector('i').classList.remove('fa-chevron-up');
                        toggleMetaBtn.querySelector('i').classList.add('fa-chevron-down');
                    }
                });
            }

            if (isAdmin()) {
                const rhythmSetSelect = document.getElementById('previewRhythmSetSelect');
                const rhythmSetSaveBtn = document.getElementById('previewRhythmSetSaveBtn');

                async function populateRhythmSetDropdown() {
                    if (!rhythmSetSelect || rhythmSetSelect.dataset.loaded) return;
                    rhythmSetSelect.dataset.loaded = 'true';

                    try {
                        const res = await authFetch(`${API_BASE_URL}/api/rhythm-sets`);
                        if (!res.ok) throw new Error('Failed to fetch rhythm sets');

                        const sets = await res.json();
                        rhythmSetSelect.innerHTML = '<option value="">-- None --</option>';
                        sets.sort((a, b) => String(a.rhythmSetId || '').localeCompare(String(b.rhythmSetId || '')));

                        sets.forEach(rs => {
                            const opt = document.createElement('option');
                            opt.value = rs.rhythmSetId;

                            const rawNotes = [rs.notes, rs.description, rs.note]
                                .map(value => String(value || '').trim())
                                .find(Boolean) || '';

                            let displayText = rs.rhythmSetId;
                            if (rawNotes) {
                                displayText += ` -> ${rawNotes.length > 50 ? rawNotes.substring(0, 50) + '...' : rawNotes}`;
                            } else if (rs.rhythmFamily) {
                                displayText += ` (${rs.rhythmFamily})`;
                            }

                            opt.textContent = displayText;
                            opt.title = rawNotes ? `${rs.rhythmSetId}\n\nNotes: ${rawNotes}` : rs.rhythmSetId;
                            if (rs.rhythmSetId === song.rhythmSetId) opt.selected = true;
                            rhythmSetSelect.appendChild(opt);
                        });

                        if (song.rhythmSetId && !sets.find(rs => rs.rhythmSetId === song.rhythmSetId)) {
                            const opt = document.createElement('option');
                            opt.value = song.rhythmSetId;
                            opt.textContent = `${song.rhythmSetId} (current)`;
                            opt.selected = true;
                            rhythmSetSelect.insertBefore(opt, rhythmSetSelect.children[1]);
                        }
                    } catch (e) {
                        rhythmSetSelect.innerHTML = '<option value="">-- Error loading --</option>';
                    }
                }

                populateRhythmSetDropdown();

                if (rhythmSetSaveBtn) {
                    rhythmSetSaveBtn.addEventListener('click', async () => {
                        const selectedId = rhythmSetSelect ? rhythmSetSelect.value : '';
                        rhythmSetSaveBtn.disabled = true;
                        rhythmSetSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                        try {
                            const res = await authFetch(`${API_BASE_URL}/api/songs/${song.id}/rhythm-set`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rhythmSetId: selectedId || null })
                            });

                            if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                throw new Error(err.error || 'Failed to update Rhythm Set');
                            }

                            const updated = await res.json();
                            Object.assign(song, updated);
                            updateSongInCache(updated, false);
                            localStorage.setItem('loopsMetadataInvalidatedAt', Date.now().toString());

                            if (typeof window.invalidateLoopsMetadataCache === 'function') {
                                window.invalidateLoopsMetadataCache();
                            }

                            const loopContainer = document.getElementById(`loopPlayerContainer-${song.id}`);
                            const playBtn = document.getElementById(`loopPlayBtn-${song.id}`);

                            if (typeof loopPlayerInstance !== 'undefined' && loopPlayerInstance && loopPlayerInstance.currentSongId == song.id) {
                                if (typeof loopPlayerInstance.pause === 'function') {
                                    loopPlayerInstance.pause();
                                }
                                if (typeof loopPlayerInstance.stopAllMelodicPads === 'function') {
                                    loopPlayerInstance.stopAllMelodicPads();
                                }
                            }

                            if (loopContainer) {
                                loopContainer.querySelectorAll('.loop-pad-active').forEach(pad => pad.classList.remove('loop-pad-active'));
                            }

                            if (playBtn) {
                                playBtn.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
                                playBtn.classList.remove('playing');
                                playBtn.disabled = false;
                            }

                            if (typeof window.hideFloatingStopButton === 'function') {
                                window.hideFloatingStopButton(song.id);
                            }

                            const loopStatus = document.getElementById(`loopStatus-${song.id}`);
                            if (loopStatus) {
                                loopStatus.textContent = updated.rhythmSetId ? 'Refreshing loops...' : 'No Rhythm Set assigned';
                            }

                            if (typeof initializeLoopPlayer === 'function') {
                                await initializeLoopPlayer(song.id);
                            }

                            showNotification(`Rhythm Set updated to "${updated.rhythmSetId || 'None'}" successfully!`);
                        } catch (e) {
                            showNotification(e.message || 'Error updating Rhythm Set', 'error');
                        } finally {
                            rhythmSetSaveBtn.disabled = false;
                            rhythmSetSaveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
                        }
                    });
                }
            }
            
            document.getElementById('previewSetlistBtn').addEventListener('click', (e) => {
                // Check which setlist is currently selected in the dropdown
                const selectedSetlistDropdown = document.getElementById('setlistDropdown');
                const selectedSetlist = selectedSetlistDropdown ? selectedSetlistDropdown.value : '';

                
                if (selectedSetlist) {
                    // A specific setlist is selected - add/remove to/from that setlist
                    checkSongInSetlistAndToggle(song.id, selectedSetlist);
                } else {
                    // No specific setlist selected - show notification to select one
                    showNotification('Please select a setlist from the main dropdown first');
                }
            });

            document.getElementById('previewEditBtn').addEventListener('click', (e) => {
                editSong(song.id);
            });
            // Add delete button event for admins
            if (isAdmin()) {
                const delBtn = document.getElementById('previewDeleteBtn');
                if (delBtn) {
                    delBtn.addEventListener('click', () => {
                        // Open the delete modal for this song
                        document.getElementById('deleteSongId').value = song.id;
                        document.getElementById('deleteSongTitle').textContent = song.title;
                        document.getElementById('deleteSongModal').style.display = 'flex';
                    });
                }
            }
            
            document.getElementById('transpose-up').addEventListener('click', () => {
                const currentLevel = parseInt(document.getElementById('transpose-level').textContent);
                updatePreviewWithTransposition(currentLevel);
            });
            document.getElementById('transpose-down').addEventListener('click', () => {
                const currentLevel = parseInt(document.getElementById('transpose-level').textContent);
                updatePreviewWithTransposition(currentLevel);
            });
            document.getElementById('transposeReset').addEventListener('click', () => {
                updatePreviewWithTransposition(0);
            });

            // Setup auto-scroll if needed
            setupAutoScroll();
            applyLyricsBackground(song.category === 'Praise');
            
            if (suggestedSongsDrawerOpen) {
                showSuggestedSongs();
            }
        }
    
    
        function formatLyricsWithChords(lyrics, transposeLevel) {
            const lines = lyrics.split('\n');
            let output = [];
    
            // Flexible regex to detect section tags in various formats:
            // - [Chorus], (Chorus), Chorus, CHORUS
            // - Chorus:, Chorus 1, Verse 2:, etc.
            // - With or without brackets/parentheses
            const sectionTagRegex = /^[\[\(]?\s*(Chorus|Verse|Pre-?chorus|Bridge|Intro|Outro|Tag|Interlude|Ending|Refrain|Hook|Coda|Solo)(\s*\d+)?\s*[\]\)]?\s*:?\s*$/i;
    
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
    
                if (line.trim() === '') {
                    output.push(`<div class="lyric-line">${line}</div>`);
                    continue;
                }
    
                // Check if this line is a section tag
                const sectionMatch = line.trim().match(sectionTagRegex);
                if (sectionMatch) {
                    const sectionType = sectionMatch[1].toLowerCase().replace('-', '');
                    const sectionNumber = sectionMatch[2] ? sectionMatch[2].trim() : '';
                    output.push(`<div class="section-tag section-${sectionType}"><i class="fas fa-music"></i> ${sectionMatch[1]}${sectionNumber ? ' ' + sectionNumber : ''}</div>`);
                    continue;
                }
    
                if (isChordLine(line)) {
                    let processedLine = line.replace(
                        PW_CHORD_REGEX,
                        (chord) => {
                            if (!chord.trim()) return chord;
                            if (chord.includes('/')) {
                                const [baseChord, bassNote] = chord.split('/');
                                const transposedBase = transposeChord(baseChord.trim(), transposeLevel);
                                const transposedBass = bassNote ? transposeChord(bassNote.trim(), transposeLevel) : '';
                                return `<span class="chord" data-original="${chord.trim()}">${transposedBase + (transposedBass ? '/' + transposedBass : '')}</span>`;
                            }
                            return `<span class="chord" data-original="${chord.trim()}">${transposeChord(chord.trim(), transposeLevel)}</span>`;
                        }
                    );
                    output.push(`<div class="chord-line">${processedLine}</div>`);
                }
                else if (hasInlineChords(line)) {
                    // Use INLINE_CHORD_REGEX to find and render inline chords
                    let processedLine = line.replace(INLINE_CHORD_REGEX, (match, chord) => {
                        if (chord.includes('/')) {
                            const [baseChord, bassNote] = chord.split('/');
                            const transposedBase = transposeChord(baseChord, transposeLevel);
                            const transposedBass = bassNote ? transposeChord(bassNote, transposeLevel) : '';
                            return `[<span class="chord" data-original="${chord}">${transposedBase}${transposedBass ? '/' + transposedBass : ''}</span>]`;
                        }
                        return `[<span class="chord" data-original="${chord}">${transposeChord(chord, transposeLevel)}</span>]`;
                    });
                    output.push(`<div class="lyric-line">${processedLine}</div>`);
                }
                else {
                    output.push(`<div class="lyric-line">${line}</div>`);
                }
            }
    
            return output.join('');
        }

        function isChordLine(line) {
            // Use only the defined constant for chord line detection
            return PW_CHORD_LINE_REGEX.test(line.trim());
        }

        function hasInlineChords(line) {
            // Use only the defined constant for inline chord detection
            return PW_INLINE_CHORD_REGEX.test(line);
        }
    
        function transposeChord(chord, steps) {
            if (steps === 0 || !chord) return chord;
    
            if (chord.includes('/')) {
                const [baseChord, bassNote] = chord.split('/');
                const transposedBase = transposeSingleChord(baseChord, steps);
                const transposedBass = bassNote ? transposeSingleChord(bassNote, steps) : '';
                return transposedBase + (transposedBass ? '/' + transposedBass : '');
            }
    
            return transposeSingleChord(chord, steps);
        }
    
        function transposeSingleChord(chord, steps) {
            if (steps === 0 || !chord) return chord;

            const match = chord.match(/^([A-G][#b]?)(.*)$/i);
            if (!match) return chord;

            const baseNote = match[1];
            const quality = match[2] || '';

            // Chromatic scale using preferred notation (Eb and Bb as flats, others as sharps)
            const chromaticScale = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
            
            // Find current position (check both sharp and flat versions)
            let currentIndex = chromaticScale.indexOf(baseNote);
            if (currentIndex === -1) {
                // Try sharp notation for legacy compatibility
                const sharpToFlat = { 'D#': 'Eb', 'A#': 'Bb' };
                const flatEquivalent = sharpToFlat[baseNote];
                if (flatEquivalent) {
                    currentIndex = chromaticScale.indexOf(flatEquivalent);
                }
            }
            if (currentIndex === -1) return chord;

            // Calculate new position
            const newIndex = (currentIndex + steps + 12) % 12;
            const newBaseNote = chromaticScale[newIndex];

            // Maintain case
            if (baseNote === baseNote.toLowerCase()) {
                newBaseNote = newBaseNote.toLowerCase();
            }

            return newBaseNote + quality;
        }
    
        function updatePreviewWithTransposition(level) {
            if (!songPreviewEl.dataset.songId) return;
            // Always get level from #transpose-level element
            let transposeLevel = parseInt(document.getElementById('transpose-level').textContent);
            transposeLevel = Math.max(-12, Math.min(12, isNaN(transposeLevel) ? 0 : transposeLevel));
            const lyrics = songPreviewEl.dataset.originalLyrics;
            document.getElementById('transpose-level').textContent = transposeLevel;
            const originalKey = songPreviewEl.dataset.originalKey;
            document.getElementById('current-key').textContent = transposeLevel === 0 ? originalKey : transposeChord(originalKey, transposeLevel);

            const lyricsContainer = document.querySelector('.song-lyrics');
            if (lyricsContainer) {
                lyricsContainer.innerHTML = formatLyricsWithChords(lyrics, transposeLevel);
            }
        }
    
        function setupAutoScroll() {
            const autoScrollButton = document.getElementById('toggleAutoScroll');
            if (autoScrollButton && autoScrollButton.dataset.autoScrollBound !== 'true') {
                autoScrollButton.dataset.autoScrollBound = 'true';
                autoScrollButton.addEventListener('click', toggleAutoScroll);
            }

            isUserScrolling = false;
            songPreviewEl.scrollTop = 0;
            const shouldResumeAutoScroll = isAutoScrollEnabled;

            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }

            if (shouldResumeAutoScroll) {
                startAutoScroll(autoScrollDirection);
            } else if (autoScrollButton) {
                autoScrollButton.innerHTML = '<i class="fas fa-play"></i>';
                autoScrollButton.classList.remove('active');
            }
        }
    
        function startAutoScroll(direction = 'down') {
            autoScrollDirection = direction === 'up' ? 'up' : 'down';
            isAutoScrollEnabled = true;

            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
            }
            
            const scrollStep = autoScrollDirection === 'down' ? 20 : -20;
            const autoScrollButton = document.getElementById('toggleAutoScroll');
            if (autoScrollButton) {
                autoScrollButton.innerHTML = '<i class="fas fa-pause"></i>';
                autoScrollButton.classList.add('active');
            }
            
            autoScrollInterval = setInterval(() => {
                if (isUserScrolling) return;
                const previewHeight = songPreviewEl.scrollHeight;
                const viewportHeight = songPreviewEl.clientHeight;
                const maxScroll = previewHeight - viewportHeight;
                const currentScroll = songPreviewEl.scrollTop;
                
                // Keep auto-scroll running until manually stopped.
                if (autoScrollDirection === 'down' && currentScroll >= maxScroll - 10) {
                    songPreviewEl.scrollTop = 0;
                    return;
                }
                if (autoScrollDirection === 'up' && currentScroll <= 10) {
                    songPreviewEl.scrollTop = Math.max(maxScroll, 0);
                    return;
                }
                
                const targetScroll = autoScrollDirection === 'down' 
                    ? Math.min(currentScroll + scrollStep, maxScroll)
                    : Math.max(currentScroll + scrollStep, 0);
                    
                let startTime;
                function animateScroll(timestamp) {
                    if (!startTime) startTime = timestamp;
                    const progress = Math.min((timestamp - startTime) / 300, 1);
                    const ease = progress * (2 - progress);
                    songPreviewEl.scrollTop = currentScroll + (targetScroll - currentScroll) * ease;
                    if (progress < 1 && !isUserScrolling) {
                        requestAnimationFrame(animateScroll);
                    }
                }
                requestAnimationFrame(animateScroll);
            }, autoScrollSpeed);
        }
    
        function toggleAutoScroll() {
            const autoScrollButton = document.getElementById('toggleAutoScroll');
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
                isAutoScrollEnabled = false;
                if (autoScrollButton) {
                    autoScrollButton.innerHTML = '<i class="fas fa-play"></i>';
                    autoScrollButton.classList.remove('active');
                }
            } else {
                startAutoScroll('down');
                if (autoScrollButton) {
                    autoScrollButton.innerHTML = '<i class="fas fa-pause"></i>';
                    autoScrollButton.classList.add('active');
                }
            }
        }
    
        function handleUserScroll() {
            isUserScrolling = true;
            // Do NOT stop auto-scroll here!
            setTimeout(() => {
                isUserScrolling = false;
            }, 1000);
        }
    
        function addToSpecificSetlist(songId, setlistId) {
            if (!jwtToken) {
                showNotification('Please login to add songs to your setlist.');
                return;
            }
            
            // Check if user has permission to modify global setlists
            if (setlistId.startsWith('global_') && (!currentUser || !currentUser.isAdmin)) {
                showNotification('❌ Access denied: Only administrators can modify Global Setlists', 'error');
                return;
            }
            
            const song = songs.find(s => s.id === songId);
            if (!song) {
                console.error('Song not found:', songId);
                return;
            }

            // Check for duplicates in current setlist
            const isGlobal = setlistId.startsWith('global_');
            const setlistArray = isGlobal ? globalSetlists : mySetlists;
            const targetSetlist = setlistArray.find(s => s._id === setlistId);
            
            if (targetSetlist && targetSetlist.songs) {
                // Check if song is already in setlist
                const isDuplicate = targetSetlist.songs.some(existingSong => {
                    const existingSongId = typeof existingSong === 'object' ? 
                        existingSong.id : existingSong;
                    return existingSongId === songId;
                });
                
                if (isDuplicate) {
                    showNotification(`"${song.title}" is already in this setlist`);
                    return;
                }
            }

            // Determine if this is a global setlist or personal setlist
            let apiEndpoint;
            
            if (setlistId.startsWith('global_')) {
                apiEndpoint = `${API_BASE_URL}/api/global-setlists/add-song`;
            } else if (setlistId.startsWith('my_')) {
                apiEndpoint = `${API_BASE_URL}/api/my-setlists/add-song`;
            } else {
                console.error('Unknown setlist type:', setlistId);
                return;
            }

            // Make API call to add song to the specific setlist
            console.log('🔄 Adding song to setlist:', { apiEndpoint, setlistId, songId: song.id, API_BASE_URL });
            fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`
                },
                body: JSON.stringify({
                    setlistId: setlistId.replace(/^(global_|my_)/, ''), // Remove prefix for API
                    songId: song.id  // Send just the song ID, not the full song object
                })
            })
            .then(response => {
                console.log('📡 Add song response:', { status: response.status, statusText: response.statusText, url: response.url });
                if (response.status === 403) {
                    throw new Error('FORBIDDEN_ACCESS');
                }
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    const selectedDropdown = document.getElementById('setlistDropdown');
                    const selectedOption = selectedDropdown ? selectedDropdown.selectedOptions[0] : null;
                    const setlistName = selectedOption ? selectedOption.text : 'setlist';
                    showNotification(`"${song.title}" added to ${setlistName}`);
                    
                    // Refresh setlist data and update all buttons
                    refreshSetlistDataOnly().then(() => {
                        updateAllSetlistButtonStates();
                    }).catch(() => {
                        // Even if refresh fails, try to update button states
                        updateAllSetlistButtonStates();
                    });
                } else {
                    showNotification('Failed to add song to setlist');
                    console.error('Failed to add song to setlist:', data.error);
                }
            })
            .catch(error => {
                if (error.message === 'FORBIDDEN_ACCESS') {
                    showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
                } else {
                    showNotification('❌ Error adding song to setlist', 'error');
                }
                console.error('Error adding song to setlist:', error);
            });
        }

        function removeFromSpecificSetlist(songId, setlistId) {
            if (!jwtToken) {
                showNotification('Please login to remove songs from your setlist.');
                return;
            }
            
            const song = songs.find(s => s.id === songId);
            if (!song) {
                console.error('Song not found:', songId);
                return;
            }

            let apiEndpoint;
            if (setlistId.startsWith('global_')) {
                apiEndpoint = `${API_BASE_URL}/api/global-setlists/remove-song`;
                setlistId = setlistId.replace('global_', '');
            } else if (setlistId.startsWith('my_')) {
                apiEndpoint = `${API_BASE_URL}/api/my-setlists/remove-song`;
                setlistId = setlistId.replace('my_', '');
            } else {
                console.error('Unknown setlist type:', setlistId);
                return;
            }


            console.log('🔄 Removing song from setlist:', { apiEndpoint, setlistId, songId, API_BASE_URL });
            fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwtToken}`
                },
                body: JSON.stringify({
                    setlistId: setlistId.replace(/^(global_|my_)/, ''), // Remove prefix for API
                    songId: songId
                })
            })
            .then(response => {
                console.log('📡 Remove song response:', { status: response.status, statusText: response.statusText, url: response.url });
                if (response.status === 403) {
                    throw new Error('FORBIDDEN_ACCESS');
                }
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    const selectedDropdown = document.getElementById('setlistDropdown');
                    const selectedOption = selectedDropdown ? selectedDropdown.selectedOptions[0] : null;
                    const setlistName = selectedOption ? selectedOption.text : 'setlist';
                    showNotification(`"${song.title}" removed from ${setlistName}`);
                    showNotification(`"${song.title}" removed from ${setlistName}`);
                    
                    // Refresh setlist data and update all buttons
                    refreshSetlistDataOnly().then(() => {
                        updateAllSetlistButtonStates();
                    }).catch(() => {
                        // Even if refresh fails, try to update button states
                        updateAllSetlistButtonStates();
                    });
                } else {
                    showNotification('Failed to remove song from setlist');
                    console.error('Failed to remove song from setlist:', data.error);
                }
            })
            .catch(error => {
                if (error.message === 'FORBIDDEN_ACCESS') {
                    showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
                } else {
                    showNotification('❌ Error removing song from setlist', 'error');
                }
                console.error('Error removing song from setlist:', error);
            });
        }

        function checkSongInSetlistAndToggle(songId, setlistId) {
            if (!setlistId) {
                showNotification('Please select a setlist first');
                return;
            }
            
            // Check if the song is currently in the setlist
            const isInSetlist = isSongInCurrentSetlist(songId, setlistId);
            
            if (isInSetlist) {
                // Song is in setlist, so remove it
                removeFromSpecificSetlist(songId, setlistId);
            } else {
                // Song is not in setlist, so add it
                addToSpecificSetlist(songId, setlistId);
            }
        }

        // Helper function to check if a song is in the current setlist
        function isSongInCurrentSetlist(songId, setlistId) {
            let currentSetlist = null;
            
            // Find the selected setlist in our data
            if (setlistId.startsWith('global_')) {
                const actualId = setlistId.replace('global_', '');
                currentSetlist = globalSetlists.find(s => s._id === actualId);
            } else if (setlistId.startsWith('my_')) {
                const actualId = setlistId.replace('my_', '');
                currentSetlist = mySetlists.find(s => s._id === actualId);
            }
            
            if (!currentSetlist || !currentSetlist.songs) {
                return false; // No setlist found or no songs data
            }
            
            // Check if this song is in the current setlist
            const isInSetlist = currentSetlist.songs.some(setlistSong => {
                // Handle both ID-only format and full song object format
                if (typeof setlistSong === 'object' && setlistSong.id) {
                    return parseInt(setlistSong.id) === parseInt(songId);
                } else {
                    return parseInt(setlistSong) === parseInt(songId);
                }
            });
            
            return isInSetlist;
        }

        function updateSetlistButtonState(songId, isInSetlist) {
            // Update preview setlist buttons in song cards
            const songCards = document.querySelectorAll('.song-card');
            songCards.forEach(card => {
                const cardSongId = card.querySelector('.song-title')?.textContent;
                const song = songs.find(s => s.title === cardSongId);
                if (song && song.id === songId) {
                    const previewSetlistBtn = card.querySelector('.preview-setlist-btn');
                    if (previewSetlistBtn) {
                        if (isInSetlist) {
                            previewSetlistBtn.textContent = 'Remove from Setlist';
                            previewSetlistBtn.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
                        } else {
                            previewSetlistBtn.textContent = 'Add to Setlist';
                            previewSetlistBtn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
                        }
                    }
                }
            });
            
            // Update preview modal setlist button if the preview is open for this song
            const songPreviewEl = document.getElementById('songPreview');
            if (songPreviewEl && songPreviewEl.dataset.songId) {
                const previewSongId = parseInt(songPreviewEl.dataset.songId);
                if (previewSongId === songId) {
                    const previewSetlistBtn = document.getElementById('previewSetlistBtn');
                    if (previewSetlistBtn) {
                        const icon = previewSetlistBtn.querySelector('i');
                        const span = previewSetlistBtn.querySelector('span');
                        
                        // Remove existing state classes and add new ones
                        previewSetlistBtn.className = 'preview-action-btn preview-setlist-btn';
                        
                        if (isInSetlist) {
                            previewSetlistBtn.classList.add('remove');
                            if (icon) icon.className = 'fas fa-check';
                            if (span) span.textContent = 'In Setlist';
                        } else {
                            previewSetlistBtn.classList.add('add');
                            if (icon) icon.className = 'fas fa-plus';
                            if (span) span.textContent = 'Add to Setlist';
                        }
                    }
                }
            }
            
            // Update main song action buttons in the song list
            const songItems = document.querySelectorAll('.song-item');
            songItems.forEach(item => {
                const itemSongId = parseInt(item.dataset.songId);
                if (itemSongId === songId) {
                    // Handle both old setlist-btn and new toggle-setlist buttons
                    const setlistBtn = item.querySelector('.setlist-btn') || item.querySelector('.toggle-setlist');
                    if (setlistBtn) {
                        if (isInSetlist) {
                            setlistBtn.textContent = 'Remove';
                            if (setlistBtn.classList.contains('toggle-setlist')) {
                                setlistBtn.className = 'btn btn-delete toggle-setlist';
                            } else {
                                setlistBtn.className = 'setlist-btn remove-from-setlist';
                            }
                        } else {
                            setlistBtn.textContent = 'Add';
                            if (setlistBtn.classList.contains('toggle-setlist')) {
                                setlistBtn.className = 'btn btn-primary toggle-setlist';
                            } else {
                                setlistBtn.className = 'setlist-btn add-to-setlist';
                            }
                        }
                    }
                }
            });
        }

        function removeFromCurrentSetlist(songId) {
            // Get the currently selected setlist from the dropdown
            const setlistDropdown = document.getElementById('setlistDropdown');
            if (!setlistDropdown || !setlistDropdown.value) {
                showNotification('No setlist selected');
                return;
            }
            
            const selectedSetlistId = setlistDropdown.value;
            
            // Use the new setlist system's remove function
            removeFromSpecificSetlist(songId, selectedSetlistId);
        }
    
        function updatePreviewSetlistButton(isInSetlist) {
            const previewBtn = document.getElementById('previewSetlistBtn');
            if (!previewBtn) return; // Exit if button doesn't exist
            
            const icon = previewBtn.querySelector('i');
            const span = previewBtn.querySelector('span');
            
            // Remove all existing classes and add base classes
            previewBtn.className = 'preview-action-btn preview-setlist-btn';
            
            if (isInSetlist) {
                previewBtn.classList.add('remove');
                if (icon) icon.className = 'fas fa-minus';
                if (span) span.textContent = 'Remove from Setlist';
            } else {
                previewBtn.classList.add('add');
                if (icon) icon.className = 'fas fa-plus';
                if (span) span.textContent = 'Add to Setlist';
            }
            
            // Force a reflow to ensure styles are applied
            previewBtn.offsetHeight;
        }
    
        function toggleFavorite(id) {
            if (!jwtToken) {
                showNotification('Please login to add songs to your pw_favorites.');
                return;
            }
            const index = pw_favorites.indexOf(id);
            const song = songs.find(s => s.id === id);
            let nowFavorite;
            if (index === -1) {
                pw_favorites.push(id);
                nowFavorite = true;
            } else {
                pw_favorites.splice(index, 1);
                nowFavorite = false;
            }
            showNotification(`"${song.title}" ${nowFavorite ? 'added to' : 'removed from'} pw_favorites`);
            queueSaveUserData();
            const favButtons = document.querySelectorAll(`.favorite-btn[data-song-id="${id}"]`);
            favButtons.forEach(btn => {
                btn.classList.toggle('favorited', nowFavorite);
            });
            if (songPreviewEl.dataset.songId == id) {
                const previewBtn = document.getElementById('previewFavoriteBtn');
                if (previewBtn) {
                    previewBtn.classList.toggle('favorited', nowFavorite);
                }
            }
        }
    
        function updateSetlistButton(songId, isInSetlist) {
            const songItem = document.querySelector(`.song-item[data-song-id="${songId}"]`);
            if (songItem) {
                const btn = songItem.querySelector('.toggle-setlist');
                if (btn) {
                    btn.textContent = isInSetlist ? 'Remove' : 'Add';
                    btn.classList.toggle('btn-primary', !isInSetlist);
                    btn.classList.toggle('btn-delete', isInSetlist);
                }
            }
        }
    
        function redrawPreviewOnThemeChange() {
            if (songPreviewEl.dataset.songId) {
                try {
                    const currentLevel = parseInt(document.getElementById('transpose-level')?.textContent) || 0;
                    const currentSong = songs.find(song => song.id == songPreviewEl.dataset.songId);
                    if (currentSong) {
                        const preservedContext = songPreviewEl.dataset.openingContext || resolvePreviewContextFromCurrentView('all-songs');
                        showPreview(currentSong, false, preservedContext);
                        updatePreviewWithTransposition(currentLevel);
                    }
                } catch (e) {
                    console.error("Error redrawing preview:", e);
                }
            }
        }

        function openModal(modal) {
        // Close any existing modal first
            if (currentModal) {
                closeModal(currentModal);
            }
            
            modal.style.display = 'flex';
            currentModal = modal;
            document.body.style.overflow = 'hidden';
            
            // Add to history to handle back button
            history.pushState({ modalOpen: true }, '');
        }

        function closeModal(modal) {
            modal.style.display = 'none';
            currentModal = null;
            document.body.style.overflow = '';
            
            // Clear multiselect selections when closing add song modal
            if (modal.id === 'addSongModal') {
                // Clear DOM-based selections for mood and artist multiselects
                document.querySelectorAll('#moodDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                document.querySelectorAll('#artistDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                // Update displays
                updateSelectedMoods('selectedMoods', 'moodDropdown');
                updateSelectedArtists('selectedArtists', 'artistDropdown');
                // Clear genre multiselect
                const genreSelectedContainer = document.getElementById('selectedGenres');
                if (genreSelectedContainer) {
                    genreSelectedContainer.innerHTML = '';
                }
            }
            
            // Update history if we're closing via back button
            if (history.state?.modalOpen) {
                history.back();
            }
        }

        function setupWindowCloseConfirmation() {
        // Removed beforeunload confirmation popup as requested
        }

        function setupModals() {
            document.querySelectorAll('.modal').forEach(modal => {
                // Only keep the close button functionality
                modal.querySelectorAll('.close-modal').forEach(btn => {
                    btn.addEventListener('click', () => closeModal(modal));
                });
            });
            
            // Keep the escape key functionality
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && currentModal) {
                    closeModal(currentModal);
                }
            });
        }
        
        function setupSmartSetlistHandlers() {
            // Add Smart Setlist button handler
            const addSmartSetlistBtn = document.getElementById('addSmartSetlistBtn');
            if (addSmartSetlistBtn) {
                addSmartSetlistBtn.addEventListener('click', () => {
                    const modal = document.getElementById('smartSetlistModal');
                    if (modal) {
                        // Reset form
                        document.getElementById('smartSetlistForm').reset();
                        document.getElementById('smartSetlistId').value = '';
                        document.getElementById('smartSetlistModalTitle').textContent = 'Create Smart Setlist';
                        const smartSubmitBtn = document.getElementById('smartSetlistSubmit');
                        if (smartSubmitBtn) smartSubmitBtn.textContent = 'Create Smart Setlist';
                        document.getElementById('smartSongsResults').style.display = 'none';
                        document.getElementById('scanResults').style.display = 'none';
                        window.smartSetlistScanResults = [];
                        
                        // Initialize multiselects
                        initializeSmartSetlistMultiselects();
                        
                        // Show modal
                        modal.style.display = 'flex';
                        currentModal = modal;
                    }
                });
            }
            
            // Scan Songs button handler
            const scanSongsBtn = document.getElementById('scanSongsBtn');
            if (scanSongsBtn && !scanSongsBtn._scanListenerAttached) {
                scanSongsBtn._scanListenerAttached = true;
                scanSongsBtn.addEventListener('click', async function() {
                    try {
                        const results = await scanSongsForSmartSetlist();
                        window.smartSetlistScanResults = results;
                    } catch (error) {
                        console.error('Error scanning songs:', error);
                        showNotification('Error scanning songs. Please try again.');
                    }
                });
            }
            
            // Smart Setlist form submission
            const smartSetlistForm = document.getElementById('smartSetlistForm');
            if (smartSetlistForm && !smartSetlistForm._submitListenerAttached) {
                smartSetlistForm._submitListenerAttached = true;
                smartSetlistForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const name = document.getElementById('smartSetlistName').value.trim();
                    const description = document.getElementById('smartSetlistDescription').value.trim();
                    const smartSetlistId = document.getElementById('smartSetlistId').value.trim();
                    
                    if (!name) {
                        showNotification('Please enter a name for the smart setlist');
                        return;
                    }
                    
                    const conditions = getSmartSetlistConditions();
                    if (!window.smartSetlistScanResults || window.smartSetlistScanResults.length === 0) {
                        window.smartSetlistScanResults = getSongsMatchingSmartConditions(conditions);
                    }
                    
                    if (!window.smartSetlistScanResults || window.smartSetlistScanResults.length === 0) {
                        showNotification('No songs match the selected smart conditions', 'error');
                        return;
                    }
                    
                    const formData = {
                        name,
                        description,
                        conditions,
                        songs: window.smartSetlistScanResults
                    };
                    
                    await createSmartSetlistWithSongs(formData, smartSetlistId || null);
                });
            }
            
            // Keep smart setlist button visibility in sync with login and folder state.
            // The primary header toggle listener handles expand/collapse behavior.
            const smartSetlistContent = document.getElementById('smartSetlistContent');
            if (smartSetlistContent && addSmartSetlistBtn) {
                const isLoggedIn = !!localStorage.getItem('pw_jwtToken');
                const isVisible = smartSetlistContent.style.display === 'block';
                addSmartSetlistBtn.style.display = (isVisible && isLoggedIn) ? 'block' : 'none';
            }
        }
    
        function editSong(id) {
            const song = songs.find(s => s.id === id || s.id === id);
            if (!song) return;
            document.getElementById('editSongId').value = Number(song.id);
            document.getElementById('editSongTitle').value = song.title;
            document.getElementById('editSongCategory').value = song.category;
            document.getElementById('editSongKey').value = song.key;
            
            // Handle multiselect artist field
            const artists = song.artistDetails ? song.artistDetails.split(',').map(a => a.trim()).filter(a => a) : [];
            setupArtistMultiselect('editSongArtist', 'editArtistDropdown', 'editSelectedArtists');
            // Initialize the Set with existing artists
            const editArtistDropdown = document.getElementById('editArtistDropdown');
            if (editArtistDropdown) {
                editArtistDropdown._artistSelections = new Set(artists);
                updateSelectedArtists('editSelectedArtists', 'editArtistDropdown');
            }
            
            // Handle multiselect mood field
            const moods = song.mood ? song.mood.split(',').map(m => m.trim()).filter(m => m) : [];
            setupMoodMultiselect('editSongMood', 'editMoodDropdown', 'editSelectedMoods');
            // Initialize the Set with existing moods
            const editMoodDropdown = document.getElementById('editMoodDropdown');
            if (editMoodDropdown) {
                editMoodDropdown._moodSelections = new Set(moods);
                updateSelectedMoods('editSelectedMoods', 'editMoodDropdown');
            }
            
            document.getElementById('editSongTempo').value = song.tempo;
            document.getElementById('editSongTime').value = song.time || song.timeSignature;
            // Populate Taal dropdown with correct options for the song's time signature and select the song's taal
            updateTaalDropdown('editSongTime', 'editSongTaal', song.taal);

            const knownRhythmFamilies = Array.from(new Set([
                ...PW_TAALS,
                ...((loadRhythmSets._cache || []).map(item => String(item?.rhythmFamily || '').trim()).filter(Boolean)),
                String(song.rhythmFamily || '').trim()
            ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
            populateRhythmFamilyDropdown('editSongRhythmFamily', knownRhythmFamilies);
            populateRhythmCategoryDropdown('editSongRhythmCategory');

            const editRhythmFamily = String(song.rhythmFamily || '').trim();
            const rhythmSetNoFromSong = parseInt(song.rhythmSetNo, 10);
            const rhythmSetNoFromIdMatch = String(song.rhythmSetId || '').match(/_(\d+)$/);
            const editRhythmSetNo = Number.isInteger(rhythmSetNoFromSong) && rhythmSetNoFromSong > 0
                ? rhythmSetNoFromSong
                : (rhythmSetNoFromIdMatch ? parseInt(rhythmSetNoFromIdMatch[1], 10) : '');

            const editRhythmFamilyEl = document.getElementById('editSongRhythmFamily');
            const editRhythmSetNoEl = document.getElementById('editSongRhythmSetNo');
            const editRhythmCategoryEl = document.getElementById('editSongRhythmCategory');
            const editRhythmSetIdPreviewEl = document.getElementById('editSongRhythmSetIdPreview');
            if (editRhythmFamilyEl) editRhythmFamilyEl.value = editRhythmFamily;
            if (editRhythmSetNoEl) editRhythmSetNoEl.value = editRhythmSetNo || '';
            if (editRhythmCategoryEl) {
                editRhythmCategoryEl.value = normalizeRhythmCategoryValue(song.rhythmCategory || '');
            }
            updateRhythmSetIdPreview('editSongRhythmFamily', 'editSongRhythmSetNo', 'editSongRhythmSetIdPreview');
            if (editRhythmSetIdPreviewEl && !editRhythmSetIdPreviewEl.value && song.rhythmSetId) {
                editRhythmSetIdPreviewEl.value = song.rhythmSetId;
            }

            // Render correct genre options for multiselect
            renderGenreOptions('editGenreDropdown');
            setupGenreMultiselect('editSongGenre', 'editGenreDropdown', 'editSelectedGenres');
            
            // Set selected genres using the Set-based approach
            const genres = song.genres || (song.genre ? [song.genre] : []);
            const editGenreDropdown = document.getElementById('editGenreDropdown');
            if (editGenreDropdown && editGenreDropdown._genreSelections) {
                // Clear existing selections
                editGenreDropdown._genreSelections.clear();
                // Add current song's genres to the Set
                genres.forEach(genre => {
                    editGenreDropdown._genreSelections.add(genre);
                });
                // Update the display
                updateSelectedGenres('editSelectedGenres', 'editGenreDropdown');
                // Re-render the options with current selections
                renderGenreOptionsWithSelections('editGenreDropdown', PW_GENRES, editGenreDropdown._genreSelections);
            }
            document.getElementById('editSongLyrics').value = song.lyrics;
            editSongModal.style.display = 'flex';
            const editModalContent = editSongModal.querySelector('.modal-content');
            if (editModalContent) editModalContent.scrollTop = 0;
        }
    
        function openDeleteSongModal(id) {
            const song = songs.find(s => s.id === Number(id));
            if (!song) return;
            document.getElementById('deleteSongId').value = Number(song.id);
            document.getElementById('deleteSongTitle').textContent = song.title;
            deleteSongModal.style.display = 'flex';
        }

        function getCurrentSongList() {
            if (deleteSection.style.display === 'block') {
                return songs.slice().sort((a, b) => a.title.localeCompare(b.title));
            } else if (favoritesSection.style.display === 'block') {
                return songs.filter(song => pw_favorites.includes(song.id));
            } else if (setlistSection.style.display === 'block') {
                // Use dropdown-based setlist system
                const setlistDropdown = document.getElementById('setlistDropdown');
                if (setlistDropdown && setlistDropdown.value !== '') {
                    const [type, setlistId] = setlistDropdown.value.split('_');
                    const setlists = type === 'global' ? globalSetlists : mySetlists;
                    const setlist = setlists.find(s => s._id === setlistId);
                    if (setlist && setlist.songs) {
                        return setlist.songs.map(songId => {
                            return songs.find(s => s.id === songId);
                        }).filter(Boolean);
                    }
                }
                return [];
            } else {
                // Regular song list view with filters applied
                const category = PraiseTab.classList.contains('active') ? 'Praise' : 'Worship';
                const keyFilterValue = keyFilter.value;
                const genreFilterValue = genreFilter.value;
                
                return songs
                    .filter(song => song.category === category)
                    .filter(song => keyFilterValue === "" || song.key === keyFilterValue)
                    .filter(song => {
                        if (!genreFilterValue) return true;
                        if (!song.genres) return song.genre === genreFilterValue;
                        return song.genres.includes(genreFilterValue);
                    })
                    .sort((a, b) => a.title.localeCompare(b.title));
            }
        }

        function saveSettings() {
            const newHeader = document.getElementById("sidebarHeaderInput").value;
            const newSetlist = document.getElementById("setlistTextInput").value;
            const sidebarWidth = document.getElementById("panelWidthInput").value;
            const songsPanelWidth = document.getElementById("panelWidthInput").value;
            const previewMargin = document.getElementById("previewMarginInput").value;
            const newAutoScrollSpeed = document.getElementById("autoScrollSpeedInput").value;
            const toggleButtonsVisibilityEl = document.getElementById("toggleButtonsVisibility");
            const toggleButtonsVisibility = normalizeToggleButtonsVisibility(toggleButtonsVisibilityEl ? toggleButtonsVisibilityEl.value : "hide");
            const previewLyricsSizeEl = document.getElementById("previewLyricsSize");
            const previewLyricsSize = normalizePreviewLyricsSize(previewLyricsSizeEl ? previewLyricsSizeEl.value : "up-2");

            document.querySelector(".sidebar-header h2").textContent = newHeader;

            document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}%`);
            document.documentElement.style.setProperty('--songs-panel-width', `${songsPanelWidth}%`);
            document.documentElement.style.setProperty('--preview-margin-left', `${previewMargin}px`);

            localStorage.setItem("sidebarHeader", newHeader);
            localStorage.setItem("setlistText", newSetlist);
            localStorage.setItem("sidebarWidth", sidebarWidth);
            localStorage.setItem("songsPanelWidth", songsPanelWidth);
            localStorage.setItem("previewMargin", previewMargin);
            localStorage.setItem("autoScrollSpeed", newAutoScrollSpeed);
            localStorage.setItem("toggleButtonsVisibility", toggleButtonsVisibility);
            localStorage.setItem("previewLyricsSize", previewLyricsSize);
            autoScrollSpeed = parseInt(newAutoScrollSpeed);

            applyToggleButtonsVisibility(toggleButtonsVisibility);
            applyPreviewLyricsSize(previewLyricsSize);
        }
    
        function addEventListeners() {
            // Live update for weights total bar
            function updateWeightsTotalBar() {
                const vals = [
                    parseInt(document.getElementById('weightLanguage').value) || 0,
                    parseInt(document.getElementById('weightScale').value) || 0,
                    parseInt(document.getElementById('weightTimeSignature').value) || 0,
                    parseInt(document.getElementById('weightTaal').value) || 0,
                    parseInt(document.getElementById('weightTempo').value) || 0,
                    parseInt(document.getElementById('weightGenre').value) || 0,
                    parseInt(document.getElementById('weightVocal').value) || 0,
                    parseInt(document.getElementById('weightMood').value) || 0,
                    parseInt(document.getElementById('weightRhythmCategory').value) || 0
                ];
                const total = vals.reduce((a, b) => a + b, 0);
                const bar = document.getElementById('weightsTotalBar');
                bar.textContent = `Total: ${total} / 100`;
                bar.style.color = (total === 100) ? '#27ae60' : '#e74c3c';
            }
            [
                'weightLanguage',
                'weightScale',
                'weightTimeSignature',
                'weightTaal',
                'weightTempo',
                'weightGenre',
                'weightVocal',
                'weightMood',
                'weightRhythmCategory'
            ].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', updateWeightsTotalBar);
            });
            // Call once on tab open
            if (document.getElementById('weightsTabContent')) {
                document.getElementById('weightsTab').addEventListener('click', updateWeightsTotalBar);
            }
            // Admin tab switching is handled centrally in setupAdminPanelEventHandlers().

            

            // Save weights form
            const weightsForm = document.getElementById('weightsForm');
            if (weightsForm) {
                if (weightsForm._submitListener) {
                    weightsForm.removeEventListener('submit', weightsForm._submitListener);
                }
                
                weightsForm._submitListener = async function(e) {
                    e.preventDefault();
                    const newWeights = {
                        language: parseInt(document.getElementById('weightLanguage').value),
                        scale: parseInt(document.getElementById('weightScale').value),
                        timeSignature: parseInt(document.getElementById('weightTimeSignature').value),
                        taal: parseInt(document.getElementById('weightTaal').value),
                        tempo: parseInt(document.getElementById('weightTempo').value),
                        genre: parseInt(document.getElementById('weightGenre').value),
                        vocal: parseInt(document.getElementById('weightVocal').value),
                        mood: parseInt(document.getElementById('weightMood').value),
                        rhythmCategory: parseInt(document.getElementById('weightRhythmCategory').value)
                    };
                    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
                    const notif = document.getElementById('weightsNotification');
                    if (total !== 100) {
                        notif.textContent = 'Total must be 100.';
                        notif.style.display = 'block';
                        notif.style.background = '#ffe0e0';
                        notif.style.color = '#b30000';
                        return;
                    }
                    notif.textContent = 'Saving...';
                    notif.style.display = 'block';
                    notif.style.background = '';
                    notif.style.color = '';
                    const result = await saveRecommendationWeightsToBackend(newWeights);
                    if (result.success) {
                        notif.textContent = 'Weights saved successfully!';
                        notif.style.background = '#e0ffe0';
                        notif.style.color = '#155724';
                    } else {
                        notif.textContent = result.message;
                        notif.style.background = '#ffe0e0';
                        notif.style.color = '#b30000';
                    }
                    notif.style.display = 'block';
                    // Scroll modal to top for visibility
                    const modalContent = notif.closest('.modal-content');
                    if (modalContent) modalContent.scrollTop = 0;
                    setTimeout(() => {
                        notif.style.display = 'none';
                    }, 4000);
                };
                
                weightsForm.addEventListener('submit', weightsForm._submitListener);
            }

            // Tab switching
            PraiseTab.addEventListener('click', () => {
                setlistSection.style.display = 'none';
                if (setlistSectionActions) setlistSectionActions.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'none';
                PraiseTab.classList.add('active');
                WorshipTab.classList.remove('active');
                PraiseContent.classList.add('active');
                WorshipContent.classList.remove('active');
                debouncedRenderSongs('Praise', keyFilter.value, genreFilter.value);
                applyLyricsBackground(true);
                
                // Mobile view: show songs panel and hide sidebar
                if (window.innerWidth <= 768) {
                    document.querySelector('.songs-section').classList.remove('hidden');
                    document.querySelector('.sidebar').classList.add('hidden');
                    document.querySelector('.preview-section').classList.remove('full-width');
                }
            });

    
            WorshipTab.addEventListener('click', () => {
                setlistSection.style.display = 'none';
                if (setlistSectionActions) setlistSectionActions.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'none';
                WorshipTab.classList.add('active');
                PraiseTab.classList.remove('active');
                WorshipContent.classList.add('active');
                PraiseContent.classList.remove('active');
                debouncedRenderSongs('Worship', keyFilter.value, genreFilter.value);
                applyLyricsBackground(false);
                
                // Mobile view: show songs panel and hide sidebar
                if (window.innerWidth <= 768) {
                    document.querySelector('.songs-section').classList.remove('hidden');
                    document.querySelector('.sidebar').classList.add('hidden');
                    document.querySelector('.preview-section').classList.remove('full-width');
                }
            });
    
            // Filter changes
            keyFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (PraiseTab.classList.contains('active')) {
                    debouncedRenderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            genreFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (PraiseTab.classList.contains('active')) {
                    debouncedRenderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            moodFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (PraiseTab.classList.contains('active')) {
                    debouncedRenderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            artistFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (PraiseTab.classList.contains('active')) {
                    debouncedRenderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            // Setlist dropdown functionality
            const setlistDropdown = document.getElementById('setlistDropdown');
            
            // Handle setlist selection
            if (setlistDropdown) {
                setlistDropdown.addEventListener('change', (e) => {
                    // Prevent infinite loop when updating from folder navigation
                    if (window.updatingFromFolderNav) {
                        return;
                    }
                    
                    const selectedValue = e.target.value;
                    
                    // Show/hide setlist description
                    showDropdownSetlistDescription(selectedValue);
                    
                    // Store the selection in localStorage for persistence
                    if (selectedValue) {
                        localStorage.setItem('selectedSetlist', selectedValue);
                        localStorage.setItem('pw_selectedSetlist', selectedValue);
                        // Add visual feedback for selected setlist
                        updateSetlistDropdownStyle(true);
                        // Show notification about which setlist is now active
                        const selectedOption = e.target.selectedOptions[0];
                        if (selectedOption) {
                            showNotification(`Active setlist: ${selectedOption.text}`);
                        }
                        
                        // Update all setlist button states based on the new selection
                        updateAllSetlistButtonStates();
                        
                        // Re-render songs to update button states in the UI
                        const activeTab = document.getElementById('PraiseTab').classList.contains('active') ? 'Praise' : 'Worship';
                        const keyFilter = document.getElementById('keyFilter');
                        const genreFilter = document.getElementById('genreFilter');
                        const moodFilter = document.getElementById('moodFilter'); 
                        const artistFilter = document.getElementById('artistFilter');
                        
                        renderSongs(activeTab, 
                            keyFilter?.value || '', 
                            genreFilter?.value || '', 
                            moodFilter?.value || '', 
                            artistFilter?.value || ''
                        );
                    } else {
                        localStorage.removeItem('selectedSetlist');
                        localStorage.removeItem('pw_selectedSetlist');
                        updateSetlistDropdownStyle(false);
                        
                        // Reset setlist header to default text
                        const setlistHeader = document.getElementById('setlistViewHeader');
                        if (setlistHeader) {
                            setlistHeader.textContent = 'Setlist View';
                        }
                    }
                    
                    if (!selectedValue) {
                        // User explicitly selected "Select a Setlist" - return to normal view
                        showAllEl.click();
                        return;
                    }
                    
                    const [type, id] = selectedValue.split('_');
                    
                    if (type === 'global') {
                        showGlobalSetlistInMainSection(id);
                    } else if (type === 'my') {
                        showMySetlistInMainSection(id);
                    } else if (type === 'smart') {
                        showSmartSetlistInMainSection(id);
                    }
                });
                
                // Restore previous selection from localStorage on page load
                const savedSelection = localStorage.getItem('pw_selectedSetlist');
                if (savedSelection) {
                    // Wait a bit for the dropdown to be populated, then restore selection
                    setTimeout(() => {
                        const optionExists = Array.from(setlistDropdown.options).some(option => option.value === savedSelection);
                        if (optionExists) {
                            setlistDropdown.value = savedSelection;
                            updateSetlistDropdownStyle(true);
                            
                            // Show description for the restored selection
                            showDropdownSetlistDescription(savedSelection);
                            
                            // Auto-load the setlist if it was previously selected
                            const [type, id] = savedSelection.split('_');
                            if (type === 'global') {
                                showGlobalSetlistInMainSection(id);
                            } else if (type === 'my') {
                                showMySetlistInMainSection(id);
                            } else if (type === 'smart') {
                                showSmartSetlistInMainSection(id);
                            }
                        }
                    }, 100);
                }
            }

            showAllEl.addEventListener('click', (e) => {
                e.preventDefault();
                PraiseContent.classList.add('active');
                WorshipContent.classList.remove('active');
                setlistSection.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'none';
                
                // Reset setlist header to default text
                const setlistHeader = document.getElementById('setlistViewHeader');
                if (setlistHeader) {
                    setlistHeader.textContent = 'Setlist View';
                }
                
                renderSongs('Praise', keyFilter.value, genreFilter.value);
                document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
                e.target.classList.add('active');
                
                // Hide setlist descriptions from sidebar
                hideSetlistDescription('global');
                hideSetlistDescription('my');
                hideSetlistDescription('smart');
                
                // Keep the setlist dropdown selection - don't reset it
                // The user can manually select "Select a Setlist" if they want to clear it
                
                applyLyricsBackground(true);
                
                // Mobile view: show songs panel and hide sidebar
                if (window.innerWidth <= 768) {
                    const songsSection = document.querySelector('.songs-section');
                    const sidebar = document.querySelector('.sidebar');
                    const previewSection = document.querySelector('.preview-section');
                    if (songsSection) songsSection.classList.remove('hidden');
                    if (sidebar) sidebar.classList.add('hidden');
                    if (previewSection) previewSection.classList.remove('full-width');
                }
            });

    
            showFavoritesEl.addEventListener('click', (e) => {
                e.preventDefault();
                PraiseContent.classList.remove('active');
                WorshipContent.classList.remove('active');
                setlistSection.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'block';
                renderFavorites();
                document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
                e.target.classList.add('active');
                
                // Mobile view: show songs panel and hide sidebar
                if (window.innerWidth <= 768) {
                    document.querySelector('.songs-section').classList.remove('hidden');
                    document.querySelector('.sidebar').classList.add('hidden');
                    document.querySelector('.preview-section').classList.remove('full-width');
                }
            });
    
            // Legacy setlist tab switching removed - using dropdown-based system now
          
            let touchStartX = 0;
            let isScrolling = false;

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                
                if (e.key === 'ArrowRight') {
                } else if (e.key === 'ArrowLeft') {
                }

                document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    return;
                }
                
                if (!songPreviewEl.dataset.songId) return;
                
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                }
            });
        });
    
            // Song modals
            openAddSongModal.addEventListener('click', () => {
                addSongModal.style.display = 'flex';
                const addModalContent = addSongModal.querySelector('.modal-content');
                if (addModalContent) addModalContent.scrollTop = 0;
                document.getElementById('selectedGenres').innerHTML = '';
                document.querySelectorAll('#genreDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                hydrateRhythmFamilies().catch(() => {});
                const addRhythmFamily = document.getElementById('songRhythmFamily');
                const addRhythmSetNo = document.getElementById('songRhythmSetNo');
                const addRhythmCategory = document.getElementById('songRhythmCategory');
                if (addRhythmFamily) addRhythmFamily.value = '';
                if (addRhythmSetNo) addRhythmSetNo.value = '';
                if (addRhythmCategory) addRhythmCategory.value = '';
                updateRhythmSetIdPreview('songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview');
            });
    
            document.querySelectorAll('.close-modal').forEach(button => {
                button.addEventListener('click', () => {
                    button.closest('.modal').style.display = 'none';
                });
            });
    

            
            document.getElementById('editSongGenre').addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('editGenreDropdown').classList.toggle('show');
            });
            

                        // Handle session reset based on settings

            // Disabled automatic reset on refresh/close to prevent loss of JWT and user data
            // If you want to allow a full reset, call resetApplicationState() explicitly from a button or menu
            
            
            document.querySelectorAll('#editGenreDropdown .multiselect-option').forEach(option => {
                option.addEventListener('click', () => {
                    option.classList.toggle('selected');
                    updateSelectedGenres('editSelectedGenres', 'editGenreDropdown');
                });
            });
            
            function updateSelectedGenres(containerId, dropdownId) {
                const container = document.getElementById(containerId);
                container.innerHTML = '';
                
                const selectedOptions = document.querySelectorAll(`#${dropdownId} .multiselect-option.selected`);
                selectedOptions.forEach(opt => {
                    const tag = document.createElement('div');
                    tag.className = 'multiselect-tag';
                    tag.innerHTML = `
                        ${opt.dataset.value}
                        <span class="remove-tag">×</span>
                    `;
                    container.appendChild(tag);
                    
                    tag.querySelector('.remove-tag').addEventListener('click', (e) => {
                        e.stopPropagation();
                        opt.classList.remove('selected');
                        tag.remove();
                    });
                });
            }
    
            // Form submissions
            if (newSongForm) {
                if (newSongForm._addListener) newSongForm.removeEventListener('submit', newSongForm._addListener);
                let addSongSubmitting = false;
                newSongForm._addListener = async function(e) {
                    e.preventDefault();
                    if (addSongSubmitting) return;
                    addSongSubmitting = true;
                    const title = document.getElementById('songTitle').value;
                    const lyrics = document.getElementById('songLyrics').value;
                    if (isDuplicateSong(title, lyrics)) {
                        showNotification('Duplicate song detected! Please check your title and lyrics.', 4000);
                        addSongSubmitting = false;
                        return;
                    }
                    const selectedGenres = Array.from(document.querySelectorAll('#genreDropdown .multiselect-option.selected'))
                        .map(opt => opt.dataset.value);
                    
                    // Collect multiselect values for mood and artist
                    const moodDropdown = document.getElementById('moodDropdown');
                    const artistDropdown = document.getElementById('artistDropdown');
                    const selectedMoods = Array.from(moodDropdown._moodSelections || []);
                    const selectedArtists = Array.from(artistDropdown._artistSelections || []);
                    const songRhythmFamily = document.getElementById('songRhythmFamily')?.value || '';
                    const songRhythmSetNoRaw = parseInt(document.getElementById('songRhythmSetNo')?.value, 10);
                    const songRhythmSetNo = Number.isInteger(songRhythmSetNoRaw) && songRhythmSetNoRaw > 0 ? songRhythmSetNoRaw : null;
                    const songRhythmSetId = buildRhythmSetIdValue(songRhythmFamily, songRhythmSetNo)
                        || (document.getElementById('songRhythmSetIdPreview')?.value || '');
                    const songRhythmCategory = normalizeRhythmCategoryValue(document.getElementById('songRhythmCategory')?.value || '');
                    
                    const newSong = {
                        title: title,
                        category: document.getElementById('songCategory').value,
                        key: document.getElementById('songKey').value,
                        artistDetails: selectedArtists.length > 0 ? selectedArtists.join(', ') : '',
                        mood: selectedMoods.length > 0 ? selectedMoods.join(', ') : '',
                        tempo: document.getElementById('songTempo').value,
                        time: document.getElementById('songTime').value,
                        taal: document.getElementById('songTaal').value,
                        rhythmFamily: songRhythmFamily,
                        rhythmSetNo: songRhythmSetNo,
                        rhythmSetId: songRhythmSetId,
                        rhythmCategory: songRhythmCategory,
                        genres: selectedGenres,
                        lyrics: lyrics,
                        createdBy: (currentUser && currentUser.username) ? currentUser.username : undefined,
                        createdAt: new Date().toISOString()
                    };
                    try {
                        console.log(`🔄 Adding song to backend: ${newSong.title}`);
                        const jwtToken = localStorage.getItem('pw_jwtToken') || '';
                        const response = await fetch(`${API_BASE_URL}/api/songs`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${jwtToken}`
                            },
                            body: JSON.stringify(newSong)
                        });
                        
                        if (response.ok) {
                            let addedSong;
                            try {
                                addedSong = await response.json();
                                console.log(`✅ Backend add successful, received song data with ID: ${addedSong.id}`);
                            } catch (parseError) {
                                console.error(`⚠️ Backend added song but response parsing failed:`, parseError);
                                showNotification('Song may have been added, but there was an issue with the response. Please refresh to see changes.');
                                addSongSubmitting = false;
                                return;
                            }
                            
                            showNotification('Song added successfully!');
                            addSongModal.style.display = 'none';
                            newSongForm.reset();
                            // Clear all multiselect selections
                            document.getElementById('selectedGenres').innerHTML = '';
                            document.querySelectorAll('#moodDropdown .multiselect-option').forEach(opt => {
                                opt.classList.remove('selected');
                            });
                            document.querySelectorAll('#artistDropdown .multiselect-option').forEach(opt => {
                                opt.classList.remove('selected');
                            });
                            updateSelectedMoods('selectedMoods', 'moodDropdown');
                            updateSelectedArtists('selectedArtists', 'artistDropdown');
                            
                            // Update cache directly instead of invalidating
                            updateSongInCache(addedSong, true);
                            
                            // Only render if we're on the same category tab as the new song
                            const activeTab = document.getElementById('PraiseTab')?.classList.contains('active') ? 'Praise' : 'Worship';
                            if (addedSong.category === activeTab) {
                                console.log(`✅ Rendering ${addedSong.category} tab after adding song`);
                                debouncedRenderSongs(addedSong.category, keyFilter.value, genreFilter.value);
                            } else {
                                console.log(`⏭️ Skipping render - new song category (${addedSong.category}) doesn't match active tab (${activeTab})`);
                            }
                            updateSongCount();
                        } else {
                            showNotification('Please login to add a song');
                        }
                    } catch (err) {
                        showNotification('Error adding song');
                    } finally {
                        addSongSubmitting = false;
                    }
                };
                newSongForm.addEventListener('submit', newSongForm._addListener);
            }
    
            // Remove existing listener to prevent duplicates
            if (editSongForm._editListener) {
                editSongForm.removeEventListener('submit', editSongForm._editListener);
            }
            
            editSongForm._editListener = async (e) => {
                e.preventDefault();
                const id = document.getElementById('editSongId').value;
                const title = document.getElementById('editSongTitle').value;
                const lyrics = document.getElementById('editSongLyrics').value;

                const selectedGenres = Array.from(document.querySelectorAll('#editGenreDropdown .multiselect-option.selected'))
                    .map(opt => opt.dataset.value);
                
                // Collect multiselect values for mood and artist
                const editMoodDropdown = document.getElementById('editMoodDropdown');
                const editArtistDropdown = document.getElementById('editArtistDropdown');
                const selectedMoods = Array.from(editMoodDropdown._moodSelections || []);
                const selectedArtists = Array.from(editArtistDropdown._artistSelections || []);
                const editSongRhythmFamily = document.getElementById('editSongRhythmFamily')?.value || '';
                const editSongRhythmSetNoRaw = parseInt(document.getElementById('editSongRhythmSetNo')?.value, 10);
                const editSongRhythmSetNo = Number.isInteger(editSongRhythmSetNoRaw) && editSongRhythmSetNoRaw > 0 ? editSongRhythmSetNoRaw : null;
                const editSongRhythmSetId = buildRhythmSetIdValue(editSongRhythmFamily, editSongRhythmSetNo)
                    || (document.getElementById('editSongRhythmSetIdPreview')?.value || '');
                const editSongRhythmCategory = normalizeRhythmCategoryValue(document.getElementById('editSongRhythmCategory')?.value || '');

                // Find the original song for missing fields
                const original = songs.find(s => s.id == id) || {};
                const editSongLyrics = document.getElementById('editSongLyrics').value;
                const updatedSong = {
                    id: Number(id),
                    title: title,
                    category: document.getElementById('editSongCategory').value,
                    key: document.getElementById('editSongKey').value,
                    artistDetails: selectedArtists.length > 0 ? selectedArtists.join(', ') : '',
                    mood: selectedMoods.length > 0 ? selectedMoods.join(', ') : '',
                    tempo: document.getElementById('editSongTempo').value,
                    time: document.getElementById('editSongTime').value,
                    taal: document.getElementById('editSongTaal').value,
                    rhythmFamily: editSongRhythmFamily,
                    rhythmSetNo: editSongRhythmSetNo,
                    rhythmSetId: editSongRhythmSetId,
                    rhythmCategory: editSongRhythmCategory,
                    genres: selectedGenres,
                    lyrics: lyrics,
                    editSongLyrics: editSongLyrics,
                    createdBy: original.createdBy || (currentUser && currentUser.username) || undefined,
                    createdAt: original.createdAt || new Date().toISOString()
                };

                try {
                    // Store original song for potential rollback
                    const originalSong = songs.find(s => s.id == id);
                    
                    console.log(`🔄 Updating song in backend: ${updatedSong.title}`);
                    const response = await authFetch(`${API_BASE_URL}/api/songs/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedSong)
                    });
                    
                    if (response.ok) {
                        // Try to get updated song from response
                        let updated;
                        try {
                            updated = await response.json();
                            console.log(`✅ Backend update successful, received updated song data`, updated);
                        } catch (parseError) {
                            console.log(`⚠️ Backend updated but no song data in response, using sent data`);
                            updated = { ...updatedSong, id: Number(id) };
                        }
                        // Validate backend response
                        if (updated && updated.id && updated.title) {
                            showNotification('Song updated successfully!');
                            editSongModal.style.display = 'none';
                            editSongForm.reset();
                            console.log(`💾 Updating cache with updated song data`);
                            updateSongInCache(updated, false);
                            const activeTab = document.getElementById('PraiseTab')?.classList.contains('active') ? 'Praise' : 'Worship';
                            console.log(`🎵 Edit song complete - Updated song category: ${updated.category}, Active tab: ${activeTab}`);
                            if (updated.category === activeTab) {
                                console.log(`✅ Rendering ${updated.category} tab after edit`);
                                debouncedRenderSongs(updated.category, keyFilter.value, genreFilter.value);
                            } else {
                                console.log(`⏭️ Skipping render - song category (${updated.category}) doesn't match active tab (${activeTab})`);
                            }
                            if (songPreviewEl.dataset.songId == id) {
                                const preservedContext = songPreviewEl.dataset.openingContext || resolvePreviewContextFromCurrentView('all-songs');
                                showPreview(updated, false, preservedContext);
                            }
                        } else if (updated && updated.message) {
                            // Backend returned only a message, not a song object
                            console.error('❌ Backend did not return updated song object. Received:', updated);
                            showNotification('Backend did not return updated song object. Please check server response.', 'error');
                            return;
                        } else {
                            console.error('❌ Cannot update cache - invalid song data:', updated);
                            showNotification('Failed to update song: invalid backend response', 'error');
                            return;
                        }
                    } else {
                        const errorText = await response.text();
                        console.error(`❌ Backend update failed:`, response.status, errorText);
                        showNotification(`Failed to update song: ${response.status}`);
                    }
                } catch (err) {
                    showNotification('Error updating song');
                }
            };
            
            editSongForm.addEventListener('submit', editSongForm._editListener);
    
            cancelDeleteSong.addEventListener('click', () => {
                deleteSongModal.style.display = 'none';
            });
    
            // Remove any existing listener before adding new one to prevent duplicates
            if (deleteSongForm._deleteSubmitListener) {
                deleteSongForm.removeEventListener('submit', deleteSongForm._deleteSubmitListener);
            }
            
            deleteSongForm._deleteSubmitListener = async (e) => {
                e.preventDefault();
                const id = Number(document.getElementById('deleteSongId').value);
                const deleteBtn = deleteSongForm.querySelector('button[type="submit"]');
                if (deleteBtn) deleteBtn.disabled = true;
                await deleteSongById(id, () => {
                    deleteSongModal.style.display = 'none';
                    // Only render if we're on the correct tab
                    const activeTab = document.getElementById('PraiseTab')?.classList.contains('active') ? 'Praise' : 'Worship';
                    debouncedRenderSongs(activeTab, keyFilter.value, genreFilter.value);
                    if (deleteBtn) deleteBtn.disabled = false;
                });
            };
            
            deleteSongForm.addEventListener('submit', deleteSongForm._deleteSubmitListener);
    
            // Preview scrolling
            songPreviewEl.addEventListener('wheel', handleUserScroll, { passive: true });
            songPreviewEl.addEventListener('touchmove', handleUserScroll, { passive: true });
            
            // Keep screen on button
            //keepScreenOnBtn.addEventListener('click', toggleScreenWakeLock);
    
            // Bulk operations
            deleteAllSongsBtn.addEventListener('click', () => {
                confirmDeleteAllModal.style.display = 'flex';
            });
    
    
            cancelDeleteAll.addEventListener('click', () => {
                confirmDeleteAllModal.style.display = 'none';
            });
    
            confirmDeleteAll.addEventListener('click', () => {
                songs = [];
                pw_favorites = [];
                saveSongs();
                queueSaveUserData();
                
                if (PraiseTab.classList.contains('active')) {
                    renderSongs('Praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('Worship', keyFilter.value, genreFilter.value);
                }
                songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics"></div>';
                songPreviewEl.dataset.songId = '';
                showNotification('All songs have been deleted.');
                confirmDeleteAllModal.style.display = 'none';
            });
    
            // Search functionality
            searchInput.addEventListener('input', function (e) {
                const query = e.target.value.trim().toLowerCase();
                clearSearchBtn.style.display = query ? 'block' : 'none';
                const searchResults = document.getElementById('searchResults');
                const searchResultsContent = document.getElementById('searchResultsContent');

                if (query.length === 0) {
                    searchResults.classList.remove('active');
                    const filters = getCurrentFilterValues();
                    if (PraiseTab.classList.contains('active')) {
                        renderSongs('Praise', filters.key, filters.genre, filters.mood, filters.artist);
                    } else {
                        renderSongs('Worship', filters.key, filters.genre, filters.mood, filters.artist);
                    }
                    return;
                }

                if (query.length > 0) {
                    saveSearchQuery(query);
                }
    
                let filtered = songs.filter(song => {
                    return (
                        song.title.toLowerCase().includes(query) ||
                        (song.lyrics && song.lyrics.toLowerCase().includes(query)) ||
                        (song.taal && song.taal.toLowerCase().includes(query)) ||
                        (song.genre && song.genre.toLowerCase().includes(query)) ||
                        (song.genres && song.genres.some(g => g.toLowerCase().includes(query))) ||
                        (song.mood && song.mood.toLowerCase().includes(query)) ||
                        (song.artistDetails && song.artistDetails.toLowerCase().includes(query))
                    );
                });
                // Sort: title matches first, then lyrics, then others
                filtered.sort((a, b) => {
                    const aTitleMatch = a.title && a.title.toLowerCase().includes(query) ? 1 : 0;
                    const bTitleMatch = b.title && b.title.toLowerCase().includes(query) ? 1 : 0;
                    if (aTitleMatch !== bTitleMatch) return bTitleMatch - aTitleMatch;
                    const aLyricsMatch = a.lyrics && a.lyrics.toLowerCase().includes(query) ? 1 : 0;
                    const bLyricsMatch = b.lyrics && b.lyrics.toLowerCase().includes(query) ? 1 : 0;
                    if (aLyricsMatch !== bLyricsMatch) return bLyricsMatch - aLyricsMatch;
                    return 0;
                });
    
                if (filtered.length === 0) {
                    searchResultsContent.innerHTML = '<p>No results found</p>';
                    searchResults.classList.add('active');
                    return;
                }
    
                searchResultsContent.innerHTML = '';
    
                filtered.forEach(song => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'search-result-item';
                    resultItem.dataset.songId = song.id;
    
                    const highlightedTitle = highlightText(song.title, query);
    
                    let lyricsSnippet = '';
                    if (song.lyrics && song.lyrics.toLowerCase().includes(query)) {
                        const lyricsLower = song.lyrics.toLowerCase();
                        const queryPos = lyricsLower.indexOf(query);
                        const startPos = Math.max(0, queryPos - 20);
                        const endPos = Math.min(song.lyrics.length, queryPos + query.length + 40);
                        lyricsSnippet = song.lyrics.substring(startPos, endPos);
                        if (startPos > 0) lyricsSnippet = '...' + lyricsSnippet;
                        if (endPos < song.lyrics.length) lyricsSnippet = lyricsSnippet + '...';
                        lyricsSnippet = highlightText(lyricsSnippet, query);
                    }
    
                    resultItem.innerHTML = `
                        <div class="search-result-title">${highlightedTitle}</div>
                        <div class="search-result-meta">${song.key} | ${song.tempo} | ${song.time || song.timeSignature} | ${song.genre || ''}</div>
                        ${lyricsSnippet ? `<div class="search-result-snippet">${lyricsSnippet}</div>` : ''}
                    `;
    
                    resultItem.addEventListener('click', () => {
                        const foundSong = songs.find(s => s.id === song.id);
                        if (foundSong) {
                            showPreview(foundSong, false, 'all-songs');
                            if (window.innerWidth <= 768) {
                                document.querySelector('.songs-section').classList.add('hidden');
                                document.querySelector('.sidebar').classList.add('hidden');
                                document.querySelector('.preview-section').classList.add('full-width');
                            }
                        }
                    });
    
                    searchResultsContent.appendChild(resultItem);
                });
    
                searchResults.classList.add('active');
            });
            
            // Clear search button
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                document.getElementById('searchResults').classList.remove('active');
                document.getElementById('searchHistoryDropdown').style.display = 'none';
                if (PraiseTab.classList.contains('active')) {
                    renderSongs('Praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('Worship', keyFilter.value, genreFilter.value);
                }
            });
            
            // Search history dropdown
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim() === '') {
                    showSearchHistory();
                }
            });
            
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) {
                    document.getElementById('searchHistoryDropdown').style.display = 'none';
                }
            });
    
            // Download/upload
            downloadBtn.addEventListener('click', downloadSongs);
    
            // HTML download
            document.getElementById('downloadHtmlWithSongsBtn').addEventListener('click', () => {
                try {
                    const clone = document.documentElement.cloneNode(true);
                    const embedded = clone.querySelector('#embeddedSongs');
                    if (embedded) {
                        embedded.textContent = JSON.stringify(songs, null, 2);
                    } else {
                        const script = document.createElement('script');
                        script.id = 'embeddedSongs';
                        script.type = 'application/json';
                        script.textContent = JSON.stringify(songs, null, 2);
                        clone.querySelector('body').appendChild(script);
                    }
    
                    const fullHtml = '<!DOCTYPE html>\n' + clone.outerHTML;
                    const blob = new Blob([fullHtml], { type: 'text/html' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'NewOld_Songs_Updated.html';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showNotification('HTML file downloaded with all songs');
                } catch (err) {
                    showNotification('Failed to generate updated HTML: ' + err.message);
                }
            });
    
            // Settings
            let settingsBtn = document.getElementById("settingsBtn");
            if (!settingsBtn) {
                settingsBtn = document.createElement("button");
                settingsBtn.id = "settingsBtn";
                settingsBtn.textContent = "🛠 Settings";
                settingsBtn.className = "sidebar-settings-btn";

                const sidebar = document.querySelector(".sidebar");
                if (sidebar) {
                    sidebar.appendChild(settingsBtn);
                }
            }

            if (settingsBtn && settingsBtn.dataset.boundClick !== 'true') {
                settingsBtn.dataset.boundClick = 'true';
                settingsBtn.addEventListener("click", () => {
                document.getElementById("sidebarHeaderInput").value = document.querySelector(".sidebar-header h2").textContent;
                document.getElementById("setlistTextInput").value = ""; // No longer using showSetlist element
                document.getElementById("settingsModal").style.display = "flex";
                });
            }
    
            const settingsForm = document.getElementById("settingsForm");
            if (settingsForm) {
                if (settingsForm._submitListener) {
                    settingsForm.removeEventListener("submit", settingsForm._submitListener);
                }
                
                settingsForm._submitListener = function (e) {
                    e.preventDefault();
                    saveSettings();
                    showNotification('Settings saved successfully');
                    document.getElementById("settingsModal").style.display = "none";
                };
                
                settingsForm.addEventListener("submit", settingsForm._submitListener);
            }
    
            // Folder toggle
            document.getElementById('toggleSongTools').addEventListener('click', () => {
                const folder = document.getElementById('songToolsContent');
                const toggle = document.getElementById('toggleSongTools');
                folder.classList.toggle('show');
                toggle.classList.toggle('active');
            });
    
            // Suggested songs
            document.getElementById('toggleSuggestedSongs').addEventListener('click', toggleSuggestedSongsDrawer);
            document.getElementById('closeSuggestedSongs').addEventListener('click', closeSuggestedSongsDrawer);
            document.addEventListener('click', (e) => {
                const drawer = document.getElementById('suggestedSongsDrawer');
                const toggleBtn = document.getElementById('toggleSuggestedSongs');
                
                if (suggestedSongsDrawerOpen && 
                    !e.target.closest('#suggestedSongsDrawer') && 
                    e.target !== toggleBtn) {
                    closeSuggestedSongsDrawer();
                }
            });
    
            // Theme toggle
            document.getElementById('themeToggle').addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            localStorage.setItem('darkMode', isDarkMode);
            applyTheme(isDarkMode);
            });
    
            // Make toggle buttons draggable
            makeToggleDraggable('toggle-sidebar');
            makeToggleDraggable('toggle-songs');
            makeToggleDraggable('toggle-all-panels');

            // ====================== SETLIST EVENT LISTENERS ======================
            
            // Attach direct event listeners to specific elements to avoid conflicts
            function attachSetlistEventListeners() {
                const globalHeader = document.getElementById('globalSetlistHeader');
                const myHeader = document.getElementById('mySetlistHeader');
                const addGlobalBtn = document.getElementById('addGlobalSetlistBtn');
                const addMyBtn = document.getElementById('addMySetlistBtn');
                
                // Remove any existing listeners
                if (globalHeader && !globalHeader._setlistListenerAttached) {
                    globalHeader._setlistListenerAttached = true;
                    globalHeader.addEventListener('click', function(e) {
                        if (e.target.closest('.add-setlist-btn')) return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const globalSetlistContent = document.getElementById('globalSetlistContent');
                        const globalSetlistIcon = document.getElementById('globalSetlistIcon');
                        const addGlobalSetlistBtn = document.getElementById('addGlobalSetlistBtn');
                        
                        if (globalSetlistContent && globalSetlistIcon) {
                            const isExpanded = globalSetlistContent.style.display === 'block';
                            globalSetlistContent.style.display = isExpanded ? 'none' : 'block';
                            globalSetlistIcon.classList.toggle('expanded', !isExpanded);
                            
                            if (addGlobalSetlistBtn) {
                                const shouldShow = (!isExpanded && currentUser?.isAdmin);
                                addGlobalSetlistBtn.style.display = shouldShow ? 'block' : 'none';
                            }
                        }
                    });
                }
                
                if (myHeader && !myHeader._setlistListenerAttached) {
                    myHeader._setlistListenerAttached = true;
                    myHeader.addEventListener('click', function(e) {
                        if (e.target.closest('.add-setlist-btn')) return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const mySetlistContent = document.getElementById('mySetlistContent');
                        const mySetlistIcon = document.getElementById('mySetlistIcon');
                        const addMySetlistBtn = document.getElementById('addMySetlistBtn');
                        
                        if (mySetlistContent && mySetlistIcon) {
                            const isExpanded = mySetlistContent.style.display === 'block';
                            mySetlistContent.style.display = isExpanded ? 'none' : 'block';
                            mySetlistIcon.classList.toggle('expanded', !isExpanded);
                            
                            if (addMySetlistBtn) {
                                const shouldShow = (!isExpanded && jwtToken);
                                addMySetlistBtn.style.display = shouldShow ? 'block' : 'none';
                            }
                        }
                    });
                }
                
                // Smart Setlist header toggle
                const smartHeader = document.getElementById('smartSetlistHeader');
                if (smartHeader && !smartHeader._setlistListenerAttached) {
                    smartHeader._setlistListenerAttached = true;
                    smartHeader.addEventListener('click', function(e) {
                        if (e.target.closest('.add-setlist-btn')) return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const smartSetlistContent = document.getElementById('smartSetlistContent');
                        const smartSetlistIcon = document.getElementById('smartSetlistIcon');
                        const addSmartSetlistBtn = document.getElementById('addSmartSetlistBtn');
                        
                        if (smartSetlistContent && smartSetlistIcon) {
                            const isExpanded = smartSetlistContent.style.display === 'block';
                            smartSetlistContent.style.display = isExpanded ? 'none' : 'block';
                            smartSetlistIcon.classList.toggle('expanded', !isExpanded);
                            
                            if (addSmartSetlistBtn) {
                                const shouldShow = (!isExpanded && jwtToken);
                                addSmartSetlistBtn.style.display = shouldShow ? 'block' : 'none';
                            }
                        }
                    });
                }
                
                if (addGlobalBtn && !addGlobalBtn._setlistListenerAttached) {
                    addGlobalBtn._setlistListenerAttached = true;
                    addGlobalBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        createGlobalSetlist();
                    });
                }
                
                if (addMyBtn && !addMyBtn._setlistListenerAttached) {
                    addMyBtn._setlistListenerAttached = true;
                    addMyBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        createMySetlist();
                    });
                }
            }
            
            attachSetlistEventListeners();

            // Global setlist form submission
            const globalSetlistForm = document.getElementById('globalSetlistForm');
            if (globalSetlistForm && !globalSetlistForm._submitListenerAttached) {
                globalSetlistForm._submitListenerAttached = true;
                globalSetlistForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const setlistId = document.getElementById('globalSetlistId').value;
                    const name = document.getElementById('globalSetlistName').value.trim();
                    const description = document.getElementById('globalSetlistDescription').value.trim();
                    const modal = document.getElementById('globalSetlistModal');
                    const selectedSongs = modal.songSelector ? modal.songSelector.getSelectedSongs() : [];
                    
                    if (!name) {
                        showNotification('Setlist name is required');
                        return;
                    }

                    try {
                        const method = setlistId ? 'PUT' : 'POST';
                        const endpoint = setlistId ? `global-setlists/${setlistId}` : 'global-setlists';
                        
                        const res = await authFetch(`${API_BASE_URL}/api/${endpoint}`, {
                            method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, description, songs: selectedSongs })
                        });

                        if (res.ok) {
                            await loadGlobalSetlists();
                            document.getElementById('globalSetlistModal').style.display = 'none';
                            globalSetlistForm.reset();
                            // Clear selected songs
                            if (modal.songSelector) {
                                modal.songSelector.clearSelection();
                            }
                            showNotification(setlistId ? 'Global setlist updated' : 'Global setlist created');
                        } else if (res.status === 403) {
                            showNotification('❌ Access denied: Only administrators can create/modify global setlists', 'error');
                        } else {
                            const error = await res.json();
                            showNotification(error.error || 'Failed to save global setlist');
                        }
                    } catch (err) {
                        console.error('Error saving global setlist:', err);
                        showNotification('Failed to save global setlist');
                    }
                });
            }

            // My setlist form submission
            const mySetlistForm = document.getElementById('mySetlistForm');
            if (mySetlistForm && !mySetlistForm._submitListenerAttached) {
                mySetlistForm._submitListenerAttached = true;
                mySetlistForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const setlistId = document.getElementById('mySetlistId').value;
                    const name = document.getElementById('mySetlistName').value.trim();
                    const description = document.getElementById('mySetlistDescription').value.trim();
                    const modal = document.getElementById('mySetlistModal');
                    const selectedSongs = modal.songSelector ? modal.songSelector.getSelectedSongs() : [];
                    
                    if (!name) {
                        showNotification('Setlist name is required');
                        return;
                    }

                    try {
                        const method = setlistId ? 'PUT' : 'POST';
                        const endpoint = setlistId ? `my-setlists/${setlistId}` : 'my-setlists';
                        
                        const res = await authFetch(`${API_BASE_URL}/api/${endpoint}`, {
                            method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, description, songs: selectedSongs })
                        });

                        if (res.ok) {
                            await loadMySetlists();
                            document.getElementById('mySetlistModal').style.display = 'none';
                            mySetlistForm.reset();
                            // Clear selected songs
                            if (modal.songSelector) {
                                modal.songSelector.clearSelection();
                            }
                            showNotification(setlistId ? 'Setlist updated' : 'Setlist created');
                        } else {
                            const error = await res.json();
                            showNotification(error.error || 'Failed to save setlist');
                        }
                    } catch (err) {
                        console.error('Error saving setlist:', err);
                        showNotification('Failed to save setlist');
                    }
                });
            }

            // Setlist view modal tabs
            const setlistPraiseTab = document.getElementById('setlistPraiseTab');
            const setlistWorshipTab = document.getElementById('setlistWorshipTab');
            const setlistPraiseSongs = document.getElementById('setlistPraiseSongs');
            const setlistWorshipSongs = document.getElementById('setlistWorshipSongs');

            if (setlistPraiseTab && setlistWorshipTab && setlistPraiseSongs && setlistWorshipSongs) {
                setlistPraiseTab.addEventListener('click', () => {
                    setlistPraiseTab.classList.add('active');
                    setlistWorshipTab.classList.remove('active');
                    setlistPraiseSongs.style.display = 'block';
                    setlistWorshipSongs.style.display = 'none';
                });

                setlistWorshipTab.addEventListener('click', () => {
                    setlistWorshipTab.classList.add('active');
                    setlistPraiseTab.classList.remove('active');
                    setlistWorshipSongs.style.display = 'block';
                    setlistPraiseSongs.style.display = 'none';
                });
            }

            // Setlist view modal edit and delete buttons
            const editSetlistBtn = document.getElementById('editSetlistBtn');
            const deleteSetlistBtn = document.getElementById('deleteSetlistBtn');

            if (editSetlistBtn) {
                editSetlistBtn.addEventListener('click', () => {
                    if (currentViewingSetlist && currentSetlistType) {
                        if (currentSetlistType === 'global') {
                            editGlobalSetlist(currentViewingSetlist._id);
                        } else {
                            editMySetlist(currentViewingSetlist._id);
                        }
                        document.getElementById('setlistViewModal').style.display = 'none';
                    }
                });
            }

            if (deleteSetlistBtn) {
                deleteSetlistBtn.addEventListener('click', () => {
                    if (currentViewingSetlist && currentSetlistType) {
                        if (currentSetlistType === 'global') {
                            deleteGlobalSetlist(currentViewingSetlist._id);
                        } else {
                            deleteMySetlist(currentViewingSetlist._id);
                        }
                        document.getElementById('setlistViewModal').style.display = 'none';
                    }
                });
            }

            // Add event handlers for setlist section buttons
            if (editSetlistSectionBtn) {
                editSetlistSectionBtn.addEventListener('click', () => {
                    if (currentViewingSetlist && currentSetlistType) {
                        if (currentSetlistType === 'global') {
                            if (currentUser?.isAdmin) {
                                editGlobalSetlist(currentViewingSetlist._id);
                            } else {
                                showNotification('Only admins can edit global setlists', 3000);
                            }
                        } else if (currentSetlistType === 'my') {
                            editMySetlist(currentViewingSetlist._id);
                        } else if (currentSetlistType === 'smart') {
                            editSmartSetlist(currentViewingSetlist._id || currentViewingSetlist.id);
                        }
                    }
                });
            }

            if (deleteSetlistSectionBtn) {
                deleteSetlistSectionBtn.addEventListener('click', () => {
                    if (currentViewingSetlist && currentSetlistType) {
                        if (currentSetlistType === 'global') {
                            if (currentUser?.isAdmin) {
                                deleteGlobalSetlist(currentViewingSetlist._id);
                            } else {
                                showNotification('Only admins can delete global setlists', 3000);
                            }
                        } else if (currentSetlistType === 'my') {
                            deleteMySetlist(currentViewingSetlist._id);
                        } else if (currentSetlistType === 'smart') {
                            deleteSmartSetlist(currentViewingSetlist._id || currentViewingSetlist.id);
                        }
                    }
                });
            }

            // Cancel delete setlist button
            const cancelDeleteSetlist = document.getElementById('cancelDeleteSetlist');
            if (cancelDeleteSetlist) {
                cancelDeleteSetlist.addEventListener('click', () => {
                    document.getElementById('confirmDeleteSetlistModal').style.display = 'none';
                });
            }

            // Add Manual Song button
            const addManualSongBtn = document.getElementById('addManualSongBtn');
            if (addManualSongBtn) {
                addManualSongBtn.addEventListener('click', () => {
                    if (currentViewingSetlist) {
                        openAddManualSongModal();
                    }
                });
            }

            // Manual song modal event listeners
            const manualSongForm = document.getElementById('manualSongForm');
            const cancelManualSong = document.getElementById('cancelManualSong');
            const manualSongTitle = document.getElementById('manualSongTitle');

            if (manualSongForm) {
                if (manualSongForm._submitListener) {
                    manualSongForm.removeEventListener('submit', manualSongForm._submitListener);
                }
                manualSongForm._submitListener = handleManualSongSubmit;
                manualSongForm.addEventListener('submit', manualSongForm._submitListener);
            }

            if (cancelManualSong) {
                cancelManualSong.addEventListener('click', closeAddManualSongModal);
            }

            if (manualSongTitle) {
                manualSongTitle.addEventListener('input', handleSongTitleSearch);
            }

            // Close modal when clicking outside
            const addManualSongModal = document.getElementById('addManualSongModal');
            if (addManualSongModal) {
                addManualSongModal.addEventListener('click', (e) => {
                    if (e.target === addManualSongModal) {
                        closeAddManualSongModal();
                    }
                });
            }

            // ====================== END SETLIST EVENT LISTENERS ======================
        }
    
        function makeToggleDraggable(id) {
            const el = document.getElementById(id);
            if (!el) return;
            
            // Prevent multiple initializations
            if (el._isDraggableInitialized) return;
            el._isDraggableInitialized = true;
            
            let isDragging = false, offsetX = 0, offsetY = 0;
            let dragStarted = false; // To distinguish between click and drag

            const savePosition = () => {
                const pos = { top: el.style.top, left: el.style.left, right: el.style.right, bottom: el.style.bottom };
                localStorage.setItem(id + '-pos', JSON.stringify(pos));
            };

            const restorePosition = () => {
            const saved = localStorage.getItem(id + '-pos');
            const minPadding = 20;
            const btnSize = 36;
            const spacing = window.innerWidth <= 768 ? 60 : 50;
            const allIds = ['toggle-sidebar', 'toggle-songs', 'toggle-all-panels'];
            const idx = allIds.indexOf(id);

            if (saved) {
                const pos = JSON.parse(saved);
                const savedTop = parseInt(pos.top, 10);
                const savedLeft = parseInt(pos.left, 10);
                const savedRight = parseInt(pos.right, 10);
                const savedBottom = parseInt(pos.bottom, 10);

                let top;
                let left;

                if (Number.isFinite(savedTop)) {
                    top = savedTop;
                } else if (Number.isFinite(savedBottom)) {
                    top = window.innerHeight - btnSize - savedBottom;
                } else {
                    top = minPadding;
                }

                if (Number.isFinite(savedLeft)) {
                    left = savedLeft;
                } else if (Number.isFinite(savedRight)) {
                    left = window.innerWidth - btnSize - savedRight;
                } else {
                    left = window.innerWidth - btnSize - minPadding;
                }

                top = Math.max(minPadding, Math.min(top, window.innerHeight - btnSize - minPadding));
                left = Math.max(minPadding, Math.min(left, window.innerWidth - btnSize - minPadding));

                el.style.top = `${top}px`;
                el.style.left = `${left}px`;
                el.style.right = '';
                el.style.bottom = '';

                // Persist normalized on-screen coordinates so future loads stay visible.
                savePosition();
            } else {
                // Default: position vertically on right edge, centered
                const centerY = Math.floor(window.innerHeight / 2);
                const startY = centerY - Math.floor(allIds.length * (btnSize + spacing) / 2);
                
                el.style.top = Math.max(minPadding, startY + idx * (btnSize + spacing)) + 'px';
                el.style.left = '';
                el.style.right = minPadding + 'px';
                el.style.bottom = '';
            }
        };

        // Snap to nearest edge and prevent overlap/offscreen
                function snapToEdge() {
            const rect = el.getBoundingClientRect();
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            const gap = 15;
            const btnSize = rect.width || 36;

            // Clamp to viewport
            let left = Math.max(gap, Math.min(rect.left, winW - btnSize - gap));
            let top = Math.max(gap, Math.min(rect.top, winH - btnSize - gap));

            // Prevent overlap with other buttons
            const allButtons = document.querySelectorAll('.panel-toggle.draggable');
            for (const otherBtn of allButtons) {
                if (otherBtn === el) continue;
                const otherRect = otherBtn.getBoundingClientRect();
                if (
                    left < otherRect.right &&
                    left + btnSize > otherRect.left &&
                    top < otherRect.bottom &&
                    top + btnSize > otherRect.top
                ) {
                    // Move right or down to avoid overlap
                    left = otherRect.right + gap;
                    if (left > winW - btnSize - gap) {
                        left = gap;
                        top = otherRect.bottom + gap;
                        if (top > winH - btnSize - gap) top = gap;
                    }
                }
            }

            // Reset all positions
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            el.style.right = '';
            el.style.bottom = '';
            savePosition();
        }

            // Snap to nearest edge
            

            const onMove = (clientX, clientY) => {
                if (!isDragging) return;
                dragStarted = true; // Mark that actual dragging has started
                let newLeft = clientX - offsetX;
                let newTop = clientY - offsetY;
                el.style.left = newLeft + 'px';
                el.style.top = newTop + 'px';
                el.style.right = '';
                el.style.bottom = '';
            };

            const onEnd = () => {
                if (isDragging && dragStarted) {
                    snapToEdge();
                    // Mark that the element was dragged to prevent click event
                    el._wasDragged = true;
                    // Clear the flag after a short delay to allow normal clicks later
                    setTimeout(() => {
                        el._wasDragged = false;
                    }, 100);
                }
                isDragging = false;
                dragStarted = false;
                document.body.style.userSelect = '';
            };

            const onMouseDown = (e) => {
                e.preventDefault();
                isDragging = true;
                dragStarted = false;
                const rect = el.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                document.body.style.userSelect = 'none';
            };

            const onMouseMove = (e) => {
                if (isDragging) {
                    onMove(e.clientX, e.clientY);
                }
            };

            const onTouchStart = (e) => {
                isDragging = true;
                dragStarted = false;
                const touch = e.touches[0];
                const rect = el.getBoundingClientRect();
                offsetX = touch.clientX - rect.left;
                offsetY = touch.clientY - rect.top;
            };

            const onTouchMove = (e) => {
                if (isDragging) {
                    const touch = e.touches[0];
                    onMove(touch.clientX, touch.clientY);
                    e.preventDefault();
                }
            };

            // Add event listeners
            el.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onEnd);

            el.addEventListener('touchstart', onTouchStart, { passive: false });
            el.addEventListener('touchmove', onTouchMove, { passive: false });
            el.addEventListener('touchend', onEnd);

            // Snap to edge on window resize
            window.addEventListener('resize', snapToEdge);

            restorePosition();

            let timeout;
            const showTemporarily = () => {
                el.classList.add('showing');
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    el.classList.remove('showing');
                }, 3000);
            };

            el.addEventListener('mouseenter', () => el.classList.add('showing'));
            el.addEventListener('mouseleave', () => el.classList.remove('showing'));
            el.addEventListener('touchstart', showTemporarily, { passive: true });
        }
    
        // Global functions
        window.editSong = editSong;
        window.openDeleteSongModal = openDeleteSongModal;
    
        async function removeAdminRole(userId) {
    const jwtToken = localStorage.getItem('pw_jwtToken');
    
    // Confirm action with user
    if (!confirm('Are you sure you want to remove admin role from this user?')) {
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/users/${userId}/remove-admin`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'Content-Type': 'application/json'
            }
        });
        let msg;
        if (res.ok) {
            msg = 'Admin role removed successfully';
            // Refresh the users list to update the UI
            loadUsers();
        } else {
            const data = await res.json().catch(() => ({}));
            msg = data.error ? `Failed: ${data.error}` : 'Failed to remove admin role';
        }
        showAdminNotification(msg);
    } catch (err) {
        showAdminNotification('Network error during admin role removal');
    }
}
window.removeAdminRole = removeAdminRole;

// =========================
// PASSWORD RESET FUNCTIONALITY
// =========================

// Show forgot password modal
function showForgotPasswordModal() {
    console.log('🔐 Showing forgot password modal');
    const modal = document.getElementById('forgotPasswordModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    document.getElementById('forgotPasswordError').style.display = 'none';
    document.getElementById('forgotPasswordSuccess').style.display = 'none';
}

// Hide all password reset modals
function hidePasswordResetModals() {
    const forgotModal = document.getElementById('forgotPasswordModal');
    const otpModal = document.getElementById('otpVerificationModal');
    
    forgotModal.style.display = 'none';
    forgotModal.classList.remove('show');
    
    otpModal.style.display = 'none';
    otpModal.classList.remove('show');
}

// Show notification for password reset
function showPasswordResetNotification(message, isError = false) {
    if (notificationEl) {
        notificationEl.textContent = message;
        notificationEl.className = `notification ${isError ? 'error' : 'success'} show`;
        setTimeout(() => {
            notificationEl.classList.remove('show');
        }, 5000);
    }
}

// Initiate password reset (send OTP)
async function initiatePasswordReset(identifier, method) {
    console.log(`🔐 Initiating password reset for "${identifier}" via ${method}`);
    
    // Hide previous messages
    const errorEl = document.getElementById('forgotPasswordError');
    const successEl = document.getElementById('forgotPasswordSuccess');
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';
    
    try {
        // Use currently selected backend (Vercel primary, Render fallback if switched)
        const passwordResetUrl = `${API_BASE_URL}/api/forgot-password`;
        console.log('📡 Sending request to:', passwordResetUrl);
        console.log('📦 Request body:', { identifier, method });
        
        const response = await fetch(passwordResetUrl, {
            method: 'POST',
            credentials: 'omit', // Don't send credentials for CORS
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, method })
        });

        const data = await response.json();
        console.log('📥 Response:', response.status, data);

        if (response.ok) {
            // Store reset data for OTP verification
            currentResetData = { identifier, method };
            
            // Show success and switch to OTP modal
            if (successEl) {
                successEl.textContent = data.message || 'OTP sent successfully!';
                successEl.style.display = 'block';
            }
            
            console.log('✅ Password reset request successful');
            setTimeout(() => {
                console.log('🔄 Switching to OTP modal');
                hidePasswordResetModals();
                showOtpVerificationModal(data);
            }, 1500);
            
            return { success: true, data };
        } else {
            // Show detailed error from backend
            const errorMsg = data.error || data.debug || `Failed with status ${response.status}`;
            console.error('❌ Password reset failed:', errorMsg);
            if (errorEl) {
                errorEl.textContent = errorMsg;
                errorEl.style.display = 'block';
            }
            showNotification(errorMsg, 'error', 5000);
            return { success: false, error: errorMsg };
        }
    } catch (error) {
        console.error('❌ Password reset network error:', error);
        const errorMsg = 'Network error. Please check your connection and try again.';
        if (errorEl) {
            errorEl.textContent = errorMsg;
            errorEl.style.display = 'block';
        }
        showNotification(errorMsg, 'error', 5000);
        return { success: false, error: errorMsg };
    }
}

// Show OTP verification modal
function showOtpVerificationModal(data) {
    console.log('📱 Showing OTP verification modal', data);
    const modal = document.getElementById('otpVerificationModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    document.getElementById('otpError').style.display = 'none';
    
    // Update instructions
    const instructions = `OTP sent to your ${data.method} (${data.maskedIdentifier}). Please enter the 6-digit code below.`;
    document.getElementById('otpInstructions').textContent = instructions;
    
    // Clear form
    document.getElementById('otpCode').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
}

// Verify OTP and reset password
async function verifyOtpAndResetPassword(otp, newPassword) {
    if (!currentResetData) {
        document.getElementById('otpError').textContent = 'Session expired. Please restart the process.';
        document.getElementById('otpError').style.display = 'block';
        return { success: false };
    }

    try {
        // Use currently selected backend (Vercel primary, Render fallback if switched)
        const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                identifier: currentResetData.identifier,
                otp: otp,
                newPassword: newPassword
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Success - clear reset data and hide modal
            currentResetData = null;
            hidePasswordResetModals();
            showPasswordResetNotification('Password reset successfully! You can now login with your new password.', false);
            console.log('✅ Password reset completed successfully via Vercel');
            return { success: true };
        } else {
            document.getElementById('otpError').textContent = data.error;
            document.getElementById('otpError').style.display = 'block';
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.error('Password reset completion error:', error);
        const errorMsg = 'Network error. Please try again.';
        document.getElementById('otpError').textContent = errorMsg;
        document.getElementById('otpError').style.display = 'block';
        return { success: false, error: errorMsg };
    }
}

// Resend OTP
async function resendOtp() {
    if (!currentResetData) {
        document.getElementById('otpError').textContent = 'Session expired. Please restart the process.';
        document.getElementById('otpError').style.display = 'block';
        return;
    }

    document.getElementById('resendOtpBtn').disabled = true;
    document.getElementById('resendOtpBtn').textContent = 'Sending...';

    const result = await initiatePasswordReset(currentResetData.identifier, currentResetData.method);
    
    setTimeout(() => {
        document.getElementById('resendOtpBtn').disabled = false;
        document.getElementById('resendOtpBtn').textContent = 'Resend OTP';
    }, 3000);

    if (result.success) {
        document.getElementById('otpError').style.display = 'none';
        const successMsg = document.createElement('div');
        successMsg.style.color = '#28a745';
        successMsg.style.marginTop = '10px';
        successMsg.textContent = 'OTP resent successfully!';
        document.getElementById('otpVerificationForm').appendChild(successMsg);
        
        setTimeout(() => {
            if (successMsg.parentNode) {
                successMsg.parentNode.removeChild(successMsg);
            }
        }, 3000);
    }
}

// Setup Password Reset Event Listeners
function setupPasswordResetEventListeners() {
    // Forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            hideAuthModals();
            showForgotPasswordModal();
        });
    }

    // Close modals
    const closeForgotPasswordModal = document.getElementById('closeForgotPasswordModal');
    if (closeForgotPasswordModal) {
        closeForgotPasswordModal.addEventListener('click', hidePasswordResetModals);
    }

    const closeOtpModal = document.getElementById('closeOtpModal');
    if (closeOtpModal) {
        closeOtpModal.addEventListener('click', hidePasswordResetModals);
    }

    // Forgot password form submission
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        if (forgotPasswordForm._submitListener) {
            forgotPasswordForm.removeEventListener('submit', forgotPasswordForm._submitListener);
        }
        
        forgotPasswordForm._submitListener = async (e) => {
            e.preventDefault();
            
            const identifier = document.getElementById('resetIdentifier').value.trim();
            const method = document.getElementById('resetMethod').value;
            
            if (!identifier) {
                document.getElementById('forgotPasswordError').textContent = 'Please enter your email or phone number';
                document.getElementById('forgotPasswordError').style.display = 'block';
                return;
            }

            // Hide previous messages
            document.getElementById('forgotPasswordError').style.display = 'none';
            document.getElementById('forgotPasswordSuccess').style.display = 'none';
            
            // Disable submit button temporarily
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            
            const result = await initiatePasswordReset(identifier, method);
            
            // Re-enable submit button immediately after response
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send OTP';
            
            // If successful, button will be hidden when modal closes anyway
            if (!result.success) {
                console.log('❌ Reset failed, button re-enabled for retry');
            }
        };
        
        forgotPasswordForm.addEventListener('submit', forgotPasswordForm._submitListener);
    }

    // OTP verification form submission
    const otpVerificationForm = document.getElementById('otpVerificationForm');
    if (otpVerificationForm) {
        if (otpVerificationForm._submitListener) {
            otpVerificationForm.removeEventListener('submit', otpVerificationForm._submitListener);
        }
        
        otpVerificationForm._submitListener = async (e) => {
            e.preventDefault();
            
            const otp = document.getElementById('otpCode').value.trim();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmNewPassword').value;
            
            // Validation
            if (!otp || otp.length !== 6) {
                document.getElementById('otpError').textContent = 'Please enter a valid 6-digit OTP';
                document.getElementById('otpError').style.display = 'block';
                return;
            }
            
            if (newPassword.length < 6) {
                document.getElementById('otpError').textContent = 'Password must be at least 6 characters long';
                document.getElementById('otpError').style.display = 'block';
                return;
            }
            
            if (newPassword !== confirmPassword) {
                document.getElementById('otpError').textContent = 'Passwords do not match';
                document.getElementById('otpError').style.display = 'block';
                return;
            }

            // Hide previous error
            document.getElementById('otpError').style.display = 'none';
            
            // Disable submit button temporarily
            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Resetting...';
            
            await verifyOtpAndResetPassword(otp, newPassword);
            
            // Re-enable submit button
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Reset Password';
            }, 2000);
        };
        
        otpVerificationForm.addEventListener('submit', otpVerificationForm._submitListener);
    }

    // Resend OTP button
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', resendOtp);
    }

    // OTP input formatting (only allow numbers)
    const otpCodeInput = document.getElementById('otpCode');
    if (otpCodeInput) {
        otpCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }
}

// Function to hide auth modals (already exists, but making sure it's accessible)
function hideAuthModals() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'none';
}

// Export functions for global access if needed
window.showForgotPasswordModal = showForgotPasswordModal;
window.initiatePasswordReset = initiatePasswordReset;
window.verifyOtpAndResetPassword = verifyOtpAndResetPassword;
window.resendOtp = resendOtp;

// Export setlist functions for mobile.html
window.loadGlobalSetlists = loadGlobalSetlists;
window.loadMySetlists = loadMySetlists;
window.populateSetlistDropdown = populateSetlistDropdown;
window.refreshSetlistDataOnly = refreshSetlistDataOnly;
window.checkSongInSetlistAndToggle = checkSongInSetlistAndToggle;
window.editGlobalSetlist = editGlobalSetlist;
window.deleteGlobalSetlist = deleteGlobalSetlist;
window.editMySetlist = editMySetlist;
window.deleteMySetlist = deleteMySetlist;

// Export chord and lyrics functions for mobile.html
window.formatLyricsWithChords = formatLyricsWithChords;
window.transposeChord = transposeChord;

// Export isAdmin function for mobile.html
window.isAdmin = isAdmin;

// Export logout function for mobile.html
window.handleLogout = logout;
