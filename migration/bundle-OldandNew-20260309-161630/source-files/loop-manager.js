/**
 * Loop Manager - Admin Interface JavaScript
 * Handles loop file uploads, metadata management, and display
 */

// Dynamic API base URL for local/dev/prod
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : (window.location.hostname.endsWith('github.io')
        ? 'https://oldand-new.vercel.app'
        : window.location.origin);

let loopsMetadata = null;
let songMetadata = null;
let currentAudio = null;

function normalizeRhythmFamily(value) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '');
}

function buildRhythmSetId(rhythmFamily, rhythmSetNo) {
    const family = normalizeRhythmFamily(rhythmFamily);
    const setNo = parseInt(rhythmSetNo, 10);
    if (!family || !Number.isInteger(setNo) || setNo <= 0) return '';
    return `${family}_${setNo}`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!isAuthenticated()) {
        showAuthenticationWarning();
        return;
    }

    await loadSongMetadata();
    await loadLoopsMetadata();
    setupEventListeners();
    updateFilenamePreview();
    updateStats();
});

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    const token = localStorage.getItem('jwtToken');
    return token && token.length > 0;
}

/**
 * Show authentication warning
 */
function showAuthenticationWarning() {
    const uploadAlert = document.getElementById('uploadAlert');
    if (uploadAlert) {
        uploadAlert.innerHTML = `
            <strong><i class="fas fa-lock"></i> Authentication Required</strong><br>
            Please <a href="index.html" style="color: #2c5282; font-weight: bold; text-decoration: underline;">login to the main app</a> first to access Loop Manager.
        `;
        uploadAlert.className = 'alert alert-error';
        uploadAlert.style.display = 'block';
    }

    const loopsAlert = document.getElementById('loopsAlert');
    if (loopsAlert) {
        loopsAlert.innerHTML = `
            <strong><i class="fas fa-info-circle"></i> Login Required</strong><br>
            You can view loops but need admin access to upload or delete.
        `;
        loopsAlert.className = 'alert alert-info';
        loopsAlert.style.display = 'block';
    }

    document.getElementById('uploadForm').style.opacity = '0.5';
    document.getElementById('uploadForm').style.pointerEvents = 'none';
    
    // Still load and display loops (read-only mode)
    loadSongMetadata();
    loadLoopsMetadata();
    updateStats();
}

/**
 * Load song metadata (taals, times, genres from main.js)
 */
async function loadSongMetadata() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/song-metadata`);
        if (response.ok) {
            songMetadata = await response.json();
            populateDropdowns();
        } else {
            showAlert('uploadAlert', 'Failed to load song metadata', 'error');
        }
    } catch (error) {
        console.error('Error loading song metadata:', error);
    }
}

/**
 * Populate dropdowns with song metadata
 */
function populateDropdowns() {
    if (!songMetadata) return;

    // Populate Rhythm Family dropdown (source-of-truth from metadata/rhythm sets)
    const rhythmFamilySelect = document.getElementById('rhythmFamilyInput');
    const rhythmFamilies = Array.isArray(songMetadata.rhythmFamilies)
        ? songMetadata.rhythmFamilies
        : [];

    rhythmFamilySelect.innerHTML = '<option value="">Select Rhythm Family</option>';
    Array.from(new Set(rhythmFamilies)).sort().forEach(family => {
        const option = document.createElement('option');
        option.value = family;
        option.textContent = family;
        rhythmFamilySelect.appendChild(option);
    });

    // Keep Taal auto-synced with Rhythm Family for consistent mapping.
    const taalSelect = document.getElementById('taalInput');
    taalSelect.innerHTML = '<option value="">Auto from Rhythm Family</option>';
    taalSelect.disabled = true;

    syncTaalWithRhythmFamily();

    // Populate Time Signature dropdown
    const timeSelect = document.getElementById('timeInput');
    timeSelect.innerHTML = '<option value="">Select Time</option>';
    songMetadata.times.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        timeSelect.appendChild(option);
    });

    // Populate Genre dropdown with musical genres only
    const genreSelect = document.getElementById('genreInput');
    genreSelect.innerHTML = '<option value="">Select Genre</option>';
    songMetadata.musicalGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre.toLowerCase();
        option.textContent = genre;
        genreSelect.appendChild(option);
    });
}

/**
 * Load loops metadata from server
 */
async function loadLoopsMetadata() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/loops/metadata`);
        if (response.ok) {
            loopsMetadata = await response.json();
            displayLoops();
        } else {
            showAlert('loopsAlert', 'Failed to load loops metadata', 'error');
        }
    } catch (error) {
        console.error('Error loading loops:', error);
        showAlert('loopsAlert', 'Error loading loops: ' + error.message, 'error');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('loopsTableContainer').style.display = 'block';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Filename preview updater
    document.getElementById('rhythmFamilyInput').addEventListener('change', () => {
        syncTaalWithRhythmFamily();
        updateFilenamePreview();
    });
    document.getElementById('rhythmSetNoInput').addEventListener('input', updateFilenamePreview);
    document.getElementById('timeInput').addEventListener('change', updateFilenamePreview);
    document.getElementById('tempoInput').addEventListener('change', updateFilenamePreview);
    document.getElementById('genreInput').addEventListener('change', updateFilenamePreview);

    // Upload form submission
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
}

function syncTaalWithRhythmFamily() {
    const rhythmFamily = normalizeRhythmFamily(document.getElementById('rhythmFamilyInput').value || '');
    const taalSelect = document.getElementById('taalInput');
    if (!taalSelect) return rhythmFamily;

    taalSelect.innerHTML = '<option value="">Auto from Rhythm Family</option>';
    if (rhythmFamily) {
        const option = document.createElement('option');
        option.value = rhythmFamily;
        option.textContent = rhythmFamily;
        option.selected = true;
        taalSelect.appendChild(option);
        taalSelect.value = rhythmFamily;
    }

    return rhythmFamily;
}

/**
 * Update filename preview as user selects conditions
 */
function updateFilenamePreview() {
    const rhythmFamily = document.getElementById('rhythmFamilyInput').value;
    const rhythmSetNo = document.getElementById('rhythmSetNoInput').value;
    const taal = normalizeRhythmFamily(rhythmFamily);
    const time = document.getElementById('timeInput').value.replace('/', '_');
    const tempo = document.getElementById('tempoInput').value;
    const genre = document.getElementById('genreInput').value;
    const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);

    const preview = document.getElementById('filenamePreview');
    
    if (rhythmSetId && time && tempo && genre) {
        const pattern = `${taal}_${time}_${tempo}_${genre}`;
        preview.innerHTML = `
            <div style="margin-bottom: 8px; color: #2d3748; font-size: 0.95em;">Rhythm Set: <strong>${rhythmSetId}</strong></div>
            <div style="margin-bottom: 10px; color: #667eea; font-size: 1.1em;">${pattern}_TYPE#.wav</div>
            <div style="font-size: 0.85em; color: #666;">
                <div>• ${pattern}_LOOP1.wav</div>
                <div>• ${pattern}_LOOP2.wav</div>
                <div>• ${pattern}_LOOP3.wav</div>
                <div>• ${pattern}_FILL1.wav</div>
                <div>• ${pattern}_FILL2.wav</div>
                <div>• ${pattern}_FILL3.wav</div>
            </div>
        `;
        
        // Enable upload buttons for slots that have files selected
        for (let i = 1; i <= 6; i++) {
            const fileInput = document.getElementById(`loopFile${i}`);
            const uploadBtn = document.getElementById(`uploadBtn${i}`);
            if (fileInput && fileInput.files.length > 0 && uploadBtn) {
                uploadBtn.disabled = false;
            }
        }
    } else {
        preview.textContent = 'Select rhythm family, set number, and all loop conditions above';
        
        // Disable all upload buttons
        for (let i = 1; i <= 6; i++) {
            const uploadBtn = document.getElementById(`uploadBtn${i}`);
            if (uploadBtn) {
                uploadBtn.disabled = true;
            }
        }
    }
}

/**
 * Handle individual file upload slot
 * Enables/disables upload button when file is selected
 */
function handleIndividualUpload(slotNumber, type) {
    const fileInput = document.getElementById(`loopFile${getSlotId(slotNumber, type)}`);
    const uploadBtn = document.getElementById(`uploadBtn${getSlotId(slotNumber, type)}`);
    
    if (fileInput.files.length > 0) {
        // Check if all conditions are selected
        const rhythmFamily = document.getElementById('rhythmFamilyInput').value;
        const rhythmSetNo = document.getElementById('rhythmSetNoInput').value;
        const time = document.getElementById('timeInput').value;
        const tempo = document.getElementById('tempoInput').value;
        const genre = document.getElementById('genreInput').value;
        const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);
        
        if (rhythmSetId && time && tempo && genre) {
            uploadBtn.disabled = false;
        } else {
            uploadBtn.disabled = true;
            showAlert('uploadAlert', 'Please select rhythm family, set no, time signature, tempo, and genre first', 'warning');
        }
    } else {
        uploadBtn.disabled = true;
    }
}

/**
 * Get slot ID (1-6) from number and type
 */
function getSlotId(number, type) {
    if (type === 'loop') {
        return number; // 1, 2, 3
    } else {
        return number + 3; // 4, 5, 6
    }
}

/**
 * Upload a single file with automatic renaming
 */
async function uploadSingleFile(slotNumber, type) {
    const slotId = getSlotId(slotNumber, type);
    const fileInput = document.getElementById(`loopFile${slotId}`);
    const uploadBtn = document.getElementById(`uploadBtn${slotId}`);
    const statusSpan = document.getElementById(`status${slotId}`);
    
    const file = fileInput.files[0];
    if (!file) return;
    
    // Get form values
    const rhythmFamily = document.getElementById('rhythmFamilyInput').value;
    const rhythmSetNo = document.getElementById('rhythmSetNoInput').value;
    const taal = normalizeRhythmFamily(rhythmFamily);
    const time = document.getElementById('timeInput').value;
    const tempo = document.getElementById('tempoInput').value;
    const genre = document.getElementById('genreInput').value;
    const description = document.getElementById('descriptionInput').value;
    const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);
    
    // Validate
    if (!rhythmSetId || !time || !tempo || !genre) {
        showAlert('uploadAlert', 'Please select rhythm family, set no, and all conditions (time, tempo, genre)', 'error');
        return;
    }
    
    // Show uploading state
    statusSpan.textContent = 'Uploading...';
    statusSpan.className = 'upload-status uploading';
    uploadBtn.disabled = true;
    
    try {
        // Create FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('rhythmFamily', rhythmFamily);
        formData.append('rhythmSetNo', rhythmSetNo);
        formData.append('taal', taal);
        formData.append('timeSignature', time);
        formData.append('tempo', tempo);
        formData.append('genre', genre);
        formData.append('type', type);
        formData.append('number', slotNumber);
        formData.append('description', description);
        
        // Upload to server
        const response = await fetch(`${API_BASE_URL}/api/loops/upload-single`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: formData
        });
        
        let result;
        const contentType = response.headers.get('content-type');
        
        try {
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                // Handle non-JSON response (like HTML error pages)
                const text = await response.text();
                result = { 
                    error: `Server error (${response.status})`,
                    details: text.length > 200 ? text.substring(0, 200) + '...' : text
                };
            }
        } catch (parseError) {
            result = { 
                error: `Failed to parse server response (${response.status})`,
                details: parseError.message
            };
        }
        
        if (response.ok) {
            statusSpan.textContent = '✓ Uploaded';
            statusSpan.className = 'upload-status success';
            fileInput.value = ''; // Clear file input
            
            // Reload loops
            await loadLoopsMetadata();
            updateStats();
        } else {
            if (response.status === 401) {
                showAlert('uploadAlert', 'Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else if (response.status === 501) {
                // Handle serverless limitation
                statusSpan.textContent = '✗ Not Supported';
                statusSpan.className = 'upload-status error';
                showAlert('uploadAlert', result.error + '\n\n' + (result.message || '') + '\n\n' + (result.suggestion || ''), 'error');
            } else {
                statusSpan.textContent = '✗ Failed';
                statusSpan.className = 'upload-status error';
                const errorMsg = result.error || result.message || `Server error (${response.status})`;
                showAlert('uploadAlert', errorMsg, 'error');
                
                // Log details for debugging
                if (result.details) {
                    console.error('Upload error details:', result.details);
                }
            }
        }
    } catch (error) {
        console.error('Upload error:', error);
        statusSpan.textContent = '✗ Error';
        statusSpan.className = 'upload-status error';
        showAlert('uploadAlert', 'Upload error: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
    }
}

/**
 * Handle loop set upload (DEPRECATED - now using individual uploads)
 */
async function handleUpload(event) {
    event.preventDefault();
    showAlert('uploadAlert', 'Please use the individual upload buttons for each file', 'info');
}

/**
 * Display loops in table
 */
function displayLoops() {
    if (!loopsMetadata || !loopsMetadata.loops) {
        document.getElementById('loopsTableBody').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">No loops found. Upload your first loop set!</td></tr>';
        return;
    }

    const resolveLoopRhythmSetId = (loop) => {
        if (loop.rhythmSetId) return String(loop.rhythmSetId).toLowerCase();
        const family = normalizeRhythmFamily(loop.rhythmFamily || loop.conditions?.taal || '');
        const setNo = parseInt(loop.rhythmSetNo || loop.setNo || 1, 10);
        return buildRhythmSetId(family, setNo) || 'unmapped';
    };

    // Group loops by rhythm set
    const loopSets = {};
    loopsMetadata.loops.forEach(loop => {
        const key = resolveLoopRhythmSetId(loop);
        if (!loopSets[key]) {
            loopSets[key] = {
                rhythmSetId: key,
                conditions: loop.conditions,
                rhythmFamily: loop.rhythmFamily || loop.conditions?.taal || '',
                rhythmSetNo: loop.rhythmSetNo || loop.setNo || 1,
                loops: []
            };
        }
        loopSets[key].loops.push(loop);
    });

    const tbody = document.getElementById('loopsTableBody');
    tbody.innerHTML = '';

    Object.entries(loopSets).forEach(([key, set]) => {
        set.loops.forEach((loop, index) => {
            const tr = document.createElement('tr');
            
            // Filename
            const tdFile = document.createElement('td');
            tdFile.innerHTML = `<strong>${loop.filename}</strong>`;
            tr.appendChild(tdFile);

            // Type badge
            const tdType = document.createElement('td');
            tdType.innerHTML = `<span class="badge badge-${loop.type}">${loop.type.toUpperCase()} ${loop.number}</span>`;
            tr.appendChild(tdType);

            // Conditions (only show for first file in set)
            const tdConditions = document.createElement('td');
            if (index === 0) {
                tdConditions.innerHTML = `
                    <div class="conditions-display">
                        <span class="badge" style="background: #edf2f7; color: #1a202c;">${set.rhythmSetId}</span>
                        <span class="badge" style="background: #e6f2ff; color: #004085;">${set.rhythmFamily || set.conditions.taal}</span>
                        <span class="badge" style="background: #fff3cd; color: #856404;">${set.conditions.timeSignature}</span>
                        <span class="badge badge-tempo-${set.conditions.tempo}">${set.conditions.tempo}</span>
                        <span class="badge" style="background: #d1ecf1; color: #0c5460;">${set.conditions.genre}</span>
                    </div>
                `;
                tdConditions.rowSpan = set.loops.length;
            }
            if (index === 0) tr.appendChild(tdConditions);

            // Audio preview
            const tdPreview = document.createElement('td');
            tdPreview.innerHTML = `
                <div class="audio-preview">
                    <button class="play-btn" onclick="playAudio('/loops/${loop.filename}', this)">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            `;
            tr.appendChild(tdPreview);

            // Actions
            const tdActions = document.createElement('td');
            tdActions.innerHTML = `
                <div class="action-btns">
                    <input type="file" id="replaceFile-${loop.id}" accept="audio/*" style="display: none;" 
                           onchange="handleReplaceFile('${loop.id}', this)">
                    <button class="btn btn-warning btn-icon" onclick="document.getElementById('replaceFile-${loop.id}').click()" title="Replace">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="btn btn-danger btn-icon" onclick="deleteLoop('${loop.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        });
    });
}

/**
 * Play audio preview
 */
function playAudio(url, button) {
    if (currentAudio) {
        currentAudio.pause();
        document.querySelectorAll('.play-btn i').forEach(icon => {
            icon.className = 'fas fa-play';
        });
    }

    const icon = button.querySelector('i');
    
    if (currentAudio && currentAudio.src.endsWith(url) && !currentAudio.paused) {
        currentAudio.pause();
        icon.className = 'fas fa-play';
    } else {
        currentAudio = new Audio(url);
        currentAudio.play();
        icon.className = 'fas fa-pause';

        currentAudio.addEventListener('ended', () => {
            icon.className = 'fas fa-play';
        });
    }
}

/**
 * Handle replace file selection
 */
function handleReplaceFile(loopId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    if (!confirm(`Replace this loop with "${file.name}"? The original file will be permanently deleted.`)) {
        fileInput.value = ''; // Clear the selection
        return;
    }
    
    replaceLoop(loopId, file);
}

/**
 * Replace loop file
 */
async function replaceLoop(loopId, file) {
    try {
        // Show loading state
        showAlert('loopsAlert', 'Replacing loop file...', 'info');
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/loops/${loopId}/replace`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert('loopsAlert', `Loop replaced successfully: ${result.filename}`, 'success');
            await loadLoopsMetadata();
            updateStats();
        } else {
            if (response.status === 401) {
                showAlert('loopsAlert', 'Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                const result = await response.json();
                showAlert('loopsAlert', result.error || 'Failed to replace loop', 'error');
            }
        }
    } catch (error) {
        console.error('Replace error:', error);
        showAlert('loopsAlert', 'Replace error: ' + error.message, 'error');
    }
}

/**
 * Delete loop file
 */
async function deleteLoop(loopId) {
    if (!confirm('Are you sure you want to delete this loop? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/loops/${loopId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });

        if (response.ok) {
            showAlert('loopsAlert', 'Loop deleted successfully', 'success');
            await loadLoopsMetadata();
            updateStats();
        } else {
            if (response.status === 401) {
                showAlert('loopsAlert', 'Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                const result = await response.json();
                showAlert('loopsAlert', result.error || 'Failed to delete loop', 'error');
            }
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('loopsAlert', 'Delete error: ' + error.message, 'error');
    }
}

/**
 * Update statistics
 */
function updateStats() {
    if (!loopsMetadata || !loopsMetadata.loops) {
        return;
    }

    // Total loop sets (groups of 6)
    const loopSets = new Set();
    loopsMetadata.loops.forEach(loop => {
        const key = loop.rhythmSetId || buildRhythmSetId(loop.rhythmFamily || loop.conditions?.taal || '', loop.rhythmSetNo || loop.setNo || 1);
        loopSets.add(key);
    });

    // Unique rhythm families
    const taals = new Set(loopsMetadata.loops.map(l => normalizeRhythmFamily(l.rhythmFamily || l.conditions?.taal || '')).filter(Boolean));

    // Unique genres
    const genres = new Set(loopsMetadata.loops.map(l => l.conditions.genre));

    // Total files
    const totalFiles = loopsMetadata.loops.length;

    document.getElementById('totalLoops').textContent = loopSets.size;
    document.getElementById('totalTaals').textContent = taals.size;
    document.getElementById('totalGenres').textContent = genres.size;
    document.getElementById('totalFiles').textContent = totalFiles;
}

/**
 * Show alert message
 */
function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';

    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}
