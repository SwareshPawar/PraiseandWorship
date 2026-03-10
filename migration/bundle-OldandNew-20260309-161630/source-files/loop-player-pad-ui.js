/**
 * Loop Player UI - Pad-based rhythm controller interface v2.0
 * 
 * Shows rhythm pads for songs mapped to an explicit rhythm set
 * Selection: strict song.rhythmSetId resolution (no condition-based fallback)
 * 
 * Auto-fill behavior: Uses fill matching the SOURCE loop
 * - Transition FROM loop1 → uses fill1
 * - Transition FROM loop2 → uses fill2
 * - Transition FROM loop3 → uses fill3
 * 
 * Note: Uses API_BASE_URL from main.js (loaded first on index.html)
 */

// Global instance
let loopPlayerInstance = null;
let loopsMetadataCache = null;

// Make loop player instance globally accessible for floating stop button
window.getLoopPlayerInstance = () => loopPlayerInstance;

/**
 * Load loops metadata (cached)
 */
async function getLoopsMetadata() {
    if (loopsMetadataCache) {
        return loopsMetadataCache;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/loops/metadata`);
        if (response.ok) {
            loopsMetadataCache = await response.json();
            return loopsMetadataCache;
        }
    } catch (error) {
        console.error('Failed to load loops metadata:', error);
    }

    return null;
}

/**
 * Get tempo category from BPM
 */
function getTempoCategory(bpm) {
    if (!bpm) return 'medium';
    const bpmNum = parseInt(bpm);
    if (bpmNum < 80) return 'slow';
    if (bpmNum > 120) return 'fast';
    return 'medium';
}

/**
 * Calculate transpose level for a song (similar to main.js logic)
 * @param {Object} song - Song object with id
 * @returns {number} - Transpose level in semitones
 */
function getTransposeLevel(song) {
    if (!song || !song.id) return 0;
    
    let transposeLevel = 0;
    
    // Priority: Global setlist transpose > User transpose
    if (typeof currentSetlistType !== 'undefined' && currentSetlistType === 'global' && 
        typeof currentViewingSetlist !== 'undefined' && currentViewingSetlist && 
        currentViewingSetlist.songTransposes && song.id in currentViewingSetlist.songTransposes) {
        // Use global setlist transpose (admin-set)
        transposeLevel = currentViewingSetlist.songTransposes[song.id] || 0;
    } else {
        // Use user's personal transpose
        try {
            const localTranspose = JSON.parse(localStorage.getItem('transposeCache') || '{}');
            if (song.id && typeof localTranspose[song.id] === 'number') {
                transposeLevel = localTranspose[song.id];
            } else if (typeof window.userData !== 'undefined' && window.userData && window.userData.transpose && song.id in window.userData.transpose) {
                transposeLevel = window.userData.transpose[song.id] || 0;
            }
        } catch (e) {
            console.warn('Error reading transpose cache:', e);
            transposeLevel = 0;
        }
    }
    
    return transposeLevel;
}

/**
 * Calculate the effective key for a song including transpose
 * @param {Object} song - Song object with key property
 * @param {number} transposeLevel - Number of semitones to transpose
 * @returns {string} - Final key (e.g., 'C', 'D#', 'F')
 */
function getEffectiveKey(song, transposeLevel = 0) {
    if (!song || !song.key) {
        return 'C'; // Default key
    }

    const normalizeKeyName = (key) => {
        const trimmed = String(key || '').trim();
        const minorMatch = trimmed.match(/^([A-Ga-g])([#b]?)(m)$/);
        if (minorMatch) {
            return `${minorMatch[1].toUpperCase()}${minorMatch[2] || ''}`;
        }
        return trimmed;
    };
    
    // Use transposeChord function from main.js if available
    if (typeof transposeChord === 'function' && transposeLevel !== 0) {
        return normalizeKeyName(transposeChord(song.key, transposeLevel));
    }
    
    // Fallback: simple key calculation
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const normalizedKey = normalizeKeyName(song.key);
    let baseIndex = keys.indexOf(normalizedKey);
    
    if (baseIndex === -1) {
        // Handle alternate notation (Db, Eb, etc.)
        const alternateMap = {
            'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
        };
        const alternate = alternateMap[normalizedKey];
        baseIndex = alternate ? keys.indexOf(alternate) : 0;
    }
    
    // Apply transpose (wrapping around the 12-tone scale)
    const finalIndex = (baseIndex + transposeLevel + 12) % 12;
    return keys[finalIndex];
}

/**
 * Check if two time signatures are equivalent
 * Examples: 6/8 ≡ 3/4, 9/8 ≡ 3/4, 12/8 ≡ 4/4
 */
function areTimeSignaturesEquivalent(time1, time2) {
    if (time1 === time2) return true;
    
    // Common equivalent time signatures
    const equivalents = {
        '6/8': ['3/4'],
        '3/4': ['6/8'], 
        '9/8': ['3/4'],
        '12/8': ['4/4'],
        '4/4': ['12/8']
    };
    
    const time1Equivalents = equivalents[time1] || [];
    return time1Equivalents.includes(time2);
}

/**
 * Resolve loop set deterministically from song.rhythmSetId
 * Returns: { loopSet, rhythmSetId } or null
 */
async function findMatchingLoopSet(song) {
    const metadata = await getLoopsMetadata();
    if (!metadata || !metadata.loops || metadata.loops.length === 0) {
        console.log('🔍 Loop resolve: No metadata or loops available');
        return null;
    }

    const rhythmSetId = String(song?.rhythmSetId || '').trim().toLowerCase();
    if (!rhythmSetId) {
        console.log('🔍 Loop resolve: Song has no rhythmSetId, player will stay hidden', {
            songId: song?.id,
            title: song?.title
        });
        return null;
    }

    const parseLoopRhythmSetId = (loop) => {
        if (loop?.rhythmSetId) {
            return String(loop.rhythmSetId).trim().toLowerCase();
        }
        const family = String(loop?.rhythmFamily || loop?.conditions?.taal || '').trim().toLowerCase().replace(/\s+/g, '_');
        const setNo = parseInt(loop?.rhythmSetNo || loop?.setNo || 1, 10);
        if (!family || !Number.isInteger(setNo) || setNo <= 0) return '';
        return `${family}_${setNo}`;
    };

    console.log('🔍 Loop resolve for song:', {
        songId: song.id,
        title: song.title,
        rhythmSetId,
        availableLoops: metadata.loops.length
    });

    // Group loops by rhythm set id for strict deterministic resolution.
    const loopSets = {};
    metadata.loops.forEach(loop => {
        const key = parseLoopRhythmSetId(loop);
        if (!key) return;
        if (!loopSets[key]) {
            loopSets[key] = {
                rhythmSetId: key,
                loops: [],
                files: {}
            };
        }
        loopSets[key].loops.push(loop);
        
        // Map files by type for easy access
        const fileKey = `${loop.type}${loop.number}`;
        loopSets[key].files[fileKey] = loop.filename;
    });

    const resolvedSet = loopSets[rhythmSetId];
    if (!resolvedSet) {
        console.log(`❌ Loop resolve: rhythmSetId ${rhythmSetId} not found in metadata`);
        return null;
    }

    return { loopSet: resolvedSet, rhythmSetId };
}

/**
 * Check if song has matching loops available
 */
async function shouldShowLoopPlayer(song) {
    if (!song) return false;
    
    const match = await findMatchingLoopSet(song);
    return match !== null;
}

/**
 * Generate HTML for loop player with pads
 */
function getLoopPlayerHTML(songId) {
    return `
<div class="loop-player-container" id="loopPlayerContainer-${songId}" style="display: none;">
    <div class="loop-player-header">
        <h4><i class="fas fa-drum"></i> Rhythm Pads</h4>
        <div class="loop-player-controls-header">
            <div class="loop-player-status" id="loopStatus-${songId}">Loading...</div>
            <button class="loop-player-toggle-btn" id="loopToggleBtn-${songId}" title="Expand/Collapse Rhythm Pads">
                <i class="fas fa-chevron-down" id="loopToggleIcon-${songId}"></i>
            </button>
        </div>
    </div>
    
    <!-- Collapsible Content (default collapsed) -->
    <div class="loop-player-content collapsed" id="loopPlayerContent-${songId}">
        <!-- Pad Grid: Rhythm Pads -->
        <div class="loop-pads-grid" id="padGrid-${songId}">
            <!-- Top Row: Loops -->
            <div class="loop-pads-row">
                <button class="loop-pad loop-pad-active" data-loop="loop1" id="pad-loop1-${songId}">
                    <span class="pad-number">1</span>
                    <span class="pad-label">Loop 1</span>
                </button>
                <button class="loop-pad" data-loop="loop2" id="pad-loop2-${songId}">
                    <span class="pad-number">2</span>
                    <span class="pad-label">Loop 2</span>
                </button>
                <button class="loop-pad" data-loop="loop3" id="pad-loop3-${songId}">
                    <span class="pad-number">3</span>
                    <span class="pad-label">Loop 3</span>
                </button>
            </div>
            
            <!-- Bottom Row: Fills -->
            <div class="loop-pads-row">
                <button class="loop-pad loop-pad-fill" data-loop="fill1" id="pad-fill1-${songId}">
                    <span class="pad-number">F1</span>
                    <span class="pad-label">Fill 1</span>
                </button>
                <button class="loop-pad loop-pad-fill" data-loop="fill2" id="pad-fill2-${songId}">
                    <span class="pad-number">F2</span>
                    <span class="pad-label">Fill 2</span>
                </button>
                <button class="loop-pad loop-pad-fill" data-loop="fill3" id="pad-fill3-${songId}">
                    <span class="pad-number">F3</span>
                    <span class="pad-label">Fill 3</span>
                </button>
            </div>

            <!-- Rhythm Volume Control -->
            <div class="volume-control-row">
                <div class="volume-control-group">
                    <label for="loopVolume-${songId}">
                        <i class="fas fa-volume-up"></i> Rhythm Volume
                    </label>
                    <input type="range" id="loopVolume-${songId}" class="volume-slider" 
                           min="0" max="100" value="80" title="Rhythm Pads Volume">
                    <span class="volume-value" id="loopVolumeValue-${songId}">80%</span>
                </div>
            </div>

            <!-- Melodic Pads Row -->
            <div class="loop-pads-row melodic-pads-row">
                <button class="loop-pad loop-pad-melodic" data-melodic="atmosphere" id="pad-atmosphere-${songId}">
                    <span class="pad-number">ATM</span>
                    <span class="pad-label">Atmosphere</span>
                    <span class="pad-key-indicator" id="atmosphere-key-${songId}">C</span>
                </button>
                <button class="loop-pad loop-pad-melodic" data-melodic="tanpura" id="pad-tanpura-${songId}">
                    <span class="pad-number">TAN</span>
                    <span class="pad-label">Tanpura</span>
                    <span class="pad-key-indicator" id="tanpura-key-${songId}">C</span>
                </button>
                <button class="loop-pad loop-pad-karaoke loop-pad-disabled" data-karaoke="karaoke" id="pad-karaoke-${songId}">
                    <span class="pad-number">KAR</span>
                    <span class="pad-label">Karaoke</span>
                </button>
            </div>

            <!-- Melodic Volume Control -->
            <div class="volume-control-row">
                <div class="volume-control-group">
                    <label for="melodic-volume-${songId}">
                        <i class="fas fa-volume-up"></i> Melodic Volume
                    </label>
                    <input type="range" id="melodic-volume-${songId}" class="volume-slider" 
                           min="0" max="100" value="50" title="Melodic Pads Volume (Atmosphere at 100%, Tanpura at 40%)">
                    <span class="volume-value" id="melodicVolumeValue-${songId}">50%</span>
                </div>
            </div>
        </div>
        
        <!-- Controls -->
        <div class="loop-player-controls">
            <button class="loop-control-btn loop-play-btn" id="loopPlayBtn-${songId}">
                <i class="fas fa-play"></i>
                <span>Play</span>
            </button>
            
            <button class="loop-control-btn loop-autofill-btn active" id="loopAutoFillBtn-${songId}">
                <i class="fas fa-magic"></i>
                <span>Auto-Fill: ON</span>
            </button>
            
            <div class="loop-control-group">
                <label>
                    <i class="fas fa-tachometer-alt"></i> Tempo
                </label>
                <input type="range" min="90" max="110" value="100" class="loop-slider" id="loopTempo-${songId}" step="1">
                <span class="loop-value" id="loopTempoValue-${songId}">100%</span>
                <button class="loop-tempo-reset-btn" id="loopTempoReset-${songId}" title="Reset to 100%">
                    <i class="fas fa-undo"></i>
                </button>
            </div>
        </div>
    </div>
</div>

${loopPlayerStyles}
`;
}

/**
 * Update melodic pad availability and enable/disable states
 * @param {number} songId - Song ID
 * @param {string} effectiveKey - Current effective key
 */
async function updateMelodicPadAvailability(songId, effectiveKey) {
    if (!loopPlayerInstance) {
        console.warn('Loop player instance not available');
        return;
    }
    
    console.log(`🔄 Updating melodic pad availability for song ${songId}, key ${effectiveKey}`);
    
    // Check availability for current key
    const melodicAvailability = await loopPlayerInstance.checkMelodicAvailability(['atmosphere', 'tanpura']);
    
    // Update pad states
    const container = document.getElementById(`loopPlayerContainer-${songId}`);
    if (!container) {
        console.warn(`Container not found for song ${songId}`);
        return;
    }
    
    const pads = container.querySelectorAll('.loop-pad[data-melodic]');
    pads.forEach(pad => {
        const melodicType = pad.dataset.melodic;
        
        if (melodicType) {
            const isAvailable = melodicAvailability[melodicType];
            
            if (isAvailable) {
                pad.disabled = false;
                pad.classList.remove('loop-pad-disabled');
                pad.title = `${melodicType} in key ${effectiveKey} (click to play)`;
                console.log(`✅ Enabled ${melodicType} pad for key ${effectiveKey}`);
            } else {
                pad.disabled = true;
                pad.classList.add('loop-pad-disabled');
                pad.title = `${melodicType}_${effectiveKey}.wav not available`;
                console.log(`❌ Disabled ${melodicType} pad - file not available for key ${effectiveKey}`);
            }
        }
    });
    
    // Return availability for status updates
    return melodicAvailability;
}

// Make the function globally accessible for transpose handlers
window.updateMelodicPadAvailability = updateMelodicPadAvailability;

/**
 * Initialize loop player for a song
 */
async function initializeLoopPlayer(songId) {
    console.log('🎵 Initializing loop player for song:', songId);
    
    // Check if songs array exists
    if (typeof songs === 'undefined') {
        console.log('❌ Songs array not available');
        return;
    }
    
    // Check if song is in the songs array
    const song = songs.find(s => s.id == songId);
    if (!song) {
        console.log('❌ Song not found in songs array:', songId);
        return;
    }
    
    console.log('🎵 Found song for loop resolve:', { 
        id: song.id, 
        title: song.title, 
        rhythmSetId: song.rhythmSetId
    });
    
    // Find matching loop set for this song
    const matchResult = await findMatchingLoopSet(song);
    
    if (!matchResult) {
        console.log('❌ No matching loop set found for song:', songId);
        const container = document.getElementById(`loopPlayerContainer-${songId}`);
        if (container) container.style.display = 'none';
        return;
    }
    
    console.log('✅ Found mapped rhythm set:', matchResult.rhythmSetId);
    
    // Calculate effective key for melodic pads
    const transposeLevel = getTransposeLevel(song);
    const effectiveKey = getEffectiveKey(song, transposeLevel);
    
    console.log('🎹 Key calculation:', {
        originalKey: song.key || 'unknown',
        transposeLevel: transposeLevel,
        effectiveKey: effectiveKey
    });
    
    // Update key indicators in UI
    const atmosphereKeyIndicator = document.getElementById(`atmosphere-key-${songId}`);
    const tanpuraKeyIndicator = document.getElementById(`tanpura-key-${songId}`);
    
    if (atmosphereKeyIndicator) {
        atmosphereKeyIndicator.textContent = effectiveKey;
    }
    if (tanpuraKeyIndicator) {
        tanpuraKeyIndicator.textContent = effectiveKey;
    }
    
    const { loopSet, rhythmSetId } = matchResult;
    
    // Show the container
    const container = document.getElementById(`loopPlayerContainer-${songId}`);
    if (!container) {
        console.log('❌ Loop container element not found:', `loopPlayerContainer-${songId}`);
        return;
    }
    container.style.display = 'block';
    console.log('✅ Loop player container shown for song:', songId);
    
    // Restore expand/collapse state from localStorage
    const isExpanded = localStorage.getItem('loopPlayerExpanded') === 'true';
    const loopContent = document.getElementById(`loopPlayerContent-${songId}`);
    const loopToggleBtn = document.getElementById(`loopToggleBtn-${songId}`);
    const loopToggleIcon = document.getElementById(`loopToggleIcon-${songId}`);
    
    if (loopContent && loopToggleBtn && loopToggleIcon) {
        if (isExpanded) {
            // Restore to expanded state
            loopContent.classList.remove('collapsed');
            loopToggleBtn.classList.add('expanded');
            loopToggleIcon.className = 'fas fa-chevron-up';
            loopToggleBtn.title = 'Collapse Rhythm Pads';
            console.log('🔓 Loop player restored to expanded state');
        } else {
            // Keep collapsed (default state from HTML)
            console.log('🔒 Loop player remains collapsed');
        }
    }
    
    // Create or reuse player instance
    if (!loopPlayerInstance) {
        loopPlayerInstance = new LoopPlayerPad();
    }
    
    // Set song key and transpose for melodic pads
    // Note: We reload samples (3rd param = true) when song changes to ensure correct key samples are loaded
    await loopPlayerInstance.setSongKeyAndTranspose(song.key, transposeLevel, true);
    
    // Set up callbacks
    loopPlayerInstance.onLoopChange = (loopName) => {
        const status = document.getElementById(`loopStatus-${songId}`);
        if (status) {
            const displayName = loopName.replace(/(\d+)/, ' $1').toUpperCase();
            status.textContent = `Playing: ${displayName}`;
        }
    };
    
    loopPlayerInstance.onPadActive = (padName) => {
        // Update active state on pads
        const allPads = container.querySelectorAll('.loop-pad');
        allPads.forEach(pad => {
            if (padName && pad.dataset.loop === padName) {
                pad.classList.add('loop-pad-active');
            } else if (padName && !padName.startsWith('fill')) {
                // Don't remove active from loops when fill is playing
                if (pad.dataset.loop && pad.dataset.loop.startsWith('loop')) {
                    pad.classList.remove('loop-pad-active');
                }
            }
        });
    };

    loopPlayerInstance.onMelodicPadToggle = (padType, isPlaying) => {
        // Update melodic pad visual state
        const melodicPad = container.querySelector(`[data-melodic="${padType}"]`);
        if (melodicPad) {
            if (isPlaying) {
                melodicPad.classList.add('loop-pad-active');
                melodicPad.title = `${padType} playing in key ${effectiveKey}`;
            } else {
                melodicPad.classList.remove('loop-pad-active');
                melodicPad.title = `${padType} in key ${effectiveKey} (click to play)`;
            }
        }
    };
    
    loopPlayerInstance.onMelodicError = (padType, error) => {
        // Disable pad if it failed to load
        const melodicPad = container.querySelector(`[data-melodic="${padType}"]`);
        if (melodicPad) {
            melodicPad.disabled = true;
            melodicPad.classList.add('loop-pad-disabled');
            melodicPad.title = `${padType}_${effectiveKey}.wav not available`;
        }
        console.warn(`Melodic pad ${padType} disabled due to error:`, error);
    };
    
    loopPlayerInstance.onError = (error) => {
        const status = document.getElementById(`loopStatus-${songId}`);
        if (status) status.textContent = `Error: ${error.message}`;
    };
    
    // Load loops with dynamic file mapping from matched loop set
    const status = document.getElementById(`loopStatus-${songId}`);
    const playBtn = document.getElementById(`loopPlayBtn-${songId}`);
    
    if (status) status.textContent = 'Loading loops...';
    if (playBtn) {
        playBtn.disabled = true;
        playBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Loading...</span>';
    }
    
    try {
        // Create loop map from matched files
        // Use API_BASE_URL for GitHub Pages compatibility (loops are served from Vercel backend)
        const loopMap = Object.entries({
            loop1: loopSet.files.loop1,
            loop2: loopSet.files.loop2,
            loop3: loopSet.files.loop3,
            fill1: loopSet.files.fill1,
            fill2: loopSet.files.fill2,
            fill3: loopSet.files.fill3
        }).reduce((acc, [name, filename]) => {
            if (filename) {
                acc[name] = `${API_BASE_URL}/loops/${filename}`;
            } else {
                console.warn(`⚠️ Missing loop file in metadata: ${name}`);
            }
            return acc;
        }, {});
        
        console.log('🔊 Loading loops from:', loopMap);
        
        // Load loops with song ID for tracking
        await loopPlayerInstance.loadLoops(loopMap, songId);
        
        // Check availability of melodic samples for the effective key
        const melodicAvailability = await loopPlayerInstance.checkMelodicAvailability(['atmosphere', 'tanpura']);
        
        // Enable/disable pads based on successful fetch (ready for on-demand decode)
        const pads = container.querySelectorAll('.loop-pad');
        pads.forEach(pad => {
            const loopName = pad.dataset.loop;
            const melodicType = pad.dataset.melodic;
            
            if (melodicType) {
                // Handle melodic pads (atmosphere/tanpura)
                const isAvailable = melodicAvailability[melodicType];
                
                if (isAvailable) {
                    pad.disabled = false;
                    pad.classList.remove('loop-pad-disabled');
                    pad.title = `${melodicType} in key ${effectiveKey} (click to play)`;
                } else {
                    pad.disabled = true;
                    pad.classList.add('loop-pad-disabled');
                    pad.title = `${melodicType}_${effectiveKey}.wav not available`;
                }
            } else if (loopName) {
                // Handle rhythm pads
                const loopFile = loopSet.files[loopName];
                const isLoaded = loopPlayerInstance.rawAudioData && loopPlayerInstance.rawAudioData.has(loopName);
                
                // Enable pad if file exists and was successfully fetched
                if (loopFile && isLoaded) {
                    pad.disabled = false;
                    pad.classList.remove('loop-pad-disabled');
                    pad.title = '';
                } else {
                    pad.disabled = true;
                    pad.classList.add('loop-pad-disabled');
                    if (!loopFile) {
                        pad.title = `${loopName} not available`;
                    } else {
                        pad.title = `${loopName} failed to load`;
                    }
                }
            }
        });
        
        // Update status and play button
        const loadedCount = loopPlayerInstance.rawAudioData ? loopPlayerInstance.rawAudioData.size : 0;
        const melodicCount = Object.values(melodicAvailability).filter(available => available).length;
        const totalMelodic = Object.keys(melodicAvailability).length;
        
        if (status) {
            // Check if there's a pending reload
            if (loopPlayerInstance.pendingLoopReload) {
                status.textContent = `🔄 New song selected - Stop and Play to load new loops`;
                status.style.color = '#ffc107'; // Warning color
            } else if (loadedCount >= 6) {
                const melodicStatus = melodicCount > 0 ? ` | Melodic: ${melodicCount}/${totalMelodic}` : ' | No melodic samples';
                status.textContent = `Ready - ${rhythmSetId}${melodicStatus} (Click Play to initialize audio)`;
                status.title = `Mapped rhythm set: ${rhythmSetId}`;
                status.style.color = ''; // Reset color
            } else {
                status.textContent = `Loaded ${loadedCount}/6 loops for ${rhythmSetId} | Melodic: ${melodicCount}/${totalMelodic}`;
                status.style.color = ''; // Reset color
            }
        }
        
        // Enable play button (audio will be initialized on first click)
        if (playBtn) {
            playBtn.disabled = false;
            playBtn.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
        }
    } catch (error) {
        console.error('Error loading loops:', error);
        if (status) status.textContent = 'Failed to load loops';
        if (playBtn) {
            playBtn.disabled = false;
            playBtn.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
        }
        return;
    }
    
    // Set up pad click handlers - remove old listeners first by cloning nodes
    const pads = container.querySelectorAll('.loop-pad');
    pads.forEach(pad => {
        // Clone node to remove all old event listeners
        const newPad = pad.cloneNode(true);
        pad.parentNode.replaceChild(newPad, pad);
        
        newPad.addEventListener('click', () => {
            if (newPad.disabled) return; // Prevent clicks on disabled pads
            
            const loopName = newPad.dataset.loop;
            const melodicType = newPad.dataset.melodic;
            
            if (melodicType) {
                // Handle melodic pad clicks
                if (melodicType === 'atmosphere') {
                    loopPlayerInstance.toggleAtmosphere();
                } else if (melodicType === 'tanpura') {
                    loopPlayerInstance.toggleTanpura();
                }
            } else if (loopName) {
                // Handle traditional rhythm pad clicks
                if (loopName.startsWith('loop')) {
                    loopPlayerInstance.switchToLoop(loopName);
                } else if (loopName.startsWith('fill')) {
                    loopPlayerInstance.playFill(loopName);
                }
            }
        });
    });
    
    // Play/Pause button - remove old listener by cloning
    if (playBtn) {
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
        
        newPlayBtn.addEventListener('click', async () => {
            if (newPlayBtn.disabled) return; // Prevent clicks while loading
            
            if (loopPlayerInstance.isPlaying) {
                loopPlayerInstance.pause();
                newPlayBtn.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
                newPlayBtn.classList.remove('playing');
                // Hide floating stop button when song stops
                if (typeof window.hideFloatingStopButton === 'function') {
                    const song = songs?.find(s => s.id === songId);
                    window.hideFloatingStopButton(songId);
                }
            } else {
                try {
                    // Immediately update UI to show "playing" state
                    newPlayBtn.innerHTML = '<i class="fas fa-pause"></i><span>Pause</span>';
                    newPlayBtn.classList.add('playing');
                    newPlayBtn.disabled = false;
                    
                    // Show immediate status - user sees "Playing: LOOP 1" right away
                    if (status) {
                        status.textContent = 'Playing: LOOP 1';
                    }
                    
                    // Show floating stop button immediately
                    if (typeof window.showFloatingStopButton === 'function') {
                        const song = songs?.find(s => s.id === songId);
                        const songTitle = song ? song.title : `Song ${songId}`;
                        window.showFloatingStopButton(songId, songTitle);
                    }
                    
                    // Start background initialization and playback (non-blocking)
                    loopPlayerInstance.play().catch(error => {
                        // Handle any background initialization errors
                        console.error('Error during background initialization:', error);
                        
                        // Revert UI state on error
                        newPlayBtn.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
                        newPlayBtn.classList.remove('playing');
                        if (status) status.textContent = `Error: ${error.message}`;
                        
                        // Hide floating stop button
                        if (typeof window.hideFloatingStopButton === 'function') {
                            window.hideFloatingStopButton(songId);
                        }
                    });
                    
                } catch (error) {
                    console.error('Error playing loops:', error);
                    const status = document.getElementById(`loopStatus-${songId}`);
                    if (status) status.textContent = `Error: ${error.message}`;
                    
                    // Reset button state on error
                    newPlayBtn.innerHTML = '<i class="fas fa-play"></i><span>Play</span>';
                    newPlayBtn.classList.remove('playing');
                    newPlayBtn.disabled = false;
                }
            }
        });
    }
    
    // Auto-fill toggle - remove old listener
    const autoFillBtn = document.getElementById(`loopAutoFillBtn-${songId}`);
    if (autoFillBtn) {
        const newAutoFillBtn = autoFillBtn.cloneNode(true);
        autoFillBtn.parentNode.replaceChild(newAutoFillBtn, autoFillBtn);
        
        newAutoFillBtn.addEventListener('click', () => {
            const newState = !loopPlayerInstance.autoFill;
            loopPlayerInstance.setAutoFill(newState);
            
            newAutoFillBtn.innerHTML = `<i class="fas fa-magic"></i><span>Auto-Fill: ${newState ? 'ON' : 'OFF'}</span>`;
            newAutoFillBtn.classList.toggle('active', newState);
        });
    }
    
    // Volume slider - remove old listener
    const volumeSlider = document.getElementById(`loopVolume-${songId}`);
    const volumeValue = document.getElementById(`loopVolumeValue-${songId}`);
    if (volumeSlider) {
        const newVolumeSlider = volumeSlider.cloneNode(true);
        volumeSlider.parentNode.replaceChild(newVolumeSlider, volumeSlider);
        
        newVolumeSlider.addEventListener('input', (e) => {
            const vol = parseInt(e.target.value) / 100;
            loopPlayerInstance.setVolume(vol);
            if (volumeValue) volumeValue.textContent = `${e.target.value}%`;
        });
    }
    
    // Tempo slider - remove old listeners
    const tempoSlider = document.getElementById(`loopTempo-${songId}`);
    const tempoValue = document.getElementById(`loopTempoValue-${songId}`);
    const tempoResetBtn = document.getElementById(`loopTempoReset-${songId}`);
    
    if (tempoSlider) {
        const newTempoSlider = tempoSlider.cloneNode(true);
        tempoSlider.parentNode.replaceChild(newTempoSlider, tempoSlider);
        
        newTempoSlider.addEventListener('input', (e) => {
            const tempoPercent = parseInt(e.target.value);
            const rate = tempoPercent / 100;
            loopPlayerInstance.setPlaybackRate(rate);
            if (tempoValue) tempoValue.textContent = `${tempoPercent}%`;
        });
    }
    
    if (tempoResetBtn) {
        const newTempoResetBtn = tempoResetBtn.cloneNode(true);
        tempoResetBtn.parentNode.replaceChild(newTempoResetBtn, tempoResetBtn);
        
        newTempoResetBtn.addEventListener('click', () => {
            const currentTempoSlider = document.getElementById(`loopTempo-${songId}`);
            if (currentTempoSlider) {
                currentTempoSlider.value = '100';
                loopPlayerInstance.setPlaybackRate(1.0);
                if (tempoValue) tempoValue.textContent = '100%';
            }
        });
    }
    
    // Melodic volume slider - remove old listener
    const melodicVolumeSlider = document.getElementById(`melodic-volume-${songId}`);
    const melodicVolumeValue = document.getElementById(`melodicVolumeValue-${songId}`);
    if (melodicVolumeSlider) {
        const newMelodicVolumeSlider = melodicVolumeSlider.cloneNode(true);
        melodicVolumeSlider.parentNode.replaceChild(newMelodicVolumeSlider, melodicVolumeSlider);
        
        newMelodicVolumeSlider.addEventListener('input', (e) => {
            const volumePercent = parseInt(e.target.value);
            const volume = volumePercent / 100;
            loopPlayerInstance.setMelodicVolume(volume);
            if (melodicVolumeValue) melodicVolumeValue.textContent = `${volumePercent}%`;
        });
    }
    
    // Toggle button (expand/collapse) - remove old listener
    const toggleBtn = document.getElementById(`loopToggleBtn-${songId}`);
    if (toggleBtn) {
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
        
        newToggleBtn.addEventListener('click', () => {
            toggleLoopPlayer(songId);
        });
    }
}

/**
 * Cleanup loop player when song changes
 */
function cleanupLoopPlayer() {
    if (loopPlayerInstance && loopPlayerInstance.isPlaying) {
        loopPlayerInstance.pause();
    }
}

/**
 * Toggle loop player expand/collapse state
 */
function toggleLoopPlayer(songId) {
    const content = document.getElementById(`loopPlayerContent-${songId}`);
    const toggleBtn = document.getElementById(`loopToggleBtn-${songId}`);
    const toggleIcon = document.getElementById(`loopToggleIcon-${songId}`);
    
    if (content && toggleBtn && toggleIcon) {
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
            // Expand
            content.classList.remove('collapsed');
            toggleBtn.classList.add('expanded');
            toggleIcon.className = 'fas fa-chevron-up';
            toggleBtn.title = 'Collapse Rhythm Pads';
            // Save expanded state to localStorage
            localStorage.setItem('loopPlayerExpanded', 'true');
        } else {
            // Collapse
            content.classList.add('collapsed');
            toggleBtn.classList.remove('expanded');
            toggleIcon.className = 'fas fa-chevron-down';
            toggleBtn.title = 'Expand Rhythm Pads';
            // Save collapsed state to localStorage
            localStorage.setItem('loopPlayerExpanded', 'false');
        }
    }
}

// CSS Styles
const loopPlayerStyles = `
<style>
.loop-player-container {
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 50%, var(--light-bg) 100%);
    border: 2px solid var(--accent-color);
    border-radius: 12px;
    padding: 20px;
    margin: 20px 0;
    box-shadow: 
        0 4px 15px rgba(0,0,0,0.3),
        inset 0 1px 0 rgba(197, 177, 148, 0.2);
    position: relative;
    overflow: hidden;
}

.loop-player-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: 
        radial-gradient(circle at 20% 50%, rgba(197, 177, 148, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 50%, rgba(125, 141, 134, 0.1) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
}

.loop-player-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1px;
    color: var(--accent-color);
    position: relative;
    z-index: 1;
}

.loop-player-header h4 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 8px;
}

.loop-player-header h4 i {
    color: var(--warning-color);
    font-size: 1.2em;
    animation: rhythmPulse 2s ease-in-out infinite;
}

@keyframes rhythmPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
}

.loop-player-controls-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.loop-player-status {
    font-size: 0.9em;
    background: rgba(197, 177, 148, 0.2);
    color: var(--accent-color);
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid rgba(197, 177, 148, 0.3);
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    font-weight: 500;
}

.loop-player-toggle-btn {
    background: linear-gradient(135deg, rgba(197, 177, 148, 0.2) 0%, rgba(125, 141, 134, 0.2) 100%);
    border: 1px solid var(--accent-color);
    border-radius: 8px;
    color: var(--accent-color);
    padding: 8px 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.loop-player-toggle-btn:hover {
    background: linear-gradient(135deg, rgba(197, 177, 148, 0.3) 0%, rgba(125, 141, 134, 0.3) 100%);
    border-color: var(--warning-color);
    color: var(--warning-color);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}

.loop-player-toggle-btn i {
    transition: transform 0.3s ease;
}

.loop-player-toggle-btn.expanded i {
    transform: rotate(180deg);
}

.loop-player-content {
    transition: all 0.3s ease;
    overflow: visible;
    position: relative;
    z-index: 1;
}

.loop-player-content.collapsed {
    max-height: 0;
    opacity: 0;
    padding: 0;
    margin: 0;
    overflow: hidden;
}

.loop-pads-grid {
    margin-bottom: 20px;
    width: 100%;
    max-width: 100%;
    overflow: visible;
}

.loop-pads-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 12px;
    width: 100%;
}

.loop-pad {
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 0.15) 0%, 
        rgba(125, 141, 134, 0.15) 50%, 
        rgba(62, 63, 41, 0.15) 100%);
    border: 2px solid rgba(197, 177, 148, 0.4);
    border-radius: 10px;
    padding: 20px 10px;
    color: var(--accent-color);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    box-shadow: 
        0 3px 6px rgba(0,0,0,0.2),
        inset 0 1px 0 rgba(197, 177, 148, 0.1);
    position: relative;
    overflow: hidden;
}

.loop-pad::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at center, rgba(197, 177, 148, 0.05) 0%, transparent 70%);
    transition: opacity 0.3s ease;
    opacity: 0;
}

.loop-pad:hover {
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 0.25) 0%, 
        rgba(125, 141, 134, 0.25) 50%, 
        rgba(62, 63, 41, 0.25) 100%);
    border-color: var(--accent-color);
    transform: translateY(-3px) scale(1.02);
    box-shadow: 
        0 6px 12px rgba(0,0,0,0.3),
        inset 0 1px 0 rgba(197, 177, 148, 0.2);
    color: #fff;
}

.loop-pad:hover::before {
    opacity: 1;
}

.loop-pad-active {
    background: linear-gradient(135deg, 
        rgba(243, 156, 18, 0.2) 0%, 
        rgba(197, 177, 148, 0.2) 50%, 
        rgba(125, 141, 134, 0.2) 100%);
    border-color: var(--warning-color);
    color: #fff;
    box-shadow: 
        0 0 20px rgba(243, 156, 18, 0.4),
        0 4px 8px rgba(0,0,0,0.3);
    animation: activePadGlow 2s ease-in-out infinite alternate;
}

@keyframes activePadGlow {
    0% { box-shadow: 0 0 20px rgba(243, 156, 18, 0.4), 0 4px 8px rgba(0,0,0,0.3); }
    100% { box-shadow: 0 0 25px rgba(243, 156, 18, 0.6), 0 4px 8px rgba(0,0,0,0.3); }
}

.loop-pad-fill {
    background: linear-gradient(135deg, 
        rgba(125, 141, 134, 0.2) 0%, 
        rgba(62, 63, 41, 0.2) 50%, 
        rgba(45, 44, 40, 0.2) 100%);
    border-color: var(--secondary-color);
}

.loop-pad-fill:hover {
    background: linear-gradient(135deg, 
        rgba(125, 141, 134, 0.3) 0%, 
        rgba(62, 63, 41, 0.3) 50%, 
        rgba(45, 44, 40, 0.3) 100%);
    border-color: var(--text-color);
}

.loop-pad-disabled {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
    background: linear-gradient(135deg, 
        rgba(100, 100, 100, 0.15) 0%, 
        rgba(80, 80, 80, 0.15) 100%) !important;
    border-color: rgba(100, 100, 100, 0.3) !important;
    color: rgba(197, 177, 148, 0.5) !important;
}

.loop-pad-disabled:hover {
    transform: none !important;
    box-shadow: 0 3px 6px rgba(0,0,0,0.2) !important;
}

.pad-number {
    font-size: 1.5em;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.pad-label {
    font-size: 0.85em;
    opacity: 0.9;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.loop-player-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: stretch;
}

.loop-control-btn {
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 0.2) 0%, 
        rgba(125, 141, 134, 0.2) 100%);
    border: 1px solid var(--accent-color);
    border-radius: 8px;
    color: var(--accent-color);
    padding: 10px 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    font-size: 0.9em;
    white-space: nowrap;
}

.loop-control-btn:hover {
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 0.3) 0%, 
        rgba(125, 141, 134, 0.3) 100%);
    border-color: var(--warning-color);
    color: #fff;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}

.loop-control-btn.playing,
.loop-control-btn.active {
    background: linear-gradient(135deg, 
        rgba(40, 167, 69, 0.7) 0%, 
        rgba(34, 139, 58, 0.7) 100%);
    border-color: var(--success-color);
    color: white;
    box-shadow: 
        0 0 15px rgba(40, 167, 69, 0.5),
        0 2px 4px rgba(0,0,0,0.2);
}

.loop-control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: linear-gradient(135deg, 
        rgba(100, 100, 100, 0.2) 0%, 
        rgba(80, 80, 80, 0.2) 100%);
    border-color: rgba(100, 100, 100, 0.3);
    color: rgba(197, 177, 148, 0.5);
}

.loop-control-btn:disabled:hover {
    transform: none;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.loop-control-group {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-color);
    background: linear-gradient(135deg, 
        rgba(45, 44, 40, 0.4) 0%, 
        rgba(62, 63, 41, 0.4) 100%);
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(197, 177, 148, 0.2);
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
    flex-wrap: wrap;
    min-width: 0;
}

.loop-control-group label {
    font-size: 0.85em;
    font-weight: 600;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 4px;
}

.loop-tempo-info {
    width: 100%;
    margin-top: 4px;
    text-align: center;
}

.loop-tempo-quality {
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7em;
    font-weight: 600;
}

.loop-tempo-quality.optimal {
    background: rgba(40, 167, 69, 0.8);
    color: white;
}

.loop-tempo-quality.acceptable {
    background: rgba(243, 156, 18, 0.8);
    color: white;
}

.loop-tempo-quality.extreme {
    background: rgba(231, 76, 60, 0.8);
    color: white;
}

.loop-slider {
    flex: 1;
    min-width: 60px;
    accent-color: var(--accent-color);
}

.loop-value {
    font-size: 0.8em;
    font-weight: 600;
    min-width: 38px;
    text-align: right;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    flex-shrink: 0;
}

.loop-tempo-reset-btn {
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 0.8) 0%, 
        rgba(125, 141, 134, 0.8) 100%);
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    width: 26px;
    height: 26px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 4px;
    transition: all 0.2s;
    font-size: 0.75em;
    color: var(--primary-color);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    flex-shrink: 0;
}

.loop-tempo-reset-btn:hover {
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 1) 0%, 
        rgba(125, 141, 134, 1) 100%);
    border-color: var(--warning-color);
    color: var(--primary-color);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.loop-tempo-reset-btn:active {
    transform: scale(0.95);
}

/* ===== MELODIC PADS STYLES ===== */

.melodic-pads-row {
    border-top: 2px solid rgba(197, 177, 148, 0.3);
    padding-top: 12px;
    margin-top: 8px;
    position: relative;
}

.melodic-pads-row::before {
    content: '♫ MELODIC PADS ♫';
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, 
        rgba(197, 177, 148, 0.9) 0%, 
        rgba(125, 141, 134, 0.9) 100%);
    color: var(--primary-color);
    padding: 2px 12px;
    border-radius: 12px;
    font-size: 0.7em;
    font-weight: 700;
    border: 1px solid var(--accent-color);
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    letter-spacing: 1px;
}

.loop-pad-melodic {
    background: linear-gradient(135deg, 
        rgba(138, 43, 226, 0.15) 0%, 
        rgba(75, 0, 130, 0.15) 50%, 
        rgba(123, 104, 238, 0.15) 100%);
    border: 2px solid rgba(138, 43, 226, 0.4);
    color: #e6b3ff;
    position: relative;
    overflow: visible;
}

.loop-pad-melodic:hover {
    background: linear-gradient(135deg, 
        rgba(138, 43, 226, 0.3) 0%, 
        rgba(75, 0, 130, 0.3) 50%, 
        rgba(123, 104, 238, 0.3) 100%);
    border-color: rgba(186, 85, 211, 0.8);
    color: #fff;
    box-shadow: 
        0 6px 20px rgba(138, 43, 226, 0.4),
        inset 0 1px 0 rgba(186, 85, 211, 0.2);
}

.loop-pad-melodic.loop-pad-active {
    background: linear-gradient(135deg, 
        rgba(138, 43, 226, 0.4) 0%, 
        rgba(75, 0, 130, 0.4) 50%, 
        rgba(123, 104, 238, 0.4) 100%);
    border-color: #ba55d3;
    color: #fff;
    box-shadow: 
        0 0 25px rgba(138, 43, 226, 0.6),
        0 4px 8px rgba(0,0,0,0.3);
    animation: melodicPadGlow 3s ease-in-out infinite alternate;
}

@keyframes melodicPadGlow {
    0% { 
        box-shadow: 
            0 0 25px rgba(138, 43, 226, 0.6),
            0 4px 8px rgba(0,0,0,0.3);
    }
    100% { 
        box-shadow: 
            0 0 35px rgba(186, 85, 211, 0.8),
            0 6px 12px rgba(0,0,0,0.4);
    }
}

.loop-pad-karaoke {
    background: linear-gradient(135deg, 
        rgba(255, 165, 0, 0.15) 0%, 
        rgba(255, 140, 0, 0.15) 50%, 
        rgba(255, 120, 0, 0.15) 100%);
    border: 2px solid rgba(255, 165, 0, 0.4);
    color: #ffcc80;
}

.loop-pad-karaoke:hover:not(.loop-pad-disabled) {
    background: linear-gradient(135deg, 
        rgba(255, 165, 0, 0.3) 0%, 
        rgba(255, 140, 0, 0.3) 50%, 
        rgba(255, 120, 0, 0.3) 100%);
    border-color: rgba(255, 165, 0, 0.8);
    color: #fff;
    box-shadow: 
        0 6px 20px rgba(255, 165, 0, 0.4),
        inset 0 1px 0 rgba(255, 165, 0, 0.2);
}

.loop-pad-karaoke.loop-pad-active {
    background: linear-gradient(135deg, 
        rgba(255, 165, 0, 0.4) 0%, 
        rgba(255, 140, 0, 0.4) 50%, 
        rgba(255, 120, 0, 0.4) 100%);
    border-color: #ffa500;
    color: #fff;
    box-shadow: 
        0 0 25px rgba(255, 165, 0, 0.6),
        0 4px 8px rgba(0,0,0,0.3);
}

.pad-key-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 0.6em;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    letter-spacing: 0.5px;
    z-index: 10;
}

.loop-pad-melodic .pad-key-indicator {
    background: linear-gradient(135deg, rgba(138, 43, 226, 0.9), rgba(75, 0, 130, 0.9));
    border-color: rgba(186, 85, 211, 0.6);
    color: #fff;
}

/* ===== VOLUME CONTROL ROW STYLES ===== */

.volume-control-row {
    margin: 12px 0;
    width: 100%;
}

.volume-control-group {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--accent-color);
    background: linear-gradient(135deg, 
        rgba(45, 44, 40, 0.5) 0%, 
        rgba(62, 63, 41, 0.5) 100%);
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid rgba(197, 177, 148, 0.3);
    box-shadow: 
        inset 0 1px 3px rgba(0,0,0,0.3),
        0 2px 4px rgba(0,0,0,0.2);
}

.volume-control-group label {
    font-size: 0.9em;
    font-weight: 600;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: fit-content;
}

.volume-control-group label i {
    font-size: 1.1em;
    color: var(--warning-color);
}

.volume-slider {
    flex: 1;
    min-width: 100px;
    height: 6px;
    background: rgba(197, 177, 148, 0.3);
    outline: none;
    border-radius: 3px;
    accent-color: var(--accent-color);
    cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: linear-gradient(135deg, var(--accent-color), var(--secondary-color));
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.volume-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: linear-gradient(135deg, var(--accent-color), var(--secondary-color));
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid #fff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.volume-value {
    font-size: 0.9em;
    font-weight: 700;
    min-width: 45px;
    text-align: right;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    color: var(--warning-color);
}

@media (max-width: 768px) {
    .loop-player-controls {
        grid-template-columns: 1fr;
        gap: 10px;
    }
    
    .loop-pads-row {
        gap: 8px;
    }
    
    .loop-pad {
        padding: 15px 8px;
    }
    
    .pad-number {
        font-size: 1.3em;
    }
    
    .pad-label {
        font-size: 0.75em;
    }
    
    .loop-player-container {
        padding: 12px;
        margin: 12px 0;
    }
    
    .loop-control-group {
        padding: 8px 10px;
        gap: 6px;
    }
    
    .loop-control-group label {
        font-size: 0.8em;
    }
    
    .loop-slider {
        min-width: 50px;
    }
    
    .loop-value {
        font-size: 0.75em;
        min-width: 34px;
    }
    
    .loop-tempo-reset-btn {
        width: 24px;
        height: 24px;
        font-size: 0.7em;
        margin-left: 2px;
    }
    
    .volume-control-group {
        padding: 10px 12px;
        gap: 10px;
    }
    
    .volume-control-group label {
        font-size: 0.85em;
    }
    
    .volume-slider {
        min-width: 80px;
    }
    
    .volume-value {
        font-size: 0.85em;
        min-width: 42px;
    }
}

@media (max-width: 480px) {
    .loop-player-container {
        padding: 10px;
        margin: 10px 0;
    }
    
    .loop-pads-row {
        gap: 6px;
    }
    
    .loop-pad {
        padding: 12px 6px;
    }
    
    .pad-number {
        font-size: 1.2em;
    }
    
    .pad-label {
        font-size: 0.7em;
    }
    
    .loop-control-group {
        padding: 6px 8px;
        gap: 4px;
    }
    
    .loop-control-group label {
        font-size: 0.75em;
    }
    
    .loop-slider {
        min-width: 40px;
    }
    
    .loop-value {
        font-size: 0.7em;
        min-width: 30px;
    }
    
    .loop-tempo-reset-btn {
        width: 22px;
        height: 22px;
        font-size: 0.65em;
    }
    
    .volume-control-group {
        padding: 8px 10px;
        gap: 8px;
    }
    
    .volume-control-group label {
        font-size: 0.8em;
    }
    
    .volume-slider {
        min-width: 60px;
    }
    
    .volume-value {
        font-size: 0.8em;
        min-width: 38px;
    }
    
    .pad-key-indicator {
        font-size: 0.55em;
        padding: 1px 4px;
    }
    
    .melodic-pads-row::before {
        font-size: 0.65em;
        padding: 1px 8px;
    }
}

@media (min-width: 769px) and (max-width: 1024px) {
    .loop-player-controls {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }
    
    .loop-control-group {
        padding: 9px 11px;
    }
}
</style>
`;
