// Register service worker for PWA installability
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .catch(err => console.warn('Service Worker registration failed:', err));
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
let jwtToken = localStorage.getItem('jwtToken') || '';
let currentUser = null;
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let songs = []; // Global songs array
let smartSetlists = []; // Global smart setlists array - loaded from server

// Floating stop button state tracking
let currentlyPlayingSongs = new Set(); // Track which songs are currently playing
let currentPlayingSongId = null; // Track the main currently playing song

// Navigation history variables - declared early to prevent initialization errors
let navigationHistory = [];
let currentHistoryPosition = -1;
let isNavigatingHistory = false;
let currentModal = null;

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

// Recommendation weights: loaded from backend or localStorage fallback
let WEIGHTS = (() => {
    try {
        const stored = JSON.parse(localStorage.getItem('recommendationWeights')) || {};
        return { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...stored };
    } catch (error) {
        return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
    }
})();

// Initialize currentUser from localStorage
try {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) currentUser = JSON.parse(storedUser);
} catch (e) {
    // Failed to parse stored user data - continue with default
}

const GENRES = [
    "New", "Old", "Mid", "Hindi", "Marathi", "English", "RD Pattern","Acoustic", "Qawalli", "Classical", "Ghazal", "Sufi", "Rock","Drum Fast","Drum Slow","Folk","Dholak","Tabla", "Bhangra", "Garba", "Bollywood", "Patriotic", "Dance", "Instrumental",
    "Blues", "Female", "Male", "Duet"
];

const VOCAL_TAGS = ['Male', 'Female', 'Duet'];


const KEYS = [
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B",
    "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"
];
const CATEGORIES = ["New", "Old"];
const RHYTHM_CATEGORIES = ["Indian", "Western", "Others"];
const TIMES = ["4/4", "3/4", "2/4", "6/8", "5/4", "7/8","12/8","14/8"];
const TAALS = [

  // ===== HINDUSTANI CLASSICAL =====
  "TeenTaal",
  "EkTaal",
  "JhapTaal",
  "Rupak",
  "Dadra",
  "Keherwa",
  "Deepchandi",
  "Chautaal",
  "Tilwada",
  "Addha",
  "Punjabi Theka",

  // ===== SLOW / VARIANTS =====
  "Keherwa Slow",
  "Dadra Slow",
  "Bhajan",
  "Bhajan 8 Beat",
  "Bhajan 6 Beat",

  // ===== FOLK & DEVOTIONAL =====
  "Garba",
  "Dandiya",
  "Bhangra",
  "Lavani",
  "Folk",
  "Desi",
  "Qawali",
  "Kirtan",
  "Maharashtrian Dholki",
  "Punjabi Dhol",

  // ===== INDIAN FILM / BAND STYLES =====
  "Bollywood",
  "Filmi 8 Beat",
  "Filmi 16 Beat",
  "RD Pattern",
  "RD Groove",
  "Disco Indian",
  "Mumbai Pop",
  "Retro Bollywood",

  // ===== HAND DRUM PATTERNS =====
  "Tabla",
  "Dholak",
  "Dholki",
  "Duff",
  "Naal",
  "Bongo",
  "Congo",
  "Bongo-Congo",
  "Cajon Indian",

  // ===== DRUM MACHINE / GENERAL =====
  "Drum",
  "Drum Fast",
  "Drum Slow",
  "Indian Rock",
  "Indian Pop",
  "Fusion",

  // ===== WESTERN — BASIC =====
  "Western",
  "Rock",
  "Pop",
  "Ballad",
  "Slow Rock",
  "Soft Rock",
  "Hard Rock",
  "Country",
  "Funk",
  "Blues",
  "Shuffle",

  // ===== WESTERN — DANCE =====
  "Disco",
  "EDM",
  "Dance",
  "Techno",
  "House",
  "Reggae",
  "Samba",
  "Cha Cha",
  "Rumba",
  "Bossa Nova",
  "Latin",

  // ===== TIME SIGNATURE BASED =====
  "Waltz",
  "Jazz Waltz",
  "3/4",
  "6/8",
  "12/8",

  // ===== SPECIAL / UTILITY =====
  "March",
  "Orchestral",
  "Ambient",
  "Unplugged",
  "Acoustic"
];

const MOODS = [
    "Happy", "Sad", "Romantic", "Powerful", "Soothing", "Motivational", "Joyful",
    "Nostalgic", "Celebratory", "Passionate", "Festive", "Sorrowful",
    "Love", "Evergreen", "Dance", "Patriotic"
];

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

async function hydrateRhythmFamilies() {
    populateRhythmFamilyDropdown('songRhythmFamily', []);
    populateRhythmFamilyDropdown('editSongRhythmFamily', []);

    try {
        const response = await authFetch(`${API_BASE_URL}/api/song-metadata`);
        if (!response.ok) return;
        const metadata = await response.json();
        const serverFamilies = Array.isArray(metadata.rhythmFamilies)
            ? metadata.rhythmFamilies.map(normalizeRhythmFamilyValue).filter(Boolean)
            : [];

        const uniqueFamilies = Array.from(new Set(serverFamilies)).sort();
        populateRhythmFamilyDropdown('songRhythmFamily', uniqueFamilies);
        populateRhythmFamilyDropdown('editSongRhythmFamily', uniqueFamilies);
    } catch (error) {
        console.warn('Could not hydrate rhythm families from server metadata:', error);
    }
}

const ARTISTS = [
  // Legendary Male Singers
  "Kishore Kumar", "Mohammed Rafi", "Mukesh", "Manna Dey", "Talat Mahmood",
  "Hemant Kumar", "Mahendra Kapoor", "Suresh Wadkar", "Udit Narayan", "Kumar Sanu",
  "Abhijeet", "Vinod Rathod", "Shabbir Kumar", "Kunal Ganjawala", "Sonu Nigam",
  "Shaan", "KK", "Javed Ali", "Arijit Singh", "Atif Aslam", "Jubin Nautiyal",
  "Darshan Raval", "Armaan Malik", "Papon", "Mohit Chauhan", "Hariharan",
  "Sukhwinder Singh", "Kailash Kher", "Benny Dayal", "Vijay Prakash",
  "Karthik", "Sid Sriram", "Raghav Sachar", "Raghav", "Ankit Tiwari",

  // Legendary Female Singers
  "Lata Mangeshkar", "Asha Bhosle", "Geeta Dutt", "Shamshad Begum",
  "Kavita Krishnamurthy", "Anuradha Paudwal", "Sadhana Sargam", "Alka Yagnik",
  "Sunidhi Chauhan", "Shreya Ghoshal", "Palak Muchhal", "Tulsi Kumar",
  "Neha Kakkar", "Monali Thakur", "Shilpa Rao", "Dhvani Bhanushali",
  "Chinmayi", "Sunali Rathod", "Rekha Bhardwaj", "Ankita Bhattacharyya",
  "Usha Uthup", "Annie Khalid","Madhushree",

  // Golden Era Composers
  "Naushad", "Shankar-Jaikishan", "S.D. Burman", "R.D. Burman", "Madan Mohan",
  "Salil Chowdhury", "O.P. Nayyar", "Roshan", "Kalyanji-Anandji",
  "Laxmikant-Pyarelal", "Ravindra Jain", "Anu Malik", "Bappi Lahiri",

  // Modern Composers
  "A.R. Rahman", "Ilaiyaraaja", "Harris Jayaraj", "Anirudh Ravichander",
  "Devi Sri Prasad", "Thaman S", "Gopi Sundar", "Ajay-Atul", "Sachin-Jigar",
  "Vishal-Shekhar", "Shankar-Ehsaan-Loy", "Pritam", "Amit Trivedi",
  "Amaal Mallik", "Tanishk Bagchi", "Rochak Kohli", "Himesh Reshammiya","Sanam Puri",
  "Neeti Mohan","Zubeen Garg","Vishal Dadlani","Salim-Sulaiman","Shraddha Pandit",
  "Anand Raj Anand","Javed Bashir","Diljit Dosanjh","Richa Sharma","",

  // Ghazal / Qawwali / Classical Legends
  "Jagjit Singh", "Chitra Singh", "Pankaj Udhas", "Anup Jalota",
  "Ghulam Ali", "Mehdi Hassan", "Nusrat Fateh Ali Khan",
  "Rahat Fateh Ali Khan", "Abida Parveen", "Tina Sani", "Shafqat Amanat Ali",
  "Pt. Bhimsen Joshi", "Kumar Gandharva", "Pt. Jasraj",

  // Modern Lyricists
  "Gulzar", "Javed Akhtar", "Prasoon Joshi", "Amitabh Bhattacharya",
  "Manoj Muntashir", "Kumaar", "Kausar Munir", "Irshad Kamil",

  // Pop / Indie / Rap / Others
  "Lucky Ali", "Euphoria (Palash Sen)", "Adnan Sami", "Colonial Cousins",
  "Mika Singh", "Daler Mehndi", "Guru Randhawa", "Badshah",
  "Yo Yo Honey Singh", "Divine", "Raftaar", "Nucleya",
  // Legendary Actors
  "Amitabh Bachchan", "Dharmendra", "Jeetendra", "Rajesh Khanna",
  "Shashi Kapoor", "Shammi Kapoor", "Dev Anand", "Raj Kapoor",
  "Vinod Khanna", "Rishi Kapoor", "Amrish Puri", "Anupam Kher",

  // Popular 90s & 2000s Actors
  "Shah Rukh Khan", "Salman Khan", "Aamir Khan",
  "Akshay Kumar", "Ajay Devgn", "Saif Ali Khan",
  "Govinda", "Sunny Deol", "Sanjay Dutt", "Nana Patekar",

  // Current Generation Male Actors
  "Ranbir Kapoor", "Ranveer Singh", "Varun Dhawan",
  "Sidharth Malhotra", "Tiger Shroff", "Kartik Aaryan",
  "Ayushmann Khurrana", "Rajkummar Rao", "Shahid Kapoor",
  "Vicky Kaushal", "Arjun Kapoor", "Aditya Roy Kapur",

  // Leading Actresses (90s & 2000s)
  "Madhuri Dixit", "Sridevi", "Juhi Chawla", "Karisma Kapoor",
  "Kajol", "Raveena Tandon", "Shilpa Shetty", "Preity Zinta",
  "Aishwarya Rai Bachchan", "Rani Mukerji","Imran Hashmi","John Abraham",

  // Current Generation Actresses
  "Deepika Padukone", "Priyanka Chopra", "Kareena Kapoor Khan",
  "Anushka Sharma", "Katrina Kaif", "Vidya Balan",
  "Kangana Ranaut", "Alia Bhatt", "Shraddha Kapoor",
  "Kriti Sanon", "Kiara Advani", "Janhvi Kapoor", "Sara Ali Khan","Farhan Akhtar",

  // Supporting / Character Actors
  "Pankaj Tripathi", "Manoj Bajpayee", "Irrfan Khan",
  "Nawazuddin Siddiqui", "Boman Irani", "Paresh Rawal",
  "Johnny Lever", "Kunal Khemu", "Abhay Deol",

  // Young Actresses Rising
  "Tara Sutaria", "Ananya Panday", "Rashmika Mandanna",
  "Mrunal Thakur", "Disha Patani",

  // Legends & Bhavgeet
  "Sudhir Phadke",  "Arun Date",  "Yashwant Deo",  "Hridaynath Mangeshkar",  "Vasundhara Patwardhan",
  "Shobha Gurtu",  "Padmaja Fenade",  "Prabhakar Karekar",  "Jaywant Kulkarni",
  "Ranjana Joglekar",  "Ravindra Sathe",  "Mohan Atre",  "Sharad Jambhekar",
  "Rama Marathe",  "Vijaya Jog",

  // Mangeshkar Family
  "Usha Mangeshkar",  "Meera Mangeshkar",  "Hridaynath Mangeshkar",

  // Golden Voices
  "Suman Kalyanpur",  "Anuradha Paudwal",  "Suresh Wadkar",  "Sadhana Sargam",
  "Devaki Pandit",  "Shaila Chikale",  "Yogini Joglekar",
  "Anjali Marathe",  "Shobha Joshi",

  // Modern & Popular
  "Vaishali Samant",  "Avdhoot Gupte",  "Ajay Gogavale",  "Atul Gogavale",
  "Swapnil Bandodkar",  "Shankar Mahadevan",  "Shreya Ghoshal",  "Sonu Nigam",
  "Kumar Sanu",  "Sunidhi Chauhan",

  // New Generation
  "Saleel Kulkarni",  "Rahul Deshpande",  "Mahesh Kale",  "Adarsh Shinde",
  "Anand Shinde",  "Vaishali Made",  "Mugdha Karhade",  "Ketaki Mategaonkar",
  "Bela Shende",  "Ranjana Jogalekar",  "Meenal Jain",
  // Folk & Lavani
  "Surekha Punekar",  "Reshma Sonawane",  "Shakuntala Jadhav",  "Kasturi Waje",
  "Vishnu Waghmare",

  // Others in Marathi Films
  "Ajay-Atul",  "Avinash-Vishwajeet",  "Ashok Patki",  "Nandu Bhende",
  "Neha Rajpal",  "Prajakta Shukre",  "Anand Bhate",
  "Roopkumar Rathod",  "Jitendra Abhyankar",  "Rohit Raut",
  "Arya Ambekar",  "Jaanvee Prabhu Arora",  "Hrishikesh Ranade",
  // Others / Misc
  "Dr. Devika Rani", "Other"
];


const TIME_GENRE_MAP = {
    "4/4": [
        "Keherwa", "Keherwa Slow","Keherwa Bhajani",  "Bhangra", "Pop", "Rock", "Jazz", "Funk", "Shuffle",
        "Blues", "Disco", "Reggae", "R&B", "Hip-Hop","K-Pop"
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

// --- CHORD TYPES: single source of truth ---
const CHORD_TYPES = [
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

        // Dynamic API base URL for local/dev/prod
        const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3001'
            : (window.location.hostname.endsWith('github.io')
                ? 'https://oldand-new.vercel.app'
                : window.location.origin); // Same-origin API for Vercel, fallback to backend for GitHub Pages
        
        
        // const API_BASE_URL = 'https://oldand-new.vercel.app';

// Recommendation weights functions
async function fetchRecommendationWeights() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/recommendation-weights`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken') || ''}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            WEIGHTS = { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...data };
            localStorage.setItem('recommendationWeights', JSON.stringify(WEIGHTS));
        }
    } catch (e) { /* fallback to local */ }
}

async function saveRecommendationWeightsToBackend(weights) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/recommendation-weights`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwtToken') || ''}`
            },
            body: JSON.stringify(weights)
        });
        if (res.ok) {
            const data = await res.json();
            const mergedWeights = { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...weights };
            localStorage.setItem('recommendationWeights', JSON.stringify(mergedWeights));
            WEIGHTS = mergedWeights;
            return { success: true, message: data.message || 'Weights updated' };
        } else {
            const err = await res.json();
            return { success: false, message: err.error || 'Failed to update weights' };
        }
    } catch (e) {
        return { success: false, message: 'Network error' };
    }
}

// --- CHORD REGEXES: always use CHORD_TYPES ---
const CHORDS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const NOTE_TO_SEMITONE = {
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

function normalizeBaseNote(note) {
    if (!note || typeof note !== 'string') return note;
    const normalizedInput = note.charAt(0).toUpperCase() + note.slice(1);
    const semitone = NOTE_TO_SEMITONE[normalizedInput];
    if (semitone === undefined) return note;
    const canonical = CHORDS[semitone];
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

const CHORD_TYPE_REGEX = CHORD_TYPES.join("|");
const CHORD_REGEX = new RegExp(`([A-G](?:#|b)?)(?:${CHORD_TYPE_REGEX})?(?:\\/[A-G](?:#|b)?)?`, "gi");
const CHORD_LINE_REGEX = new RegExp(`^(\\s*[A-G](?:#|b)?(?:${CHORD_TYPE_REGEX})?(?:\\/[A-G](?:#|b)?)?[\\s\\-\\/\\|]*)+$`, "i");
const INLINE_CHORD_REGEX = new RegExp(`[\\[(]([A-G](?:#|b)?(?:${CHORD_TYPE_REGEX})?(?:\\/[A-G](?:#|b)?)?)[\\])]`, "gi");

// Re-initialize variables from localStorage (no redeclaration)
jwtToken = localStorage.getItem('jwtToken') || '';
isDarkMode = localStorage.getItem('darkMode') === 'true';

// Update currentUser from localStorage again if needed
try {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) currentUser = JSON.parse(storedUser);
} catch {}

function populateGenreDropdown(id, timeSignature) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '';
    let options = GENRES;
    if (timeSignature && TIME_GENRE_MAP[timeSignature]) {
        options = TIME_GENRE_MAP[timeSignature];
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
        songs: null, // For delta sync - tracks when we last synced songs
        userdata: null,
        'global-setlists': null,
        'my-setlists': null
    }
};



// Initialize cache from localStorage on page load
try {
    const storedSongs = localStorage.getItem('songs');
    const storedSongsTimestamp = localStorage.getItem('songsTimestamp');
    const storedSyncTimestamp = localStorage.getItem('songsSyncTimestamp');

    function isCacheFresh(type, timestamp) {
        if (!timestamp) return false;
        const cacheAge = Date.now() - parseInt(timestamp);
        const expiry = CACHE_EXPIRY[type] || CACHE_EXPIRY.setlists;
        return cacheAge < expiry;
    }

    if (storedSongs && storedSongsTimestamp) {
        if (isCacheFresh('songs', storedSongsTimestamp)) {
            window.dataCache.songs = JSON.parse(storedSongs).map(normalizeSongAccidentals);
            window.dataCache.lastFetch.songs = parseInt(storedSongsTimestamp);
            // Load last sync timestamp for delta sync
            if (storedSyncTimestamp) {
                window.dataCache.lastSyncTimestamp.songs = storedSyncTimestamp;
            }
        } else {
            const cacheAge = Date.now() - parseInt(storedSongsTimestamp);
            const expiry = CACHE_EXPIRY.songs;
            localStorage.removeItem('songs');
            localStorage.removeItem('songsTimestamp');
            localStorage.removeItem('songsSyncTimestamp');
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

// Global authFetch function with timeout and auto-logout on 401
async function authFetch(url, options = {}) {
    const headers = options.headers || {};
    if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
    
    // Add 30-second timeout to prevent long-hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        const response = await fetch(url, { 
            ...options, 
            headers, 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        // Handle 401 Unauthorized - invalid/expired token
        if (response.status === 401 && jwtToken) {
            console.warn('Token invalid or expired - clearing authentication');
            jwtToken = '';
            localStorage.removeItem('jwtToken');
            currentUser = null;
            localStorage.removeItem('currentUser');
            
            // Show re-login notification
            showNotification('Session expired. Please log in again.', 'error');
            
            // Update UI to show login
            if (typeof updateAuthButtons === 'function') {
                updateAuthButtons();
            }
            
            // Redirect to login after brief delay
            setTimeout(() => {
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.style.display = 'flex';
                }
            }, 1000);
        }
        
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn(`Request timeout for ${url}`);
            throw new Error('Request timeout');
        }
        throw error;
    }
}

// Optimized fetch with caching and retry logic
async function cachedFetch(endpoint, forceRefresh = false, retries = 2) {
    const cacheKey = endpoint.replace(`${API_BASE_URL}/api/`, '').split('/')[0].split('?')[0];
    const now = Date.now();
    
    // Check if we have cached data and it's still fresh
    if (!forceRefresh && window.dataCache[cacheKey] && window.dataCache.lastFetch[cacheKey]) {
        const cacheAge = now - window.dataCache.lastFetch[cacheKey];
        const expiry = CACHE_EXPIRY[cacheKey] || CACHE_EXPIRY.setlists;
        
        if (cacheAge < expiry) {
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
                return { ok: true, json: () => Promise.resolve(data) };
            }
            
            // If not a 5xx error, don't retry
            if (response.status < 500) {
                return response;
            }
            
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                // Exponential backoff: wait 1s, then 2s, then 4s
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    // If all retries failed, throw the last error
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

    song = normalizeSongAccidentals(song);
    
    // Update window.dataCache.songs
    if (!window.dataCache.songs) {
        window.dataCache.songs = [];
    }
    
    if (isNewSong) {
        // Check for duplicate before adding
        const existingIndex = window.dataCache.songs.findIndex(s => s.id === song.id);
        if (existingIndex !== -1) {
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
    
    // Update lastSyncTimestamp to prevent re-downloading our own changes
    // Use the song's updatedAt or createdAt timestamp, or current time
    const songTimestamp = song.updatedAt || song.createdAt || new Date().toISOString();
    const currentSyncTime = window.dataCache.lastSyncTimestamp.songs;
    
    // Only update if the new song timestamp is more recent
    if (!currentSyncTime || songTimestamp > currentSyncTime) {
        window.dataCache.lastSyncTimestamp.songs = songTimestamp;
        console.log(`🔄 Updated lastSyncTimestamp to ${songTimestamp} (${isNewSong ? 'new' : 'edited'} song)`);
    }
    
    // Update localStorage with validation
    try {
        localStorage.setItem('songs', JSON.stringify(window.dataCache.songs));
        localStorage.setItem('songsTimestamp', Date.now().toString());
        localStorage.setItem('songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
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
        console.warn('Loading timeout reached - too many songs to download');
        hideLoading();
        
        // Show message asking user to refresh
        const shouldRefresh = confirm('Loading is taking longer than expected due to the large number of songs.\n\nWould you like to refresh the page to retry?');
        if (shouldRefresh) {
            window.location.reload();
        } else {
            showNotification('If songs don\'t load, please refresh the page manually', 5000);
        }
    }, 30000);
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
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

// Global progress update function - callable from any initialization phase
function updateProgress(taskName, customPercent = null) {
    if (customPercent !== null) {
        // For tasks that want to report custom progress
        const task = loadingTasks[taskName];
        if (task) {
            const taskProgress = (customPercent / 100) * task.weight;
            currentProgress = Object.keys(loadingTasks).reduce((total, key) => {
                if (key === taskName) return total + taskProgress;
                return total + (loadingTasks[key].completed ? loadingTasks[key].weight : 0);
            }, 0);
        }
    } else {
        // Mark task as completed
        if (loadingTasks[taskName]) {
            loadingTasks[taskName].completed = true;
            currentProgress = Object.keys(loadingTasks).reduce((total, key) => {
                return total + (loadingTasks[key].completed ? loadingTasks[key].weight : 0);
            }, 0);
        }
    }
    
    const roundedProgress = Math.min(100, Math.round(currentProgress));
    
    // Determine message based on progress
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
        
        // Determine if we should do delta sync or full fetch
        const hasCachedSongs = window.dataCache.songs && window.dataCache.songs.length > 0;
        const lastSyncTime = window.dataCache.lastSyncTimestamp.songs;
        const shouldDeltaSync = hasCachedSongs && lastSyncTime && !forceRefresh;
        
        console.log(`🔄 Sync strategy: ${shouldDeltaSync ? 'DELTA' : 'FULL'} (cached: ${hasCachedSongs}, lastSync: ${lastSyncTime}, force: ${forceRefresh})`);
        
        if (shouldDeltaSync) {
            // ==================== DELTA SYNC ====================
            console.log(`📊 Delta sync since: ${lastSyncTime}`);
            
            // Use cached songs immediately for faster rendering
            songs = (window.dataCache.songs || []).map(normalizeSongAccidentals);
            window.dataCache.songs = songs;
            
            updateProgress('fetchSongs', 20);
            
            try {
                // Fetch delta: new/updated songs + deleted song IDs in parallel
                const [deltaSongsResponse, deletedIdsResponse] = await Promise.all([
                    authFetch(`${API_BASE_URL}/api/songs?since=${encodeURIComponent(lastSyncTime)}`),
                    authFetch(`${API_BASE_URL}/api/songs/deleted?since=${encodeURIComponent(lastSyncTime)}`)
                ]);
                
                updateProgress('fetchSongs', 60);
                
                if (!deltaSongsResponse.ok || !deletedIdsResponse.ok) {
                    console.warn('Delta sync failed, falling back to cached songs');
                    updateProgress('fetchSongs');
                    updateProgress('processSongs');
                } else {
                    const deltaSongs = (await deltaSongsResponse.json()).map(normalizeSongAccidentals);
                    const deletedIds = await deletedIdsResponse.json();
                    
                    console.log(`✨ Delta sync: ${deltaSongs.length} updated, ${deletedIds.length} deleted`);
                    
                    updateProgress('fetchSongs');
                    updateProgress('processSongs', 30);
                    
                    // Merge delta songs into cache
                    if (deltaSongs.length > 0) {
                        // Create a map of existing songs by ID for fast lookup
                        const songMap = new Map(songs.map(s => [s.id, s]));
                        
                        // Update or add delta songs
                        deltaSongs.forEach(song => {
                            songMap.set(song.id, song);
                        });
                        
                        songs = Array.from(songMap.values());
                        console.log(`📝 Merged ${deltaSongs.length} songs into cache`);
                    }
                    
                    updateProgress('processSongs', 60);
                    
                    // Remove deleted songs from cache
                    if (deletedIds.length > 0) {
                        const deletedSet = new Set(deletedIds);
                        const beforeCount = songs.length;
                        songs = songs.filter(s => !deletedSet.has(s.id));
                        console.log(`🗑️ Removed ${beforeCount - songs.length} deleted songs`);
                    }
                    
                    updateProgress('processSongs', 90);
                    
                    // Update cache and localStorage with merged data
                    window.dataCache.songs = songs;
                    window.dataCache.lastFetch.songs = Date.now();
                    window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();
                    
                    try {
                        localStorage.setItem('songs', JSON.stringify(songs));
                        localStorage.setItem('songsTimestamp', Date.now().toString());
                        localStorage.setItem('songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
                    } catch (e) {
                        console.warn('Failed to update localStorage after delta sync:', e);
                    }
                    
                    updateProgress('processSongs');
                }
            } catch (err) {
                console.error('Delta sync error, using cached songs:', err);
                updateProgress('fetchSongs');
                updateProgress('processSongs');
            }
            
        } else {
            // ==================== FULL SYNC ====================
            console.log('📥 Full sync: downloading all songs');
            
            let response;
            try {
                updateProgress('fetchSongs', 10);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                response = await cachedFetch(`${API_BASE_URL}/api/songs`, true); // Force fresh fetch
                
                updateProgress('fetchSongs', 80);
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (err) {
                console.error('Error fetching songs:', err);
                throw err; // Propagate error to be handled by initialization
            }
            
            if (!response.ok) {
                throw new Error('Failed to fetch songs from API');
            }
            
            updateProgress('fetchSongs');
            
            let allSongs = [];
            try {
                updateProgress('processSongs', 20);
                await new Promise(resolve => setTimeout(resolve, 50));
                
                allSongs = (await response.json()).map(normalizeSongAccidentals);
                
                updateProgress('processSongs', 60);
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error('Error processing songs JSON:', e);
                throw e; // Propagate error
            }
            
            // Deduplicate
            const seen = new Set();
            const unique = [];
            for (const s of allSongs) {
                if (!seen.has(s.id)) {
                    seen.add(s.id);
                    unique.push(s);
                }
            }
            window.songs = unique;
            songs = unique;
            
            // Update cache with full dataset and current timestamp
            window.dataCache.songs = unique;
            window.dataCache.lastFetch.songs = Date.now();
            window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();
            
            try {
                localStorage.setItem('songs', JSON.stringify(unique));
                localStorage.setItem('songsTimestamp', Date.now().toString());
                localStorage.setItem('songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
            } catch (e) {
                console.warn('Failed to cache songs to localStorage:', e);
            }
            updateProgress('processSongs');
        }
        
        // ==================== COMMON POST-SYNC LOGIC ====================
        
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
        updateProgress('loadUserData');
        
        // Render songs
        updateProgress('renderSongs', 30);
        if (typeof renderSongs === 'function') {
            try {
                const filters = getCurrentFilterValues();
                renderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
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
        updateProgress('renderSongs');
        
        // Populate dropdowns
        updateProgress('populateDropdowns', 50);
        await new Promise(resolve => setTimeout(resolve, 50));
        updateProgress('populateDropdowns');
        
        console.log(`✅ Sync complete: ${songs.length} songs in cache`);
        
        // Don't hide loading here - let performInitialization() handle it
        // after all initialization steps are complete
        
        return songs;
        
    } catch (error) {
        console.error('Error in loadSongsWithProgress:', error);
        throw error; // Propagate to initialization
    }
}

// Merge all DOMContentLoaded logic into one handler
document.addEventListener('DOMContentLoaded', () => {
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
        if (currentUser && currentUser.id) {
            try {
                const response = await cachedFetch(`${API_BASE_URL}/api/userdata`);
                if (response.ok) {
                    const userData = await response.json();
                    if (userData.transpose) {
                        localStorage.setItem('transposeCache', JSON.stringify(userData.transpose));
                    }
                }
            } catch {}
        }
    }
    updateLocalTransposeCache();

    // Inject spinner overlay and start initialization (only if authenticated)
    (async () => {
        // Inject spinner overlay if absent
        if (!document.getElementById('loadingOverlay')) {
            await fetch('spinner.html')
                .then(r => r.text())
                .then(html => document.body.insertAdjacentHTML('beforeend', html))
                .catch(() => {});
        }

        // Check if user is authenticated
        const token = localStorage.getItem('jwtToken');
        const isAuthenticated = token && isJwtValid(token);

        if (!isAuthenticated) {
            // User not logged in - show auth choice modal and wait
            console.log('⚠️ User not authenticated - showing auth choice modal');
            
            // Show a message instead of loading
            showLoading(0, 'Please sign in to continue');
            
            // Show auth choice modal after a brief delay
            setTimeout(() => {
                hideLoading();
                
                // Show a modal with both Login and Register options
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
                        showLoginModal();
                    };
                    document.getElementById('authRegisterBtn').onclick = () => {
                        modal.style.display = 'none';
                        showRegisterModal();
                    };
                }
                modal.style.display = 'flex';
            }, 500);
            
            return; // Don't initialize until user logs in
        }

        // User is authenticated - proceed with initialization
        if (!initializationState.isInitialized && !initializationState.isInitializing) {
            // Show loading immediately
            showLoading(0, 'Initializing...');
            window.init();
        }
    })();

    // Populate dropdowns once
    populateDropdown('keyFilter', ['Key', ...KEYS]);
    populateDropdown('genreFilter', ['Genre', ...GENRES]);
    populateDropdown('moodFilter', ['Mood', ...MOODS]);
    populateDropdown('artistFilter', ['Artist', ...ARTISTS]);
    populateDropdown('songKey', KEYS);
    populateDropdown('editSongKey', KEYS);
    populateDropdown('songCategory', CATEGORIES);
    populateDropdown('editSongCategory', CATEGORIES);
    populateDropdown('songTime', TIMES);
    populateDropdown('editSongTime', TIMES);
    populateDropdown('songTaal', TAALS);
    populateDropdown('editSongTaal', TAALS);
    populateDropdown('songArtist', ARTISTS);
    populateDropdown('editSongArtist', ARTISTS);
    populateDropdown('songMood', MOODS);
    populateDropdown('editSongMood', MOODS);
    populateRhythmCategoryDropdown('songRhythmCategory');
    populateRhythmCategoryDropdown('editSongRhythmCategory');

    hydrateRhythmFamilies();
    updateRhythmSetIdPreview('songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview');
    updateRhythmSetIdPreview('editSongRhythmFamily', 'editSongRhythmSetNo', 'editSongRhythmSetIdPreview');

    const rhythmFieldBindings = [
        ['songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview'],
        ['editSongRhythmFamily', 'editSongRhythmSetNo', 'editSongRhythmSetIdPreview']
    ];
    rhythmFieldBindings.forEach(([familyId, setNoId, previewId]) => {
        const familyEl = document.getElementById(familyId);
        const setNoEl = document.getElementById(setNoId);
        if (familyEl) {
            familyEl.addEventListener('change', () => updateRhythmSetIdPreview(familyId, setNoId, previewId));
        }
        if (setNoEl) {
            setNoEl.addEventListener('input', () => updateRhythmSetIdPreview(familyId, setNoId, previewId));
        }
    });

    // Genre multiselect (lazy setup; only once each)
    setupSearchableMultiselect('songGenre', 'genreDropdown', 'selectedGenres', GENRES, true);
    setupSearchableMultiselect('editSongGenre', 'editGenreDropdown', 'editSelectedGenres', GENRES, true);
    
    // Mood and Artist multiselects
    setupSearchableMultiselect('songMood', 'moodDropdown', 'selectedMoods', MOODS, true);
    setupSearchableMultiselect('editSongMood', 'editMoodDropdown', 'editSelectedMoods', MOODS, true);
    setupSearchableMultiselect('songArtist', 'artistDropdown', 'selectedArtists', ARTISTS, true);
    setupSearchableMultiselect('editSongArtist', 'editArtistDropdown', 'editSelectedArtists', ARTISTS, true);

    // Theme
    try {
        isDarkMode = localStorage.getItem('darkMode') === 'true';
    } catch (e) {
        // Failed to access localStorage - use default theme
        isDarkMode = false;
    }
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
            try {
                localStorage.setItem('darkMode', isDarkMode);
            } catch (e) {
                // Failed to save theme preference - continue anyway
                console.warn('Failed to save theme preference:', e);
            }
            applyTheme(isDarkMode);
            updateThemeToggleBtn();
        });
    }

    // Initialize floating stop button
    initializeFloatingStopButton();

    // Auth UI
    if (typeof updateAuthButtons === 'function') updateAuthButtons();
    if (jwtToken && isJwtValid(jwtToken) && typeof loadUserData === 'function') {
        loadUserData().then(() => {
            if (typeof updateAuthButtons === 'function') updateAuthButtons();
        });
    } else if (!isJwtValid(jwtToken)) {
        localStorage.removeItem('jwtToken');
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
            const activeTab = document.getElementById('NewTab')?.classList.contains('active') ? 'New' : 'Old';
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
        if (modal) modal.style.display = 'flex';
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
        closeLoginModal.addEventListener('click', () => {
            loginModal.style.display = 'none';
            
            // If app hasn't been initialized yet, remind user to log in
            if (!initializationState.isInitialized && !initializationState.isInitializing) {
                setTimeout(() => {
                    showNotification('Please sign in to access songs and setlists', 'info');
                }, 500);
            }
        });
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
        registerForm.addEventListener('submit', async e => {
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
                const res = await fetch(`${API_BASE_URL}/api/register`, {
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
        });

        initScreenWakeLock();
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async e => {
            e.preventDefault();
            const loginInput = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const errorDiv = document.getElementById('loginError');
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
            try {
                const res = await fetch(`${API_BASE_URL}/api/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernameOrEmail: loginInput, password })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.token) {
                    try {
                        localStorage.setItem('jwtToken', data.token);
                        if (data.user) localStorage.setItem('currentUser', JSON.stringify(data.user));
                    } catch (e) {
                        console.warn('Failed to save authentication data:', e);
                        // Continue anyway - authentication still works for this session
                    }
                    jwtToken = data.token;
                    currentUser = data.user;
                    
                    // Close login modal
                    document.getElementById('loginModal').style.display = 'none';
                    
                    showNotification('Login successful!', 2000);
                    
                    // Check if app was already initialized (subsequent login)
                    if (initializationState.isInitialized) {
                        // App already loaded - just update UI and load user-specific data
                        updateAuthButtons();
                        await loadUserData();
                        await loadMySetlists();
                        await loadSmartSetlistsFromServer();
                        renderMySetlists();
                        renderSmartSetlists();
                    } else if (!initializationState.isInitializing) {
                        // First-time login - start full initialization with loader
                        console.log('🚀 Starting initialization after login...');
                        showLoading(0, 'Initializing...');
                        await window.init();
                        
                        // After initialization, show sidebar on mobile
                        if (window.innerWidth <= 768) {
                            const sidebar = document.querySelector('.sidebar');
                            if (sidebar) {
                                sidebar.classList.remove('hidden');
                                console.log('📱 Mobile: Showing sidebar after login');
                            }
                        }
                    }
                } else {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.style.display = 'block';
                }
            } catch {
                errorDiv.textContent = 'Network error';
                errorDiv.style.display = 'block';
            }
        });
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

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show your custom install button
    const installBtn = document.getElementById('installAppBtn');
    if (installBtn) installBtn.style.display = 'block';
});

document.getElementById('installAppBtn')?.addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
            deferredPrompt = null;
            document.getElementById('installAppBtn').style.display = 'none';
        });
    }
});

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
    if (!select) return;
    select.innerHTML = '';
    if (withLabel) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = 'Select...';
        select.appendChild(opt);
    }
    options.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        select.appendChild(opt);
    });
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

// Generic searchable multiselect function
function setupSearchableMultiselect(inputId, dropdownId, selectedId, dataArray, allowMultiple = true) {
    
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const selectedContainer = document.getElementById(selectedId);
    
    if (!input || !dropdown || !selectedContainer) {
        console.warn(`⚠️ setupSearchableMultiselect - Missing elements!`);
        return;
    }

    // Store original data for filtering
    dropdown.dataset.originalData = JSON.stringify(dataArray);
    
    // Create a property to track all selections (not just visible ones)
    dropdown._allSelections = new Set();
    
    // Render initial options (no selections initially)
    renderMultiselectOptions(dropdownId, dataArray, []);

    // Remove previous listeners if any
    if (input._multiselectListener) input.removeEventListener('input', input._multiselectListener);
    if (input._clickListener) input.removeEventListener('click', input._clickListener);
    if (input._keyListener) input.removeEventListener('keydown', input._keyListener);
    if (dropdown._multiselectListener) dropdown.removeEventListener('click', dropdown._multiselectListener);

    // Make input searchable
    input.removeAttribute('readonly');
    input.style.cursor = 'text';
    input.placeholder = `Search and select...`;
    
    // Keyboard navigation
    input._keyListener = (e) => {
        const options = Array.from(dropdown.querySelectorAll('.multiselect-option'));
        const currentHighlighted = dropdown.querySelector('.multiselect-option.highlighted');
        let currentIndex = options.indexOf(currentHighlighted);
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (options.length > 0) {
                    if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                    currentIndex = currentIndex >= options.length - 1 ? 0 : currentIndex + 1;
                    options[currentIndex].classList.add('highlighted');
                    options[currentIndex].scrollIntoView({ block: 'nearest' });
                }
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (options.length > 0) {
                    if (currentHighlighted) currentHighlighted.classList.remove('highlighted');
                    currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
                    options[currentIndex].classList.add('highlighted');
                    options[currentIndex].scrollIntoView({ block: 'nearest' });
                }
                break;
                
            case ' ':
            case 'Enter':
                e.preventDefault();
                if (currentHighlighted) {
                    const value = currentHighlighted.dataset.value;
                    
                    if (allowMultiple) {
                        // Toggle selection
                        if (dropdown._allSelections.has(value)) {
                            dropdown._allSelections.delete(value);
                            currentHighlighted.classList.remove('selected');
                        } else {
                            dropdown._allSelections.add(value);
                            currentHighlighted.classList.add('selected');
                        }
                    } else {
                        // Single select
                        dropdown._allSelections.clear();
                        dropdown._allSelections.add(value);
                        dropdown.querySelectorAll('.multiselect-option.selected').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        currentHighlighted.classList.add('selected');
                        dropdown.classList.remove('show');
                    }
                    
                    updateSelectedMultiselect(selectedId, dropdownId, allowMultiple, inputId);
                    updateSearchableInput(inputId, selectedId);
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
    input.addEventListener('keydown', input._keyListener);

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
        .map((item, index) => {
            const isSelected = selectedValues.includes(item) ? ' selected' : '';
            const isFirstItem = index === 0 ? ' highlighted' : '';
            return `<div class="multiselect-option${isSelected}${isFirstItem}" data-value="${item}">${item}</div>`;
        })
        .join('');
}

function updateSelectedMultiselect(selectedId, dropdownId, allowMultiple, inputId = null) {
    const container = document.getElementById(selectedId);
    const dropdown = document.getElementById(dropdownId);
    
    if (!container || !dropdown) {
        console.warn(`⚠️ Missing elements - container: ${!!container}, dropdown: ${!!dropdown}`);
        return;
    }
    
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

// Theme toggle function (used by sidebar button and other UI elements)
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
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
        console.error('❌ Initialization failed:', error);
        // Hide loader on error
        hideLoading();
        // Show error notification
        if (typeof showNotification === 'function') {
            showNotification('Failed to load app. Please refresh the page.', 'error');
        }
    } finally {
        initializationState.isInitializing = false;
    }
    
    return initializationState.initPromise;
};

async function performInitialization() {
    // Show loader immediately at 0%
    showLoading(0, 'Initializing...');
    console.log('🚀 Starting app initialization...');
    
    // Restore JWT and user state
    jwtToken = localStorage.getItem('jwtToken') || '';
    if (jwtToken && isJwtValid(jwtToken)) {
        updateAuthButtons();
        await loadUserData();
    } else {
        updateAuthButtons();
    }
    
    // Theme and UI setup
    if (typeof applyTheme === 'function') applyTheme(isDarkMode);
    
    // Genre multiselects
    if (typeof setupSearchableMultiselect === 'function') {
        setupSearchableMultiselect('songGenre', 'genreDropdown', 'selectedGenres', GENRES, true);
        setupSearchableMultiselect('editSongGenre', 'editGenreDropdown', 'editSelectedGenres', GENRES, true);
    }
    
    // Mood and Artist multiselects
    if (typeof setupSearchableMultiselect === 'function') {
        setupSearchableMultiselect('songMood', 'moodDropdown', 'selectedMoods', MOODS, true);
        setupSearchableMultiselect('editSongMood', 'editMoodDropdown', 'editSelectedMoods', MOODS, true);
        setupSearchableMultiselect('songArtist', 'artistDropdown', 'selectedArtists', ARTISTS, true);
        setupSearchableMultiselect('editSongArtist', 'editArtistDropdown', 'editSelectedArtists', ARTISTS, true);
    }
    
    // Always show loading and load songs - let loadSongsWithProgress handle caching
    console.log('� Loading songs with progress indication...');
    await loadSongsWithProgress();
    
    console.log('📊 Songs loaded:', songs.length, '- Loading setlists...');
    
    // Load setlists efficiently (70-80%)
    updateProgress('loadSetlists', 20);
    await loadGlobalSetlists();
    updateProgress('loadSetlists', 50);
    if (jwtToken && isJwtValid(jwtToken)) {
        await loadMySetlists();
        await loadSmartSetlistsFromServer(); // Load smart setlists if authenticated
    }
    updateProgress('loadSetlists', 90);
    
    console.log('✅ Setlists loaded - Setting up UI components...');
    
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
    
    // Create mobile navigation buttons on all screen sizes
    createMobileNavButtons();
    
    // Initialize mobile touch navigation on mobile devices only
    if (window.innerWidth <= 768) {
        addMobileTouchNavigation();
    }
    updateProgress('setupUI', 50);
    
    renderSongs('New', '', '', '', '');
    applyLyricsBackground(document.getElementById('NewTab').classList.contains('active'));
    // connectWebSocket(); // Removed - not needed and may cause delays
    updateSongCount();
    updateProgress('setupUI', 70);
    initScreenWakeLock();
    setupModalClosing();
    setupSuggestedSongsClosing();
    setupModals();
    setupSongStructureTags();
    setupWindowCloseConfirmation();
    updateProgress('setupUI', 90);
    // Handle initial page load with hash
    if (window.location.hash) {
        const songId = parseInt(window.location.hash.replace('#song-', ''));
        const song = songs.find(s => s.id === songId);
        if (song) {
            navigationHistory = [song.id];
            currentHistoryPosition = 0;
            history.replaceState({ songId: song.id, position: 0 }, '', `#song-${song.id}`);
            // Determine context based on current view
            const historyContext = currentSetlistType === 'global' ? 'global-setlist' : 
                                 currentSetlistType === 'personal' ? 'user-setlist' : 'all-songs';
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
                // Determine context based on current view
                const historyContext = currentSetlistType === 'global' ? 'global-setlist' : 
                                     currentSetlistType === 'personal' ? 'user-setlist' : 'all-songs';
                showPreview(song, true, historyContext);
            } else {
                songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics">No song is selected</div>';
            }
        }
    });
    updateProgress('setupUI');
    
    // Admin panel button
    if (typeof updateAdminPanelBtn === 'function') updateAdminPanelBtn();
    
    console.log('🎨 UI components ready - Finalizing...');
    
    // Final setup (95-100%)
    updateProgress('finalSetup', 50);
    updateProgress('finalSetup'); // Mark as complete -> 100%
    
    // All initialization complete - hide loader
    console.log('✅ App initialization complete - hiding loader');
    setTimeout(() => {
        hideLoading();
        
        // On mobile, ensure sidebar is visible after first load
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && sidebar.classList.contains('hidden')) {
                sidebar.classList.remove('hidden');
                console.log('📱 Mobile: Showing sidebar after initialization');
            }
        }
    }, 300); // Small delay to ensure UI has rendered
}

// --- JWT expiry helpers: must be at the very top ---
// ===== GENRE MULTISELECT LOGIC =====
// Helper to update Taal dropdowns - shows ALL taals regardless of time signature
function updateTaalDropdown(timeSelectId, taalSelectId, selectedTaal = null) {
    const timeSelect = document.getElementById(timeSelectId);
    const taalSelect = document.getElementById(taalSelectId);
    if (!timeSelect || !taalSelect) return;
    // Show ALL taals from TAALS constant, not just filtered by time signature
    const taals = TAALS;
    taalSelect.innerHTML = '';
    // Add default option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select Taal/Genre';
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
        // songs is now global - don't redeclare it here
        let favorites = [];
        let keepScreenOn = false;
        let autoScrollSpeed;
        try {
            autoScrollSpeed = localStorage.getItem('autoScrollSpeed') || 1500;
        } catch (e) {
            // Failed to read from localStorage - use default
            autoScrollSpeed = 1500;
        }
        let suggestedSongsDrawerOpen = false;
        let isScrolling = false;

        // New setlist variables
        let globalSetlists = [];
        let mySetlists = [];
        let currentViewingSetlist = null;
        let currentSetlistType = null; // 'global' or 'my'
        let activeSetlistElementId = null; // Track which setlist item is active in sidebar

        // Update currentUser from localStorage (no redeclaration needed)
        try {
            const s = localStorage.getItem('currentUser');
            currentUser = s ? JSON.parse(s) : null;
        } catch { 
            currentUser = null; 
        }
         isDarkMode = localStorage.getItem('darkMode') === 'true';




        if (API_BASE_URL.includes('localhost')) {
            // Using LOCAL backend
        } else {
            // Using PROD backend
        }


        // Restore JWT token and user state on every refresh
        if (!jwtToken && localStorage.getItem('jwtToken')) {
            jwtToken = localStorage.getItem('jwtToken');
        }

        // On script load, update UI and user data if logged in and token is valid
        if (jwtToken && isJwtValid(jwtToken)) {
            loadUserData().then(() => {
                updateAuthButtons();
            });
        } else if (jwtToken && !isJwtValid(jwtToken)) {
            // Remove expired token only if it is actually expired
            localStorage.removeItem('jwtToken');
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
    
        function updateSongCount() {
            document.getElementById('totalSongs').textContent = songs.length;
            document.getElementById('NewCount').textContent = songs.filter(s => s.category === 'New').length;
            document.getElementById('OldCount').textContent = songs.filter(s => s.category === 'Old').length;
        }
    
        // Old setlist arrays removed - now using dropdown setlist system only

        // DOM Elements
        const NewTab = document.getElementById('NewTab');
        const OldTab = document.getElementById('OldTab');
        const NewContent = document.getElementById('NewContent');
        const OldContent = document.getElementById('OldContent');
        const keyFilter = document.getElementById('keyFilter');
        const genreFilter = document.getElementById('genreFilter');
        const moodFilter = document.getElementById('moodFilter');
        const artistFilter = document.getElementById('artistFilter');
        const songPreviewEl = document.getElementById('songPreview');
        const showAllEl = document.getElementById('showAll');
        const showFavoritesEl = document.getElementById('showFavorites');
        const setlistSection = document.getElementById('setlistSection');
        const NewSetlistSongs = document.getElementById('NewSetlistSongs');
        const OldSetlistSongs = document.getElementById('OldSetlistSongs');
        const NewSetlistTab = document.getElementById('NewSetlistTab');
        const OldSetlistTab = document.getElementById('OldSetlistTab');
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
    const toggleAutoScrollBtn = document.getElementById('toggleAutoScroll');
    const keepScreenOnBtn = document.getElementById('keepScreenOnBtn');
    const editSetlistSectionBtn = document.getElementById('editSetlistSectionBtn');
    const resequenceSetlistSectionBtn = document.getElementById('resequenceSetlistSectionBtn');
    if (resequenceSetlistSectionBtn) {
        resequenceSetlistSectionBtn.onclick = async function() {
            if (!currentViewingSetlist) {
                showNotification('No setlist is currently loaded', 'error');
                return;
            }
            if (!window.setlistResequenceMode) {
                window.setlistResequenceMode = true;
                resequenceSetlistSectionBtn.textContent = 'Save Sequence';
                refreshSetlistDisplay();
            } else {
                // Save new sequence to backend
                const endpoint = currentSetlistType === 'global' ? '/api/global-setlists' : '/api/my-setlists';
                await authFetch(`${API_BASE_URL}${endpoint}/${currentViewingSetlist._id}`, {
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
            return a.username.localeCompare(b.username); // Secondary sort by username
        });
        
        sortedUsers.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="max-width:180px;overflow-wrap:break-word;">${user.username}</td>
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
        document.getElementById('weightLanguage').value = WEIGHTS.language ?? 0;
        document.getElementById('weightScale').value = WEIGHTS.scale ?? 0;
        document.getElementById('weightTimeSignature').value = WEIGHTS.timeSignature ?? 0;
        document.getElementById('weightTaal').value = WEIGHTS.taal ?? 0;
        document.getElementById('weightTempo').value = WEIGHTS.tempo ?? 0;
        document.getElementById('weightGenre').value = WEIGHTS.genre ?? 0;
        document.getElementById('weightVocal').value = WEIGHTS.vocal ?? 0;
        document.getElementById('weightMood').value = WEIGHTS.mood ?? 0;
        document.getElementById('weightRhythmCategory').value = WEIGHTS.rhythmCategory ?? 0;
        
        // Calculate and display total
        const total = (WEIGHTS.language || 0) + (WEIGHTS.scale || 0) + (WEIGHTS.timeSignature || 0) +
                      (WEIGHTS.taal || 0) + (WEIGHTS.tempo || 0) + (WEIGHTS.genre || 0) +
                      (WEIGHTS.vocal || 0) + (WEIGHTS.mood || 0) + (WEIGHTS.rhythmCategory || 0);
        const bar = document.getElementById('weightsTotalBar');
        if (bar) {
            bar.textContent = `Total: ${total} / 100`;
            bar.style.color = (total === 100) ? '#27ae60' : '#e74c3c';
        }
    }

    const RHYTHM_SET_STATUS_OPTIONS = ['active', 'inactive', 'archived'];

    function showRhythmSetsNotification(message, type = 'info') {
        const notif = document.getElementById('rhythmSetsNotification');
        if (!notif) return;

        notif.textContent = message;
        notif.style.display = 'block';
        if (type === 'success') {
            notif.style.background = '#e0ffe0';
            notif.style.color = '#155724';
        } else if (type === 'error') {
            notif.style.background = '#ffe0e0';
            notif.style.color = '#b30000';
        } else {
            notif.style.background = '';
            notif.style.color = '';
        }
    }

    function renderRhythmSetsTable(rhythmSets) {
        const tbody = document.querySelector('#rhythmSetsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!Array.isArray(rhythmSets) || !rhythmSets.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.style.padding = '12px 8px';
            td.textContent = 'No rhythm sets found.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        rhythmSets.forEach(set => {
            const tr = document.createElement('tr');
            tr.dataset.rhythmSetId = set.rhythmSetId || '';

            const idCell = document.createElement('td');
            idCell.style.padding = '10px 8px';
            const idStrong = document.createElement('strong');
            idStrong.textContent = set.rhythmSetId || '-';
            const idSub = document.createElement('div');
            idSub.style.fontSize = '0.9em';
            idSub.style.opacity = '0.85';
            idSub.textContent = `${set.rhythmFamily || '-'} / ${set.rhythmSetNo || '-'}`;
            idCell.appendChild(idStrong);
            idCell.appendChild(idSub);

            const statusCell = document.createElement('td');
            statusCell.style.padding = '10px 8px';
            const statusSelect = document.createElement('select');
            statusSelect.className = 'rhythm-set-status-select';
            const statusOptions = new Set(RHYTHM_SET_STATUS_OPTIONS);
            if (set.status) statusOptions.add(String(set.status));
            Array.from(statusOptions).forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                if (String(set.status || 'active') === status) {
                    option.selected = true;
                }
                statusSelect.appendChild(option);
            });
            statusCell.appendChild(statusSelect);

            const mappedCell = document.createElement('td');
            mappedCell.style.padding = '10px 8px';
            mappedCell.textContent = String(set.mappedSongCount || 0);

            const filesCell = document.createElement('td');
            filesCell.style.padding = '10px 8px';
            const files = Array.isArray(set.availableFiles) ? set.availableFiles : [];
            const filesHeader = document.createElement('div');
            filesHeader.textContent = `${files.length}/6 ${set.isComplete ? '(complete)' : '(incomplete)'}`;
            const filesSub = document.createElement('div');
            filesSub.style.fontSize = '0.9em';
            filesSub.style.opacity = '0.85';
            filesSub.textContent = files.length ? files.join(', ') : 'No files linked';
            filesCell.appendChild(filesHeader);
            filesCell.appendChild(filesSub);

            const notesCell = document.createElement('td');
            notesCell.style.padding = '10px 8px';
            const notesInput = document.createElement('textarea');
            notesInput.className = 'rhythm-set-notes-input';
            notesInput.rows = 2;
            notesInput.style.width = '100%';
            notesInput.value = set.notes || '';
            notesCell.appendChild(notesInput);

            const updatedCell = document.createElement('td');
            updatedCell.style.padding = '10px 8px';
            updatedCell.textContent = set.updatedAt ? new Date(set.updatedAt).toLocaleString() : '-';

            const actionsCell = document.createElement('td');
            actionsCell.style.padding = '10px 8px';

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn rhythm-set-save-btn';
            saveBtn.textContent = 'Save';

            const recomputeBtn = document.createElement('button');
            recomputeBtn.type = 'button';
            recomputeBtn.className = 'btn rhythm-set-recompute-btn';
            recomputeBtn.style.marginLeft = '6px';
            recomputeBtn.textContent = 'Recompute';

            actionsCell.appendChild(saveBtn);
            actionsCell.appendChild(recomputeBtn);

            tr.appendChild(idCell);
            tr.appendChild(statusCell);
            tr.appendChild(mappedCell);
            tr.appendChild(filesCell);
            tr.appendChild(notesCell);
            tr.appendChild(updatedCell);
            tr.appendChild(actionsCell);
            tbody.appendChild(tr);
        });
    }

    async function loadRhythmSets() {
        try {
            const res = await authFetch(`${API_BASE_URL}/api/rhythm-sets`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to load rhythm sets' }));
                throw new Error(err.error || 'Failed to load rhythm sets');
            }
            const rhythmSets = await res.json();
            renderRhythmSetsTable(rhythmSets);
        } catch (error) {
            showRhythmSetsNotification(error.message || 'Failed to load rhythm sets', 'error');
        }
    }

    async function createRhythmSetFromForm() {
        const rhythmFamilyInput = document.getElementById('rhythmSetFamilyInput');
        const rhythmSetNoInput = document.getElementById('rhythmSetNoInput');
        const rhythmSetStatusInput = document.getElementById('rhythmSetStatusInput');
        const rhythmSetNotesInput = document.getElementById('rhythmSetNotesInput');

        if (!rhythmFamilyInput || !rhythmSetNoInput || !rhythmSetStatusInput || !rhythmSetNotesInput) {
            return;
        }

        const payload = {
            rhythmFamily: rhythmFamilyInput.value,
            rhythmSetNo: parseInt(rhythmSetNoInput.value, 10),
            status: rhythmSetStatusInput.value,
            notes: rhythmSetNotesInput.value
        };

        if (!payload.rhythmFamily || !payload.rhythmSetNo || payload.rhythmSetNo <= 0) {
            showRhythmSetsNotification('Rhythm family and positive set number are required.', 'error');
            return;
        }

        try {
            showRhythmSetsNotification('Creating rhythm set...');
            const res = await authFetch(`${API_BASE_URL}/api/rhythm-sets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to create rhythm set' }));
                showRhythmSetsNotification(err.error || 'Failed to create rhythm set', 'error');
                return;
            }

            rhythmSetNoInput.value = '';
            rhythmSetNotesInput.value = '';
            showRhythmSetsNotification('Rhythm set created successfully.', 'success');
            await loadRhythmSets();
        } catch (error) {
            showRhythmSetsNotification(error.message || 'Failed to create rhythm set', 'error');
        }
    }

    async function saveRhythmSetRow(rhythmSetId, status, notes) {
        const res = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, notes })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to save rhythm set' }));
            throw new Error(err.error || 'Failed to save rhythm set');
        }

        return res.json();
    }

    async function recomputeRhythmSetRow(rhythmSetId) {
        const res = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}/recompute`, {
            method: 'PUT'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to recompute rhythm set' }));
            throw new Error(err.error || 'Failed to recompute rhythm set');
        }

        return res.json();
    }
    
    function showAdminPanelModal() {
        if (!document.getElementById('adminPanelModal')) {
            console.error('Admin panel modal element not found');
            return;
        }
        
        document.getElementById('adminPanelModal').style.display = 'flex';
        
        // Set active tab
        const userMgmtTab = document.getElementById('userMgmtTab');
        const userMgmtTabContent = document.getElementById('userMgmtTabContent');
        const weightsTab = document.getElementById('weightsTab');
        const weightsTabContent = document.getElementById('weightsTabContent');
        const rhythmSetsTab = document.getElementById('rhythmSetsTab');
        const rhythmSetsTabContent = document.getElementById('rhythmSetsTabContent');
        
        if (userMgmtTab) userMgmtTab.classList.add('active');
        if (userMgmtTabContent) userMgmtTabContent.classList.add('active');
        if (userMgmtTabContent) userMgmtTabContent.style.display = '';
        
        // Hide other tabs
        if (weightsTab) weightsTab.classList.remove('active');
        if (weightsTabContent) weightsTabContent.classList.remove('active');
        if (weightsTabContent) weightsTabContent.style.display = 'none';
        if (rhythmSetsTab) rhythmSetsTab.classList.remove('active');
        if (rhythmSetsTabContent) rhythmSetsTabContent.classList.remove('active');
        if (rhythmSetsTabContent) rhythmSetsTabContent.style.display = 'none';
        
        // Load users and set up functions
        loadUsers();
        window.markAdmin = markAdmin;
    }
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn) {
        adminPanelBtn.onclick = () => showAdminPanelModal();
    }

    // Tab switching logic for admin panel
    const userMgmtTab = document.getElementById('userMgmtTab');
    if (userMgmtTab) {
        userMgmtTab.onclick = function() {
            // Set active tab
            const userMgmtTabContent = document.getElementById('userMgmtTabContent');
            const weightsTab = document.getElementById('weightsTab');
            const weightsTabContent = document.getElementById('weightsTabContent');
            const rhythmSetsTab = document.getElementById('rhythmSetsTab');
            const rhythmSetsTabContent = document.getElementById('rhythmSetsTabContent');
            
            userMgmtTab.classList.add('active');
            if (userMgmtTabContent) userMgmtTabContent.classList.add('active');
            if (userMgmtTabContent) userMgmtTabContent.style.display = '';
            
            // Remove active from other tabs
            if (weightsTab) weightsTab.classList.remove('active');
            if (weightsTabContent) weightsTabContent.classList.remove('active');
            if (weightsTabContent) weightsTabContent.style.display = 'none';
            if (rhythmSetsTab) rhythmSetsTab.classList.remove('active');
            if (rhythmSetsTabContent) rhythmSetsTabContent.classList.remove('active');
            if (rhythmSetsTabContent) rhythmSetsTabContent.style.display = 'none';
        };
    }
    
    const weightsTab = document.getElementById('weightsTab');
    if (weightsTab) {
        weightsTab.onclick = function() {
            // Set active tab
            const weightsTabContent = document.getElementById('weightsTabContent');
            const userMgmtTabContent = document.getElementById('userMgmtTabContent');
            const rhythmSetsTab = document.getElementById('rhythmSetsTab');
            const rhythmSetsTabContent = document.getElementById('rhythmSetsTabContent');
            
            weightsTab.classList.add('active');
            if (weightsTabContent) weightsTabContent.classList.add('active');
            if (weightsTabContent) weightsTabContent.style.display = '';
            
            // Remove active from other tabs
            if (userMgmtTab) userMgmtTab.classList.remove('active');
            if (userMgmtTabContent) userMgmtTabContent.classList.remove('active');
            if (userMgmtTabContent) userMgmtTabContent.style.display = 'none';
            if (rhythmSetsTab) rhythmSetsTab.classList.remove('active');
            if (rhythmSetsTabContent) rhythmSetsTabContent.classList.remove('active');
            if (rhythmSetsTabContent) rhythmSetsTabContent.style.display = 'none';
            
            // Load weights when switching to weights tab
            loadWeightsToForm();
        };
    }

    const rhythmSetsTab = document.getElementById('rhythmSetsTab');
    if (rhythmSetsTab) {
        rhythmSetsTab.onclick = function() {
            const userMgmtTabContent = document.getElementById('userMgmtTabContent');
            const weightsTab = document.getElementById('weightsTab');
            const weightsTabContent = document.getElementById('weightsTabContent');
            const rhythmSetsTabContent = document.getElementById('rhythmSetsTabContent');

            rhythmSetsTab.classList.add('active');
            if (rhythmSetsTabContent) rhythmSetsTabContent.classList.add('active');
            if (rhythmSetsTabContent) rhythmSetsTabContent.style.display = '';

            if (userMgmtTab) userMgmtTab.classList.remove('active');
            if (userMgmtTabContent) userMgmtTabContent.classList.remove('active');
            if (userMgmtTabContent) userMgmtTabContent.style.display = 'none';
            if (weightsTab) weightsTab.classList.remove('active');
            if (weightsTabContent) weightsTabContent.classList.remove('active');
            if (weightsTabContent) weightsTabContent.style.display = 'none';

            loadRhythmSets();
        };
    }

    // --- String Similarity Helper (used for duplicate detection during song addition) ---
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

    // Removed: findDuplicateSongs() and renderDuplicateDetection() - no longer needed
    // Duplicate detection during song addition is still active via stringSimilarity()

    // Centralized song deletion logic
    async function deleteSongById(songId, postDeleteCallback) {
        try {
            const resp = await authFetch(`${API_BASE_URL}/api/songs/${songId}`, {
                method: 'DELETE'
            });
            if (resp.ok) {
                // Remove from global songs array
                songs = songs.filter(s => s.id !== songId);
                
                // Remove from cache
                if (window.dataCache.songs) {
                    window.dataCache.songs = window.dataCache.songs.filter(s => s.id !== songId);
                }
                
                // Update localStorage
                localStorage.setItem('songs', JSON.stringify(songs));
                
                // Update lastSyncTimestamp to prevent re-syncing deleted song
                window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();
                localStorage.setItem('songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
                
                console.log(`🗑️ Deleted song ${songId} from cache and backend`);
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
            
            // Parse the selection to get type and ID
            if (selectedValue.startsWith('global_')) {
                const setlistId = selectedValue.replace('global_', '');
                activeSetlistElementId = setlistId; // Track for back button
                showGlobalSetlistInMainSection(setlistId);
            } else if (selectedValue.startsWith('my_')) {
                const setlistId = selectedValue.replace('my_', '');
                activeSetlistElementId = setlistId; // Track for back button
                showMySetlistInMainSection(setlistId);
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
            localStorage.setItem('selectedSetlist', value);
        } else {
            localStorage.removeItem('selectedSetlist');
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
        
        if (!setlistDropdown || !dropdownMenu || !dropdownText) {
            return;
        }
        
        // Store the current selection to preserve it
        const currentSelection = setlistDropdown.value;
        
        // Clear existing options and menu items
        setlistDropdown.innerHTML = '<option value="">Select a Setlist</option>';
        dropdownMenu.innerHTML = '';
        
        // Check if we have real data
        let hasGlobalData = globalSetlists && globalSetlists.length > 0;
        let hasMyData = mySetlists && mySetlists.length > 0;
        
        // Add default option to custom dropdown
        const defaultOption = document.createElement('div');
        defaultOption.className = 'dropdown-option';
        defaultOption.dataset.value = '';
        defaultOption.textContent = 'Select a Setlist';
        defaultOption.style.cssText = 'font-style: italic; color: #aaa;';
        dropdownMenu.appendChild(defaultOption);
        
        // Only show real setlists that exist in the database
        // Add real My Setlists first with compact suffix (if user is logged in)
        if (currentUser && hasMyData) {
            mySetlists.forEach(setlist => {
                // Add to original select (hidden)
                const option = document.createElement('option');
                option.value = `my_${setlist._id}`;
                option.textContent = `${setlist.name} (My)`;
                setlistDropdown.appendChild(option);
                
                // Add to custom dropdown with suffix
                const customOption = document.createElement('div');
                customOption.className = 'dropdown-option';
                customOption.dataset.value = `my_${setlist._id}`;
                customOption.dataset.type = 'my';
                customOption.dataset.setlistId = setlist._id;
                customOption.innerHTML = `${setlist.name} <span style="color: #888; font-size: 0.85em; float: right;">(My)</span>`;
                dropdownMenu.appendChild(customOption);
            });
        }
        
        // Add real Global Setlists second with compact suffix
        if (hasGlobalData) {
            globalSetlists.forEach(setlist => {
                // Add to original select (hidden)
                const option = document.createElement('option');
                option.value = `global_${setlist._id}`;
                option.textContent = `${setlist.name} (Global)`;
                setlistDropdown.appendChild(option);
                
                // Add to custom dropdown with suffix
                const customOption = document.createElement('div');
                customOption.className = 'dropdown-option';
                customOption.dataset.value = `global_${setlist._id}`;
                customOption.dataset.type = 'global';
                customOption.dataset.setlistId = setlist._id;
                customOption.innerHTML = `${setlist.name} <span style="color: #888; font-size: 0.85em; float: right;">(Global)</span>`;
                dropdownMenu.appendChild(customOption);
            });
        }
        
        // Show helpful message when no setlists are available
        if (!hasGlobalData && (!currentUser || !hasMyData)) {
            const helpOption = document.createElement('option');
            helpOption.value = '';
            helpOption.disabled = true;
            helpOption.textContent = currentUser ? 'Create your first setlist to get started' : 'Login to create and access setlists';
            setlistDropdown.appendChild(helpOption);
            
            // Add to custom dropdown
            const helpCustomOption = document.createElement('div');
            helpCustomOption.className = 'dropdown-option';
            helpCustomOption.style.color = '#888';
            helpCustomOption.style.fontStyle = 'italic';
            helpCustomOption.textContent = currentUser ? 'Create your first setlist to get started' : 'Login to create and access setlists';
            dropdownMenu.appendChild(helpCustomOption);
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
            const savedSelection = localStorage.getItem('selectedSetlist');
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

    // Initialize song selection with checkboxes for setlist creation (Old and New songs)
    function initializeSetlistSongSelection(prefix) {
        const searchInput = document.getElementById(`${prefix}SetlistSongSearch`);
        const oldSongList = document.getElementById(`${prefix}OldSongSelectionList`);
        const newSongList = document.getElementById(`${prefix}NewSongSelectionList`);
        const selectAllOldCheckbox = document.getElementById(`${prefix}SelectAllOldSongs`);
        const selectAllNewCheckbox = document.getElementById(`${prefix}SelectAllNewSongs`);
        const selectedCountSpan = document.getElementById(`${prefix}SelectedCount`);
        const selectedOldCountSpan = document.getElementById(`${prefix}SelectedOldCount`);
        const selectedNewCountSpan = document.getElementById(`${prefix}SelectedNewCount`);
        
        // New tab elements
        const oldSongsTab = document.getElementById(`${prefix}OldSongsTab`);
        const newSongsTab = document.getElementById(`${prefix}NewSongsTab`);
        const oldSongsContent = document.getElementById(`${prefix}OldSongsContent`);
        const newSongsContent = document.getElementById(`${prefix}NewSongsContent`);
        const oldSongsCount = document.getElementById(`${prefix}OldSongsCount`);
        const newSongsCount = document.getElementById(`${prefix}NewSongsCount`);
        
        // Filter elements
        const keyFilter = document.getElementById(`${prefix}KeyFilter`);
        const genreFilter = document.getElementById(`${prefix}GenreFilter`);
        const moodFilter = document.getElementById(`${prefix}MoodFilter`);
        const artistFilter = document.getElementById(`${prefix}ArtistFilter`);
        
        if (!searchInput || !oldSongList || !newSongList || !selectAllOldCheckbox || !selectAllNewCheckbox || 
            !selectedCountSpan || !selectedOldCountSpan || !selectedNewCountSpan ||
            !oldSongsTab || !newSongsTab || !oldSongsContent || !newSongsContent) {
            return;
        }

        let selectedSongs = [];
        let filteredOldSongs = [];
        let filteredNewSongs = [];
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
                KEYS.forEach(key => {
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

        // Separate songs into old and new based on the `category` property
        function categorizeSongs() {
            const oldSongs = songs.filter(song => song.category === 'Old');
            const newSongs = songs.filter(song => song.category === 'New');
            
            // Apply filters
            filteredOldSongs = applyFilters(oldSongs);
            filteredNewSongs = applyFilters(newSongs);
            
            // Update counts
            if (oldSongsCount) oldSongsCount.textContent = filteredOldSongs.length;
            if (newSongsCount) newSongsCount.textContent = filteredNewSongs.length;
            
            return { oldSongs: filteredOldSongs, newSongs: filteredNewSongs };
        }

        // Filter and display songs based on current filters
        function filterAndDisplaySongs() {
            categorizeSongs();
            renderSongLists();
            updateSelectAllStates();
        }

        // Render both old and new song lists
        function renderSongLists() {
            renderSongList(oldSongList, filteredOldSongs, 'old');
            renderSongList(newSongList, filteredNewSongs, 'new');
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
            const selectedOldSongs = selectedSongs.filter(id => {
                const song = songs.find(s => s.id === id);
                return song && song.category === 'Old';
            });
            const selectedNewSongs = selectedSongs.filter(id => {
                const song = songs.find(s => s.id === id);
                return song && song.category === 'New';
            });
            
            selectedCountSpan.textContent = selectedSongs.length;
            selectedOldCountSpan.textContent = selectedOldSongs.length;
            selectedNewCountSpan.textContent = selectedNewSongs.length;
            
            // Get the separate tab containers
            const selectedOldSongsList = document.getElementById(`${prefix}SelectedOldSongsList`);
            const selectedNewSongsList = document.getElementById(`${prefix}SelectedNewSongsList`);
            
            // Clear both containers
            if (selectedOldSongsList) selectedOldSongsList.innerHTML = '';
            if (selectedNewSongsList) selectedNewSongsList.innerHTML = '';
            
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
                            const arr = category === 'Old' ? selectedOldSongs : selectedNewSongs;
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
                            const arr = category === 'Old' ? selectedOldSongs : selectedNewSongs;
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
                    const arr = category === 'Old' ? selectedOldSongs : selectedNewSongs;
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
                        selectedSongs.splice(insertAt + (category === 'Old' ? 0 : selectedOldSongs.length), 0, draggedId);
                        updateSelectedSongsDisplay();
                    }
                });
            }

            // Show selected old songs in old tab
            if (selectedOldSongs.length > 0 && selectedOldSongsList) {
                renderResequencableList(selectedOldSongs, selectedOldSongsList, 'Old');
            }

            // Show selected new songs in new tab
            if (selectedNewSongs.length > 0 && selectedNewSongsList) {
                renderResequencableList(selectedNewSongs, selectedNewSongsList, 'New');
            }
        }

        // Update select all checkbox states for both categories
        function updateSelectAllStates() {
            // Get current filtered songs without re-rendering
            const oldSongs = songs.filter(song => song.category === 'Old');
            const newSongs = songs.filter(song => song.category === 'New');
            const currentFilteredOldSongs = applyFilters(oldSongs);
            const currentFilteredNewSongs = applyFilters(newSongs);
            
            updateSelectAllState(selectAllOldCheckbox, currentFilteredOldSongs, 'old');
            updateSelectAllState(selectAllNewCheckbox, currentFilteredNewSongs, 'new');
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
        selectAllOldCheckbox.addEventListener('change', (e) => {
            handleSelectAll(e.target, filteredOldSongs);
        });

        selectAllNewCheckbox.addEventListener('change', (e) => {
            handleSelectAll(e.target, filteredNewSongs);
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
            if (oldSongsTab && newSongsTab && oldSongsContent && newSongsContent) {
                oldSongsTab.addEventListener('click', () => {
                    oldSongsTab.classList.add('active');
                    newSongsTab.classList.remove('active');
                    oldSongsContent.classList.add('active');
                    newSongsContent.classList.remove('active');
                });

                newSongsTab.addEventListener('click', () => {
                    newSongsTab.classList.add('active');
                    oldSongsTab.classList.remove('active');
                    newSongsContent.classList.add('active');
                    oldSongsContent.classList.remove('active');
                });
            }
            
            // Selected songs tabs
            const selectedOldTab = document.getElementById(`${prefix}SelectedOldTab`);
            const selectedNewTab = document.getElementById(`${prefix}SelectedNewTab`);
            const selectedOldContent = document.getElementById(`${prefix}SelectedOldContent`);
            const selectedNewContent = document.getElementById(`${prefix}SelectedNewContent`);
            
            if (selectedOldTab && selectedNewTab && selectedOldContent && selectedNewContent) {
                selectedOldTab.addEventListener('click', () => {
                    selectedOldTab.classList.add('active');
                    selectedNewTab.classList.remove('active');
                    selectedOldContent.classList.add('active');
                    selectedNewContent.classList.remove('active');
                });

                selectedNewTab.addEventListener('click', () => {
                    selectedNewTab.classList.add('active');
                    selectedOldTab.classList.remove('active');
                    selectedNewContent.classList.add('active');
                    selectedOldContent.classList.remove('active');
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
        if (selectAllOldCheckbox) {
            selectAllOldCheckbox.addEventListener('change', (e) => {
                handleSelectAll(e.target, filteredOldSongs);
            });
        }

        if (selectAllNewCheckbox) {
            selectAllNewCheckbox.addEventListener('change', (e) => {
                handleSelectAll(e.target, filteredNewSongs);
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
                return;
            }
            
            const res = await cachedFetch(`${API_BASE_URL}/api/global-setlists`, forceRefresh);
            if (res.ok) {
                globalSetlists = await res.json();
                // Only update dropdown, do not re-render sidebar here
                populateSetlistDropdown(); // Update dropdown when global setlists load
            }
        } catch (err) {
            console.error('Failed to load global setlists:', err);
        }
    }

    // Load my setlists
    async function loadMySetlists(forceRefresh = false) {
        if (!jwtToken) return;
        try {
            // Skip if already cached and not forcing refresh
            if (!forceRefresh && window.dataCache['my-setlists']) {
                mySetlists = window.dataCache['my-setlists'];
                return;
            }
            
            const res = await cachedFetch(`${API_BASE_URL}/api/my-setlists`, forceRefresh);
            if (res.ok) {
                mySetlists = await res.json();
                // Only update dropdown, do not re-render sidebar here
                populateSetlistDropdown(); // Update dropdown when my setlists load
            }
        } catch (err) {
            console.error('Failed to load my setlists:', err);
        }
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
            }
            
            // Update dropdown with latest data
            populateSetlistDropdown();
            
            // Re-render the currently viewing setlist if one is open
            if (currentViewingSetlist) {
                // Update currentViewingSetlist with fresh data from the arrays
                if (currentSetlistType === 'global') {
                    const updated = globalSetlists.find(s => s._id === currentViewingSetlist._id);
                    if (updated) currentViewingSetlist = updated;
                } else if (currentSetlistType === 'my') {
                    const updated = mySetlists.find(s => s._id === currentViewingSetlist._id);
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

    // Function to update all setlist button states based on current setlist data
    function updateAllSetlistButtonStates() {
        // Get the currently selected setlist to check song membership
        const setlistDropdown = document.getElementById('setlistDropdown');
        if (!setlistDropdown || !setlistDropdown.value) {
            return; // No setlist selected, can't update button states
        }
        
        const selectedSetlistId = setlistDropdown.value;
        let currentSetlist = null;
        
        // Find the selected setlist in our data
        if (selectedSetlistId.startsWith('global_')) {
            const actualId = selectedSetlistId.replace('global_', '');
            currentSetlist = globalSetlists.find(s => s._id === actualId);
        } else if (selectedSetlistId.startsWith('my_')) {
            const actualId = selectedSetlistId.replace('my_', '');
            currentSetlist = mySetlists.find(s => s._id === actualId);
        }
        
        if (!currentSetlist || !currentSetlist.songs) {
            return; // No setlist found or no songs data
        }
        
        // Update button states for all songs in the interface
        songs.forEach(song => {
            // Check if this song is in the current setlist
            const isInSetlist = currentSetlist.songs.some(setlistSong => {
                // Handle both ID-only format and full song object format
                if (typeof setlistSong === 'object' && setlistSong.id) {
                    return setlistSong.id === song.id;
                } else {
                    return setlistSong === song.id;
                }
            });
            
            // Update button state for this song
            updateSetlistButtonState(song.id, isInSetlist);
        });
    }

    // Show setlist description in sidebar
    function showSetlistDescription(setlist, type) {
        let containerId, textId;
        
        if (type === 'global') {
            containerId = 'globalSetlistDescriptionContainer';
            textId = 'globalSetlistDescriptionText';
        } else if (type === 'my') {
            containerId = 'mySetlistDescriptionContainer';
            textId = 'mySetlistDescriptionText';
        } else if (type === 'smart') {
            containerId = 'smartSetlistDescriptionContainer';
            textId = 'smartSetlistDescriptionText';
        }
        
        const container = document.getElementById(containerId);
        const textElement = document.getElementById(textId);
        
        if (container && textElement && setlist.description) {
            textElement.textContent = setlist.description;
            container.style.display = 'block';
        }
    }

    // Hide setlist description in sidebar
    function hideSetlistDescription(type) {
        let containerId;
        
        if (type === 'global') {
            containerId = 'globalSetlistDescriptionContainer';
        } else if (type === 'my') {
            containerId = 'mySetlistDescriptionContainer';
        } else if (type === 'smart') {
            containerId = 'smartSetlistDescriptionContainer';
        }
        
        const container = document.getElementById(containerId);
        
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
            setlist = globalSetlists.find(s => s._id === actualId);
        } else if (setlistId.startsWith('my_')) {
            const actualId = setlistId.replace('my_', '');
            setlist = mySetlists.find(s => s._id === actualId);
        }
        
        if (setlist && setlist.description) {
            textElement.textContent = setlist.description;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    }

    // Generic setlist renderer - handles global, my, and smart setlists
    async function renderSetlists(config) {
        const {
            contentElementId,      // 'globalSetlistContent', 'mySetlistContent', 'smartSetlistContent'
            dataArray,             // globalSetlists, mySetlists, smartSetlists
            dataType,              // 'global', 'my', 'smart'
            loadFunction,          // loadGlobalSetlists, loadMySetlists, null
            emptyMessage,          // Message or function returning message
            icon,                  // 'fa-list', 'fa-brain'
            showHandler,           // showGlobalSetlistInMainSection, etc.
            editHandler,           // editGlobalSetlist, etc.
            deleteHandler,         // deleteGlobalSetlist, etc.
            refreshHandler,        // For smart setlists only
            descriptionHideTypes,  // ['my'], ['global'], ['my', 'global']
            checkPermissions,      // For smart setlists - function to check edit permissions
            enableMobileTouch,     // For smart setlists - enable touch feedback
            logPrefix              // For debugging (optional)
        } = config;

        const content = document.getElementById(contentElementId);
        if (!content) {
            if (logPrefix) console.warn(`${logPrefix} ${contentElementId} element not found`);
            return;
        }

        // Load data if load function provided
        if (loadFunction) {
            await loadFunction(true);
        }

        if (logPrefix) console.log(`${logPrefix} Rendering ${dataArray.length} setlists in sidebar`);

        content.innerHTML = '';

        // Handle empty state
        if (dataArray.length === 0) {
            const message = typeof emptyMessage === 'function' ? emptyMessage() : emptyMessage;
            const testMsg = document.createElement('li');
            testMsg.innerHTML = `<div style="padding: 10px; color: #888; font-style: italic;">${message}</div>`;
            content.appendChild(testMsg);
            return;
        }

        // Render each setlist
        dataArray.forEach(setlist => {
            const li = document.createElement('li');
            const setlistId = setlist.id || setlist._id;

            // Check permissions if function provided (for smart setlists)
            let canEdit = true;
            let showActions = true;
            if (checkPermissions) {
                const permissions = checkPermissions(setlist);
                canEdit = permissions.canEdit;
                showActions = permissions.showActions;
            }

            // Build action buttons HTML
            let actionsHTML = '';
            if (refreshHandler) {
                actionsHTML += `
                    <button class="setlist-action-btn smart-refresh-btn" title="Update Setlist - Rescan and save with current conditions">
                        <i class="fas fa-sync"></i>
                    </button>`;
            }
            actionsHTML += `
                <button class="setlist-action-btn edit-setlist" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="setlist-action-btn delete-setlist" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>`;

            // Build setlist item HTML
            const itemClass = dataType === 'smart' ? 'smart-setlist-header' : '';
            const wrapperStart = itemClass ? `<div class="${itemClass}">` : '';
            const wrapperEnd = itemClass ? '</div>' : '';
            const actionsClass = dataType === 'smart' ? 'smart-setlist-actions' : 'setlist-actions';

            li.innerHTML = `
                <div class="setlist-item" data-setlist-id="${setlistId}" data-type="${dataType}">
                    ${wrapperStart}
                        <i class="fas ${icon}"></i>
                        <span>${setlist.name}</span>
                    ${wrapperEnd}
                    <div class="${actionsClass}" style="display: ${showActions ? 'flex' : 'none'};">
                        ${actionsHTML}
                    </div>
                </div>
            `;
            content.appendChild(li);
        });

        // Add event listeners
        content.querySelectorAll('.setlist-item').forEach(item => {
            const setlistId = item.dataset.setlistId;

            // Main click handler
            const handleSetlistClick = (e) => {
                if (!e.target.closest('.setlist-actions') && !e.target.closest('.smart-setlist-actions')) {
                    if (logPrefix) console.log(`${logPrefix} Setlist clicked:`, setlistId);
                    
                    // Store active setlist element for back button
                    activeSetlistElementId = setlistId;
                    
                    showHandler(setlistId);
                    
                    const setlist = dataArray.find(s => (s.id || s._id) === setlistId);
                    if (setlist) {
                        // Hide other setlist descriptions
                        descriptionHideTypes.forEach(type => hideSetlistDescription(type));
                        showSetlistDescription(setlist, dataType);
                    }
                }
            };

            item.addEventListener('click', handleSetlistClick);

            // Mobile touch support if enabled
            if (enableMobileTouch) {
                item.addEventListener('touchstart', (e) => {
                    item.style.transform = 'scale(0.98)';
                    setTimeout(() => { item.style.transform = ''; }, 100);
                }, { passive: true });
            }

            // Edit button
            item.querySelector('.edit-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                editHandler(setlistId);
            });

            // Delete button
            item.querySelector('.delete-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteHandler(setlistId);
            });

            // Refresh button (smart setlists only)
            if (refreshHandler) {
                item.querySelector('.smart-refresh-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    refreshHandler(setlistId);
                });
            }

            // Resequence button (if present)
            item.querySelector('.resequence-setlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                window.setlistResequenceMode = true;
                showHandler(setlistId);
            });
        });
    }

    // Render global setlists in sidebar
    async function renderGlobalSetlists() {
        await renderSetlists({
            contentElementId: 'globalSetlistContent',
            dataArray: globalSetlists,
            dataType: 'global',
            loadFunction: loadGlobalSetlists,
            emptyMessage: 'No global setlists available',
            icon: 'fa-list',
            showHandler: showGlobalSetlistInMainSection,
            editHandler: editGlobalSetlist,
            deleteHandler: deleteGlobalSetlist,
            descriptionHideTypes: ['my']
        });
    }

    // Render my setlists in sidebar
    async function renderMySetlists() {
        await renderSetlists({
            contentElementId: 'mySetlistContent',
            dataArray: mySetlists,
            dataType: 'my',
            loadFunction: loadMySetlists,
            emptyMessage: () => jwtToken ? 'No personal setlists created' : 'Login to create your setlists',
            icon: 'fa-list',
            showHandler: showMySetlistInMainSection,
            editHandler: editMySetlist,
            deleteHandler: deleteMySetlist,
            descriptionHideTypes: ['global']
        });
    }

    // Display global setlist in main songs section
    function showGlobalSetlistInMainSection(setlistId) {
        const setlist = globalSetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        // Set global variables for remove functionality
        currentViewingSetlist = setlist;
        currentSetlistType = 'global';

        // Update setlist header with the setlist name
        const setlistHeader = document.getElementById('setlistViewHeader');
        if (setlistHeader) {
            setlistHeader.textContent = setlist.name;
        }

        // Show action buttons when setlist is loaded 
        if (setlistSectionActions) {
            setlistSectionActions.style.display = 'flex';
            
            // Rebuild actions with back button + original buttons
            setlistSectionActions.innerHTML = `
                <button onclick="goBackToSidebar(event)" class="btn btn-secondary setlist-action-btn" title="Back to Menu" aria-label="Back to Menu">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <button id="editSetlistSectionBtn" class="btn btn-secondary setlist-action-btn" title="Edit Setlist - Modify setlist name, description and song selection" aria-label="Edit Setlist">
                    <i class="fas fa-edit"></i>
                </button>
                <button id="deleteSetlistSectionBtn" class="btn btn-danger setlist-action-btn" title="Delete Setlist - Permanently remove this setlist" aria-label="Delete Setlist">
                    <i class="fas fa-trash"></i>
                </button>
                <button id="resequenceSetlistSectionBtn" class="btn btn-primary setlist-action-btn" title="Resequence Songs - Drag and drop to reorder songs in setlist" aria-label="Resequence Setlist">
                    <i class="fas fa-random"></i>
                </button>
                <button id="saveSetlistSequenceBtn" class="btn btn-success setlist-action-btn" style="display:none;" title="Save New Sequence - Confirm the new song order" aria-label="Save Sequence">
                    <i class="fas fa-save"></i> Save Sequence
                </button>
            `;
            
            // Re-get button references after rebuilding HTML
            const editSetlistSectionBtn = document.getElementById('editSetlistSectionBtn');
            const deleteSetlistSectionBtn = document.getElementById('deleteSetlistSectionBtn');
            const resequenceSetlistSectionBtn = document.getElementById('resequenceSetlistSectionBtn');
            
            // Update button appearance based on permissions
            const canEdit = currentUser?.isAdmin;
            if (editSetlistSectionBtn && deleteSetlistSectionBtn) {
                if (canEdit) {
                    editSetlistSectionBtn.style.opacity = '1';
                    deleteSetlistSectionBtn.style.opacity = '1';
                    editSetlistSectionBtn.style.cursor = 'pointer';
                    deleteSetlistSectionBtn.style.cursor = 'pointer';
                    
                    // Attach event listeners for admin users
                    editSetlistSectionBtn.onclick = () => editGlobalSetlist(setlistId);
                    deleteSetlistSectionBtn.onclick = () => deleteGlobalSetlist(setlistId);
                } else {
                    editSetlistSectionBtn.style.opacity = '0.5';
                    deleteSetlistSectionBtn.style.opacity = '0.5';
                    editSetlistSectionBtn.style.cursor = 'not-allowed';
                    deleteSetlistSectionBtn.style.cursor = 'not-allowed';
                }
            }
            
            // Attach resequence button handler
            if (resequenceSetlistSectionBtn) {
                resequenceSetlistSectionBtn.onclick = async function() {
                    if (!currentViewingSetlist) {
                        showNotification('No setlist is currently loaded', 'error');
                        return;
                    }
                    if (!window.setlistResequenceMode) {
                        window.setlistResequenceMode = true;
                        resequenceSetlistSectionBtn.innerHTML = '<i class="fas fa-save"></i> Save Sequence';
                        refreshSetlistDisplay();
                    } else {
                        // Save new sequence to backend
                        const endpoint = '/api/global-setlists';
                        await authFetch(`${API_BASE_URL}${endpoint}/${currentViewingSetlist._id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: currentViewingSetlist.name,
                                description: currentViewingSetlist.description,
                                songs: currentViewingSetlist.songs
                            })
                        });
                        window.setlistResequenceMode = false;
                        resequenceSetlistSectionBtn.innerHTML = '<i class="fas fa-random"></i>';
                        refreshSetlistDisplay();
                        showNotification('Setlist sequence saved!', 'success');
                    }
                };
            }
        }

        // Clear any existing selections
        clearSetlistSelections();

        // Hide other sections and show setlist section
        const NewContent = document.getElementById('NewContent');
        const OldContent = document.getElementById('OldContent');
        const setlistSection = document.getElementById('setlistSection');
        const deleteSection = document.getElementById('deleteSection');
        const favoritesSection = document.getElementById('favoritesSection');

        NewContent.classList.remove('active');
        OldContent.classList.remove('active');
        setlistSection.style.display = 'block';
        deleteSection.style.display = 'none';
        favoritesSection.style.display = 'none';

        // Update the sidebar to show active setlist in dropdown
        document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
        const setlistDropdown = document.getElementById('setlistDropdown');
        if (setlistDropdown) {
            // Use selectDropdownOption to ensure proper synchronization
            // But prevent infinite loop by temporarily setting a flag
            if (!window.updatingFromFolderNav) {
                window.updatingFromFolderNav = true;
                selectDropdownOption(`global_${setlistId}`, setlist.name);
                // Manually update the description since change event is blocked
                showDropdownSetlistDescription(`global_${setlistId}`);
                setTimeout(() => {
                    window.updatingFromFolderNav = false;
                }, 100);
            }
        }

        // Convert setlist songs to format expected by renderSetlist - handle both IDs and manual song objects
        const setlistSongs = setlist.songs.map(item => {
            // If item is an object (manual song), return it directly
            if (typeof item === 'object' && item !== null) {
                return item;
            }
            // If item is a string/number ID, find it in the songs array using numeric id
            const itemId = typeof item === 'string' ? parseInt(item) : item;
            const song = songs.find(s => s.id === itemId);
            return song || null;
        }).filter(Boolean);

        // Group songs by category
        const newSongs = setlistSongs.filter(song => song.category === 'New');
        const oldSongs = setlistSongs.filter(song => song.category === 'Old');

        // Show appropriate tab based on which has more songs, or default to New
        const NewSetlistTab = document.getElementById('NewSetlistTab');
        const OldSetlistTab = document.getElementById('OldSetlistTab');
        const NewSetlistSongs = document.getElementById('NewSetlistSongs');
        const OldSetlistSongs = document.getElementById('OldSetlistSongs');

        // Update tab counts
        if (NewSetlistTab) NewSetlistTab.textContent = `New (${newSongs.length})`;
        if (OldSetlistTab) OldSetlistTab.textContent = `Old (${oldSongs.length})`;

        if (newSongs.length > 0) {
            NewSetlistTab.classList.add('active');
            OldSetlistTab.classList.remove('active');
            NewSetlistSongs.style.display = 'block';
            OldSetlistSongs.style.display = 'none';
        } else {
            NewSetlistTab.classList.remove('active');
            OldSetlistTab.classList.add('active');
            NewSetlistSongs.style.display = 'none';
            OldSetlistSongs.style.display = 'block';
        }

        // Always populate both tabs (even if one is empty)
        displaySetlistSongs(newSongs, NewSetlistSongs, 'global-setlist');
        displaySetlistSongs(oldSongs, OldSetlistSongs, 'global-setlist');

        // Add tab switching functionality
        NewSetlistTab.onclick = () => {
            NewSetlistTab.classList.add('active');
            OldSetlistTab.classList.remove('active');
            NewSetlistSongs.style.display = 'block';
            OldSetlistSongs.style.display = 'none';
        };

        OldSetlistTab.onclick = () => {
            OldSetlistTab.classList.add('active');
            NewSetlistTab.classList.remove('active');
            OldSetlistSongs.style.display = 'block';
            NewSetlistSongs.style.display = 'none';
        };

        // Mobile view: show songs panel and hide sidebar
        if (window.innerWidth <= 768) {
            document.querySelector('.songs-section').classList.remove('hidden');
            document.querySelector('.sidebar').classList.add('hidden');
            document.querySelector('.preview-section').classList.remove('full-width');
        }
    }

    // Display my setlist in main songs section
    function showMySetlistInMainSection(setlistId) {
        const setlist = mySetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        // Set global variables for remove functionality
        currentViewingSetlist = setlist;
        currentSetlistType = 'my';

        // Update setlist header with the setlist name
        const setlistHeader = document.getElementById('setlistViewHeader');
        if (setlistHeader) {
            setlistHeader.textContent = setlist.name;
        }

        // Show action buttons when setlist is loaded
        if (setlistSectionActions) {
            setlistSectionActions.style.display = 'flex';
            
            // Rebuild actions with back button + my setlist buttons
            setlistSectionActions.innerHTML = `
                <button onclick="goBackToSidebar(event)" class="btn btn-secondary setlist-action-btn" title="Back to Menu" aria-label="Back to Menu">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <button id="editSetlistSectionBtn" class="btn btn-secondary setlist-action-btn" title="Edit Setlist - Modify setlist name, description and song selection" aria-label="Edit Setlist">
                    <i class="fas fa-edit"></i>
                </button>
                <button id="deleteSetlistSectionBtn" class="btn btn-danger setlist-action-btn" title="Delete Setlist - Permanently remove this setlist" aria-label="Delete Setlist">
                    <i class="fas fa-trash"></i>
                </button>
                <button id="resequenceSetlistSectionBtn" class="btn btn-primary setlist-action-btn" title="Resequence Songs - Drag and drop to reorder songs in setlist" aria-label="Resequence Setlist">
                    <i class="fas fa-random"></i>
                </button>
                <button id="saveSetlistSequenceBtn" class="btn btn-success setlist-action-btn" style="display:none;" title="Save New Sequence - Confirm the new song order" aria-label="Save Sequence">
                    <i class="fas fa-save"></i> Save Sequence
                </button>
            `;
            
            // Re-get button references after rebuilding HTML
            const editSetlistSectionBtn = document.getElementById('editSetlistSectionBtn');
            const deleteSetlistSectionBtn = document.getElementById('deleteSetlistSectionBtn');
            const resequenceSetlistSectionBtn = document.getElementById('resequenceSetlistSectionBtn');
            
            // Users can always edit their own setlists, so show full opacity
            if (editSetlistSectionBtn && deleteSetlistSectionBtn) {
                editSetlistSectionBtn.style.opacity = '1';
                deleteSetlistSectionBtn.style.opacity = '1';
                editSetlistSectionBtn.style.cursor = 'pointer';
                deleteSetlistSectionBtn.style.cursor = 'pointer';
                
                // Attach event listeners
                editSetlistSectionBtn.onclick = () => editMySetlist(setlistId);
                deleteSetlistSectionBtn.onclick = () => deleteMySetlist(setlistId);
            }
            
            // Attach resequence button handler
            if (resequenceSetlistSectionBtn) {
                resequenceSetlistSectionBtn.onclick = async function() {
                    if (!currentViewingSetlist) {
                        showNotification('No setlist is currently loaded', 'error');
                        return;
                    }
                    if (!window.setlistResequenceMode) {
                        window.setlistResequenceMode = true;
                        resequenceSetlistSectionBtn.innerHTML = '<i class="fas fa-save"></i> Save Sequence';
                        refreshSetlistDisplay();
                    } else {
                        // Save new sequence to backend
                        const endpoint = '/api/my-setlists';
                        await authFetch(`${API_BASE_URL}${endpoint}/${currentViewingSetlist._id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: currentViewingSetlist.name,
                                description: currentViewingSetlist.description,
                                songs: currentViewingSetlist.songs
                            })
                        });
                        window.setlistResequenceMode = false;
                        resequenceSetlistSectionBtn.innerHTML = '<i class="fas fa-random"></i>';
                        refreshSetlistDisplay();
                        showNotification('Setlist sequence saved!', 'success');
                    }
                };
            }
        }

        // Clear any existing selections
        clearSetlistSelections();

        // Hide other sections and show setlist section
        const NewContent = document.getElementById('NewContent');
        const OldContent = document.getElementById('OldContent');
        const setlistSection = document.getElementById('setlistSection');
        const deleteSection = document.getElementById('deleteSection');
        const favoritesSection = document.getElementById('favoritesSection');

        NewContent.classList.remove('active');
        OldContent.classList.remove('active');
        setlistSection.style.display = 'block';
        deleteSection.style.display = 'none';
        favoritesSection.style.display = 'none';

        // Update the sidebar to show active setlist in dropdown
        document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
        const setlistDropdown = document.getElementById('setlistDropdown');
        if (setlistDropdown) {
            // Use selectDropdownOption to ensure proper synchronization
            // But prevent infinite loop by temporarily setting a flag
            if (!window.updatingFromFolderNav) {
                window.updatingFromFolderNav = true;
                selectDropdownOption(`my_${setlistId}`, setlist.name);
                // Manually update the description since change event is blocked
                showDropdownSetlistDescription(`my_${setlistId}`);
                setTimeout(() => {
                    window.updatingFromFolderNav = false;
                }, 100);
            }
        }

        // Convert setlist songs to format expected by renderSetlist - handle both IDs and manual song objects
        const setlistSongs = setlist.songs.map(item => {
            // If item is an object (manual song), return it directly
            if (typeof item === 'object' && item !== null) {
                return item;
            }
            // If item is a string/number ID, find it in the songs array using numeric id
            const itemId = typeof item === 'string' ? parseInt(item) : item;
            const song = songs.find(s => s.id === itemId);
            return song || null;
        }).filter(Boolean);

        // Group songs by category
        const newSongs = setlistSongs.filter(song => song.category === 'New');
        const oldSongs = setlistSongs.filter(song => song.category === 'Old');

        // Show appropriate tab based on which has more songs, or default to New
        const NewSetlistTab = document.getElementById('NewSetlistTab');
        const OldSetlistTab = document.getElementById('OldSetlistTab');
        const NewSetlistSongs = document.getElementById('NewSetlistSongs');
        const OldSetlistSongs = document.getElementById('OldSetlistSongs');

        // Update tab counts
        if (NewSetlistTab) NewSetlistTab.textContent = `New (${newSongs.length})`;
        if (OldSetlistTab) OldSetlistTab.textContent = `Old (${oldSongs.length})`;

        if (newSongs.length > 0) {
            NewSetlistTab.classList.add('active');
            OldSetlistTab.classList.remove('active');
            NewSetlistSongs.style.display = 'block';
            OldSetlistSongs.style.display = 'none';
        } else {
            NewSetlistTab.classList.remove('active');
            OldSetlistTab.classList.add('active');
            NewSetlistSongs.style.display = 'none';
            OldSetlistSongs.style.display = 'block';
        }

        // Always populate both tabs (even if one is empty)
        displaySetlistSongs(newSongs, NewSetlistSongs, 'user-setlist');
        displaySetlistSongs(oldSongs, OldSetlistSongs, 'user-setlist');

        // Add tab switching functionality
        NewSetlistTab.onclick = () => {
            NewSetlistTab.classList.add('active');
            OldSetlistTab.classList.remove('active');
            NewSetlistSongs.style.display = 'block';
            OldSetlistSongs.style.display = 'none';
        };

        OldSetlistTab.onclick = () => {
            OldSetlistTab.classList.add('active');
            NewSetlistTab.classList.remove('active');
            OldSetlistSongs.style.display = 'block';
            NewSetlistSongs.style.display = 'none';
        };

        // Mobile view: show songs panel and hide sidebar
        if (window.innerWidth <= 768) {
            document.querySelector('.songs-section').classList.remove('hidden');
            document.querySelector('.sidebar').classList.add('hidden');
            document.querySelector('.preview-section').classList.remove('full-width');
        }
    }

    // Function to display setlist songs in the new simplified UI
    function displaySetlistSongs(songs, container, context = 'user-setlist') {
        container.innerHTML = '';

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
            
            // Extract chords for this song
            let currentUserInFunction = null;
            try {
                currentUserInFunction = JSON.parse(localStorage.getItem('currentUser') || '{}');
            } catch (e) {
                currentUserInFunction = {};
            }
            
            let transposeLevel = 0;
            
            // Priority: Global setlist transpose > User transpose
            if (currentSetlistType === 'global' && currentViewingSetlist && currentViewingSetlist.songTransposes && song.id in currentViewingSetlist.songTransposes) {
                // Use global setlist transpose (admin-set)
                transposeLevel = currentViewingSetlist.songTransposes[song.id] || 0;
            } else {
                // Use user's personal transpose
                try {
                    const localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                    if (song.id && typeof localTranspose[song.id] === 'number') {
                        transposeLevel = localTranspose[song.id];
                    } else if (window.userData && window.userData.transpose && song.id in window.userData.transpose) {
                        transposeLevel = window.userData.transpose[song.id] || 0;
                    }
                } catch (e) {
                    transposeLevel = 0;
                }
            }
            
            const distinctChords = extractDistinctChords(song.lyrics, transposeLevel, song.manualChords);
            const chordsDisplay = distinctChords.length > 0 ? distinctChords.join(', ') : '';
            
            const li = document.createElement('li');
            li.className = 'setlist-song-item';
            li.dataset.songId = song.id;
            // Enable drag-and-drop for all songs in resequence mode
            if (isResequenceMode) {
                li.setAttribute('draggable', 'true');
            } else if (currentSetlistType !== 'global' || (currentUserInFunction && currentUserInFunction.isAdmin)) {
                li.setAttribute('draggable', 'true');
            }
            li.innerHTML = `
                <div class="setlist-song-info">
                    <span class="setlist-song-number">${index + 1}.</span>
                    <div class="setlist-song-details">
                        <div class="setlist-song-title">${song.title}</div>
                        <div class="setlist-song-meta-row">
                            ${song.key ? `<div class="setlist-song-key"> ${transposeLevel !== 0 ? transposeChord(song.key, transposeLevel) : song.key}</div>` : ''}
                            ${(song.time || song.timeSignature) ? `<span class="setlist-song-key-time">${song.time || song.timeSignature}</span>` : ''}
                            ${song.tempo ? `<span class="setlist-song-key-tempo">${song.tempo} </span>` : ''}
                        </div>
                        ${chordsDisplay ? `<div class="setlist-song-meta-row" style="margin-top: 4px;">
                            <span class="setlist-song-key-tempo">${chordsDisplay}</span>
                        </div>` : ''}
                    </div>
                </div>
                <div class="setlist-song-actions">
                    ${!isResequenceMode && (currentSetlistType !== 'global' || (currentUserInFunction && currentUserInFunction.isAdmin)) ? `<button class="remove-from-setlist-btn" data-song-id="${song.id}" title="Remove from setlist" type="button">×</button>` : ''}
                </div>`;

            // Add click handler for song info (not the remove button)
            const songInfo = li.querySelector('.setlist-song-info');
            songInfo.addEventListener('click', () => {
                clearSetlistSelections();
                li.classList.add('selected');
                showPreview(song, false, context);
            });

            // Add click handler for remove button (if it exists)
            const removeBtn = li.querySelector('.remove-from-setlist-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
                if (!currentViewingSetlist || !currentViewingSetlist.songs) return;
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

        // Find the song index - handle both regular song IDs and manual song objects
        const songIndex = currentViewingSetlist.songs.findIndex(item => {
            // If item is an object (manual song), check its _id
            if (typeof item === 'object' && item !== null) {
                return item._id === songId || item.id === songId;
            }
            // If item is a regular song ID, compare as numbers
            return parseInt(item) === parseInt(songId);
        });
        
        if (songIndex === -1) {
            return;
        }

        // Remove song from setlist
        currentViewingSetlist.songs.splice(songIndex, 1);

        // Update setlist on server
        const endpoint = currentSetlistType === 'global' ? '/api/global-setlists' : '/api/my-setlists';
        
        authFetch(`${API_BASE_URL}${endpoint}/${currentViewingSetlist._id}`, {
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
                const setlistIndex = setlists.findIndex(s => s._id === currentViewingSetlist._id);
                if (setlistIndex !== -1) {
                    setlists[setlistIndex] = currentViewingSetlist; // Update with our local version
                }
            } else {
                // If we get actual setlist data, use it
                const setlists = currentSetlistType === 'global' ? globalSetlists : mySetlists;
                const setlistIndex = setlists.findIndex(s => s._id === currentViewingSetlist._id);
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
                currentViewingSetlist.songs.splice(songIndex, 0, songIdInt);
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
        const setlistId = currentViewingSetlist._id;
        
        if (currentSetlistType === 'global') {
            showGlobalSetlistInMainSection(setlistId);
        } else if (currentSetlistType === 'my') {
            showMySetlistInMainSection(setlistId);
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
        const setlist = setlists.find(s => s._id === setlistId);
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
                    const idx = globalSetlists.findIndex(s => s._id === setlistId);
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

        const newSongs = document.getElementById('setlistNewSongs');
        const oldSongs = document.getElementById('setlistOldSongs');

        const newSetlistSongs = currentViewingSetlist.songs.filter(songId => {
            const song = songs.find(s => s.id === songId);
            return song && song.category === 'New';
        });

        const oldSetlistSongs = currentViewingSetlist.songs.filter(songId => {
            const song = songs.find(s => s.id === songId);
            return song && song.category === 'Old';
        });

        newSongs.innerHTML = '';
        oldSongs.innerHTML = '';

        // Render New songs
        newSetlistSongs.forEach(songId => {
            const song = songs.find(s => s.id === songId);
            if (song) {
                const songEl = createSetlistSongElement(song);
                newSongs.appendChild(songEl);
            }
        });

        // Render Old songs
        oldSetlistSongs.forEach(songId => {
            const song = songs.find(s => s.id === songId);
            if (song) {
                const songEl = createSetlistSongElement(song);
                oldSongs.appendChild(songEl);
            }
        });

        if (newSetlistSongs.length === 0) {
            newSongs.innerHTML = '<p class="no-songs">No New songs in this setlist</p>';
        }

        if (oldSetlistSongs.length === 0) {
            oldSongs.innerHTML = '<p class="no-songs">No Old songs in this setlist</p>';
        }
    }

    // Create setlist song element
    function createSetlistSongElement(song) {
        // Calculate transpose for display consistency
        let transposeLevel = 0;
        if (currentSetlistType === 'global-setlist' && currentSetlistId && song.id) {
            // Admin's global setlist transpose
            if (globalSetlistTranspose && globalSetlistTranspose[song.id] && typeof globalSetlistTranspose[song.id] === 'number') {
                transposeLevel = globalSetlistTranspose[song.id];
            }
        } else {
            // User's personal transpose
            try {
                const localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                if (song.id && typeof localTranspose[song.id] === 'number') {
                    transposeLevel = localTranspose[song.id];
                }
            } catch (e) {
                transposeLevel = 0;
            }
        }
        
        const displayKey = transposeLevel !== 0 ? transposeChord(song.key, transposeLevel) : song.key;
        
        const div = document.createElement('div');
        div.className = 'setlist-song-item';
        div.innerHTML = `
            <div class="setlist-song-info">
                <div class="setlist-song-title">${song.title}</div>
                <div class="setlist-song-meta">${displayKey} | ${song.artistDetails || 'Unknown'}</div>
            </div>
            ${(currentSetlistType !== 'global' || (currentUser && currentUser.isAdmin)) ? 
                `<button class="remove-from-setlist" onclick="removeFromSetlist(${song.id})" title="Remove from setlist">
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

        // Check if user has permission to modify global setlists
        if (currentSetlistType === 'global' && (!currentUser || !currentUser.isAdmin)) {
            showNotification('❌ Access denied: Only administrators can modify global setlists', 'error');
            return;
        }

        const updatedSongs = currentViewingSetlist.songs.filter(id => id !== songId);
        
        try {
            const endpoint = currentSetlistType === 'global' ? 'global-setlists' : 'my-setlists';
            
            const res = await authFetch(`${API_BASE_URL}/api/${endpoint}/${currentViewingSetlist._id}`, {
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
                const index = globalSetlists.findIndex(s => s._id === currentViewingSetlist._id);
                if (index !== -1) globalSetlists[index] = currentViewingSetlist;
            } else {
                const index = mySetlists.findIndex(s => s._id === currentViewingSetlist._id);
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

        const setlist = globalSetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        const modal = document.getElementById('globalSetlistModal');
        const title = document.getElementById('globalSetlistModalTitle');
        const form = document.getElementById('globalSetlistForm');
        const submitBtn = document.getElementById('globalSetlistSubmit');

        title.textContent = 'Edit Global Setlist';
        submitBtn.textContent = 'Update Setlist';
        
        document.getElementById('globalSetlistId').value = setlist._id;
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

        const setlist = globalSetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        const modal = document.getElementById('confirmDeleteSetlistModal');
        const message = document.getElementById('deleteSetlistMessage');
        
        message.textContent = `Are you sure you want to delete the global setlist "${setlist.name}"?`;
        modal.style.display = 'flex';

        document.getElementById('confirmDeleteSetlist').onclick = async () => {
            try {
                const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${setlistId}`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    globalSetlists = globalSetlists.filter(s => s._id !== setlistId);
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
        const setlist = mySetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        const modal = document.getElementById('mySetlistModal');
        const title = document.getElementById('mySetlistModalTitle');
        const form = document.getElementById('mySetlistForm');
        const submitBtn = document.getElementById('mySetlistSubmit');

        title.textContent = 'Edit My Setlist';
        submitBtn.textContent = 'Update Setlist';
        
        document.getElementById('mySetlistId').value = setlist._id;
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
        const setlist = mySetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        const modal = document.getElementById('confirmDeleteSetlistModal');
        const message = document.getElementById('deleteSetlistMessage');
        
        message.textContent = `Are you sure you want to delete the setlist "${setlist.name}"?`;
        modal.style.display = 'flex';

        document.getElementById('confirmDeleteSetlist').onclick = async () => {
            try {
                const res = await authFetch(`${API_BASE_URL}/api/my-setlists/${setlistId}`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    mySetlists = mySetlists.filter(s => s._id !== setlistId);
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
        const song = songs.find(s => s.id === parseInt(songId));
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
        const key = normalizeKeySignature(document.getElementById('manualSongKey').value);
        const timeSignature = document.getElementById('manualSongTime').value;
        const tempo = document.getElementById('manualSongTempo').value;
        const category = document.getElementById('manualSongCategory').value;
        const chords = document.getElementById('manualSongChords').value.trim();

        if (!title || !key || !timeSignature || !category) {
            showNotification('Please fill in all required fields');
            return;
        }

        // Process and clean chords if provided
        let processedChords = '';
        if (chords) {
            // Split by comma, clean up each chord, and apply the same cleaning as extractDistinctChords
            const chordArray = chords.split(',').map(chord => {
                let cleanChord = chord.trim();
                // Remove 'maj' from chord names to make them more compact
                cleanChord = cleanChord.replace(/maj(?=\d)|maj$/g, '');
                return normalizeChordAccidentals(cleanChord);
            }).filter(chord => chord.length > 0);
            
            processedChords = chordArray.join(', ');
        }

        // Create manual song object
        const manualSong = {
            _id: 'manual_' + Date.now(),
            title: title,
            key: key,
            time: timeSignature,
            tempo: tempo,
            category: category,
            isManualEntry: true,
            lyrics: '(Manual entry - no lyrics available)',
            manualChords: processedChords // Store the manually entered chords
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
        const setlistId = currentViewingSetlist._id;
        const isGlobal = currentSetlistType === 'global';
        
        // Check for duplicates in current setlist
        const currentSetlist = isGlobal 
            ? globalSetlists.find(s => s._id === setlistId)
            : mySetlists.find(s => s._id === setlistId);
            
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
                    const foundSong = songs.find(s => s.id === parseInt(song));
                    songTitle = foundSong ? foundSong.title : '';
                }
                
                // Also check for manual song IDs
                if (typeof song === 'string' && song.startsWith('manual_')) {
                    // This might be a manual song ID - check existing manual songs in setlist
                    const manualSongInList = currentSetlist.songs.find(s => 
                        typeof s === 'object' && s.id === song
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
                    const setlist = globalSetlists.find(s => s._id === setlistId);
                    if (setlist) {
                        setlist.songs = setlist.songs || [];
                        setlist.songs.push(manualSong);
                    }
                } else {
                    const setlist = mySetlists.find(s => s._id === setlistId);
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

        const setlistId = currentViewingSetlist._id;
        const isGlobal = currentSetlistType === 'global';
        
        // Check for duplicates in current setlist
        const currentSetlist = isGlobal 
            ? globalSetlists.find(s => s._id === setlistId)
            : mySetlists.find(s => s._id === setlistId);
            
        if (currentSetlist && currentSetlist.songs) {
            // Check if song is already in setlist
            const isDuplicate = currentSetlist.songs.some(existingSong => {
                // Handle different data structures
                if (typeof existingSong === 'object') {
                    // Song object - compare IDs and titles
                    return (existingSong._id === song._id) || 
                           (existingSong.id === song._id) ||
                           (existingSong.title?.toLowerCase().trim() === song.title?.toLowerCase().trim());
                } else {
                    // Song ID - compare with song's ID
                    return existingSong === song._id || existingSong === song.id;
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
                    songId: song._id 
                })
            });

            if (res.ok) {
                // Update local setlist data
                if (isGlobal) {
                    const setlist = globalSetlists.find(s => s._id === setlistId);
                    if (setlist) {
                        setlist.songs = setlist.songs || [];
                        setlist.songs.push(song);
                    }
                } else {
                    const setlist = mySetlists.find(s => s._id === setlistId);
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

        const setlist = globalSetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        if (setlist.songs.includes(songId)) {
            showNotification('Song already in setlist');
            return;
        }

        try {
            const updatedSongs = [...setlist.songs, songId];
            const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${setlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = globalSetlists.findIndex(s => s._id === setlistId);
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

        const setlist = globalSetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        try {
            const updatedSongs = setlist.songs.filter(id => id !== songId);
            const res = await authFetch(`${API_BASE_URL}/api/global-setlists/${setlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = globalSetlists.findIndex(s => s._id === setlistId);
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

        const setlist = mySetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        if (setlist.songs.includes(songId)) {
            showNotification('Song already in setlist');
            return;
        }

        try {
            const updatedSongs = [...setlist.songs, songId];
            const res = await authFetch(`${API_BASE_URL}/api/my-setlists/${setlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = mySetlists.findIndex(s => s._id === setlistId);
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

        const setlist = mySetlists.find(s => s._id === setlistId);
        if (!setlist) return;

        try {
            const updatedSongs = setlist.songs.filter(id => id !== songId);
            const res = await authFetch(`${API_BASE_URL}/api/my-setlists/${setlistId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: updatedSongs })
            });

            if (res.ok) {
                setlist.songs = updatedSongs;
                const index = mySetlists.findIndex(s => s._id === setlistId);
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
            const modal = document.getElementById('loginModal');
            if (modal) {
                modal.style.display = 'flex';
            }
        }

        function showRegisterModal() {
            const modal = document.getElementById('registerModal');
            if (modal) {
                modal.style.display = 'flex';
            }
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
                    localStorage.setItem('jwtToken', jwtToken);
                    currentUser = data.user;
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    document.getElementById('loginModal').style.display = 'none';
                    showNotification('Login successful!');
                    
                    // If user is admin, reload page to ensure all admin UI loads
                    if (currentUser && (currentUser.isAdmin === true || currentUser.isAdmin === 'true')) {
                        setTimeout(() => { window.location.reload(); }, 500);
                    } else {
                        updateAuthButtons();
                        
                        // Check if app was already initialized (subsequent login)
                        if (initializationState.isInitialized) {
                            // App already loaded - just load user-specific data
                            await loadUserData();
                            await loadMySetlists();
                            await loadSmartSetlistsFromServer();
                            renderMySetlists();
                            renderSmartSetlists();
                        } else if (!initializationState.isInitializing) {
                            // First-time login - start full initialization
                            console.log('🚀 Starting initialization after login...');
                            showLoading(0, 'Initializing...');
                            await window.init();
                            
                            // After initialization, show sidebar on mobile
                            if (window.innerWidth <= 768) {
                                const sidebar = document.querySelector('.sidebar');
                                if (sidebar) {
                                    sidebar.classList.remove('hidden');
                                    console.log('📱 Mobile: Showing sidebar after login');
                                }
                            }
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
                    
                    // Show login modal after brief delay
                    setTimeout(() => {
                        const loginModal = document.getElementById('loginModal');
                        if (loginModal) {
                            loginModal.style.display = 'flex';
                            // Pre-fill username
                            const loginUsername = document.getElementById('loginUsername');
                            if (loginUsername) loginUsername.value = username;
                        }
                    }, 1000);
                } else {
                    showNotification(data.error || 'Registration failed');
                }
            } catch (err) {
                showNotification('Registration error');
            }
        }

        function logout() {
            jwtToken = '';
            try {
                localStorage.removeItem('jwtToken');
            } catch (e) {
                console.warn('Failed to clear jwtToken:', e);
            }
            currentUser = null;
            try {
                localStorage.removeItem('currentUser');
            } catch (e) {
                console.warn('Failed to clear currentUser:', e);
            }
            smartSetlists = []; // Clear smart setlists on logout
            showNotification('Logged out');
            updateAuthButtons();
            // Reload page after logout to ensure all admin UI is removed
            setTimeout(() => { window.location.reload(); }, 500);
        }
    // Auth0 NAMESPACE removed

    // Smart Setlist Functions
    // Smart setlists are now loaded from server, initialized as empty array
    let smartSetlistScanResults = []; // Store current scan results
    
    // Load smart setlists from server
    async function loadSmartSetlistsFromServer() {
        console.log('📋 Loading Smart Setlists from server...');
        
        if (!currentUser) {
            console.log('📋 No user logged in, clearing Smart Setlists');
            smartSetlists = [];
            return;
        }
        
        try {
            const token = localStorage.getItem('jwtToken');
            if (!token) {
                console.log('📋 No JWT token found, clearing Smart Setlists');
                smartSetlists = [];
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
                console.log(`📋 Loaded ${smartSetlists.length} Smart Setlists from server:`, smartSetlists.map(s => s.name));
            } else {
                console.warn('📋 Failed to load smart setlists from server - HTTP', response.status);
                smartSetlists = [];
            }
        } catch (error) {
            console.error('📋 Error loading smart setlists from server:', error);
            smartSetlists = [];
        }
    }

    // Initialize multiselect for smart setlist conditions
    function initializeSmartSetlistMultiselects() {
        // Setup multiselect for each condition type
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
            console.error('Missing multiselect elements:', { input: !!input, dropdown: !!dropdown, selected: !!selected });
            return;
        }
        
        const selections = new Set();
        
        // Remove any existing event handlers to avoid duplicates
        input.replaceWith(input.cloneNode(true));
        dropdown.replaceWith(dropdown.cloneNode(true));
        
        // Get fresh references after cloning
        const freshInput = document.getElementById(inputId);
        const freshDropdown = document.getElementById(dropdownId);
        
        // Toggle dropdown on input click
        freshInput.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            document.querySelectorAll('.multiselect-dropdown.show').forEach(d => {
                if (d !== freshDropdown) d.classList.remove('show');
            });
            freshDropdown.classList.toggle('show');
        });
        
        // Handle option selection
        freshDropdown.addEventListener('click', (e) => {
            if (e.target.classList.contains('multiselect-option')) {
                const value = e.target.getAttribute('data-value');
                const text = e.target.textContent;
                
                if (value === '') {
                    // Clear all selections for "Any" option
                    selections.clear();
                } else {
                    if (selections.has(value)) {
                        selections.delete(value);
                    } else {
                        selections.add(value);
                        // Remove "Any" if present
                        selections.delete('');
                    }
                }
                updateSelectedDisplay(inputId, selectedId, selections);
            }
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest(`#${inputId}`) && !e.target.closest(`#${dropdownId}`)) {
                freshDropdown.classList.remove('show');
            }
        });
        
        // Store selections reference for easy access
        freshDropdown._selections = selections;
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
        }
        
        // Add remove listeners
        selected.querySelectorAll('.remove-selected').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = e.target.getAttribute('data-value');
                const inputId = e.target.getAttribute('data-input');
                
                // Find the correct dropdown by mapping inputId to dropdownId
                let dropdownElement = null;
                if (inputId === 'smartConditionKey') dropdownElement = document.getElementById('smartKeyDropdown');
                else if (inputId === 'smartConditionTime') dropdownElement = document.getElementById('smartTimeDropdown');
                else if (inputId === 'smartConditionTaal') dropdownElement = document.getElementById('smartTaalDropdown');
                else if (inputId === 'smartConditionMood') dropdownElement = document.getElementById('smartMoodDropdown');
                else if (inputId === 'smartConditionGenre') dropdownElement = document.getElementById('smartGenreDropdown');
                else if (inputId === 'smartConditionCategory') dropdownElement = document.getElementById('smartCategoryDropdown');
                
                if (dropdownElement && dropdownElement._selections) {
                    dropdownElement._selections.delete(value);
                    updateSelectedDisplay(inputId, selectedId, dropdownElement._selections);
                }
            });
        });
    }

    // Scan songs based on conditions
    async function scanSongsWithConditions(conditions) {
        try {
            const scanBtn = document.getElementById('scanSongsBtn');
            if (scanBtn) {
                scanBtn.disabled = true;
                scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
            }
            
            const response = await fetch(`${API_BASE_URL}/api/songs/scan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwtToken') || ''}`
                },
                body: JSON.stringify(conditions)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const results = await response.json();
            return results;
            
        } catch (error) {
            console.error('Error scanning songs:', error);
            showNotification(`Failed to scan songs: ${error.message}`);
            throw new Error('Failed to scan songs');
        } finally {
            const scanBtn = document.getElementById('scanSongsBtn');
            if (scanBtn) {
                scanBtn.disabled = false;
                scanBtn.innerHTML = '<i class="fas fa-search"></i> Scan Songs';
            }
        }
    }

    // Get current smart setlist conditions from form
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

    // Display scan results in tabs
    function displayScanResults(songs) {
        const resultsDiv = document.getElementById('smartSongsResults');
        const newSongsDiv = document.getElementById('smartNewSongs');
        const oldSongsDiv = document.getElementById('smartOldSongs');
        
        if (!resultsDiv || !newSongsDiv || !oldSongsDiv) {
            console.log('Scan results elements not ready yet, retrying...');
            // Retry after a short delay if elements aren't ready
            setTimeout(() => displayScanResults(songs), 100);
            return;
        }
        
        if (!songs || !Array.isArray(songs)) {
            console.error('Invalid songs data for display:', songs);
            songs = [];
        }
        
        const newSongs = songs.filter(song => song && song.category === 'New');
        const oldSongs = songs.filter(song => song && song.category === 'Old');
        
        console.log('Displaying scan results:', { total: songs.length, newSongs: newSongs.length, oldSongs: oldSongs.length });
        
        // Update counts
        const newCountEl = document.getElementById('smartNewCount');
        const oldCountEl = document.getElementById('smartOldCount');
        const totalCountEl = document.getElementById('scanResultCount');
        
        if (newCountEl) newCountEl.textContent = newSongs.length;
        if (oldCountEl) oldCountEl.textContent = oldSongs.length;
        if (totalCountEl) totalCountEl.textContent = songs.length;
        
        // Render song lists
        newSongsDiv.innerHTML = renderSmartSongsList(newSongs);
        oldSongsDiv.innerHTML = renderSmartSongsList(oldSongs);
        
        // Add click event listeners to smart scan songs
        document.querySelectorAll('.smart-scan-song').forEach(songDiv => {
            songDiv.addEventListener('click', () => {
                const songId = parseInt(songDiv.dataset.songId);
                const song = songs.find(s => s.id === songId || s._id === songId);
                if (song) {
                    showPreview(song, false, 'smart-scan');
                }
            });
        });
        
        // Show results
        resultsDiv.style.display = 'block';
        document.getElementById('scanResults').style.display = 'block';
        
        // Setup tab switching
        setupSmartSongTabs();
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
                        ${song.artistDetails ? `<span class="song-artist">by ${song.artistDetails}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Setup smart song tabs
    function setupSmartSongTabs() {
        const newTab = document.getElementById('smartNewTab');
        const oldTab = document.getElementById('smartOldTab');
        const newSongs = document.getElementById('smartNewSongs');
        const oldSongs = document.getElementById('smartOldSongs');
        
        if (!newTab || !oldTab || !newSongs || !oldSongs) return;
        
        newTab.addEventListener('click', () => {
            newTab.classList.add('active');
            oldTab.classList.remove('active');
            newSongs.classList.add('active');
            oldSongs.classList.remove('active');
        });
        
        oldTab.addEventListener('click', () => {
            oldTab.classList.add('active');
            newTab.classList.remove('active');
            oldSongs.classList.add('active');
            newSongs.classList.remove('active');
        });
    }

    // Render smart setlists in sidebar
    function renderSmartSetlists() {
        renderSetlists({
            contentElementId: 'smartSetlistContent',
            dataArray: smartSetlists,
            dataType: 'smart',
            loadFunction: null,
            emptyMessage: 'No smart setlists yet',
            icon: 'fa-brain',
            showHandler: showSmartSetlistInMainSection,
            editHandler: editSmartSetlist,
            deleteHandler: deleteSmartSetlist,
            refreshHandler: updateSmartSetlist,
            descriptionHideTypes: ['my', 'global'],
            checkPermissions: (setlist) => {
                const isCreator = currentUser && setlist.createdBy === currentUser.id;
                const canEdit = isCreator || (isAdmin() && setlist.isAdminCreated);
                return { canEdit, showActions: canEdit };
            },
            enableMobileTouch: true,
            logPrefix: '📋'
        });
    }

    // Create song item HTML (similar to renderSongs function)
    function createSongItem(song) {
        const isFavorite = Array.isArray(favorites) && favorites.includes(song.id);
        const displayGenres = song.genres ? song.genres.join(', ') : song.genre || '';
        
        return `
            <div class="song-item create-song-item" data-song-id="${song.id}">
                <div class="song-header">
                    <span class="song-title">${song.title}</span>
                    <button class="favorite-btn ${isFavorite ? 'favorited' : ''}" data-song-id="${song.id}" onclick="event.stopPropagation(); toggleFavorite(${song.id});">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="song-meta">${song.key || 'No key'} | ${song.tempo || 'No tempo'} | ${song.time || song.timeSignature || 'No time'} | ${song.taal || 'No taal'} | ${displayGenres}</div>
                <div class="song-actions">
                    <button class="btn btn-edit" onclick="event.stopPropagation(); editSong(${song.id});">Edit</button>
                </div>
            </div>
        `;
    }

    // Show smart setlist songs in main section
    function showSmartSetlistInMainSection(setlistId) {
        const smartSetlist = smartSetlists.find(s => s.id === setlistId || s._id === setlistId);
        if (!smartSetlist || !smartSetlist.songs) {
            console.error('Smart setlist not found or has no songs:', setlistId);
            return;
        }
        
        // Set global variables for tracking current smart setlist
        currentViewingSetlist = smartSetlist;
        currentSetlistType = 'smart';
        
        // Hide other sections and show setlist section
        const NewContent = document.getElementById('NewContent');
        const OldContent = document.getElementById('OldContent');
        const setlistSection = document.getElementById('setlistSection');
        const deleteSection = document.getElementById('deleteSection');
        const favoritesSection = document.getElementById('favoritesSection');

        if (NewContent) NewContent.classList.remove('active');
        if (OldContent) OldContent.classList.remove('active');
        if (setlistSection) setlistSection.style.display = 'block';
        if (deleteSection) deleteSection.style.display = 'none';
        if (favoritesSection) favoritesSection.style.display = 'none';
        
        // Update setlist header
        const setlistHeader = document.getElementById('setlistViewHeader');
        if (setlistHeader) {
            setlistHeader.textContent = `Smart Setlist: ${smartSetlist.name}`;
        }
        
        // Show setlist action buttons for Smart setlists
        const setlistSectionActions = document.getElementById('setlistSectionActions');
        if (setlistSectionActions) {
            setlistSectionActions.style.display = 'flex';
            setlistSectionActions.innerHTML = `
                <button onclick="goBackToSidebar(event)" class="btn btn-secondary setlist-action-btn" title="Back to Menu" aria-label="Back to Menu">
                    <i class="fas fa-arrow-left"></i>
                </button>
                ${isAdmin() ? `
                    <button class="btn btn-primary setlist-action-btn smart-refresh-btn-header" title="Update Setlist - Rescan and save with current conditions" aria-label="Update Smart Setlist">
                        <i class="fas fa-sync"></i>
                    </button>
                    <button class="btn btn-secondary setlist-action-btn edit-smart-setlist-header" title="Edit Smart Setlist" aria-label="Edit Smart Setlist">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger setlist-action-btn delete-smart-setlist-header delete-setlist" title="Delete Smart Setlist" aria-label="Delete Smart Setlist">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            `;
            
            // Add event listeners for header action buttons
            if (isAdmin()) {
                const refreshBtn = setlistSectionActions.querySelector('.smart-refresh-btn-header');
                const editBtn = setlistSectionActions.querySelector('.edit-smart-setlist-header');
                const deleteBtn = setlistSectionActions.querySelector('.delete-smart-setlist-header');
                
                refreshBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    updateSmartSetlist(smartSetlist.id || smartSetlist._id);
                });
                
                editBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    editSmartSetlist(smartSetlist.id || smartSetlist._id);
                });
                
                deleteBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteSmartSetlist(smartSetlist.id || smartSetlist._id);
                });
            }
        }
        
        // Render songs by category - get full song data from main songs array by ID
        
        // Map Smart Setlist songs to full song data from the main songs array
        const fullSongData = smartSetlist.songs.map(smartSong => {
            // Smart Setlist might store limited data, so get full data by ID
            const fullSong = songs.find(s => s.id === smartSong.id);
            if (fullSong) {
                return fullSong;
            } else {
                // Fallback: if full song not found in main array, use what we have from Smart Setlist
                console.warn(`Full song data not found for Smart Setlist song ID: ${smartSong.id}`, smartSong);
                return smartSong;
            }
        }).filter(song => song); // Remove any undefined entries
        
        const newSongs = fullSongData.filter(s => s.category === 'New');
        const oldSongs = fullSongData.filter(s => s.category === 'Old');
        
        const NewSetlistTab = document.getElementById('NewSetlistTab');
        const OldSetlistTab = document.getElementById('OldSetlistTab');
        const NewSetlistSongs = document.getElementById('NewSetlistSongs');
        const OldSetlistSongs = document.getElementById('OldSetlistSongs');
        
        // Use displaySetlistSongs for consistent formatting and functionality
        if (NewSetlistSongs) {
            displaySetlistSongs(newSongs, NewSetlistSongs, 'smart-setlist');
        }
        if (OldSetlistSongs) {
            displaySetlistSongs(oldSongs, OldSetlistSongs, 'smart-setlist');
        }
        
        // Update tab counts
        if (NewSetlistTab) NewSetlistTab.textContent = `New (${newSongs.length})`;
        if (OldSetlistTab) OldSetlistTab.textContent = `Old (${oldSongs.length})`;
        
        // Activate the tab with more songs, or New by default
        if (NewSetlistTab && OldSetlistTab && NewSetlistSongs && OldSetlistSongs) {
            if (oldSongs.length > newSongs.length && newSongs.length === 0) {
                // Show Old tab if it has songs and New is empty
                NewSetlistTab.classList.remove('active');
                OldSetlistTab.classList.add('active');
                NewSetlistSongs.style.display = 'none';
                OldSetlistSongs.style.display = 'block';
            } else {
                // Show New tab by default
                NewSetlistTab.classList.add('active');
                OldSetlistTab.classList.remove('active');
                NewSetlistSongs.style.display = 'block';
                OldSetlistSongs.style.display = 'none';
            }
            
            // Add click handlers for tab switching
            NewSetlistTab.onclick = function() {
                NewSetlistTab.classList.add('active');
                OldSetlistTab.classList.remove('active');
                NewSetlistSongs.style.display = 'block';
                OldSetlistSongs.style.display = 'none';
            };
            
            OldSetlistTab.onclick = function() {
                OldSetlistTab.classList.add('active');
                NewSetlistTab.classList.remove('active');
                OldSetlistSongs.style.display = 'block';
                NewSetlistSongs.style.display = 'none';
            };
        }
        
        // Mobile view: show songs panel and hide sidebar
        if (window.innerWidth <= 768) {
            document.querySelector('.songs-section').classList.remove('hidden');
            document.querySelector('.sidebar').classList.add('hidden');
            document.querySelector('.preview-section').classList.remove('full-width');
        }
        
        // Show notification
        showNotification(`Showing smart setlist: ${smartSetlist.name} (${smartSetlist.songs.length} songs)`);
    }

    // Go back to sidebar menu
    function goBackToSidebar(event) {
        // Stop event propagation to prevent document click listener from hiding sidebar
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        
        // Store the setlist info before clearing
        const wasViewingSetlist = currentViewingSetlist !== null;
        const activeSetlistId = activeSetlistElementId;
        
        // Clear current setlist tracking
        currentViewingSetlist = null;
        currentSetlistType = null;
        
        // Hide setlist section and actions
        const setlistSection = document.getElementById('setlistSection');
        if (setlistSection) setlistSection.style.display = 'none';
        
        const setlistSectionActions = document.getElementById('setlistSectionActions');
        if (setlistSectionActions) {
            setlistSectionActions.style.display = 'none';
            setlistSectionActions.innerHTML = ''; // Clear buttons to prevent stale references
        }
        
        // Show sidebar and hide songs section on mobile
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const songsSection = document.querySelector('.songs-section');
            const previewSection = document.querySelector('.preview-section');
            
            if (sidebar) sidebar.classList.remove('hidden');
            if (songsSection) songsSection.classList.add('hidden');
            if (previewSection) previewSection.classList.add('full-width');
        } else {
            // On desktop, show normal view
            const NewContent = document.getElementById('NewContent');
            const OldContent = document.getElementById('OldContent');
            
            if (NewContent) {
                NewContent.classList.add('active');
                NewContent.style.display = 'block';
            }
            if (OldContent) {
                OldContent.classList.remove('active');
                OldContent.style.display = 'none';
            }
            
            // Restore original tab names and activate New tab
            const newTab = document.getElementById('NewTab');
            const oldTab = document.getElementById('OldTab');
            if (newTab) {
                newTab.innerHTML = '<i class="fas fa-music"></i> New';
                newTab.classList.add('active');
            }
            if (oldTab) {
                oldTab.innerHTML = '<i class="fas fa-music"></i> Old';
                oldTab.classList.remove('active');
            }
            
            // Re-render normal songs
            if (typeof renderSongs === 'function') {
                renderSongs('New', '', '', '', '');
            }
        }
        
        // Restore active setlist in sidebar or default to All Songs
        document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
        
        // If we were viewing a setlist, re-activate it in the sidebar
        if (wasViewingSetlist && activeSetlistId) {
            const setlistItem = document.querySelector(`.setlist-item[data-setlist-id="${activeSetlistId}"]`);
            if (setlistItem) {
                // Mark the parent li as active
                const li = setlistItem.closest('li');
                if (li) li.classList.add('active');
            } else {
                // Fallback to All Songs if setlist item not found
                const showAllBtn = document.getElementById('showAll');
                if (showAllBtn) showAllBtn.classList.add('active');
            }
        } else {
            // Default to All Songs if not viewing a setlist
            const showAllBtn = document.getElementById('showAll');
            if (showAllBtn) showAllBtn.classList.add('active');
        }
        
        showNotification('Returned to menu');
    }

    // Make goBackToSidebar globally accessible
    window.goBackToSidebar = goBackToSidebar;

    // Keep the old function for backwards compatibility
    function restoreNormalView() {
        goBackToSidebar();
    }

    // Make restoreNormalView globally accessible
    window.restoreNormalView = restoreNormalView;

    // Create smart setlist with scanned songs
    async function createSmartSetlistWithSongs(formData) {
        if (!currentUser) {
            showNotification('Please log in to create smart setlists', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('jwtToken');
            if (!token) {
                showNotification('Authentication required', 'error');
                return;
            }
            
            const smartSetlistData = {
                name: formData.name,
                description: formData.description,
                conditions: formData.conditions,
                songs: smartSetlistScanResults
            };
            
            const response = await fetch(`${API_BASE_URL}/api/smart-setlists`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(smartSetlistData)
            });
            
            if (response.ok) {
                const newSmartSetlist = await response.json();
                console.log('📋 Smart Setlist created successfully on server:', newSmartSetlist.name);
                smartSetlists.push(newSmartSetlist);
                renderSmartSetlists();
                showNotification(`Smart setlist "${newSmartSetlist.name}" created with ${smartSetlistScanResults.length} songs`);
            } else {
                let errorMessage = 'Unknown error';
                if (response.status === 413) {
                    errorMessage = 'Smart setlist data is too large. Try reducing the number of songs or conditions.';
                } else {
                    try {
                        const error = await response.json();
                        errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
                    } catch (jsonError) {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    }
                }
                showNotification(`Failed to create smart setlist: ${errorMessage}`, 'error');
            }
        } catch (error) {
            console.error('Error creating smart setlist:', error);
            showNotification('Failed to create smart setlist', 'error');
        }
    }

    // Edit smart setlist
    function editSmartSetlist(setlistId) {
        const smartSetlist = smartSetlists.find(s => s.id === setlistId || s._id === setlistId);
        if (!smartSetlist) {
            console.error('Smart setlist not found for editing:', setlistId);
            return;
        }
        
        console.log('Editing smart setlist:', smartSetlist.name);
        
        // Reset form and populate basic info
        document.getElementById('smartSetlistId').value = smartSetlist.id || smartSetlist._id;
        document.getElementById('smartSetlistName').value = smartSetlist.name;
        document.getElementById('smartSetlistDescription').value = smartSetlist.description || '';
        
        // Helper function to populate multiselect
        function populateMultiselect(dropdownId, inputId, selectedId, values) {
            const dropdown = document.getElementById(dropdownId);
            const input = document.getElementById(inputId);
            const selected = document.getElementById(selectedId);
            
            if (dropdown && input && selected && values && values.length > 0) {
                // Ensure _selections exists
                if (!dropdown._selections) {
                    dropdown._selections = new Set();
                }
                dropdown._selections.clear();
                values.forEach(value => dropdown._selections.add(value));
                updateSelectedDisplay(inputId, selectedId, dropdown._selections);
            } else if (dropdown && input && selected) {
                // Clear if no values
                if (!dropdown._selections) {
                    dropdown._selections = new Set();
                }
                dropdown._selections.clear();
                updateSelectedDisplay(inputId, selectedId, dropdown._selections);
            }
        }
        
        // Populate conditions if they exist
        if (smartSetlist.conditions) {
            const conditions = smartSetlist.conditions;
            
            // Set tempo values
            if (conditions.tempoMin) document.getElementById('smartTempoMin').value = conditions.tempoMin;
            if (conditions.tempoMax) document.getElementById('smartTempoMax').value = conditions.tempoMax;
            
            // Populate multiselect dropdowns with saved conditions
            populateMultiselect('smartKeyDropdown', 'smartConditionKey', 'smartSelectedKeys', conditions.keys);
            populateMultiselect('smartTimeDropdown', 'smartConditionTime', 'smartSelectedTimes', conditions.times);
            populateMultiselect('smartTaalDropdown', 'smartConditionTaal', 'smartSelectedTaals', conditions.taals);
            populateMultiselect('smartMoodDropdown', 'smartConditionMood', 'smartSelectedMoods', conditions.moods);
            populateMultiselect('smartGenreDropdown', 'smartConditionGenre', 'smartSelectedGenres', conditions.genres);
            populateMultiselect('smartCategoryDropdown', 'smartConditionCategory', 'smartSelectedCategories', conditions.categories);
        } else {
            // Clear all multiselects and inputs if no conditions exist
            setTimeout(() => {
                populateMultiselect('smartKeyDropdown', 'smartConditionKey', 'smartSelectedKeys', []);
                populateMultiselect('smartTimeDropdown', 'smartConditionTime', 'smartSelectedTimes', []); 
                populateMultiselect('smartTaalDropdown', 'smartConditionTaal', 'smartSelectedTaals', []);
                populateMultiselect('smartMoodDropdown', 'smartConditionMood', 'smartSelectedMoods', []);
                populateMultiselect('smartGenreDropdown', 'smartConditionGenre', 'smartSelectedGenres', []);
                populateMultiselect('smartCategoryDropdown', 'smartConditionCategory', 'smartSelectedCategories', []);
                
                // Clear tempo values
                document.getElementById('smartTempoMin').value = '';
                document.getElementById('smartTempoMax').value = '';
            }, 50);
        }
        
        document.getElementById('smartSetlistModalTitle').textContent = 'Edit Smart Setlist';
        document.getElementById('smartSetlistSubmit').textContent = 'Update Smart Setlist';
        
        // Reset scan results if available
        if (smartSetlist.songs) {
            smartSetlistScanResults = smartSetlist.songs;
            displayScanResults(smartSetlistScanResults);
        }
        
        // Open modal first, then reinitialize multiselects and populate
        openModal('smartSetlistModal');
        
        // Reinitialize multiselects after modal is open to ensure DOM elements are available
        setTimeout(() => {
            initializeSmartSetlistMultiselects();
            
            // Populate conditions after multiselects are initialized
            if (smartSetlist.conditions) {
                const conditions = smartSetlist.conditions;
                
                // Set tempo values
                if (conditions.tempoMin) document.getElementById('smartTempoMin').value = conditions.tempoMin;
                if (conditions.tempoMax) document.getElementById('smartTempoMax').value = conditions.tempoMax;
                
                // Populate multiselect dropdowns with saved conditions
                setTimeout(() => {
                    populateMultiselect('smartKeyDropdown', 'smartConditionKey', 'smartSelectedKeys', conditions.keys);
                    populateMultiselect('smartTimeDropdown', 'smartConditionTime', 'smartSelectedTimes', conditions.times);
                    populateMultiselect('smartTaalDropdown', 'smartConditionTaal', 'smartSelectedTaals', conditions.taals);
                    populateMultiselect('smartMoodDropdown', 'smartConditionMood', 'smartSelectedMoods', conditions.moods);
                    populateMultiselect('smartGenreDropdown', 'smartConditionGenre', 'smartSelectedGenres', conditions.genres);
                    populateMultiselect('smartCategoryDropdown', 'smartConditionCategory', 'smartSelectedCategories', conditions.categories);
                }, 50);
            }
        }, 100);
    }

    // Delete smart setlist
    async function deleteSmartSetlist(setlistId) {
        const setlist = smartSetlists.find(s => s.id === setlistId || s._id === setlistId);
        if (!setlist) return;

        const modal = document.getElementById('confirmDeleteSetlistModal');
        const message = document.getElementById('deleteSetlistMessage');
        
        message.textContent = `Are you sure you want to delete the smart setlist "${setlist.name}"?`;
        modal.style.display = 'flex';

        document.getElementById('confirmDeleteSetlist').onclick = async () => {
            modal.style.display = 'none';
            
            if (!currentUser) {
                showNotification('Authentication required', 'error');
                return;
            }
            
            try {
                const token = localStorage.getItem('jwtToken');
                if (!token) {
                    showNotification('Authentication required', 'error');
                    return;
                }
            
                const response = await fetch(`${API_BASE_URL}/api/smart-setlists/${setlistId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    smartSetlists = smartSetlists.filter(s => (s.id !== setlistId && s._id !== setlistId));
                    renderSmartSetlists();
                    showNotification('Smart setlist deleted');
                } else {
                    let errorMessage = 'Unknown error';
                    try {
                        const error = await response.json();
                        errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
                    } catch (jsonError) {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    }
                    showNotification(`Failed to delete smart setlist: ${errorMessage}`, 'error');
                }
            } catch (error) {
                console.error('Error deleting smart setlist:', error);
                showNotification('Failed to delete smart setlist', 'error');
            }
        };
        
        // Cancel delete setlist button
        document.getElementById('cancelDeleteSetlist').onclick = () => {
            modal.style.display = 'none';
        };
    }

    // Update smart setlist with fresh scan results
    async function updateSmartSetlist(setlistId) {
        const smartSetlist = smartSetlists.find(s => s.id === setlistId || s._id === setlistId);
        if (!smartSetlist || !smartSetlist.conditions) {
            showNotification('❌ Cannot update: Smart setlist or conditions not found', 'error');
            return;
        }
        
        if (!currentUser) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        try {
            showNotification(`🔄 Updating "${smartSetlist.name}"...`);
            
            // Rescan with the saved conditions
            const updatedSongs = await scanSongsWithConditions(smartSetlist.conditions);
            
            const token = localStorage.getItem('jwtToken');
            if (!token) {
                showNotification('Authentication required', 'error');
                return;
            }
            
            // Update on server
            const updateData = {
                name: smartSetlist.name,
                description: smartSetlist.description,
                conditions: smartSetlist.conditions,
                songs: updatedSongs || []
            };
            
            const response = await fetch(`${API_BASE_URL}/api/smart-setlists/${setlistId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (response.ok) {
                const updatedSmartSetlist = await response.json();
                // Update local array
                const index = smartSetlists.findIndex(s => (s.id === setlistId || s._id === setlistId));
                if (index !== -1) {
                    smartSetlists[index] = updatedSmartSetlist;
                }
                
                // Re-render the smart setlists to show updated count
                renderSmartSetlists();
                
                // If this smart setlist is currently being viewed, refresh the main view
                if (currentViewingSetlist && currentSetlistType === 'smart' && 
                    (currentViewingSetlist.id === setlistId || currentViewingSetlist._id === setlistId)) {
                    console.log('Re-rendering currently viewed smart setlist with updated songs');
                    showSmartSetlistInMainSection(setlistId);
                }
                
                showNotification(`✅ Smart setlist "${updatedSmartSetlist.name}" updated with ${updatedSongs.length} songs`);
            } else {
                let errorMessage = 'Unknown error';
                if (response.status === 413) {
                    errorMessage = 'Smart setlist data is too large. Try reducing the number of songs or conditions.';
                } else {
                    try {
                        const error = await response.json();
                        errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
                    } catch (jsonError) {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    }
                }
                showNotification(`Failed to update smart setlist: ${errorMessage}`, 'error');
            }
        } catch (error) {
            console.error('Error updating smart setlist:', error);
            showNotification('Failed to update smart setlist', 'error');
        }
    }

    // Update smart setlist from form (used by form submission)
    async function updateSmartSetlistForm(setlistId, formData) {
        if (!currentUser) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('jwtToken');
            if (!token) {
                showNotification('Authentication required', 'error');
                return;
            }
            
            const response = await fetch(`${API_BASE_URL}/api/smart-setlists/${setlistId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                const updatedSmartSetlist = await response.json();
                // Update local array
                const index = smartSetlists.findIndex(s => (s.id === setlistId || s._id === setlistId));
                if (index !== -1) {
                    smartSetlists[index] = updatedSmartSetlist;
                }
                
                renderSmartSetlists();
                showNotification('Smart setlist updated successfully');
            } else {
                let errorMessage = 'Unknown error';
                if (response.status === 413) {
                    errorMessage = 'Smart setlist data is too large. Try reducing the number of songs or conditions.';
                } else {
                    try {
                        const error = await response.json();
                        errorMessage = error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
                    } catch (jsonError) {
                        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                    }
                }
                showNotification(`Failed to update smart setlist: ${errorMessage}`, 'error');
            }
        } catch (error) {
            console.error('Error updating smart setlist:', error);
            showNotification('Failed to update smart setlist', 'error');
        }
    }

    
        // Auto-scroll and chord variables
    let autoScrollInterval = null;
    let isUserScrolling = false;
    // Use global CHORDS, CHORD_REGEX, CHORD_LINE_REGEX, INLINE_CHORD_REGEX
        
        // Navigation history variables moved to top of file
        try {
            searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        } catch (e) {
            // Failed to parse search history - use empty array
            searchHistory = [];
        }
    
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
            // Update favorites count in showFavoritesEl
            if (showFavoritesEl) {
                showFavoritesEl.innerHTML = `Favorites (<span class="favorites-count">${favorites.length}</span>)`;
            }
        
            if (favorites.length === 0) {
                favoritesContent.innerHTML = '<p>No favorite songs yet.</p>';
                return;
            }
        
            const favoriteSongs = songs.filter(song => favorites.includes(song.id));
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
            document.getElementById('loginBtn').style.display = isLoggedIn ? 'none' : 'block';
            document.getElementById('logoutBtn').style.display = isLoggedIn ? 'block' : 'none';
            const registerBtn = document.getElementById('registerBtn');
            if (registerBtn) registerBtn.style.display = isLoggedIn ? 'none' : 'block';
            const isAdminUser = isAdmin();
            document.getElementById('adminPanelBtn').style.display = isAdminUser ? 'block' : 'none';
            if (isAdminUser) {
                document.getElementById('deleteAllSongsBtn').style.display = 'block';
            } else {
                document.getElementById('deleteAllSongsBtn').style.display = 'none';
            }
            if (!isLoggedIn) {
                document.getElementById('deleteSection').style.display = 'none';
            }

            // Update setlist add button visibility
            const addGlobalSetlistBtn = document.getElementById('addGlobalSetlistBtn');
            const addMySetlistBtn = document.getElementById('addMySetlistBtn');
            const addSmartSetlistBtn = document.getElementById('addSmartSetlistBtn');
            
            if (addGlobalSetlistBtn) {
                addGlobalSetlistBtn.style.display = (isAdminUser && document.getElementById('globalSetlistContent')?.style.display === 'block') ? 'block' : 'none';
            }
            
            if (addMySetlistBtn) {
                addMySetlistBtn.style.display = (isLoggedIn && document.getElementById('mySetlistContent')?.style.display === 'block') ? 'block' : 'none';
            }
            
            if (addSmartSetlistBtn) {
                addSmartSetlistBtn.style.display = (isLoggedIn && document.getElementById('smartSetlistContent')?.style.display === 'block') ? 'block' : 'none';
            }
        }

    // --- Admin Panel Logic ---
    //const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://oldandnew.onrender.com';
    async function fetchUsers() {
        const res = await fetch(`${API_BASE_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${jwtToken}` }
        });
        if (!res.ok) return [];
        return res.json();
    }
    async function markAdmin(userId) {
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
            return a.username.localeCompare(b.username); // Secondary sort by username
        });
        
        sortedUsers.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.username}</td>
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
    

        function loadSettings() {
            const savedHeader = localStorage.getItem("sidebarHeader");
            if (savedHeader) document.querySelector(".sidebar-header h2").textContent = savedHeader;

            const sessionResetOption = localStorage.getItem("sessionResetOption") || "manual";

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
            const toggleButtonsVisibility = localStorage.getItem("toggleButtonsVisibility") || "hide";

            document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}%`);
            document.documentElement.style.setProperty('--songs-panel-width', `${songsPanelWidth}%`);
            document.documentElement.style.setProperty('--preview-margin-left', `${previewMargin}px`);

            document.getElementById('panelWidthInput').value = sidebarWidth;
            document.getElementById('previewMarginInput').value = previewMargin;
            document.getElementById('autoScrollSpeedInput').value = savedAutoScrollSpeed;
            document.getElementById("sessionResetOption").value = sessionResetOption;
            document.getElementById("toggleButtonsVisibility").value = toggleButtonsVisibility;
            
            autoScrollSpeed = parseInt(savedAutoScrollSpeed);
            
            // Apply toggle buttons visibility
            applyToggleButtonsVisibility(toggleButtonsVisibility);
        }
    
            
        function applyLyricsBackground(isNew) {
            const lyricsContainer = document.querySelector(".song-lyrics");
            if (!lyricsContainer) return;
            lyricsContainer.classList.remove("lyrics-bg-New", "lyrics-bg-Old");
            lyricsContainer.classList.add(isNew ? "lyrics-bg-New" : "lyrics-bg-Old");
        }
        
        function applyToggleButtonsVisibility(visibility) {
            const toggleButtons = document.querySelectorAll('.panel-toggle.draggable');
            
            toggleButtons.forEach(button => {
                if (visibility === 'hide') {
                    button.style.display = 'none';
                } else {
                    button.style.display = '';  // Use CSS default (flex/block)
                }
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
                sidebar.classList.add('hidden');
                songsSection.classList.add('hidden');
            }
            updatePositions();
    
            window.addEventListener('resize', updatePositions);
        }

        // Mobile touch navigation enhancements
        function addMobileTouchNavigation() {
            const sidebar = document.querySelector('.sidebar');
            const songsSection = document.querySelector('.songs-section');
            
            // Only add touch gestures for mobile screens
            if (window.innerWidth <= 768) {
                // Touch gesture variables
                let touchStartX = 0;
                let touchStartY = 0;
                let touchEndX = 0;
                let touchEndY = 0;
                
                // Minimum swipe distance and maximum vertical movement for horizontal swipes
                const minSwipeDistance = 50;
                const maxVerticalMovement = 100;
                
                // Add touch event listeners for swipe gestures
                document.addEventListener('touchstart', (e) => {
                    touchStartX = e.changedTouches[0].screenX;
                    touchStartY = e.changedTouches[0].screenY;
                }, { passive: true });
                
                document.addEventListener('touchend', (e) => {
                    touchEndX = e.changedTouches[0].screenX;
                    touchEndY = e.changedTouches[0].screenY;
                    
                    const deltaX = touchEndX - touchStartX;
                    const deltaY = Math.abs(touchEndY - touchStartY);
                    
                    // Only process horizontal swipes (not vertical scrolls)
                    if (Math.abs(deltaX) >= minSwipeDistance && deltaY <= maxVerticalMovement) {
                        handleSwipeGesture(deltaX, touchStartX);
                    }
                }, { passive: true });
                
                function handleSwipeGesture(deltaX, startX) {
                    const screenWidth = window.innerWidth;
                    const edgeThreshold = screenWidth * 0.15; // 15% from edge
                    
                    // Swipe from left edge to right (show sidebar)
                    if (deltaX > 0 && startX <= edgeThreshold) {
                        sidebar.classList.remove('hidden');
                        songsSection.classList.add('hidden');
                        updatePositions();
                    }
                    // Swipe from right edge to left (show songs)
                    else if (deltaX < 0 && startX >= (screenWidth - edgeThreshold)) {
                        songsSection.classList.remove('hidden');
                        sidebar.classList.add('hidden');
                        updatePositions();
                    }
                    // Swipe left anywhere to hide current panel
                    else if (deltaX < 0 && Math.abs(deltaX) > minSwipeDistance) {
                        if (!sidebar.classList.contains('hidden')) {
                            sidebar.classList.add('hidden');
                            updatePositions();
                        } else if (!songsSection.classList.contains('hidden')) {
                            songsSection.classList.add('hidden');
                            updatePositions();
                        }
                    }
                }
            }
            
            // Note: createMobileNavButtons is now called in init() for all screen sizes
        }
        
        function createMobileNavButtons() {
            // Remove existing mobile nav container if it exists
            const existingContainer = document.querySelector('.mobile-nav-container');
            if (existingContainer) {
                existingContainer.remove();
            }
            
            // Create mobile navigation container
            const mobileNavContainer = document.createElement('div');
            mobileNavContainer.className = 'mobile-nav-container';
            
            // Conditionally include the 'Toggle Both Panels' button based on screen size
            const isMobile = window.innerWidth <= 768;
            const bothPanelsButton = isMobile ? '' : `
                <button class="mobile-nav-btn mobile-nav-both" title="Toggle Both Panels">
                    <i class="fas fa-eye"></i>
                </button>`;
            
            mobileNavContainer.innerHTML = `
                <button class="mobile-nav-btn mobile-nav-sidebar" title="Toggle Sidebar">
                    <i class="fas fa-home"></i>
                </button>
                <button class="mobile-nav-btn mobile-nav-songs" title="Toggle Songs">
                    <i class="fas fa-list"></i>
                </button>${bothPanelsButton}
            `;
            
            document.body.appendChild(mobileNavContainer);
            
            // Add event listeners for mobile nav buttons
            const sidebar = document.querySelector('.sidebar');
            const songsSection = document.querySelector('.songs-section');
            
            document.querySelector('.mobile-nav-sidebar').addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('hidden');
                if (!sidebar.classList.contains('hidden')) {
                    songsSection.classList.add('hidden');
                }
                updatePositions();
            });
            
            document.querySelector('.mobile-nav-songs').addEventListener('click', (e) => {
                e.stopPropagation();
                songsSection.classList.toggle('hidden');
                if (!songsSection.classList.contains('hidden')) {
                    sidebar.classList.add('hidden');
                }
                updatePositions();
            });
            
            // Only add event listener for 'Toggle Both Panels' if the button exists
            const toggleBothBtn = document.querySelector('.mobile-nav-both');
            if (toggleBothBtn) {
                toggleBothBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const areBothHidden = sidebar.classList.contains('hidden') && songsSection.classList.contains('hidden');
                    sidebar.classList.toggle('hidden', !areBothHidden);
                    songsSection.classList.toggle('hidden', !areBothHidden);
                    document.querySelector('.mobile-nav-both i').className = areBothHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
                    updatePositions();
                });
            }
        }
        
        // Handle mobile navigation on resize - recreate buttons to show/hide toggle-both button
        window.addEventListener('resize', () => {
            // Remove existing buttons and recreate them
            const existingContainer = document.querySelector('.mobile-nav-container');
            if (existingContainer) {
                existingContainer.remove();
            }
            createMobileNavButtons();
            
            // Reapply toggle buttons visibility based on screen size
            const toggleButtonsVisibility = localStorage.getItem("toggleButtonsVisibility") || "hide";
            applyToggleButtonsVisibility(toggleButtonsVisibility);
        });

    
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
                document.querySelector('.preview-section').classList.add('full-width');
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
            }
    
            localStorage.setItem('songs', JSON.stringify(songs));
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
                localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
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
                    // Always update favorites from backend
                    favorites = Array.isArray(data.favorites) ? data.favorites : [];
                    if (!Array.isArray(favorites)) favorites = [];
                    if (data.user && data.user.username) {
                        currentUser = data.user;
                        localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    }
                    updateAuthButtons();
                        // Force re-render songs to update favorite icons for both tabs
                        const filters = getCurrentFilterValues();
                        renderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                        renderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
                        // Always re-render favorites list after loading
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
                // No cap on favorites, send all
                const limitedFavorites = Array.isArray(favorites) ? favorites : [];
                // Use name, email, transpose as expected by backend
                const name = currentUser && currentUser.username ? currentUser.username : '';
                const email = currentUser && currentUser.email ? currentUser.email : '';
                let transpose = {};
                try {
                    transpose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
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
        //         showNotification('Failed to save favorites.');
        //     }
        // });
    
        function downloadSongs() {
            const data = {
                songs: songs,
                favorites: favorites
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Old-songs.json';
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
                        favorites = data.favorites || [];
                        saveSongs();
                        queueSaveUserData();
                        
                        if (NewTab.classList.contains('active')) {
                            renderSongs('New', keyFilter.value, genreFilter.value);
                        } else {
                            renderSongs('Old', keyFilter.value, genreFilter.value);
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
                        if (NewTab.classList.contains('active')) {
                            const filters = getCurrentFilterValues();
                            renderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                        } else {
                            const filters = getCurrentFilterValues();
                            renderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
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
    
            localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
        }

        function getVocalTags(genres) {
        return genres ? genres.filter(g => VOCAL_TAGS.includes(g)) : [];
        }
        function getNonVocalGenres(genres) {
            return genres ? genres.filter(g => !VOCAL_TAGS.includes(g)) : [];
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
                localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
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
                container = category === 'New' ? document.getElementById('NewContent') : document.getElementById('OldContent');
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
                
                const isFavorite = Array.isArray(favorites) && favorites.includes(song.id);
                const displayGenres = song.genres ? song.genres.join(', ') : song.genre || '';
                
                // Calculate transposed key for display - using same logic as showPreview
                let transposeLevel = 0;
                if (currentSetlistType === 'global-setlist' && currentSetlistId && song.id) {
                    // Admin's global setlist transpose
                    if (globalSetlistTranspose && globalSetlistTranspose[song.id] && typeof globalSetlistTranspose[song.id] === 'number') {
                        transposeLevel = globalSetlistTranspose[song.id];
                    }
                } else {
                    // User's personal transpose
                    try {
                        const localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                        if (song.id && typeof localTranspose[song.id] === 'number') {
                            transposeLevel = localTranspose[song.id];
                        }
                    } catch (e) {
                        transposeLevel = 0;
                    }
                }
                
                const displayKey = transposeLevel !== 0 ? transposeChord(song.key, transposeLevel) : song.key;
                
                div.innerHTML = `
                <div class="song-header">
                    <span class="song-title">${song.title}</span>
                    <button class="favorite-btn ${isFavorite ? 'favorited' : ''}" data-song-id="${song.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="song-meta">${displayKey} | ${song.tempo} | ${song.time || song.timeSignature} | ${song.taal || ''} | ${displayGenres}</div>
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
                    const activeTab = document.getElementById('NewTab').classList.contains('active') ? 'New' : 'Old';
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
            favorites = [];
            searchHistory = [];
            navigationHistory = [];
            currentHistoryPosition = -1;
            
            // Clear all local storage
            localStorage.removeItem('songs');
            localStorage.removeItem('favorites');
            localStorage.removeItem('searchHistory');
            localStorage.removeItem('darkMode');
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
            NewContent.innerHTML = '<p>No songs found.</p>';
            OldContent.innerHTML = '<p>No songs found.</p>';
            NewSetlistSongs.innerHTML = '<p>Your New setlist is empty.</p>';
            OldSetlistSongs.innerHTML = '<p>Your Old setlist is empty.</p>';
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
            document.getElementById('NewCount').textContent = '0';
            document.getElementById('OldCount').textContent = '0';
            
            // Reset theme to light mode if it was dark
            if (document.body.classList.contains('dark-mode')) {
                document.body.classList.remove('dark-mode');
                document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
                localStorage.setItem('darkMode', 'false');
            }
            
            // Show default view
            NewTab.click();
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
                    moodScore: 0,
                    rhythmCategoryScore: 0
                };

                let score = 0;

                // 1. Language match
                details.languageScore = getLanguageMatchScore(
                    currentSong.genres || (currentSong.genre ? [currentSong.genre] : []),
                    song.genres || (song.genre ? [song.genre] : [])
                );
                score += WEIGHTS.language * details.languageScore;
                details.languages = getLanguagesFromGenres(song.genres || (song.genre ? [song.genre] : []));

                // 2. Scale relationships
                if (currentSong.key && song.key) {
                    if (currentSong.key === song.key) {
                        score += WEIGHTS.scale;
                        details.scalePriority = 4;
                    } 
                    else if ((isCurrentMajor && song.key === HARMONIC_RELATIONS[currentSong.key]?.[2]) ||
                            (isCurrentMinor && currentSong.key === HARMONIC_RELATIONS[song.key]?.[2])) {
                        score += WEIGHTS.scale * 0.9;
                        details.scalePriority = 3;
                    }
                    else if (HARMONIC_RELATIONS[currentSong.key]?.includes(song.key)) {
                        score += WEIGHTS.scale * 0.8;
                        details.scalePriority = 2;
                    }
                    else if (details.sameScaleType) {
                        score += WEIGHTS.scale * 0.5;
                        details.scalePriority = 1;
                    }
                }

                // 3. Time signature matching - handle both .time and .timeSignature properties
                const currentTime = currentSong.time || currentSong.timeSignature;
                const songTime = song.time || song.timeSignature;
                if (currentTime === songTime) {
                    details.timeMatchType = 'exact';
                    score += WEIGHTS.timeSignature;
                } 
                else if (TIME_SIGNATURE_COMPATIBILITY[currentTime]?.includes(songTime)) {
                    details.timeMatchType = 'compatible';
                    score += WEIGHTS.timeSignature * 0.9;
                }

                // 4. Taal match
                details.taalMatch = currentSong.taal === song.taal;
                if (details.taalMatch) score += WEIGHTS.taal;

                // 5. Tempo similarity
                details.tempoSimilarity = getTempoSimilarity(currentSong.tempo, song.tempo);
                score += WEIGHTS.tempo * details.tempoSimilarity;

                // 6. Non-language genres
                details.genreMatch = getGenreMatchScore(
                    currentSong.genres || (currentSong.genre ? [currentSong.genre] : []),
                    song.genres || (song.genre ? [song.genre] : [])
                );
                score += WEIGHTS.genre * details.genreMatch;

                // 7. Vocal tags match
                details.vocalScore = getVocalMatchScore(
                    currentSong.genres || (currentSong.genre ? [currentSong.genre] : []),
                    song.genres || (song.genre ? [song.genre] : [])
                );
                score += WEIGHTS.vocal * details.vocalScore;

                // 8. Mood match
                details.moodScore = getMoodMatchScore(currentSong.mood, song.mood);
                score += WEIGHTS.mood * details.moodScore;

                // 9. Rhythm category match (Indian/Western/Others)
                const currentRhythmCategory = normalizeRhythmCategoryValue(currentSong.rhythmCategory || '');
                const songRhythmCategory = normalizeRhythmCategoryValue(song.rhythmCategory || '');
                details.rhythmCategoryScore = (currentRhythmCategory && songRhythmCategory && currentRhythmCategory === songRhythmCategory) ? 1 : 0;
                score += (WEIGHTS.rhythmCategory || 0) * details.rhythmCategoryScore;

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
            
            if (!currentSongId) {
                return;
            }

            const suggestedSongs = getSuggestedSongs(currentSongId);
            
            const suggestedSongsContent = document.getElementById('suggestedSongsContent');
            if (!suggestedSongsContent) {
                return;
            }
            
            suggestedSongsContent.innerHTML = '';

            if (suggestedSongs.length === 0) {
                suggestedSongsContent.innerHTML = '<p>No suggested songs found</p>';
                return;
            }

            suggestedSongs.forEach(song => {
                // Calculate transpose for suggested song display consistency
                let transposeLevel = 0;
                if (currentSetlistType === 'global-setlist' && currentSetlistId && song.id) {
                    // Admin's global setlist transpose
                    if (globalSetlistTranspose && globalSetlistTranspose[song.id] && typeof globalSetlistTranspose[song.id] === 'number') {
                        transposeLevel = globalSetlistTranspose[song.id];
                    }
                } else {
                    // User's personal transpose
                    try {
                        const localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                        if (song.id && typeof localTranspose[song.id] === 'number') {
                            transposeLevel = localTranspose[song.id];
                        }
                    } catch (e) {
                        transposeLevel = 0;
                    }
                }
                
                const displayKey = transposeLevel !== 0 ? transposeChord(song.key, transposeLevel) : song.key;
                
                const div = document.createElement('div');
                div.className = 'suggested-song-item';
                div.innerHTML = `
                    <div class="suggested-song-title">${song.title}</div>
                    <div class="suggested-song-meta">
                        Key: ${displayKey} | Tempo: ${song.tempo} | Time: ${song.time || song.timeSignature} | Taal: ${song.taal}
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
                const res = await fetch(`${API_BASE_URL}/api/recommendation-weights`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken') || ''}`
                    },
                    body: JSON.stringify(weights)
                });
                if (res.ok) {
                    const data = await res.json();
                    const mergedWeights = { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...weights };
                    localStorage.setItem('recommendationWeights', JSON.stringify(mergedWeights));
                    WEIGHTS = mergedWeights;
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
                const res = await fetch(`${API_BASE_URL}/api/recommendation-weights`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('jwtToken') || ''}`
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    const localLastModified = WEIGHTS.lastModified || localStorage.getItem('recommendationWeightsLastModified');
                    if (!localLastModified || !data.lastModified || data.lastModified !== localLastModified) {
                        WEIGHTS = { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...data };
                        localStorage.setItem('recommendationWeights', JSON.stringify(WEIGHTS));
                        localStorage.setItem('recommendationWeightsLastModified', data.lastModified || '');
                    }
                }
            } catch (e) { /* fallback to local */ }
        }
    
        function toggleSuggestedSongsDrawer() {
            const drawer = document.getElementById('suggestedSongsDrawer');
            const toggleBtn = document.getElementById('toggleSuggestedSongs');
            
            if (!drawer || !toggleBtn) {
                return;
            }
            
            if (suggestedSongsDrawerOpen) {
                drawer.classList.remove('open');
                toggleBtn.style.right = '20px';
            } else {
                showSuggestedSongs();
                drawer.classList.add('open');
                toggleBtn.style.right = '370px';
            }
            
            suggestedSongsDrawerOpen = !suggestedSongsDrawerOpen;
        }
    
        function closeSuggestedSongsDrawer() {
            const drawer = document.getElementById('suggestedSongsDrawer');
            const toggleBtn = document.getElementById('toggleSuggestedSongs');
            
            drawer.classList.remove('open');
            toggleBtn.style.right = '20px';
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
            if (!jwtToken) return false;
            try {
                const payload = JSON.parse(atob(jwtToken.split('.')[1]));
                // Accept both boolean true and string 'true' for isAdmin
                return payload && (payload.isAdmin === true || payload.isAdmin === 'true');
            } catch {
                return false;
            }
        }

        function attachPreviewEventListeners(song) {
            // Favorite button event listener is attached after rendering preview HTML, not here.

            // Metadata toggle button
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

            // Transpose controls
            document.getElementById('transpose-up')?.addEventListener('click', async () => {
                let currentLevel = parseInt(document.getElementById('transpose-level').textContent);
                currentLevel = isNaN(currentLevel) ? 0 : currentLevel;
                const newLevel = currentLevel + 1;
                document.getElementById('transpose-level').textContent = newLevel;
                
                // Update loop player melodic samples for new key
                if (typeof loopPlayerInstance !== 'undefined' && loopPlayerInstance) {
                    const newEffectiveKey = await loopPlayerInstance.setSongKeyAndTranspose(song.key, newLevel, true);
                    
                    // Update key indicators in UI
                    const atmosphereKeyIndicator = document.getElementById(`atmosphere-key-${song.id}`);
                    const tanpuraKeyIndicator = document.getElementById(`tanpura-key-${song.id}`);
                    if (atmosphereKeyIndicator) atmosphereKeyIndicator.textContent = newEffectiveKey;
                    if (tanpuraKeyIndicator) tanpuraKeyIndicator.textContent = newEffectiveKey;
                    
                    // Re-check availability and update pad enable/disable states
                    if (typeof updateMelodicPadAvailability === 'function') {
                        await updateMelodicPadAvailability(song.id, newEffectiveKey);
                    }
                }
                
                updatePreviewWithTransposition(newLevel);
            });

            document.getElementById('transpose-down')?.addEventListener('click', async () => {
                let currentLevel = parseInt(document.getElementById('transpose-level').textContent);
                currentLevel = isNaN(currentLevel) ? 0 : currentLevel;
                const newLevel = currentLevel - 1;
                document.getElementById('transpose-level').textContent = newLevel;
                
                // Update loop player melodic samples for new key
                if (typeof loopPlayerInstance !== 'undefined' && loopPlayerInstance) {
                    const newEffectiveKey = await loopPlayerInstance.setSongKeyAndTranspose(song.key, newLevel, true);
                    
                    // Update key indicators in UI
                    const atmosphereKeyIndicator = document.getElementById(`atmosphere-key-${song.id}`);
                    const tanpuraKeyIndicator = document.getElementById(`tanpura-key-${song.id}`);
                    if (atmosphereKeyIndicator) atmosphereKeyIndicator.textContent = newEffectiveKey;
                    if (tanpuraKeyIndicator) tanpuraKeyIndicator.textContent = newEffectiveKey;
                    
                    // Re-check availability and update pad enable/disable states
                    if (typeof updateMelodicPadAvailability === 'function') {
                        await updateMelodicPadAvailability(song.id, newEffectiveKey);
                    }
                }
                
                updatePreviewWithTransposition(newLevel);
            });

            document.getElementById('transposeReset').addEventListener('click', async () => {
                const newLevel = 0;
                document.getElementById('transpose-level').textContent = newLevel;
                
                // Update loop player melodic samples for new key
                if (typeof loopPlayerInstance !== 'undefined' && loopPlayerInstance) {
                    const newEffectiveKey = await loopPlayerInstance.setSongKeyAndTranspose(song.key, newLevel, true);
                    
                    // Update key indicators in UI
                    const atmosphereKeyIndicator = document.getElementById(`atmosphere-key-${song.id}`);
                    const tanpuraKeyIndicator = document.getElementById(`tanpura-key-${song.id}`);
                    if (atmosphereKeyIndicator) atmosphereKeyIndicator.textContent = newEffectiveKey;
                    if (tanpuraKeyIndicator) tanpuraKeyIndicator.textContent = newEffectiveKey;
                    
                    // Re-check availability and update pad enable/disable states
                    if (typeof updateMelodicPadAvailability === 'function') {
                        await updateMelodicPadAvailability(song.id, newEffectiveKey);
                    }
                }
                
                updatePreviewWithTransposition(newLevel);
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
                    
                    // Get the opening context to determine where to save the transpose
                    const openingContext = songPreviewEl.dataset.openingContext || 'all-songs';
                    const isAdmin = currentUser && currentUser.isAdmin;
                    
                    // Only allow global setlist transpose saves for admins when song was opened from global setlist
                    if (openingContext === 'global-setlist' && !isAdmin) {
                        showNotification('Only administrators can save transpose for global setlists');
                        return;
                    }
                    
                    // Calculate new key
                    const originalKey = song.key || '';
                    const newKey = transposeSingleChord(originalKey, level);
                    
                    let saveSuccess = false;
                    
                    if (openingContext === 'global-setlist' && isAdmin) {
                        // Save transpose to global setlist
                        try {
                            const setlistId = currentViewingSetlist._id;
                            const response = await authFetch(`${API_BASE_URL}/api/global-setlists/${setlistId}/transpose`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    songId: song.id,
                                    transpose: level,
                                    newKey: newKey
                                })
                            });
                            
                            if (response.ok) {
                                showNotification('Global transpose saved for all users!');
                                song.key = newKey;
                                
                                // Update local global setlist cache
                                if (currentViewingSetlist.songTransposes) {
                                    currentViewingSetlist.songTransposes[song.id] = level;
                                } else {
                                    currentViewingSetlist.songTransposes = { [song.id]: level };
                                }
                                
                                // Update the cached global setlists data so other admins see the change
                                if (window.dataCache['global-setlists'] && Array.isArray(window.dataCache['global-setlists'])) {
                                    const cachedSetlist = window.dataCache['global-setlists'].find(s => s._id === currentViewingSetlist._id);
                                    if (cachedSetlist) {
                                        if (!cachedSetlist.songTransposes) {
                                            cachedSetlist.songTransposes = {};
                                        }
                                        cachedSetlist.songTransposes[song.id] = level;
                                    }
                                }
                                
                                // Also update the globalSetlists array
                                if (Array.isArray(globalSetlists)) {
                                    const setlistInArray = globalSetlists.find(s => s._id === currentViewingSetlist._id);
                                    if (setlistInArray) {
                                        if (!setlistInArray.songTransposes) {
                                            setlistInArray.songTransposes = {};
                                        }
                                        setlistInArray.songTransposes[song.id] = level;
                                    }
                                }
                                
                                saveSuccess = true;
                            } else {
                                showNotification('Failed to save global transpose');
                            }
                        } catch (e) {
                            showNotification('Network error saving global transpose');
                        }
                    } else {
                        // Save personal transpose to user data
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
                        
                        // Update localStorage cache for personal transpose
                        let localTranspose = {};
                        try {
                            localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                        } catch (e) { localTranspose = {}; }
                        localTranspose[song.id] = level;
                        localStorage.setItem('transposeCache', JSON.stringify(localTranspose));
                    }
                    
                    // Refresh setlist display to show updated chords
                    if (typeof refreshSetlistDisplay === 'function') {
                        refreshSetlistDisplay();
                    }
                });
            }
            // Setup auto-scroll if needed
            setupAutoScroll();
        }
    
        async function showPreview(song, fromHistory = false, openingContext = 'all-songs') {
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
                    position: currentHistoryPosition 
                }, '', `#song-${song.id}`);
            }

            // Clear the preview and reset state
            songPreviewEl.innerHTML = '';
            songPreviewEl.dataset.songId = song.id;
            songPreviewEl.dataset.originalLyrics = song.lyrics || song.editSongLyrics || song.content || song.text || '';
            songPreviewEl.dataset.originalKey = normalizeKeySignature(song.key);
            songPreviewEl.dataset.openingContext = openingContext;

            // Check if song is in current setlist and favorites
            const setlistDropdown = document.getElementById('setlistDropdown');
            const currentSetlistValue = setlistDropdown ? setlistDropdown.value : '';
            const isInSetlist = currentSetlistValue ? isSongInCurrentSetlist(song.id, currentSetlistValue) : false;
            const isFavorite = favorites.includes(song.id);

            // Use localStorage for transpose cache, update only on page refresh
            let transposeLevel = 0;
            let userData = {};
            let localTranspose = {};
            
            // Context-based transpose logic based on where the song was opened from
            if (openingContext === 'global-setlist' && currentViewingSetlist && currentViewingSetlist.songTransposes && song.id in currentViewingSetlist.songTransposes) {
                // Song opened from global setlist - use global setlist transpose
                transposeLevel = currentViewingSetlist.songTransposes[song.id] || 0;
            } else if (openingContext === 'user-setlist' || openingContext === 'all-songs') {
                // Song opened from user setlist or all songs - use user's personal transpose
                try {
                    localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
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
            } else {
                // Default case - use user's personal transpose
                try {
                    localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                    if (song.id && typeof localTranspose[song.id] === 'number') {
                        transposeLevel = localTranspose[song.id];
                    }
                } catch (e) {
                    transposeLevel = 0;
                }
            }
            
            // Extract distinct chords for display
            const distinctChords = extractDistinctChords(song.lyrics, transposeLevel, song.manualChords);
            const chordsDisplay = distinctChords.length > 0 ? distinctChords.join(', ') : '';
            
            // Calculate transposed key for display
            const canonicalSongKey = normalizeKeySignature(song.key);
            const displayKey = transposeLevel !== 0 ? transposeChord(canonicalSongKey, transposeLevel) : canonicalSongKey;
            
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
            ${chordsDisplay || song.artistDetails || song.mood || song.genres || song.genre ? `
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
            </div>` : ''}
        </div>

        <!-- ACTIONS SECTION -->
        <div class="song-preview-actions">
            <button class="preview-action-btn preview-setlist-btn ${isInSetlist ? 'remove' : 'add'}" id="previewSetlistBtn">
                <i class="fas ${isInSetlist ? 'fa-check' : 'fa-plus'}"></i>
                <span>${isInSetlist ? 'In Setlist' : 'Add to Setlist'}</span>
            </button>
            <button class="preview-action-btn preview-edit-btn" id="previewEditBtn">
                <i class="fas fa-edit"></i>
                <span>Edit</span>
            </button>
            ${isAdmin() ? `<button class="preview-action-btn preview-delete-btn" id="previewDeleteBtn">
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
                <span>Reset</span>
            </button>
            <button class="preview-transpose-btn preview-save" id="saveTransposeBtn" title="Save Transpose">
                <i class="fas fa-save"></i>
                <span>Save</span>
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
    </div>
</div>
`;

            // Show the modal immediately
            songPreviewEl.style.display = 'block';
            document.body.style.overflow = 'hidden';

            // Set the transpose-level element to the loaded value before attaching listeners
            document.getElementById('transpose-level').textContent = transposeLevel;
            
            // Attach all event listeners
            attachPreviewEventListeners(song);
            
            // Load and format lyrics asynchronously for better performance
            setTimeout(() => {
                const lyricsContainer = document.getElementById('preview-lyrics-container');
                if (lyricsContainer) {
                    // Handle case where lyrics might be undefined or stored in different fields
                    const lyricsText = song.lyrics || song.editSongLyrics || song.content || song.text || 'No lyrics available';
                    lyricsContainer.innerHTML = formatLyricsWithChords(lyricsText, transposeLevel);
                }

                // Initialize loop player for this song
                if (typeof initializeLoopPlayer === 'function') {
                    initializeLoopPlayer(song.id);
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
            applyLyricsBackground(song.category === 'New');
            
            if (suggestedSongsDrawerOpen) {
                showSuggestedSongs();
            }
        }
    
    
        function formatLyricsWithChords(lyrics, transposeLevel) {
            // Handle undefined, null, or empty lyrics
            if (!lyrics || typeof lyrics !== 'string') {
                return '<div class="lyric-line">No lyrics available</div>';
            }
            
            const lines = lyrics.split('\n');
            let output = [];
    
            // Regex to detect song structure tags (case insensitive)
            const STRUCTURE_TAG_REGEX = /^\s*[\[\(]?\s*(verse|chorus|bridge|pre-chorus|prechorus|intro|outro|interlude|solo|refrain|tag|coda|instrumental|break|hook|breakdown|drop|build)\s*[\d\w]*\s*[\]\)]?\s*:?\s*$/i;
    
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
    
                if (line.trim() === '') {
                    output.push(`<div class="lyric-line">&nbsp;</div>`);
                    continue;
                }
    
                // Check for song structure tags first
                if (STRUCTURE_TAG_REGEX.test(line.trim())) {
                    output.push(`<div class="lyric-line song-structure-tag"><strong>${line.trim()}</strong></div>`);
                    continue;
                }
    
                if (isChordLine(line)) {
                    let processedLine = line.replace(
                        CHORD_REGEX,
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
            return CHORD_LINE_REGEX.test(line.trim());
        }

        function hasInlineChords(line) {
            // Use only the defined constant for inline chord detection
            INLINE_CHORD_REGEX.lastIndex = 0;
            return INLINE_CHORD_REGEX.test(line);
        }
    
        function transposeChord(chord, steps) {
            if (!chord) return chord;
            const safeSteps = Number.isFinite(steps) ? steps : 0;
    
            if (chord.includes('/')) {
                const [baseChord, bassNote] = chord.split('/');
                const transposedBase = transposeSingleChord(baseChord, safeSteps);
                const transposedBass = bassNote ? transposeSingleChord(bassNote, safeSteps) : '';
                return transposedBase + (transposedBass ? '/' + transposedBass : '');
            }
    
            return transposeSingleChord(chord, safeSteps);
        }
    
        function transposeSingleChord(chord, steps) {
            if (!chord) return chord;

            const match = chord.match(/^([A-G][#b]?)(.*)$/i);
            if (!match) return chord;

            const baseNote = match[1];
            const quality = match[2] || '';
            const normalizedBaseNote = normalizeBaseNote(baseNote);

            // Chromatic scale using canonical notation (Eb and Bb as flats, others as sharps)
            const chromaticScale = CHORDS;

            // Always resolve via canonical base note to support legacy spellings like Ab/Db/Gb/D#/A#
            let currentIndex = chromaticScale.indexOf(normalizedBaseNote);
            if (currentIndex === -1) return chord;

            // Calculate new position
            const shift = Number.isFinite(steps) ? steps : 0;
            const newIndex = (currentIndex + shift + 12) % 12;
            let newBaseNote = chromaticScale[newIndex];

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

            // Update chords display with transposition
            const songId = songPreviewEl.dataset.songId;
            const currentSong = songs.find(s => s.id == songId || s._id == songId);
            const manualChords = currentSong ? currentSong.manualChords : '';
            const distinctChords = extractDistinctChords(lyrics, transposeLevel, manualChords);
            const chordsDisplay = distinctChords.length > 0 ? distinctChords.join(', ') : '';
            const previewChordsElement = document.querySelector('.preview-meta-row .preview-meta-value[style*="margin-left"]');
            if (previewChordsElement) {
                if (chordsDisplay) {
                    previewChordsElement.innerHTML = `Chords: ${chordsDisplay}`;
                    previewChordsElement.style.display = 'inline';
                } else {
                    previewChordsElement.style.display = 'none';
                }
            }

            const lyricsContainer = document.querySelector('.song-lyrics');
            if (lyricsContainer) {
                lyricsContainer.innerHTML = formatLyricsWithChords(lyrics, transposeLevel);
            }
        }
    
        // Function to extract distinct chords from lyrics
        function extractDistinctChords(lyrics, transposeLevel = 0, manualChords = '') {
            // Function to clean up chord names for display
            function cleanChordName(chord) {
                // Remove 'maj' from chord names to make them more compact
                // Fmaj7 -> F7, Bbmaj7 -> Bb7, Cmaj -> C
                return chord.replace(/maj(?=\d)|maj$/g, '');
            }
            
            const chordSet = new Set();
            
            // If manual chords are provided (for manual entries), use those instead of parsing lyrics
            if (manualChords && manualChords.trim()) {
                const chordArray = manualChords.split(',').map(chord => {
                    let cleanChord = chord.trim();
                    if (cleanChord) {
                        // Apply transpose if needed
                        const finalChord = transposeLevel !== 0 ? transposeChord(cleanChord, transposeLevel) : cleanChord;
                        // Clean up chord name for display (remove maj)
                        return cleanChordName(finalChord);
                    }
                    return '';
                }).filter(chord => chord.length > 0);
                
                return chordArray; // Return as array, already sorted as entered by user
            }
            
            // Original logic for parsing lyrics
            if (!lyrics) return [];
            
            const lines = lyrics.split('\n');
            
            for (const line of lines) {
                // Check for chord lines (entire line is chords)
                if (isChordLine(line)) {
                    const chords = line.match(CHORD_REGEX);
                    if (chords) {
                        chords.forEach(chord => {
                            const cleanChord = chord.trim();
                            if (cleanChord) {
                                // Apply transpose if needed
                                const finalChord = transposeLevel !== 0 ? transposeChord(cleanChord, transposeLevel) : cleanChord;
                                // Clean up chord name for display
                                const displayChord = cleanChordName(finalChord);
                                chordSet.add(displayChord);
                            }
                        });
                    }
                }
                
                // Check for inline chords [chord] or (chord)
                if (hasInlineChords(line)) {
                    const inlineChords = line.match(INLINE_CHORD_REGEX);
                    if (inlineChords) {
                        inlineChords.forEach(match => {
                            const chord = match.replace(/[\[\]()]/g, '').trim();
                            if (chord) {
                                // Apply transpose if needed
                                const finalChord = transposeLevel !== 0 ? transposeChord(chord, transposeLevel) : chord;
                                // Clean up chord name for display
                                const displayChord = cleanChordName(finalChord);
                                chordSet.add(displayChord);
                            }
                        });
                    }
                }
            }
            
            // Convert Set to Array and sort
            return Array.from(chordSet).sort((a, b) => {
                // Custom sort to prioritize root notes, then by chord complexity
                const getRootNote = (chord) => {
                    const match = chord.match(/^([A-G][#b]?)/);
                    return match ? match[1] : chord;
                };
                
                const rootA = getRootNote(a);
                const rootB = getRootNote(b);
                
                if (rootA !== rootB) {
                    // Sort by chromatic order
                    const chromaticOrder = CHORDS;
                    const indexA = chromaticOrder.indexOf(normalizeBaseNote(rootA));
                    const indexB = chromaticOrder.indexOf(normalizeBaseNote(rootB));
                    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                }
                
                // Same root note, sort by chord complexity (simpler first)
                return a.length - b.length;
            });
        }

        function setupAutoScroll() {
            isUserScrolling = false;
            songPreviewEl.scrollTop = 0;
            
            // Preserve auto-scroll state when changing songs
            const wasAutoScrollActive = autoScrollInterval !== null;
            
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }
            
            // Only reset button state if auto-scroll was not previously active
            if (!wasAutoScrollActive && toggleAutoScrollBtn) {
                toggleAutoScrollBtn.innerHTML = '<i class="fas fa-play"></i>';
                toggleAutoScrollBtn.classList.remove('active');
            } else if (wasAutoScrollActive) {
                // Restart auto-scroll if it was previously active
                setTimeout(() => {
                    startAutoScroll('down');
                }, 100); // Small delay to allow the new song content to load
            }
        }
    
        function startAutoScroll(direction = 'down') {
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
            }
            
            const scrollStep = direction === 'down' ? 20 : -20;
            if (toggleAutoScrollBtn) {
                toggleAutoScrollBtn.innerHTML = '<i class="fas fa-pause"></i>';
                toggleAutoScrollBtn.classList.add('active');
            }
            
            autoScrollInterval = setInterval(() => {
                if (isUserScrolling) return;
                const previewHeight = songPreviewEl.scrollHeight;
                const viewportHeight = songPreviewEl.clientHeight;
                const maxScroll = previewHeight - viewportHeight;
                const currentScroll = songPreviewEl.scrollTop;
                
                if ((direction === 'down' && currentScroll >= maxScroll - 10) || 
                    (direction === 'up' && currentScroll <= 10)) {
                    clearInterval(autoScrollInterval);
                    autoScrollInterval = null;
                    if (toggleAutoScrollBtn) {
                        toggleAutoScrollBtn.innerHTML = '<i class="fas fa-play"></i>';
                        toggleAutoScrollBtn.classList.remove('active');
                    }
                    return;
                }
                
                const targetScroll = direction === 'down' 
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
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
                toggleAutoScrollBtn.innerHTML = '<i class="fas fa-play"></i>';
                toggleAutoScrollBtn.classList.remove('active');
            } else {
                startAutoScroll('down');
                toggleAutoScrollBtn.innerHTML = '<i class="fas fa-pause"></i>';
                toggleAutoScrollBtn.classList.add('active');
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
                        (existingSong.id || existingSong._id) : existingSong;
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
                if (response.status === 403) {
                    throw new Error('FORBIDDEN_ACCESS');
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
                if (response.status === 403) {
                    throw new Error('FORBIDDEN_ACCESS');
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
                showNotification('Please login to add songs to your favorites.');
                return;
            }
            const index = favorites.indexOf(id);
            const song = songs.find(s => s.id === id);
            let nowFavorite;
            if (index === -1) {
                favorites.push(id);
                nowFavorite = true;
            } else {
                favorites.splice(index, 1);
                nowFavorite = false;
            }
            showNotification(`"${song.title}" ${nowFavorite ? 'added to' : 'removed from'} favorites`);
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
                    const preservedContext = songPreviewEl.dataset.openingContext || 'all-songs';
                    if (currentSong) {
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
            
            // Handle both string ID and DOM element
            const modalElement = typeof modal === 'string' ? document.getElementById(modal) : modal;
            
            if (!modalElement) {
                console.error('Modal not found:', modal);
                return;
            }
            
            modalElement.style.display = 'flex';
            currentModal = modalElement;
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
                // Clear internal Set-based selections
                const moodDropdown = document.getElementById('moodDropdown');
                const artistDropdown = document.getElementById('artistDropdown');
                const genreDropdown = document.getElementById('genreDropdown');
                
                if (moodDropdown && moodDropdown._allSelections) {
                    moodDropdown._allSelections.clear();
                }
                if (artistDropdown && artistDropdown._allSelections) {
                    artistDropdown._allSelections.clear();
                }
                if (genreDropdown && genreDropdown._allSelections) {
                    genreDropdown._allSelections.clear();
                }
                
                // Clear DOM-based selections
                document.querySelectorAll('#moodDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                document.querySelectorAll('#artistDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                document.querySelectorAll('#genreDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Update displays
                updateSelectedMultiselect('selectedMoods', 'moodDropdown', true, 'songMood');
                updateSelectedMultiselect('selectedArtists', 'artistDropdown', true, 'songArtist');
                updateSelectedMultiselect('selectedGenres', 'genreDropdown', true, 'songGenre');
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

        // Setup song structure tag buttons functionality
        function setupSongStructureTags() {
            // Function to insert text at cursor position in textarea
            function insertTextAtCursor(textarea, text) {
                const startPos = textarea.selectionStart;
                const endPos = textarea.selectionEnd;
                const currentValue = textarea.value;
                
                // Save the current scroll position
                const scrollTop = textarea.scrollTop;
                
                // Insert text at cursor position with proper newlines
                const beforeText = currentValue.substring(0, startPos);
                const afterText = currentValue.substring(endPos);
                
                // Add newlines if needed for proper spacing
                let insertText = text;
                if (beforeText && !beforeText.endsWith('\n')) {
                    insertText = '\n' + insertText;
                }
                
                textarea.value = beforeText + insertText + afterText;
                
                // Move cursor to end of inserted text
                const newPos = startPos + insertText.length;
                textarea.focus();
                textarea.setSelectionRange(newPos, newPos);
                
                // Restore the scroll position to prevent unwanted scrolling
                textarea.scrollTop = scrollTop;
            }
            
            // Add event listeners to all structure tag buttons
            document.querySelectorAll('.structure-tag-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tag = button.getAttribute('data-tag');
                    const targetId = button.getAttribute('data-target');
                    const textarea = document.getElementById(targetId);
                    
                    if (textarea && tag) {
                        insertTextAtCursor(textarea, tag);
                    }
                });
            });
        }
    
        function editSong(id) {
            // Enhanced song lookup with proper ID matching and multiple data source fallback
            function findSongById(searchId) {
                // Convert searchId to both string and number for comparison
                const numId = typeof searchId === 'string' ? parseInt(searchId) : searchId;
                const strId = String(searchId);
                
                // Try global songs array first (most current data)
                if (songs && songs.length > 0) {
                    const found = songs.find(s => s.id === numId || s.id === strId || String(s.id) === strId);
                    if (found) return found;
                }
                
                // Try cache as fallback
                if (window.dataCache.songs) {
                    const found = window.dataCache.songs.find(s => s.id === numId || s.id === strId || String(s.id) === strId);
                    if (found) return found;
                }
                
                // Try window.songs if it exists
                if (window.songs) {
                    const found = window.songs.find(s => s.id === numId || s.id === strId || String(s.id) === strId);
                    if (found) return found;
                }
                
                return null;
            }
            
            const song = findSongById(id);
            if (!song) {
                console.error(`❌ Edit Song: Song with ID ${id} not found in any data source`);
                return;
            }
            
            // Debug log for consistency tracking
            console.log(`🎵 Edit Song: Editing song ${song.id} "${song.title}" - mood: "${song.mood}"`);
            
            document.getElementById('editSongId').value = Number(song.id);
            document.getElementById('editSongTitle').value = song.title;
            document.getElementById('editSongCategory').value = song.category;
            document.getElementById('editSongKey').value = song.key;
            
            // Handle multiselect artist field
            const artists = song.artistDetails ? song.artistDetails.split(',').map(a => a.trim()).filter(a => a) : [];
            setupSearchableMultiselect('editSongArtist', 'editArtistDropdown', 'editSelectedArtists', ARTISTS, true);
            // Initialize the Set with existing artists after setup is complete
            setTimeout(() => {
                const editArtistDropdown = document.getElementById('editArtistDropdown');
                if (editArtistDropdown && editArtistDropdown._allSelections) {
                    editArtistDropdown._allSelections.clear();
                    artists.forEach(artist => {
                        editArtistDropdown._allSelections.add(artist);
                    });
                    updateSelectedMultiselect('editSelectedArtists', 'editArtistDropdown', true, 'editSongArtist');
                    renderMultiselectOptions('editArtistDropdown', ARTISTS, Array.from(editArtistDropdown._allSelections));
                    updateSearchableInput('editSongArtist', 'editSelectedArtists');
                    console.log(`🎵 Edit Song - Artist multiselect initialized with: [${Array.from(editArtistDropdown._allSelections).join(', ')}]`);
                }
            }, 100); // Increased timeout for better reliability
            
            // Handle multiselect mood field with enhanced debugging
            const moods = song.mood ? song.mood.split(',').map(m => m.trim()).filter(m => m) : [];
            console.log(`🎵 Edit Song - Raw mood: "${song.mood}" → Split moods: [${moods.join(', ')}]`);
            
            setupSearchableMultiselect('editSongMood', 'editMoodDropdown', 'editSelectedMoods', MOODS, true);
            // Initialize the Set with existing moods after setup is complete
            setTimeout(() => {
                const editMoodDropdown = document.getElementById('editMoodDropdown');
                if (editMoodDropdown && editMoodDropdown._allSelections) {
                    editMoodDropdown._allSelections.clear();
                    moods.forEach(mood => {
                        editMoodDropdown._allSelections.add(mood);
                    });
                    updateSelectedMultiselect('editSelectedMoods', 'editMoodDropdown', true, 'editSongMood');
                    renderMultiselectOptions('editMoodDropdown', MOODS, Array.from(editMoodDropdown._allSelections));
                    updateSearchableInput('editSongMood', 'editSelectedMoods');
                    console.log(`🎵 Edit Song - Mood multiselect initialized with: [${Array.from(editMoodDropdown._allSelections).join(', ')}]`);
                }
            }, 100); // Increased timeout for better reliability
            
            document.getElementById('editSongTempo').value = song.tempo;
            document.getElementById('editSongTime').value = song.time || song.timeSignature;
            // Populate Taal dropdown with correct options for the song's time signature and select the song's taal
            updateTaalDropdown('editSongTime', 'editSongTaal', song.taal);

            const parsedRhythmSetNo = song.rhythmSetNo || (() => {
                if (!song.rhythmSetId) return '';
                const match = String(song.rhythmSetId).match(/_([0-9]+)$/);
                return match ? match[1] : '';
            })();
            const resolvedRhythmFamily = normalizeRhythmFamilyValue(song.rhythmFamily || song.taal || '');

            const editRhythmFamilyEl = document.getElementById('editSongRhythmFamily');
            const editRhythmSetNoEl = document.getElementById('editSongRhythmSetNo');
            if (editRhythmFamilyEl) editRhythmFamilyEl.value = resolvedRhythmFamily;
            if (editRhythmSetNoEl) editRhythmSetNoEl.value = parsedRhythmSetNo;
            const editRhythmCategoryEl = document.getElementById('editSongRhythmCategory');
            if (editRhythmCategoryEl) {
                editRhythmCategoryEl.value = normalizeRhythmCategoryValue(song.rhythmCategory || '');
            }
            updateRhythmSetIdPreview('editSongRhythmFamily', 'editSongRhythmSetNo', 'editSongRhythmSetIdPreview');

            const editRhythmPreviewEl = document.getElementById('editSongRhythmSetIdPreview');
            if (editRhythmPreviewEl && song.rhythmSetId) {
                editRhythmPreviewEl.value = song.rhythmSetId;
            }

            // Initialize genre multiselect (options rendered later in setTimeout)
            setupSearchableMultiselect('editSongGenre', 'editGenreDropdown', 'editSelectedGenres', GENRES, true);
            
            // Set selected genres using the Set-based approach after setup is complete
            const genres = song.genres || (song.genre ? [song.genre] : []);
            console.log(`🎵 Edit Song - Raw genre: "${song.genre}" → Split genres: [${genres.join(', ')}]`);
            
            setTimeout(() => {
                const editGenreDropdown = document.getElementById('editGenreDropdown');
                if (editGenreDropdown && editGenreDropdown._allSelections) {
                    // Clear existing selections
                    editGenreDropdown._allSelections.clear();
                    // Add current song's genres to the Set
                    genres.forEach(genre => {
                        editGenreDropdown._allSelections.add(genre);
                    });
                    // Update the display (use generic function)
                    updateSelectedMultiselect('editSelectedGenres', 'editGenreDropdown', true, 'editSongGenre');
                    // Re-render the options with current selections
                    renderMultiselectOptions('editGenreDropdown', GENRES, Array.from(editGenreDropdown._allSelections));
                    // Update input to show current selection
                    updateSearchableInput('editSongGenre', 'editSelectedGenres');
                    console.log(`🎵 Edit Song - Genre multiselect initialized with: [${Array.from(editGenreDropdown._allSelections).join(', ')}]`);
                }
            }, 100); // Increased timeout for better reliability
            document.getElementById('editSongLyrics').value = song.lyrics;
            editSongModal.style.display = 'flex';
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
                return songs.filter(song => favorites.includes(song.id));
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
                const category = NewTab.classList.contains('active') ? 'New' : 'Old';
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
            const sessionResetOption = document.getElementById("sessionResetOption").value;
            const toggleButtonsVisibility = document.getElementById("toggleButtonsVisibility").value;

            document.querySelector(".sidebar-header h2").textContent = newHeader;

            document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}%`);
            document.documentElement.style.setProperty('--songs-panel-width', `${songsPanelWidth}%`);
            document.documentElement.style.setProperty('--preview-margin-left', `${previewMargin}px`);

            localStorage.setItem("sidebarHeader", newHeader);
            localStorage.setItem("setlistText", newSetlist);
            try {
                localStorage.setItem("sidebarWidth", sidebarWidth);
                localStorage.setItem("songsPanelWidth", songsPanelWidth);
                localStorage.setItem("previewMargin", previewMargin);
                localStorage.setItem("autoScrollSpeed", newAutoScrollSpeed);
                localStorage.setItem("sessionResetOption", sessionResetOption);
                localStorage.setItem("toggleButtonsVisibility", toggleButtonsVisibility);
            } catch (e) {
                console.warn('Failed to save settings to localStorage:', e);
                // Continue without saving settings
            }
            autoScrollSpeed = parseInt(newAutoScrollSpeed);
            
            // Apply toggle buttons visibility
            applyToggleButtonsVisibility(toggleButtonsVisibility);
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
            // Admin panel tab switching
            const userMgmtTab = document.getElementById('userMgmtTab');
            const weightsTab = document.getElementById('weightsTab');
            const rhythmSetsTab = document.getElementById('rhythmSetsTab');
            const userMgmtTabContent = document.getElementById('userMgmtTabContent');
            const weightsTabContent = document.getElementById('weightsTabContent');
            const rhythmSetsTabContent = document.getElementById('rhythmSetsTabContent');
            if (userMgmtTab && weightsTab && userMgmtTabContent && weightsTabContent) {
                userMgmtTab.addEventListener('click', () => {
                    userMgmtTab.classList.add('active');
                    weightsTab.classList.remove('active');
                    if (rhythmSetsTab) rhythmSetsTab.classList.remove('active');
                    userMgmtTabContent.style.display = '';
                    weightsTabContent.style.display = 'none';
                    if (rhythmSetsTabContent) rhythmSetsTabContent.style.display = 'none';
                });
                weightsTab.addEventListener('click', () => {
                    userMgmtTab.classList.remove('active');
                    weightsTab.classList.add('active');
                    if (rhythmSetsTab) rhythmSetsTab.classList.remove('active');
                    userMgmtTabContent.style.display = 'none';
                    weightsTabContent.style.display = '';
                    if (rhythmSetsTabContent) rhythmSetsTabContent.style.display = 'none';
                    loadWeightsToForm();
                });
                if (rhythmSetsTab && rhythmSetsTabContent) {
                    rhythmSetsTab.addEventListener('click', () => {
                        userMgmtTab.classList.remove('active');
                        weightsTab.classList.remove('active');
                        rhythmSetsTab.classList.add('active');
                        userMgmtTabContent.style.display = 'none';
                        weightsTabContent.style.display = 'none';
                        rhythmSetsTabContent.style.display = '';
                        loadRhythmSets();
                    });
                }
            }

            const rhythmSetCreateForm = document.getElementById('rhythmSetCreateForm');
            if (rhythmSetCreateForm && !rhythmSetCreateForm.dataset.bound) {
                rhythmSetCreateForm.dataset.bound = 'true';
                rhythmSetCreateForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await createRhythmSetFromForm();
                });
            }

            const rhythmSetsTable = document.getElementById('rhythmSetsTable');
            if (rhythmSetsTable && !rhythmSetsTable.dataset.bound) {
                rhythmSetsTable.dataset.bound = 'true';
                rhythmSetsTable.addEventListener('click', async (e) => {
                    const target = e.target instanceof Element ? e.target : null;
                    if (!target) return;
                    const row = target.closest('tr[data-rhythm-set-id]');
                    if (!row) return;

                    const rhythmSetId = row.dataset.rhythmSetId;
                    const statusSelect = row.querySelector('.rhythm-set-status-select');
                    const notesInput = row.querySelector('.rhythm-set-notes-input');

                    if (target.classList.contains('rhythm-set-save-btn')) {
                        try {
                            showRhythmSetsNotification(`Saving ${rhythmSetId}...`);
                            await saveRhythmSetRow(rhythmSetId, statusSelect ? statusSelect.value : 'active', notesInput ? notesInput.value : '');
                            showRhythmSetsNotification(`Saved ${rhythmSetId}.`, 'success');
                            await loadRhythmSets();
                        } catch (error) {
                            showRhythmSetsNotification(error.message || `Failed to save ${rhythmSetId}.`, 'error');
                        }
                    }

                    if (target.classList.contains('rhythm-set-recompute-btn')) {
                        try {
                            showRhythmSetsNotification(`Recomputing ${rhythmSetId}...`);
                            await recomputeRhythmSetRow(rhythmSetId);
                            showRhythmSetsNotification(`Recomputed ${rhythmSetId}.`, 'success');
                            await loadRhythmSets();
                        } catch (error) {
                            showRhythmSetsNotification(error.message || `Failed to recompute ${rhythmSetId}.`, 'error');
                        }
                    }
                });
            }

            

            // Save weights form
            const weightsForm = document.getElementById('weightsForm');
            if (weightsForm) {
                weightsForm.addEventListener('submit', async function(e) {
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
                });
            }

            // Tab switching
            NewTab.addEventListener('click', () => {
                setlistSection.style.display = 'none';
                if (setlistSectionActions) setlistSectionActions.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'none';
                NewTab.classList.add('active');
                OldTab.classList.remove('active');
                NewContent.classList.add('active');
                OldContent.classList.remove('active');
                debouncedRenderSongs('New', keyFilter.value, genreFilter.value);
                applyLyricsBackground(true);
                
                // Mobile view: show songs panel and hide sidebar
                if (window.innerWidth <= 768) {
                    document.querySelector('.songs-section').classList.remove('hidden');
                    document.querySelector('.sidebar').classList.add('hidden');
                    document.querySelector('.preview-section').classList.remove('full-width');
                }
            });

    
            OldTab.addEventListener('click', () => {
                setlistSection.style.display = 'none';
                if (setlistSectionActions) setlistSectionActions.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'none';
                OldTab.classList.add('active');
                NewTab.classList.remove('active');
                OldContent.classList.add('active');
                NewContent.classList.remove('active');
                debouncedRenderSongs('Old', keyFilter.value, genreFilter.value);
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
                if (NewTab.classList.contains('active')) {
                    debouncedRenderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            genreFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (NewTab.classList.contains('active')) {
                    debouncedRenderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            moodFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (NewTab.classList.contains('active')) {
                    debouncedRenderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
                }
            });

            artistFilter.addEventListener('change', () => {
                const filters = getCurrentFilterValues();
                if (NewTab.classList.contains('active')) {
                    debouncedRenderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                } else {
                    debouncedRenderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
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
                        const activeTab = document.getElementById('NewTab').classList.contains('active') ? 'New' : 'Old';
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
                    
                    activeSetlistElementId = id; // Track for back button
                    
                    if (type === 'global') {
                        showGlobalSetlistInMainSection(id);
                    } else if (type === 'my') {
                        showMySetlistInMainSection(id);
                    }
                });
                
                // Restore previous selection from localStorage on page load
                const savedSelection = localStorage.getItem('selectedSetlist');
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
                            activeSetlistElementId = id; // Track for back button
                            if (type === 'global') {
                                showGlobalSetlistInMainSection(id);
                            } else if (type === 'my') {
                                showMySetlistInMainSection(id);
                            }
                        }
                    }, 100);
                }
            }

            showAllEl.addEventListener('click', (e) => {
                e.preventDefault();
                NewContent.classList.add('active');
                OldContent.classList.remove('active');
                setlistSection.style.display = 'none';
                deleteSection.style.display = 'none';
                favoritesSection.style.display = 'none';
                
                // Clear active setlist tracking
                activeSetlistElementId = null;
                
                // Reset setlist header to default text
                const setlistHeader = document.getElementById('setlistViewHeader');
                if (setlistHeader) {
                    setlistHeader.textContent = 'Setlist View';
                }
                
                renderSongs('New', keyFilter.value, genreFilter.value);
                document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
                e.target.classList.add('active');
                
                // Hide setlist descriptions from sidebar
                hideSetlistDescription('global');
                hideSetlistDescription('my');
                
                // Keep the setlist dropdown selection - don't reset it
                // The user can manually select "Select a Setlist" if they want to clear it
                
                applyLyricsBackground(true);
                
                // Mobile view: show songs panel and hide sidebar
                if (window.innerWidth <= 768) {
                    document.querySelector('.songs-section').classList.remove('hidden');
                    document.querySelector('.sidebar').classList.add('hidden');
                    document.querySelector('.preview-section').classList.remove('full-width');
                }
            });

    
            showFavoritesEl.addEventListener('click', (e) => {
                e.preventDefault();
                NewContent.classList.remove('active');
                OldContent.classList.remove('active');
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
                document.getElementById('selectedGenres').innerHTML = '';
                document.querySelectorAll('#genreDropdown .multiselect-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
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
            
            // Note: multiselect event handlers are now set up by setupSearchableMultiselect function
            // No need for manual event listeners here
    
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
                    const selectedMoods = Array.from(moodDropdown._allSelections || []);
                    const selectedArtists = Array.from(artistDropdown._allSelections || []);

                    const rhythmFamilyInput = document.getElementById('songRhythmFamily')?.value || '';
                    const rhythmSetNoInput = document.getElementById('songRhythmSetNo')?.value || '';
                    const rhythmFamily = normalizeRhythmFamilyValue(rhythmFamilyInput);
                    const rhythmSetNo = parseInt(rhythmSetNoInput, 10);
                    const rhythmSetId = buildRhythmSetIdValue(rhythmFamily, rhythmSetNo);
                    
                    const newSong = {
                        title: title,
                        category: document.getElementById('songCategory').value,
                        rhythmCategory: normalizeRhythmCategoryValue(document.getElementById('songRhythmCategory')?.value || ''),
                        key: normalizeKeySignature(document.getElementById('songKey').value),
                        artistDetails: selectedArtists.length > 0 ? selectedArtists.join(', ') : '',
                        mood: selectedMoods.length > 0 ? selectedMoods.join(', ') : '',
                        tempo: document.getElementById('songTempo').value,
                        time: document.getElementById('songTime').value,
                        taal: document.getElementById('songTaal').value,
                        genres: selectedGenres,
                        ...(rhythmFamily ? { rhythmFamily } : {}),
                        ...(Number.isInteger(rhythmSetNo) && rhythmSetNo > 0 ? { rhythmSetNo } : {}),
                        ...(rhythmSetId ? { rhythmSetId } : {}),
                        lyrics: lyrics,
                        createdBy: (currentUser && currentUser.username) ? currentUser.username : undefined,
                        createdAt: new Date().toISOString()
                    };
                    try {
                        console.log(`🔄 Adding song to backend: ${newSong.title}`);
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
                            const moodDropdown = document.getElementById('moodDropdown');
                            const artistDropdown = document.getElementById('artistDropdown');
                            const genreDropdown = document.getElementById('genreDropdown');
                            
                            if (moodDropdown && moodDropdown._allSelections) {
                                moodDropdown._allSelections.clear();
                            }
                            if (artistDropdown && artistDropdown._allSelections) {
                                artistDropdown._allSelections.clear();
                            }
                            if (genreDropdown && genreDropdown._allSelections) {
                                genreDropdown._allSelections.clear();
                            }
                            
                            // Clear DOM selections
                            document.querySelectorAll('#genreDropdown .multiselect-option').forEach(opt => {
                                opt.classList.remove('selected');
                            });
                            document.querySelectorAll('#moodDropdown .multiselect-option').forEach(opt => {
                                opt.classList.remove('selected');
                            });
                            document.querySelectorAll('#artistDropdown .multiselect-option').forEach(opt => {
                                opt.classList.remove('selected');
                            });
                            
                            // Update displays
                            updateSelectedMultiselect('selectedGenres', 'genreDropdown', true, 'songGenre');
                            updateSelectedMultiselect('selectedMoods', 'moodDropdown', true, 'songMood');
                            updateSelectedMultiselect('selectedArtists', 'artistDropdown', true, 'songArtist');
                            const songRhythmSetNoEl = document.getElementById('songRhythmSetNo');
                            if (songRhythmSetNoEl) songRhythmSetNoEl.value = '';
                            const songRhythmFamilyEl = document.getElementById('songRhythmFamily');
                            if (songRhythmFamilyEl) songRhythmFamilyEl.value = '';
                            updateRhythmSetIdPreview('songRhythmFamily', 'songRhythmSetNo', 'songRhythmSetIdPreview');
                            
                            // Update cache directly instead of invalidating
                            updateSongInCache(addedSong, true);
                            
                            // Only render if we're on the same category tab as the new song
                            const activeTab = document.getElementById('NewTab')?.classList.contains('active') ? 'New' : 'Old';
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
    
            editSongForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('editSongId').value;
                const title = document.getElementById('editSongTitle').value;
                const lyrics = document.getElementById('editSongLyrics').value;

                const selectedGenres = Array.from(document.querySelectorAll('#editGenreDropdown .multiselect-option.selected'))
                    .map(opt => opt.dataset.value);
                
                // Collect multiselect values for mood and artist
                const editMoodDropdown = document.getElementById('editMoodDropdown');
                const editArtistDropdown = document.getElementById('editArtistDropdown');
                const selectedMoods = Array.from(editMoodDropdown._allSelections || []);
                const selectedArtists = Array.from(editArtistDropdown._allSelections || []);

                const editRhythmFamilyInput = document.getElementById('editSongRhythmFamily')?.value || '';
                const editRhythmSetNoInput = document.getElementById('editSongRhythmSetNo')?.value || '';
                const editRhythmFamily = normalizeRhythmFamilyValue(editRhythmFamilyInput);
                const editRhythmSetNo = parseInt(editRhythmSetNoInput, 10);
                const editRhythmSetId = buildRhythmSetIdValue(editRhythmFamily, editRhythmSetNo);

                // Find the original song for missing fields
                const original = songs.find(s => s.id == id) || {};
                const updatedSong = {
                    id: Number(id),
                    title: title,
                    category: document.getElementById('editSongCategory').value,
                    rhythmCategory: normalizeRhythmCategoryValue(document.getElementById('editSongRhythmCategory')?.value || ''),
                    key: normalizeKeySignature(document.getElementById('editSongKey').value),
                    artistDetails: selectedArtists.length > 0 ? selectedArtists.join(', ') : '',
                    mood: selectedMoods.length > 0 ? selectedMoods.join(', ') : '',
                    tempo: document.getElementById('editSongTempo').value,
                    time: document.getElementById('editSongTime').value,
                    taal: document.getElementById('editSongTaal').value,
                    genres: selectedGenres,
                    ...(editRhythmFamily ? { rhythmFamily: editRhythmFamily } : {}),
                    ...(Number.isInteger(editRhythmSetNo) && editRhythmSetNo > 0 ? { rhythmSetNo: editRhythmSetNo } : {}),
                    ...(editRhythmSetId ? { rhythmSetId: editRhythmSetId } : {}),
                    lyrics: lyrics,
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
                            const activeTab = document.getElementById('NewTab')?.classList.contains('active') ? 'New' : 'Old';
                            console.log(`🎵 Edit song complete - Updated song category: ${updated.category}, Active tab: ${activeTab}`);
                            if (updated.category === activeTab) {
                                console.log(`✅ Rendering ${updated.category} tab after edit`);
                                debouncedRenderSongs(updated.category, keyFilter.value, genreFilter.value);
                            } else {
                                console.log(`⏭️ Skipping render - song category (${updated.category}) doesn't match active tab (${activeTab})`);
                            }
                            if (songPreviewEl.dataset.songId == id) {
                                const preservedContext = songPreviewEl.dataset.openingContext || 'all-songs';
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
            });
    
            cancelDeleteSong.addEventListener('click', () => {
                deleteSongModal.style.display = 'none';
            });
    
        document.getElementById('confirmDeleteSong').addEventListener('click', async () => {
            const id = Number(document.getElementById('deleteSongId').value);
            const deleteBtn = document.getElementById('confirmDeleteSong');
            if (deleteBtn) deleteBtn.disabled = true;
            await deleteSongById(id, () => {
                deleteSongModal.style.display = 'none';
                // Only render if we're on the correct tab
                const activeTab = document.getElementById('NewTab')?.classList.contains('active') ? 'New' : 'Old';
                debouncedRenderSongs(activeTab, keyFilter.value, genreFilter.value);
                if (deleteBtn) deleteBtn.disabled = false;
            });
        });

        // Preview scrolling
        songPreviewEl.addEventListener('wheel', handleUserScroll, { passive: true });
        songPreviewEl.addEventListener('touchmove', handleUserScroll, { passive: true });
        
        // Auto-scroll controls
        toggleAutoScrollBtn.addEventListener('click', toggleAutoScroll);
            
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
                favorites = [];
                
                // Clear cache as well
                window.dataCache.songs = [];
                window.dataCache.lastSyncTimestamp.songs = new Date().toISOString();
                
                saveSongs();
                queueSaveUserData();
                
                // Update sync timestamp in localStorage
                localStorage.setItem('songsSyncTimestamp', window.dataCache.lastSyncTimestamp.songs);
                
                if (NewTab.classList.contains('active')) {
                    renderSongs('New', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('Old', keyFilter.value, genreFilter.value);
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
                    if (NewTab.classList.contains('active')) {
                        renderSongs('New', filters.key, filters.genre, filters.mood, filters.artist);
                    } else {
                        renderSongs('Old', filters.key, filters.genre, filters.mood, filters.artist);
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
                    // Calculate transpose for search result display consistency
                    let transposeLevel = 0;
                    if (currentSetlistType === 'global-setlist' && currentSetlistId && song.id) {
                        // Admin's global setlist transpose
                        if (globalSetlistTranspose && globalSetlistTranspose[song.id] && typeof globalSetlistTranspose[song.id] === 'number') {
                            transposeLevel = globalSetlistTranspose[song.id];
                        }
                    } else {
                        // User's personal transpose
                        try {
                            const localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
                            if (song.id && typeof localTranspose[song.id] === 'number') {
                                transposeLevel = localTranspose[song.id];
                            }
                        } catch (e) {
                            transposeLevel = 0;
                        }
                    }
                    
                    const displayKey = transposeLevel !== 0 ? transposeChord(song.key, transposeLevel) : song.key;
                    
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
                        <div class="search-result-meta">${displayKey} | ${song.tempo} | ${song.time || song.timeSignature} | ${song.genre || ''}</div>
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
                if (NewTab.classList.contains('active')) {
                    renderSongs('New', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('Old', keyFilter.value, genreFilter.value);
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
            const settingsBtn = document.createElement("button");
            settingsBtn.id = "settingsBtn";
            settingsBtn.textContent = "🛠 Settings";
            settingsBtn.className = "sidebar-settings-btn"; // Optional: for styling

            const sidebar = document.querySelector(".sidebar");
            if (sidebar) {
                // Place at the bottom of sidebar
                sidebar.appendChild(settingsBtn);
            }
    
            settingsBtn.addEventListener("click", () => {
                document.getElementById("sidebarHeaderInput").value = document.querySelector(".sidebar-header h2").textContent;
                document.getElementById("setlistTextInput").value = ""; // No longer using showSetlist element
                document.getElementById("settingsModal").style.display = "flex";
            });
    
            document.getElementById("settingsForm").addEventListener("submit", function (e) {
                e.preventDefault();
                saveSettings();
                showNotification('Settings saved successfully');
                document.getElementById("settingsModal").style.display = "none";
            });
    
            // Folder toggle
            document.getElementById('toggleSongTools').addEventListener('click', () => {
                const folder = document.getElementById('songToolsContent');
                const toggle = document.getElementById('toggleSongTools');
                folder.classList.toggle('show');
                toggle.classList.toggle('active');
            });
    
            // Suggested songs
            const suggestedSongsBtn = document.getElementById('toggleSuggestedSongs');
            const suggestedSongsCloseBtn = document.getElementById('closeSuggestedSongs');
            
            if (suggestedSongsBtn) {
                suggestedSongsBtn.addEventListener('click', toggleSuggestedSongsDrawer);
            }
            
            if (suggestedSongsCloseBtn) {
                suggestedSongsCloseBtn.addEventListener('click', closeSuggestedSongsDrawer);
            }
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
            
                // Smart Setlist Event Listeners
                const smartHeader = document.getElementById('smartSetlistHeader');
                const addSmartBtn = document.getElementById('addSmartSetlistBtn');
                
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
                                const shouldShow = (!isExpanded && currentUser);
                                addSmartSetlistBtn.style.display = shouldShow ? 'block' : 'none';
                            }
                        }
                    });
                }
                
                if (addSmartBtn && !addSmartBtn._setlistListenerAttached) {
                    addSmartBtn._setlistListenerAttached = true;
                    addSmartBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        createSmartSetlist();
                    });
                }
            }
            
            function createSmartSetlist() {
                // Reset form
                document.getElementById('smartSetlistId').value = '';
                document.getElementById('smartSetlistName').value = '';
                document.getElementById('smartSetlistDescription').value = '';
                
                // Clear all multiselect selections
                ['smartKeyDropdown', 'smartTimeDropdown', 'smartTaalDropdown', 
                 'smartMoodDropdown', 'smartGenreDropdown', 'smartCategoryDropdown'].forEach(dropdownId => {
                    const dropdown = document.getElementById(dropdownId);
                    if (dropdown && dropdown._selections) {
                        dropdown._selections.clear();
                    }
                });
                
                // Clear tempo inputs
                document.getElementById('smartTempoMin').value = '';
                document.getElementById('smartTempoMax').value = '';
                
                // Reset displays
                document.getElementById('smartConditionKey').value = '';
                document.getElementById('smartConditionTime').value = '';
                document.getElementById('smartConditionTaal').value = '';
                document.getElementById('smartConditionMood').value = '';
                document.getElementById('smartConditionGenre').value = '';
                document.getElementById('smartConditionCategory').value = '';
                
                ['smartSelectedKeys', 'smartSelectedTimes', 'smartSelectedTaals',
                 'smartSelectedMoods', 'smartSelectedGenres', 'smartSelectedCategories'].forEach(selectedId => {
                    const selected = document.getElementById(selectedId);
                    if (selected) selected.innerHTML = '';
                });
                
                // Reset scan results
                document.getElementById('scanResults').style.display = 'none';
                document.getElementById('smartSongsResults').style.display = 'none';
                smartSetlistScanResults = [];
                
                document.getElementById('smartSetlistModalTitle').textContent = 'Create Smart Setlist';
                document.getElementById('smartSetlistSubmit').textContent = 'Create Smart Setlist';
                
                // Initialize multiselects
                setTimeout(() => {
                    initializeSmartSetlistMultiselects();
                }, 100);
                
                openModal('smartSetlistModal');
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

            // Smart setlist form submission
            const smartSetlistForm = document.getElementById('smartSetlistForm');
            if (smartSetlistForm && !smartSetlistForm._submitListenerAttached) {
                smartSetlistForm._submitListenerAttached = true;
                smartSetlistForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const setlistId = document.getElementById('smartSetlistId').value;
                    const name = document.getElementById('smartSetlistName').value.trim();
                    const description = document.getElementById('smartSetlistDescription').value.trim();
                    
                    if (!name) {
                        showNotification('Please enter a name for the smart setlist');
                        return;
                    }
                    
                    // Check if we have scan results
                    if (!smartSetlistScanResults || smartSetlistScanResults.length === 0) {
                        showNotification('Please scan for songs before saving the smart setlist');
                        return;
                    }
                    
                    // Collect conditions from multiselects
                    const conditions = {
                        keys: Array.from(document.getElementById('smartKeyDropdown')._selections || []),
                        tempoMin: parseInt(document.getElementById('smartTempoMin').value) || null,
                        tempoMax: parseInt(document.getElementById('smartTempoMax').value) || null,
                        times: Array.from(document.getElementById('smartTimeDropdown')._selections || []),
                        taals: Array.from(document.getElementById('smartTaalDropdown')._selections || []),
                        moods: Array.from(document.getElementById('smartMoodDropdown')._selections || []),
                        genres: Array.from(document.getElementById('smartGenreDropdown')._selections || []),
                        categories: Array.from(document.getElementById('smartCategoryDropdown')._selections || [])
                    };

                    try {
                        const formData = {
                            name,
                            description,
                            conditions,
                            songs: smartSetlistScanResults
                        };
                        
                        if (setlistId) {
                            // Update existing smart setlist
                            await updateSmartSetlistForm(setlistId, formData);
                        } else {
                            // Create new smart setlist
                            await createSmartSetlistWithSongs(formData);
                        }
                        
                        document.getElementById('smartSetlistModal').style.display = 'none';
                        
                    } catch (err) {
                        console.error('Error saving smart setlist:', err);
                        showNotification('Failed to save smart setlist');
                    }
                });
            }
            
            // Scan Songs functionality
            const scanSongsBtn = document.getElementById('scanSongsBtn');
            if (scanSongsBtn && !scanSongsBtn._scanListenerAttached) {
                scanSongsBtn._scanListenerAttached = true;
                scanSongsBtn.addEventListener('click', async function() {
                    try {
                        console.log('Scan button clicked - gathering conditions...');
                        
                        const tempoMinValue = document.getElementById('smartTempoMin').value;
                        const tempoMaxValue = document.getElementById('smartTempoMax').value;
                        
                        const conditions = {
                            keys: Array.from(document.getElementById('smartKeyDropdown')?._selections || []).filter(v => v !== ''),
                            tempoMin: tempoMinValue ? parseInt(tempoMinValue) : null,
                            tempoMax: tempoMaxValue ? parseInt(tempoMaxValue) : null,
                            times: Array.from(document.getElementById('smartTimeDropdown')?._selections || []).filter(v => v !== ''),
                            taals: Array.from(document.getElementById('smartTaalDropdown')?._selections || []).filter(v => v !== ''),
                            moods: Array.from(document.getElementById('smartMoodDropdown')?._selections || []).filter(v => v !== ''),
                            genres: Array.from(document.getElementById('smartGenreDropdown')?._selections || []).filter(v => v !== ''),
                            categories: Array.from(document.getElementById('smartCategoryDropdown')?._selections || []).filter(v => v !== '')
                        };
                        
                        console.log('Scan conditions:', conditions);
                        
                        const results = await scanSongsWithConditions(conditions);
                        smartSetlistScanResults = results;
                        
                        console.log('Scan results received:', results ? results.length : 0, 'songs');
                        displayScanResults(results);
                        
                    } catch (error) {
                        console.error('Error scanning songs:', error);
                        showNotification('Error scanning songs. Please try again.');
                    }
                });
            }
            
            // Tab functionality for scan results
            const scanNewTab = document.getElementById('scanNewTab');
            const scanOldTab = document.getElementById('scanOldTab');
            if (scanNewTab && scanOldTab && !scanNewTab._tabListenerAttached) {
                scanNewTab._tabListenerAttached = true;
                scanOldTab._tabListenerAttached = true;
                
                scanNewTab.addEventListener('click', () => {
                    scanNewTab.classList.add('active');
                    scanOldTab.classList.remove('active');
                    document.getElementById('smartNewResults').style.display = 'block';
                    document.getElementById('smartOldResults').style.display = 'none';
                });
                
                scanOldTab.addEventListener('click', () => {
                    scanOldTab.classList.add('active');
                    scanNewTab.classList.remove('active');
                    document.getElementById('smartOldResults').style.display = 'block';
                    document.getElementById('smartNewResults').style.display = 'none';
                });
            }

            // Setlist view modal tabs
            const setlistNewTab = document.getElementById('setlistNewTab');
            const setlistOldTab = document.getElementById('setlistOldTab');
            const setlistNewSongs = document.getElementById('setlistNewSongs');
            const setlistOldSongs = document.getElementById('setlistOldSongs');

            if (setlistNewTab && setlistOldTab && setlistNewSongs && setlistOldSongs) {
                setlistNewTab.addEventListener('click', () => {
                    setlistNewTab.classList.add('active');
                    setlistOldTab.classList.remove('active');
                    setlistNewSongs.style.display = 'block';
                    setlistOldSongs.style.display = 'none';
                });

                setlistOldTab.addEventListener('click', () => {
                    setlistOldTab.classList.add('active');
                    setlistNewTab.classList.remove('active');
                    setlistOldSongs.style.display = 'block';
                    setlistNewSongs.style.display = 'none';
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
                        } else {
                            editMySetlist(currentViewingSetlist._id);
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
                        } else {
                            deleteMySetlist(currentViewingSetlist._id);
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
                manualSongForm.addEventListener('submit', handleManualSongSubmit);
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
            const spacing = 60; // Consistent spacing on all devices
            const allIds = ['toggle-sidebar', 'toggle-songs', 'toggle-all-panels'];
            const idx = allIds.indexOf(id);

            if (saved) {
                let pos;
                try {
                    pos = JSON.parse(saved);
                } catch (e) {
                    // Failed to parse saved position - continue without restoring
                    return;
                }
                // Clamp to viewport
                let top = parseInt(pos.top) || minPadding;
                let left = parseInt(pos.left) || '';
                let right = parseInt(pos.right) || '';
                let bottom = parseInt(pos.bottom) || '';

                // Clamp left/top to avoid offscreen
                top = Math.max(minPadding, Math.min(top, window.innerHeight - btnSize - minPadding));
                if (left !== '') left = Math.max(minPadding, Math.min(left, window.innerWidth - btnSize - minPadding));
                el.style.top = top + 'px';
                el.style.left = left !== '' ? left + 'px' : '';
                el.style.right = right !== '' ? right + 'px' : '';
                el.style.bottom = bottom !== '' ? bottom + 'px' : '';
            } else {
                // Default: position vertically on right edge, centered
                const centerY = Math.floor(window.innerHeight / 2);
                // Calculate total height of all buttons with spacing
                const totalHeight = allIds.length * btnSize + (allIds.length - 1) * spacing;
                const startY = centerY - Math.floor(totalHeight / 2);
                
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
    
        // --- Mobile edge swipe gesture logic ---
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;

        document.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
            if (e.changedTouches.length !== 1) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            const dt = Date.now() - touchStartTime;

            // Only trigger if swipe starts near left edge (within 30px)
            if (touchStartX < 30 && Math.abs(dx) > 60 && dt < 500) {
                // Swipe right from left edge
                if (dy < -40) {
                    // Swipe up: open home page from top
                    document.getElementById('showAll').click();
                } else if (dy > 40) {
                    // Swipe down: open song list from bottom
                    document.getElementById('showSetlist').click();
                }
            }
        }, { passive: true });

        async function removeAdminRole(userId) {
            const modal = document.getElementById('confirmRemoveAdminModal');
            const message = document.getElementById('removeAdminMessage');
            
            message.textContent = 'Are you sure you want to remove admin role from this user?';
            modal.style.display = 'flex';

            document.getElementById('confirmRemoveAdmin').onclick = async () => {
                modal.style.display = 'none';
                
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
            };
            
            // Cancel remove admin button
            document.getElementById('cancelRemoveAdmin').onclick = () => {
                modal.style.display = 'none';
            };
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
    try {
        const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, method })
        });

        const data = await response.json();

        if (response.ok) {
            // Store reset data for OTP verification
            currentResetData = { identifier, method };
            
            // Show success and switch to OTP modal
            document.getElementById('forgotPasswordSuccess').textContent = data.message;
            document.getElementById('forgotPasswordSuccess').style.display = 'block';
            
            console.log('✅ Email sent successfully, showing OTP modal in 1.5 seconds');
            setTimeout(() => {
                console.log('🔄 Switching to OTP modal');
                hidePasswordResetModals();
                showOtpVerificationModal(data);
            }, 1500);
            
            return { success: true, data };
        } else {
            document.getElementById('forgotPasswordError').textContent = data.error;
            document.getElementById('forgotPasswordError').style.display = 'block';
            return { success: false, error: data.error };
        }
    } catch (error) {
        const errorMsg = 'Network error. Please check your connection.';
        document.getElementById('forgotPasswordError').textContent = errorMsg;
        document.getElementById('forgotPasswordError').style.display = 'block';
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
        const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
            method: 'POST',
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
            return { success: true };
        } else {
            document.getElementById('otpError').textContent = data.error;
            document.getElementById('otpError').style.display = 'block';
            return { success: false, error: data.error };
        }
    } catch (error) {
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
        forgotPasswordForm.addEventListener('submit', async (e) => {
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
            
            await initiatePasswordReset(identifier, method);
            
            // Re-enable submit button
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send OTP';
            }, 2000);
        });
    }

    // OTP verification form submission
    const otpVerificationForm = document.getElementById('otpVerificationForm');
    if (otpVerificationForm) {
        otpVerificationForm.addEventListener('submit', async (e) => {
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
        });
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

// ===============================
// FLOATING STOP BUTTON FUNCTIONS  
// ===============================

// Floating Stop Button Functions
function initializeFloatingStopButton() {
    const floatingStopBtn = document.getElementById('floatingStopBtn');
    if (floatingStopBtn) {
        floatingStopBtn.addEventListener('click', stopCurrentlyPlayingSong);
    }
}

function showFloatingStopButton(songId, songTitle) {
    const floatingStopBtn = document.getElementById('floatingStopBtn');
    const floatingStopText = document.getElementById('floatingStopText');
    
    if (floatingStopBtn) {
        currentlyPlayingSongs.add(songId);
        currentPlayingSongId = songId;
        
        // Update button text with song info (limit length for better display)
        const shortTitle = songTitle && songTitle.length > 12 ? songTitle.substring(0, 12) + '...' : (songTitle || 'Song');
        floatingStopText.textContent = shortTitle;
        
        floatingStopBtn.style.display = 'flex';
        floatingStopBtn.title = `Stop "${songTitle}" (currently playing)`;
    }
}

function hideFloatingStopButton(songId) {
    currentlyPlayingSongs.delete(songId);
    
    // If this was the main playing song and there are no other playing songs
    if (currentPlayingSongId === songId && currentlyPlayingSongs.size === 0) {
        const floatingStopBtn = document.getElementById('floatingStopBtn');
        if (floatingStopBtn) {
            floatingStopBtn.style.display = 'none';
        }
        currentPlayingSongId = null;
    }
    // If there are other playing songs, update to show another one
    else if (currentPlayingSongId === songId && currentlyPlayingSongs.size > 0) {
        const nextSongId = Array.from(currentlyPlayingSongs)[0];
        const nextSong = songs.find(s => s.id === nextSongId);
        currentPlayingSongId = nextSongId;
        
        if (nextSong) {
            const floatingStopText = document.getElementById('floatingStopText');
            const shortTitle = nextSong.title && nextSong.title.length > 12 ? nextSong.title.substring(0, 12) + '...' : (nextSong.title || 'Song');
            floatingStopText.textContent = shortTitle;
        }
    }
}

function stopCurrentlyPlayingSong() {
    if (currentPlayingSongId) {
        // Get the loop player instance and stop it directly
        const loopPlayer = window.getLoopPlayerInstance && window.getLoopPlayerInstance();
        if (loopPlayer) {
            if (loopPlayer.isPlaying) {
                loopPlayer.pause(); // This stops rhythmic loops and calls _stopAllMelodicPads()
            }
            // Also explicitly stop melodic pads to ensure UI updates
            loopPlayer.stopAllMelodicPads();
        } else {
            // Fallback: try to click the play button
            const loopContainer = document.querySelector(`#loopPlayerContainer-${currentPlayingSongId}`);
            if (loopContainer) {
                const playBtn = loopContainer.querySelector('.loop-play-btn');
                if (playBtn && playBtn.classList.contains('playing')) {
                    playBtn.click();
                }
            }
        }
        
        // Add animation to the floating button
        const floatingStopBtn = document.getElementById('floatingStopBtn');
        if (floatingStopBtn) {
            floatingStopBtn.classList.add('animate-stop');
            setTimeout(() => {
                floatingStopBtn.classList.remove('animate-stop');
            }, 600);
        }
                
        // Hide the button after stopping
        hideFloatingStopButton(currentPlayingSongId);
    }
}

// Make functions globally available for integration with loop player
window.showFloatingStopButton = showFloatingStopButton;
window.hideFloatingStopButton = hideFloatingStopButton;
window.initiatePasswordReset = initiatePasswordReset;
window.verifyOtpAndResetPassword = verifyOtpAndResetPassword;
window.resendOtp = resendOtp;