
// ====== GLOBAL CONSTANTS AND CONFIGURATION ======
const GENRE_OPTIONS = [
    'Praise', 'Worship', 'Christmas', 'Easter', 'Good Friday', 'Dance', 'Action',
    'Love', 'Forgiveness', 'Holy Spirit', 'Hymns', 'Qawalli', 'Miracle',
    'Thanksgiving', 'Hindi', 'Marathi', 'English', 'Desi'
];

const CATEGORY_OPTIONS = [
    { value: 'praise', label: 'Praise' },
    { value: 'worship', label: 'Worship' }
];

const KEY_OPTIONS = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
    'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
];

const TIME_OPTIONS = ['4/4', '3/4', '2/4', '6/8', '5/4', '7/8'];

const TAAL_OPTIONS = [
    'Keherwa', 'Keherwa Slow', 'Dadra', 'Dadra Slow', 'Rupak', 'EkTaal',
    'JhapTaal', 'TeenTaal', 'Deepchandi', 'Garba', 'Western', 'Waltz', 'Rock'
];

const KEY_FILTER_OPTIONS = [
    { value: '', label: 'All Keys' },
    { value: 'C', label: 'C Major' },
    { value: 'C#', label: 'C# Major' },
    { value: 'D', label: 'D Major' },
    { value: 'D#', label: 'D# Major' },
    { value: 'E', label: 'E Major' },
    { value: 'F', label: 'F Major' },
    { value: 'F#', label: 'F# Major' },
    { value: 'G', label: 'G Major' },
    { value: 'G#', label: 'G# Major' },
    { value: 'A', label: 'A Major' },
    { value: 'A#', label: 'A# Major' },
    { value: 'B', label: 'B Major' },
    { value: 'Cm', label: 'Cm' },
    { value: 'C#m', label: 'C#m' },
    { value: 'Dm', label: 'Dm' },
    { value: 'D#m', label: 'D#m' },
    { value: 'Em', label: 'Em' },
    { value: 'Fm', label: 'Fm' },
    { value: 'F#m', label: 'F#m' },
    { value: 'Gm', label: 'Gm' },
    { value: 'G#m', label: 'G#m' },
    { value: 'Am', label: 'Am' },
    { value: 'A#m', label: 'A#m' },
    { value: 'Bm', label: 'Bm' }
];

const GENRE_FILTER_OPTIONS = [
    { value: '', label: 'All Genres' },
    ...GENRE_OPTIONS.map(g => ({ value: g, label: g }))
];

const SORT_SONGS_OPTIONS = [
    { value: 'date-desc', label: 'Recently Added' },
    { value: 'date-asc', label: 'Oldest First' },
    { value: 'alpha-asc', label: 'A-Z' },
    { value: 'alpha-desc', label: 'Z-A' }
];

const CHORDS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_PATTERN = '[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|sus2|sus4|m7|maj7|7|m9|maj9|9|m11|maj11|11|add9|add11|6|13|2|4)?(?:sus2|sus4)?(?:7|9|11|13)?(?:\\/[A-G](?:#|b)?)?';
const CHORD_REGEX = new RegExp(`(${CHORD_PATTERN})`, 'gi');
const CHORD_LINE_REGEX = new RegExp(`^(\\s*${CHORD_PATTERN}\\s*)+$`, 'i');
const INLINE_CHORD_REGEX = new RegExp(`\\[(${CHORD_PATTERN})\\]`, 'gi');
const PAREN_CHORD_REGEX = new RegExp(`\\((${CHORD_PATTERN})\\)`, 'gi');

// Set API_BASE_URL based on environment (local vs production)
const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') 
    ? 'http://localhost:3001/api' 
    : 'https://praiseandworship.onrender.com/api';

// ====== GLOBAL VARIABLES ======
let jwtToken = localStorage.getItem('jwtToken') || null;
let currentUser = null;
let isDarkMode = (localStorage.getItem('darkMode') === null) ? true : localStorage.getItem('darkMode') === 'true';
let songs = [];
let favorites = [];
let praiseSetlist = [];
let worshipSetlist = [];
let keepScreenOn = false;
let autoScrollSpeed = localStorage.getItem('autoScrollSpeed') || 1500;
let suggestedSongsDrawerOpen = false;
let autoScrollInterval = null;
let isUserScrolling = false;
let navigationHistory = [];
let currentHistoryPosition = -1;
let isNavigatingHistory = false;
let isAnyModalOpen = false;
let currentModal = null;
let searchHistory = JSON.parse(localStorage.getItem('searchHistory')) || [];
let socket = null;

// DOM Elements (will be initialized in initDOMReferences)
let praiseTab, worshipTab, praiseContent, worshipContent, keyFilter, genreFilter;
let songPreviewEl, showSetlistEl, showAllEl, showDeleteEl, showFavoritesEl;
let setlistSection, praiseSetlistSongs, worshipSetlistSongs, praiseSetlistTab, worshipSetlistTab;
let deleteSection, deleteContent, favoritesSection, favoritesContent;
let addSongModal, openAddSongModal, newSongForm, editSongModal, editSongForm;
let deleteSongModal, deleteSongForm, cancelDeleteSong, confirmDeleteAllModal;
let cancelDeleteAll, confirmDeleteAll, searchInput, clearSearchBtn;
let toggleSidebarBtn, toggleSongsBtn, toggleAllPanelsBtn, toggleAutoScrollBtn;
let keepScreenOnBtn, sortSongs, notificationEl;

// ====== UTILITY FUNCTIONS ======
function showNotification(message, duration = 3000) {
    if (!notificationEl) return;
    
    notificationEl.textContent = message;
    notificationEl.classList.add('show');
    
    setTimeout(() => {
        notificationEl.classList.remove('show');
    }, duration);
}

function formatDate(dt) {
    if (!dt) return '';
    try {
        const d = new Date(dt);
        if (isNaN(d.getTime())) return dt;
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    } catch { 
        return dt; 
    }
}

function highlightText(text, query) {
    if (!query) return text;

    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return text.replace(regex, match => `<span class="highlight">${match}</span>`);
}

function cleanUpLyrics(lyrics) {
    return lyrics.replace(/\n{3,}/g, '\n\n');
}

function getUserKey(suffix) {
    if (!currentUser || !currentUser.email) return null;
    return `${currentUser.email}:${suffix}`;
}

function loadUserFavorites() {
    const key = getUserKey('favorites');
    if (!key) return [];
    return JSON.parse(localStorage.getItem(key)) || [];
}

function saveUserFavorites(favs) {
    const key = getUserKey('favorites');
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(favs));
}

function loadUserSetlist(type) {
    const key = getUserKey(type + 'Setlist');
    if (!key) return [];
    return JSON.parse(localStorage.getItem(key)) || [];
}

function saveUserSetlist(type, setlist) {
    const key = getUserKey(type + 'Setlist');
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(setlist));
}

function isDuplicateSong(title, lyrics, currentId = null) {
    return songs.some(song => {
        if (currentId) {
            // Compare both id and _id as strings for robustness
            if (String(song.id) === String(currentId) || String(song._id) === String(currentId)) return false;
        }
        // Block if title matches (case-insensitive), regardless of lyrics
        return song.title.toLowerCase() === title.toLowerCase();
    });
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

function showSearchHistory() {
    const dropdown = document.getElementById('searchHistoryDropdown');
    if (!dropdown) return;
    
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
            if (searchInput) {
                searchInput.value = query;
                dropdown.style.display = 'none';
                const event = new Event('input', { bubbles: true });
                searchInput.dispatchEvent(event);
            }
        });

        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

function optimizeMemoryUsage() {
    // Clean up large data structures when not needed
    if (songs.length > 500) {
        songs = songs.slice(0, 500);
        saveSongs();
    }
    
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
            if (window.performance && window.performance.memory) {
                console.log("Memory usage:", 
                    (window.performance.memory.usedJSHeapSize / 1048576).toFixed(2), "MB");
            }
        } catch(e) {}
    }
}

// ====== DOM POPULATION FUNCTIONS ======
function populateMultiselectDropdown(dropdownId, options) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    dropdown.innerHTML = '';
    options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'multiselect-option';
        div.setAttribute('data-value', opt);
        div.textContent = opt;
        dropdown.appendChild(div);
    });
}

function populateSelect(selectId, options, useLabel = false) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '';
    options.forEach(opt => {
        if (typeof opt === 'string') {
            select.innerHTML += `<option value="${opt}">${opt}</option>`;
        } else {
            select.innerHTML += `<option value="${opt.value}">${useLabel ? opt.label : opt.value}</option>`;
        }
    });
}

function updateSelectedGenres(containerId, dropdownId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
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

// ====== AUTHENTICATION FUNCTIONS ======
// Simulate session expiry for testing
function simulateSessionExpiry(seconds = 10) {
    showNotification(`Session will expire in ${seconds} seconds (testing mode)`, 3000);
    setTimeout(() => {
        localStorage.removeItem('jwtToken');
        jwtToken = null;
        updateAuthUI();
        showNotification('Session expired (simulated for testing).', 4000);
        const loginModal = document.getElementById('loginModal');
        if (loginModal && loginModal.style.display !== 'flex') {
            loginModal.style.display = 'flex';
        }
    }, seconds * 1000);
}
function updateAuthUI() {
    if (!document.getElementById('loginBtn') || !document.getElementById('registerBtn') || 
        !document.getElementById('logoutBtn') || !document.getElementById('sidebarAuthGreeting') ||
        !document.getElementById('adminPanelBtn')) {
        return;
    }
    
    const isAuthenticated = !!jwtToken;
    
    // Sidebar button style
    document.getElementById('loginBtn').style.display = isAuthenticated ? 'none' : 'block';
    document.getElementById('registerBtn').style.display = isAuthenticated ? 'none' : 'block';
    document.getElementById('logoutBtn').style.display = isAuthenticated ? 'block' : 'none';
    
    // Show greeting with name if available, else email
    let displayName = '';
    if (isAuthenticated && currentUser) {
        displayName = currentUser.name || currentUser.email || '';
    }
    document.getElementById('sidebarAuthGreeting').textContent = isAuthenticated ? `Hi, ${displayName}` : '';
    document.getElementById('adminPanelBtn').style.display = (isAuthenticated && currentUser && currentUser.isAdmin) ? 'block' : 'none';
}

async function authFetch(url, options = {}) {
    if (!jwtToken) throw new Error('Not authenticated');
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${jwtToken}`;
    return fetch(url, options);
}

async function fetchUserDataAfterLogin(token) {
    try {
        const res = await fetch(API_BASE_URL + '/userdata', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Failed to fetch user data');
        const data = await res.json();
        
        // Update frontend state
        if (Array.isArray(data.favorites)) {
            favorites = data.favorites;
            saveUserFavorites(favorites);
        }
        if (Array.isArray(data.praiseSetlist)) {
            praiseSetlist = data.praiseSetlist;
            saveUserSetlist('praise', praiseSetlist);
        }
        if (Array.isArray(data.worshipSetlist)) {
            worshipSetlist = data.worshipSetlist;
            saveUserSetlist('worship', worshipSetlist);
        }
    } catch (e) {
        console.warn('Could not fetch user favorites/setlists after login:', e);
    }
}

function setupAuthModals() {
    // Login modal
    const closeLoginModal = document.getElementById('closeLoginModal');
    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    
    if (closeLoginModal && loginModal) {
        closeLoginModal.onclick = () => {
            loginModal.style.display = 'none';
        };
    }
    
    // Register modal
    const closeRegisterModal = document.getElementById('closeRegisterModal');
    const registerModal = document.getElementById('registerModal');
    const registerForm = document.getElementById('registerForm');
    
    if (closeRegisterModal && registerModal) {
        closeRegisterModal.onclick = () => {
            registerModal.style.display = 'none';
        };
    }
    
    // Login form submission
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            try {
                const res = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if (res.ok) {
                    jwtToken = data.token;
                    // Decode token to get user info
                    const payload = JSON.parse(atob(jwtToken.split('.')[1]));
                    let name = payload.name;
                    
                    if (!name) {
                        // Try to preserve name from localStorage if available
                        const prev = JSON.parse(localStorage.getItem('currentUser') || 'null');
                        if (prev && prev.email === payload.email && prev.name) {
                            name = prev.name;
                        } else if (document.getElementById('loginEmail')) {
                            // Fallback to email prefix
                            name = payload.email.split('@')[0];
                        }
                    }
                    
                    currentUser = { 
                        email: payload.email, 
                        isAdmin: payload.isAdmin, 
                        id: payload.id, 
                        name, 
                        token: jwtToken 
                    };
                    window.currentUser = currentUser;
                    
                    localStorage.setItem('jwtToken', jwtToken);
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    
                    updateAuthUI();
                    
                    // Show welcome notification on login
                    showNotification(`Welcome, ${name || payload.email}!`, 3000);
                    
                    // FULL RELOAD: fetch all songs, then user data, then render everything
                    await loadSongsFromBackend();
                    
                    try {
                        const res2 = await fetch(`${API_BASE_URL}/userdata`, {
                            headers: { 'Authorization': `Bearer ${jwtToken}` }
                        });
                        
                        if (res2.ok) {
                            const data = await res2.json();
                            if (typeof data.favorites !== 'undefined') {
                                favorites = data.favorites;
                            }
                            if (typeof data.praiseSetlist !== 'undefined') {
                                praiseSetlist = (data.praiseSetlist || []).map(id => songs.find(s => s.id == id || s._id == id)).filter(Boolean);
                            }
                            if (typeof data.worshipSetlist !== 'undefined') {
                                worshipSetlist = (data.worshipSetlist || []).map(id => songs.find(s => s.id == id || s._id == id)).filter(Boolean);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to load user data from backend after login:', err);
                    }
                    
                    renderFavorites();
                    renderSetlist('praise');
                    renderSetlist('worship');
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                    renderSongs('worship', keyFilter.value, genreFilter.value);
                    
                    if (showSetlistEl) {
                        showSetlistEl.click();
                    }
                    
                    if (loginModal) {
                        loginModal.style.display = 'none';
                    }
                } else {
                    alert(data.error || 'Login failed');
                }
            } catch (err) {
                alert('Login error');
            }
        };
    }
    
    // Register form submission
    if (registerForm) {
        registerForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const name = document.getElementById('registerName').value;
            
            try {
                const res = await fetch(`${API_BASE_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name })
                });
                const data = await res.json();
                
                if (res.ok) {
                    jwtToken = data.token;
                    const payload = JSON.parse(atob(jwtToken.split('.')[1]));
                    let name = payload.name;
                    
                    if (!name) {
                        if (document.getElementById('registerName')) {
                            name = document.getElementById('registerName').value;
                        } else {
                            name = payload.email.split('@')[0];
                        }
                    }
                    
                    currentUser = { 
                        email: payload.email, 
                        isAdmin: payload.isAdmin, 
                        id: payload.id, 
                        name, 
                        token: jwtToken 
                    };
                    window.currentUser = currentUser;
                    
                    localStorage.setItem('jwtToken', jwtToken);
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    
                    updateAuthUI();
                    
                    // FULL RELOAD: fetch all songs, then user data, then render everything
                    await loadSongsFromBackend();
                    
                    try {
                        const res2 = await fetch(`${API_BASE_URL}/userdata`, {
                            headers: { 'Authorization': `Bearer ${jwtToken}` }
                        });
                        
                        if (res2.ok) {
                            const data = await res2.json();
                            if (typeof data.favorites !== 'undefined') {
                                favorites = data.favorites;
                            }
                            if (typeof data.praiseSetlist !== 'undefined') {
                                praiseSetlist = (data.praiseSetlist || []).map(id => songs.find(s => s.id == id || s._id == id)).filter(Boolean);
                            }
                            if (typeof data.worshipSetlist !== 'undefined') {
                                worshipSetlist = (data.worshipSetlist || []).map(id => songs.find(s => s.id == id || s._id == id)).filter(Boolean);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to load user data from backend after register:', err);
                    }
                    
                    renderFavorites();
                    renderSetlist('praise');
                    renderSetlist('worship');
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                    renderSongs('worship', keyFilter.value, genreFilter.value);
                    
                    if (showSetlistEl) {
                        showSetlistEl.click();
                    }
                    
                    if (registerModal) {
                        registerModal.style.display = 'none';
                    }
                } else {
                    alert(data.error || 'Registration failed');
                }
            } catch (err) {
                alert('Registration error');
            }
        };
    }
}

// ====== SONG MANAGEMENT FUNCTIONS ======
async function loadSongsFromBackend() {
    // Show loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    
    // Try to load from localStorage cache first
    let cacheUsed = false;
    
    try {
        const cached = localStorage.getItem('songsCache');
        if (cached) {
            songs = JSON.parse(cached);
            cacheUsed = true;
            
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
            
            updateSongCount();
        }
    } catch (e) { 
        /* ignore cache errors */ 
    }
    
    // Always fetch latest in background
    try {
        const response = await fetch(`${API_BASE_URL}/songs`);
        if (!response.ok) throw new Error('Failed to fetch songs');
        
        const data = await response.json();
        // Map _id to id for frontend compatibility
        const freshSongs = data.map(song => ({ ...song, id: song._id || song.id }));
        songs = freshSongs;
        
        localStorage.setItem('songsCache', JSON.stringify(freshSongs));
        
        if (!cacheUsed) {
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
            
            updateSongCount();
        }
    } catch (err) {
        if (!cacheUsed) {
            showNotification('Error loading songs from server', 4000);
        }
        console.error(err);
    } finally {
        // Hide loading overlay
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

function updateSongCount() {
    // Local count
    const totalSongsEl = document.getElementById('totalSongs');
    const praiseCountEl = document.getElementById('praiseCount');
    const worshipCountEl = document.getElementById('worshipCount');
    
    if (totalSongsEl) totalSongsEl.textContent = songs.length;
    if (praiseCountEl) praiseCountEl.textContent = songs.filter(s => s.category === 'praise').length;
    if (worshipCountEl) worshipCountEl.textContent = songs.filter(s => s.category === 'worship').length;

    // Server count
    fetch(`${API_BASE_URL}/songs/count`)
        .then(res => res.json())
        .then(data => {
            if (data && typeof data.count === 'number' && totalSongsEl) {
                totalSongsEl.setAttribute('title', `Server count: ${data.count}`);
            }
        })
        .catch(() => {
            if (totalSongsEl) totalSongsEl.removeAttribute('title');
        });
}

function saveSongs(toFile = false) {
    if (toFile) {
        try {
            const data = {
                songs: songs,
                praiseSetlist: praiseSetlist,
                worshipSetlist: worshipSetlist
            };
            console.warn('File saving requires server-side support');
        } catch (err) {
            console.error('Error saving to file:', err);
        }
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'update',
                songs: songs,
                praiseSetlist: praiseSetlist,
                worshipSetlist: worshipSetlist
            }));
        }
    }

    localStorage.setItem('songs', JSON.stringify(songs));
    const embedded = document.getElementById('embeddedSongs');
    if (embedded) {
        embedded.textContent = JSON.stringify(songs, null, 2);
    }
}

function saveSetlists() {
    saveUserSetlist('praise', praiseSetlist);
    saveUserSetlist('worship', worshipSetlist);
}

function saveFavorites() {
    saveUserFavorites(favorites);
}

async function saveUserSetlist(type, setlist) {
    let user = currentUser;
    try {
        const userStr = localStorage.getItem('currentUser');
        if (userStr) user = JSON.parse(userStr);
    } catch (e) {
        user = currentUser;
    }

    if (typeof user === 'undefined' || !user || !user.token) {
        console.warn('[Setlist] currentUser or token missing', user);
        return;
    }
    
    const debugAuthHeader = `Bearer ${user.token}`;
    
    try {
        // Filter out null/undefined songs before mapping ids
        const filteredSetlist = setlist.filter(song => song && (song.id != null || song._id != null));
        
        const res = await fetch(`${API_BASE_URL}/user/setlist`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': debugAuthHeader
            },
            body: JSON.stringify({
                type, // 'praise' or 'worship'
                setlist: filteredSetlist.map(song => song.id || song._id)
            })
        });
        
        if (!res.ok) {
            if (res.status === 401) {
                showNotification('Session expired. Please log in again.', 4000);
                // Only kick out to sign in if not already open
                setTimeout(() => {
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal && loginModal.style.display !== 'flex') {
                        loginModal.style.display = 'flex';
                    }
                }, 500);
                return;
            }
            const errData = await res.json();
            console.error('Failed to save setlist, server responded with:', res.status, errData);
            showNotification(`Error saving setlist: ${errData.error || 'Unauthorized'}`, 4000);
        }
    } catch (err) {
        console.error('Failed to save setlist:', err);
        showNotification('Error saving setlist to backend', 4000);
    }
}

async function saveUserFavorites(favorites) {
    // Always get latest user from localStorage in case it changed
    let user = currentUser;
    try {
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            user = JSON.parse(userStr);
        }
    } catch (e) {
        user = currentUser;
    }
    
    if (typeof user === 'undefined' || !user || !user.token) {
        console.warn('[Favorites] currentUser or token missing', user);
        return;
    }
    
    const debugAuthHeader = `Bearer ${user.token}`;
    
    try {
        const res = await fetch(`${API_BASE_URL}/user/favorites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': debugAuthHeader
            },
            body: JSON.stringify({ favorites })
        });
        
        if (!res.ok) {
            if (res.status === 401) {
                showNotification('Session expired. Please log in again.', 4000);
                setTimeout(() => {
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal && loginModal.style.display !== 'flex') {
                        loginModal.style.display = 'flex';
                    }
                }, 500);
                return;
            }
            const errData = await res.json();
            console.error('Failed to save favorites, server responded with:', res.status, errData);
            showNotification(`Error saving favorites: ${errData.error || 'Unauthorized'}`, 4000);
        }
    } catch (err) {
        console.error('Failed to save favorites:', err);
    }
}

function downloadSongs() {
    const data = {
        songs: songs,
        praiseSetlist: praiseSetlist,
        worshipSetlist: worshipSetlist,
        favorites: favorites
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worship-songs.json';
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
                
                // Only overwrite setlists and favorites if they exist in the uploaded file
                if (typeof data.praiseSetlist !== 'undefined') {
                    praiseSetlist = data.praiseSetlist;
                }
                if (typeof data.worshipSetlist !== 'undefined') {
                    worshipSetlist = data.worshipSetlist;
                }
                if (typeof data.favorites !== 'undefined') {
                    favorites = data.favorites;
                }
                
                saveSongs();
                saveSetlists();
                saveFavorites();
                
                if (praiseTab.classList.contains('active')) {
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('worship', keyFilter.value, genreFilter.value);
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
                
                if (praiseTab.classList.contains('active')) {
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('worship', keyFilter.value, genreFilter.value);
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

// ====== RENDERING FUNCTIONS ======
function renderSongs(categoryOrSongs, filterOrContainer, genreFilterValue) {
    let songsToRender;
    let container;
    
    if (typeof categoryOrSongs === 'string') {
        const category = categoryOrSongs;
        const keyFilterValue = filterOrContainer;
        
        songsToRender = songs
            .filter(song => song.category === category)
            .filter(song => keyFilterValue === "" || song.key === keyFilterValue)
            .filter(song => {
                if (!genreFilterValue) return true;
                if (!song.genres) return false;
                return song.genres.includes(genreFilterValue);
            });
            
        // Sort logic
        let sortValue = sortSongs ? sortSongs.value : 'date-desc';
        songsToRender = songsToRender.slice();
        
        if (sortValue === 'date-desc') {
            songsToRender.sort((a, b) => {
                // Use modifiedAt if present, else fallback to createdAt
                let da = a.modifiedAt ? new Date(a.modifiedAt) : (a.createdAt ? new Date(a.createdAt) : 0);
                let db = b.modifiedAt ? new Date(b.modifiedAt) : (b.createdAt ? new Date(b.createdAt) : 0);
                return db - da;
            });
        } else if (sortValue === 'date-asc') {
            songsToRender.sort((a, b) => {
                let da = a.createdAt ? new Date(a.createdAt) : 0;
                let db = b.createdAt ? new Date(b.createdAt) : 0;
                return da - db;
            });
        } else if (sortValue === 'alpha-asc') {
            songsToRender.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, {sensitivity:'base'}));
        } else if (sortValue === 'alpha-desc') {
            songsToRender.sort((a, b) => (b.title || '').localeCompare(a.title || '', undefined, {sensitivity:'base'}));
        }
        
        container = category === 'praise' ? praiseContent : worshipContent;
    } else {
        songsToRender = categoryOrSongs;
        container = filterOrContainer;
    }
    
    if (!container) return;
    
    // Use DocumentFragment for batch DOM update
    container.innerHTML = '';
    
    if (songsToRender.length === 0) {
        container.innerHTML = '<p>No songs found.</p>';
        return;
    }
    
    const frag = document.createDocumentFragment();
    
    songsToRender.forEach(song => {
        const div = document.createElement('div');
        div.className = 'song-item';
        div.dataset.songId = song.id;
        
        // Defensive: ensure setlists and favorites are arrays
        const praiseSet = Array.isArray(praiseSetlist) ? praiseSetlist : [];
        const worshipSet = Array.isArray(worshipSetlist) ? worshipSetlist : [];
        const favs = Array.isArray(favorites) ? favorites : [];
        
        const isInSetlist = song.category === 'praise' 
            ? praiseSet.some(s => s && s.id === song.id)
            : worshipSet.some(s => s && s.id === song.id);
            
        const isFavorite = favs.includes(song.id);
        const displayGenres = song.genres ? song.genres.join(', ') : '';
        
        // Only show delete button if user is admin
        const showDelete = currentUser && currentUser.isAdmin;
        
        div.innerHTML = `
            <div class="song-header">
                <span class="song-title">${song.title}</span>
                <button class="favorite-btn ${isFavorite ? 'favorited' : ''}" data-song-id="${song.id}">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
            <div class="song-meta">${song.key} | ${song.tempo} | ${song.time} | ${displayGenres}</div>
            <div class="song-actions">
                <button class="btn ${isInSetlist ? 'btn-delete' : 'btn-primary'} toggle-setlist">
                    ${isInSetlist ? 'Remove' : 'Add'}
                </button>
                <button class="btn btn-edit edit-song">Edit</button>
                ${showDelete ? `<button class="btn btn-delete delete-song"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
        `;
        
        div.querySelector('.favorite-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(song.id);
        });
        
        div.querySelector('.toggle-setlist').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSongInSetlist(song);
        });
        
        div.querySelector('.edit-song').addEventListener('click', (e) => {
            e.stopPropagation();
            editSong(song.id);
        });
        
        // Delete button event (admin only)
        if (div.querySelector('.delete-song')) {
            div.querySelector('.delete-song').addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteSongModal(song.id);
            });
        }
        
        div.addEventListener('click', () => {
            // Only update preview if not already showing
            if (songPreviewEl.dataset.songId != song.id) {
                showPreview(song);
            }
            
            if (window.innerWidth <= 768) {
                document.querySelector('.songs-section').classList.add('hidden');
                document.querySelector('.sidebar').classList.add('hidden');
                document.querySelector('.preview-section').classList.add('full-width');
            }
        });
        
        frag.appendChild(div);
    });
    
    container.appendChild(frag);
}

function renderFavorites() {
    if (!favoritesContent) return;
    
    favoritesContent.innerHTML = '';

    if (favorites.length === 0) {
        favoritesContent.innerHTML = '<p>No favorite songs yet.</p>';
        return;
    }

    const favoriteSongs = songs.filter(song => favorites.includes(song.id));
    renderSongs(favoriteSongs, favoritesContent);
}

function renderDeleteSongs() {
    if (!deleteContent) return;
    
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
                <div class="song-meta">${song.key} | ${song.tempo} | ${song.time} | ${song.category}</div>
                <div class="song-actions">
                    <button class="btn btn-delete delete-song">Delete</button>
                </div>
            `;
            
            div.querySelector('.delete-song').addEventListener('click', (e) => {
                e.stopPropagation();
                openDeleteSongModal(song.id);
            });
            
            div.addEventListener('click', () => {
                showPreview(song);
            });
            
            deleteContent.appendChild(div);
        });
}

function renderSetlist(category) {
    const container = category === 'praise' ? praiseSetlistSongs : worshipSetlistSongs;
    if (!container) return;
    
    let setlist = category === 'praise' ? praiseSetlist : worshipSetlist;
    
    setlist = setlist.filter(song => song && typeof song === 'object' && (song.id != null || song._id));
    container.innerHTML = '';

    if (setlist.length === 0) {
        container.innerHTML = '<p>Your ' + category + ' setlist is empty.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'setlist-sortable';
    ul.style.listStyle = 'none';
    ul.style.padding = '0';

    setlist.forEach((song, index) => {
        const li = document.createElement('li');
        li.className = 'setlist-item';
        li.dataset.songId = song.id || song._id;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'setlist-item-header';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'setlist-item-info';
        infoDiv.innerHTML = `
            <span class="setlist-item-index">${index + 1}.</span>
            <span class="setlist-item-title">${song.title || ''}</span>
        `;

        headerDiv.appendChild(infoDiv);

        const metaDiv = document.createElement('div');
        metaDiv.className = 'setlist-item-meta';
        
        const metaInfoDiv = document.createElement('div');
        metaInfoDiv.className = 'setlist-item-meta-info';
        metaInfoDiv.innerHTML = `
            <span><strong>Key:</strong> ${song.key || 'N/A'}</span>
            <span><strong>Tempo:</strong> ${song.tempo || 'N/A'}</span>
            <span><strong>Time:</strong> ${song.time || 'N/A'}</span>
        `;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'setlist-item-actions';
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn setlist-remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remove from setlist';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFromSetlist(song.id, category);
        };
        actionsDiv.appendChild(removeBtn);

        metaDiv.appendChild(metaInfoDiv);
        metaDiv.appendChild(actionsDiv);

        li.appendChild(headerDiv);
        li.appendChild(metaDiv);

        li.addEventListener('click', () => {
            showPreview(song);
        });

        ul.appendChild(li);
    });

    container.appendChild(ul);
}

// ====== SETLIST AND FAVORITES FUNCTIONS ======
function addToSetlist(id) {
    if (!currentUser || !currentUser.email) {
        showNotification('Please log in to use setlists');
        return;
    }
    
    const song = songs.find(s => s.id === id);
    if (!song) return;
    
    let setlist;
    if (song.category === 'praise') {
        setlist = praiseSetlist;
    } else {
        setlist = worshipSetlist;
    }
    
    if (!setlist.some(s => s && s.id === id)) {
        setlist.push(song);
        saveSetlists();
        showNotification(`"${song.title}" added to ${song.category} setlist`);
        updateSetlistButton(id, true);
        
        if (songPreviewEl.dataset.songId == id) {
            updatePreviewSetlistButton(true);
        }
        
        if (setlistSection && setlistSection.style.display === 'block') {
            renderSetlist(song.category);
        }
    }
}

function removeFromSetlist(id, category) {
    if (!currentUser || !currentUser.email) {
        showNotification('Please log in to use setlists');
        return;
    }
    
    const song = songs.find(s => s.id === id || s._id === id);
    if (!song) return;
    
    let setlist;
    if (category === 'praise') {
        setlist = praiseSetlist;
    } else {
        setlist = worshipSetlist;
    }
    
    const idx = setlist.findIndex(s => s && (s.id === id || s._id === id));
    if (idx !== -1) {
        setlist.splice(idx, 1);
        saveSetlists();
        showNotification(`"${song.title}" removed from ${category} setlist`);
        updateSetlistButton(id, false);
        
        if (songPreviewEl.dataset.songId == id) {
            updatePreviewSetlistButton(false);
        }
        
        if (setlistSection && setlistSection.style.display === 'block') {
            renderSetlist(category);
        }
    }
}

function toggleSongInSetlist(song) {
    // Defensive: ensure setlists are arrays
    const praiseSet = Array.isArray(praiseSetlist) ? praiseSetlist : [];
    const worshipSet = Array.isArray(worshipSetlist) ? worshipSetlist : [];
    
    const isInSetlist = song.category === 'praise'
        ? praiseSet.some(s => s && s.id === song.id)
        : worshipSet.some(s => s && s.id === song.id);
        
    if (isInSetlist) {
        removeFromSetlist(song.id, song.category);
        updateSetlistButton(song.id, false);
        updatePreviewSetlistButton(false);
    } else {
        addToSetlist(song.id);
        updateSetlistButton(song.id, true);
        updatePreviewSetlistButton(true);
    }
}

function updateSetlistButton(songId, isInSetlist) {
    // Update all setlist buttons for this song
    document.querySelectorAll(`.toggle-setlist[data-song-id="${songId}"]`).forEach(btn => {
        btn.textContent = isInSetlist ? 'Remove' : 'Add';
        btn.classList.toggle('btn-primary', !isInSetlist);
        btn.classList.toggle('btn-delete', isInSetlist);
    });
    
    // Also update preview setlist button if present
    const previewBtn = document.getElementById('previewSetlistBtn');
    if (previewBtn) {
        previewBtn.textContent = isInSetlist ? 'Remove' : 'Add';
        previewBtn.classList.toggle('btn-primary', !isInSetlist);
        previewBtn.classList.toggle('btn-delete', isInSetlist);
    }
    
    // Re-render setlists and preview if needed
    if (typeof renderSetlist === 'function') {
        renderSetlist('praise');
        renderSetlist('worship');
    }
    
    if (songPreviewEl && songPreviewEl.dataset.songId == songId && typeof showPreview === 'function') {
        const song = songs.find(s => s.id == songId);
        if (song) showPreview(song);
    }
}

function updatePreviewSetlistButton(isInSetlist) {
    const previewBtn = document.getElementById('previewSetlistBtn');
    if (previewBtn) {
        previewBtn.textContent = isInSetlist ? 'Remove from Setlist' : 'Add to Setlist';
        previewBtn.classList.toggle('btn-primary', !isInSetlist);
        previewBtn.classList.toggle('btn-delete', isInSetlist);
    }
}

function toggleFavorite(id) {
    if (!currentUser || !currentUser.email) {
        showNotification('Please log in to use favorites');
        return;
    }
    
    const index = favorites.indexOf(id);
    const song = songs.find(s => s.id === id);
    
    if (index === -1) {
        favorites.push(id);
        showNotification(`"${song.title}" added to favorites`);
    } else {
        favorites.splice(index, 1);
        showNotification(`"${song.title}" removed from favorites`);
    }
    
    saveFavorites();
    
    // Update all favorite buttons everywhere
    document.querySelectorAll(`.favorite-btn[data-song-id="${id}"]`).forEach(btn => {
        btn.classList.toggle('favorited', index === -1);
    });
    
    // Also update preview favorite button if present
    const previewBtn = document.getElementById('previewFavoriteBtn');
    if (previewBtn) {
        previewBtn.classList.toggle('favorited', index === -1);
    }
    
    // Re-render favorites and preview if needed
    if (typeof renderFavorites === 'function') renderFavorites();
    
    if (songPreviewEl && songPreviewEl.dataset.songId == id && typeof showPreview === 'function') {
        const song = songs.find(s => s.id == id);
        if (song) showPreview(song);
    }
}

// ====== PREVIEW FUNCTIONS ======
function isChordLine(line) {
    return CHORD_LINE_REGEX.test(line.trim());
}

function hasInlineChords(line) {
    return INLINE_CHORD_REGEX.test(line) || PAREN_CHORD_REGEX.test(line);
}

function transposeChord(chord, steps) {
    if (steps === 0 || !chord) return chord;

    if (chord.includes('/')) {
        const [baseChord, bassNote] = chord.split('/');
        const transposedBase = transposeSingleChord(baseChord.trim(), steps);
        const transposedBass = bassNote ? transposeSingleChord(bassNote.trim(), steps) : '';
        return transposedBase + (transposedBass ? '/' + transposedBass : '');
    }
    
    return transposeSingleChord(chord.trim(), steps);
}

function transposeSingleChord(chord, steps) {
    if (steps === 0 || !chord) return chord;

    const match = chord.match(/^([A-G][#b]?)(.*)$/i);
    if (!match) return chord;

    const baseNote = match[1];
    const quality = match[2] || '';

    // Chromatic scale with both sharps and flats
    const chromaticScale = [
        'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
        'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
    ];
    
    // Find current position
    let currentIndex = chromaticScale.indexOf(baseNote);
    if (currentIndex === -1) return chord;

    // Calculate new position (steps is already ±1)
    const newIndex = (currentIndex + steps + 12) % 12;
    let newBaseNote = chromaticScale[newIndex];

    // Maintain notation style (sharp vs flat)
    const preferFlats = ['F', 'Bb', 'Eb', 'Ab', 'Db'];
    if (preferFlats.includes(newBaseNote)) {
        const sharpToFlat = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
        newBaseNote = sharpToFlat[newBaseNote] || newBaseNote;
    }

    // Maintain case
    if (baseNote === baseNote.toLowerCase()) {
        newBaseNote = newBaseNote.toLowerCase();
    }

    return newBaseNote + quality;
}

function formatLyricsWithChords(lyrics, transposeLevel) {
    const lines = lyrics.split('\n');
    let output = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.trim() === '') {
            output.push(`<div class="lyric-line">${line}</div>`);
            continue;
        }

        // If the line is a chord line (e.g., [D][A][G]...)
        if (isChordLine(line)) {
            // Transpose and wrap chords in spans
            let processedLine = line.replace(CHORD_REGEX,
                (match) => {
                    return `<span class="chord" data-original="${match}">${transposeChord(match, transposeLevel)}</span>`;
                }
            );
            output.push(`<div class="chord-line">${processedLine}</div>`);
        }
        // If the line has inline chords (e.g., lyrics with [D] in between words)
        else if (hasInlineChords(line)) {
            // Transpose and wrap inline chords in spans, for both [ ] and ( )
            let processedLine = line
                .replace(INLINE_CHORD_REGEX, (match, chord) => {
                    return `[<span class="chord" data-original="${chord}">${transposeChord(chord, transposeLevel)}</span>]`;
                })
                .replace(PAREN_CHORD_REGEX, (match, chord) => {
                    return `(<span class="chord" data-original="${chord}">${transposeChord(chord, transposeLevel)}</span>)`;
                });
            output.push(`<div class="lyric-line">${processedLine}</div>`);
        }
        else {
            output.push(`<div class="lyric-line">${line}</div>`);
        }
    }

    return output.join('');
}

function updatePreviewWithTransposition(level) {
    if (!songPreviewEl.dataset.songId) return;

    // Clamp the transposition level between -12 and 12
    level = Math.max(-12, Math.min(12, level));

    // Update the transposition level display
    const transposeLevelEl = document.getElementById('transpose-level');
    if (transposeLevelEl) transposeLevelEl.textContent = level;

    // Retrieve the original lyrics and key from the dataset
    const lyrics = songPreviewEl.dataset.originalLyrics;
    const originalKey = songPreviewEl.dataset.originalKey;

    // Update the displayed key based on the transposition level
    const transposedKey = level === 0 ? originalKey : transposeChord(originalKey, level);
    const currentKeyEl = document.getElementById('current-key');
    if (currentKeyEl) currentKeyEl.textContent = transposedKey;

    // Update the lyrics with transposed chords
    const lyricsContainer = document.querySelector('.song-lyrics');
    if (lyricsContainer) {
        lyricsContainer.innerHTML = formatLyricsWithChords(lyrics, level);
    }
}

function attachPreviewEventListeners(song) {
    // Favorite button
    const favBtn = document.getElementById('previewFavoriteBtn');
    if (favBtn) {
        favBtn.onclick = () => {
            toggleFavorite(song.id);
        };
    }

    // Edit button
    const editBtn = document.getElementById('previewEditBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            editSong(song.id);
        });
    }

    // Transpose controls
    const transposeUpBtn = document.getElementById('transpose-up');
    const transposeDownBtn = document.getElementById('transpose-down');
    const transposeResetBtn = document.getElementById('transposeReset');
    
    if (transposeUpBtn) {
        transposeUpBtn.addEventListener('click', (e) => {
            const currentLevel = parseInt(document.getElementById('transpose-level').textContent) || 0;
            updatePreviewWithTransposition(currentLevel + 1);
            e.stopPropagation();
        });
    }
    
    if (transposeDownBtn) {
        transposeDownBtn.addEventListener('click', () => {
            const currentLevel = parseInt(document.getElementById('transpose-level').textContent) || 0;
            updatePreviewWithTransposition(currentLevel - 1);
        });
    }
    
    if (transposeResetBtn) {
        transposeResetBtn.addEventListener('click', () => {
            updatePreviewWithTransposition(0);
        });
    }

    // Setup auto-scroll if needed
    setupAutoScroll();
}

function showPreview(song, fromHistory = false) {
    if (!songPreviewEl) return;
    
    // Only update if song is different
    if (songPreviewEl.dataset.songId == song.id && songPreviewEl.innerHTML) return;
    
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
    songPreviewEl.dataset.originalLyrics = song.lyrics;
    songPreviewEl.dataset.originalKey = song.key;
    
    // Check if song is in setlist/favorites
    const praiseSet = Array.isArray(praiseSetlist) ? praiseSetlist : [];
    const worshipSet = Array.isArray(worshipSetlist) ? worshipSetlist : [];
    const favs = Array.isArray(favorites) ? favorites : [];
    
    const isInSetlist = song.category === 'praise' 
        ? praiseSet.some(s => s && s.id === song.id)
        : worshipSet.some(s => s && s.id === song.id);
        
    const isFavorite = favs.includes(song.id);
    
    // Build the preview HTML (batch update)
    let previewHTML = `
        <div class="song-preview-container">
            <div class="song-slide">
                <div class="preview-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <h2>${song.title}</h2>
                    </div>
                    <div class="preview-actions">
                        ${isFavorite ? `
                            <button class="favorite-btn favorited" id="previewFavoriteBtn" data-song-id="${song.id}">
                                <i class="fas fa-heart"></i>
                            </button>
                        ` : `
                            <button class="favorite-btn" id="previewFavoriteBtn" data-song-id="${song.id}">
                                <i class="fas fa-heart"></i>
                            </button>
                        `}
                        <button class="btn ${isInSetlist ? 'btn-delete' : 'btn-primary'}" id="previewSetlistBtn">
                            ${isInSetlist ? 'Remove from Setlist' : 'Add to Setlist'}
                        </button>
                        <button class="btn btn-edit" id="previewEditBtn">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        ${(currentUser && currentUser.isAdmin) ? `<button class="btn btn-delete" id="previewDeleteBtn"><i class="fas fa-trash"></i> Delete</button>` : ''}
                    </div>
                    <div class="preview-meta" style="font-size:0.85em; color:var(--song-meta-color); margin-top:6px; margin-bottom:2px;">
                        ${song.contributor ? `<span><i class='fas fa-user'></i> ${song.contributor.split(' ')[0]}</span> &nbsp;` : ''}
                        ${song.modifiedAt && song.modifiedAt !== song.createdAt
                            ? `<span><i class='fas fa-edit'></i> Updated: ${new Date(song.modifiedAt).toLocaleString()}</span>`
                            : (song.createdAt ? `<span><i class='fas fa-calendar-plus'></i> Created: ${new Date(song.createdAt).toLocaleString()}</span>` : '')}
                    </div>
                </div>
                <div class="song-meta">
                    <p><strong>Key:</strong> <span id="current-key">${song.key}</span></p>
                    ${song.tempo ? `<p><strong>Tempo:</strong> ${song.tempo}</p>` : ''}
                    ${song.time ? `<p><strong>Time Signature:</strong> ${song.time}</p>` : ''}
                    ${song.taal ? `<p><strong>Taal:</strong> ${song.taal}</p>` : ''}
                    ${song.genres ? `<p><strong>Genres:</strong> ${song.genres.join(', ')}</p>` : ''}
                </div>
                <div class="transpose-controls">
                    <button class="btn btn-primary" id="transpose-down">-</button>
                    <span>Transpose: <span id="transpose-level">0</span></span>
                    <button class="btn btn-primary" id="transpose-up">+</button>
                    <button id="transposeReset" class="btn btn-primary">Reset</button>
                </div>
                <div class="song-lyrics">${formatLyricsWithChords(song.lyrics, 0)}</div>
                <div class="swipe-indicator prev">←</div>
                <div class="swipe-indicator next">→</div>
            </div>
        </div>
    `;
    
    songPreviewEl.innerHTML = previewHTML;
    
    // Attach all event listeners
    attachPreviewEventListeners(song);
    
    // Reset navigation flag if this was a history navigation
    if (isNavigatingHistory) {
        setTimeout(() => { isNavigatingHistory = false; }, 100);
    }
    
    // Setlist button event
    const setlistBtn = document.getElementById('previewSetlistBtn');
    if (setlistBtn) {
        setlistBtn.addEventListener('click', (e) => {
            toggleSongInSetlist(song);
        });
    }
    
    // Delete button event (admin only)
    const deleteBtn = document.getElementById('previewDeleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteSongModal(song.id);
        });
    }
    
    setupAutoScroll();
    applyLyricsBackground(song.category === 'praise');
    
    // Defer heavy suggestions update
    setTimeout(() => { showSuggestedSongs(); }, 0);
}

function previewSongNoActions(song) {
    if (!songPreviewEl || !song) return;
    
    let meta = '';
    if (song.key || song.tempo || song.time || song.taal || song.genres) {
        meta += '<div class="song-meta">';
        if (song.key) meta += `<span><b>Key:</b> ${song.key}</span> `;
        if (song.tempo) meta += `<span><b>Tempo:</b> ${song.tempo}</span> `;
        if (song.time) meta += `<span><b>Time:</b> ${song.time}</span> `;
        if (song.taal) meta += `<span><b>Taal:</b> ${song.taal}</span> `;
        if (song.genres && Array.isArray(song.genres)) meta += `<span><b>Genre:</b> ${song.genres.join(', ')}</span> `;
        meta += '</div>';
    }
    
    let meta2 = '';
    if (song.contributor || song.createdAt || song.modifiedAt || song.date) {
        meta2 += '<div class="song-meta" style="font-size:0.9em;color:#888;margin-top:2px;">';
        if (song.contributor) meta2 += `<span><b>By:</b> ${song.contributor}</span> `;
        if (song.date) meta2 += `<span><b>Date:</b> ${song.date}</span> `;
        if (song.createdAt) meta2 += `<span><b>Created:</b> ${formatDate(song.createdAt)}</span> `;
        if (song.modifiedAt) meta2 += `<span><b>Modified:</b> ${formatDate(song.modifiedAt)}</span> `;
        meta2 += '</div>';
    }
    
    songPreviewEl.innerHTML = `
        <div class="preview-header">
            <h2>${song.title || 'Untitled Song'}</h2>
            ${meta}
            ${meta2}
        </div>
        <div class="song-lyrics">${song.lyrics ? song.lyrics.replace(/\n/g, '<br>') : ''}</div>
    `;
    
    songPreviewEl.dataset.songId = song._id || song.id || '';
}

// ====== AUTO-SCROLL FUNCTIONS ======
function setupAutoScroll() {
    isUserScrolling = false;
    if (songPreviewEl) songPreviewEl.scrollTop = 0;
    
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
    
    if (toggleAutoScrollBtn) {
        toggleAutoScrollBtn.innerHTML = '<i class="fas fa-play"></i>';
        toggleAutoScrollBtn.classList.remove('active');
    }
}

function startAutoScroll(direction = 'down') {
    if (!songPreviewEl) return;
    
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
        
        if (toggleAutoScrollBtn) {
            toggleAutoScrollBtn.innerHTML = '<i class="fas fa-play"></i>';
            toggleAutoScrollBtn.classList.remove('active');
        }
    } else {
        startAutoScroll('down');
        
        if (toggleAutoScrollBtn) {
            toggleAutoScrollBtn.innerHTML = '<i class="fas fa-pause"></i>';
            toggleAutoScrollBtn.classList.add('active');
        }
    }
}

function handleUserScroll() {
    isUserScrolling = true;
    
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
        
        if (toggleAutoScrollBtn) {
            toggleAutoScrollBtn.innerHTML = '<i class="fas fa-play"></i>';
            toggleAutoScrollBtn.classList.remove('active');
        }
    }
    
    setTimeout(() => {
        isUserScrolling = false;
    }, 1000);
}

// ====== SUGGESTED SONGS FUNCTIONS ======
function getSuggestedSongs(currentSongId) {
    // Try both number and string match for robustness
    const currentSong = songs.find(song => song.id === parseInt(currentSongId) || String(song.id) === String(currentSongId));
    let sameCategorySongs = [];
    
    if (currentSong) {
        sameCategorySongs = songs.filter(song => {
            // Exclude selected song by id (string or number)
            return String(song.id) !== String(currentSongId) && song.category === currentSong.category;
        });
    }
    
    if (!currentSong) return [];

    // Define known language tags
    const LANGUAGE_TAGS = ['English', 'Marathi', 'Spanish', 'Hindi', 'French', 'Tamil', 'Telugu', 'Punjabi', 'Bengali'];
    let WEIGHTS = JSON.parse(sessionStorage.getItem('SUGGESTED_SONGS_WEIGHTS')) || {
        language: 10,
        scale: 30,
        timeSignature: 30,
        taal: 10,
        tempo: 0,
        genres: 15
    };
    
    // Defensive: ensure all weights are numbers, fallback to 0 if not
    const weightKeys = ['language','scale','timeSignature','taal','tempo','genres'];
    WEIGHTS = weightKeys.reduce((acc, key) => {
        acc[key] = typeof WEIGHTS[key] === 'number' && !isNaN(WEIGHTS[key]) ? WEIGHTS[key] : 0;
        return acc;
    }, {});

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
        'F#': ['C#', 'B', 'D#m'],
        'C#': ['G#', 'F#', 'A#m'],
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
        'G#m': ['D#m', 'C#m', 'B'],
        'D#m': ['A#m', 'G#m', 'F#'],
        'A#m': ['Fm', 'D#m', 'C#'],
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
        return bpm1 && bpm2 ? Math.max(0, 1 - (Math.abs(bpm1 - bpm2) / 50)) : 0;
    };

    const getLanguagesFromGenres = genres =>
        (Array.isArray(genres) ? genres : (genres ? [genres] : [])).filter(g => LANGUAGE_TAGS.includes(g));

    const getNonLanguageGenres = genres =>
        (Array.isArray(genres) ? genres : (genres ? [genres] : [])).filter(g => !LANGUAGE_TAGS.includes(g));

    // Jaccard similarity for overlap (0-1)
    function jaccardSimilarity(arr1, arr2) {
        if (!arr1.length || !arr2.length) return 0;
        const set1 = new Set(arr1);
        const set2 = new Set(arr2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    const getLanguageMatchScore = (genres1, genres2) => {
        const langs1 = getLanguagesFromGenres(genres1);
        const langs2 = getLanguagesFromGenres(genres2);
        return jaccardSimilarity(langs1, langs2);
    };

    const getGenreMatchScore = (genres1, genres2) => {
        const genresA = getNonLanguageGenres(genres1);
        const genresB = getNonLanguageGenres(genres2);
        return jaccardSimilarity(genresA, genresB);
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
            genreMatch: 0
        };

        let score = 0;

        // 1. Language match (Jaccard)
        details.languageScore = getLanguageMatchScore(
            currentSong.genres || [],
            song.genres || []
        );
        score += WEIGHTS.language * details.languageScore;
        details.languages = getLanguagesFromGenres(song.genres || []);

        // 2. Genres match (Jaccard)
        details.genreMatch = getGenreMatchScore(
            currentSong.genres || [],
            song.genres || []
        );
        score += WEIGHTS.genres * details.genreMatch;

        // 3. Scale relationships (more granular)
        if (currentSong.key && song.key) {
            if (currentSong.key === song.key) {
                score += WEIGHTS.scale;
                details.scalePriority = 4;
            } 
            else if ((isCurrentMajor && song.key === HARMONIC_RELATIONS[currentSong.key]?.[2]) ||
                    (isCurrentMinor && currentSong.key === HARMONIC_RELATIONS[song.key]?.[2])) {
                score += WEIGHTS.scale * 0.8;
                details.scalePriority = 3;
            }
            else if (HARMONIC_RELATIONS[currentSong.key]?.includes(song.key)) {
                score += WEIGHTS.scale * 0.6;
                details.scalePriority = 2;
            }
            else if (details.sameScaleType) {
                score += WEIGHTS.scale * 0.3;
                details.scalePriority = 1;
            }
        }

        // 4. Time signature matching (partial)
        if (currentSong.time === song.time) {
            details.timeMatchType = 'exact';
            score += WEIGHTS.timeSignature;
        } 
        else if (TIME_SIGNATURE_COMPATIBILITY[currentSong.time]?.includes(song.time)) {
            details.timeMatchType = 'compatible';
            score += WEIGHTS.timeSignature * 0.7;
        } else if (currentSong.time && song.time) {
            details.timeMatchType = 'none';
            score += WEIGHTS.timeSignature * 0.2;
        }

        // 5. Taal match (partial)
        details.taalMatch = currentSong.taal === song.taal;
        if (details.taalMatch) score += WEIGHTS.taal;
        else if (currentSong.taal && song.taal) score += WEIGHTS.taal * 0.2;

        // 6. Tempo similarity (already granular)
        details.tempoSimilarity = getTempoSimilarity(currentSong.tempo, song.tempo);
        score += WEIGHTS.tempo * details.tempoSimilarity;

        return {
            ...song,
            matchScore: Math.min(Math.round(score), 100),
            matchDetails: {
                ...details,
                languageScore: Math.round(details.languageScore * 100),
                tempoSimilarity: Math.round(details.tempoSimilarity * 100),
                genreMatch: Math.round(details.genreMatch * 100)
            }
        };
    });

    // Sort by priority and always return top 20, even if score is 0
    const sorted = scoredSongs.sort((a, b) => {
        // 1. Same scale type (major/minor)
        if (a.matchDetails.sameScaleType !== b.matchDetails.sameScaleType) {
            return b.matchDetails.sameScaleType - a.matchDetails.sameScaleType;
        }
        // 2. Time signature (exact > compatible > none)
        const timePriority = {
            'exact': 2,
            'compatible': 1,
            'none': 0
        };
        const aTimePrio = timePriority[a.matchDetails.timeMatchType];
        const bTimePrio = timePriority[b.matchDetails.timeMatchType];
        if (aTimePrio !== bTimePrio) {
            return bTimePrio - aTimePrio;
        }
        // 3. Language match
        if (a.matchDetails.languageScore !== b.matchDetails.languageScore) {
            return b.matchDetails.languageScore - a.matchDetails.languageScore;
        }
        // 4. Taal match
        if (a.matchDetails.taalMatch !== b.matchDetails.taalMatch) {
            return b.matchDetails.taalMatch - a.matchDetails.taalMatch;
        }
        // 5. Scale relationship quality
        if (a.matchDetails.scalePriority !== b.matchDetails.scalePriority) {
            return b.matchDetails.scalePriority - a.matchDetails.scalePriority;
        }
        // 6. Tempo similarity
        if (a.matchDetails.tempoSimilarity !== b.matchDetails.tempoSimilarity) {
            return b.matchDetails.tempoSimilarity - a.matchDetails.tempoSimilarity;
        }
        // 7. Total score
        return b.matchScore - a.matchScore;
    });
    
    // Always return top 20, even if all scores are 0
    return sorted.slice(0, 20);
}

function showSuggestedSongs() {
    const suggestedSongsContent = document.getElementById('suggestedSongsContent');
    if (!suggestedSongsContent || !songPreviewEl) return;
    
    suggestedSongsContent.innerHTML = '';
    
    const currentSongId = songPreviewEl.dataset.songId;
    if (!currentSongId) {
        suggestedSongsContent.innerHTML = '<p>Select a song to see suggestions.</p>';
        return;
    }

    const suggestedSongs = getSuggestedSongs(currentSongId);

    if (!suggestedSongs || suggestedSongs.length === 0) {
        suggestedSongsContent.innerHTML = '<p>No suggested songs found</p>';
        return;
    }

    // Use DocumentFragment for efficient DOM updates
    const fragment = document.createDocumentFragment();

    suggestedSongs.forEach(song => {
        const div = document.createElement('div');
        div.className = 'suggested-song-item';
        div.style.margin = '8px 0';
        div.style.padding = '8px';
        div.innerHTML = `
            <div class="suggested-song-title">${song.title}</div>
            <div class="suggested-song-meta">
                Key: ${song.key} | Tempo: ${song.tempo} | Time: ${song.time} | Taal: ${song.taal}
                ${song.genres ? `<br>Genres: ${song.genres.join(', ')}</span>` : ''}
            </div>
            <div class="suggested-song-match">Match Score: ${song.matchScore}%</div>
        `;
        
        div.addEventListener('click', () => {
            showPreview(song);
            // Scroll drawer to top and hide it
            const drawer = document.getElementById('suggestedSongsDrawer');
            const content = document.getElementById('suggestedSongsContent');
            if (content) content.scrollTop = 0;
            if (drawer) drawer.classList.remove('open');
            const toggleBtn = document.getElementById('toggleSuggestedSongs');
            if (toggleBtn) toggleBtn.style.right = '20px';
            suggestedSongsDrawerOpen = false;
        });
        
        fragment.appendChild(div);
    });

    // Append all elements at once
    suggestedSongsContent.appendChild(fragment);
}

function toggleSuggestedSongsDrawer() {
    const drawer = document.getElementById('suggestedSongsDrawer');
    const toggleBtn = document.getElementById('toggleSuggestedSongs');
    
    if (!drawer || !toggleBtn) return;
    
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
    
    if (!drawer || !toggleBtn) return;
    
    drawer.classList.remove('open');
    toggleBtn.style.right = '20px';
    suggestedSongsDrawerOpen = false;
}

function setupSuggestedSongsClosing() {
    const drawer = document.getElementById('suggestedSongsDrawer');
    const toggleBtn = document.getElementById('toggleSuggestedSongs');
    
    if (!drawer || !toggleBtn) return;
    
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
    const closeBtn = document.getElementById('closeSuggestedSongs');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSuggestedSongsDrawer);
    }
}

// ====== MODAL FUNCTIONS ======
function openModal(modal) {
    if (!modal) return;
    
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
    if (!modal) return;
    
    modal.style.display = 'none';
    currentModal = null;
    document.body.style.overflow = '';
    
    // Update history if we're closing via back button
    if (history.state?.modalOpen) {
        history.back();
    }
}

function setupModalClosing() {
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) {
                closeModal(modal);
            }
        });
    });
    
    // Keep the escape key functionality
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentModal) {
            closeModal(currentModal);
        }
    });
}

function editSong(id) {
    // Find by id or _id
    const song = songs.find(s => s.id == id || s._id == id);
    if (!song || !editSongModal) return;
    
    const editSongId = document.getElementById('editSongId');
    const editSongObjectId = document.getElementById('editSongObjectId');
    const editSongTitle = document.getElementById('editSongTitle');
    const editSongCategory = document.getElementById('editSongCategory');
    const editSongKey = document.getElementById('editSongKey');
    const editSongTempo = document.getElementById('editSongTempo');
    const editSongTime = document.getElementById('editSongTime');
    const editSongTaal = document.getElementById('editSongTaal');
    const editSongLyrics = document.getElementById('editSongLyrics');
    
    if (!editSongId || !editSongTitle || !editSongCategory || !editSongKey || 
        !editSongTempo || !editSongTime || !editSongTaal || !editSongLyrics) {
        return;
    }
    
    editSongId.value = song.id !== undefined ? song.id : '';
    
    // Add a hidden field for _id if not present
    if (!editSongObjectId) {
        const objectIdInput = document.createElement('input');
        objectIdInput.type = 'hidden';
        objectIdInput.id = 'editSongObjectId';
        document.getElementById('editSongForm').appendChild(objectIdInput);
    }
    
    document.getElementById('editSongObjectId').value = song._id || '';
    editSongTitle.value = song.title;
    editSongCategory.value = song.category;
    editSongKey.value = song.key;
    editSongTempo.value = song.tempo;
    editSongTime.value = song.time;
    editSongTaal.value = song.taal;
    
    const genres = Array.isArray(song.genres) ? song.genres : (song.genres ? [song.genres] : []);
    const editSelectedGenres = document.getElementById('editSelectedGenres');
    
    // Deselect all genres first
    document.querySelectorAll('#editGenreDropdown .multiselect-option.selected').forEach(opt => opt.classList.remove('selected'));
    
    if (editSelectedGenres) {
        editSelectedGenres.innerHTML = '';
    }
    
    genres.forEach(genre => {
        // Select only present genres
        const option = Array.from(document.querySelectorAll('#editGenreDropdown .multiselect-option')).find(opt => opt.dataset.value === genre);
        if (option) option.classList.add('selected');
        
        // Add tag
        if (editSelectedGenres) {
            const tag = document.createElement('div');
            tag.className = 'multiselect-tag';
            tag.innerHTML = `
                ${genre}
                <span class="remove-tag">×</span>
            `;
            editSelectedGenres.appendChild(tag);
            
            // Attach remove-tag handler
            tag.querySelector('.remove-tag').addEventListener('click', (e) => {
                e.stopPropagation();
                if (option) option.classList.remove('selected');
                tag.remove();
            });
        }
    });
    
    editSongLyrics.value = song.lyrics;
    editSongModal.style.display = 'flex';
}

function openDeleteSongModal(id) {
    const song = songs.find(s => s.id === id);
    if (!song || !deleteSongModal) return;
    
    const deleteSongId = document.getElementById('deleteSongId');
    const deleteSongTitle = document.getElementById('deleteSongTitle');
    
    if (deleteSongId) deleteSongId.value = song.id;
    if (deleteSongTitle) deleteSongTitle.textContent = song.title;
    
    deleteSongModal.style.display = 'flex';
}

async function deleteSongFromBackend(songId) {
    if (!songId) {
        showNotification('Invalid song ID for deletion', 4000);
        return;
    }
    
    try {
        const response = await authFetch(`${API_BASE_URL}/songs/${songId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            let errorMsg = 'Failed to delete song';
            try {
                const errData = await response.json();
                errorMsg = errData.message || errorMsg;
            } catch {
                errorMsg = await response.text();
            }
            throw new Error(errorMsg);
        }
        
        // Remove song from local list and update UI
        songs = songs.filter(s => s.id !== songId && s._id !== songId);
        praiseSetlist = praiseSetlist.filter(s => s.id !== songId && s._id !== songId);
        worshipSetlist = worshipSetlist.filter(s => s.id !== songId && s._id !== songId);
        
        const favIndex = favorites.indexOf(songId);
        if (favIndex !== -1) {
            favorites.splice(favIndex, 1);
            saveFavorites();
        }
        
        if (songPreviewEl && songPreviewEl.dataset.songId == songId) {
            songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics"></div>';
            songPreviewEl.dataset.songId = '';
            
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                autoScrollInterval = null;
            }
        }
        
        renderDeleteSongs();
        showNotification('Song deleted successfully');
        
        if (deleteSongModal) {
            deleteSongModal.style.display = 'none';
        }
    } catch (err) {
        showNotification('Error deleting song: ' + err.message, 4000);
        console.error(err);
    }
}

// ====== SETTINGS FUNCTIONS ======
function loadSettings() {
    const savedHeader = localStorage.getItem("sidebarHeader");
    if (savedHeader && document.querySelector(".sidebar-header h2")) {
        document.querySelector(".sidebar-header h2").textContent = savedHeader;
    }

    const savedSetlistLabel = localStorage.getItem("setlistText");
    if (savedSetlistLabel && showSetlistEl) {
        showSetlistEl.textContent = savedSetlistLabel;
    }

    const sessionResetOption = localStorage.getItem("sessionResetOption") || "manual";

    // Responsive defaults
    let sidebarWidth, songsPanelWidth, previewMargin;
    if (window.innerWidth <= 600) {
        // Mobile
        sidebarWidth = localStorage.getItem("sidebarWidth") || "60";
        songsPanelWidth = localStorage.getItem("songsPanelWidth") || "60";
        previewMargin = localStorage.getItem("previewMargin") || "15";
    } else {
        // Desktop
        sidebarWidth = localStorage.getItem("sidebarWidth") || "25";
        songsPanelWidth = localStorage.getItem("songsPanelWidth") || "25";
        previewMargin = localStorage.getItem("previewMargin") || "15";
    }
    const savedAutoScrollSpeed = localStorage.getItem("autoScrollSpeed") || "1500";

    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}%`);
    document.documentElement.style.setProperty('--songs-panel-width', `${songsPanelWidth}%`);
    document.documentElement.style.setProperty('--preview-margin-left', `${previewMargin}px`);

    const sidebarWidthInput = document.getElementById('sidebarWidthInput');
    const songsPanelWidthInput = document.getElementById('songsPanelWidthInput');
    const previewMarginInput = document.getElementById('previewMarginInput');
    const autoScrollSpeedInput = document.getElementById('autoScrollSpeedInput');
    const sessionResetOptionInput = document.getElementById("sessionResetOption");
    
    if (sidebarWidthInput) sidebarWidthInput.value = sidebarWidth;
    if (songsPanelWidthInput) songsPanelWidthInput.value = songsPanelWidth;
    if (previewMarginInput) previewMarginInput.value = previewMargin;
    if (autoScrollSpeedInput) autoScrollSpeedInput.value = savedAutoScrollSpeed;
    if (sessionResetOptionInput) sessionResetOptionInput.value = sessionResetOption;

    autoScrollSpeed = parseInt(savedAutoScrollSpeed);
}

function saveSettings() {
    const sidebarWidthInput = document.getElementById("sidebarWidthInput");
    const songsPanelWidthInput = document.getElementById("songsPanelWidthInput");
    const previewMarginInput = document.getElementById("previewMarginInput");
    const autoScrollSpeedInput = document.getElementById("autoScrollSpeedInput");

    if (!sidebarWidthInput || !songsPanelWidthInput || !previewMarginInput || !autoScrollSpeedInput) {
        return;
    }

    const sidebarWidth = sidebarWidthInput.value;
    const songsPanelWidth = songsPanelWidthInput.value;
    const previewMargin = previewMarginInput.value;
    const newAutoScrollSpeed = autoScrollSpeedInput.value;

    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}%`);
    document.documentElement.style.setProperty('--songs-panel-width', `${songsPanelWidth}%`);
    document.documentElement.style.setProperty('--preview-margin-left', `${previewMargin}px`);

    localStorage.setItem("sidebarWidth", sidebarWidth);
    localStorage.setItem("songsPanelWidth", songsPanelWidth);
    localStorage.setItem("previewMargin", previewMargin);
    localStorage.setItem("autoScrollSpeed", newAutoScrollSpeed);

    autoScrollSpeed = parseInt(newAutoScrollSpeed);

    updatePositions();
}

function applyLyricsBackground(isPraise) {
    const lyricsContainer = document.querySelector(".song-lyrics");
    if (!lyricsContainer) return;
    
    lyricsContainer.classList.remove("lyrics-bg-praise", "lyrics-bg-worship");
    lyricsContainer.classList.add(isPraise ? "lyrics-bg-praise" : "lyrics-bg-worship");
}

function redrawPreviewOnThemeChange() {
    if (songPreviewEl && songPreviewEl.dataset.songId) {
        try {
            const transposeLevelEl = document.getElementById('transpose-level');
            const currentLevel = transposeLevelEl ? parseInt(transposeLevelEl.textContent) || 0 : 0;
            const currentSong = songs.find(song => song.id == songPreviewEl.dataset.songId);
            
            if (currentSong) {
                showPreview(currentSong);
                updatePreviewWithTransposition(currentLevel);
            }
        } catch (e) {
            console.error("Error redrawing preview:", e);
        }
    }
}

// ====== PANEL MANAGEMENT FUNCTIONS ======
function updatePositions() {
    const sidebar = document.querySelector('.sidebar');
    const songsSection = document.querySelector('.songs-section');
    const previewSection = document.querySelector('.preview-section');
    
    if (!sidebar || !songsSection || !previewSection) return;
    
    if (window.innerWidth > 768) {
        if (sidebar.classList.contains('hidden')) {
            songsSection.style.left = '0';
            
            if (songsSection.classList.contains('hidden')) {
                previewSection.style.marginLeft = 'var(--preview-margin-left)';
            } else {
                previewSection.style.marginLeft = 'calc(var(--songs-panel-width) + var(--preview-margin-left))';
            }
        } else {
            songsSection.style.left = 'var(--sidebar-width)';
            
            if (songsSection.classList.contains('hidden')) {
                previewSection.style.marginLeft = 'calc(var(--sidebar-width) + var(--preview-margin-left))';
            } else {
                previewSection.style.marginLeft = 'calc(var(--sidebar-width) + var(--songs-panel-width) + var(--preview-margin-left))';
            }
        }
    } else {
        songsSection.style.left = '0';
        previewSection.style.marginLeft = '0';
        previewSection.classList.add('full-width');
    }
}

function addPanelToggles() {
    const sidebar = document.querySelector('.sidebar');
    const songsSection = document.querySelector('.songs-section');
    const previewSection = document.querySelector('.preview-section');
    
    if (!sidebar || !songsSection || !previewSection || !toggleSidebarBtn || !toggleSongsBtn || !toggleAllPanelsBtn) {
        console.error('One or more elements not found for panel toggles');
        return;
    }

    toggleSidebarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
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
        const areBothHidden = sidebar.classList.contains('hidden') && songsSection.classList.contains('hidden');
        sidebar.classList.toggle('hidden', !areBothHidden);
        songsSection.classList.toggle('hidden', !areBothHidden);
        
        const icon = toggleAllPanelsBtn.querySelector('i');
        if (icon) {
            icon.className = areBothHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
        }
        
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
            
            const icon = toggleAllPanelsBtn.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-eye';
            }
            
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

function makeToggleDraggable(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    let isDragging = false, offsetX = 0, offsetY = 0;

    const savePosition = () => {
        const pos = { top: el.style.top, left: el.style.left };
        localStorage.setItem(id + '-pos', JSON.stringify(pos));
    };

    const restorePosition = () => {
        const saved = localStorage.getItem(id + '-pos');
        if (saved) {
            const pos = JSON.parse(saved);
            el.style.top = pos.top;
            el.style.left = pos.left;
        } else {
            if (id === 'toggle-sidebar') {
                el.style.bottom = '280px';
                el.style.right = '10px';
            } else if (id === 'toggle-songs') {
                el.style.bottom = '180px';
                el.style.right = '10px';
            } else if (id === 'toggle-all-panels') {
                el.style.bottom = '230px';
                el.style.right = '10px';
            }
        }
    };

    const onMove = (clientX, clientY) => {
        el.style.left = clientX - offsetX + 'px';
        el.style.top = clientY - offsetY + 'px';
    };

    const onEnd = () => {
        isDragging = false;
        document.body.style.userSelect = '';
        const windowWidth = window.innerWidth;
        const elRect = el.getBoundingClientRect();
        
        if (elRect.left < windowWidth / 2) {
            el.style.left = '10px';
        } else {
            el.style.left = (windowWidth - el.offsetWidth - 10) + 'px';
        }
        
        savePosition();
    };

    el.addEventListener('mousedown', function (e) {
        isDragging = true;
        offsetX = e.clientX - el.offsetLeft;
        offsetY = e.clientY - el.offsetTop;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
        if (isDragging) onMove(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', onEnd);

    el.addEventListener('touchstart', function (e) {
        isDragging = true;
        const touch = e.touches[0];
        offsetX = touch.clientX - el.offsetLeft;
        offsetY = touch.clientY - el.offsetTop;
    }, { passive: false });

    el.addEventListener('touchmove', function (e) {
        if (isDragging) {
            const touch = e.touches[0];
            onMove(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    el.addEventListener('touchend', onEnd);
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

// ====== SCREEN WAKE LOCK FUNCTIONS ======
function initScreenWakeLock() {
    if (!keepScreenOnBtn) return;
    
    if ('wakeLock' in navigator) {
        keepScreenOnBtn.style.display = 'flex';
    } else {
        keepScreenOnBtn.style.display = 'none';
    }
}

async function toggleScreenWakeLock() {
    if (!('wakeLock' in navigator)) return;
    
    if (!keepScreenOn) {
        try {
            const wakeLock = await navigator.wakeLock.request('screen');
            keepScreenOn = true;
            
            if (keepScreenOnBtn) {
                keepScreenOnBtn.classList.add('active');
            }
            
            showNotification('Screen will stay on');
        } catch (err) {
            console.error('Error enabling wake lock:', err);
            showNotification('Failed to keep screen on');
        }
    } else {
        keepScreenOn = false;
        
        if (keepScreenOnBtn) {
            keepScreenOnBtn.classList.remove('active');
        }
        
        showNotification('Screen may sleep');
    }
}

// ====== RESET FUNCTIONS ======
function resetApplicationState(fullReset = true) {
    // Clear all data from memory
    searchHistory = [];
    navigationHistory = [];
    currentHistoryPosition = -1;
    
    if (fullReset) {
        // Clear all local storage
        localStorage.clear();
    } else {
        // Clear only song-related data
        localStorage.removeItem('songs');
        localStorage.removeItem('praiseSetlist');
        localStorage.removeItem('worshipSetlist');
        localStorage.removeItem('favorites');
        localStorage.removeItem('searchHistory');
    }
    
    // Reset UI
    if (songPreviewEl) {
        songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics">No song is selected</div>';
    }
    
    if (praiseContent) praiseContent.innerHTML = '<p>No songs found.</p>';
    if (worshipContent) worshipContent.innerHTML = '<p>No songs found.</p>';
    if (praiseSetlistSongs) praiseSetlistSongs.innerHTML = '<p>Your praise setlist is empty.</p>';
    if (worshipSetlistSongs) worshipSetlistSongs.innerHTML = '<p>Your worship setlist is empty.</p>';
    if (deleteContent) deleteContent.innerHTML = '<p>No songs available to delete.</p>';
    if (favoritesContent) favoritesContent.innerHTML = '<p>No favorite songs yet.</p>';
    
    // Reset filters and search
    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';
    
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.classList.remove('active');
    
    if (keyFilter) keyFilter.value = '';
    if (genreFilter) genreFilter.value = '';
    
    // Reset counters
    const totalSongsEl = document.getElementById('totalSongs');
    const praiseCountEl = document.getElementById('praiseCount');
    const worshipCountEl = document.getElementById('worshipCount');
    
    if (totalSongsEl) totalSongsEl.textContent = '0';
    if (praiseCountEl) praiseCountEl.textContent = '0';
    if (worshipCountEl) worshipCountEl.textContent = '0';
    
    // Reset theme to light mode if it was dark
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
        }
        
        localStorage.setItem('darkMode', 'false');
    }
    
    // Show default view
    if (praiseTab) praiseTab.click();
    if (showAllEl) showAllEl.click();
    
    showNotification('Application has been reset to initial state');
    
    // Reload the page to ensure complete reset
    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

// ====== MOBILE SWIPE FUNCTIONS ======
function enableMobileSwipeNavigation() {
    if (window.innerWidth > 768) return; // Only on mobile
    
    let touchStartX = 0;
    let touchStartY = 0;
    let isScrolling = false;
    const threshold = 50; // Minimum px for swipe
    
    if (!songPreviewEl) return;
    
    songPreviewEl.addEventListener('touchstart', function(e) {
        if (!songPreviewEl.dataset.songId) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isScrolling = false;
    }, { passive: true });
    
    songPreviewEl.addEventListener('touchmove', function(e) {
        if (!songPreviewEl.dataset.songId) return;
        const diffX = e.touches[0].clientX - touchStartX;
        const diffY = e.touches[0].clientY - touchStartY;
        
        if (Math.abs(diffY) > 10) {
            isScrolling = true;
        }
    }, { passive: true });
    
    songPreviewEl.addEventListener('touchend', function(e) {
        if (!songPreviewEl.dataset.songId || isScrolling) return;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        
        if (diffX < -threshold) {
            animateSongSwipe('left');
            setTimeout(() => {
                showNextSong();
            }, 150);
        } else if (diffX > threshold) {
            animateSongSwipe('right');
            setTimeout(() => {
                showPrevSong();
            }, 150);
        }
    }, { passive: true });
}

function animateSongSwipe(direction) {
    if (!songPreviewEl) return;
    
    songPreviewEl.classList.remove('swipe-left', 'swipe-right', 'swipe-active');
    void songPreviewEl.offsetWidth; // force reflow
    songPreviewEl.classList.add('swipe-active');
    
    if (direction === 'left') songPreviewEl.classList.add('swipe-left');
    if (direction === 'right') songPreviewEl.classList.add('swipe-right');
    
    setTimeout(() => {
        songPreviewEl.classList.remove('swipe-left', 'swipe-right', 'swipe-active');
    }, 350);
}

function getCurrentPreviewSongIndex() {
    if (!songPreviewEl || !songPreviewEl.dataset.songId || !Array.isArray(songs)) return -1;
    
    const songId = songPreviewEl.dataset.songId;
    return songs.findIndex(s => (s._id || s.id) == songId);
}

function showNextSong() {
    const idx = getCurrentPreviewSongIndex();
    if (idx === -1 || idx >= songs.length - 1) return;
    
    const nextSong = songs[idx + 1];
    if (nextSong) previewSongNoActions(nextSong);
}

function showPrevSong() {
    const idx = getCurrentPreviewSongIndex();
    if (idx <= 0) return;
    
    const prevSong = songs[idx - 1];
    if (prevSong) previewSongNoActions(prevSong);
}

// ====== ADMIN PANEL FUNCTIONS ======
function setupAdminPanel() {
    // Create admin panel modal
    const adminPanelModal = document.createElement('div');
    adminPanelModal.id = 'adminPanelModal';
    adminPanelModal.className = 'modal';
    adminPanelModal.style.display = 'none';
    
    adminPanelModal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal" id="closeAdminPanelModal" aria-label="Close">×</span>
            <div class="admin-tabs">
                <button class="admin-tab active" id="adminTabUsers" type="button"><i class="fas fa-users"></i> User Management</button>
                <button class="admin-tab" id="adminTabWeights" type="button"><i class="fas fa-balance-scale"></i> Suggested Songs Weights</button>
                <button class="admin-tab" id="adminTabSuperadmin" type="button"><i class="fas fa-key"></i> Superadmin</button>
            </div>
            <div id="adminTabContentUsers" class="admin-tab-content active">
                <h3 style="margin-bottom:12px;">User Management</h3>
                <div id="adminUsersList">Loading users...</div>
            </div>
            <div id="adminTabContentWeights" class="admin-tab-content">
                <h3 class="weights-title" style="margin-bottom:12px;"><i class="fas fa-balance-scale"></i> Suggested Songs Weights</h3>
                <form id="suggestedWeightsForm">
                    <table class="admin-weights-table">
                        <thead>
                            <tr><th>Parameter</th><th style="width:120px;">Weight</th></tr>
                        </thead>
                        <tbody id="suggestedWeightsFields"></tbody>
                        <tr class="weights-total-row">
                            <td>Total</td>
                            <td style="display:flex;align-items:center;gap:10px;padding:8px 0;">
                                <div class="weights-total-bar-bg" style="margin:0;">
                                    <div id="weightsTotalBar" class="weights-total-bar"></div>
                                </div>
                                <span id="weightsTotalValue" class="weights-total-value">0%</span>
                            </td>
                        </tr>
                    </table>
                    <button type="submit" class="weights-save-btn"><i class="fas fa-save"></i> Save Weights</button>
                    <span id="suggestedWeightsStatus" class="weights-status"></span>
                </form>
            </div>
            <div id="adminTabContentSuperadmin" class="admin-tab-content">
                <h3><i class="fas fa-key"></i> Superadmin Password Reset</h3>
                <div id="superadminResetList">Loading users...</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(adminPanelModal);
    
    // Admin panel tab switching logic
    const adminTabUsers = document.getElementById('adminTabUsers');
    const adminTabWeights = document.getElementById('adminTabWeights');
    const adminTabSuperadmin = document.getElementById('adminTabSuperadmin');
    const adminTabContentUsers = document.getElementById('adminTabContentUsers');
    const adminTabContentWeights = document.getElementById('adminTabContentWeights');
    const adminTabContentSuperadmin = document.getElementById('adminTabContentSuperadmin');
    
    if (adminTabUsers && adminTabWeights && adminTabSuperadmin &&
        adminTabContentUsers && adminTabContentWeights && adminTabContentSuperadmin) {
        
        adminTabUsers.onclick = function() {
            adminTabUsers.classList.add('active');
            adminTabWeights.classList.remove('active');
            adminTabSuperadmin.classList.remove('active');
            adminTabContentUsers.classList.add('active');
            adminTabContentWeights.classList.remove('active');
            adminTabContentSuperadmin.classList.remove('active');
        };
        
        adminTabWeights.onclick = function() {
            adminTabUsers.classList.remove('active');
            adminTabWeights.classList.add('active');
            adminTabSuperadmin.classList.remove('active');
            adminTabContentUsers.classList.remove('active');
            adminTabContentWeights.classList.add('active');
            adminTabContentSuperadmin.classList.remove('active');
            // Lazy load weights UI if needed
            loadAndRenderSuggestedWeights();
        };
        
        adminTabSuperadmin.onclick = function() {
            adminTabUsers.classList.remove('active');
            adminTabWeights.classList.remove('active');
            adminTabSuperadmin.classList.add('active');
            adminTabContentUsers.classList.remove('active');
            adminTabContentWeights.classList.remove('active');
            adminTabContentSuperadmin.classList.add('active');
        };
    }
    
    // Close modal button
    const closeAdminPanelModal = document.getElementById('closeAdminPanelModal');
    if (closeAdminPanelModal) {
        closeAdminPanelModal.onclick = () => {
            adminPanelModal.style.display = 'none';
        };
    }
    
    // Admin panel button click
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn) {
        adminPanelBtn.addEventListener('click', async () => {
            adminPanelModal.style.display = 'flex';
            await loadAndRenderUsers();
            await loadAndRenderSuggestedWeights();
        });
    }
}

async function loadAndRenderUsers() {
    const usersListDiv = document.getElementById('adminUsersList');
    if (!usersListDiv) return;
    
    usersListDiv.innerHTML = 'Loading users...';
    
    try {
        const res = await authFetch(`${API_BASE_URL}/users`);
        if (!res.ok) throw new Error('Failed to fetch users');
        
        const users = await res.json();
        
        if (!Array.isArray(users) || users.length === 0) {
            usersListDiv.innerHTML = '<p>No users found.</p>';
            return;
        }
        
        let html = `<table class="admin-users-table">
            <tr><th>Name</th><th>Email</th><th>Admin</th><th>Action</th></tr>`;
        
        users.forEach(user => {
            html += `<tr>
                <td>${user.name || ''}</td>
                <td>${user.email}</td>
                <td>${user.isAdmin ? '<span class="admin-yes">Yes</span>' : '<span class="admin-no">No</span>'}</td>
                <td>`;
            
            if (user.isAdmin) {
                if (user.email === currentUser.email) {
                    html += '<span class="admin-self">(You)</span>';
                } else {
                    html += `<button class="btn btn-delete" data-userid="${user._id || user.id}" data-admin="false">Remove Admin</button>`;
                }
            } else {
                html += `<button class="btn btn-primary" data-userid="${user._id || user.id}" data-admin="true">Make Admin</button>`;
            }
            
            // Add delete user button (never allow self-delete)
            if (user.email !== currentUser.email) {
                html += ` <button class="btn btn-delete" data-userid="${user._id || user.id}" data-delete="true" style="margin-left:6px;"><i class="fas fa-trash"></i> Delete</button>`;
            }
            
            html += `</td></tr>`;
        });
        
        html += '</table>';
        usersListDiv.innerHTML = html;

        // Also render superadmin password reset tab
        const superadminResetList = document.getElementById('superadminResetList');
        if (superadminResetList) {
            let resetHtml = `<table class="admin-users-table">
                <tr><th>Name</th><th>Email</th><th>Reset Password</th></tr>`;
            
            users.forEach(user => {
                resetHtml += `<tr>
                    <td>${user.name || ''}</td>
                    <td>${user.email}</td>
                    <td><button class="btn btn-primary btn-reset-password" data-userid="${user._id || user.id}">Reset to 'qwerty123'</button></td>
                </tr>`;
            });
            
            resetHtml += '</table>';
            superadminResetList.innerHTML = resetHtml;
            
            // Add event listeners for password reset buttons
            document.querySelectorAll('.btn-reset-password').forEach(btn => {
                btn.onclick = async function() {
                    const userId = this.getAttribute('data-userid');
                    this.disabled = true;
                    this.textContent = 'Resetting...';
                    
                    try {
                        const res = await authFetch(`${API_BASE_URL}/users/${userId}/reset-password`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ newPassword: 'qwerty123' })
                        });
                        
                        if (!res.ok) throw new Error('Failed to reset password');
                        
                        showNotification('Password reset to qwerty123');
                        this.textContent = 'Reset to qwerty123';
                    } catch (e) {
                        showNotification('Error resetting password', 4000);
                        this.disabled = false;
                        this.textContent = 'Reset to qwerty123';
                    }
                };
            });
        }

        // Add event listeners for admin toggle buttons
        usersListDiv.querySelectorAll('button[data-userid]').forEach(btn => {
            btn.onclick = async function() {
                const userId = this.getAttribute('data-userid');
                
                if (this.getAttribute('data-delete') === 'true') {
                    // Delete user logic
                    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
                    
                    this.disabled = true;
                    this.textContent = 'Deleting...';
                    
                    try {
                        const resDel = await authFetch(`${API_BASE_URL}/users/${userId}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (!resDel.ok) throw new Error('Failed to delete user');
                        
                        showNotification('User deleted');
                        await loadAndRenderUsers();
                    } catch (e) {
                        showNotification('Error deleting user', 4000);
                        this.disabled = false;
                        this.textContent = '<i class="fas fa-trash"></i> Delete';
                    }
                    
                    return;
                }
                
                // Admin toggle logic
                const makeAdmin = this.getAttribute('data-admin') === 'true';
                this.disabled = true;
                this.textContent = 'Updating...';
                
                try {
                    const res2 = await authFetch(`${API_BASE_URL}/users/${userId}/admin`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isAdmin: makeAdmin })
                    });
                    
                    if (res2.ok) {
                        showNotification('User admin status updated');
                        await loadAndRenderUsers();
                    } else {
                        const errData = await res2.json();
                        showNotification(`Error: ${errData.error || 'Unauthorized'}`, 4000);
                    }
                } catch (e) {
                    showNotification('Error updating admin status', 4000);
                    this.disabled = false;
                    this.textContent = makeAdmin ? 'Make Admin' : 'Remove Admin';
                }
            };
        });
    } catch (e) {
        const usersListDiv = document.getElementById('adminUsersList');
        if (usersListDiv) {
            usersListDiv.innerHTML = '<p style="color:red;">Error loading users.</p>';
        }
    }
}

function updateWeightsTotal() {
    const keys = ['language','scale','timeSignature','taal','tempo','genres'];
    let total = 0;
    
    keys.forEach(key => {
        const el = document.getElementById('weight_'+key);
        const val = el ? parseInt(el.value,10) : 0;
        total += isNaN(val) ? 0 : val;
    });
    
    const bar = document.getElementById('weightsTotalBar');
    const value = document.getElementById('weightsTotalValue');
    
    if (bar) {
        bar.style.width = Math.min(total,100) + '%';
        bar.style.background = total === 100 ? '#4fc3f7' : (total > 100 ? '#e63946' : '#f7b731');
    }
    
    if (value) {
        value.textContent = total + '%';
        value.style.color = total === 100 ? '#4fc3f7' : (total > 100 ? '#e63946' : '#f7b731');
    }
}

async function loadAndRenderSuggestedWeights() {
    const fieldsDiv = document.getElementById('suggestedWeightsFields');
    const statusSpan = document.getElementById('suggestedWeightsStatus');
    
    if (!fieldsDiv || !statusSpan) return;
    
    fieldsDiv.innerHTML = 'Loading...';
    statusSpan.textContent = '';
    
    try {
        const res = await authFetch(`${API_BASE_URL}/suggested-songs-weights`);
        const weights = await res.json();
        
        fieldsDiv.innerHTML = '';
        const keys = ['language','scale','timeSignature','taal','tempo','genres'];
        
        keys.forEach(key => {
            const val = typeof weights[key] === 'number' ? weights[key] : '';
            fieldsDiv.innerHTML += `
                <tr>
                    <td>${key.charAt(0).toUpperCase()+key.slice(1)}</td>
                    <td><input type="number" id="weight_${key}" name="${key}" min="0" max="100" step="5" value="${val}"></td>
                </tr>
            `;
        });
        
        // Add total update logic
        keys.forEach(key => {
            const el = document.getElementById('weight_'+key);
            if (el) el.addEventListener('input', updateWeightsTotal);
        });
        
        updateWeightsTotal();
        
        // Only set onsubmit after form is in DOM
        const form = document.getElementById('suggestedWeightsForm');
        if (form) {
            form.onsubmit = async function(e) {
                e.preventDefault();
                statusSpan.textContent = '';
                
                const data = {};
                keys.forEach(key => {
                    const val = parseInt(document.getElementById('weight_'+key).value,10);
                    data[key] = isNaN(val) ? 0 : val;
                });
                
                try {
                    const res = await authFetch(`${API_BASE_URL}/suggested-songs-weights`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    
                    if (res.ok) {
                        statusSpan.textContent = 'Saved!';
                        statusSpan.style.color = 'green';
                    } else {
                        statusSpan.textContent = 'Failed to save';
                        statusSpan.style.color = 'red';
                    }
                } catch (e) {
                    statusSpan.textContent = 'Error saving';
                    statusSpan.style.color = 'red';
                }
            };
        }
    } catch (e) {
        fieldsDiv.innerHTML = '<span style="color:red;">Failed to load weights</span>';
    }
}

// ====== TAP TEMPO FUNCTIONS ======
function setupTapTempo() {
    // Tap Tempo logic for Add Song Modal
    const tapTempoBtn = document.getElementById('tapTempoBtn');
    const songTempoInput = document.getElementById('songTempo');
    let tapTimes = [];
    
    if (tapTempoBtn && songTempoInput) {
        tapTempoBtn.addEventListener('click', function() {
            const now = Date.now();
            tapTimes.push(now);
            tapTimes = tapTimes.filter(t => now - t < 2000);
            
            if (tapTimes.length > 1) {
                const intervals = [];
                for (let i = 1; i < tapTimes.length; i++) {
                    intervals.push(tapTimes[i] - tapTimes[i - 1]);
                }
                
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const bpm = Math.round(60000 / avgInterval);
                songTempoInput.value = bpm; // Show BPM directly in input
            } else {
                songTempoInput.value = '';
            }
        });
    }
    
    // Tap Tempo logic for Edit Song Modal
    const editTapTempoBtn = document.getElementById('editTapTempoBtn');
    const editSongTempoInput = document.getElementById('editSongTempo');
    let editTapTimes = [];
    
    if (editTapTempoBtn && editSongTempoInput) {
        editTapTempoBtn.addEventListener('click', function() {
            const now = Date.now();
            editTapTimes.push(now);
            editTapTimes = editTapTimes.filter(t => now - t < 2000);
            
            if (editTapTimes.length > 1) {
                const intervals = [];
                for (let i = 1; i < editTapTimes.length; i++) {
                    intervals.push(editTapTimes[i] - editTapTimes[i - 1]);
                }
                
                const bpm = Math.round(60000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length));
                editSongTempoInput.value = bpm;
            } else {
                editSongTempoInput.value = '';
            }
        });
    }
}

// ====== INITIALIZATION FUNCTIONS ======
function initDOMReferences() {
    // DOM Elements
    praiseTab = document.getElementById('praiseTab');
    worshipTab = document.getElementById('worshipTab');
    praiseContent = document.getElementById('praiseContent');
    worshipContent = document.getElementById('worshipContent');
    keyFilter = document.getElementById('keyFilter');
    genreFilter = document.getElementById('genreFilter');
    songPreviewEl = document.getElementById('songPreview');
    showSetlistEl = document.getElementById('showSetlist');
    showAllEl = document.getElementById('showAll');
    showDeleteEl = document.getElementById('showDelete');
    showFavoritesEl = document.getElementById('showFavorites');
    setlistSection = document.getElementById('setlistSection');
    praiseSetlistSongs = document.getElementById('praiseSetlistSongs');
    worshipSetlistSongs = document.getElementById('worshipSetlistSongs');
    praiseSetlistTab = document.getElementById('praiseSetlistTab');
    worshipSetlistTab = document.getElementById('worshipSetlistTab');
    deleteSection = document.getElementById('deleteSection');
    deleteContent = document.getElementById('deleteContent');
    favoritesSection = document.getElementById('favoritesSection');
    favoritesContent = document.getElementById('favoritesContent');
    addSongModal = document.getElementById('addSongModal');
    openAddSongModal = document.getElementById('openAddSongModal');
    newSongForm = document.getElementById('newSongForm');
    editSongModal = document.getElementById('editSongModal');
    editSongForm = document.getElementById('editSongForm');
    deleteSongModal = document.getElementById('deleteSongModal');
    deleteSongForm = document.getElementById('deleteSongForm');
    cancelDeleteSong = document.getElementById('cancelDeleteSong');
    confirmDeleteAllModal = document.getElementById('confirmDeleteAllModal');
    cancelDeleteAll = document.getElementById('cancelDeleteAll');
    confirmDeleteAll = document.getElementById('confirmDeleteAll');
    searchInput = document.getElementById('searchInput');
    clearSearchBtn = document.getElementById('clearSearch');
    toggleSidebarBtn = document.getElementById('toggle-sidebar');
    toggleSongsBtn = document.getElementById('toggle-songs');
    toggleAllPanelsBtn = document.getElementById('toggle-all-panels');
    toggleAutoScrollBtn = document.getElementById('toggleAutoScroll');
    keepScreenOnBtn = document.getElementById('keepScreenOnBtn');
    sortSongs = document.getElementById('sortSongs');
    notificationEl = document.getElementById('notification');
}

function setupEventListeners() {
    // Login/Register buttons
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'flex';
        });
    }
    
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            const registerModal = document.getElementById('registerModal');
            if (registerModal) registerModal.style.display = 'flex';
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Clear auth data
            jwtToken = null;
            currentUser = null;
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('currentUser');
            
            // Update UI
            updateAuthUI();
            showNotification('Logged out successfully');
            
            // Refresh the page to reset state
            window.location.reload();
        });
    }
    
    // Sort songs dropdown
    if (sortSongs) {
        sortSongs.addEventListener('change', function() {
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
        });
    }
    
    // Tab switching
    if (praiseTab) {
        praiseTab.addEventListener('click', () => {
            if (!setlistSection || !deleteSection || !favoritesSection || !worshipTab || 
                !praiseContent || !worshipContent) return;
                
            setlistSection.style.display = 'none';
            deleteSection.style.display = 'none';
            favoritesSection.style.display = 'none';
            praiseTab.classList.add('active');
            worshipTab.classList.remove('active');
            praiseContent.classList.add('active');
            worshipContent.classList.remove('active');
            renderSongs('praise', keyFilter.value, genreFilter.value);
            applyLyricsBackground(true);
            
            // Mobile view: show songs panel and hide sidebar
            if (window.innerWidth <= 768) {
                document.querySelector('.songs-section').classList.remove('hidden');
                document.querySelector('.sidebar').classList.add('hidden');
                document.querySelector('.preview-section').classList.remove('full-width');
            }
        });
    }
    
    if (worshipTab) {
        worshipTab.addEventListener('click', () => {
            if (!setlistSection || !deleteSection || !favoritesSection || !praiseTab || 
                !praiseContent || !worshipContent) return;
                
            setlistSection.style.display = 'none';
            deleteSection.style.display = 'none';
            favoritesSection.style.display = 'none';
            worshipTab.classList.add('active');
            praiseTab.classList.remove('active');
            worshipContent.classList.add('active');
            praiseContent.classList.remove('active');
            renderSongs('worship', keyFilter.value, genreFilter.value);
            applyLyricsBackground(false);
            
            // Mobile view: show songs panel and hide sidebar
            if (window.innerWidth <= 768) {
                document.querySelector('.songs-section').classList.remove('hidden');
                document.querySelector('.sidebar').classList.add('hidden');
                document.querySelector('.preview-section').classList.remove('full-width');
            }
        });
    }
    
    // Filter changes
    if (keyFilter) {
        keyFilter.addEventListener('change', () => {
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
        });
    }
    
    if (genreFilter) {
        genreFilter.addEventListener('change', () => {
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
        });
    }
    
    // Menu navigation
    if (showSetlistEl) {
        showSetlistEl.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (!praiseContent || !worshipContent || !setlistSection || !deleteSection || 
                !favoritesSection || !praiseSetlistTab || !worshipSetlistTab || 
                !praiseSetlistSongs || !worshipSetlistSongs) return;
                
            praiseContent.classList.remove('active');
            worshipContent.classList.remove('active');
            setlistSection.style.display = 'block';
            deleteSection.style.display = 'none';
            favoritesSection.style.display = 'none';
            praiseSetlistTab.classList.add('active');
            worshipSetlistTab.classList.remove('active');
            praiseSetlistSongs.style.display = 'block';
            worshipSetlistSongs.style.display = 'none';
            renderSetlist('praise');
            
            document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
            e.target.classList.add('active');
            
            // Mobile view: show songs panel and hide sidebar
            if (window.innerWidth <= 768) {
                document.querySelector('.songs-section').classList.remove('hidden');
                document.querySelector('.sidebar').classList.add('hidden');
                document.querySelector('.preview-section').classList.remove('full-width');
            }
        });
    }
    
    if (showAllEl) {
        showAllEl.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (!praiseContent || !worshipContent || !setlistSection || !deleteSection || !favoritesSection) return;
                
            praiseContent.classList.add('active');
            worshipContent.classList.remove('active');
            setlistSection.style.display = 'none';
            deleteSection.style.display = 'none';
            favoritesSection.style.display = 'none';
            renderSongs('praise', keyFilter.value, genreFilter.value);
            
            document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
            e.target.classList.add('active');
            applyLyricsBackground(true);
            
            // Mobile view: show songs panel and hide sidebar
            if (window.innerWidth <= 768) {
                document.querySelector('.songs-section').classList.remove('hidden');
                document.querySelector('.sidebar').classList.add('hidden');
                document.querySelector('.preview-section').classList.remove('full-width');
            }
        });
    }
    
    if (showDeleteEl) {
        showDeleteEl.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (!praiseContent || !worshipContent || !setlistSection || !deleteSection || !favoritesSection) return;
                
            praiseContent.classList.remove('active');
            worshipContent.classList.remove('active');
            setlistSection.style.display = 'none';
            deleteSection.style.display = 'block';
            favoritesSection.style.display = 'none';
            renderDeleteSongs();
            
            document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
            e.target.classList.add('active');
            
            // Mobile view: show songs panel and hide sidebar
            if (window.innerWidth <= 768) {
                document.querySelector('.songs-section').classList.remove('hidden');
                document.querySelector('.sidebar').classList.add('hidden');
                document.querySelector('.preview-section').classList.remove('full-width');
            }
        });
    }
    
    if (showFavoritesEl) {
        showFavoritesEl.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (!praiseContent || !worshipContent || !setlistSection || !deleteSection || !favoritesSection) return;
                
            praiseContent.classList.remove('active');
            worshipContent.classList.remove('active');
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
    }
    
    // Setlist tab switching
    if (praiseSetlistTab) {
        praiseSetlistTab.addEventListener('click', () => {
            if (!praiseSetlistTab || !worshipSetlistTab || !praiseSetlistSongs || !worshipSetlistSongs) return;
                
            praiseSetlistTab.classList.add('active');
            worshipSetlistTab.classList.remove('active');
            praiseSetlistSongs.style.display = 'block';
            worshipSetlistSongs.style.display = 'none';
            renderSetlist('praise');
        });
    }
    
    if (worshipSetlistTab) {
        worshipSetlistTab.addEventListener('click', () => {
            if (!praiseSetlistTab || !worshipSetlistTab || !praiseSetlistSongs || !worshipSetlistSongs) return;
                
            worshipSetlistTab.classList.add('active');
            praiseSetlistTab.classList.remove('active');
            worshipSetlistSongs.style.display = 'block';
            praiseSetlistSongs.style.display = 'none';
            renderSetlist('worship');
        });
    }
    
    // Reset app button
    const resetAppBtn = document.getElementById('resetAppBtn');
    if (resetAppBtn) {
        resetAppBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to reset the application?\n\nThis will:' + 
                        '\n- Clear all songs and setlists' +
                        '\n- Reset all settings to defaults' +
                        '\n- Clear search history' +
                        '\n- Remove all favorites')) {
                resetApplicationState();
            }
        });
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Don't navigate if we're typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        
        // Only handle left/right arrows when a song is being previewed
        if (!songPreviewEl || !songPreviewEl.dataset.songId) return;
        
        if (e.key === 'ArrowRight') {
            showNextSong();
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            showPrevSong();
            e.preventDefault();
        }
    });
    
    // Add song modal
    if (openAddSongModal) {
        openAddSongModal.addEventListener('click', () => {
            if (!addSongModal) return;
            
            addSongModal.style.display = 'flex';
            // Do NOT clear selected genres here; preserve previous selection
        });
    }
    
    // Multi-select genres functionality
    const songGenre = document.getElementById('songGenre');
    const editSongGenre = document.getElementById('editSongGenre');
    
    if (songGenre) {
        songGenre.addEventListener('click', (e) => {
            e.preventDefault();
            const genreDropdown = document.getElementById('genreDropdown');
            if (genreDropdown) genreDropdown.classList.toggle('show');
        });
    }
    
    if (editSongGenre) {
        editSongGenre.addEventListener('click', (e) => {
            e.preventDefault();
            const editGenreDropdown = document.getElementById('editGenreDropdown');
            if (editGenreDropdown) editGenreDropdown.classList.toggle('show');
        });
    }
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.multiselect-container')) {
            const genreDropdown = document.getElementById('genreDropdown');
            const editGenreDropdown = document.getElementById('editGenreDropdown');
            
            if (genreDropdown) genreDropdown.classList.remove('show');
            if (editGenreDropdown) editGenreDropdown.classList.remove('show');
        }
    });
    
    // Genre dropdown options
    document.querySelectorAll('#genreDropdown .multiselect-option').forEach(option => {
        option.addEventListener('click', () => {
            option.classList.toggle('selected');
            updateSelectedGenres('selectedGenres', 'genreDropdown');
        });
    });
    
    document.querySelectorAll('#editGenreDropdown .multiselect-option').forEach(option => {
        option.addEventListener('click', () => {
            option.classList.toggle('selected');
            updateSelectedGenres('editSelectedGenres', 'editGenreDropdown');
        });
    });
    
    // Clear genres buttons
    const clearGenresBtn = document.getElementById('clearGenresBtn');
    const clearEditGenresBtn = document.getElementById('clearEditGenresBtn');
    
    if (clearGenresBtn) {
        clearGenresBtn.addEventListener('click', function() {
            document.querySelectorAll('#genreDropdown .multiselect-option.selected').forEach(opt => opt.classList.remove('selected'));
            updateSelectedGenres('selectedGenres', 'genreDropdown');
        });
    }
    
    if (clearEditGenresBtn) {
        clearEditGenresBtn.addEventListener('click', function() {
            document.querySelectorAll('#editGenreDropdown .multiselect-option.selected').forEach(opt => opt.classList.remove('selected'));
            const editSelectedGenres = document.getElementById('editSelectedGenres');
            if (editSelectedGenres) editSelectedGenres.innerHTML = '';
        });
    }
    
    // Form submissions
    if (newSongForm) {
        newSongForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!window.currentUser) {
                console.warn('[Global] currentUser is missing at submit time');
            }
            
            if (!newSongForm) {
                console.warn('[Global] newSongForm missing at submit time');
            }
            
            const songTitle = document.getElementById('songTitle');
            const songLyrics = document.getElementById('songLyrics');
            
            if (!songTitle || !songLyrics) return;
            
            const title = songTitle.value;
            const lyrics = songLyrics.value;
            
            // For add, check all songs (no id)
            if (isDuplicateSong(title, lyrics, null)) {
                showNotification('A song with this title and lyrics already exists!');
                return;
            }
            
            const selectedGenres = Array.from(document.querySelectorAll('#genreDropdown .multiselect-option.selected'))
                .map(opt => opt.dataset.value);
                
            if (selectedGenres.length === 0) {
                showNotification('Please select at least one genre');
                return;
            }
            
            if (!window.currentUser || !jwtToken) {
                console.warn('[Global] currentUser or token missing at submit time', window.currentUser);
                showNotification('Session expired. Please log in again.');
                return;
            }
            
            const debugAuthHeader = `Bearer ${jwtToken}`;
            console.log('[Add Song] Authorization header:', debugAuthHeader);
            
            const songCategory = document.getElementById('songCategory');
            const songKey = document.getElementById('songKey');
            const songTempo = document.getElementById('songTempo');
            const songTime = document.getElementById('songTime');
            const songTaal = document.getElementById('songTaal');
            
            if (!songCategory || !songKey || !songTempo || !songTime || !songTaal) return;
            
            const songData = {
                title: title,
                category: songCategory.value,
                key: songKey.value,
                tempo: songTempo.value,
                time: songTime.value,
                taal: songTaal.value,
                genres: selectedGenres,
                lyrics: lyrics,
                date: new Date().toISOString(),
                contributor: window.currentUser?.name || window.currentUser?.email || 'Unknown'
            };
            
            try {
                const response = await fetch(`${API_BASE_URL}/songs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': debugAuthHeader
                    },
                    body: JSON.stringify(songData)
                });
                
                if (response.status === 401) {
                    showNotification('Session expired or invalid. Please log in again.');
                    return;
                }
                
                if (!response.ok) {
                    let errMsg = 'Failed to add song';
                    try {
                        const errData = await response.json();
                        errMsg = errData.error || errMsg;
                    } catch {}
                    throw new Error(errMsg);
                }
                
                const newSong = await response.json();
                songs.push(newSong);
                
                if (deleteSection && deleteSection.style.display === 'block') {
                    renderDeleteSongs();
                } else if (praiseTab && praiseTab.classList.contains('active')) {
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('worship', keyFilter.value, genreFilter.value);
                }
                
                updateSongCount();
                showNotification('Song added successfully!');
                
                if (addSongModal) {
                    addSongModal.style.display = 'none';
                }
                
                // Preserve selected genres after reset
                const preservedGenres = Array.from(document.querySelectorAll('#genreDropdown .multiselect-option.selected')).map(opt => opt.dataset.value);
                newSongForm.reset();
                
                // Restore preserved genres
                document.querySelectorAll('#genreDropdown .multiselect-option').forEach(opt => {
                    if (preservedGenres.includes(opt.dataset.value)) {
                        opt.classList.add('selected');
                    } else {
                        opt.classList.remove('selected');
                    }
                });
                
                updateSelectedGenres('selectedGenres', 'genreDropdown');
            } catch (err) {
                showNotification('Error adding song: ' + err.message, 4000);
                console.error(err);
            }
        });
    }
    
    // Edit song form submission
    if (editSongForm) {
        editSongForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const editSongId = document.getElementById('editSongId');
            const editSongObjectId = document.getElementById('editSongObjectId');
            const editSongTitle = document.getElementById('editSongTitle');
            const editSongLyrics = document.getElementById('editSongLyrics');
            
            if (!editSongId || !editSongTitle || !editSongLyrics) return;
            
            const id = editSongId.value;
            const objectId = editSongObjectId ? editSongObjectId.value : '';
            const title = editSongTitle.value;
            const lyrics = editSongLyrics.value;
            const currentId = objectId || id;
            
            if (isDuplicateSong(title, lyrics, currentId)) {
                showNotification('A song with this title and lyrics already exists!');
                return;
            }
            
            const selectedGenres = Array.from(document.querySelectorAll('#editGenreDropdown .multiselect-option.selected'))
                .map(opt => opt.dataset.value);
                
            if (selectedGenres.length === 0) {
                showNotification('Please select at least one genre');
                return;
            }
            
            // Build update body (do NOT include _id)
            const editSongCategory = document.getElementById('editSongCategory');
            const editSongKey = document.getElementById('editSongKey');
            const editSongTempo = document.getElementById('editSongTempo');
            const editSongTime = document.getElementById('editSongTime');
            const editSongTaal = document.getElementById('editSongTaal');
            
            if (!editSongCategory || !editSongKey || !editSongTempo || !editSongTime || !editSongTaal) return;
            
            const updatedSong = {
                title: title,
                category: editSongCategory.value,
                key: editSongKey.value,
                tempo: editSongTempo.value,
                time: editSongTime.value,
                taal: editSongTaal.value,
                genres: selectedGenres,
                lyrics: lyrics
            };
            
            // Find the song object by _id or id (for local update only)
            let songObj = songs.find(s => (objectId && s._id == objectId) || s.id == id || s._id == id);
            
            try {
                const debugAuthHeader = `Bearer ${currentUser.token}`;
                let response, newSong = null;
                
                // Try with _id first if present
                if (objectId) {
                    response = await fetch(`${API_BASE_URL}/songs/${objectId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': debugAuthHeader
                        },
                        body: JSON.stringify(updatedSong)
                    });
                    
                    if (response.ok) {
                        newSong = await response.json();
                    }
                }
                
                // If not found or not ok, try with id (for legacy numeric id)
                if ((!response || response.status === 404 || !response.ok) && id) {
                    response = await fetch(`${API_BASE_URL}/songs/${id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': debugAuthHeader
                        },
                        body: JSON.stringify(updatedSong)
                    });
                    
                    if (response.ok) {
                        newSong = await response.json();
                    }
                }
                
                if (!response || !response.ok || !newSong) {
                    let errMsg = 'Failed to update song';
                    try {
                        const errData = await response.json();
                        errMsg = errData.error || errMsg;
                    } catch {}
                    throw new Error(errMsg);
                }
                
                // Update by _id or id
                songs = songs.map(song => (song._id === newSong._id || song.id === newSong.id) ? newSong : song);
                
                if (deleteSection && deleteSection.style.display === 'block') {
                    renderDeleteSongs();
                } else if (setlistSection && setlistSection.style.display === 'block') {
                    renderSetlist(praiseSetlistTab.classList.contains('active') ? 'praise' : 'worship');
                } else if (praiseTab && praiseTab.classList.contains('active')) {
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('worship', keyFilter.value, genreFilter.value);
                }
                
                if (songPreviewEl && (songPreviewEl.dataset.songId == newSong._id || songPreviewEl.dataset.songId == newSong.id)) {
                    showPreview(newSong);
                }
                
                showNotification('Song updated successfully!');
                
                if (editSongModal) {
                    editSongModal.style.display = 'none';
                }
                
                editSongForm.reset();
                document.querySelectorAll('#editGenreDropdown .multiselect-option.selected').forEach(opt => opt.classList.remove('selected'));
                updateSelectedGenres('editSelectedGenres', 'editGenreDropdown');
            } catch (err) {
                showNotification('Error updating song: ' + err.message, 4000);
                console.error(err);
            }
        });
    }
    
    // Delete song form submission
    if (deleteSongForm) {
        deleteSongForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const deleteSongId = document.getElementById('deleteSongId');
            if (!deleteSongId) return;
            
            const id = deleteSongId.value;
            await deleteSongFromBackend(id);
        });
    }
    
    if (cancelDeleteSong) {
        cancelDeleteSong.addEventListener('click', () => {
            if (deleteSongModal) deleteSongModal.style.display = 'none';
        });
    }
    
    // Preview scrolling
    if (songPreviewEl) {
        songPreviewEl.addEventListener('wheel', handleUserScroll, { passive: true });
        songPreviewEl.addEventListener('touchmove', handleUserScroll, { passive: true });
    }
    
    // Auto-scroll controls
    if (toggleAutoScrollBtn) {
        toggleAutoScrollBtn.addEventListener('click', toggleAutoScroll);
    }
    
    // Keep screen on button
    if (keepScreenOnBtn) {
        keepScreenOnBtn.addEventListener('click', toggleScreenWakeLock);
    }
    
    if (cancelDeleteAll) {
        cancelDeleteAll.addEventListener('click', () => {
            if (confirmDeleteAllModal) confirmDeleteAllModal.style.display = 'none';
        });
    }
    
    if (confirmDeleteAll) {
        confirmDeleteAll.addEventListener('click', () => {
            songs = [];
            praiseSetlist = [];
            worshipSetlist = [];
            favorites = [];
            saveSongs();
            saveSetlists();
            saveFavorites();
            
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
            
            if (songPreviewEl) {
                songPreviewEl.innerHTML = '<h2>Select a song</h2><div class="song-lyrics"></div>';
                songPreviewEl.dataset.songId = '';
            }
            
            showNotification('All songs have been deleted.');
            
            if (confirmDeleteAllModal) {
                confirmDeleteAllModal.style.display = 'none';
            }
        });
    }
    
    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', function (e) {
            const query = e.target.value.trim().toLowerCase();
            
            if (clearSearchBtn) {
                clearSearchBtn.style.display = query ? 'block' : 'none';
            }
            
            const searchResults = document.getElementById('searchResults');
            const searchResultsContent = document.getElementById('searchResultsContent');
            
            if (!searchResults || !searchResultsContent) return;
            
            if (query.length === 0) {
                searchResults.classList.remove('active');
                
                if (praiseTab && praiseTab.classList.contains('active')) {
                    renderSongs('praise', keyFilter.value, genreFilter.value);
                } else {
                    renderSongs('worship', keyFilter.value, genreFilter.value);
                }
                
                return;
            }
            
            if (query.length > 0) {
                saveSearchQuery(query);
            }
            
            const filtered = songs.filter(song => {
                return (
                    song.title.toLowerCase().includes(query) ||
                    (song.lyrics && song.lyrics.toLowerCase().includes(query)) ||
                    (song.taal && song.taal.toLowerCase().includes(query)) ||
                    (song.genres && song.genres.some(g => g.toLowerCase().includes(query)))
                );
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
                    <div class="search-result-meta">${song.key} | ${song.tempo} | ${song.time} | ${song.genres || ''}</div>
                    ${lyricsSnippet ? `<div class="search-result-snippet">${lyricsSnippet}</div>` : ''}
                `;
                
                resultItem.addEventListener('click', () => {
                    const foundSong = songs.find(s => s.id === song.id);
                    if (foundSong) {
                        showPreview(foundSong);
                        
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
    }
    
    // Clear search button
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (!searchInput) return;
            
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            
            const searchResults = document.getElementById('searchResults');
            if (searchResults) searchResults.classList.remove('active');
            
            const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
            if (searchHistoryDropdown) searchHistoryDropdown.style.display = 'none';
            
            if (praiseTab && praiseTab.classList.contains('active')) {
                renderSongs('praise', keyFilter.value, genreFilter.value);
            } else {
                renderSongs('worship', keyFilter.value, genreFilter.value);
            }
        });
    }
    
    // Search history dropdown
    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim() === '') {
                showSearchHistory();
            }
        });
    }
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
            if (searchHistoryDropdown) searchHistoryDropdown.style.display = 'none';
        }
    });
    
    // Suggested songs
    const toggleSuggestedSongs = document.getElementById('toggleSuggestedSongs');
    if (toggleSuggestedSongs) {
        toggleSuggestedSongs.addEventListener('click', toggleSuggestedSongsDrawer);
    }
    
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            isDarkMode = !isDarkMode;
            localStorage.setItem('darkMode', isDarkMode);
            document.body.classList.toggle('dark-mode');
            
            if (isDarkMode) {
                themeToggle.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
            } else {
                themeToggle.innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
            }
            
            redrawPreviewOnThemeChange();
        });
    }
}

// ====== MAIN INITIALIZATION ======
async function init() {
    // Initialize DOM references
    initDOMReferences();
    
    // Show loading spinner immediately in case not already shown
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    
    // Load current user from localStorage
    try {
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            currentUser = JSON.parse(userStr);
            // If token is missing, add it from jwtToken/localStorage
            if (!currentUser.token) {
                currentUser.token = jwtToken || localStorage.getItem('jwtToken') || null;
                // Save the fixed object back to localStorage
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
            }
        }
    } catch (e) {
        currentUser = null;
    }
    
    window.currentUser = currentUser;
    
    // Load songs from backend
    await loadSongsFromBackend();
    
    // Load user favorites and setlists
    favorites = loadUserFavorites();
    praiseSetlist = loadUserSetlist('praise');
    worshipSetlist = loadUserSetlist('worship');
    
    // Load settings
    loadSettings();
    
    // Setup authentication
    updateAuthUI();
    setupAuthModals();
    
    // Setup admin panel
    setupAdminPanel();
    
    // Setup modals
    setupModalClosing();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup panel toggles
    addPanelToggles();
    
    // Setup screen wake lock
    initScreenWakeLock();
    
    // Setup suggested songs closing
    setupSuggestedSongsClosing();
    
    // Setup tap tempo
    setupTapTempo();
    
    // Apply lyrics background
    applyLyricsBackground(praiseTab && praiseTab.classList.contains('active'));
    
    // Setup mobile swipe navigation
    enableMobileSwipeNavigation();
    
    // Setup window close confirmation
    window.addEventListener('beforeunload', (e) => {
        let unsavedItems = [];
        if (songs.length > 0) unsavedItems.push('Song data');
        if (isAnyModalOpen) unsavedItems.push('Editing in progress');
        
        if (unsavedItems.length > 0) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes: ' + unsavedItems.join(', ') + '. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
    
    // Load suggested songs weights if not already loaded
    if (!sessionStorage.getItem('SUGGESTED_SONGS_WEIGHTS')) {
        try {
            const response = await fetch(`${API_BASE_URL}/suggested-songs-weights`);
            if (response.ok) {
                const weights = await response.json();
                if (typeof weights === 'object') {
                    sessionStorage.setItem('SUGGESTED_SONGS_WEIGHTS', JSON.stringify(weights));
                }
            }
        } catch (error) {
            console.error('Failed to fetch suggested songs weights:', error);
        }
    }
    
    // If user is logged in, fetch their favorites and setlists from backend
    if (currentUser && currentUser.token) {
        try {
            const res = await fetch(`${API_BASE_URL}/userdata`, {
                headers: { 'Authorization': `Bearer ${currentUser.token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (typeof data.favorites !== 'undefined') {
                    favorites = data.favorites;
                }
                
                // Map setlist IDs to full song objects
                if (typeof data.praiseSetlist !== 'undefined') {
                    praiseSetlist = (data.praiseSetlist || []).map(id => songs.find(s => s.id == id)).filter(Boolean);
                }
                
                if (typeof data.worshipSetlist !== 'undefined') {
                    worshipSetlist = (data.worshipSetlist || []).map(id => songs.find(s => s.id == id)).filter(Boolean);
                }
            }
        } catch (err) {
            console.error('Failed to load user data from backend:', err);
        }
    }
    
    // Apply dark mode if enabled
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
        }
    }
    
    // Hide loading overlay
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    
    // Set up memory optimization
    setInterval(optimizeMemoryUsage, 300000);
    
    // Show welcome notification if logged in
    if (currentUser && (currentUser.name || currentUser.email)) {
        showNotification(`Welcome, ${currentUser.name || currentUser.email}!`, 3000);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', function() {
    // All initialization in one place
    populateSelect('songCategory', CATEGORY_OPTIONS, true);
    populateSelect('editSongCategory', CATEGORY_OPTIONS, true);
    populateSelect('songKey', KEY_OPTIONS);
    populateSelect('editSongKey', KEY_OPTIONS);
    populateSelect('songTime', TIME_OPTIONS);
    populateSelect('editSongTime', TIME_OPTIONS);
    populateSelect('songTaal', TAAL_OPTIONS);
    populateSelect('editSongTaal', TAAL_OPTIONS);
    populateMultiselectDropdown('genreDropdown', GENRE_OPTIONS);
    populateMultiselectDropdown('editGenreDropdown', GENRE_OPTIONS);
    populateSelect('keyFilter', KEY_FILTER_OPTIONS, true);
    populateSelect('genreFilter', GENRE_FILTER_OPTIONS, true);
    populateSelect('sortSongs', SORT_SONGS_OPTIONS, true);

    makeToggleDraggable('toggle-sidebar');
    makeToggleDraggable('toggle-songs');
    makeToggleDraggable('toggle-all-panels');

    // Settings modal logic
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                settingsModal.style.display = 'flex';
            }
        });
    }

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            saveSettings();
            showNotification('Settings saved successfully');
            document.getElementById('settingsModal').style.display = 'none';
        });
    }

    // Initialize the application
    init().catch(err => {
        console.error('Initialization failed:', err);
        // Fallback: try to load songs from localStorage
        try {
            const cachedSongs = localStorage.getItem('songs');
            if (cachedSongs) {
                songs = JSON.parse(cachedSongs);
                renderSongs('praise', '', '');
            }
        } catch (e) {
            console.error('Failed to load songs from cache:', e);
        }
    });
});

// Global functions
window.addToSetlist = addToSetlist;
window.editSong = editSong;
window.openDeleteSongModal = openDeleteSongModal;
window.removeFromSetlist = removeFromSetlist;
window.renderSetlist = renderSetlist;
window.previewSong = showPreview;
window.previewSongNoActions = previewSongNoActions;
window.updateSuggestedSongsWeights = function(newWeights) {
    sessionStorage.setItem('SUGGESTED_SONGS_WEIGHTS', JSON.stringify(newWeights));
};

    // Settings modal logic
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                settingsModal.style.display = 'flex';
            }
        });
    }

    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', function (e) {
            e.preventDefault();
            saveSettings();
            showNotification('Settings saved successfully');
            document.getElementById('settingsModal').style.display = 'none';
        });
    }