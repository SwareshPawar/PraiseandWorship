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
const COMPLETE_KEYS = ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'];

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

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function setInfo(message) {
  const info = document.getElementById('info');
  info.textContent = message;
}

function fileKey(loop) {
  return `${loop.type || ''}${loop.number || ''}`;
}

function buildSetMap(loops) {
  const map = new Map();
  loops.forEach(loop => {
    const id = (loop.rhythmSetId || '').toLowerCase();
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, {
        rhythmSetId: loop.rhythmSetId,
        rhythmFamily: loop.rhythmFamily || (loop.conditions && loop.conditions.taal) || '',
        rhythmSetNo: loop.rhythmSetNo || loop.setNo || 1,
        files: new Set(),
        sample: []
      });
    }
    const set = map.get(id);
    set.files.add(fileKey(loop));
    if (loop.filename && set.sample.length < 3) {
      set.sample.push(loop.filename);
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.rhythmFamily !== b.rhythmFamily) {
      return String(a.rhythmFamily).localeCompare(String(b.rhythmFamily));
    }
    return (a.rhythmSetNo || 0) - (b.rhythmSetNo || 0);
  });
}

function getLoopConditions(loop) {
  const conditions = loop.conditions || {};
  return [conditions.taal, conditions.timeSignature, conditions.tempo, conditions.genre].filter(Boolean).join(' | ');
}

function renderRows(loops) {
  const tbody = document.getElementById('rows');
  tbody.innerHTML = '';

  if (!loops.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7">No loop metadata found.</td>';
    tbody.appendChild(tr);
    return;
  }

  loops.forEach(loop => {
    const tr = document.createElement('tr');
    const replaceInputId = `replace-${loop.id}`;
    tr.innerHTML = `
      <td>${loop.id || '-'}</td>
      <td>${loop.rhythmSetId || '-'}</td>
      <td>${loop.type || '-'}</td>
      <td>${loop.number || '-'}</td>
      <td>${loop.filename || '-'}</td>
      <td>${getLoopConditions(loop) || '-'}</td>
      <td>
        <input id="${replaceInputId}" type="file" accept="audio/*" style="display:none;">
        <button class="btn" data-action="replace" data-id="${loop.id}" data-input="${replaceInputId}">Replace</button>
        <button class="btn secondary" data-action="delete" data-id="${loop.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function uploadSingleLoop() {
  const token = getToken();
  if (!token) {
    setInfo('Login required. Open the main app and sign in first.');
    return;
  }
  if (!isAdminToken(token)) {
    setInfo('Admin token required for write operations.');
    return;
  }

  const rhythmFamily = document.getElementById('rhythmFamily').value;
  const rhythmSetNo = document.getElementById('rhythmSetNo').value;
  const timeSignature = document.getElementById('timeSignature').value;
  const tempo = document.getElementById('tempo').value;
  const genre = document.getElementById('genre').value;
  const type = document.getElementById('loopType').value;
  const number = document.getElementById('loopNumber').value;
  const file = document.getElementById('loopFile').files[0];

  if (!rhythmFamily || !rhythmSetNo || !timeSignature || !tempo || !genre || !type || !number || !file) {
    setInfo('Please provide all upload fields and choose a file.');
    return;
  }

  try {
    setInfo('Uploading loop...');
    const base64 = await fileToBase64(file);
    const response = await fetchWithBackendFallback('/api/loops/upload-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ rhythmFamily, rhythmSetNo, timeSignature, tempo, genre, type, number, base64 })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`Uploaded ${payload.filename || 'loop'} successfully.`);
    document.getElementById('loopFile').value = '';
    await loadData();
  } catch (error) {
    setInfo(`Upload failed: ${error.message}`);
  }
}

async function replaceLoop(loopId, fileInputId) {
  const token = getToken();
  const input = document.getElementById(fileInputId);
  const file = input && input.files && input.files[0];

  if (!file) {
    setInfo('Choose a file to replace this loop.');
    return;
  }

  try {
    setInfo(`Replacing ${loopId}...`);
    const base64 = await fileToBase64(file);
    const response = await fetchWithBackendFallback(`/api/loops/${encodeURIComponent(loopId)}/replace`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ base64 })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`Replaced ${payload.filename || loopId}.`);
    await loadData();
  } catch (error) {
    setInfo(`Replace failed: ${error.message}`);
  }
}

async function deleteLoop(loopId) {
  const token = getToken();
  if (!confirm(`Delete loop ${loopId}?`)) return;

  try {
    setInfo(`Deleting ${loopId}...`);
    const response = await fetchWithBackendFallback(`/api/loops/${encodeURIComponent(loopId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    setInfo(`Deleted ${loopId}.`);
    await loadData();
  } catch (error) {
    setInfo(`Delete failed: ${error.message}`);
  }
}

function populateRhythmFamilyDropdown(rhythmSets) {
  const select = document.getElementById('rhythmFamily');
  if (!select) return;

  const currentValue = select.value;
  const families = new Set();

  if (Array.isArray(rhythmSets)) {
    rhythmSets.forEach(set => {
      if (set.rhythmFamily) {
        families.add(set.rhythmFamily);
      }
    });
  }

  select.innerHTML = '<option value="">Select Rhythm Family</option>';
  Array.from(families).sort().forEach(family => {
    const option = document.createElement('option');
    option.value = family;
    option.textContent = family;
    select.appendChild(option);
  });

  if (currentValue && families.has(currentValue)) {
    select.value = currentValue;
  }
}

async function loadData() {
  setInfo('Loading metadata...');
  try {
    const response = await fetchWithBackendFallback('/api/loops/metadata');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const loops = Array.isArray(payload.loops) ? payload.loops : [];
    const rhythmSets = Array.isArray(payload.rhythmSets) ? payload.rhythmSets : [];
    const sets = buildSetMap(loops);
    const complete = sets.filter(set => COMPLETE_KEYS.every(k => set.files.has(k))).length;

    document.getElementById('statLoops').textContent = String(loops.length);
    document.getElementById('statSets').textContent = String(sets.length);
    document.getElementById('statComplete').textContent = String(complete);
    document.getElementById('statBackend').textContent = ACTIVE_API_BASE_URL.includes('vercel') ? 'Vercel' : ACTIVE_API_BASE_URL.includes('render') ? 'Render' : 'Local';

    populateRhythmFamilyDropdown(rhythmSets);
    renderRows(loops);
    setInfo('Loaded. Upload/replace/delete enabled for admins.');
  } catch (error) {
    console.error('Loop manager read-only load failed:', error);
    setInfo(`Failed to load data: ${error.message}`);
    renderRows([]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  document.getElementById('uploadBtn').addEventListener('click', uploadSingleLoop);
  document.getElementById('rows').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const loopId = button.dataset.id;
    if (action === 'replace') {
      const inputId = button.dataset.input;
      const input = document.getElementById(inputId);
      if (input && (!input.files || !input.files.length)) {
        input.click();
        input.onchange = () => replaceLoop(loopId, inputId);
      } else {
        replaceLoop(loopId, inputId);
      }
    }
    if (action === 'delete') {
      deleteLoop(loopId);
    }
  });
  loadData();
});
