// Rhythm Mapper - Song Assignment Only
const API_BASE_URL = window.AppApiBase.resolve();

let songs = [];
let rhythmSets = [];
let selectedSongIds = new Set();

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadSongs(), loadRhythmSets()]);
    populateFilters();
    renderSongsTable();
});

async function authFetch(url, options = {}) {
    const response = await window.AppAuth.authFetch(url, {
        ...options,
        suppressAuthRedirect: true,
        loginUrl: 'index.html'
    });

    if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;

        try {
            const errorPayload = await response.clone().json();
            errorMessage = errorPayload.error || errorPayload.message || errorMessage;
        } catch (jsonError) {
            try {
                const errorText = await response.clone().text();
                if (errorText) {
                    errorMessage = errorText;
                }
            } catch (textError) {
                // Keep status-based message.
            }
        }

        throw new Error(errorMessage);
    }

    return response;
}

function handleAuthRequired() {
    showAlert('Session expired. Please login again.', 'error');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

async function loadSongs() {
    try {
        const response = await authFetch(`${API_BASE_URL}/api/songs`);
        songs = await response.json();
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert('Error loading songs: ' + error.message, 'error');
    }
}

async function loadRhythmSets() {
    try {
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`);
        rhythmSets = await response.json();
        populateRhythmSetSelect();
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert('Error loading rhythm sets: ' + error.message, 'error');
    }
}

function populateRhythmSetSelect() {
    const select = document.getElementById('rhythmSetSelect');
    select.innerHTML = '<option value="">Select a rhythm set...</option>';
    
    rhythmSets.sort((a, b) => {
        if (a.rhythmFamily !== b.rhythmFamily) {
            return a.rhythmFamily.localeCompare(b.rhythmFamily);
        }
        return a.rhythmSetNo - b.rhythmSetNo;
    });

    rhythmSets.forEach(set => {
        const option = document.createElement('option');
        option.value = set.rhythmSetId;
        option.textContent = `${set.rhythmSetId} (${set.availableFiles?.length || 0}/6 loops)`;
        select.appendChild(option);
    });
}

function populateFilters() {
    // Populate Taal filter
    const taals = [...new Set(songs.map(s => s.taal).filter(Boolean))].sort();
    const taalSelect = document.getElementById('filterTaal');
    taals.forEach(taal => {
        const option = document.createElement('option');
        option.value = taal;
        option.textContent = taal;
        taalSelect.appendChild(option);
    });

    // Populate Key filter
    const keys = [...new Set(songs.map(s => s.key).filter(Boolean))].sort();
    const keySelect = document.getElementById('filterKey');
    keys.forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        keySelect.appendChild(option);
    });

    // Populate Rhythm Set filter
    const rhythms = [...new Set(songs.map(s => s.rhythmSetId).filter(Boolean))].sort();
    const rhythmSelect = document.getElementById('filterRhythm');
    const unmappedOption = rhythmSelect.querySelector('option[value="UNMAPPED"]');
    rhythms.forEach(rhythm => {
        const option = document.createElement('option');
        option.value = rhythm;
        option.textContent = rhythm;
        rhythmSelect.appendChild(option);
    });
}

function filterSongs() {
    const search = document.getElementById('songSearch').value.toLowerCase();
    const taalFilter = document.getElementById('filterTaal').value;
    const keyFilter = document.getElementById('filterKey').value;
    const rhythmFilter = document.getElementById('filterRhythm').value;

    const filtered = songs.filter(song => {
        const matchSearch = !search || 
            song.title?.toLowerCase().includes(search) ||
            song.id?.toString().includes(search);
        
        const matchTaal = !taalFilter || song.taal === taalFilter;
        const matchKey = !keyFilter || song.key === keyFilter;
        
        let matchRhythm = true;
        if (rhythmFilter === 'UNMAPPED') {
            matchRhythm = !song.rhythmSetId;
        } else if (rhythmFilter) {
            matchRhythm = song.rhythmSetId === rhythmFilter;
        }

        return matchSearch && matchTaal && matchKey && matchRhythm;
    });

    renderSongsTable(filtered);
}

function renderSongsTable(songsToRender = songs) {
    const tbody = document.getElementById('songsTableBody');
    
    if (songsToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No songs found</td></tr>';
        return;
    }

    tbody.innerHTML = songsToRender.map(song => {
        const safeSongId = Number(song.id);
        if (!Number.isFinite(safeSongId)) {
            return '';
        }

        const safeTempo = escapeHtml(song.tempo || '-');

        return `
        <tr>
            <td class="checkbox-cell">
                <input type="checkbox" 
                       data-song-id="${safeSongId}" 
                       ${selectedSongIds.has(safeSongId) ? 'checked' : ''}
                       onchange="toggleSongSelection(${safeSongId}, this.checked)">
            </td>
            <td>${escapeHtml(song.title || 'Untitled')}</td>
            <td>${escapeHtml(song.taal || '-')}</td>
            <td>${escapeHtml(song.key || '-')}</td>
            <td>${safeTempo} BPM</td>
            <td>
                ${song.rhythmSetId 
                    ? `<span class="badge badge-success">${escapeHtml(song.rhythmSetId)}</span>`
                    : '<span class="badge badge-warning">Not Assigned</span>'
                }
            </td>
            <td>
                <button class="btn btn-secondary" onclick="clearSongMapping(${safeSongId})" ${!song.rhythmSetId ? 'disabled' : ''}>
                    <i class="fas fa-unlink"></i> Clear
                </button>
            </td>
        </tr>
    `;
    }).join('');

    updateHeaderCheckbox();
}

function toggleSongSelection(songId, checked) {
    if (checked) {
        selectedSongIds.add(Number(songId));
    } else {
        selectedSongIds.delete(Number(songId));
    }
    updateHeaderCheckbox();
}

function toggleAllCheckboxes(headerCheckbox) {
    const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const songId = Number(cb.dataset.songId);
        if (headerCheckbox.checked) {
            selectedSongIds.add(songId);
            cb.checked = true;
        } else {
            selectedSongIds.delete(songId);
            cb.checked = false;
        }
    });
}

function updateHeaderCheckbox() {
    const headerCheckbox = document.getElementById('headerCheckbox');
    const visibleCheckboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    const visibleChecked = Array.from(visibleCheckboxes).filter(cb => cb.checked);

    if (visibleCheckboxes.length === 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    } else if (visibleChecked.length === 0) {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = false;
    } else if (visibleChecked.length === visibleCheckboxes.length) {
        headerCheckbox.checked = true;
        headerCheckbox.indeterminate = false;
    } else {
        headerCheckbox.checked = false;
        headerCheckbox.indeterminate = true;
    }
}

function selectAllSongs() {
    const visibleCheckboxes = document.querySelectorAll('tbody input[type="checkbox"]');
    visibleCheckboxes.forEach(cb => {
        selectedSongIds.add(Number(cb.dataset.songId));
        cb.checked = true;
    });
    updateHeaderCheckbox();
}

function clearSelection() {
    selectedSongIds.clear();
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateHeaderCheckbox();
}

async function assignRhythmSet() {
    if (selectedSongIds.size === 0) {
        showAlert('Please select at least one song', 'error');
        return;
    }

    const rhythmSetId = document.getElementById('rhythmSetSelect').value;
    if (!rhythmSetId) {
        showAlert('Please select a rhythm set', 'error');
        return;
    }

    const rhythmSet = rhythmSets.find(r => r.rhythmSetId === rhythmSetId);
    if (!rhythmSet) {
        showAlert('Invalid rhythm set selected', 'error');
        return;
    }

    // Show loader
    showAlert(`Assigning rhythm set ${rhythmSetId}...`, 'success');
    
    let successCount = 0;
    let failCount = 0;
    const songIdsArray = Array.from(selectedSongIds);

    for (const songId of songIdsArray) {
        try {
            console.log(`Assigning song ${songId} to ${rhythmSetId}...`);
            
            const response = await authFetch(`${API_BASE_URL}/api/songs/${songId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rhythmSetId: rhythmSet.rhythmSetId,
                    rhythmFamily: rhythmSet.rhythmFamily,
                    rhythmSetNo: rhythmSet.rhythmSetNo
                })
            });

            const updatedSong = await response.json();
            console.log(`Successfully assigned song ${songId}:`, updatedSong);

            successCount++;
            // Update the song object in memory immediately
            const song = songs.find(s => parseInt(s.id) === parseInt(songId));
            if (song) {
                song.rhythmSetId = rhythmSet.rhythmSetId;
                song.rhythmFamily = rhythmSet.rhythmFamily;
                song.rhythmSetNo = rhythmSet.rhythmSetNo;
                console.log(`Updated in-memory song ${songId}:`, song);
            } else {
                console.warn(`Song ${songId} not found in memory`);
            }
        } catch (error) {
            if (error.message === 'AUTH_REQUIRED') {
                handleAuthRequired();
                return;
            }
            console.error(`Error assigning song ${songId}:`, error);
            failCount++;
        }
    }

    // Show final result
    const resultMessage = successCount > 0
        ? `Assigned ${successCount} song(s) successfully.${failCount > 0 ? ` Failed: ${failCount}` : ''}`
        : `Failed to assign songs. Failed: ${failCount}`;
    
    showAlert(resultMessage, successCount > 0 ? 'success' : 'error');
    
    console.log(`Assignment complete: ${successCount} success, ${failCount} failed`);
    
    // Reload songs from server to ensure data consistency
    await loadSongs();
    
    console.log('Songs reloaded, clearing selection and re-rendering...');
    
    // Clear selection and re-render the table
    clearSelection();
    
    // Force re-render with current filter state
    filterSongs();
    
    console.log('Table re-rendered');
}

async function unassignRhythmSet() {
    if (selectedSongIds.size === 0) {
        showAlert('Please select at least one song', 'error');
        return;
    }

    if (!confirm(`Unassign rhythm set from ${selectedSongIds.size} selected song(s)?\n\nThis will remove their rhythm set assignment and they will use automatic rhythm matching instead.`)) {
        return;
    }

    // Show loader
    showAlert('Unassigning rhythm sets...', 'success');
    
    let successCount = 0;
    let failCount = 0;
    const songIdsArray = Array.from(selectedSongIds);

    for (const songId of songIdsArray) {
        try {
            console.log(`Unassigning song ${songId}...`);
            
            const response = await authFetch(`${API_BASE_URL}/api/songs/${songId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rhythmSetId: null,
                    rhythmFamily: null,
                    rhythmSetNo: null
                })
            });

            const updatedSong = await response.json();
            console.log(`Successfully unassigned song ${songId}:`, updatedSong);

            successCount++;
            // Update the song object in memory immediately
            const song = songs.find(s => parseInt(s.id) === parseInt(songId));
            if (song) {
                song.rhythmSetId = null;
                song.rhythmFamily = null;
                song.rhythmSetNo = null;
                console.log(`Updated in-memory song ${songId}:`, song);
            } else {
                console.warn(`Song ${songId} not found in memory`);
            }
        } catch (error) {
            if (error.message === 'AUTH_REQUIRED') {
                handleAuthRequired();
                return;
            }
            console.error(`Error unassigning song ${songId}:`, error);
            failCount++;
        }
    }

    // Show final result
    const resultMessage = successCount > 0 
        ? `Unassigned ${successCount} song(s) successfully.${failCount > 0 ? ` Failed: ${failCount}` : ''}` 
        : `Failed to unassign songs. Failed: ${failCount}`;
    
    showAlert(resultMessage, successCount > 0 ? 'success' : 'error');
    
    console.log(`Unassign complete: ${successCount} success, ${failCount} failed`);
    
    // Reload songs from server to ensure data consistency
    await loadSongs();
    
    console.log('Songs reloaded, clearing selection and re-rendering...');
    
    // Clear selection and re-render the table
    clearSelection();
    
    // Force re-render with current filter state
    filterSongs();
    
    console.log('Table re-rendered');
}

async function clearSongMapping(songId) {
    if (!confirm('Clear rhythm set assignment for this song?')) {
        return;
    }

    // Show loader
    showAlert('Clearing rhythm set assignment...', 'success');
    
    try {
        console.log(`Clearing mapping for song ${songId}...`);
        
        const response = await authFetch(`${API_BASE_URL}/api/songs/${songId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rhythmSetId: null,
                rhythmFamily: null,
                rhythmSetNo: null
            })
        });

        const updatedSong = await response.json();
        console.log(`Successfully cleared song ${songId}:`, updatedSong);

        // Update the song object in memory immediately
        const song = songs.find(s => parseInt(s.id) === parseInt(songId));
        if (song) {
            song.rhythmSetId = null;
            song.rhythmFamily = null;
            song.rhythmSetNo = null;
            console.log(`Updated in-memory song ${songId}:`, song);
        } else {
            console.warn(`Song ${songId} not found in memory`);
        }

        showAlert('Rhythm set cleared successfully', 'success');

        // Reload songs from server to ensure data consistency
        await loadSongs();

        console.log('Songs reloaded, re-rendering...');

        // Force re-render with current filter state
        filterSongs();

        console.log('Table re-rendered');
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        console.error('Error clearing mapping:', error);
        showAlert('Error: ' + error.message, 'error');
    }
}

function showAlert(message, type) {
    window.AdminPage.showAlert('alertBox', message, type);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
