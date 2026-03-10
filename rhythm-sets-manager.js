const API_BASE_URL_RENDER = 'https://praiseandworship.onrender.com';
const API_BASE_URL_VERCEL = 'https://praiseand-worship.vercel.app';
const API_BASE_URL_LOCAL = 'http://localhost:3001';

function getApiBaseCandidates() {
  const backend = String(localStorage.getItem('pw_admin_backend') || 'vercel').toLowerCase();
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const candidates = [];

  if (backend === 'local' || isLocalHost) {
    candidates.push(API_BASE_URL_LOCAL);
  }
  if (backend === 'render') {
    candidates.push(API_BASE_URL_RENDER);
  }
  if (backend === 'vercel' || (backend !== 'local' && backend !== 'render')) {
    candidates.push(API_BASE_URL_VERCEL);
  }

  // Always keep remote fallbacks so manager pages can recover from 404s.
  candidates.push(API_BASE_URL_VERCEL, API_BASE_URL_RENDER);

  return Array.from(new Set(candidates));
}

let ACTIVE_API_BASE_URL = getApiBaseCandidates()[0] || API_BASE_URL_VERCEL;

// Constants
const RHYTHM_FILE_ORDER = ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'];

// Global state
let allSongs = [];
let allRhythmSets = [];
let selectedSong = null;
let loopsByRhythmSet = new Map();
let currentAudio = null;

async function fetchWithBackendFallback(path, options = {}) {
  const candidates = getApiBaseCandidates();
  let lastError = new Error('Request failed');

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}${path}`, options);
      if (response.status === 404 || response.status === 405 || response.status === 501) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      ACTIVE_API_BASE_URL = base;
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function getToken() {
  return localStorage.getItem('pw_jwtToken') || localStorage.getItem('jwtToken') || '';
}

function setInfo(message) {
  document.getElementById('info').textContent = message;
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function isAdminToken(token) {
  const payload = parseJwt(token);
  return Boolean(payload && (payload.isAdmin === true || payload.isAdmin === 'true'));
}

function renderRows(items) {
  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';

  if (!items.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7">No rhythm sets returned.</td>';
    tbody.appendChild(tr);
    return;
  }

  items.forEach(item => {
    const fileCount = Array.isArray(item.availableFiles) ? item.availableFiles.length : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.rhythmSetId || '-'}</td>
      <td>${item.rhythmFamily || '-'}</td>
      <td>${item.rhythmSetNo || '-'}</td>
      <td>${item.mappedSongCount || 0}</td>
      <td>${fileCount}/6</td>
      <td class="${item.isComplete ? 'ok' : 'warn'}">
        <select data-role="status" data-id="${item.rhythmSetId}" style="padding:5px;border-radius:6px;">
          <option value="active" ${String(item.status || 'active') === 'active' ? 'selected' : ''}>active</option>
          <option value="inactive" ${String(item.status || '') === 'inactive' ? 'selected' : ''}>inactive</option>
          <option value="archived" ${String(item.status || '') === 'archived' ? 'selected' : ''}>archived</option>
        </select>
      </td>
      <td>${item.source || 'db'}</td>
      <td>
        <button class="btn" data-action="save" data-id="${item.rhythmSetId}">Save</button>
        <button class="btn secondary" data-action="recompute" data-id="${item.rhythmSetId}">Recompute</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function getSelectedStatusFor(id) {
  const select = document.querySelector(`select[data-role="status"][data-id="${id}"]`);
  return select ? select.value : 'active';
}

async function createRhythmSet() {
  const token = getToken();
  if (!token) {
    setInfo('Login required. Open the main app and sign in first.');
    return;
  }
  if (!isAdminToken(token)) {
    setInfo('Admin token required for write operations.');
    return;
  }

  const rhythmFamily = document.getElementById('createFamily').value;
  const rhythmSetNo = document.getElementById('createSetNo').value;
  const status = document.getElementById('createStatus').value;
  const notes = document.getElementById('createNotes').value;

  if (!rhythmFamily || !rhythmSetNo) {
    setInfo('Provide rhythm family and set number.');
    return;
  }

  try {
    setInfo('Creating rhythm set...');
    const response = await fetchWithBackendFallback('/api/rhythm-sets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ rhythmFamily, rhythmSetNo, status, notes })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`Created ${payload.rhythmSetId || 'rhythm set'}.`);
    await loadData();
  } catch (error) {
    setInfo(`Create failed: ${error.message}`);
  }
}

async function saveRhythmSet(rhythmSetId) {
  const token = getToken();
  const status = getSelectedStatusFor(rhythmSetId);
  try {
    setInfo(`Saving ${rhythmSetId}...`);
    const response = await fetchWithBackendFallback(`/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`Saved ${payload.rhythmSetId || rhythmSetId}.`);
    await loadData();
  } catch (error) {
    setInfo(`Save failed: ${error.message}`);
  }
}

async function recomputeRhythmSet(rhythmSetId) {
  const token = getToken();
  try {
    setInfo(`Recomputing ${rhythmSetId}...`);
    const response = await fetchWithBackendFallback(`/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}/recompute`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`Recomputed ${rhythmSetId}.`);
    await loadData();
  } catch (error) {
    setInfo(`Recompute failed: ${error.message}`);
  }
}

// ============================================
// SONG MANAGEMENT FUNCTIONS
// ============================================

async function loadSongs() {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetchWithBackendFallback('/api/songs', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    allSongs = Array.isArray(data) ? data : [];
    renderSongsTable();
    updateMappedStats();
  } catch (error) {
    console.error('Failed to load songs:', error);
    allSongs = [];
    renderSongsTable();
  }
}

function renderSongsTable() {
  const tbody = document.getElementById('songsTableBody');
  tbody.innerHTML = '';

  if (!allSongs.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3">No songs found. Add songs in the main app.</td>';
    tbody.appendChild(tr);
    return;
  }

  allSongs.forEach(song => {
    const tr = document.createElement('tr');
    tr.className = 'song-row';
    tr.dataset.songId = song._id || song.id;
    
    const rhythmSetDisplay = song.rhythmSetId || '<span class="warn">unmapped</span>';
    
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(song.title || 'Untitled')}</strong><br>
        <span style="font-size:.85rem;color:#6b7280;">${song.taal || 'N/A'} | ${song.tempo ? song.tempo + 'bpm' : 'N/A'}</span>
      </td>
      <td>${rhythmSetDisplay}</td>
      <td>
        <button class="btn" style="padding:6px 10px;font-size:.85rem;" onclick="setSelectedSong('${song._id || song.id}')">Select</button>
      </td>
    `;
    
    if (selectedSong && (selectedSong._id === song._id || selectedSong.id === song.id)) {
      tr.classList.add('selected');
    }
    
    tbody.appendChild(tr);
  });
}

function setSelectedSong(songId) {
  const song = allSongs.find(s => s._id === songId || s.id === songId);
  if (!song) return;

  selectedSong = song;
  renderSongsTable();
  
  const card = document.getElementById('selectedSongCard');
  card.className = 'current-song selected';
  card.innerHTML = `
    <strong>${escapeHtml(song.title || 'Untitled')}</strong><br>
    <span style="font-size:.85rem;color:#6b7280;">
      Taal: ${song.taal || 'N/A'} | 
      Tempo: ${song.tempo ? song.tempo + 'bpm' : 'N/A'} | 
      Time: ${song.timeSignature || 'N/A'}
    </span><br>
    <span style="font-size:.85rem;color:#2f7bd7;">
      Current: ${song.rhythmSetId || '<span class="warn">unmapped</span>'}
    </span>
  `;
  
  document.getElementById('assignBtn').disabled = false;
  document.getElementById('recommendBtn').disabled = false;
}

function filterSongs() {
  const searchTerm = document.getElementById('songSearchInput').value.toLowerCase();
  
  const tbody = document.getElementById('songsTableBody');
  const rows = tbody.getElementsByTagName('tr');
  
  Array.from(rows).forEach(row => {
    const songId = row.dataset.songId;
    if (!songId) return;
    
    const song = allSongs.find(s => (s._id === songId || s.id === songId));
    if (!song) return;
    
    const searchableText = [
      song.title || '',
      song.taal || '',
      song.rhythmSetId || ''
    ].join(' ').toLowerCase();
    
    row.style.display = searchableText.includes(searchTerm) ? '' : 'none';
  });
}

function renderRhythmSetSelect() {
  const select = document.getElementById('mapperRhythmSetSelect');
  select.innerHTML = '<option value="">-- Select Rhythm Set --</option>';
  
  const activeRhythmSets = allRhythmSets.filter(rs => rs.status !== 'archived');
  
  activeRhythmSets
    .sort((a, b) => {
      const familyCompare = (a.rhythmFamily || '').localeCompare(b.rhythmFamily || '');
      if (familyCompare !== 0) return familyCompare;
      return (a.rhythmSetNo || 0) - (b.rhythmSetNo || 0);
    })
    .forEach(rs => {
      const option = document.createElement('option');
      option.value = rs.rhythmSetId;
      option.textContent = `${rs.rhythmSetId} (${rs.status || 'active'})`;
      select.appendChild(option);
    });
}

async function assignSelectedRhythmSet() {
  if (!selectedSong) {
    setInfo('Please select a song first.');
    return;
  }

  const rhythmSetId = document.getElementById('mapperRhythmSetSelect').value;
  if (!rhythmSetId) {
    setInfo('Please select a rhythm set to assign.');
    return;
  }

  const token = getToken();
  if (!token) {
    setInfo('Login required.');
    return;
  }

  try {
    setInfo(`Assigning ${rhythmSetId} to ${selectedSong.title}...`);
    
    const songId = selectedSong._id || selectedSong.id;
    const response = await fetchWithBackendFallback(`/api/songs/${encodeURIComponent(songId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ rhythmSetId })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`✓ Assigned ${rhythmSetId} to ${selectedSong.title}`);
    
    // Update local data
    selectedSong.rhythmSetId = rhythmSetId;
    const songIndex = allSongs.findIndex(s => (s._id === songId || s.id === songId));
    if (songIndex !== -1) {
      allSongs[songIndex].rhythmSetId = rhythmSetId;
    }
    
    renderSongsTable();
    updateMappedStats();
    
    // Clear selection after successful assignment
    setTimeout(() => {
      document.getElementById('mapperRhythmSetSelect').value = '';
    }, 1000);
  } catch (error) {
    console.error('Assignment failed:', error);
    setInfo(`Assignment failed: ${error.message}`);
  }
}

function recommendForSelectedSong() {
  if (!selectedSong) {
    setInfo('Please select a song first.');
    return;
  }

  // Simple recommendation algorithm: match by taal
  const songTaal = (selectedSong.taal || '').toLowerCase().trim();
  
  const compatibleSets = allRhythmSets.filter(rs => {
    const family = (rs.rhythmFamily || '').toLowerCase();
    return family.includes(songTaal) || songTaal.includes(family);
  });
  
  if (compatibleSets.length === 0) {
    setInfo(`No rhythm sets found matching taal "${selectedSong.taal}". Showing all active sets.`);
    return;
  }
  
  // Prefer complete sets
  const completeSets = compatibleSets.filter(rs => rs.isComplete);
  const recommended = completeSets.length > 0 ? completeSets[0] : compatibleSets[0];
  
  document.getElementById('mapperRhythmSetSelect').value = recommended.rhythmSetId;
  setInfo(`✓ Recommended: ${recommended.rhythmSetId} (matches taal: ${selectedSong.taal})`);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

function resolveLoopRhythmSetId(loop) {
  if (loop && loop.rhythmSetId) return String(loop.rhythmSetId).toLowerCase();
  const family = normalizeRhythmFamily((loop && (loop.rhythmFamily || (loop.conditions && loop.conditions.taal))) || '');
  const setNo = parseInt((loop && (loop.rhythmSetNo || loop.setNo)) || 1, 10);
  return buildRhythmSetId(family, setNo);
}

function updateMappedStats() {
  const mappedCount = allSongs.filter(s => s.rhythmSetId).length;
  document.getElementById('statMapped').textContent = String(mappedCount);
}

// ============================================
// LOOPS METADATA AND AUDIO PREVIEW
// ============================================

async function loadLoopsMetadata() {
  try {
    const response = await fetchWithBackendFallback('/api/loops/metadata');
    if (!response.ok) {
      console.warn('Failed to load loops metadata');
      return;
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
  } catch (error) {
    console.error('Failed to load loops metadata:', error);
  }
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

  if (!rhythmSetId) {
    return;
  }

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
      const url = `${ACTIVE_API_BASE_URL}/loops/${encodeURIComponent(filename)}`;
      playPreview(url, btn);
    });
    container.appendChild(btn);
  });

  if (!container.children.length) {
    container.innerHTML = '<span class="small-note">No loop files available for this rhythm set yet.</span>';
  }
}

function updateSelectedSetMeta() {
  const rhythmSetId = document.getElementById('mapperRhythmSetSelect').value;
  const meta = document.getElementById('selectedSetMeta');
  
  if (!rhythmSetId) {
    meta.textContent = 'Pick a rhythm set to preview and assign.';
    return;
  }

  const rhythmSet = allRhythmSets.find(rs => rs.rhythmSetId === rhythmSetId);
  if (rhythmSet) {
    const fileCount = Array.isArray(rhythmSet.availableFiles) ? rhythmSet.availableFiles.length : 0;
    meta.textContent = `${rhythmSetId}: ${fileCount}/6 files (${rhythmSet.status || 'active'})`;
  }
}

// ============================================
// RHYTHM SETS DATA LOADING
// ============================================

async function loadData() {
  const token = getToken();
  if (!token) {
    setInfo('Login required. Open the main app and sign in first.');
    renderRows([]);
    return;
  }

  if (!isAdminToken(token)) {
    setInfo('Admin token required for manager pages.');
    renderRows([]);
    return;
  }

  setInfo('Loading rhythm sets...');
  try {
    const response = await fetchWithBackendFallback('/api/rhythm-sets', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        if (payload && payload.error) message = payload.error;
      } catch {
        // Ignore parse failures.
      }
      throw new Error(message);
    }

    const items = await response.json();
    const list = Array.isArray(items) ? items : [];

    allRhythmSets = list; // Store for song assignment

    document.getElementById('statTotal').textContent = String(list.length);
    document.getElementById('statComplete').textContent = String(list.filter(item => item.isComplete).length);
    document.getElementById('statBackend').textContent = ACTIVE_API_BASE_URL.includes('vercel') ? 'Vercel' : ACTIVE_API_BASE_URL.includes('render') ? 'Render' : 'Local';

    renderRows(list);
    renderRhythmSetSelect(); // Populate rhythm set dropdown
    await loadSongs(); // Load songs for assignment
    await loadLoopsMetadata(); // Load loops metadata for preview
    setInfo('Data loaded successfully.');
  } catch (error) {
    console.error('Rhythm sets manager load failed:', error);
    setInfo(`Failed to load rhythm sets: ${error.message}`);
    renderRows([]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Existing event listeners
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  document.getElementById('createBtn').addEventListener('click', createRhythmSet);
  document.getElementById('rows').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const rhythmSetId = button.dataset.id;
    if (action === 'save') {
      saveRhythmSet(rhythmSetId);
    }
    if (action === 'recompute') {
      recomputeRhythmSet(rhythmSetId);
    }
  });
  
  // New song assignment event listeners
  document.getElementById('songSearchInput').addEventListener('keyup', filterSongs);
  document.getElementById('assignBtn').addEventListener('click', assignSelectedRhythmSet);
  document.getElementById('recommendBtn').addEventListener('click', recommendForSelectedSong);
  document.getElementById('stopPreviewBtn').addEventListener('click', stopPreview);
  
  // Rhythm set dropdown change - show preview buttons and metadata
  document.getElementById('mapperRhythmSetSelect').addEventListener('change', (e) => {
    updateSelectedSetMeta();
    renderPreviewButtons(e.target.value);
  });
  
  // Initialize buttons as disabled
  document.getElementById('assignBtn').disabled = true;
  document.getElementById('recommendBtn').disabled = true;
  
  loadData();
});
