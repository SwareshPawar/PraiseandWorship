// Loop & Rhythm Set Manager
const API_BASE_URL = window.AppApiBase.resolve();
const normalizeRhythmFamily = window.RhythmSetUtils.normalizeRhythmFamily;
const buildRhythmSetId = window.RhythmSetUtils.buildRhythmSetId;
const deriveRhythmSetFields = window.RhythmSetUtils.deriveRhythmSetFields;

let rhythmSets = [];
let selectedRhythmSet = null;
let isReadOnlyMode = false;
let swapState = null; // Track swap selection: { rhythmSetId, loopType, filename }
let externalLoopSources = [];
let externalLoopLibrary = [];
let activeExternalSourceId = '';
let loopFiles = {
    loop1: null,
    loop2: null,
    loop3: null,
    fill1: null,
    fill2: null,
    fill3: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    reorderLoopPanels();
    initializePanelCollapses();
    setupQuickPlayListeners();
    await loadRhythmSets();
    await loadExternalLoopSources();
    setupRhythmFamilyListener();
});

function reorderLoopPanels() {
    const internalPanel = document.getElementById('internalLoopLibraryPanel');
    const externalPanel = document.getElementById('externalLoopLibraryPanel');
    if (!internalPanel || !externalPanel) return;

    const parent = externalPanel.parentNode;
    if (!parent || parent !== internalPanel.parentNode) return;

    if (internalPanel.compareDocumentPosition(externalPanel) & Node.DOCUMENT_POSITION_PRECEDING) {
        // Internal already appears before external.
        return;
    }

    parent.insertBefore(internalPanel, externalPanel);
}

function setPanelCollapseState(contentId, buttonId, isCollapsed, sectionName) {
    const content = document.getElementById(contentId);
    const button = document.getElementById(buttonId);
    if (!content || !button) return;

    content.style.display = isCollapsed ? 'none' : '';
    button.dataset.collapsed = isCollapsed ? 'true' : 'false';
    button.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    button.innerHTML = isCollapsed
        ? `<i class="fas fa-chevron-down"></i> Show ${sectionName}`
        : `<i class="fas fa-chevron-up"></i> Hide ${sectionName}`;
}

function initializePanelCollapses() {
    setPanelCollapseState('externalLoopLibraryContent', 'externalLoopLibraryCollapseBtn', true, 'External Loops');
    setPanelCollapseState('internalLoopLibraryContent', 'internalLoopLibraryCollapseBtn', true, 'Internal Loops');
}

function togglePanelCollapse(contentId, buttonId, sectionName) {
    const button = document.getElementById(buttonId);
    const isCollapsed = (button?.dataset?.collapsed || 'true') === 'true';
    setPanelCollapseState(contentId, buttonId, !isCollapsed, sectionName);
}

// Ensure inline onclick handlers can always find these functions.
window.togglePanelCollapse = togglePanelCollapse;
window.syncAllExternalLoops = syncAllExternalLoops;
window.syncNotesOnly = syncNotesOnly;

function buildNotesSummary(result) {
    if (!result) return '';
    if (!result.notesAvailable) return ' Notes not available from source.';
    if (result.updatedCount > 0) return ` Notes synced: ${result.updatedCount} updated.`;
    if (result.matchedRhythmSetCount > 0) {
        const withNotes = result.matchedRhythmSetCount - (result.blankCount || 0);
        return ` Notes already up to date (${withNotes} sets have notes).`;
    }
    return ' No matching rhythm sets found for notes.';
}

async function syncNotesOnly() {
    if (!ensureWriteAccess()) return;

    const sourceId = activeExternalSourceId || document.getElementById('externalLoopSourceSelect')?.value || 'oldandnew';
    const btn = document.getElementById('syncNotesBtn');
    const originalLabel = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing notes...';
    }

    try {
        setExternalLibraryStatus('Fetching notes from OldandNew...');
        const response = await authFetch(`${API_BASE_URL}/api/external-loop-sources/${sourceId}/sync-notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        const summary = buildNotesSummary(result);
        await loadRhythmSets();
        showAlert(`Notes sync complete.${summary}`, result.updatedCount > 0 ? 'success' : 'success');
        setExternalLibraryStatus(`Notes sync done.${summary}`);
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') { handleAuthRequired(); return; }
        showAlert(`Notes sync failed: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalLabel;
        }
    }
}

async function authFetch(url, options = {}) {
    const response = await window.AppAuth.authFetch(url, {
        suppressAuthRedirect: true,
        loginUrl: 'index.html',
        ...options
    });

    if (!response.ok) {
        let errorPayload = null;
        let errorMessage = `Request failed with status ${response.status}`;

        try {
            errorPayload = await response.clone().json();
            errorMessage = errorPayload.error || errorPayload.message || errorMessage;
        } catch (jsonError) {
            try {
                const errorText = await response.clone().text();
                if (errorText) {
                    errorMessage = errorText;
                }
            } catch (textError) {
                // Keep the default status-based message.
            }
        }

        const requestError = new Error(errorMessage);
        requestError.status = response.status;
        if (errorPayload && typeof errorPayload === 'object') {
            requestError.payload = errorPayload;
        }
        throw requestError;
    }

    return response;
}

function handleAuthRequired() {
    showAlert('Session expired. Please login again.', 'error');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 2000);
}

function ensureWriteAccess() {
    if (isReadOnlyMode || !window.AppAuth.hasToken()) {
        showAlert('Read-only mode: login required for create/edit/upload/delete actions.', 'error');
        return false;
    }
    return true;
}

async function loadRhythmSets() {
    try {
        const hasToken = window.AppAuth.hasToken();

        if (hasToken) {
            const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`, { suppressAuthRedirect: true });
            rhythmSets = await response.json();
            isReadOnlyMode = false;
        } else {
            rhythmSets = await loadPublicRhythmSetsFromMetadata();
            isReadOnlyMode = true;
        }

        console.log('Loaded rhythm sets:', rhythmSets.length);
        console.log('Loop manager API base URL:', API_BASE_URL);
        // Debug: Show first set's data structure
        if (rhythmSets.length > 0) {
            console.log('Sample rhythm set:', rhythmSets[0]);
            console.log('availableFiles:', rhythmSets[0].availableFiles);
            console.log('files mapping:', rhythmSets[0].files);
            console.log('conditionsHint:', rhythmSets[0].conditionsHint);
        }
        applyReadOnlyModeUI();
        populateRhythmFamilyList();
        renderRhythmSetsTable();
        updateQuickPlayControls();
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            try {
                rhythmSets = await loadPublicRhythmSetsFromMetadata();
                isReadOnlyMode = true;
                applyReadOnlyModeUI();
                populateRhythmFamilyList();
                renderRhythmSetsTable();
                updateQuickPlayControls();
                showAlert('Loaded in read-only mode. Login for upload/edit actions.', 'success');
                return;
            } catch (fallbackError) {
                showAlert('Error loading rhythm sets: ' + fallbackError.message, 'error');
                return;
            }
        }
        showAlert('Error loading rhythm sets: ' + error.message, 'error');
    }
}

function setExternalLibraryStatus(message) {
    const status = document.getElementById('externalLoopLibraryStatus');
    if (status) {
        status.textContent = message;
    }
}

function renderExternalLoopLibrary() {
    const tableBody = document.getElementById('externalLoopLibraryTableBody');
    if (!tableBody) {
        return;
    }

    if (!window.AppAuth.hasToken()) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center;">Login as admin to browse and import external loops.</td>
            </tr>
        `;
        return;
    }

    if (!activeExternalSourceId) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center;">No external source available.</td>
            </tr>
        `;
        return;
    }

    if (!externalLoopLibrary.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center;">No importable loop groups found in this source.</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = externalLoopLibrary.map(group => {
        const targetId = group.rhythmSetId || 'Manual target required';
        const importDisabled = group.importableAsRhythmSet ? '' : 'disabled';
        const slots = (group.availableFiles || []).map(slot => `<span class="badge badge-info">${slot}</span>`).join(' ');
        return `
            <tr>
                <td>
                    <div>${group.sourceRhythmSetId}</div>
                    <div class="library-source-tag">${group.sourceLabel}</div>
                </td>
                <td>${targetId}</td>
                <td>${slots || '<span class="badge badge-warning">No slots</span>'}</td>
                <td>
                    <button class="btn btn-success" ${importDisabled} onclick="importExternalRhythmSet('${group.sourceId}', '${group.sourceRhythmSetId}', '${group.rhythmSetId || ''}')">
                        <i class="fas fa-file-import"></i> Import Set
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadExternalLoopSources() {
    const select = document.getElementById('externalLoopSourceSelect');
    if (!select) {
        return;
    }

    if (!window.AppAuth.hasToken()) {
        externalLoopSources = [];
        externalLoopLibrary = [];
        activeExternalSourceId = '';
        select.innerHTML = '<option value="">Login required</option>';
        setExternalLibraryStatus('Login as admin to browse OldandNew production loop files.');
        renderExternalLoopLibrary();
        return;
    }

    try {
        setExternalLibraryStatus('Loading external loop sources...');
        const response = await authFetch(`${API_BASE_URL}/api/external-loop-sources`, { suppressAuthRedirect: true });
        externalLoopSources = await response.json();

        const availableSources = externalLoopSources.filter(source => source.available);
        if (!availableSources.length) {
            activeExternalSourceId = '';
            select.innerHTML = '<option value="">No source available</option>';
            externalLoopLibrary = [];
            setExternalLibraryStatus('OldandNew production source is not configured. Set OLDANDNEW_BASE_URL if you need a non-default production host.');
            renderExternalLoopLibrary();
            return;
        }

        activeExternalSourceId = availableSources.some(source => source.id === activeExternalSourceId)
            ? activeExternalSourceId
            : availableSources[0].id;

        select.innerHTML = availableSources.map(source => `
            <option value="${source.id}" ${source.id === activeExternalSourceId ? 'selected' : ''}>${source.label}</option>
        `).join('');

        await loadExternalLoopLibrary(activeExternalSourceId);
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        externalLoopLibrary = [];
        setExternalLibraryStatus(`Unable to load external sources: ${error.message}`);
        renderExternalLoopLibrary();
    }
}

async function loadExternalLoopLibrary(sourceId) {
    const selectedSourceId = sourceId || document.getElementById('externalLoopSourceSelect')?.value || activeExternalSourceId;
    activeExternalSourceId = selectedSourceId || '';

    if (!window.AppAuth.hasToken()) {
        renderExternalLoopLibrary();
        return;
    }

    if (!activeExternalSourceId) {
        externalLoopLibrary = [];
        setExternalLibraryStatus('Select an external source to browse loop groups.');
        renderExternalLoopLibrary();
        return;
    }

    try {
        setExternalLibraryStatus(`Loading loop groups from ${activeExternalSourceId}...`);
        const response = await authFetch(`${API_BASE_URL}/api/external-loop-sources/${activeExternalSourceId}`, { suppressAuthRedirect: true });
        const payload = await response.json();
        externalLoopLibrary = Array.isArray(payload.groups) ? payload.groups : [];
        setExternalLibraryStatus(`Loaded ${externalLoopLibrary.length} loop groups from ${payload.source?.label || activeExternalSourceId}.`);
        renderExternalLoopLibrary();
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        externalLoopLibrary = [];
        setExternalLibraryStatus(`Unable to load external library: ${error.message}`);
        renderExternalLoopLibrary();
    }
}

async function importExternalRhythmSet(sourceId, sourceRhythmSetId, suggestedTargetId) {
    if (!ensureWriteAccess()) {
        return;
    }

    const targetRhythmSetId = window.prompt('Import into PraiseandWorship rhythm set ID:', suggestedTargetId || sourceRhythmSetId || '');
    if (!targetRhythmSetId) {
        return;
    }

    try {
        showAlert(`Importing ${sourceRhythmSetId} into ${targetRhythmSetId}...`, 'success');
        await authFetch(`${API_BASE_URL}/api/external-loop-sources/${sourceId}/import-rhythm-set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceRhythmSetId,
                targetRhythmSetId
            })
        });

        showAlert(`Imported external rhythm set into ${targetRhythmSetId}`, 'success');
        localStorage.setItem('loopFilesReplacedAt', Date.now().toString());
        await loadRhythmSets();
        await loadExternalLoopLibrary(sourceId);
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

async function importExternalLoopToSlot(sourceId, sourceFilename, rhythmSetId, loopType) {
    try {
        showAlert(`Importing ${sourceFilename} into ${rhythmSetId} ${loopType}...`, 'success');
        await authFetch(`${API_BASE_URL}/api/external-loop-sources/${sourceId}/import-loop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceFilename,
                targetRhythmSetId: rhythmSetId,
                targetLoopType: loopType
            })
        });

        showAlert(`${sourceFilename} imported into ${loopType} successfully!`, 'success');
        localStorage.setItem('loopFilesReplacedAt', Date.now().toString());

        const currentRhythmSetId = rhythmSetId;
        await loadRhythmSets();
        const rhythmSetIndex = rhythmSets.findIndex(set => set.rhythmSetId === currentRhythmSetId);
        if (rhythmSetIndex !== -1) {
            setTimeout(() => {
                toggleExpandRow(rhythmSetIndex);
            }, 100);
        }
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

async function syncAllExternalLoops() {
    if (!ensureWriteAccess()) {
        return;
    }

    const syncButton = document.getElementById('syncExternalLoopsBtn');
    const originalLabel = syncButton ? syncButton.innerHTML : '';
    const selectedSourceId = activeExternalSourceId || document.getElementById('externalLoopSourceSelect')?.value || '';

    if (!selectedSourceId) {
        await loadExternalLoopSources();
    }

    const sourceId = activeExternalSourceId || selectedSourceId;
    if (!sourceId) {
        showAlert('No external source available for sync.', 'error');
        return;
    }

    await loadExternalLoopLibrary(sourceId);

    const syncableGroups = externalLoopLibrary.filter(group => group.importableAsRhythmSet && group.rhythmSetId);
    const skippedGroups = externalLoopLibrary.length - syncableGroups.length;

    if (!syncableGroups.length) {
        showAlert('No importable rhythm-set groups found to sync.', 'warning');
        return;
    }

    const shouldProceed = window.confirm(
        `Sync ${syncableGroups.length} rhythm-set group(s) from OldandNew into this repo?\n\n` +
        `${skippedGroups > 0 ? `${skippedGroups} group(s) will be skipped because they do not map to a valid rhythmSetId.` : 'All groups are importable.'}`
    );

    if (!shouldProceed) {
        return;
    }

    if (syncButton) {
        syncButton.disabled = true;
        syncButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sync in progress...';
    }

    let successCount = 0;
    const failedGroups = [];
    let notesSyncResult = null;
    let notesSyncError = null;

    try {
        for (let index = 0; index < syncableGroups.length; index += 1) {
            const group = syncableGroups[index];
            setExternalLibraryStatus(`Syncing ${index + 1}/${syncableGroups.length}: ${group.sourceRhythmSetId} -> ${group.rhythmSetId}`);

            try {
                await authFetch(`${API_BASE_URL}/api/external-loop-sources/${group.sourceId}/import-rhythm-set`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceRhythmSetId: group.sourceRhythmSetId,
                        targetRhythmSetId: group.rhythmSetId
                    })
                });
                successCount += 1;
            } catch (groupError) {
                failedGroups.push({
                    sourceRhythmSetId: group.sourceRhythmSetId,
                    reason: groupError.message
                });
            }
        }

        setExternalLibraryStatus('Syncing notes for imported rhythm sets...');
        try {
            const notesResponse = await authFetch(`${API_BASE_URL}/api/external-loop-sources/${sourceId}/sync-notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            notesSyncResult = await notesResponse.json();
        } catch (noteError) {
            notesSyncError = noteError;
        }

        localStorage.setItem('loopFilesReplacedAt', Date.now().toString());
        await loadRhythmSets();
        await loadExternalLoopLibrary(sourceId);

        const notesSummary = buildNotesSummary(notesSyncResult);

        if (!failedGroups.length && !notesSyncError) {
            showAlert(`Sync complete. Imported ${successCount} rhythm-set group(s) from OldandNew.${notesSummary}`, 'success');
            setExternalLibraryStatus(`Sync complete: ${successCount}/${syncableGroups.length} imported.${notesSummary}`);
            return;
        }

        const failureSummary = failedGroups.slice(0, 3).map(item => item.sourceRhythmSetId).join(', ');
        const importFailureSummary = failedGroups.length
            ? ` Failed: ${failedGroups.length} (${failureSummary}${failedGroups.length > 3 ? ', ...' : ''}).`
            : '';
        const notesErrorSummary = notesSyncError ? ` Notes sync failed: ${notesSyncError.message}.` : notesSummary;
        showAlert(`Sync finished with partial failures. Imported ${successCount}/${syncableGroups.length}.${importFailureSummary}${notesErrorSummary}`, 'warning');
        setExternalLibraryStatus(`Sync partial: ${successCount}/${syncableGroups.length} imported, ${failedGroups.length} failed.${notesErrorSummary}`);
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(`Sync failed: ${error.message}`, 'error');
        setExternalLibraryStatus(`Sync failed: ${error.message}`);
    } finally {
        if (syncButton) {
            syncButton.disabled = false;
            syncButton.innerHTML = originalLabel;
        }
    }
}

function parseRhythmSetParts(rhythmSetId, fallbackFamily = '', fallbackSetNo = 1) {
    return deriveRhythmSetFields(rhythmSetId, fallbackFamily, fallbackSetNo);
}

function buildRhythmSetsFromMetadata(metadata) {
    const loops = Array.isArray(metadata?.loops) ? metadata.loops : [];
    const map = new Map();

    loops.forEach(loop => {
        const normalizedFamily = String(loop?.rhythmFamily || '').trim().toLowerCase().replace(/\s+/g, '_') || 'unknown';
        const normalizedSetNo = parseInt(loop?.rhythmSetNo, 10);
        const derivedSetNo = Number.isInteger(normalizedSetNo) && normalizedSetNo > 0 ? normalizedSetNo : 1;
        const derivedId = String(loop?.rhythmSetId || '').trim().toLowerCase() || `${normalizedFamily}_${derivedSetNo}`;
        const parsed = parseRhythmSetParts(derivedId, normalizedFamily, derivedSetNo);
        const fileType = String(loop?.type || '').trim().toLowerCase();
        const fileNumber = parseInt(loop?.number, 10);
        const fileKey = fileType && Number.isInteger(fileNumber) && fileNumber > 0 ? `${fileType}${fileNumber}` : '';

        if (!map.has(parsed.rhythmSetId)) {
            map.set(parsed.rhythmSetId, {
                rhythmSetId: parsed.rhythmSetId,
                rhythmFamily: parsed.rhythmFamily,
                rhythmSetNo: parsed.rhythmSetNo,
                status: 'active',
                availableFiles: [],
                files: {},
                originalFilenames: {},
                conditionsHint: {
                    taal: String(loop?.conditions?.taal || parsed.rhythmFamily || ''),
                    timeSignature: String(loop?.conditions?.timeSignature || ''),
                    tempo: String(loop?.conditions?.tempo || ''),
                    genre: String(loop?.conditions?.genre || '')
                }
            });
        }

        const set = map.get(parsed.rhythmSetId);
        if (fileKey && loop?.filename) {
            set.files[fileKey] = loop.filename;
            if (!set.availableFiles.includes(fileKey)) {
                set.availableFiles.push(fileKey);
            }
            if (loop.originalFilename) {
                set.originalFilenames[fileKey] = loop.originalFilename;
            }
        }
    });

    const indexedSets = Array.isArray(metadata?.rhythmSets) ? metadata.rhythmSets : [];
    indexedSets.forEach(set => {
        const parsed = parseRhythmSetParts(String(set?.rhythmSetId || ''), String(set?.rhythmFamily || ''), parseInt(set?.rhythmSetNo, 10) || 1);
        if (!map.has(parsed.rhythmSetId)) {
            map.set(parsed.rhythmSetId, {
                rhythmSetId: parsed.rhythmSetId,
                rhythmFamily: parsed.rhythmFamily,
                rhythmSetNo: parsed.rhythmSetNo,
                status: 'active',
                availableFiles: [],
                files: {},
                originalFilenames: {},
                conditionsHint: {
                    taal: parsed.rhythmFamily,
                    timeSignature: '',
                    tempo: '',
                    genre: ''
                }
            });
        }
    });

    return Array.from(map.values()).sort((a, b) => {
        if (a.rhythmFamily !== b.rhythmFamily) {
            return a.rhythmFamily.localeCompare(b.rhythmFamily);
        }
        return a.rhythmSetNo - b.rhythmSetNo;
    });
}

async function loadPublicRhythmSetsFromMetadata() {
    const response = await fetch(`${API_BASE_URL}/api/loops/metadata`);
    if (!response.ok) {
        throw new Error(`Public metadata request failed with status ${response.status}`);
    }

    const metadata = await response.json();
    return buildRhythmSetsFromMetadata(metadata);
}

function applyReadOnlyModeUI() {
    const createPanel = document.getElementById('createRhythmSetPanel');
    const uploadPanel = document.getElementById('uploadLoopsPanel');
    const readOnlyBanner = document.getElementById('readOnlyBanner');

    if (isReadOnlyMode) {
        if (createPanel) createPanel.style.display = 'none';
        if (uploadPanel) uploadPanel.style.display = 'none';
        if (readOnlyBanner) readOnlyBanner.style.display = 'block';
        return;
    }

    if (createPanel) createPanel.style.display = '';
    if (uploadPanel) uploadPanel.style.display = '';
    if (readOnlyBanner) readOnlyBanner.style.display = 'none';
}

function setupQuickPlayListeners() {
    const setSelect = document.getElementById('quickRhythmSetSelect');
    if (setSelect) {
        setSelect.addEventListener('change', () => {
            updateQuickLoopOptions();
        });
    }
}

function updateQuickPlayControls() {
    const setSelect = document.getElementById('quickRhythmSetSelect');
    const setInfo = document.getElementById('quickSetInfo');
    if (!setSelect || !setInfo) return;

    setSelect.innerHTML = '<option value="">Select rhythm set ID...</option>';
    rhythmSets.forEach(set => {
        const availableCount = (set.availableFiles || []).length;
        const option = document.createElement('option');
        option.value = set.rhythmSetId;
        option.textContent = `${set.rhythmSetId} (${availableCount}/6)`;
        setSelect.appendChild(option);
    });

    setInfo.textContent = rhythmSets.length > 0
        ? `${rhythmSets.length} rhythm set IDs loaded. Select one to auto-play LOOP1.`
        : 'No rhythm sets available';
}

async function updateQuickLoopOptions() {
    const setSelect = document.getElementById('quickRhythmSetSelect');
    const quickInfo = document.getElementById('quickSetInfo');
    if (!setSelect || !quickInfo) return;

    const rhythmSetId = setSelect.value;
    const selectedSet = rhythmSets.find(set => set.rhythmSetId === rhythmSetId);

    if (!selectedSet) {
        quickInfo.textContent = rhythmSets.length > 0
            ? `${rhythmSets.length} rhythm set IDs loaded. Select one to auto-play LOOP1.`
            : 'No rhythm sets available';
        return;
    }

    quickInfo.textContent = `Loading ${selectedSet.rhythmSetId} into player...`;

    try {
        await openLoopPlayer(selectedSet.rhythmSetId, setSelect, {
            autoPlayLoopType: 'loop1',
            mountTarget: 'quick'
        });

        if (selectedSet.files && selectedSet.files.loop1) {
            quickInfo.textContent = `Now playing LOOP1 for ${selectedSet.rhythmSetId}`;
            return;
        }

        const fallbackType = ['loop2', 'loop3', 'fill1', 'fill2', 'fill3'].find(type => Boolean(selectedSet.files && selectedSet.files[type]));
        if (fallbackType) {
            await playLoopPad(fallbackType);
            quickInfo.textContent = `LOOP1 is missing. Now playing ${fallbackType.toUpperCase()} for ${selectedSet.rhythmSetId}`;
            return;
        }

        quickInfo.textContent = `${selectedSet.rhythmSetId} has no playable loop files`;
    } catch (error) {
        quickInfo.textContent = `Failed to open player for ${selectedSet.rhythmSetId}`;
        console.error('Quick playback error:', error);
    }
}

function populateRhythmFamilyList() {
    const selectElement = document.getElementById('rhythmFamilySelect');
    if (!selectElement) return;
    
    // Get unique rhythm families
    const families = new Set();
    rhythmSets.forEach(set => {
        if (set.rhythmFamily) {
            families.add(set.rhythmFamily);
        }
    });
    
    // Sort alphabetically
    const sortedFamilies = Array.from(families).sort();
    
    // Clear existing options (keep first two: empty and custom)
    while (selectElement.options.length > 2) {
        selectElement.remove(2);
    }
    
    // Add existing families
    sortedFamilies.forEach(family => {
        const option = document.createElement('option');
        option.value = family;
        option.textContent = family;
        selectElement.appendChild(option);
    });
    
    console.log(`Populated ${sortedFamilies.length} rhythm families:`, sortedFamilies);
}

function handleRhythmFamilySelect() {
    const selectElement = document.getElementById('rhythmFamilySelect');
    const inputElement = document.getElementById('rhythmFamily');
    const selectedValue = selectElement.value;
    
    if (selectedValue === '__custom__') {
        // Show input field for custom entry
        selectElement.style.display = 'none';
        inputElement.style.display = 'block';
        inputElement.value = '';
        inputElement.focus();
        
        // Clear set number and preview
        document.getElementById('rhythmSetNo').innerHTML = '<option value="">Select set number...</option>';
        document.getElementById('rhythmSetPreview').style.display = 'none';
        document.getElementById('existingLoopsInfo').style.display = 'none';
    } else if (selectedValue) {
        // Use selected family
        inputElement.value = selectedValue;
        updateAvailableSetNumbers();
        updateRhythmSetPreview();
        showExistingLoops();
    } else {
        // Empty selection
        inputElement.value = '';
        document.getElementById('rhythmSetNo').innerHTML = '<option value="">Select set number...</option>';
        document.getElementById('rhythmSetPreview').style.display = 'none';
        document.getElementById('existingLoopsInfo').style.display = 'none';
    }
}

function setupRhythmFamilyListener() {
    const familyInput = document.getElementById('rhythmFamily');
    
    familyInput.addEventListener('input', () => {
        updateAvailableSetNumbers();
        updateRhythmSetPreview();
        showExistingLoops();
    });
    
    // Add button to go back to select
    familyInput.addEventListener('blur', (e) => {
        // Don't hide if clicking on set number dropdown
        setTimeout(() => {
            if (familyInput.value && familyInput.style.display === 'block') {
                // Keep visible if user entered a value
            }
        }, 200);
    });
    
    // Add escape key handler to go back to select
    familyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const selectElement = document.getElementById('rhythmFamilySelect');
            familyInput.style.display = 'none';
            selectElement.style.display = 'block';
            selectElement.value = '';
        }
    });

    document.getElementById('rhythmSetNo').addEventListener('change', () => {
        updateRhythmSetPreview();
    });
}

function updateAvailableSetNumbers() {
    const family = normalizeRhythmFamily(document.getElementById('rhythmFamily').value);
    const select = document.getElementById('rhythmSetNo');
    
    select.innerHTML = '<option value="">Select set number...</option>';

    if (!family) {
        return;
    }

    // Find existing set numbers for this family
    const existingSetNos = rhythmSets
        .filter(set => normalizeRhythmFamily(set.rhythmFamily) === family)
        .map(set => set.rhythmSetNo)
        .sort((a, b) => a - b);

    const maxSetNo = existingSetNos.length > 0 ? Math.max(...existingSetNos) : 0;

    // Generate available numbers (1 to maxSetNo + 1, excluding existing)
    const availableNumbers = [];
    for (let i = 1; i <= maxSetNo + 1; i++) {
        if (!existingSetNos.includes(i)) {
            availableNumbers.push(i);
        }
    }

    // If all numbers are taken, add next number
    if (availableNumbers.length === 0) {
        availableNumbers.push(maxSetNo + 1);
    }

    // Add available numbers
    if (availableNumbers.length > 0) {
        const optgroup1 = document.createElement('optgroup');
        optgroup1.label = 'Available Set Numbers';
        availableNumbers.forEach(num => {
            const option = document.createElement('option');
            option.value = num;
            option.textContent = `Set ${num} (new)`;
            optgroup1.appendChild(option);
        });
        select.appendChild(optgroup1);
    }

    // Add existing numbers (disabled for reference)
    if (existingSetNos.length > 0) {
        const optgroup2 = document.createElement('optgroup');
        optgroup2.label = 'Existing Sets (reference only)';
        existingSetNos.forEach(num => {
            const option = document.createElement('option');
            option.value = num;
            option.textContent = `Set ${num} (already exists)`;
            option.disabled = true;
            optgroup2.appendChild(option);
        });
        select.appendChild(optgroup2);
    }
}

function updateRhythmSetPreview() {
    const family = document.getElementById('rhythmFamily').value.trim();
    const setNo = document.getElementById('rhythmSetNo').value;
    const previewDiv = document.getElementById('rhythmSetPreview');
    const previewId = document.getElementById('previewRhythmSetId');

    if (family && setNo) {
        const rhythmSetId = buildRhythmSetId(family, setNo);
        previewId.textContent = rhythmSetId;
        previewDiv.style.display = 'block';
    } else {
        previewDiv.style.display = 'none';
    }
}

function showExistingLoops() {
    const family = normalizeRhythmFamily(document.getElementById('rhythmFamily').value);
    const infoDiv = document.getElementById('existingLoopsInfo');
    const listDiv = document.getElementById('existingLoopsList');

    if (!family) {
        infoDiv.style.display = 'none';
        return;
    }

    const familySets = rhythmSets
        .filter(set => normalizeRhythmFamily(set.rhythmFamily) === family)
        .sort((a, b) => a.rhythmSetNo - b.rhythmSetNo);

    if (familySets.length === 0) {
        infoDiv.style.display = 'none';
        return;
    }

    const setsList = familySets.map(set => {
        const loopCount = (set.availableFiles || []).length;
        return `${set.rhythmSetId} (${loopCount}/6 loops)`;
    }).join(', ');

    listDiv.textContent = setsList;
    infoDiv.style.display = 'block';
}

async function createRhythmSet() {
    if (!ensureWriteAccess()) {
        return;
    }

    const family = document.getElementById('rhythmFamily').value.trim();
    const setNo = parseInt(document.getElementById('rhythmSetNo').value, 10);
    const status = document.getElementById('status').value;
    const notes = document.getElementById('notes').value.trim();

    // Validation
    if (!family) {
        showAlert('Please enter a rhythm family', 'error');
        return;
    }

    if (!setNo || setNo <= 0) {
        showAlert('Please select a set number', 'error');
        return;
    }

    const rhythmSetId = buildRhythmSetId(family, setNo);
    
    // Check if already exists
    if (rhythmSets.some(set => set.rhythmSetId === rhythmSetId)) {
        showAlert('This rhythm set already exists! Please choose a different set number.', 'error');
        return;
    }

    try {
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rhythmFamily: normalizeRhythmFamily(family),
                rhythmSetNo: setNo,
                status,
                notes
            })
        });

        showAlert(`Rhythm set "${rhythmSetId}" created successfully!`, 'success');
        
        // Reset form
        const selectElement = document.getElementById('rhythmFamilySelect');
        const inputElement = document.getElementById('rhythmFamily');
        
        // Show select, hide input
        selectElement.style.display = 'block';
        inputElement.style.display = 'none';
        selectElement.value = '';
        inputElement.value = '';
        
        document.getElementById('rhythmSetNo').innerHTML = '<option value="">Select set number...</option>';
        document.getElementById('notes').value = '';
        document.getElementById('rhythmSetPreview').style.display = 'none';
        document.getElementById('existingLoopsInfo').style.display = 'none';

        // Reload rhythm sets
        await loadRhythmSets();

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

function renderRhythmSetsTable() {
    const tbody = document.getElementById('rhythmSetsTableBody');
    
    if (rhythmSets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No rhythm sets found</td></tr>';
        return;
    }

    rhythmSets.sort((a, b) => {
        if (a.rhythmFamily !== b.rhythmFamily) {
            return a.rhythmFamily.localeCompare(b.rhythmFamily);
        }
        return a.rhythmSetNo - b.rhythmSetNo;
    });

    tbody.innerHTML = '';
    
    rhythmSets.forEach((set, index) => {
        const numericSetNo = Number.isFinite(Number(set.rhythmSetNo)) ? Number(set.rhythmSetNo) : 1;
        const loopCount = (set.availableFiles || []).length;

        const isSelected = selectedRhythmSet?.rhythmSetId === set.rhythmSetId;

        // Main row
        const mainRow = document.createElement('tr');
        mainRow.className = 'rhythm-set-row';
        mainRow.id = `row-${index}`;
        if (isSelected) {
            mainRow.style.backgroundColor = '#3a3a5a';
        }

        const expandTd = document.createElement('td');
        expandTd.style.cursor = 'pointer';
        expandTd.dataset.expandTrigger = String(index);

        const expandIcon = document.createElement('i');
        expandIcon.className = 'fas fa-chevron-right expand-icon';
        expandIcon.id = `icon-${index}`;
        expandTd.appendChild(expandIcon);
        mainRow.appendChild(expandTd);

        const idTd = document.createElement('td');
        const idStrong = document.createElement('strong');
        idStrong.textContent = set.rhythmSetId || '';
        idTd.appendChild(idStrong);
        mainRow.appendChild(idTd);

        const familyTd = document.createElement('td');
        familyTd.textContent = set.rhythmFamily || '';
        mainRow.appendChild(familyTd);

        const setNoTd = document.createElement('td');
        setNoTd.textContent = String(numericSetNo);
        mainRow.appendChild(setNoTd);

        const loopsTd = document.createElement('td');
        const loopsBadge = document.createElement('span');
        if (loopCount === 6) {
            loopsBadge.className = 'badge badge-success';
            loopsBadge.textContent = `${loopCount}/6`;
        } else if (loopCount > 0) {
            loopsBadge.className = 'badge badge-warning';
            loopsBadge.textContent = `${loopCount}/6`;
        } else {
            loopsBadge.className = 'badge badge-danger';
            loopsBadge.textContent = '0/6';
        }
        loopsTd.appendChild(loopsBadge);
        mainRow.appendChild(loopsTd);

        const statusTd = document.createElement('td');
        const statusBadge = document.createElement('span');
        if (set.status === 'active') {
            statusBadge.className = 'badge badge-success';
            statusBadge.textContent = 'Active';
        } else {
            statusBadge.className = 'badge badge-info';
            statusBadge.textContent = 'Draft';
        }
        statusTd.appendChild(statusBadge);
        mainRow.appendChild(statusTd);

        const notesTd = document.createElement('td');
        notesTd.style.maxWidth = '200px';
        notesTd.style.cursor = 'pointer';
        notesTd.title = 'Click to edit notes';
        notesTd.dataset.rhythmSetId = set.rhythmSetId;
        notesTd.dataset.notes = set.notes || '';
        
        const notesContent = document.createElement('div');
        notesContent.className = 'notes-content';
        notesContent.style.cssText = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #aaa; font-size: 13px;';
        notesContent.textContent = set.notes || '(click to add notes)';
        notesTd.appendChild(notesContent);
        
        if (!isReadOnlyMode) {
            notesTd.addEventListener('click', (e) => {
                e.stopPropagation();
                editNotes(set.rhythmSetId, set.notes || '');
            });
        }
        mainRow.appendChild(notesTd);

        const actionsTd = document.createElement('td');
        actionsTd.className = 'actions-cell';
        mainRow.appendChild(actionsTd);
        
        // Details row (expandable)
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'loop-details-row';
        detailsRow.id = `details-${index}`;
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 8;
        detailsCell.className = 'loop-details-cell';
        detailsCell.appendChild(renderLoopSlots(set));
        detailsRow.appendChild(detailsCell);

        // Click handler ONLY for the chevron icon cell
        const expandCell = mainRow.querySelector('[data-expand-trigger]');
        expandCell.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExpandRow(index);
        });

        bindLoopSlotInteractions(detailsRow);

        const actionsCell = mainRow.querySelector('.actions-cell');
        if (actionsCell) {
            const testPlayerButton = document.createElement('button');
            testPlayerButton.className = 'btn btn-primary btn-mini';
            testPlayerButton.style.marginRight = '5px';
            testPlayerButton.disabled = loopCount === 0;
            testPlayerButton.innerHTML = `<i class="fas fa-play-circle"></i> Player (${loopCount}/6)`;
            testPlayerButton.title = 'Test this rhythm set in Loop Player';
            testPlayerButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openLoopPlayer(set.rhythmSetId, event.currentTarget);
            });

            if (isReadOnlyMode) {
                actionsCell.appendChild(testPlayerButton);
            } else {
                const editButton = document.createElement('button');
                editButton.className = 'btn btn-primary btn-mini';
                editButton.style.marginRight = '5px';
                editButton.innerHTML = '<i class="fas fa-edit"></i> Edit';
                editButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    editRhythmSet(set.rhythmSetId, set.rhythmFamily, numericSetNo);
                });

                const duplicateButton = document.createElement('button');
                duplicateButton.className = 'btn btn-secondary btn-mini';
                duplicateButton.style.marginRight = '5px';
                duplicateButton.innerHTML = '<i class="fas fa-copy"></i> Duplicate';
                duplicateButton.title = 'Create a copy of this rhythm set';
                duplicateButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    duplicateRhythmSet(set.rhythmSetId);
                });

                const deleteButton = document.createElement('button');
                deleteButton.className = 'btn btn-danger btn-mini';
                deleteButton.innerHTML = '<i class="fas fa-trash"></i> Delete';
                deleteButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    deleteRhythmSet(set.rhythmSetId);
                });

                actionsCell.appendChild(testPlayerButton);
                actionsCell.appendChild(editButton);
                actionsCell.appendChild(duplicateButton);
                actionsCell.appendChild(deleteButton);
            }
        }

        tbody.appendChild(mainRow);
        tbody.appendChild(detailsRow);
    });
}

function renderLoopSlots(rhythmSet) {
    const loopTypes = ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'];
    const availableFiles = rhythmSet.availableFiles || [];
    const files = rhythmSet.files || {};
    const encodedRhythmSetId = encodeURIComponent(String(rhythmSet.rhythmSetId || ''));
    const slotIdToken = String(rhythmSet.rhythmSetId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');

    const fragment = document.createDocumentFragment();
    const grid = document.createElement('div');
    grid.className = 'loop-grid';
    fragment.appendChild(grid);

    loopTypes.forEach(loopType => {
        // Check both with and without .mp3 extension (API returns without extension)
        const hasLoop = availableFiles.includes(loopType) || availableFiles.includes(loopType + '.mp3');
        const filename = files[loopType] || '';
        const encodedFilename = encodeURIComponent(String(filename || ''));
        const loopName = loopType.replace(/(\d)/, ' $1').toUpperCase();
        const loopIcon = loopType.includes('loop') ? 'music' : 'drum';
        const slotId = `loop-slot-${slotIdToken}-${loopType}`;

        const slot = document.createElement('div');
        slot.className = `loop-slot ${hasLoop ? 'has-loop' : 'empty'}`;
        slot.id = slotId;
        if (!isReadOnlyMode) {
            slot.dataset.dropZone = 'true';
            slot.dataset.rhythmSetId = encodedRhythmSetId;
            slot.dataset.loopType = loopType;
        }

        // Header
        const header = document.createElement('div');
        header.className = 'loop-slot-header';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'loop-slot-title';
        const titleIcon = document.createElement('i');
        titleIcon.className = `fas fa-${loopIcon}`;
        titleSpan.appendChild(titleIcon);
        titleSpan.appendChild(document.createTextNode(' ' + loopName));
        header.appendChild(titleSpan);
        const badge = document.createElement('span');
        badge.className = hasLoop ? 'badge badge-success' : 'badge badge-danger';
        badge.style.fontSize = '10px';
        badge.textContent = hasLoop ? '\u2713' : 'Empty';
        header.appendChild(badge);
        slot.appendChild(header);

        // Drag-drop hint
        if (!isReadOnlyMode) {
            const hint = document.createElement('div');
            hint.className = 'drag-drop-hint';
            hint.style.cssText = 'font-size: 11px; color: #888; margin: 5px 0;';
            const hintIcon = document.createElement('i');
            hintIcon.className = 'fas fa-upload';
            hint.appendChild(hintIcon);
            hint.appendChild(document.createTextNode(' Drag & drop or click'));
            slot.appendChild(hint);
        }

        // Actions
        const actions = document.createElement('div');
        actions.className = 'loop-slot-actions';
        if (hasLoop) {
            const playBtn = document.createElement('button');
            playBtn.className = 'btn btn-primary btn-mini loop-slot-play-btn';
            playBtn.dataset.rhythmSetId = encodedRhythmSetId;
            playBtn.dataset.loopType = loopType;
            playBtn.dataset.filename = encodedFilename;
            const playIcon = document.createElement('i');
            playIcon.className = 'fas fa-play';
            playBtn.appendChild(playIcon);
            playBtn.appendChild(document.createTextNode(' Play'));
            actions.appendChild(playBtn);

            if (!isReadOnlyMode) {
                const swapBtn = document.createElement('button');
                swapBtn.className = 'btn btn-secondary btn-mini loop-slot-swap-btn';
                swapBtn.dataset.rhythmSetId = encodedRhythmSetId;
                swapBtn.dataset.loopType = loopType;
                swapBtn.dataset.filename = filename;
                const swapIcon = document.createElement('i');
                swapIcon.className = 'fas fa-exchange-alt';
                swapBtn.appendChild(swapIcon);
                swapBtn.appendChild(document.createTextNode(' Swap'));
                swapBtn.title = 'Swap this loop with another slot';
                actions.appendChild(swapBtn);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn btn-danger btn-mini loop-slot-remove-btn';
                removeBtn.dataset.rhythmSetId = encodedRhythmSetId;
                removeBtn.dataset.loopType = loopType;
                const removeIcon = document.createElement('i');
                removeIcon.className = 'fas fa-trash';
                removeBtn.appendChild(removeIcon);
                removeBtn.appendChild(document.createTextNode(' Remove'));
                actions.appendChild(removeBtn);
            }
        }
        if (!isReadOnlyMode) {
            const uploadBtn = document.createElement('button');
            uploadBtn.className = 'btn btn-success btn-mini loop-slot-upload-btn';
            uploadBtn.dataset.rhythmSetId = encodedRhythmSetId;
            uploadBtn.dataset.loopType = loopType;
            const uploadIcon = document.createElement('i');
            uploadIcon.className = 'fas fa-upload';
            uploadBtn.appendChild(uploadIcon);
            uploadBtn.appendChild(document.createTextNode(' ' + (hasLoop ? 'Replace' : 'Upload')));
            actions.appendChild(uploadBtn);

            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn btn-secondary btn-mini loop-slot-select-btn';
            selectBtn.dataset.rhythmSetId = encodedRhythmSetId;
            selectBtn.dataset.loopType = loopType;
            const selectIcon = document.createElement('i');
            selectIcon.className = 'fas fa-list';
            selectBtn.appendChild(selectIcon);
            selectBtn.appendChild(document.createTextNode(' Select'));
            selectBtn.title = 'Select from existing loop files';
            actions.appendChild(selectBtn);
        }
        slot.appendChild(actions);

        // Info
        const info = document.createElement('div');
        info.className = 'loop-slot-info';
        const infoIcon = document.createElement('i');
        if (hasLoop) {
            infoIcon.className = 'fas fa-check-circle';
            infoIcon.style.color = '#27ae60';
            info.appendChild(infoIcon);
            info.appendChild(document.createTextNode(' Loop available'));
            if (rhythmSet.originalFilenames && rhythmSet.originalFilenames[loopType]) {
                const origSpan = document.createElement('span');
                origSpan.style.cssText = 'color: #7f8c8d; font-size: 11px;';
                origSpan.textContent = ' (Original: ' + rhythmSet.originalFilenames[loopType] + ')';
                info.appendChild(origSpan);
            }
        } else {
            infoIcon.className = 'fas fa-exclamation-circle';
            infoIcon.style.color = '#e74c3c';
            info.appendChild(infoIcon);
            info.appendChild(document.createTextNode(' No loop uploaded'));
        }
        slot.appendChild(info);

        grid.appendChild(slot);
    });

    return fragment;
}

function toggleExpandRow(index) {
    const icon = document.getElementById(`icon-${index}`);
    const row = document.getElementById(`row-${index}`);
    const detailsRow = document.getElementById(`details-${index}`);
    
    if (detailsRow.classList.contains('show')) {
        // Collapse
        detailsRow.classList.remove('show');
        icon.classList.remove('expanded');
        row.classList.remove('expanded');
    } else {
        // Expand
        detailsRow.classList.add('show');
        icon.classList.add('expanded');
        row.classList.add('expanded');
    }
}

function decodeDataValue(value) {
    try {
        return decodeURIComponent(value || '');
    } catch (error) {
        return value || '';
    }
}

function bindLoopSlotInteractions(containerElement) {
    if (!containerElement) return;

    const dropZones = containerElement.querySelectorAll('[data-drop-zone="true"]');
    dropZones.forEach(zone => {
        if (isReadOnlyMode) return;

        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', (event) => {
            const rhythmSetId = decodeDataValue(zone.dataset.rhythmSetId);
            const loopType = zone.dataset.loopType || '';
            handleDrop(event, rhythmSetId, loopType);
        });
    });

    const playButtons = containerElement.querySelectorAll('.loop-slot-play-btn');
    playButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rhythmSetId = decodeDataValue(button.dataset.rhythmSetId);
            const loopType = button.dataset.loopType || '';
            const filename = decodeDataValue(button.dataset.filename);
            playLoop(rhythmSetId, loopType, filename);
        });
    });

    const removeButtons = containerElement.querySelectorAll('.loop-slot-remove-btn');
    removeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rhythmSetId = decodeDataValue(button.dataset.rhythmSetId);
            const loopType = button.dataset.loopType || '';
            removeLoop(rhythmSetId, loopType);
        });
    });

    const uploadButtons = containerElement.querySelectorAll('.loop-slot-upload-btn');
    uploadButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rhythmSetId = decodeDataValue(button.dataset.rhythmSetId);
            const loopType = button.dataset.loopType || '';
            uploadSingleLoop(rhythmSetId, loopType);
        });
    });

    const swapButtons = containerElement.querySelectorAll('.loop-slot-swap-btn');
    swapButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rhythmSetId = decodeDataValue(button.dataset.rhythmSetId);
            const loopType = button.dataset.loopType || '';
            const filename = button.dataset.filename || '';
            handleSwapClick(rhythmSetId, loopType, filename);
        });
    });

    const selectButtons = containerElement.querySelectorAll('.loop-slot-select-btn');
    selectButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rhythmSetId = decodeDataValue(button.dataset.rhythmSetId);
            const loopType = button.dataset.loopType || '';
            selectExistingLoop(rhythmSetId, loopType);
        });
    });

    const testButtons = containerElement.querySelectorAll('.loop-set-test-btn');
    testButtons.forEach(button => {
        button.addEventListener('click', () => {
            const rhythmSetId = decodeDataValue(button.dataset.rhythmSetId);
            openLoopPlayer(rhythmSetId);
        });
    });
}

async function playLoop(rhythmSetId, loopType, filename) {
    if (!filename) {
        showAlert('Loop file not found in metadata', 'error');
        console.error('playLoop called with empty filename:', { rhythmSetId, loopType, filename });
        return;
    }
    
    // Add cache-buster so freshly uploaded/replaced files are always fetched fresh
    const loopUrl = `${API_BASE_URL}/loops/${filename}?t=${Date.now()}`;
    const player = document.getElementById('loopPlayer');
    
    console.log('Playing loop:', { rhythmSetId, loopType, filename, loopUrl });
    
    try {
        player.src = loopUrl;
        // Explicitly reload so the audio element picks up the new src before playback
        player.load();
        await player.play();
        showAlert(`Playing ${loopType}...`, 'success');
    } catch (error) {
        console.error('Playback error:', error);
        showAlert(`Failed to play loop: ${error.message}`, 'error');
    }
}

async function uploadSingleLoop(rhythmSetId, loopType) {
    if (!ensureWriteAccess()) {
        return;
    }

    // Find the rhythm set to get metadata
    const rhythmSet = rhythmSets.find(s => s.rhythmSetId === rhythmSetId);
    if (!rhythmSet) {
        showAlert('Rhythm set not found', 'error');
        return;
    }
    
    // Get conditions from the rhythm set's existing loops
    const conditionsHint = rhythmSet.conditionsHint || {};
    
    // Create a file input - accept both .mp3 and .wav
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.mp3') && !fileName.endsWith('.wav')) {
            showAlert('Please select an MP3 or WAV file', 'error');
            return;
        }
        
        try {
            // Parse rhythmSetId to get rhythmFamily and rhythmSetNo
            // Format: rhythmFamily_rhythmSetNo (e.g., "dadra_1")
            const parts = rhythmSetId.split('_');
            const rhythmFamily = parts.slice(0, -1).join('_'); // Everything except last part
            const rhythmSetNo = parts[parts.length - 1]; // Last part
            
            // Parse type and number from loopType
            const type = loopType.includes('loop') ? 'loop' : 'fill';
            const number = parseInt(loopType.match(/\d+/)[0], 10);
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('rhythmFamily', rhythmFamily);
            formData.append('rhythmSetNo', rhythmSetNo);
            formData.append('taal', conditionsHint.taal || rhythmFamily);
            formData.append('type', type);
            formData.append('number', number);
            
            // Use conditionsHint from existing loops in the set, or defaults
            formData.append('timeSignature', conditionsHint.timeSignature || '4/4');
            formData.append('tempo', conditionsHint.tempo || 'medium');
            formData.append('genre', conditionsHint.genre || 'acoustic');
            formData.append('description', `${loopType} for ${rhythmSetId}`);
            
            showAlert(`Uploading ${loopType}...`, 'success');
            
            const response = await authFetch(`${API_BASE_URL}/api/loops/upload-single`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            showAlert(`${loopType} uploaded successfully!`, 'success');
            
            // Signal loop player to bypass cache and re-fetch files (loop file was replaced on disk)
            localStorage.setItem('loopFilesReplacedAt', Date.now().toString());
            
            // Store the current rhythm set ID to re-expand after reload
            const currentRhythmSetId = rhythmSetId;
            
            // Reload rhythm sets to update the UI
            await loadRhythmSets();

            // If the loop player panel is currently showing this same rhythm set,
            // force-reload its audio buffers so the new sample is picked up immediately
            // without requiring a full page refresh.
            if (rhythmManagerPlayer && currentPlayerRhythmSet &&
                currentPlayerRhythmSet.rhythmSetId === currentRhythmSetId) {
                const updatedSet = rhythmSets.find(s => s.rhythmSetId === currentRhythmSetId);
                if (updatedSet) {
                    currentPlayerRhythmSet = updatedSet;
                    await loadRhythmSetIntoPlayer(updatedSet, true);
                    createSimplePlayerUI(updatedSet);
                }
            }
            
            // Find and re-expand the row
            const rhythmSetIndex = rhythmSets.findIndex(s => s.rhythmSetId === currentRhythmSetId);
            if (rhythmSetIndex !== -1) {
                setTimeout(() => {
                    toggleExpandRow(rhythmSetIndex);
                }, 100);
            }
            
        } catch (error) {
            if (error.message === 'AUTH_REQUIRED') {
                handleAuthRequired();
                return;
            }
            showAlert(error.message, 'error');
        }
    };
    
    input.click();
}

function previewLoops(rhythmSetId) {
    const set = rhythmSets.find(s => s.rhythmSetId === rhythmSetId);
    if (!set || !set.availableFiles || set.availableFiles.length === 0) {
        showAlert('No loops available for this rhythm set', 'error');
        return;
    }

    // Show available loops
    const loopsList = set.availableFiles.join(', ');
    alert(`Available loops for ${rhythmSetId}:\n\n${loopsList}\n\nNote: Full preview player coming soon!`);
}

// ============================================================================
// DUPLICATE RHYTHM SET
// ============================================================================

async function duplicateRhythmSet(sourceRhythmSetId) {
    if (!ensureWriteAccess()) {
        return;
    }

    // Find the source rhythm set
    const sourceSet = rhythmSets.find(s => s.rhythmSetId === sourceRhythmSetId);
    if (!sourceSet) {
        showAlert('Source rhythm set not found', 'error');
        return;
    }

    // Parse the source rhythm set ID to suggest a name
    const parts = sourceRhythmSetId.split('_');
    const rhythmFamily = parts.slice(0, -1).join('_');
    const sourceSetNo = parts[parts.length - 1];

    // Create a modal dialog to get the new rhythm set name
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background-color: #2c2c2c;
        border-radius: 10px;
        padding: 30px;
        max-width: 600px;
        width: 90%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0 0 20px 0; color: #9b59b6; font-size: 20px;';
    title.innerHTML = `<i class="fas fa-copy"></i> Duplicate Rhythm Set`;
    dialog.appendChild(title);

    const description = document.createElement('p');
    description.style.cssText = 'color: #e0e0e0; margin-bottom: 20px;';
    description.textContent = `Create a copy of "${sourceRhythmSetId}" with all loop references.`;
    dialog.appendChild(description);

    const sourceInfo = document.createElement('div');
    sourceInfo.style.cssText = 'background-color: #1a1a1a; padding: 15px; border-radius: 5px; margin-bottom: 20px;';
    sourceInfo.innerHTML = `
        <div style="color: #7f8c8d; margin-bottom: 10px;"><strong style="color: #3498db;">Source Rhythm Set:</strong></div>
        <div style="color: #e0e0e0; margin-bottom: 5px;">• ID: ${sourceRhythmSetId}</div>
        <div style="color: #e0e0e0; margin-bottom: 5px;">• Loops: ${(sourceSet.availableFiles || []).length}/6</div>
        <div style="color: #e0e0e0;">• Songs using this: ${sourceSet.mappedSongsCount || 0}</div>
    `;
    dialog.appendChild(sourceInfo);

    const formGroup = document.createElement('div');
    formGroup.style.cssText = 'margin-bottom: 20px;';

    const label = document.createElement('label');
    label.style.cssText = 'display: block; color: #e0e0e0; margin-bottom: 10px; font-weight: bold;';
    label.textContent = 'New Rhythm Set ID:';
    formGroup.appendChild(label);

    // Show rhythm family prefix
    const familyLabel = document.createElement('div');
    familyLabel.style.cssText = 'color: #7f8c8d; font-size: 14px; margin-bottom: 5px;';
    familyLabel.innerHTML = `<strong>Rhythm Family:</strong> ${rhythmFamily}`;
    formGroup.appendChild(familyLabel);

    // Dropdown for set number selection
    const selectContainer = document.createElement('div');
    selectContainer.style.cssText = 'margin-bottom: 10px;';
    
    const setNoSelect = document.createElement('select');
    setNoSelect.id = 'duplicateSetNoSelect';
    setNoSelect.style.cssText = `
        width: 100%;
        padding: 10px;
        border: 1px solid #444;
        border-radius: 5px;
        background-color: #1a1a1a;
        color: #e0e0e0;
        font-size: 16px;
    `;
    selectContainer.appendChild(setNoSelect);
    formGroup.appendChild(selectContainer);

    // Find existing set numbers for this family
    const existingSetNos = rhythmSets
        .filter(set => normalizeRhythmFamily(set.rhythmFamily) === normalizeRhythmFamily(rhythmFamily))
        .map(set => set.rhythmSetNo)
        .sort((a, b) => {
            // Handle numeric and string set numbers
            const aNum = parseInt(a);
            const bNum = parseInt(b);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
            }
            return String(a).localeCompare(String(b));
        });

    const maxNumericSetNo = existingSetNos
        .map(n => parseInt(n))
        .filter(n => !isNaN(n))
        .reduce((max, n) => Math.max(max, n), 0);

    // Generate available numbers
    const availableNumbers = [];
    for (let i = 1; i <= maxNumericSetNo + 5; i++) {
        if (!existingSetNos.includes(i) && !existingSetNos.includes(String(i))) {
            availableNumbers.push(i);
        }
    }

    // Build dropdown options
    setNoSelect.innerHTML = '<option value="">Select set number...</option>';
    
    if (availableNumbers.length > 0) {
        const optgroup1 = document.createElement('optgroup');
        optgroup1.label = 'Available Set Numbers';
        availableNumbers.slice(0, 10).forEach(num => {
            const option = document.createElement('option');
            option.value = num;
            option.textContent = `Set ${num} (available)`;
            optgroup1.appendChild(option);
        });
        setNoSelect.appendChild(optgroup1);
    }

    if (existingSetNos.length > 0) {
        const optgroup2 = document.createElement('optgroup');
        optgroup2.label = 'Existing Sets (reference only)';
        existingSetNos.forEach(num => {
            const option = document.createElement('option');
            option.value = num;
            option.textContent = `Set ${num} (already exists)`;
            option.disabled = true;
            optgroup2.appendChild(option);
        });
        setNoSelect.appendChild(optgroup2);
    }

    const optgroup3 = document.createElement('optgroup');
    optgroup3.label = 'Custom Set Number';
    const customOption = document.createElement('option');
    customOption.value = '__custom__';
    customOption.textContent = 'Enter custom set number...';
    optgroup3.appendChild(customOption);
    setNoSelect.appendChild(optgroup3);

    // Custom input field (hidden by default)
    const customInputContainer = document.createElement('div');
    customInputContainer.style.cssText = 'margin-top: 10px; display: none;';
    
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'Enter custom set number (e.g., 2, fast_1, slow_2)';
    customInput.style.cssText = `
        width: 100%;
        padding: 10px;
        border: 1px solid #444;
        border-radius: 5px;
        background-color: #1a1a1a;
        color: #e0e0e0;
        font-size: 16px;
    `;
    customInputContainer.appendChild(customInput);
    formGroup.appendChild(customInputContainer);

    // Preview of full rhythm set ID
    const previewDiv = document.createElement('div');
    previewDiv.style.cssText = 'background-color: #1a1a1a; padding: 10px; border-radius: 5px; margin-top: 10px; display: none;';
    
    const previewLabel = document.createElement('div');
    previewLabel.style.cssText = 'color: #7f8c8d; font-size: 12px; margin-bottom: 5px;';
    previewLabel.textContent = 'New Rhythm Set ID:';
    previewDiv.appendChild(previewLabel);
    
    const previewId = document.createElement('div');
    previewId.style.cssText = 'color: #27ae60; font-size: 16px; font-weight: bold;';
    previewDiv.appendChild(previewId);
    formGroup.appendChild(previewDiv);

    const statusMsg = document.createElement('div');
    statusMsg.style.cssText = 'margin-top: 10px; font-size: 13px; display: none;';
    formGroup.appendChild(statusMsg);

    dialog.appendChild(formGroup);

    // Real-time validation function
    function validateAndPreview() {
        let setNumber = '';
        
        if (setNoSelect.value === '__custom__') {
            setNumber = customInput.value.trim();
        } else if (setNoSelect.value) {
            setNumber = setNoSelect.value;
        }

        if (!setNumber) {
            previewDiv.style.display = 'none';
            statusMsg.style.display = 'none';
            createBtn.disabled = true;
            return false;
        }

        const newRhythmSetId = `${rhythmFamily}_${setNumber}`;
        previewId.textContent = newRhythmSetId;
        previewDiv.style.display = 'block';

        // Check if it already exists
        const exists = rhythmSets.some(s => s.rhythmSetId === newRhythmSetId);
        
        if (exists) {
            statusMsg.innerHTML = '<i class="fas fa-times-circle"></i> This rhythm set ID already exists';
            statusMsg.style.color = '#e74c3c';
            statusMsg.style.display = 'block';
            previewId.style.color = '#e74c3c';
            createBtn.disabled = true;
            return false;
        } else {
            statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> This rhythm set ID is available';
            statusMsg.style.color = '#27ae60';
            statusMsg.style.display = 'block';
            previewId.style.color = '#27ae60';
            createBtn.disabled = false;
            return true;
        }
    }

    // Event listeners for real-time validation
    setNoSelect.addEventListener('change', () => {
        if (setNoSelect.value === '__custom__') {
            customInputContainer.style.display = 'block';
            customInput.focus();
        } else {
            customInputContainer.style.display = 'none';
        }
        validateAndPreview();
    });

    customInput.addEventListener('input', validateAndPreview);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 10px;';

    const createBtn = document.createElement('button');
    createBtn.className = 'btn btn-success';
    createBtn.style.cssText = 'flex: 1; padding: 12px;';
    createBtn.innerHTML = '<i class="fas fa-check"></i> Create Duplicate';
    createBtn.disabled = true;
    createBtn.onclick = async () => {
        let setNumber = '';
        
        if (setNoSelect.value === '__custom__') {
            setNumber = customInput.value.trim();
        } else {
            setNumber = setNoSelect.value;
        }

        if (!setNumber) {
            return;
        }

        const newRhythmSetId = `${rhythmFamily}_${setNumber}`;

        // Final check
        if (rhythmSets.some(s => s.rhythmSetId === newRhythmSetId)) {
            return;
        }

        modal.remove();
        await performDuplication(sourceRhythmSetId, newRhythmSetId, sourceSet);
    };
    buttonContainer.appendChild(createBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.cssText = 'flex: 1; padding: 12px;';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
    cancelBtn.onclick = () => modal.remove();
    buttonContainer.appendChild(cancelBtn);

    dialog.appendChild(buttonContainer);

    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

async function performDuplication(sourceRhythmSetId, newRhythmSetId, sourceSet) {
    try {
        showAlert(`Creating duplicate rhythm set "${newRhythmSetId}"...`, 'success');

        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceRhythmSetId: sourceRhythmSetId,
                newRhythmSetId: newRhythmSetId
            })
        });

        const result = await response.json();
        showAlert(`Rhythm set "${newRhythmSetId}" created successfully with ${result.loopsCopied || 0} loop references!`, 'success');

        // Reload rhythm sets
        await loadRhythmSets();

        // Find and expand the new rhythm set
        const newSetIndex = rhythmSets.findIndex(s => s.rhythmSetId === newRhythmSetId);
        if (newSetIndex !== -1) {
            setTimeout(() => {
                toggleExpandRow(newSetIndex);
                // Scroll to the new rhythm set
                const newRow = document.getElementById(`row-${newSetIndex}`);
                if (newRow) {
                    newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

async function deleteRhythmSet(rhythmSetId) {
    if (!ensureWriteAccess()) {
        return;
    }

    if (!confirm(`Are you sure you want to delete rhythm set "${rhythmSetId}"?\n\nThis will permanently delete:\n- The rhythm set from the database\n- All associated loop files (loop1-3, fill1-3)\n\nThis action cannot be undone!`)) {
        return;
    }

    try {
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${rhythmSetId}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        showAlert(result.message || `Rhythm set "${rhythmSetId}" deleted successfully`, 'success');
        
        await loadRhythmSets();

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }

        const err = error.payload;
        if (err && err.mappedSongsCount > 0) {
            const songsList = err.mappedSongs
                ? err.mappedSongs.map(s => `  • ${s.title} (ID: ${s.id})`).join('\n')
                : '';

            const forceDelete = confirm(
                `Cannot delete rhythm set "${rhythmSetId}".\n\n` +
                `${err.mappedSongsCount} song(s) are currently mapped to it:\n${songsList}\n\n` +
                `Would you like to FORCE DELETE?\n\n` +
                `⚠️ This will:\n` +
                `- Unmap all songs (they will lose their rhythm set assignment)\n` +
                `- Delete the rhythm set from database\n` +
                `- Delete all loop files\n\n` +
                `This action cannot be undone!`
            );

            if (forceDelete) {
                await forceDeleteRhythmSet(rhythmSetId);
            }
            return;
        }

        console.error('Delete error:', error);
        showAlert(error.message, 'error');
    }
}

async function forceDeleteRhythmSet(rhythmSetId) {
    if (!ensureWriteAccess()) {
        return;
    }

    try {
        showAlert('Force deleting rhythm set...', 'success');
        
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${rhythmSetId}/force`, {
            method: 'DELETE'
        });

        const result = await response.json();
        showAlert(result.message || `Rhythm set "${rhythmSetId}" force deleted successfully`, 'success');
        
        await loadRhythmSets();

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        console.error('Force delete error:', error);
        showAlert(error.message, 'error');
    }
}

// ============================================================================
// SWAP LOOP FUNCTIONALITY
// ============================================================================

function handleSwapClick(rhythmSetId, loopType, filename) {
    if (!ensureWriteAccess()) {
        return;
    }

    if (!filename) {
        showAlert('Loop file not found', 'error');
        return;
    }

    // If no swap is in progress, start one
    if (!swapState) {
        swapState = { rhythmSetId, loopType, filename };
        
        // Highlight the selected slot
        highlightSwapSlot(rhythmSetId, loopType, true);
        
        showAlert(`${loopType.replace(/(\d)/, ' $1').toUpperCase()} selected. Click another loop to swap with.`, 'info');
        
        // Update all swap buttons to show "Complete Swap" or "Cancel"
        updateSwapButtonStates();
        return;
    }

    // If clicking the same slot, cancel swap
    if (swapState.rhythmSetId === rhythmSetId && swapState.loopType === loopType) {
        cancelSwap();
        return;
    }

    // Complete the swap
    performSwap(swapState.rhythmSetId, swapState.loopType, swapState.filename, rhythmSetId, loopType, filename);
}

function highlightSwapSlot(rhythmSetId, loopType, highlight) {
    const slotIdToken = String(rhythmSetId || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const slotId = `loop-slot-${slotIdToken}-${loopType}`;
    const slot = document.getElementById(slotId);
    
    if (slot) {
        if (highlight) {
            slot.style.border = '3px solid #9b59b6';
            slot.style.boxShadow = '0 0 15px rgba(155, 89, 182, 0.5)';
        } else {
            slot.style.border = '';
            slot.style.boxShadow = '';
        }
    }
}

function updateSwapButtonStates() {
    const allSwapButtons = document.querySelectorAll('.loop-slot-swap-btn');
    allSwapButtons.forEach(btn => {
        const btnRhythmSetId = decodeDataValue(btn.dataset.rhythmSetId);
        const btnLoopType = btn.dataset.loopType;
        
        if (swapState && swapState.rhythmSetId === btnRhythmSetId && swapState.loopType === btnLoopType) {
            // This is the selected slot - show cancel
            btn.innerHTML = '<i class="fas fa-times"></i> Cancel';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-warning');
        } else if (swapState) {
            // Other slots - show they can complete the swap
            btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Swap Here';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-success');
        } else {
            // Normal state
            btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Swap';
            btn.classList.remove('btn-warning', 'btn-success');
            btn.classList.add('btn-secondary');
        }
    });
}

function cancelSwap() {
    if (swapState) {
        highlightSwapSlot(swapState.rhythmSetId, swapState.loopType, false);
        swapState = null;
        updateSwapButtonStates();
        showAlert('Swap cancelled', 'info');
    }
}

async function performSwap(rhythmSetId1, loopType1, filename1, rhythmSetId2, loopType2, filename2) {
    try {
        showAlert(`Swapping ${loopType1} with ${loopType2}...`, 'success');

        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/loops/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slot1: { rhythmSetId: rhythmSetId1, loopType: loopType1, filename: filename1 },
                slot2: { rhythmSetId: rhythmSetId2, loopType: loopType2, filename: filename2 }
            })
        });

        const result = await response.json();
        if (!result || result.success !== true) {
            throw new Error((result && (result.error || result.message)) || 'Swap failed');
        }
        showAlert('Loops swapped successfully!', 'success');

        // Clear swap state and highlights
        highlightSwapSlot(rhythmSetId1, loopType1, false);
        if (rhythmSetId2 !== rhythmSetId1) {
            highlightSwapSlot(rhythmSetId2, loopType2, false);
        }
        swapState = null;

        // Signal loop player to bypass cache
        localStorage.setItem('loopFilesReplacedAt', Date.now().toString());

        // Reload rhythm sets
        await loadRhythmSets();

        // Re-expand both rhythm sets if different
        const rhythmSetIds = [rhythmSetId1];
        if (rhythmSetId2 !== rhythmSetId1) {
            rhythmSetIds.push(rhythmSetId2);
        }

        rhythmSetIds.forEach(rsId => {
            const rhythmSetIndex = rhythmSets.findIndex(s => s.rhythmSetId === rsId);
            if (rhythmSetIndex !== -1) {
                setTimeout(() => {
                    toggleExpandRow(rhythmSetIndex);
                }, 100);
            }
        });

    } catch (error) {
        cancelSwap();
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

// ============================================================================
// SELECT EXISTING LOOP FUNCTIONALITY
// ============================================================================

async function selectExistingLoop(rhythmSetId, loopType) {
    if (!ensureWriteAccess()) {
        return;
    }

    const allLoopItems = [];
    const localLoopFiles = new Set();
    const addLocalLoopFile = (filename, subtitle) => {
        const normalized = String(filename || '').trim();
        if (!normalized) {
            return;
        }
        const key = normalized.toLowerCase();
        if (localLoopFiles.has(key)) {
            return;
        }
        localLoopFiles.add(key);
        allLoopItems.push({
            kind: 'local',
            filename: normalized,
            searchText: normalized.toLowerCase(),
            subtitle
        });
    };

    rhythmSets.forEach(set => {
        if (set.files) {
            Object.values(set.files).forEach(filename => {
                addLocalLoopFile(filename, 'Current PraiseandWorship library (mapped)');
            });
        }
    });

    try {
        const localFilesResponse = await authFetch(`${API_BASE_URL}/api/loops/local-files`);
        const localFilesPayload = await localFilesResponse.json().catch(() => ({}));
        const localFiles = Array.isArray(localFilesPayload.files) ? localFilesPayload.files : [];
        localFiles.forEach(filename => addLocalLoopFile(filename, 'Current repo loops folder'));
    } catch (error) {
        console.warn('Could not load local repo loop files:', error);
    }

    allLoopItems.sort((a, b) => String(a.filename || '').localeCompare(String(b.filename || '')));

    if (activeExternalSourceId && !externalLoopLibrary.length) {
        await loadExternalLoopLibrary(activeExternalSourceId);
    }

    externalLoopLibrary.forEach(group => {
        Object.entries(group.files || {}).forEach(([slotKey, filename]) => {
            if (!filename) {
                return;
            }
            allLoopItems.push({
                kind: 'external',
                filename,
                sourceId: group.sourceId,
                sourceRhythmSetId: group.sourceRhythmSetId,
                slotKey,
                searchText: `${filename} ${group.sourceRhythmSetId} ${slotKey}`.toLowerCase(),
                subtitle: `${group.sourceLabel} • ${group.sourceRhythmSetId} • ${slotKey.toUpperCase()}`
            });
        });
    });

    if (allLoopItems.length === 0) {
        showAlert('No local or external loop files available', 'error');
        return;
    }

    const internalItemCount = allLoopItems.filter(item => item.kind === 'local').length;
    const externalItemCount = allLoopItems.filter(item => item.kind === 'external').length;

    // Create a modal dialog with dropdown
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background-color: #2c2c2c;
        border-radius: 10px;
        padding: 30px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0 0 20px 0; color: #9b59b6; font-size: 20px;';
    title.innerHTML = `<i class="fas fa-list"></i> Select Loop for ${loopType.replace(/(\d)/, ' $1').toUpperCase()}`;
    dialog.appendChild(title);

    const description = document.createElement('p');
    description.style.cssText = 'color: #e0e0e0; margin-bottom: 20px;';
    description.textContent = `Choose a loop from PraiseandWorship or import one from OldandNew (${allLoopItems.length} available):`;
    dialog.appendChild(description);

    let sourceFilter = 'internal';

    const sourceToggle = document.createElement('div');
    sourceToggle.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';

    const internalToggleBtn = document.createElement('button');
    internalToggleBtn.type = 'button';
    internalToggleBtn.className = 'btn btn-mini';

    const externalToggleBtn = document.createElement('button');
    externalToggleBtn.type = 'button';
    externalToggleBtn.className = 'btn btn-mini';

    let previewAudio = null;
    let previewPlayingKey = '';

    const stopPreviewAudio = () => {
        if (previewAudio) {
            try {
                previewAudio.pause();
                previewAudio.currentTime = 0;
            } catch (error) {
                console.warn('Error stopping preview audio:', error);
            }
        }
        previewAudio = null;
        previewPlayingKey = '';
    };

    const updateSourceToggleStyles = () => {
        if (sourceFilter === 'internal') {
            internalToggleBtn.classList.remove('btn-secondary');
            internalToggleBtn.classList.add('btn-primary');
            externalToggleBtn.classList.remove('btn-primary');
            externalToggleBtn.classList.add('btn-secondary');
        } else {
            externalToggleBtn.classList.remove('btn-secondary');
            externalToggleBtn.classList.add('btn-primary');
            internalToggleBtn.classList.remove('btn-primary');
            internalToggleBtn.classList.add('btn-secondary');
        }
    };

    internalToggleBtn.innerHTML = `<i class="fas fa-hdd"></i> Internal (${internalItemCount})`;
    internalToggleBtn.onclick = () => {
        sourceFilter = 'internal';
        updateSourceToggleStyles();
        renderList(searchInput.value || '');
    };

    externalToggleBtn.innerHTML = `<i class="fas fa-cloud-download-alt"></i> External (${externalItemCount})`;
    externalToggleBtn.onclick = () => {
        sourceFilter = 'external';
        updateSourceToggleStyles();
        renderList(searchInput.value || '');
    };

    sourceToggle.appendChild(internalToggleBtn);
    sourceToggle.appendChild(externalToggleBtn);
    dialog.appendChild(sourceToggle);

    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = 'margin-bottom: 15px;';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search loop files...';
    searchInput.style.cssText = `
        width: 100%;
        padding: 10px;
        border: 1px solid #444;
        border-radius: 5px;
        background-color: #1a1a1a;
        color: #e0e0e0;
        font-size: 14px;
    `;
    searchContainer.appendChild(searchInput);
    dialog.appendChild(searchContainer);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid #444;
        border-radius: 5px;
        background-color: #1a1a1a;
        margin-bottom: 20px;
    `;

    const renderList = (filterText = '') => {
        listContainer.innerHTML = '';
        const normalizedFilterText = String(filterText || '').toLowerCase();
        const filtered = allLoopItems.filter(item => {
            const sourceMatches = sourceFilter === 'internal'
                ? item.kind === 'local'
                : item.kind === 'external';
            if (!sourceMatches) {
                return false;
            }
            return item.searchText.includes(normalizedFilterText);
        });

        if (filtered.length === 0) {
            const noResults = document.createElement('div');
            noResults.style.cssText = 'padding: 20px; text-align: center; color: #7f8c8d;';
            noResults.textContent = sourceFilter === 'internal'
                ? 'No internal files match your search'
                : 'No external files match your search';
            listContainer.appendChild(noResults);
            return;
        }

        filtered.forEach(itemConfig => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 12px;
                border-bottom: 1px solid #2c2c2c;
                cursor: pointer;
                transition: background-color 0.2s;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            item.onmouseover = () => item.style.backgroundColor = '#3a2a4a';
            item.onmouseout = () => item.style.backgroundColor = '';

            const fileInfo = document.createElement('div');
            fileInfo.style.cssText = 'color: #e0e0e0; flex: 1;';

            const filenameLabel = document.createElement('div');
            filenameLabel.textContent = itemConfig.filename;
            fileInfo.appendChild(filenameLabel);

            const subtitle = document.createElement('div');
            subtitle.style.cssText = 'color: #9aa0a6; font-size: 12px; margin-top: 4px;';
            subtitle.textContent = itemConfig.subtitle;
            fileInfo.appendChild(subtitle);

            item.appendChild(fileInfo);

            const actionsWrap = document.createElement('div');
            actionsWrap.style.cssText = 'display: flex; align-items: center; gap: 6px;';

            const previewBtn = document.createElement('button');
            previewBtn.className = 'btn btn-secondary btn-mini';
            const itemKey = String(itemConfig.filename || '').toLowerCase();
            const isPlayingThis = itemConfig.kind === 'local' && previewPlayingKey === itemKey && previewAudio && !previewAudio.paused;
            previewBtn.innerHTML = isPlayingThis
                ? '<i class="fas fa-stop"></i>'
                : '<i class="fas fa-play"></i>';

            if (itemConfig.kind !== 'local') {
                previewBtn.disabled = true;
                previewBtn.title = 'Import external file to preview';
            } else {
                previewBtn.title = isPlayingThis ? 'Stop preview' : 'Preview file';
                previewBtn.onclick = async () => {
                    if (isPlayingThis) {
                        stopPreviewAudio();
                        renderList(searchInput.value || '');
                        return;
                    }

                    stopPreviewAudio();
                    const previewUrl = `${API_BASE_URL}/loops/${encodeURIComponent(itemConfig.filename)}?t=${Date.now()}`;
                    previewAudio = new Audio(previewUrl);
                    previewPlayingKey = itemKey;

                    previewAudio.onended = () => {
                        stopPreviewAudio();
                        renderList(searchInput.value || '');
                    };
                    previewAudio.onerror = () => {
                        showAlert(`Could not preview ${itemConfig.filename}`, 'error');
                        stopPreviewAudio();
                        renderList(searchInput.value || '');
                    };

                    try {
                        await previewAudio.play();
                    } catch (error) {
                        showAlert(`Preview failed: ${error.message}`, 'error');
                        stopPreviewAudio();
                    }
                    renderList(searchInput.value || '');
                };
            }
            actionsWrap.appendChild(previewBtn);

            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn btn-success btn-mini';
            selectBtn.innerHTML = itemConfig.kind === 'local'
                ? '<i class="fas fa-check"></i> Select'
                : '<i class="fas fa-file-import"></i> Import';
            selectBtn.onclick = async () => {
                stopPreviewAudio();
                modal.remove();
                if (itemConfig.kind === 'local') {
                    await assignExistingLoop(rhythmSetId, loopType, itemConfig.filename);
                    return;
                }

                await importExternalLoopToSlot(itemConfig.sourceId, itemConfig.filename, rhythmSetId, loopType);
            };
            actionsWrap.appendChild(selectBtn);

            item.appendChild(actionsWrap);

            listContainer.appendChild(item);
        });
    };

    searchInput.oninput = (e) => renderList(e.target.value);
    updateSourceToggleStyles();
    renderList();

    dialog.appendChild(listContainer);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.cssText = 'width: 100%; padding: 12px;';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel';
    cancelBtn.onclick = () => {
        stopPreviewAudio();
        modal.remove();
    };
    dialog.appendChild(cancelBtn);

    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

async function assignExistingLoop(rhythmSetId, loopType, filename) {
    try {
        showAlert(`Assigning ${filename} to ${loopType}...`, 'success');

        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}/loops/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                loopType: loopType,
                filename: filename
            })
        });

        const result = await response.json();
        if (!result || result.success !== true) {
            throw new Error((result && (result.error || result.message)) || 'Assign failed');
        }
        showAlert(`${filename} assigned to ${loopType} successfully!`, 'success');

        // Signal loop player to bypass cache
        localStorage.setItem('loopFilesReplacedAt', Date.now().toString());

        // Reload and re-expand
        const currentRhythmSetId = rhythmSetId;
        await loadRhythmSets();

        // If player is open on this rhythm set, force-reload buffers so new assignment is audible immediately.
        if (rhythmManagerPlayer && currentPlayerRhythmSet && currentPlayerRhythmSet.rhythmSetId === currentRhythmSetId) {
            const updatedSet = rhythmSets.find(s => s.rhythmSetId === currentRhythmSetId);
            if (updatedSet) {
                currentPlayerRhythmSet = updatedSet;
                await loadRhythmSetIntoPlayer(updatedSet, true);
                createSimplePlayerUI(updatedSet);
            }
        }

        const rhythmSetIndex = rhythmSets.findIndex(s => s.rhythmSetId === currentRhythmSetId);
        if (rhythmSetIndex !== -1) {
            setTimeout(() => {
                toggleExpandRow(rhythmSetIndex);
            }, 100);
        }

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

async function removeLoop(rhythmSetId, loopType) {
    if (!ensureWriteAccess()) {
        return;
    }

    if (!confirm(`Are you sure you want to remove ${loopType} from rhythm set "${rhythmSetId}"?\n\nThis will permanently delete the loop file.\n\nThis action cannot be undone!`)) {
        return;
    }

    try {
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${rhythmSetId}/loops/${loopType}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        showAlert(result.message || `${loopType} removed successfully`, 'success');
        
        // Store the current rhythm set ID to re-expand after reload
        const currentRhythmSetId = rhythmSetId;
        
        // Reload rhythm sets to update the UI
        await loadRhythmSets();
        
        // Find and re-expand the row
        const rhythmSetIndex = rhythmSets.findIndex(s => s.rhythmSetId === currentRhythmSetId);
        if (rhythmSetIndex !== -1) {
            setTimeout(() => {
                toggleExpandRow(rhythmSetIndex);
            }, 100);
        }

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(error.message, 'error');
    }
}

// ============================================================================
// DRAG AND DROP HANDLERS
// ============================================================================

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.style.borderColor = '#9b59b6';
    event.currentTarget.style.backgroundColor = '#3a2a4a';
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.style.borderColor = '';
    event.currentTarget.style.backgroundColor = '';
}

async function handleDrop(event, rhythmSetId, loopType) {
    event.preventDefault();
    event.stopPropagation();
    
    // Reset styling
    event.currentTarget.style.borderColor = '';
    event.currentTarget.style.backgroundColor = '';
    
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
        showAlert('No file dropped', 'error');
        return;
    }
    
    const file = files[0];
    const fileName = file.name.toLowerCase();
    
    // Validate file type
    if (!fileName.endsWith('.mp3') && !fileName.endsWith('.wav')) {
        showAlert('Please drop an MP3 or WAV file', 'error');
        return;
    }

    if (!ensureWriteAccess()) {
        return;
    }
    
    // Upload the file
    await uploadFileForLoop(rhythmSetId, loopType, file);
}

async function uploadFileForLoop(rhythmSetId, loopType, file) {
    if (!ensureWriteAccess()) {
        return;
    }

    // Find the rhythm set to get metadata
    const rhythmSet = rhythmSets.find(s => s.rhythmSetId === rhythmSetId);
    if (!rhythmSet) {
        showAlert('Rhythm set not found', 'error');
        return;
    }
    
    const conditionsHint = rhythmSet.conditionsHint || {};
    
    try {
        // Parse rhythmSetId to get rhythmFamily and rhythmSetNo
        const parts = rhythmSetId.split('_');
        const rhythmFamily = parts.slice(0, -1).join('_');
        const rhythmSetNo = parts[parts.length - 1];
        
        // Parse type and number from loopType
        const type = loopType.includes('loop') ? 'loop' : 'fill';
        const number = parseInt(loopType.match(/\d+/)[0], 10);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('rhythmFamily', rhythmFamily);
        formData.append('rhythmSetNo', rhythmSetNo);
        formData.append('taal', conditionsHint.taal || rhythmFamily);
        formData.append('type', type);
        formData.append('number', number);
        formData.append('timeSignature', conditionsHint.timeSignature || '4/4');
        formData.append('tempo', conditionsHint.tempo || 'medium');
        formData.append('genre', conditionsHint.genre || 'acoustic');
        formData.append('description', `${loopType} for ${rhythmSetId}`);
        
        showAlert(`Uploading ${file.name}...`, 'success');
        
        const response = await authFetch(`${API_BASE_URL}/api/loops/upload-single`, {
            method: 'POST',
            body: formData
        });
        
        showAlert(`${loopType} uploaded successfully!`, 'success');
        
        // Signal loop player to bypass cache and re-fetch files (loop file was replaced on disk)
        localStorage.setItem('loopFilesReplacedAt', Date.now().toString());
        
        // Store the current rhythm set ID to re-expand after reload
        const currentRhythmSetId = rhythmSetId;
        
        // Reload rhythm sets to update the UI
        await loadRhythmSets();

        // If the loop player panel is currently showing this same rhythm set,
        // force-reload its audio buffers so the new sample is picked up immediately
        // without requiring a full page refresh.
        if (rhythmManagerPlayer && currentPlayerRhythmSet &&
            currentPlayerRhythmSet.rhythmSetId === currentRhythmSetId) {
            const updatedSet = rhythmSets.find(s => s.rhythmSetId === currentRhythmSetId);
            if (updatedSet) {
                currentPlayerRhythmSet = updatedSet;
                await loadRhythmSetIntoPlayer(updatedSet, true);
                createSimplePlayerUI(updatedSet);
            }
        }
        
        // Find and re-expand the row
        const rhythmSetIndex = rhythmSets.findIndex(s => s.rhythmSetId === currentRhythmSetId);
        if (rhythmSetIndex !== -1) {
            setTimeout(() => {
                toggleExpandRow(rhythmSetIndex);
            }, 100);
        }
        
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        showAlert(`Error: ${error.message}`, 'error');
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

// ========================================
// Loop Player Integration
// ========================================

let rhythmManagerPlayer = null;
let currentPlayerRhythmSet = null;
let playerPanelDefaultParent = null;
let playerPanelDefaultNextSibling = null;
let inlinePlayerHostRow = null;

function mountPlayerPanelNearTrigger(triggerElement) {
    const playerPanel = document.getElementById('loopPlayerPanel');
    if (!playerPanel || !triggerElement) return false;

    if (!playerPanelDefaultParent) {
        playerPanelDefaultParent = playerPanel.parentElement;
        playerPanelDefaultNextSibling = playerPanel.nextElementSibling;
    }

    const anchorRow = triggerElement.closest('tr');
    const tbody = anchorRow ? anchorRow.parentElement : null;
    if (!anchorRow || !tbody) return false;

    if (!inlinePlayerHostRow) {
        inlinePlayerHostRow = document.createElement('tr');
        inlinePlayerHostRow.id = 'inlineLoopPlayerRow';

        const inlineCell = document.createElement('td');
        inlineCell.colSpan = 8;
        inlineCell.style.padding = '10px 12px 14px';
        inlineCell.appendChild(playerPanel);
        inlinePlayerHostRow.appendChild(inlineCell);
    } else {
        const inlineCell = inlinePlayerHostRow.firstElementChild;
        if (inlineCell && playerPanel.parentElement !== inlineCell) {
            inlineCell.appendChild(playerPanel);
        }
    }

    const insertBeforeRow = anchorRow.nextElementSibling;
    if (insertBeforeRow) {
        tbody.insertBefore(inlinePlayerHostRow, insertBeforeRow);
    } else {
        tbody.appendChild(inlinePlayerHostRow);
    }

    inlinePlayerHostRow.style.display = 'table-row';
    return true;
}

function restorePlayerPanelToDefaultMount() {
    const playerPanel = document.getElementById('loopPlayerPanel');
    if (!playerPanel || !playerPanelDefaultParent) return;

    if (inlinePlayerHostRow) {
        inlinePlayerHostRow.style.display = 'none';
    }

    if (playerPanel.parentElement !== playerPanelDefaultParent) {
        if (playerPanelDefaultNextSibling && playerPanelDefaultNextSibling.parentElement === playerPanelDefaultParent) {
            playerPanelDefaultParent.insertBefore(playerPanel, playerPanelDefaultNextSibling);
        } else {
            playerPanelDefaultParent.appendChild(playerPanel);
        }
    }
}

function mountPlayerPanelBelowQuickPlay() {
    const playerPanel = document.getElementById('loopPlayerPanel');
    const quickPlayPanel = document.getElementById('quickPlayPanel');
    if (!playerPanel || !quickPlayPanel) return false;

    if (!playerPanelDefaultParent) {
        playerPanelDefaultParent = playerPanel.parentElement;
        playerPanelDefaultNextSibling = playerPanel.nextElementSibling;
    }

    if (inlinePlayerHostRow) {
        inlinePlayerHostRow.style.display = 'none';
    }

    if (quickPlayPanel.nextElementSibling === playerPanel && playerPanel.parentElement === quickPlayPanel.parentElement) {
        return true;
    }

    quickPlayPanel.insertAdjacentElement('afterend', playerPanel);
    return true;
}

/**
 * Open loop player for a specific rhythm set
 */
async function openLoopPlayer(rhythmSetId, triggerElement = null, options = {}) {
    const rhythmSet = rhythmSets.find(s => s.rhythmSetId === rhythmSetId);
    if (!rhythmSet) {
        showAlert('Rhythm set not found', 'error');
        return;
    }

    // Check if rhythm set has any loops
    const loopCount = (rhythmSet.availableFiles || []).length;
    if (loopCount === 0) {
        showAlert('No loops available for this rhythm set. Please upload loops first.', 'warning');
        return;
    }

    currentPlayerRhythmSet = rhythmSet;

    // Show the player panel
    const playerPanel = document.getElementById('loopPlayerPanel');
    const mountTarget = options && typeof options.mountTarget === 'string'
        ? options.mountTarget.toLowerCase()
        : '';
    let mountedInline = false;

    if (mountTarget === 'quick') {
        mountedInline = mountPlayerPanelBelowQuickPlay();
    } else {
        mountedInline = mountPlayerPanelNearTrigger(triggerElement);
    }

    if (!mountedInline) {
        restorePlayerPanelToDefaultMount();
    }
    playerPanel.style.display = 'block';
    playerPanel.scrollIntoView({ behavior: 'smooth', block: mountedInline ? 'center' : 'start' });

    try {
        // Create or reuse player instance
        if (!rhythmManagerPlayer) {
            rhythmManagerPlayer = new LoopPlayerPad();
        }

        // Force-reload if loop files were replaced on disk since the player last loaded them.
        // This ensures freshly uploaded samples are always fetched, not served from cache.
        const lastReplace = parseInt(localStorage.getItem('loopFilesReplacedAt') || '0', 10);
        const lastLoad = rhythmManagerPlayer._lastLoadedAt || 0;
        const forceReload = lastReplace > lastLoad;

        // Load loops for this rhythm set
        await loadRhythmSetIntoPlayer(rhythmSet, forceReload);
        
        // Create simple UI for the player
        createSimplePlayerUI(rhythmSet);

        const autoPlayLoopType = options && typeof options.autoPlayLoopType === 'string'
            ? options.autoPlayLoopType.toLowerCase()
            : '';
        if (autoPlayLoopType && rhythmSet.files && rhythmSet.files[autoPlayLoopType]) {
            await playLoopPad(autoPlayLoopType);
        }
        
        showAlert(`Loop player loaded for: ${rhythmSetId}`, 'success');
    } catch (error) {
        console.error('Error opening loop player:', error);
        showAlert('Error opening loop player: ' + error.message, 'error');
    }
}

/**
 * Load a rhythm set's loops into the player
 * @param {object} rhythmSet
 * @param {boolean} forceReload - When true, bypasses audio buffer cache and browser HTTP cache.
 *   Pass true after an upload so freshly replaced files are picked up immediately.
 */
async function loadRhythmSetIntoPlayer(rhythmSet, forceReload = false) {
    const rhythmSetId = rhythmSet.rhythmSetId;
    const files = rhythmSet.files || {};
    
    // Build loop map with actual filenames.
    // When force-reloading after an upload, add a cache-buster to each URL so the
    // browser fetches fresh bytes even if the filename on disk is unchanged.
    const loopMap = {};
    const loopTypes = ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'];
    const cacheBuster = forceReload ? `?t=${Date.now()}` : '';
    
    loopTypes.forEach(loopType => {
        const filename = files[loopType];
        if (filename) {
            loopMap[loopType] = `${API_BASE_URL}/loops/${filename}${cacheBuster}`;
        }
    });

    console.log('Loading rhythm set into player:', rhythmSetId, forceReload ? '(force reload)' : '', loopMap);

    // Load loops into player
    try {
        await rhythmManagerPlayer.loadLoops(loopMap, rhythmSetId, forceReload);
        // Track when we last loaded so openLoopPlayer can decide whether to force-reload
        rhythmManagerPlayer._lastLoadedAt = Date.now();
        showAlert(`Loaded ${Object.keys(loopMap).length} loops`, 'success');
    } catch (error) {
        console.error('Error loading loops into player:', error);
        showAlert('Error loading loops: ' + error.message, 'error');
    }
}

/**
 * Create simple player UI
 */
function createSimplePlayerUI(rhythmSet) {
    const container = document.getElementById('loopPlayerContainer');
    const files = rhythmSet.files || {};
    
    let html = `
        <div style="background: #2c2c2c; padding: 20px; border-radius: 8px;">
            <h3 style="margin-top: 0; color: #9b59b6;">
                <i class="fas fa-drum"></i> ${escapeHtml(rhythmSet.rhythmSetId)}
            </h3>
            
            <!-- Loop Pads -->
            <div style="margin-bottom: 20px;">
                <h4 style="color: #3498db; margin-bottom: 10px;">
                    <i class="fas fa-music"></i> Main Loops
                </h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
    `;
    
    ['loop1', 'loop2', 'loop3'].forEach(loopType => {
        const hasLoop = files[loopType];
        html += `
            <button 
                class="btn ${hasLoop ? 'btn-primary' : 'btn-secondary'} loop-pad-btn" 
                data-pad="${loopType}"
                ${hasLoop ? '' : 'disabled'}
                style="padding: 15px; font-size: 16px;">
                <i class="fas fa-play-circle"></i><br>
                ${loopType.toUpperCase()}
            </button>
        `;
    });
    
    html += `
                </div>
            </div>
            
            <!-- Fill Pads -->
            <div style="margin-bottom: 20px;">
                <h4 style="color: #e67e22; margin-bottom: 10px;">
                    <i class="fas fa-drum"></i> Fills
                </h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
    `;
    
    ['fill1', 'fill2', 'fill3'].forEach(fillType => {
        const hasFill = files[fillType];
        html += `
            <button 
                class="btn ${hasFill ? 'btn-warning' : 'btn-secondary'} loop-pad-btn" 
                data-pad="${fillType}"
                ${hasFill ? '' : 'disabled'}
                style="padding: 15px; font-size: 16px;">
                <i class="fas fa-bolt"></i><br>
                ${fillType.toUpperCase()}
            </button>
        `;
    });
    
    html += `
                </div>
            </div>
            
            <!-- Controls -->
            <div style="margin-bottom: 20px;">
                <h4 style="color: #27ae60; margin-bottom: 10px;">
                    <i class="fas fa-sliders-h"></i> Controls
                </h4>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: #bbb;">
                            <i class="fas fa-volume-up"></i> Volume: <span id="volumeValue">100</span>%
                        </label>
                        <input type="range" id="volumeSlider" min="0" max="100" value="100" 
                               style="width: 100%;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: #bbb;">
                            <i class="fas fa-tachometer-alt"></i> Tempo: <span id="tempoValue">100</span>%
                        </label>
                        <input type="range" id="tempoSlider" min="50" max="200" value="100" 
                               style="width: 100%;">
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="autoFillCheckbox" checked>
                        <span style="color: #bbb;">
                            <i class="fas fa-magic"></i> Auto-fill (play fill before switching loops)
                        </span>
                    </label>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <button class="btn btn-success" id="startPlayerBtn" style="padding: 12px; font-size: 14px;">
                        <i class="fas fa-play"></i> Start / Resume
                    </button>
                    <button class="btn btn-danger" id="stopPlayerBtn" style="padding: 12px; font-size: 14px;">
                        <i class="fas fa-stop"></i> Stop
                    </button>
                </div>
            </div>
            
            <!-- Status -->
            <div id="playerStatus" style="padding: 10px; background: #1a1a1a; border-radius: 5px; color: #bbb; text-align: center;">
                <i class="fas fa-info-circle"></i> Click a loop pad to start playing
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    bindPlayerUIControls(container);
}

function bindPlayerUIControls(container) {
    if (!container) return;

    const padButtons = container.querySelectorAll('.loop-pad-btn[data-pad]');
    padButtons.forEach(button => {
        if (button.disabled) return;
        button.addEventListener('click', () => {
            const padName = button.dataset.pad || '';
            if (padName) {
                playLoopPad(padName);
            }
        });
    });

    const volumeSlider = container.querySelector('#volumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            updateVolume(volumeSlider.value);
        });
    }

    const tempoSlider = container.querySelector('#tempoSlider');
    if (tempoSlider) {
        tempoSlider.addEventListener('input', () => {
            updateTempo(tempoSlider.value);
        });
    }

    const autoFillCheckbox = container.querySelector('#autoFillCheckbox');
    if (autoFillCheckbox) {
        autoFillCheckbox.addEventListener('change', () => {
            toggleAutoFill(autoFillCheckbox.checked);
        });
    }

    const startButton = container.querySelector('#startPlayerBtn');
    if (startButton) {
        startButton.addEventListener('click', () => {
            startPlayer();
        });
    }

    const stopButton = container.querySelector('#stopPlayerBtn');
    if (stopButton) {
        stopButton.addEventListener('click', () => {
            stopPlayer();
        });
    }
}

/**
 * Play a loop or fill pad
 */
async function playLoopPad(padName) {
    if (!rhythmManagerPlayer) return;
    
    try {
        // Initialize audio context if needed (requires user gesture)
        await rhythmManagerPlayer.initialize();
        
        const status = document.getElementById('playerStatus');
        
        if (padName.startsWith('fill')) {
            rhythmManagerPlayer.playFill(padName);
            setPlayerStatus(status, 'fa-bolt', `Playing ${padName.toUpperCase()}...`);
        } else {
            rhythmManagerPlayer.switchToLoop(padName);
            await rhythmManagerPlayer.play();
            setPlayerStatus(status, 'fa-play-circle', `Playing ${padName.toUpperCase()}...`);
        }
    } catch (error) {
        console.error('Error playing pad:', error);
        showAlert(error.message, 'error');
    }
}

/**
 * Start the player
 */
async function startPlayer() {
    if (!rhythmManagerPlayer) return;
    
    try {
        await rhythmManagerPlayer.initialize();
        await rhythmManagerPlayer.play();
        
        const status = document.getElementById('playerStatus');
        setPlayerStatus(status, 'fa-play-circle', 'Playing...');
    } catch (error) {
        console.error('Error starting player:', error);
        showAlert(error.message, 'error');
    }
}

/**
 * Stop the player
 */
function stopPlayer() {
    if (!rhythmManagerPlayer) return;
    
    rhythmManagerPlayer.pause();
    
    const status = document.getElementById('playerStatus');
    setPlayerStatus(status, 'fa-stop-circle', 'Stopped');
}

/**
 * Update volume
 */
function updateVolume(value) {
    if (!rhythmManagerPlayer) return;
    
    const volumeValue = document.getElementById('volumeValue');
    if (volumeValue) volumeValue.textContent = value;
    
    rhythmManagerPlayer.setVolume(value / 100);
}

/**
 * Update tempo
 */
function updateTempo(value) {
    if (!rhythmManagerPlayer) return;
    
    const tempoValue = document.getElementById('tempoValue');
    if (tempoValue) tempoValue.textContent = value;
    
    rhythmManagerPlayer.setTempo(value / 100);
}

/**
 * Toggle auto-fill
 */
function toggleAutoFill(enabled) {
    if (!rhythmManagerPlayer) return;
    
    rhythmManagerPlayer.setAutoFill(enabled);
    
    const status = document.getElementById('playerStatus');
    if (status) {
        const iconClass = enabled ? 'fa-magic' : 'fa-ban';
        setPlayerStatus(status, iconClass, `Auto-fill ${enabled ? 'enabled' : 'disabled'}`);
    }
}

function setPlayerStatus(statusElement, iconClass, message) {
    if (!statusElement) return;

    statusElement.textContent = '';

    const icon = document.createElement('i');
    icon.className = `fas ${iconClass}`;
    statusElement.appendChild(icon);
    statusElement.appendChild(document.createTextNode(` ${message}`));
}

/**
 * Close the loop player
 */
function closeLoopPlayer() {
    if (rhythmManagerPlayer) {
        rhythmManagerPlayer.pause();
    }
    
    const playerPanel = document.getElementById('loopPlayerPanel');
    playerPanel.style.display = 'none';
    if (inlinePlayerHostRow) {
        inlinePlayerHostRow.style.display = 'none';
    }
    
    currentPlayerRhythmSet = null;
}

/**
 * Edit Rhythm Set ID
 */
function editRhythmSet(rhythmSetId, rhythmFamily, rhythmSetNo) {
    if (!ensureWriteAccess()) {
        return;
    }

    const modal = document.getElementById('editRhythmSetModal');
    const currentId = document.getElementById('editCurrentRhythmSetId');
    const familyInput = document.getElementById('editRhythmFamily');
    const setNoInput = document.getElementById('editRhythmSetNo');
    const originalIdInput = document.getElementById('editOriginalRhythmSetId');
    
    // Set current values
    currentId.textContent = rhythmSetId;
    familyInput.value = rhythmFamily;
    setNoInput.value = rhythmSetNo;
    originalIdInput.value = rhythmSetId;
    
    // Update preview
    updateEditPreview();
    
    // Show modal
    modal.style.display = 'block';
    
    // Add event listeners for live preview
    familyInput.addEventListener('input', updateEditPreview);
    setNoInput.addEventListener('input', updateEditPreview);
}

/**
 * Update the preview of new rhythm set ID
 */
async function updateEditPreview() {
    const familyInput = document.getElementById('editRhythmFamily');
    const setNoInput = document.getElementById('editRhythmSetNo');
    const preview = document.getElementById('editNewRhythmSetIdPreview');
    const conflictWarning = document.getElementById('editConflictWarning');
    const conflictMessage = document.getElementById('editConflictMessage');
    const saveButton = document.getElementById('saveEditButton');
    
    const family = familyInput.value.trim();
    const setNo = parseInt(setNoInput.value);
    
    if (!family || !setNo || setNo < 1) {
        preview.textContent = '-';
        conflictWarning.style.display = 'none';
        saveButton.disabled = true;
        return;
    }
    
    const newRhythmSetId = `${family}_${setNo}`;
    preview.textContent = newRhythmSetId;
    
    // Check for conflicts
    const originalId = document.getElementById('editOriginalRhythmSetId').value;
    if (newRhythmSetId === originalId) {
        conflictWarning.style.display = 'none';
        saveButton.disabled = false;
        return;
    }
    
    // Check if new ID already exists
    const existingSet = rhythmSets.find(set => set.rhythmSetId === newRhythmSetId);
    if (existingSet) {
        conflictWarning.style.display = 'block';
        conflictMessage.textContent = `A rhythm set with ID "${newRhythmSetId}" already exists!`;
        saveButton.disabled = true;
    } else {
        conflictWarning.style.display = 'none';
        saveButton.disabled = false;
    }
}

/**
 * Save the edited rhythm set
 */
async function saveRhythmSetEdit() {
    if (!ensureWriteAccess()) {
        return;
    }

    const originalId = document.getElementById('editOriginalRhythmSetId').value;
    const newFamily = document.getElementById('editRhythmFamily').value.trim();
    const newSetNo = parseInt(document.getElementById('editRhythmSetNo').value);
    
    if (!newFamily || !newSetNo || newSetNo < 1) {
        showAlert('Please provide valid rhythm family and set number', 'error');
        return;
    }
    
    const newRhythmSetId = `${newFamily}_${newSetNo}`;
    
    // If no change, just close
    if (newRhythmSetId === originalId) {
        closeEditModal();
        return;
    }
    
    // Confirm the change
    const confirmed = confirm(
        `Are you sure you want to update the Rhythm Set ID?\n\n` +
        `From: ${originalId}\n` +
        `To: ${newRhythmSetId}\n\n` +
        `This will update:\n` +
        `- The rhythm set in the database\n` +
        `- All loop files (renamed accordingly)\n` +
        `- All songs mapped to this rhythm set\n\n` +
        `This action cannot be undone!`
    );
    
    if (!confirmed) return;
    
    try {
        showAlert('Updating rhythm set...', 'success');
        
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${originalId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newRhythmSetId: newRhythmSetId,
                rhythmFamily: newFamily,
                rhythmSetNo: newSetNo
            })
        });
        
        const result = await response.json();
        
        showAlert(
            `Rhythm set updated successfully!\n\n` +
            `Old ID: ${originalId}\n` +
            `New ID: ${newRhythmSetId}\n\n` +
            `${result.updatedSongsCount || 0} song(s) updated.`,
            'success'
        );
        
        // Close modal and reload; signal all tabs to bust loops metadata cache
        closeEditModal();
        localStorage.setItem('loopsMetadataInvalidatedAt', Date.now().toString());
        if (typeof window.invalidateLoopsMetadataCache === 'function') {
            window.invalidateLoopsMetadataCache();
        }
        await loadRhythmSets();
        
    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        console.error('Edit error:', error);
        showAlert(error.message, 'error');
    }
}

/**
 * Close the edit modal
 */
function closeEditModal() {
    const modal = document.getElementById('editRhythmSetModal');
    modal.style.display = 'none';
    
    // Clear inputs
    document.getElementById('editRhythmFamily').value = '';
    document.getElementById('editRhythmSetNo').value = '';
    document.getElementById('editOriginalRhythmSetId').value = '';
    document.getElementById('editNewRhythmSetIdPreview').textContent = '-';
    document.getElementById('editConflictWarning').style.display = 'none';
}

/**
 * Edit notes for a rhythm set (inline editing)
 */
function editNotes(rhythmSetId, currentNotes) {
    if (!ensureWriteAccess()) {
        return;
    }

    const newNotes = prompt('Edit Notes for ' + rhythmSetId + ':', currentNotes || '');
    
    // User clicked cancel or didn't change anything
    if (newNotes === null || newNotes === currentNotes) {
        return;
    }

    // Save the notes
    saveNotes(rhythmSetId, newNotes);
}

/**
 * Save notes to the backend
 */
async function saveNotes(rhythmSetId, notes) {
    try {
        const response = await authFetch(`${API_BASE_URL}/api/rhythm-sets/${encodeURIComponent(rhythmSetId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });

        showAlert(`Notes updated for ${rhythmSetId}`, 'success');
        
        // Update the local rhythmSets array
        const setIndex = rhythmSets.findIndex(s => s.rhythmSetId === rhythmSetId);
        if (setIndex !== -1) {
            rhythmSets[setIndex].notes = notes;
        }
        
        // Re-render the table to show updated notes
        renderRhythmSetsTable();

    } catch (error) {
        if (error.message === 'AUTH_REQUIRED') {
            handleAuthRequired();
            return;
        }
        console.error('Save notes error:', error);
        showAlert('Failed to save notes: ' + error.message, 'error');
    }
}
