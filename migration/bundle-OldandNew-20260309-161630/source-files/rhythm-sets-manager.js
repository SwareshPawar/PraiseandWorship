const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : (window.location.hostname.endsWith('github.io')
        ? 'https://oldand-new.vercel.app'
        : window.location.origin);

const RHYTHM_FILE_ORDER = ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'];

let songs = [];
let rhythmSets = [];
let filteredSongs = [];
let loopsByRhythmSet = new Map();
let selectedSongId = null;
let currentAudio = null;

function applyThemeFromStorage() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
}

function getAuthToken() {
    return localStorage.getItem('jwtToken') || '';
}

function isAuthenticated() {
    return Boolean(getAuthToken());
}

function normalizeRhythmFamily(value) {
    if (typeof value !== 'string') return '';
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '');
}

function parseRhythmSetId(rhythmSetId) {
    const match = String(rhythmSetId || '').trim().toLowerCase().match(/^([a-z0-9_-]+)_([0-9]+)$/);
    if (!match) return null;
    return {
        rhythmFamily: normalizeRhythmFamily(match[1]),
        rhythmSetNo: parseInt(match[2], 10),
        rhythmSetId: `${normalizeRhythmFamily(match[1])}_${parseInt(match[2], 10)}`
    };
}

function buildRhythmSetId(rhythmFamily, rhythmSetNo) {
    const parsedNo = parseInt(rhythmSetNo, 10);
    const normalizedFamily = normalizeRhythmFamily(rhythmFamily);
    if (!normalizedFamily || !Number.isInteger(parsedNo) || parsedNo <= 0) return '';
    return `${normalizedFamily}_${parsedNo}`;
}

function showAlert(message, type = 'info') {
    const alert = document.getElementById('pageAlert');
    if (!alert) return;
    alert.textContent = message;
    alert.className = `alert ${type}`;
    alert.style.display = 'block';
}

function clearAlertAfter(ms = 2500) {
    const alert = document.getElementById('pageAlert');
    if (!alert) return;
    window.setTimeout(() => {
        alert.style.display = 'none';
    }, ms);
}

async function authFetch(url, options = {}) {
    const headers = options.headers || {};
    const token = getAuthToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    const requestOptions = { ...options };
    if (!requestOptions.cache) {
        requestOptions.cache = 'no-store';
    }
    return fetch(url, { ...requestOptions, headers });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setStats() {
    const mappedSongs = songs.filter(song => song.rhythmSetId).length;
    const completeSets = rhythmSets.filter(set => set.isComplete).length;

    document.getElementById('statRhythmSets').textContent = String(rhythmSets.length);
    document.getElementById('statMappedSongs').textContent = String(mappedSongs);
    document.getElementById('statUnmappedSongs').textContent = String(Math.max(0, songs.length - mappedSongs));
    document.getElementById('statCompleteSets').textContent = String(completeSets);
}

function resolveLoopRhythmSetId(loop) {
    if (loop && loop.rhythmSetId) return String(loop.rhythmSetId).toLowerCase();
    const family = normalizeRhythmFamily((loop && (loop.rhythmFamily || (loop.conditions && loop.conditions.taal))) || '');
    const setNo = parseInt((loop && (loop.rhythmSetNo || loop.setNo)) || 1, 10);
    return buildRhythmSetId(family, setNo);
}

async function loadLoopsMetadata() {
    const response = await fetch(`${API_BASE_URL}/api/loops/metadata`);
    if (!response.ok) {
        throw new Error('Failed to load loops metadata');
    }

    const metadata = await response.json();
    const map = new Map();
    const loops = Array.isArray(metadata.loops) ? metadata.loops : [];

    loops.forEach(loop => {
        const rhythmSetId = resolveLoopRhythmSetId(loop);
        if (!rhythmSetId) return;

        if (!map.has(rhythmSetId)) {
            map.set(rhythmSetId, {});
        }

        const key = `${loop.type}${loop.number}`;
        if (loop.filename && key) {
            map.get(rhythmSetId)[key] = loop.filename;
        }
    });

    loopsByRhythmSet = map;
}

async function loadRhythmSets() {
    const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`);
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to load rhythm sets' }));
        throw new Error(err.error || 'Failed to load rhythm sets');
    }

    rhythmSets = await response.json();
    renderRhythmSetSelect();
    renderRhythmSetsTable();
}

async function loadSongs() {
    const response = await authFetch(`${API_BASE_URL}/api/songs`);
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to load songs' }));
        throw new Error(err.error || 'Failed to load songs');
    }

    songs = await response.json();
    songs.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    filteredSongs = songs.slice();
    renderSongsTable();
}

function renderSongsTable() {
    const tbody = document.getElementById('songsTableBody');
    tbody.innerHTML = '';

    if (!filteredSongs.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="3">No songs match the current filter.</td>';
        tbody.appendChild(tr);
        return;
    }

    filteredSongs.forEach(song => {
        const tr = document.createElement('tr');
        if (song.id === selectedSongId) {
            tr.style.background = 'rgba(47,123,215,0.12)';
        }

        tr.innerHTML = `
            <td>
                <strong>${escapeHtml(song.title || '(untitled)')}</strong>
                <div class="small-note">ID: ${escapeHtml(song.id)} | Taal: ${escapeHtml(song.taal || '-')}</div>
            </td>
            <td>${escapeHtml(song.rhythmSetId || '-')}</td>
            <td><button class="btn btn-primary select-song-btn" data-song-id="${escapeHtml(song.id)}">Select</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRhythmSetSelect() {
    const select = document.getElementById('mapperRhythmSetSelect');
    const previousValue = select.value;

    select.innerHTML = '<option value="">Select rhythm set...</option>';
    rhythmSets.forEach(set => {
        const option = document.createElement('option');
        option.value = set.rhythmSetId;
        option.textContent = `${set.rhythmSetId} (${set.mappedSongCount || 0} songs)`;
        select.appendChild(option);
    });

    if (previousValue && rhythmSets.some(set => set.rhythmSetId === previousValue)) {
        select.value = previousValue;
    }
}

function renderRhythmSetsTable() {
    const tbody = document.getElementById('rhythmSetsTableBody');
    tbody.innerHTML = '';

    if (!rhythmSets.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="6">No rhythm sets available.</td>';
        tbody.appendChild(tr);
        return;
    }

    rhythmSets.forEach(set => {
        const tr = document.createElement('tr');
        tr.dataset.rhythmSetId = set.rhythmSetId;

        const statusOptions = ['active', 'inactive', 'archived'];
        if (set.status && !statusOptions.includes(set.status)) {
            statusOptions.push(set.status);
        }

        tr.innerHTML = `
            <td>
                <strong>${escapeHtml(set.rhythmSetId)}</strong>
                <div class="small-note" style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                    <input class="set-id" type="text" value="${escapeHtml(set.rhythmSetId || '')}" placeholder="family_setNo (example: keherwa_2)" style="min-width:220px;">
                    <span>family: ${escapeHtml(set.rhythmFamily || '-')}</span>
                    <span>set: ${escapeHtml(set.rhythmSetNo || '-')}</span>
                </div>
            </td>
            <td>${escapeHtml(set.mappedSongCount || 0)}</td>
            <td>${escapeHtml((set.availableFiles || []).length)}/6</td>
            <td>
                <select class="set-status">
                    ${statusOptions.map(status => `<option value="${escapeHtml(status)}" ${String(set.status || 'active') === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}
                </select>
            </td>
            <td><textarea class="set-notes">${escapeHtml(set.notes || '')}</textarea></td>
            <td>
                <div class="inline-actions">
                    <button class="btn btn-success save-set-btn">Save</button>
                    <button class="btn btn-primary rename-set-btn">Save Name</button>
                    <button class="btn btn-warning recompute-set-btn">Recompute</button>
                    <button class="btn btn-secondary use-set-btn">Use</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getRenamePayloadFromRow(row) {
    const rhythmSetIdInput = row.querySelector('.set-id');
    const directId = String(rhythmSetIdInput ? rhythmSetIdInput.value : '').trim();
    const parsedId = parseRhythmSetId(directId);

    if (!parsedId) {
        throw new Error('Rhythm Set Name must be in format family_setNo (example: keherwa_2).');
    }

    return {
        rhythmFamily: parsedId.rhythmFamily,
        rhythmSetNo: parsedId.rhythmSetNo,
        newRhythmSetId: parsedId.rhythmSetId
    };
}

function setSelectedSong(songId) {
    const normalizedId = Number(songId);
    const song = songs.find(item => Number(item.id) === normalizedId);
    if (!song) return;

    selectedSongId = normalizedId;
    renderSongsTable();

    const card = document.getElementById('selectedSongCard');
    card.innerHTML = `
        <div><strong>${escapeHtml(song.title || '(untitled)')}</strong></div>
        <div class="small-note">ID: ${escapeHtml(song.id)} | Current Rhythm Set: ${escapeHtml(song.rhythmSetId || '-')}</div>
        <div class="small-note">Taal: ${escapeHtml(song.taal || '-')} | Time: ${escapeHtml(song.time || song.timeSignature || '-')} | Tempo: ${escapeHtml(song.tempo || '-')}</div>
    `;

    const select = document.getElementById('mapperRhythmSetSelect');
    if (song.rhythmSetId && rhythmSets.some(set => set.rhythmSetId === song.rhythmSetId)) {
        select.value = song.rhythmSetId;
    }

    updateSelectedSetMeta();
    renderPreviewButtons(select.value || song.rhythmSetId || '');
}

function updateSelectedSetMeta() {
    const select = document.getElementById('mapperRhythmSetSelect');
    const info = document.getElementById('selectedSetMeta');
    const rhythmSet = rhythmSets.find(set => set.rhythmSetId === select.value);

    if (!rhythmSet) {
        info.textContent = 'Pick a rhythm set to preview and assign.';
        return;
    }

    const fileCount = Array.isArray(rhythmSet.availableFiles) ? rhythmSet.availableFiles.length : 0;
    info.textContent = `${rhythmSet.rhythmSetId} | status: ${rhythmSet.status || 'active'} | mapped songs: ${rhythmSet.mappedSongCount || 0} | files: ${fileCount}/6`;
}

function stopPreview() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    document.querySelectorAll('.preview-play i').forEach(icon => {
        icon.className = 'fas fa-play';
    });
}

function playPreview(url, button) {
    const icon = button.querySelector('i');

    if (currentAudio && currentAudio.src === url && !currentAudio.paused) {
        stopPreview();
        return;
    }

    stopPreview();
    currentAudio = new Audio(url);
    currentAudio.play();
    icon.className = 'fas fa-pause';

    currentAudio.addEventListener('ended', () => {
        icon.className = 'fas fa-play';
    }, { once: true });
}

function renderPreviewButtons(rhythmSetId) {
    const container = document.getElementById('previewButtons');
    container.innerHTML = '';

    const files = loopsByRhythmSet.get(String(rhythmSetId || '').toLowerCase()) || null;
    if (!files) {
        container.innerHTML = '<span class="small-note">No loop files available for this rhythm set yet.</span>';
        return;
    }

    RHYTHM_FILE_ORDER.forEach(fileKey => {
        const filename = files[fileKey];
        if (!filename) return;

        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary preview-play';
        btn.type = 'button';
        btn.innerHTML = `<i class="fas fa-play"></i> ${fileKey.toUpperCase()}`;
        btn.addEventListener('click', () => {
            const url = `${API_BASE_URL}/loops/${encodeURIComponent(filename)}`;
            playPreview(url, btn);
        });
        container.appendChild(btn);
    });

    if (!container.children.length) {
        container.innerHTML = '<span class="small-note">No loop files available for this rhythm set yet.</span>';
    }
}

function filterSongs() {
    const q = String(document.getElementById('songSearchInput').value || '').trim().toLowerCase();
    if (!q) {
        filteredSongs = songs.slice();
        renderSongsTable();
        return;
    }

    filteredSongs = songs.filter(song => {
        const haystack = [
            song.title,
            song.id,
            song.taal,
            song.rhythmSetId,
            song.rhythmFamily,
            song.time,
            song.timeSignature
        ].map(value => String(value || '').toLowerCase()).join(' ');

        return haystack.includes(q);
    });

    renderSongsTable();
}

async function assignSelectedRhythmSet() {
    if (!selectedSongId) {
        showAlert('Select a song first.', 'error');
        return;
    }

    const select = document.getElementById('mapperRhythmSetSelect');
    const rhythmSetId = select.value;
    const parsed = parseRhythmSetId(rhythmSetId);

    if (!parsed) {
        showAlert('Select a valid rhythm set first.', 'error');
        return;
    }

    showAlert('Assigning rhythm set to song...', 'info');
    const response = await authFetch(`${API_BASE_URL}/api/songs/${selectedSongId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rhythmSetId: parsed.rhythmSetId,
            rhythmFamily: parsed.rhythmFamily,
            rhythmSetNo: parsed.rhythmSetNo
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to map song' }));
        showAlert(err.error || 'Failed to map song', 'error');
        return;
    }

    showAlert('Song mapped successfully.', 'success');
    clearAlertAfter();

    await Promise.all([loadSongs(), loadRhythmSets()]);
    setSelectedSong(selectedSongId);
    setStats();
}

async function recommendForSelectedSong() {
    if (!selectedSongId) {
        showAlert('Select a song first.', 'error');
        return;
    }

    const song = songs.find(item => Number(item.id) === Number(selectedSongId));
    if (!song) {
        showAlert('Selected song not found.', 'error');
        return;
    }

    showAlert('Calculating recommendation...', 'info');
    const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'No recommendation available' }));
        showAlert(err.error || 'No recommendation available', 'error');
        return;
    }

    const recommendation = await response.json();
    const select = document.getElementById('mapperRhythmSetSelect');
    if (recommendation.rhythmSetId && rhythmSets.some(set => set.rhythmSetId === recommendation.rhythmSetId)) {
        select.value = recommendation.rhythmSetId;
        updateSelectedSetMeta();
        renderPreviewButtons(select.value);
        showAlert(`Recommended: ${recommendation.rhythmSetId}`, 'success');
        clearAlertAfter();
    } else {
        showAlert('Recommendation returned, but set was not found in current list.', 'error');
    }
}

async function createRhythmSet() {
    const family = document.getElementById('createFamily').value;
    const setNo = parseInt(document.getElementById('createSetNo').value, 10);
    const status = document.getElementById('createStatus').value;
    const notes = document.getElementById('createNotes').value;

    if (!family || !setNo || setNo <= 0) {
        showAlert('Family and positive set number are required.', 'error');
        return;
    }

    const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            rhythmFamily: family,
            rhythmSetNo: setNo,
            status,
            notes
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to create rhythm set' }));
        showAlert(err.error || 'Failed to create rhythm set', 'error');
        return;
    }

    document.getElementById('createSetNo').value = '';
    document.getElementById('createNotes').value = '';

    showAlert('Rhythm set created.', 'success');
    clearAlertAfter();
    await loadRhythmSets();
    setStats();
}

async function saveRhythmSetRow(row) {
    const rhythmSetId = row.dataset.rhythmSetId;
    const status = row.querySelector('.set-status').value;
    const notes = row.querySelector('.set-notes').value;
    const { rhythmFamily, rhythmSetNo, newRhythmSetId } = getRenamePayloadFromRow(row);

    const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            newRhythmSetId,
            rhythmFamily,
            rhythmSetNo,
            status,
            notes
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to save rhythm set' }));
        throw new Error(err.error || 'Failed to save rhythm set');
    }

    return response.json();
}

async function renameRhythmSetRow(row) {
    const oldRhythmSetId = row.dataset.rhythmSetId;
    const status = row.querySelector('.set-status').value;
    const notes = row.querySelector('.set-notes').value;
    const { rhythmFamily, rhythmSetNo, newRhythmSetId } = getRenamePayloadFromRow(row);

    const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(oldRhythmSetId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            newRhythmSetId,
            rhythmFamily,
            rhythmSetNo,
            status,
            notes
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to rename rhythm set' }));
        throw new Error(err.error || 'Failed to rename rhythm set');
    }

    return response.json();
}

async function recomputeRhythmSet(rhythmSetId) {
    const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}/recompute`, {
        method: 'PUT'
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to recompute rhythm set' }));
        throw new Error(err.error || 'Failed to recompute rhythm set');
    }
}

function wireEvents() {
    document.getElementById('refreshAllBtn').addEventListener('click', async () => {
        await initializeData();
    });

    document.getElementById('songSearchInput').addEventListener('input', filterSongs);

    document.getElementById('songsTableBody').addEventListener('click', (e) => {
        const button = e.target.closest('.select-song-btn');
        if (!button) return;
        const songId = Number(button.dataset.songId);
        setSelectedSong(songId);
    });

    document.getElementById('mapperRhythmSetSelect').addEventListener('change', (e) => {
        updateSelectedSetMeta();
        renderPreviewButtons(e.target.value);
    });

    document.getElementById('assignBtn').addEventListener('click', async () => {
        await assignSelectedRhythmSet();
    });

    document.getElementById('recommendBtn').addEventListener('click', async () => {
        await recommendForSelectedSong();
    });

    document.getElementById('stopPreviewBtn').addEventListener('click', () => {
        stopPreview();
    });

    document.getElementById('createRhythmSetForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createRhythmSet();
    });

    document.getElementById('rhythmSetsTableBody').addEventListener('click', async (e) => {
        const row = e.target.closest('tr[data-rhythm-set-id]');
        if (!row) return;

        const rhythmSetId = row.dataset.rhythmSetId;

        if (e.target.closest('.save-set-btn')) {
            try {
                showAlert(`Saving ${rhythmSetId}...`, 'info');
                const result = await saveRhythmSetRow(row);
                const savedRhythmSetId = result && result.rhythmSetId ? result.rhythmSetId : rhythmSetId;
                showAlert(`${rhythmSetId} saved as ${savedRhythmSetId}.`, 'success');
                clearAlertAfter();
                await Promise.all([loadRhythmSets(), loadSongs(), loadLoopsMetadata()]);
                setStats();
                if (selectedSongId) {
                    setSelectedSong(selectedSongId);
                }
            } catch (error) {
                showAlert(error.message, 'error');
            }
        }

        if (e.target.closest('.rename-set-btn')) {
            try {
                showAlert(`Renaming ${rhythmSetId}...`, 'info');
                const result = await renameRhythmSetRow(row);
                const newRhythmSetId = result && result.rhythmSetId ? result.rhythmSetId : rhythmSetId;
                showAlert(`${rhythmSetId} renamed to ${newRhythmSetId}.`, 'success');
                clearAlertAfter();
                await Promise.all([loadRhythmSets(), loadSongs(), loadLoopsMetadata()]);
                setStats();
                if (selectedSongId) {
                    setSelectedSong(selectedSongId);
                }
            } catch (error) {
                showAlert(error.message, 'error');
            }
        }

        if (e.target.closest('.recompute-set-btn')) {
            try {
                showAlert(`Recomputing ${rhythmSetId}...`, 'info');
                await recomputeRhythmSet(rhythmSetId);
                showAlert(`${rhythmSetId} recomputed.`, 'success');
                clearAlertAfter();
                await loadRhythmSets();
                setStats();
            } catch (error) {
                showAlert(error.message, 'error');
            }
        }

        if (e.target.closest('.use-set-btn')) {
            const select = document.getElementById('mapperRhythmSetSelect');
            select.value = rhythmSetId;
            updateSelectedSetMeta();
            renderPreviewButtons(rhythmSetId);
        }
    });
}

async function initializeData() {
    if (!isAuthenticated()) {
        showAlert('Login required. Open the main app first, then return to this page.', 'error');
        return;
    }

    try {
        showAlert('Loading songs, rhythm sets, and loop previews...', 'info');
        await Promise.all([loadSongs(), loadRhythmSets(), loadLoopsMetadata()]);
        setStats();
        updateSelectedSetMeta();
        showAlert('Ready.', 'success');
        clearAlertAfter();
    } catch (error) {
        showAlert(error.message || 'Failed to initialize rhythm mapper.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    applyThemeFromStorage();
    wireEvents();
    await initializeData();
});
