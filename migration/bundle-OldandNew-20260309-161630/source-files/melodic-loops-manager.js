/**
 * Melodic Loops Manager - Admin Interface JavaScript
 * Handles melodic pad uploads, metadata management, and display
 */

// Dynamic API base URL for local/dev/prod
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : (window.location.hostname.endsWith('github.io')
        ? 'https://oldand-new.vercel.app'
        : window.location.origin);

let melodicFiles = null;
let selectedKey = null;
let currentAudio = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!isAuthenticated()) {
        showAuthenticationWarning();
        return;
    }

    await loadMelodicFiles();
    setupEventListeners();
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
            Please <a href="index.html" style="color: #2c5282; font-weight: bold; text-decoration: underline;">login to the main app</a> first to access Melodic Loops Manager.
        `;
        uploadAlert.className = 'alert alert-error';
        uploadAlert.style.display = 'block';
    }

    const filesAlert = document.getElementById('filesAlert');
    if (filesAlert) {
        filesAlert.innerHTML = `
            <strong><i class="fas fa-info-circle"></i> Login Required</strong><br>
            You can view files but need admin access to upload or delete.
        `;
        filesAlert.className = 'alert alert-info';
        filesAlert.style.display = 'block';
    }

    document.querySelector('.key-selector').style.opacity = '0.5';
    document.querySelector('.key-selector').style.pointerEvents = 'none';
    
    // Still load and display files (read-only mode)
    loadMelodicFiles();
    updateStats();
}

/**
 * Load melodic files from server
 */
async function loadMelodicFiles() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/melodic-loops`);
        if (response.ok) {
            melodicFiles = await response.json();
            displayFiles();
        } else {
            showAlert('filesAlert', 'Failed to load melodic files', 'error');
        }
    } catch (error) {
        console.error('Error loading melodic files:', error);
        showAlert('filesAlert', 'Error loading files: ' + error.message, 'error');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('filesContainer').style.display = 'block';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Key selection buttons
    document.querySelectorAll('.key-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectKey(btn.dataset.key);
        });
    });
}

/**
 * Handle key selection
 */
function selectKey(key) {
    selectedKey = key;
    
    // Update UI
    document.querySelectorAll('.key-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.key === key);
    });
    
    // Show upload section
    const uploadSection = document.getElementById('uploadSection');
    uploadSection.style.display = 'grid';
    
    // Update current file display
    updateCurrentFileDisplay();
    
    // Reset file inputs and buttons
    resetUploadInputs();
}

/**
 * Update current file display for selected key
 */
function updateCurrentFileDisplay() {
    if (!selectedKey || !melodicFiles) return;
    
    const atmosphereFile = melodicFiles.find(f => f.type === 'atmosphere' && f.key === selectedKey);
    const tanpuraFile = melodicFiles.find(f => f.type === 'tanpura' && f.key === selectedKey);
    
    const atmosphereCurrentFile = document.getElementById('atmosphereCurrentFile');
    const tanpuraCurrentFile = document.getElementById('tanpuraCurrentFile');
    
    if (atmosphereFile) {
        atmosphereCurrentFile.textContent = `Current: ${atmosphereFile.filename}`;
        atmosphereCurrentFile.style.display = 'block';
    } else {
        atmosphereCurrentFile.textContent = 'No file uploaded for this key';
        atmosphereCurrentFile.style.display = 'block';
    }
    
    if (tanpuraFile) {
        tanpuraCurrentFile.textContent = `Current: ${tanpuraFile.filename}`;
        tanpuraCurrentFile.style.display = 'block';
    } else {
        tanpuraCurrentFile.textContent = 'No file uploaded for this key';
        tanpuraCurrentFile.style.display = 'block';
    }
}

/**
 * Reset upload inputs and buttons
 */
function resetUploadInputs() {
    ['atmosphere', 'tanpura'].forEach(type => {
        const fileInput = document.getElementById(`${type}File`);
        const uploadBtn = document.getElementById(`upload${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
        const status = document.getElementById(`${type}Status`);
        
        if (fileInput) fileInput.value = '';
        if (uploadBtn) uploadBtn.disabled = true;
        if (status) status.style.display = 'none';
    });
}

/**
 * Handle file selection
 */
function handleFileSelect(type) {
    const fileInput = document.getElementById(`${type}File`);
    const uploadBtn = document.getElementById(`upload${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
    
    if (fileInput.files.length > 0 && selectedKey) {
        uploadBtn.disabled = false;
    } else {
        uploadBtn.disabled = true;
        if (!selectedKey) {
            showAlert('uploadAlert', 'Please select a musical key first', 'warning');
        }
    }
}

/**
 * Upload file
 */
async function uploadFile(type) {
    const fileInput = document.getElementById(`${type}File`);
    const uploadBtn = document.getElementById(`upload${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
    const statusDiv = document.getElementById(`${type}Status`);
    
    const file = fileInput.files[0];
    if (!file) return;
    
    if (!selectedKey) {
        showAlert('uploadAlert', 'Please select a musical key first', 'error');
        return;
    }
    
    // Show uploading state
    statusDiv.textContent = 'Uploading...';
    statusDiv.className = 'upload-status uploading';
    statusDiv.style.display = 'block';
    uploadBtn.disabled = true;
    
    try {
        // Create FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('key', selectedKey);
        formData.append('type', type);
        
        // Upload to server
        const response = await fetch(`${API_BASE_URL}/api/melodic-loops/upload`, {
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
            statusDiv.textContent = '✓ Uploaded successfully';
            statusDiv.className = 'upload-status success';
            fileInput.value = ''; // Clear file input
            uploadBtn.disabled = true;
            
            // Reload files
            await loadMelodicFiles();
            updateStats();
            updateCurrentFileDisplay();
            
            showAlert('uploadAlert', `${type.charAt(0).toUpperCase() + type.slice(1)} pad uploaded successfully for key ${selectedKey}`, 'success');
        } else {
            if (response.status === 401) {
                showAlert('uploadAlert', 'Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                statusDiv.textContent = '✗ Upload failed';
                statusDiv.className = 'upload-status error';
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
        statusDiv.textContent = '✗ Upload error';
        statusDiv.className = 'upload-status error';
        showAlert('uploadAlert', 'Upload error: ' + error.message, 'error');
    } finally {
        uploadBtn.disabled = false;
    }
}

/**
 * Display files in grid
 */
function displayFiles() {
    const filesContainer = document.getElementById('filesList');
    
    if (!melodicFiles || melodicFiles.length === 0) {
        filesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #999; grid-column: 1 / -1;">No melodic files found. Upload your first atmosphere or tanpura pad!</div>';
        return;
    }

    // Group files by key
    const groupedFiles = {};
    melodicFiles.forEach(file => {
        if (!groupedFiles[file.key]) {
            groupedFiles[file.key] = {};
        }
        groupedFiles[file.key][file.type] = file;
    });

    // Sort keys
    const sortedKeys = Object.keys(groupedFiles).sort((a, b) => {
        const keyOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return keyOrder.indexOf(a) - keyOrder.indexOf(b);
    });

    filesContainer.innerHTML = '';

    sortedKeys.forEach(key => {
        const files = groupedFiles[key];
        
        ['atmosphere', 'tanpura'].forEach(type => {
            if (files[type]) {
                const file = files[type];
                const fileCard = document.createElement('div');
                fileCard.className = 'file-card';
                
                fileCard.innerHTML = `
                    <h4>
                        <i class="fas fa-${type === 'atmosphere' ? 'cloud' : 'music'}"></i> 
                        ${type.charAt(0).toUpperCase() + type.slice(1)} Pad
                    </h4>
                    <div class="file-info">
                        <div class="file-info-item">
                            <i class="fas fa-key"></i>
                            <span class="key-badge">${file.key}</span>
                        </div>
                        <div class="file-info-item">
                            <i class="fas fa-file-alt"></i>
                            <span>${file.filename}</span>
                        </div>
                        <div class="file-info-item">
                            <i class="fas fa-clock"></i>
                            <span>${new Date(file.uploadedAt).toLocaleDateString()}</span>
                        </div>
                        <div class="file-info-item">
                            <i class="fas fa-tag"></i>
                            <span class="type-badge ${type}">${type}</span>
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="play-btn" onclick="playAudio('${API_BASE_URL}/loops/melodies/${type}/${file.filename}', this)" title="Play/Pause">
                            <i class="fas fa-play"></i>
                        </button>
                        <input type="file" id="replaceFile-${file.id}" accept="audio/*" style="display: none;" 
                               onchange="handleReplaceFile('${file.id}', this)">
                        <button class="btn btn-warning btn-icon" onclick="document.getElementById('replaceFile-${file.id}').click()" title="Replace">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="btn btn-danger btn-icon" onclick="deleteFile('${file.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                
                filesContainer.appendChild(fileCard);
            }
        });
    });
}

/**
 * Play audio preview
 */
function playAudio(url, button) {
    if (currentAudio) {
        currentAudio.pause();
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.classList.remove('playing');
            btn.querySelector('i').className = 'fas fa-play';
        });
    }

    const icon = button.querySelector('i');
    
    if (currentAudio && currentAudio.src.endsWith(url) && !currentAudio.paused) {
        currentAudio.pause();
        button.classList.remove('playing');
        icon.className = 'fas fa-play';
    } else {
        currentAudio = new Audio(url);
        currentAudio.play();
        button.classList.add('playing');
        icon.className = 'fas fa-pause';

        currentAudio.addEventListener('ended', () => {
            button.classList.remove('playing');
            icon.className = 'fas fa-play';
        });
    }
}

/**
 * Handle replace file selection
 */
function handleReplaceFile(fileId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    
    if (!confirm(`Replace this melodic file with "${file.name}"? The original file will be permanently deleted.`)) {
        fileInput.value = ''; // Clear the selection
        return;
    }
    
    replaceMelodicFile(fileId, file);
}

/**
 * Replace melodic file
 */
async function replaceMelodicFile(fileId, file) {
    try {
        // Show loading state
        showAlert('filesAlert', 'Replacing melodic file...', 'info');
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`${API_BASE_URL}/api/melodic-loops/${fileId}/replace`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            },
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert('filesAlert', `${result.message}: ${result.filename}`, 'success');
            await loadMelodicFiles();
            updateStats();
            updateCurrentFileDisplay();
        } else {
            if (response.status === 401) {
                showAlert('filesAlert', 'Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                const result = await response.json();
                showAlert('filesAlert', result.error || 'Failed to replace melodic file', 'error');
            }
        }
    } catch (error) {
        console.error('Replace error:', error);
        showAlert('filesAlert', 'Replace error: ' + error.message, 'error');
    }
}

/**
 * Delete file
 */
async function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this melodic file? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/melodic-loops/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
            }
        });

        if (response.ok) {
            showAlert('filesAlert', 'File deleted successfully', 'success');
            await loadMelodicFiles();
            updateStats();
            updateCurrentFileDisplay();
        } else {
            if (response.status === 401) {
                showAlert('filesAlert', 'Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                const result = await response.json();
                showAlert('filesAlert', result.error || 'Failed to delete file', 'error');
            }
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('filesAlert', 'Delete error: ' + error.message, 'error');
    }
}

/**
 * Update statistics
 */
function updateStats() {
    if (!melodicFiles) {
        return;
    }

    const atmosphereCount = melodicFiles.filter(f => f.type === 'atmosphere').length;
    const tanpuraCount = melodicFiles.filter(f => f.type === 'tanpura').length;
    const uniqueKeys = new Set(melodicFiles.map(f => f.key)).size;
    const totalFiles = melodicFiles.length;

    document.getElementById('totalAtmosphere').textContent = atmosphereCount;
    document.getElementById('totalTanpura').textContent = tanpuraCount;
    document.getElementById('totalKeys').textContent = uniqueKeys;
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