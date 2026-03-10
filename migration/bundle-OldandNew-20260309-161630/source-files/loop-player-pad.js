/**
 * Loop Player - Rhythm Pad Controller (Simplified Web Audio version)
 * 
 * Features:
 * - Loads loops from /loops/ folder (LOOP01-03 and FILL1-3)
 * - Pad-based switching (6 pads: 3 loops + 3 fills)
 * - Switches only after current loop completes (maintains rhythm)
 * - Auto-fill mode: plays fill before switching to target loop
 * - Tempo range: 50-200% (0.5x-2x)
 * - Volume control
 * 
 * Note: Uses basic Web Audio API playbackRate (pitch changes with tempo)
 * For true pitch preservation, advanced DSP algorithms like Phase Vocoder or WSOLA would be needed
 */

class LoopPlayerPad {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = new Map(); // Map<name, AudioBuffer>
        this.rawAudioData = new Map(); // Map<name, ArrayBuffer> - raw data before decoding
        this.currentSource = null;
        this.gainNode = null;
        
        // Playback state
        this.isPlaying = false;
        this.isInitializing = false;
        this.currentLoop = 'loop1';
        this.nextLoop = null;
        this.nextFill = null;
        this.loopTimeout = null;
        
        // Melodic pads state
        this.melodicPads = {
            atmosphere: {
                isPlaying: false,
                source: null,
                gainNode: null
            },
            tanpura: {
                isPlaying: false,
                source: null,
                gainNode: null
            }
        };
        this.currentSongKey = null;
        this.currentTranspose = 0;
        
        // Song/loop tracking for reload detection
        this.currentSongId = null;
        this.currentLoopSet = null;
        this.pendingLoopReload = null;
        
        // Settings
        this.autoFill = true;
        this.volumeLevel = 0.8;
        this.playbackRate = 1.0; // 0.5-2.0
        this.atmosphereVolume = 0.5; // 50% volume for atmosphere pad (increased for prominence)
        this.tanpuraVolume = 0.22; // 20% volume for tanpura pad (subtle but audible background drone)
        
        // Timing
        this.loopDuration = 0;
        
        // Callbacks
        this.onLoopChange = null;
        this.onPadActive = null;
        this.onMelodicPadToggle = null;
        this.onMelodicError = null;
        this.onError = null;
    }

    /**
     * Initialize Web Audio API
     */
    async initialize() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = this.volumeLevel;
            
            // Create gain nodes for melodic pads
            this.melodicPads.atmosphere.gainNode = this.audioContext.createGain();
            this.melodicPads.atmosphere.gainNode.connect(this.audioContext.destination);
            this.melodicPads.atmosphere.gainNode.gain.value = this.atmosphereVolume;
            
            this.melodicPads.tanpura.gainNode = this.audioContext.createGain();
            this.melodicPads.tanpura.gainNode.connect(this.audioContext.destination);
            this.melodicPads.tanpura.gainNode.gain.value = this.tanpuraVolume;
            
            console.log('Web Audio API initialized with melodic pad support');
            
            // Decode any already-loaded samples (both rhythmic and melodic)
            await this._decodeLoadedSamples();
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Decode all loaded raw audio data
     * @private
     */
    async _decodeLoadedSamples() {
        if (!this.audioContext) return;
        
        const decodePromises = [];
        
        // Decode all raw audio data that hasn't been decoded yet
        for (const [name, rawData] of this.rawAudioData) {
            if (!this.audioBuffers.has(name)) {
                const decodePromise = this.audioContext.decodeAudioData(rawData.slice())
                    .then(audioBuffer => {
                        this.audioBuffers.set(name, audioBuffer);
                        console.log(`Decoded sample: ${name}, duration: ${audioBuffer.duration.toFixed(2)}s`);
                    })
                    .catch(error => {
                        console.warn(`Failed to decode sample ${name}:`, error);
                    });
                decodePromises.push(decodePromise);
            }
        }
        
        if (decodePromises.length > 0) {
            await Promise.all(decodePromises);
            console.log(`✅ Decoded ${decodePromises.length} samples`);
        }
    }

    /**
     * Check if loops need to be reloaded for a new song
     * @param {number} songId
     * @param {object} loopMap
     * @returns {boolean}
     */
    needsLoopReload(songId, loopMap) {
        // Always reload if song ID changed
        if (this.currentSongId !== songId) {
            console.log('🔄 Song ID changed:', this.currentSongId, '→', songId);
            return true;
        }
        
        // Check if loop files changed
        if (!this.currentLoopSet) {
            console.log('🔄 No previous loop set');
            return true;
        }
        
        // Compare loop file URLs
        const currentUrls = Object.values(this.currentLoopSet || {}).sort().join('|');
        const newUrls = Object.values(loopMap || {}).sort().join('|');
        
        const changed = currentUrls !== newUrls;
        if (changed) {
            console.log('🔄 Loop set changed:', currentUrls, '→', newUrls);
        }
        
        return changed;
    }

    /**
     * Load loop samples from the /loops/ folder (fetch only, decode later after user gesture)
     * @param {Object} loopMap - Optional map of loop names to URLs
     * @param {number} songId - Optional song ID for tracking
     * Uses new naming convention v2.0: {taal}_{time}_{tempo}_{genre}_{TYPE}{num}.wav
     * Falls back to keherwa_4_4 files if no map provided (backward compatibility)
     */
    async loadLoops(loopMap = null, songId = null) {
        // Default to keherwa_4_4 files if no map provided (backward compatibility)
        if (!loopMap) {
            loopMap = {
                'loop1': '/loops/keherwa_4_4_LOOP1.wav',
                'loop2': '/loops/keherwa_4_4_LOOP2.wav',
                'loop3': '/loops/keherwa_4_4_LOOP3.wav',
                'fill1': '/loops/keherwa_4_4_FILL1.wav',
                'fill2': '/loops/keherwa_4_4_FILL2.wav',
                'fill3': '/loops/keherwa_4_4_FILL3.wav'
            };
        }

        // Check if reload is needed
        const needsReload = this.needsLoopReload(songId, loopMap);
        
        if (!needsReload && this.rawAudioData.size > 0) {
            console.log('✅ Loops already loaded for this song');
            return;
        }
        
        // If currently playing, queue reload for next play
        if (needsReload && this.isPlaying) {
            console.log('🔄 Different song/loops detected - queueing reload for next play');
            this.pendingLoopReload = { loopMap, songId };
            // Don't interrupt current playback
            return;
        }
        
        // Update tracking
        this.currentSongId = songId;
        this.currentLoopSet = loopMap ? { ...loopMap } : null;
        this.pendingLoopReload = null;
        
        // Clear old data if reloading
        if (needsReload) {
            console.log('🗑️ Clearing old loop data');
            this.rawAudioData.clear();
            this.audioBuffers.clear();
        }

        // Only fetch raw audio data (don't decode yet - requires user gesture)
        const loadPromises = Object.entries(loopMap).map(async ([name, url]) => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                this.rawAudioData.set(name, arrayBuffer);
                console.log(`Fetched: ${name}, size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
            } catch (error) {
                console.error(`Failed to fetch ${name}:`, error);
                throw error;
            }
        });

        await Promise.all(loadPromises);
        
        console.log(`Successfully fetched ${this.rawAudioData.size} loop files for song ${songId}`);
    }
    
    /**
     * Decode all raw audio data into AudioBuffers (after user gesture)
     * @private
     */
    async _decodeAudioData() {
        // Check if rhythm loops specifically are decoded (not just any audio buffers)
        const hasRhythmLoops = this.audioBuffers.has('loop1') || 
                               this.audioBuffers.has('loop2') || 
                               this.audioBuffers.has('loop3');
        
        if (hasRhythmLoops) {
            return; // Rhythm loops already decoded
        }
        
        if (!this.audioContext) {
            throw new Error('AudioContext not initialized');
        }
        
        console.log('Decoding audio buffers...');
        
        const decodePromises = Array.from(this.rawAudioData.entries()).map(async ([name, arrayBuffer]) => {
            try {
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.audioBuffers.set(name, audioBuffer);
                console.log(`Decoded: ${name}, duration: ${audioBuffer.duration.toFixed(2)}s`);
            } catch (error) {
                console.warn(`Failed to decode ${name}:`, error.message);
                // Don't throw - continue with other files
                // The pad will be disabled in the UI
            }
        });
        
        await Promise.all(decodePromises);
        
        // Set initial loop duration
        const loop1Buffer = this.audioBuffers.get('loop1');
        if (loop1Buffer) {
            this.loopDuration = loop1Buffer.duration;
        }
        
        console.log(`Successfully decoded ${this.audioBuffers.size} audio buffers`);
    }

    /**
     * Apply pending loop reload if any
     * @private
     */
    async _applyPendingReload() {
        if (!this.pendingLoopReload) {
            return false;
        }
        
        console.log('🔄 Applying pending loop reload');
        const { loopMap, songId } = this.pendingLoopReload;
        this.pendingLoopReload = null;
        
        // Update tracking
        this.currentSongId = songId;
        this.currentLoopSet = loopMap ? { ...loopMap } : null;
        
        // Clear old samples
        console.log('🗑️ Clearing old loop data for reload');
        this.rawAudioData.clear();
        this.audioBuffers.clear();
        
        // Fetch new loops
        const loadPromises = Object.entries(loopMap).map(async ([name, url]) => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                this.rawAudioData.set(name, arrayBuffer);
                console.log(`Fetched: ${name}, size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
            } catch (error) {
                console.error(`Failed to fetch ${name}:`, error);
                throw error;
            }
        });
        
        await Promise.all(loadPromises);
        console.log(`✅ Reloaded ${this.rawAudioData.size} loop files for song ${songId}`);
        
        return true;
    }

    /**
     * Start playing the current loop
     */
    async play() {
        if (this.isPlaying) return;
        
        // Check and apply pending reload first
        if (this.pendingLoopReload) {
            console.log('🔄 Detected pending reload - applying before play');
            await this._applyPendingReload();
        }
        
        // Set loading state
        this.isInitializing = true;
        
        try {
            // Initialize everything silently first
            await this._initializeAllSamples();
            
            // Check if loops are loaded
            if (this.audioBuffers.size === 0) {
                if (this.onError) this.onError(new Error('No loops loaded'));
                return;
            }
            
            // Now start actual playback
            this.isPlaying = true;
            this.isInitializing = false;
            this._playLoop(this.currentLoop, true);
            
        } catch (error) {
            this.isInitializing = false;
            console.error('Error during audio initialization:', error);
            if (this.onError) this.onError(error);
        }
    }

    /**
     * Initialize all available audio samples silently
     * @private
     */
    async _initializeAllSamples() {
        console.log('🔄 Initializing all audio samples...');
        
        // Initialize Web Audio API with silent gain
        await this._initializeSilent();
        
        // Initialize all rhythm loops
        await this._initializeRhythmSamples();
        
        // Initialize available melodic samples
        await this._initializeMelodicSamples();
        
        // Restore proper volume levels
        this._restoreVolumeFromSilent();
        
        console.log('✅ All audio samples initialized and ready');
    }

    /**
     * Initialize Web Audio API with silent output
     * @private
     */
    async _initializeSilent() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create gain nodes with ZERO volume initially
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0; // Silent during initialization
            
            // Create melodic gain nodes (also silent)
            this.melodicPads.atmosphere.gainNode = this.audioContext.createGain();
            this.melodicPads.atmosphere.gainNode.connect(this.audioContext.destination);
            this.melodicPads.atmosphere.gainNode.gain.value = 0;
            
            this.melodicPads.tanpura.gainNode = this.audioContext.createGain();
            this.melodicPads.tanpura.gainNode.connect(this.audioContext.destination);
            this.melodicPads.tanpura.gainNode.gain.value = 0;
            
            console.log('🔇 Web Audio API initialized silently');
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Initialize and decode all rhythm samples
     * @private
     */
    async _initializeRhythmSamples() {
        // Decode rhythm loops if not already decoded
        // Check if any rhythm loops exist rather than checking if audioBuffers is empty
        // (melodic samples may already be in audioBuffers)
        const hasRhythmLoops = this.audioBuffers.has('loop1') || 
                               this.audioBuffers.has('loop2') || 
                               this.audioBuffers.has('loop3');
        
        if (!hasRhythmLoops && this.rawAudioData.size > 0) {
            await this._decodeAudioData();
        }
    }

    /**
     * Initialize available melodic samples for current key
     * @private
     */
    async _initializeMelodicSamples() {
        // Check which melodic samples are available
        const availability = await this.checkMelodicAvailability(['atmosphere', 'tanpura']);
        const availableTypes = Object.keys(availability).filter(type => availability[type]);
        
        if (availableTypes.length > 0) {
            console.log(`🎵 Loading melodic samples: ${availableTypes.join(', ')}`);
            await this.loadMelodicSamples(false, availableTypes);
        }
    }

    /**
     * Restore proper volume levels after silent initialization
     * @private
     */
    _restoreVolumeFromSilent() {
        if (this.gainNode) {
            this.gainNode.gain.value = this.volumeLevel;
        }
        if (this.melodicPads.atmosphere.gainNode) {
            this.melodicPads.atmosphere.gainNode.gain.value = this.atmosphereVolume;
        }
        if (this.melodicPads.tanpura.gainNode) {
            this.melodicPads.tanpura.gainNode.gain.value = this.tanpuraVolume;
        }
        console.log('🔊 Volume levels restored');
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        
        // Stop current source
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.currentSource = null;
        }
        
        // Stop all melodic pads
        this._stopAllMelodicPads();
        
        // Clear any scheduled loops
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
            this.loopTimeout = null;
        }
    }

    /**
     * Switch to a different loop pad (queued - waits for current to finish)
     * @param {string} loopName - 'loop1', 'loop2', or 'loop3'
     */
    switchToLoop(loopName) {
        if (!['loop1', 'loop2', 'loop3'].includes(loopName)) {
            return;
        }

        // If auto-fill is on, queue fill matching the CURRENT loop (source)
        if (this.autoFill && loopName !== this.currentLoop) {
            const currentLoopNum = this.currentLoop.replace('loop', '');
            this.nextFill = `fill${currentLoopNum}`;
        }

        this.nextLoop = loopName;
    }

    /**
     * Play a fill immediately after current loop finishes
     * @param {string} fillName - 'fill1', 'fill2', or 'fill3'
     */
    playFill(fillName) {
        if (!['fill1', 'fill2', 'fill3'].includes(fillName)) {
            return;
        }

        this.nextFill = fillName;
    }

    /**
     * Toggle auto-fill mode
     * @param {boolean} enabled
     */
    setAutoFill(enabled) {
        this.autoFill = enabled;
    }

    /**
     * Set volume (0-1)
     * @param {number} vol - Volume level 0-1
     */
    setVolume(vol) {
        this.volumeLevel = Math.max(0, Math.min(1, vol));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volumeLevel;
        }
    }

    /**
     * Set melodic pads volume (0-1)
     * @param {number} vol - Volume level 0-1
     */
    setMelodicVolume(vol) {
        // Keep the shared volume setter for backward compatibility
        // but apply different volumes to each pad
        const normalizedVol = Math.max(0, Math.min(1, vol));
        
        // Set atmosphere to the provided volume
        this.atmosphereVolume = normalizedVol;
        if (this.melodicPads.atmosphere.gainNode) {
            this.melodicPads.atmosphere.gainNode.gain.value = this.atmosphereVolume;
        }
        
        // Set tanpura to 40% of atmosphere volume (audible but not overpowering)
        this.tanpuraVolume = normalizedVol * 0.4;
        if (this.melodicPads.tanpura.gainNode) {
            this.melodicPads.tanpura.gainNode.gain.value = this.tanpuraVolume;
        }
    }

    /**
     * Set current song key and transpose for melodic pads
     * @param {string} key - Song key (e.g., 'C', 'D#', 'F')
     * @param {number} transpose - Transpose level (+/- semitones)
     * @param {boolean} reloadSamples - Whether to reload melodic samples immediately
     */
    async setSongKeyAndTranspose(key, transpose = 0, reloadSamples = false) {
        const oldKey = this._getEffectiveKey();
        this.currentSongKey = key;
        this.currentTranspose = transpose;
        const newKey = this._getEffectiveKey();
        
        console.log(`🎹 Set song key: ${key}, transpose: ${transpose} → Effective key: ${newKey}`);
        
        // If key changed and samples should be reloaded
        if (reloadSamples && oldKey !== newKey) {
            console.log(`🔄 Key changed from ${oldKey} to ${newKey} - reloading melodic samples`);
            
            // Stop all melodic pads
            this._stopAllMelodicPads();
            
            // Clear old melodic samples from cache
            const oldAtmosphereKey = `atmosphere_${oldKey}`;
            const oldTanpuraKey = `tanpura_${oldKey}`;
            this.rawAudioData.delete(oldAtmosphereKey);
            this.rawAudioData.delete(oldTanpuraKey);
            this.audioBuffers.delete(oldAtmosphereKey);
            this.audioBuffers.delete(oldTanpuraKey);
            
            // Reload samples for new key (availability check will happen in UI)
            try {
                await this.loadMelodicSamples(true, ['atmosphere', 'tanpura']);
                console.log(`✅ Reloaded melodic samples for key ${newKey}`);
            } catch (error) {
                console.warn(`Failed to reload melodic samples:`, error);
            }
        }
        
        return newKey;
    }

    /**
     * Resolve the base URL for melodic samples (supports GitHub Pages + Vercel)
     * @private
     */
    _getMelodicBaseUrl() {
        if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) {
            return API_BASE_URL.replace(/\/$/, '');
        }
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
            return window.location.origin.replace(/\/$/, '');
        }
        return '';
    }

    /**
     * Normalize key so major/minor share the same pads (e.g., Cm -> C)
     * @private
     */
    _normalizeKeyName(key) {
        if (!key) return '';
        const trimmed = String(key).trim();
        const minorMatch = trimmed.match(/^([A-Ga-g])([#b]?)(m)$/);
        if (minorMatch) {
            return `${minorMatch[1].toUpperCase()}${minorMatch[2] || ''}`;
        }
        return trimmed;
    }

    /**
     * Calculate the final key for melodic samples based on song key + transpose
     * @private
     * @returns {string} - Key name for sample file (e.g., 'C', 'C#', 'D')
     */
    _getEffectiveKey() {
        if (!this.currentSongKey) {
            return 'C'; // Default key
        }

        const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const normalizedKey = this._normalizeKeyName(this.currentSongKey);
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
        const finalIndex = (baseIndex + this.currentTranspose + 12) % 12;
        return keys[finalIndex];
    }

    /**
     * Set playback rate (tempo) - Note: pitch changes slightly with tempo
     * Range: 0.9-1.1 (90-110%) - minimal pitch change for percussion
     * @param {number} rate - Playback speed multiplier
     */
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.9, Math.min(1.1, rate));
        // Rate will be applied to next loop cycle
    }

    /**
     * Check if melodic samples exist for current key (lightweight check)
     * @param {string[]} sampleTypes - Types to check ['atmosphere', 'tanpura']
     * @returns {Object} - Object with availability status for each type
     */
    async checkMelodicAvailability(sampleTypes = ['atmosphere', 'tanpura']) {
        const effectiveKey = this._getEffectiveKey();
        const availability = {};
        const baseUrl = this._getMelodicBaseUrl();
        
        console.log(`🔍 Checking melodic availability for key: ${effectiveKey}`);
        
        // Map to check enharmonic equivalents (e.g., Eb = D#)
        const enharmonicMap = {
            'C#': 'Db', 'Db': 'C#',
            'D#': 'Eb', 'Eb': 'D#',
            'F#': 'Gb', 'Gb': 'F#',
            'G#': 'Ab', 'Ab': 'G#',
            'A#': 'Bb', 'Bb': 'A#'
        };
        
        const checkPromises = sampleTypes.map(async (sampleType) => {
            // Try the effective key first, then its enharmonic equivalent
            const keysToTry = [effectiveKey];
            if (enharmonicMap[effectiveKey]) {
                keysToTry.push(enharmonicMap[effectiveKey]);
            }
            
            console.log(`  Checking ${sampleType}: trying keys [${keysToTry.join(', ')}]`);
            
            for (const keyToCheck of keysToTry) {
                // URL encode the key to handle # symbol (e.g., D# becomes D%23)
                const encodedKey = encodeURIComponent(keyToCheck);
                const url = `${baseUrl}/loops/melodies/${sampleType}/${sampleType}_${encodedKey}.wav`;
                console.log(`  🔗 Trying URL: ${url}`);
                try {
                    // Use HEAD for lightweight check
                    const response = await fetch(url, { method: 'HEAD' });
                    if (response.ok) {
                        availability[sampleType] = true;
                        console.log(`  ✅ ${sampleType}_${keyToCheck}.wav: Available (effective key: ${effectiveKey})`);
                        return; // Found it, stop trying other keys
                    } else {
                        console.log(`  ⚠️ ${sampleType}_${keyToCheck}.wav: ${response.status} ${response.statusText}`);
                    }
                } catch (error) {
                    console.log(`  ❌ ${sampleType}_${keyToCheck}.wav: Error - ${error.message}`);
                    // Continue to next key
                }
            }
            
            // If we get here, neither key worked
            availability[sampleType] = false;
            console.log(`  ❌ ${sampleType}: Not Available (tried all enharmonic equivalents)`);
        });
        
        await Promise.all(checkPromises);
        console.log(`📊 Melodic availability result:`, availability);
        return availability;
    }

    /**
     * Load melodic samples for current key
     * @param {boolean} force - Force reload even if already loaded
     * @param {string[]} sampleTypes - Specific sample types to load ['atmosphere', 'tanpura'], defaults to both
     */
    async loadMelodicSamples(force = false, sampleTypes = ['atmosphere', 'tanpura']) {
        const effectiveKey = this._getEffectiveKey();
        const atmosphereKey = `atmosphere_${effectiveKey}`;
        const tanpuraKey = `tanpura_${effectiveKey}`;
        const baseUrl = this._getMelodicBaseUrl();

        console.log(`Loading melodic samples for key: ${effectiveKey}, types: ${sampleTypes.join(', ')}`);

        // Map to check enharmonic equivalents (e.g., Eb = D#)
        const enharmonicMap = {
            'C#': 'Db', 'Db': 'C#',
            'D#': 'Eb', 'Eb': 'D#',
            'F#': 'Gb', 'Gb': 'F#',
            'G#': 'Ab', 'Ab': 'G#',
            'A#': 'Bb', 'Bb': 'A#'
        };

        // Build sample map for only requested types
        const sampleMap = {};
        const needsDecode = [];
        
        for (const sampleType of sampleTypes) {
            const key = `${sampleType}_${effectiveKey}`;
            
            // If raw audio already exists, avoid refetch and ensure it gets decoded later.
            if (!force && this.rawAudioData.has(key)) {
                if (!this.audioBuffers.has(key)) {
                    needsDecode.push(key);
                }
                continue;
            }
            
            // Try to find the file with effective key, then enharmonic equivalent
            const keysToTry = [effectiveKey];
            if (enharmonicMap[effectiveKey]) {
                keysToTry.push(enharmonicMap[effectiveKey]);
            }
            
            let foundUrl = null;
            for (const keyToCheck of keysToTry) {
                // URL encode the key to handle # symbol (e.g., D# becomes D%23)
                const encodedKey = encodeURIComponent(keyToCheck);
                const url = `${baseUrl}/loops/melodies/${sampleType}/${sampleType}_${encodedKey}.wav`;
                try {
                    // Quick HEAD check to see if file exists
                    const response = await fetch(url, { method: 'HEAD' });
                    if (response.ok) {
                        foundUrl = url;
                        console.log(`Found melodic sample: ${sampleType}_${keyToCheck}.wav (for effective key: ${effectiveKey})`);
                        break;
                    }
                } catch (error) {
                    // Continue to next key
                }
            }
            
            if (foundUrl) {
                sampleMap[key] = foundUrl;
            } else {
                console.warn(`Melodic sample ${key} not found (also tried enharmonic equivalent)`);
            }
        }

        // If nothing to load, return early
        if (Object.keys(sampleMap).length === 0) {
            // Important: cached raw samples may still need decoding (common when loaded before AudioContext init)
            if (this.audioContext) {
                const decodePromises = needsDecode.map(sampleName => this._decodeMelodicSample(sampleName));
                if (decodePromises.length > 0) {
                    await Promise.all(decodePromises);
                    console.log(`Decoded ${decodePromises.length} cached melodic samples for key: ${effectiveKey}`);
                }
            }

            console.log('Requested melodic samples already loaded or not available for this key');
            return;
        }

        // Fetch raw audio data for melodic samples
        const loadPromises = Object.entries(sampleMap).map(async ([name, url]) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                this.rawAudioData.set(name, arrayBuffer);
                console.log(`Fetched melodic sample: ${name}, size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
                return { success: true, name };
            } catch (error) {
                console.warn(`Failed to fetch melodic sample ${name}:`, error);
                // Determine sample type from name (atmosphere_C -> atmosphere)
                const sampleType = name.split('_')[0];
                if (this.onMelodicError) {
                    this.onMelodicError(sampleType, error);
                }
                return { success: false, name, error };
            }
        });

        const results = await Promise.all(loadPromises);
        
        // Log summary
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        if (successful.length > 0) {
            console.log(`✅ Successfully loaded ${successful.length} melodic samples`);
        }
        if (failed.length > 0) {
            console.log(`❌ Failed to load ${failed.length} melodic samples:`, failed.map(f => f.name));
        }
        
        // If audio context is initialized, decode immediately
        if (this.audioContext && this.rawAudioData.has(atmosphereKey)) {
            await this._decodeMelodicSample(atmosphereKey);
        }
        if (this.audioContext && this.rawAudioData.has(tanpuraKey)) {
            await this._decodeMelodicSample(tanpuraKey);
        }
    }

    /**
     * Decode a single melodic sample
     * @private
     */
    async _decodeMelodicSample(sampleName) {
        if (this.audioBuffers.has(sampleName)) {
            return; // Already decoded
        }

        const rawData = this.rawAudioData.get(sampleName);
        if (!rawData) return;

        try {
            const audioBuffer = await this.audioContext.decodeAudioData(rawData);
            this.audioBuffers.set(sampleName, audioBuffer);
            console.log(`Decoded melodic sample: ${sampleName}, duration: ${audioBuffer.duration.toFixed(2)}s`);
        } catch (error) {
            console.warn(`Failed to decode melodic sample ${sampleName}:`, error.message);
        }
    }

    /**
     * Stop all melodic pads
     * @private
     */
    _stopAllMelodicPads() {
        // Stop atmosphere pad if playing
        const atmospherePad = this.melodicPads.atmosphere;
        if (atmospherePad.isPlaying && atmospherePad.source) {
            try {
                atmospherePad.source.stop();
            } catch (e) {
                // Already stopped
            }
            atmospherePad.source = null;
            atmospherePad.isPlaying = false;
            
            if (this.onMelodicPadToggle) {
                this.onMelodicPadToggle('atmosphere', false);
            }
            console.log(`Stopped atmosphere pad`);
        }
        
        // Stop tanpura pad if playing
        const tanpuraPad = this.melodicPads.tanpura;
        if (tanpuraPad.isPlaying && tanpuraPad.source) {
            try {
                tanpuraPad.source.stop();
            } catch (e) {
                // Already stopped
            }
            tanpuraPad.source = null;
            tanpuraPad.isPlaying = false;
            
            if (this.onMelodicPadToggle) {
                this.onMelodicPadToggle('tanpura', false);
            }
            console.log(`Stopped tanpura pad`);
        }
    }

    /**
     * Stop all melodic pads (public method)
     */
    stopAllMelodicPads() {
        this._stopAllMelodicPads();
    }

    /**
     * Toggle atmosphere pad
     */
    async toggleAtmosphere() {
        await this._toggleMelodicPad('atmosphere');
    }

    /**
     * Toggle tanpura pad
     */
    async toggleTanpura() {
        await this._toggleMelodicPad('tanpura');
    }

    /**
     * Toggle a melodic pad on/off
     * @private
     * @param {string} padType - 'atmosphere' or 'tanpura'
     */
    async _toggleMelodicPad(padType) {
        if (!['atmosphere', 'tanpura'].includes(padType)) {
            return;
        }

        const pad = this.melodicPads[padType];
        
        if (pad.isPlaying) {
            // Stop the pad
            this._stopMelodicPad(padType);
        } else {
            // Start the pad
            await this._startMelodicPad(padType);
        }

        if (this.onMelodicPadToggle) {
            this.onMelodicPadToggle(padType, pad.isPlaying);
        }
    }

    /**
     * Start a melodic pad
     * @private
     * @param {string} padType - 'atmosphere' or 'tanpura'
     */
    async _startMelodicPad(padType) {
        // Initialize Web Audio API silently if needed
        await this._initializeSilent();
        
        // Restore volume levels immediately after silent initialization
        // This ensures rhythm loop gain is not left at 0 when melodic pads are toggled first
        this._restoreVolumeFromSilent();
        
        // Load and decode only the specific melodic sample needed
        await this.loadMelodicSamples(false, [padType]);
        
        const effectiveKey = this._getEffectiveKey();
        const sampleName = `${padType}_${effectiveKey}`;
        let buffer = this.audioBuffers.get(sampleName);

        // Retry path 1: raw exists but decode may have been skipped/failed earlier.
        if (!buffer && this.rawAudioData.has(sampleName)) {
            await this._decodeMelodicSample(sampleName);
            buffer = this.audioBuffers.get(sampleName);
        }

        // Retry path 2: force refetch + decode once before failing.
        if (!buffer) {
            await this.loadMelodicSamples(true, [padType]);
            buffer = this.audioBuffers.get(sampleName);
        }
        
        if (!buffer) {
            console.warn(`Melodic sample ${sampleName} not found`);
            if (this.onMelodicError) {
                this.onMelodicError(padType, new Error(`Melodic sample ${sampleName} not available`));
            }
            return;
        }

        const pad = this.melodicPads[padType];
        
        // Ensure proper volume is set now that we're ready to play
        if (pad.gainNode) {
            pad.gainNode.gain.value = padType === 'atmosphere' ? this.atmosphereVolume : this.tanpuraVolume;
        }
        
        // Stop any existing source
        if (pad.source) {
            try {
                pad.source.stop();
            } catch (e) {
                // Already stopped
            }
        }

        // Create new looping source
        pad.source = this.audioContext.createBufferSource();
        pad.source.buffer = buffer;
        pad.source.loop = true; // Enable looping
        pad.source.connect(pad.gainNode);
        
        // Start playback
        pad.source.start();
        pad.isPlaying = true;
        
        console.log(`Started ${padType} pad (key: ${effectiveKey})`);
    }

    /**
     * Stop a melodic pad
     * @private
     * @param {string} padType - 'atmosphere' or 'tanpura'
     */
    _stopMelodicPad(padType) {
        const pad = this.melodicPads[padType];
        
        if (pad.source) {
            try {
                pad.source.stop();
            } catch (e) {
                // Already stopped
            }
            pad.source = null;
        }
        
        pad.isPlaying = false;
        console.log(`Stopped ${padType} pad`);
    }

    /**
     * Internal: Play a specific loop or fill
     * @param {string} name - Loop/fill name
     * @param {boolean} continueSequence - Whether to continue the sequence after playing
     * @private
     */
    _playLoop(name, continueSequence = true) {
        const buffer = this.audioBuffers.get(name);
        if (!buffer) {
            console.warn(`Loop ${name} not found`);
            return;
        }

        console.log(`Starting playback of ${name}`);
        
        // Stop current source if any
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Already stopped
            }
        }
        
        // Clear existing timeout
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
            this.loopTimeout = null;
        }

        // Create new source
        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = buffer;
        this.currentSource.playbackRate.value = this.playbackRate;
        this.currentSource.connect(this.gainNode);
        
        // Start playback
        this.currentSource.start();
        console.log(`Playing ${name}, duration: ${buffer.duration}s, playbackRate: ${this.playbackRate}`);

        // Calculate duration accounting for playback rate
        const duration = buffer.duration / this.playbackRate;

        // Set up loop end handling
        if (continueSequence) {
            this.loopTimeout = setTimeout(() => {
                if (!this.isPlaying) return;

                // Priority: Fill -> Next Loop -> Continue Current Loop
                if (this.nextFill) {
                    // Play queued fill
                    const fill = this.nextFill;
                    this.nextFill = null;
                    
                    if (this.onPadActive && fill) this.onPadActive(fill);
                    if (this.onLoopChange) this.onLoopChange(fill);
                    
                    // Play fill (not continuing sequence)
                    this._playLoop(fill, false);
                    
                    // Schedule next loop after fill
                    const fillBuffer = this.audioBuffers.get(fill);
                    const fillDuration = fillBuffer.duration / this.playbackRate;
                    
                    this.loopTimeout = setTimeout(() => {
                        if (this.isPlaying) {
                            const targetLoop = this.nextLoop || this.currentLoop;
                            this.currentLoop = targetLoop;
                            this.nextLoop = null;
                            
                            if (this.onPadActive && targetLoop) this.onPadActive(targetLoop);
                            if (this.onLoopChange) this.onLoopChange(targetLoop);
                            
                            this._playLoop(targetLoop, true);
                        }
                    }, fillDuration * 1000);
                    
                } else if (this.nextLoop) {
                    // Switch to queued loop
                    this.currentLoop = this.nextLoop;
                    this.nextLoop = null;
                    
                    if (this.onPadActive && this.currentLoop) this.onPadActive(this.currentLoop);
                    if (this.onLoopChange) this.onLoopChange(this.currentLoop);
                    
                    this._playLoop(this.currentLoop, true);
                    
                } else {
                    // Continue current loop
                    if (this.onLoopChange) this.onLoopChange(this.currentLoop);
                    this._playLoop(this.currentLoop, true);
                }
            }, duration * 1000);
        }
    }

    /**
     * Get current playback state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            currentLoop: this.currentLoop,
            nextLoop: this.nextLoop,
            nextFill: this.nextFill,
            autoFill: this.autoFill,
            volume: this.volumeLevel,
            atmosphereVolume: this.atmosphereVolume,
            tanpuraVolume: this.tanpuraVolume,
            playbackRate: this.playbackRate,
            loopsLoaded: this.audioBuffers.size,
            loopsFetched: this.rawAudioData.size,
            currentSongKey: this.currentSongKey,
            currentTranspose: this.currentTranspose,
            effectiveKey: this._getEffectiveKey(),
            melodicPads: {
                atmosphere: {
                    isPlaying: this.melodicPads.atmosphere.isPlaying
                },
                tanpura: {
                    isPlaying: this.melodicPads.tanpura.isPlaying
                }
            }
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.pause();
        
        // Clean up rhythm loop resources
        if (this.currentSource) {
            this.currentSource.disconnect();
            this.currentSource = null;
        }
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        
        // Clean up melodic pad resources
        this._stopMelodicPad('atmosphere');
        this._stopMelodicPad('tanpura');
        
        if (this.melodicPads.atmosphere.gainNode) {
            this.melodicPads.atmosphere.gainNode.disconnect();
            this.melodicPads.atmosphere.gainNode = null;
        }
        if (this.melodicPads.tanpura.gainNode) {
            this.melodicPads.tanpura.gainNode.disconnect();
            this.melodicPads.tanpura.gainNode = null;
        }
        
        this.audioBuffers.clear();
    }
}
