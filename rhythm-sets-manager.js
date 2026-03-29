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
const STARTUP_LOOP_OPTIONS = ['loop1', 'loop2', 'loop3'];
const STARTUP_FILL_OPTIONS = ['fill1', 'fill2', 'fill3'];
const DEFAULT_STARTUP_CONFIG = {
  startLoop: 'loop1',
  startFill: '',
  tempoPercent: 100
};
const DEFAULT_RECOMMENDATION_WEIGHTS = {
  taal: 15,
  timeSignature: 10,
  tempo: 10,
  genre: 15,
  mood: 10,
  rhythmCategory: 5
};

// Global state
let allSongs = [];
let allRhythmSets = [];
let selectedSong = null;
let loopsByRhythmSet = new Map();
let rhythmSetTraitsById = new Map();
let currentAudio = null;
let recommendationWeights = { ...DEFAULT_RECOMMENDATION_WEIGHTS };
let recommendationWeightsLoaded = false;

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

let alertClearTimer = null;

function getAuthToken() {
  return getToken();
}

function isAuthenticated() {
  return Boolean(getAuthToken());
}

function showAlert(message, type = 'info') {
  setInfo(message);
  const infoEl = document.getElementById('info');
  if (infoEl) infoEl.dataset.level = String(type || 'info');
}

function clearAlertAfter(delayMs = 3000) {
  if (alertClearTimer) {
    clearTimeout(alertClearTimer);
  }
  const delay = Number.isFinite(Number(delayMs)) ? Math.max(0, Number(delayMs)) : 3000;
  alertClearTimer = setTimeout(() => setInfo(''), delay);
}

function applyThemeFromStorage() {
  const isDarkMode = localStorage.getItem('pw_darkMode') === 'true';
  document.body.classList.toggle('dark-mode', isDarkMode);
  document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
}

function resolveApiPath(url) {
  if (!url) return '/';

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search || ''}`;
    } catch {
      return String(url);
    }
  }

  return String(url).startsWith('/') ? String(url) : `/${String(url)}`;
}

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };

  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetchWithBackendFallback(resolveApiPath(url), {
    ...options,
    headers
  });
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

function getSongIdentityKey(song) {
  if (!song || typeof song !== 'object') return '';
  const numericSongId = normalizeSongNumericId(song.id);
  if (numericSongId) {
    return `id:${numericSongId}`;
  }

  if (song._id !== undefined && song._id !== null && String(song._id).trim() !== '') {
    return `oid:${String(song._id).trim()}`;
  }

  return '';
}

function getSongRouteId(song) {
  if (!song || typeof song !== 'object') return '';
  const numericSongId = normalizeSongNumericId(song.id);
  if (numericSongId) {
    return numericSongId;
  }

  if (song._id !== undefined && song._id !== null && String(song._id).trim() !== '') {
    return String(song._id).trim();
  }

  return '';
}

function normalizeStartupLoop(value, allowedLoops = STARTUP_LOOP_OPTIONS) {
  const loop = String(value || '').trim().toLowerCase();
  if (allowedLoops.includes(loop)) return loop;
  if (allowedLoops.length) return allowedLoops[0];
  return DEFAULT_STARTUP_CONFIG.startLoop;
}

function normalizeStartupFill(value, allowedFills = STARTUP_FILL_OPTIONS) {
  const fill = String(value || '').trim().toLowerCase();
  if (!fill) return '';
  return allowedFills.includes(fill) ? fill : '';
}

function normalizeStartupTempo(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STARTUP_CONFIG.tempoPercent;
  return Math.max(50, Math.min(200, parsed));
}

function getStartupConfigFromSong(song, fallbackRhythmSetId = '') {
  const songConfig = song && typeof song.loopStartConfig === 'object' && song.loopStartConfig
    ? song.loopStartConfig
    : {};
  const rhythmSetId = String(songConfig.rhythmSetId || fallbackRhythmSetId || song?.rhythmSetId || '').trim();

  return {
    rhythmSetId,
    startLoop: normalizeStartupLoop(songConfig.startLoop),
    startFill: normalizeStartupFill(songConfig.startFill),
    tempoPercent: normalizeStartupTempo(songConfig.tempoPercent)
  };
}

function getAvailableStartupSlotsForRhythmSet(rhythmSetId) {
  const files = loopsByRhythmSet.get(String(rhythmSetId || '').toLowerCase()) || {};
  const availableLoops = STARTUP_LOOP_OPTIONS.filter(loop => Boolean(files[loop]));
  const availableFills = STARTUP_FILL_OPTIONS.filter(fill => Boolean(files[fill]));
  return {
    availableLoops: availableLoops.length ? availableLoops : [...STARTUP_LOOP_OPTIONS],
    availableFills
  };
}

function updateStartupDropdownOptions(config, rhythmSetId) {
  const loopSelect = document.getElementById('startupLoopSelect');
  const fillSelect = document.getElementById('startupFillSelect');
  if (!loopSelect || !fillSelect) return;

  const { availableLoops, availableFills } = getAvailableStartupSlotsForRhythmSet(rhythmSetId);

  loopSelect.innerHTML = availableLoops
    .map(loop => `<option value="${loop}">${loop.toUpperCase()}</option>`)
    .join('');

  fillSelect.innerHTML = '<option value="">None</option>';
  availableFills.forEach(fill => {
    const option = document.createElement('option');
    option.value = fill;
    option.textContent = fill.toUpperCase();
    fillSelect.appendChild(option);
  });

  const normalizedLoop = normalizeStartupLoop(config.startLoop, availableLoops);
  const normalizedFill = normalizeStartupFill(config.startFill, availableFills);
  loopSelect.value = normalizedLoop;
  fillSelect.value = normalizedFill;
}

function getSelectedRhythmSetForStartup() {
  const selectValue = String(document.getElementById('mapperRhythmSetSelect')?.value || '').trim();
  if (selectValue) return selectValue;
  if (selectedSong && selectedSong.rhythmSetId) return String(selectedSong.rhythmSetId);
  return '';
}

function updateStartupEditorFromSelectedSong() {
  const card = document.getElementById('startupConfigCard');
  const tempoInput = document.getElementById('startupTempoInput');
  const saveBtn = document.getElementById('saveStartupBtn');
  const resetBtn = document.getElementById('resetStartupBtn');
  const meta = document.getElementById('startupConfigMeta');

  if (!card || !tempoInput || !saveBtn || !resetBtn || !meta) return;

  if (!selectedSong) {
    card.style.opacity = '0.65';
    saveBtn.disabled = true;
    resetBtn.disabled = true;
    meta.textContent = 'Select a song to save startup loop/fill/tempo.';
    return;
  }

  const rhythmSetId = getSelectedRhythmSetForStartup();
  const config = getStartupConfigFromSong(selectedSong, rhythmSetId);
  updateStartupDropdownOptions(config, rhythmSetId);
  tempoInput.value = String(normalizeStartupTempo(config.tempoPercent));

  card.style.opacity = '1';
  saveBtn.disabled = false;
  resetBtn.disabled = false;

  if (rhythmSetId) {
    meta.textContent = `Will start with ${config.startLoop.toUpperCase()}${config.startFill ? ` + ${config.startFill.toUpperCase()}` : ''} at ${config.tempoPercent}% for ${rhythmSetId}.`;
  } else {
    meta.textContent = 'Select a rhythm set first, then save startup config.';
  }
}

function updateSelectedSongCard() {
  const card = document.getElementById('selectedSongCard');
  if (!card) return;

  if (!selectedSong) {
    card.className = 'current-song';
    card.textContent = 'Select a song to start mapping.';
    return;
  }

  const config = getStartupConfigFromSong(selectedSong, selectedSong.rhythmSetId || '');
  const startupSummary = `${config.startLoop.toUpperCase()}${config.startFill ? ` + ${config.startFill.toUpperCase()}` : ''} @ ${config.tempoPercent}%`;

  card.className = 'current-song selected';
  card.innerHTML = `
    <strong>${escapeHtml(selectedSong.title || 'Untitled')}</strong><br>
    <span style="font-size:.85rem;color:#6b7280;">
      Taal: ${selectedSong.taal || 'N/A'} |
      Tempo: ${selectedSong.tempo ? selectedSong.tempo + 'bpm' : 'N/A'} |
      Time: ${selectedSong.timeSignature || 'N/A'}
    </span><br>
    <span style="font-size:.85rem;color:#2f7bd7;">
      Current: ${selectedSong.rhythmSetId || '<span class="warn">unmapped</span>'}
    </span><br>
    <span style="font-size:.82rem;color:#1d4ed8;">
      Startup: ${startupSummary}
    </span>
  `;
}

function matchesSongIdentity(song, songIdentity) {
  const target = String(songIdentity || '').trim();
  if (!target) return false;

  const key = getSongIdentityKey(song);
  if (key === target) return true;

  // Backward compatibility for callers that may still pass raw ids.
  return String(song && song.id || '').trim() === target
    || String(song && song._id || '').trim() === target;
}

function normalizeSongNumericId(value) {
  const text = String(value || '').trim();
  if (!/^[1-9]\d*$/.test(text)) return '';
  return String(parseInt(text, 10));
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
    const songIdentity = getSongIdentityKey(song);
    tr.dataset.songId = songIdentity;
    
    const rhythmSetDisplay = song.rhythmSetId || '<span class="warn">unmapped</span>';
    
    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(song.title || 'Untitled')}</strong><br>
        <span style="font-size:.85rem;color:#6b7280;">${song.taal || 'N/A'} | ${song.tempo ? song.tempo + 'bpm' : 'N/A'}</span>
      </td>
      <td>${rhythmSetDisplay}</td>
      <td>
        <button class="btn" style="padding:6px 10px;font-size:.85rem;" onclick='setSelectedSong(${JSON.stringify(songIdentity)})'>Select</button>
      </td>
    `;
    
    if (selectedSong && matchesSongIdentity(song, getSongIdentityKey(selectedSong))) {
      tr.classList.add('selected');
    }
    
    tbody.appendChild(tr);
  });
}

function setSelectedSong(songIdentity) {
  const song = allSongs.find(s => matchesSongIdentity(s, songIdentity));
  if (!song) return;

  selectedSong = song;
  renderSongsTable();

  const mapperSelect = document.getElementById('mapperRhythmSetSelect');
  if (mapperSelect && song.rhythmSetId) {
    const normalizedCurrent = String(song.rhythmSetId).toLowerCase();
    const hasOption = Array.from(mapperSelect.options).some(option => String(option.value).toLowerCase() === normalizedCurrent);
    if (hasOption) {
      mapperSelect.value = song.rhythmSetId;
      updateSelectedSetMeta();
      renderPreviewButtons(song.rhythmSetId);
    }
  }

  updateSelectedSongCard();
  updateStartupEditorFromSelectedSong();
  
  document.getElementById('assignBtn').disabled = false;
  document.getElementById('recommendBtn').disabled = false;
}

function filterSongs() {
  const searchTerm = document.getElementById('songSearchInput').value.toLowerCase();
  
  const tbody = document.getElementById('songsTableBody');
  const rows = tbody.getElementsByTagName('tr');
  
  Array.from(rows).forEach(row => {
    const songIdentity = row.dataset.songId;
    if (!songIdentity) return;
    
    const song = allSongs.find(s => matchesSongIdentity(s, songIdentity));
    if (!song) return;
    
    const searchableText = [
      song.title || '',
      song.taal || '',
      song.rhythmSetId || ''
    ].join(' ').toLowerCase();
    
    row.style.display = searchableText.includes(searchTerm) ? '' : 'none';
  });
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function splitToTokenSet(value) {
  const tokens = new Set();
  if (Array.isArray(value)) {
    value.forEach(item => {
      splitToTokenSet(item).forEach(token => tokens.add(token));
    });
    return tokens;
  }

  const text = normalizeToken(value);
  if (!text) return tokens;

  text
    .split(/[,/|;]+/)
    .map(part => normalizeToken(part))
    .filter(Boolean)
    .forEach(token => tokens.add(token));

  return tokens;
}

function normalizeTimeSignature(value) {
  const text = normalizeToken(value).replace(/\s+/g, '');
  if (!text) return '';
  if (text === 'c' || text === 'common') return '4/4';
  if (text === 'cut' || text === 'cuttime') return '2/2';

  const match = text.match(/^(\d+)\/(\d+)$/);
  if (!match) return '';
  return `${parseInt(match[1], 10)}/${parseInt(match[2], 10)}`;
}

function parseTimeSignatureComponents(value) {
  const normalized = normalizeTimeSignature(value);
  const match = normalized.match(/^(\d+)\/(\d+)$/);
  if (!match) return null;
  return {
    numerator: parseInt(match[1], 10),
    denominator: parseInt(match[2], 10)
  };
}

function timeSignatureCompatibility(songTimeSignature, candidateTimeSignature) {
  const a = parseTimeSignatureComponents(songTimeSignature);
  const b = parseTimeSignatureComponents(candidateTimeSignature);
  if (!a || !b) return 0;

  if (a.numerator === b.numerator && a.denominator === b.denominator) return 1;

  const pulseA = a.numerator * (4 / a.denominator);
  const pulseB = b.numerator * (4 / b.denominator);
  if (Math.abs(pulseA - pulseB) < 0.001) return 0.75;

  if (a.numerator === b.numerator) return 0.5;
  return 0;
}

function parseTempoValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const text = normalizeToken(value);
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTempoBand(value) {
  const numericTempo = parseTempoValue(value);
  if (numericTempo !== null) {
    if (numericTempo < 76) return 'slow';
    if (numericTempo <= 120) return 'medium';
    return 'fast';
  }

  const text = normalizeToken(value);
  if (!text) return '';
  if (/slow|lento|adagio/.test(text)) return 'slow';
  if (/medium|moderate|mid/.test(text)) return 'medium';
  if (/fast|quick|allegro|upbeat/.test(text)) return 'fast';
  return '';
}

function tempoCompatibility(songTempo, candidateTempo) {
  const songBand = normalizeTempoBand(songTempo);
  const candidateBand = normalizeTempoBand(candidateTempo);

  if (!songBand || !candidateBand) return 0;
  if (songBand === candidateBand) return 1;

  const order = ['slow', 'medium', 'fast'];
  const distance = Math.abs(order.indexOf(songBand) - order.indexOf(candidateBand));
  if (distance === 1) return 0.5;
  return 0;
}

function overlapRatio(songTokens, candidateTokens) {
  if (!songTokens.size || !candidateTokens.size) return 0;
  let matches = 0;
  songTokens.forEach(token => {
    if (candidateTokens.has(token)) matches += 1;
  });
  return matches / songTokens.size;
}

function getWeight(key) {
  const parsed = Number(recommendationWeights[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getSetTraits(rhythmSet) {
  const rhythmSetId = String(rhythmSet && rhythmSet.rhythmSetId ? rhythmSet.rhythmSetId : '').toLowerCase();
  const metadataTraits = rhythmSetTraitsById.get(rhythmSetId);

  const traits = {
    taals: new Set(),
    timeSignatures: new Set(),
    tempos: new Set(),
    genres: new Set(),
    moods: new Set()
  };

  const family = normalizeRhythmFamily(rhythmSet && rhythmSet.rhythmFamily);
  if (family) traits.taals.add(family);

  const directTime = normalizeTimeSignature(rhythmSet && (rhythmSet.timeSignature || rhythmSet.time));
  if (directTime) traits.timeSignatures.add(directTime);

  const directTempo = normalizeTempoBand(rhythmSet && rhythmSet.tempo);
  if (directTempo) traits.tempos.add(directTempo);

  splitToTokenSet(rhythmSet && rhythmSet.genre).forEach(token => traits.genres.add(token));
  splitToTokenSet(rhythmSet && rhythmSet.mood).forEach(token => traits.moods.add(token));

  if (metadataTraits) {
    metadataTraits.taals.forEach(token => traits.taals.add(token));
    metadataTraits.timeSignatures.forEach(token => traits.timeSignatures.add(token));
    metadataTraits.tempos.forEach(token => traits.tempos.add(token));
    metadataTraits.genres.forEach(token => traits.genres.add(token));
    metadataTraits.moods.forEach(token => traits.moods.add(token));
  }

  return traits;
}

function scoreRecommendation(song, rhythmSet) {
  const reasons = [];
  let weightedScore = 0;
  let totalWeight = 0;

  const traits = getSetTraits(rhythmSet);
  const songTaal = normalizeRhythmFamily(song.taal || song.rhythmFamily || '');
  if (songTaal) {
    const taalWeight = getWeight('taal');
    totalWeight += taalWeight;

    let taalScore = 0;
    if (traits.taals.has(songTaal)) {
      taalScore = 1;
      reasons.push(`taal match (${songTaal})`);
    } else if ([...traits.taals].some(token => token.includes(songTaal) || songTaal.includes(token))) {
      taalScore = 0.65;
      reasons.push(`taal near-match (${songTaal})`);
    }
    weightedScore += taalWeight * taalScore;
  }

  const songTimeSignature = normalizeTimeSignature(song.timeSignature || song.time);
  if (songTimeSignature) {
    const timeWeight = getWeight('timeSignature');
    totalWeight += timeWeight;

    let bestTimeScore = 0;
    traits.timeSignatures.forEach(candidate => {
      bestTimeScore = Math.max(bestTimeScore, timeSignatureCompatibility(songTimeSignature, candidate));
    });

    weightedScore += timeWeight * bestTimeScore;
    if (bestTimeScore >= 1) {
      reasons.push(`time-signature match (${songTimeSignature})`);
    } else if (bestTimeScore > 0) {
      reasons.push(`time-signature compatible (${songTimeSignature})`);
    }
  }

  const songTempo = song.tempo;
  if (songTempo) {
    const tempoWeight = getWeight('tempo');
    totalWeight += tempoWeight;

    let bestTempoScore = 0;
    traits.tempos.forEach(candidate => {
      bestTempoScore = Math.max(bestTempoScore, tempoCompatibility(songTempo, candidate));
    });

    weightedScore += tempoWeight * bestTempoScore;
    if (bestTempoScore >= 1) {
      reasons.push(`tempo match (${normalizeTempoBand(songTempo)})`);
    } else if (bestTempoScore > 0) {
      reasons.push(`tempo near-match (${normalizeTempoBand(songTempo)})`);
    }
  }

  const songGenres = splitToTokenSet(song.genre || song.genres || song.subGenres);
  if (songGenres.size) {
    const genreWeight = getWeight('genre');
    totalWeight += genreWeight;
    const genreScore = overlapRatio(songGenres, traits.genres);
    weightedScore += genreWeight * genreScore;
    if (genreScore > 0) {
      reasons.push(`genre overlap (${Math.round(genreScore * 100)}%)`);
    }
  }

  const songMoods = splitToTokenSet(song.mood || song.moods);
  if (songMoods.size) {
    const moodWeight = getWeight('mood');
    totalWeight += moodWeight;
    const moodScore = overlapRatio(songMoods, traits.moods);
    weightedScore += moodWeight * moodScore;
    if (moodScore > 0) {
      reasons.push(`mood overlap (${Math.round(moodScore * 100)}%)`);
    }
  }

  const categoryWeight = getWeight('rhythmCategory');
  if (categoryWeight > 0) {
    totalWeight += categoryWeight;
    const completeScore = rhythmSet.isComplete ? 1 : 0.35;
    weightedScore += categoryWeight * completeScore;
    if (rhythmSet.isComplete) {
      reasons.push('complete loop pack (6/6)');
    }
  }

  // Keep archived sets available for visibility but strongly deprioritize them.
  if (String(rhythmSet.status || '').toLowerCase() === 'archived') {
    weightedScore *= 0.2;
    reasons.push('archived status penalty');
  }

  const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  return {
    rhythmSet,
    normalizedScore,
    weightedScore,
    totalWeight,
    reasons
  };
}

function calculateConfidence(topScore, runnerUpScore) {
  const separation = Math.max(0, topScore - runnerUpScore);
  const confidence = Math.round(Math.min(100, (topScore * 72 + separation * 28) * 100));
  if (confidence >= 80) return { value: confidence, label: 'High' };
  if (confidence >= 55) return { value: confidence, label: 'Medium' };
  return { value: confidence, label: 'Low' };
}

async function ensureRecommendationWeightsLoaded() {
  if (recommendationWeightsLoaded) return;

  recommendationWeightsLoaded = true;
  try {
    const response = await fetchWithBackendFallback('/api/recommendation-weights');
    if (!response.ok) return;
    const payload = await response.json();
    recommendationWeights = {
      ...DEFAULT_RECOMMENDATION_WEIGHTS,
      ...payload
    };
  } catch (error) {
    console.warn('Using default recommendation weights:', error);
  }
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

    const songRouteId = getSongRouteId(selectedSong);
    if (!songRouteId) {
      throw new Error('Selected song is missing a valid identifier.');
    }

    const parsedRhythmSet = parseRhythmSetId(rhythmSetId);
    const requestBody = parsedRhythmSet
      ? {
          rhythmSetId: parsedRhythmSet.rhythmSetId,
          rhythmFamily: parsedRhythmSet.rhythmFamily,
          rhythmSetNo: parsedRhythmSet.rhythmSetNo
        }
      : { rhythmSetId };

    const response = await fetchWithBackendFallback(`/api/songs/${encodeURIComponent(songRouteId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const updatedSong = await response.json().catch(() => null);

    setInfo(`✓ Assigned ${rhythmSetId} to ${selectedSong.title}`);
    
    // Update local data
    if (updatedSong && normalizeSongNumericId(updatedSong.id)) {
      selectedSong.id = normalizeSongNumericId(updatedSong.id);
    }
    selectedSong.rhythmSetId = rhythmSetId;
    if (requestBody.rhythmFamily) {
      selectedSong.rhythmFamily = requestBody.rhythmFamily;
    }
    if (requestBody.rhythmSetNo) {
      selectedSong.rhythmSetNo = requestBody.rhythmSetNo;
    }

    const selectedIdentity = getSongIdentityKey(selectedSong);
    const songIndex = allSongs.findIndex(s => matchesSongIdentity(s, selectedIdentity));
    if (songIndex !== -1) {
      allSongs[songIndex].rhythmSetId = rhythmSetId;
      if (requestBody.rhythmFamily) {
        allSongs[songIndex].rhythmFamily = requestBody.rhythmFamily;
      }
      if (requestBody.rhythmSetNo) {
        allSongs[songIndex].rhythmSetNo = requestBody.rhythmSetNo;
      }
    }

    updateSelectedSongCard();
    updateStartupEditorFromSelectedSong();
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

async function saveSelectedSongStartupConfig() {
  if (!selectedSong) {
    setInfo('Please select a song first.');
    return;
  }

  const token = getToken();
  if (!token) {
    setInfo('Login required.');
    return;
  }

  const rhythmSetId = getSelectedRhythmSetForStartup();
  if (!rhythmSetId) {
    setInfo('Select or assign a rhythm set before saving startup config.');
    return;
  }

  const { availableLoops, availableFills } = getAvailableStartupSlotsForRhythmSet(rhythmSetId);
  const startLoop = normalizeStartupLoop(document.getElementById('startupLoopSelect')?.value, availableLoops);
  const startFill = normalizeStartupFill(document.getElementById('startupFillSelect')?.value, availableFills);
  const tempoPercent = normalizeStartupTempo(document.getElementById('startupTempoInput')?.value);

  const startupConfig = {
    rhythmSetId,
    startLoop,
    startFill: startFill || null,
    tempoPercent
  };

  const songRouteId = getSongRouteId(selectedSong);
  if (!songRouteId) {
    setInfo('Selected song is missing a valid identifier.');
    return;
  }

  try {
    setInfo(`Saving startup config for ${selectedSong.title}...`);
    const response = await fetchWithBackendFallback(`/api/songs/${encodeURIComponent(songRouteId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ loopStartConfig: startupConfig })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const updatedSong = await response.json().catch(() => null);
    const persistedConfig = getStartupConfigFromSong(updatedSong || selectedSong, rhythmSetId);
    selectedSong.loopStartConfig = {
      rhythmSetId,
      startLoop: persistedConfig.startLoop,
      startFill: persistedConfig.startFill || null,
      tempoPercent: persistedConfig.tempoPercent
    };

    const selectedIdentity = getSongIdentityKey(selectedSong);
    const songIndex = allSongs.findIndex(s => matchesSongIdentity(s, selectedIdentity));
    if (songIndex !== -1) {
      allSongs[songIndex].loopStartConfig = { ...selectedSong.loopStartConfig };
    }

    updateSelectedSongCard();
    updateStartupEditorFromSelectedSong();
    renderPreviewButtons(document.getElementById('mapperRhythmSetSelect').value || rhythmSetId);
    setInfo(`✓ Saved startup config (${persistedConfig.startLoop.toUpperCase()}${persistedConfig.startFill ? ` + ${persistedConfig.startFill.toUpperCase()}` : ''}, ${persistedConfig.tempoPercent}%).`);
  } catch (error) {
    console.error('Failed to save startup config:', error);
    setInfo(`Startup config save failed: ${error.message}`);
  }
}

function resetSelectedSongStartupDefaults() {
  const loopSelect = document.getElementById('startupLoopSelect');
  const fillSelect = document.getElementById('startupFillSelect');
  const tempoInput = document.getElementById('startupTempoInput');
  if (loopSelect) loopSelect.value = DEFAULT_STARTUP_CONFIG.startLoop;
  if (fillSelect) fillSelect.value = '';
  if (tempoInput) tempoInput.value = String(DEFAULT_STARTUP_CONFIG.tempoPercent);
  updateStartupEditorFromSelectedSong();
}

async function recommendForSelectedSong() {
  if (!selectedSong) {
    setInfo('Please select a song first.');
    return;
  }

  if (!allRhythmSets.length) {
    setInfo('No rhythm sets available for recommendation.');
    return;
  }

  await ensureRecommendationWeightsLoaded();

  const scored = allRhythmSets
    .map(rhythmSet => scoreRecommendation(selectedSong, rhythmSet))
    .sort((a, b) => b.normalizedScore - a.normalizedScore);

  const top = scored[0];
  if (!top) {
    setInfo('No recommendation available.');
    return;
  }

  const runnerUp = scored[1];
  const confidence = calculateConfidence(top.normalizedScore, runnerUp ? runnerUp.normalizedScore : 0);
  const reasonText = top.reasons.length ? top.reasons.slice(0, 4).join(', ') : 'fallback to best available set';

  document.getElementById('mapperRhythmSetSelect').value = top.rhythmSet.rhythmSetId;
  updateSelectedSetMeta();
  renderPreviewButtons(top.rhythmSet.rhythmSetId);

  const scorePercent = Math.round(top.normalizedScore * 100);
  setInfo(`✓ Recommended: ${top.rhythmSet.rhythmSetId} | Score: ${scorePercent}% | Confidence: ${confidence.label} (${confidence.value}%) | Why: ${reasonText}`);
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

function setStats() {
  document.getElementById('statTotal').textContent = String(allRhythmSets.length);
  document.getElementById('statComplete').textContent = String(allRhythmSets.filter(item => item.isComplete).length);
  document.getElementById('statBackend').textContent = ACTIVE_API_BASE_URL.includes('vercel') ? 'Vercel' : ACTIVE_API_BASE_URL.includes('render') ? 'Render' : 'Local';
  updateMappedStats();
}

function renderRhythmSetsTable() {
  renderRows(allRhythmSets);
}

async function loadRhythmSets() {
  await loadData();
  return allRhythmSets;
}

async function saveRhythmSetRow(row) {
  if (!row) return;
  const rhythmSetId = row.rhythmSetId || row.id || row.dataset?.id;
  if (!rhythmSetId) return;
  await saveRhythmSet(rhythmSetId);
}

function getRenamePayloadFromRow(row) {
  if (!row) return null;

  const oldRhythmSetId = String(row.rhythmSetId || row.id || row.dataset?.id || '').trim();
  if (!oldRhythmSetId) return null;

  const rhythmFamily = String(row.newRhythmFamily || row.rhythmFamily || '').trim();
  const rawSetNo = row.newRhythmSetNo ?? row.rhythmSetNo ?? row.setNo;
  const parsedSetNo = parseInt(rawSetNo, 10);
  const status = row.status || getSelectedStatusFor(oldRhythmSetId) || 'active';
  const notes = typeof row.notes === 'string' ? row.notes : '';

  const body = {
    status,
    notes
  };

  if (rhythmFamily) body.rhythmFamily = rhythmFamily;
  if (Number.isInteger(parsedSetNo) && parsedSetNo > 0) body.rhythmSetNo = parsedSetNo;

  const nextRhythmSetId = buildRhythmSetId(rhythmFamily, parsedSetNo);
  if (nextRhythmSetId && nextRhythmSetId !== oldRhythmSetId) {
    body.newRhythmSetId = nextRhythmSetId;
  }

  return { oldRhythmSetId, body };
}

async function renameRhythmSetRow(row) {
  const payload = getRenamePayloadFromRow(row);
  if (!payload) {
    setInfo('Rename failed: invalid rhythm set payload.');
    return;
  }

  const token = getAuthToken();

  try {
    setInfo(`Renaming ${payload.oldRhythmSetId}...`);
    const response = await authFetch(`/api/rhythm-sets/${encodeURIComponent(payload.oldRhythmSetId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload.body)
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    setInfo(`Renamed to ${body.rhythmSetId || payload.oldRhythmSetId}.`);
    await loadData();
  } catch (error) {
    setInfo(`Rename failed: ${error.message}`);
  }
}

function wireEvents() {
  const refreshButton = document.getElementById('refreshAllBtn') || document.getElementById('refreshBtn');
  if (refreshButton && !refreshButton.dataset.boundClick) {
    refreshButton.addEventListener('click', loadData);
    refreshButton.dataset.boundClick = 'true';
  }

  const createButton = document.getElementById('createBtn');
  if (createButton && !createButton.dataset.boundClick) {
    createButton.addEventListener('click', createRhythmSet);
    createButton.dataset.boundClick = 'true';
  }

  const rows = document.getElementById('rows');
  if (rows && !rows.dataset.boundClick) {
    rows.addEventListener('click', event => {
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
    rows.dataset.boundClick = 'true';
  }

  const songSearchInput = document.getElementById('songSearchInput');
  if (songSearchInput && !songSearchInput.dataset.boundKeyup) {
    songSearchInput.addEventListener('keyup', filterSongs);
    songSearchInput.dataset.boundKeyup = 'true';
  }

  const assignBtn = document.getElementById('assignBtn');
  if (assignBtn && !assignBtn.dataset.boundClick) {
    assignBtn.addEventListener('click', assignSelectedRhythmSet);
    assignBtn.dataset.boundClick = 'true';
    assignBtn.disabled = true;
  }

  const recommendBtn = document.getElementById('recommendBtn');
  if (recommendBtn && !recommendBtn.dataset.boundClick) {
    recommendBtn.addEventListener('click', recommendForSelectedSong);
    recommendBtn.dataset.boundClick = 'true';
    recommendBtn.disabled = true;
  }

  const stopPreviewBtn = document.getElementById('stopPreviewBtn');
  if (stopPreviewBtn && !stopPreviewBtn.dataset.boundClick) {
    stopPreviewBtn.addEventListener('click', stopPreview);
    stopPreviewBtn.dataset.boundClick = 'true';
  }

  const mapperRhythmSetSelect = document.getElementById('mapperRhythmSetSelect');
  if (mapperRhythmSetSelect && !mapperRhythmSetSelect.dataset.boundChange) {
    mapperRhythmSetSelect.addEventListener('change', event => {
      updateSelectedSetMeta();
      renderPreviewButtons(event.target.value);
      updateStartupEditorFromSelectedSong();
    });
    mapperRhythmSetSelect.dataset.boundChange = 'true';
  }

  const saveStartupBtn = document.getElementById('saveStartupBtn');
  if (saveStartupBtn && !saveStartupBtn.dataset.boundClick) {
    saveStartupBtn.addEventListener('click', saveSelectedSongStartupConfig);
    saveStartupBtn.dataset.boundClick = 'true';
    saveStartupBtn.disabled = true;
  }

  const resetStartupBtn = document.getElementById('resetStartupBtn');
  if (resetStartupBtn && !resetStartupBtn.dataset.boundClick) {
    resetStartupBtn.addEventListener('click', resetSelectedSongStartupDefaults);
    resetStartupBtn.dataset.boundClick = 'true';
    resetStartupBtn.disabled = true;
  }

  const startupInputIds = ['startupLoopSelect', 'startupFillSelect', 'startupTempoInput'];
  startupInputIds.forEach(elementId => {
    const element = document.getElementById(elementId);
    if (!element || element.dataset.boundStartupChange) return;
    element.addEventListener('change', updateStartupEditorFromSelectedSong);
    element.dataset.boundStartupChange = 'true';
  });
}

function initializeData() {
  return loadData();
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
    const traitsMap = new Map();
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

      if (!traitsMap.has(rhythmSetId)) {
        traitsMap.set(rhythmSetId, {
          taals: new Set(),
          timeSignatures: new Set(),
          tempos: new Set(),
          genres: new Set(),
          moods: new Set()
        });
      }

      const traits = traitsMap.get(rhythmSetId);
      const conditions = loop && loop.conditions ? loop.conditions : {};

      const taal = normalizeRhythmFamily(conditions.taal || loop.rhythmFamily || '');
      if (taal) traits.taals.add(taal);

      const timeSignature = normalizeTimeSignature(conditions.timeSignature || loop.timeSignature || loop.time || '');
      if (timeSignature) traits.timeSignatures.add(timeSignature);

      const tempoBand = normalizeTempoBand(conditions.tempo || loop.tempo || '');
      if (tempoBand) traits.tempos.add(tempoBand);

      splitToTokenSet(conditions.genre || loop.genre || '').forEach(token => traits.genres.add(token));
      splitToTokenSet(conditions.mood || loop.mood || '').forEach(token => traits.moods.add(token));
    });

    loopsByRhythmSet = map;
    rhythmSetTraitsById = traitsMap;
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
    const startupConfig = selectedSong ? getStartupConfigFromSong(selectedSong, rhythmSetId) : null;
    const startupApplies = startupConfig && String(startupConfig.rhythmSetId || '').toLowerCase() === String(rhythmSetId || '').toLowerCase();
    if (startupApplies && (startupConfig.startLoop === fileKey || startupConfig.startFill === fileKey)) {
      btn.classList.add('startup-highlight');
      btn.title = `Startup ${startupConfig.startLoop === fileKey ? 'loop' : 'fill'} for selected song`;
    }
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
    updateStartupEditorFromSelectedSong();
    setInfo('Data loaded successfully.');
  } catch (error) {
    console.error('Rhythm sets manager load failed:', error);
    setInfo(`Failed to load rhythm sets: ${error.message}`);
    renderRows([]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyThemeFromStorage();
  wireEvents();
  initializeData();
});
