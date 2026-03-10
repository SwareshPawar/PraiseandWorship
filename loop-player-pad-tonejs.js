/**
 * Loop Player - Rhythm Pad Controller (Tone.js version)
 * 
 * Features:
 * - Pitch-preserving time-stretching using Tone.js
 * - Loads loops from /loops/ folder (LOOP01-03 and FILL1-3)
 * - Pad-based switching (6 pads: 3 loops + 3 fills)
 * - Switches only after current loop completes (maintains rhythm)
 * - Auto-fill mode: plays fill before switching to target loop
 * - Tempo range: 50-200% (0.5x-2x) with optimal quality at 75-150%
 * - Volume control
 */

class LoopPlayerPad {
    constructor() {
        this.players = null; // Tone.Players object
        this.volume = null; // Tone.Volume node
        
        // Playback state
        this.isPlaying = false;
        this.currentLoop = 'loop1'; // Currently playing loop
        this.nextLoop = null; // Queued loop to play after current finishes
        this.nextFill = null; // Queued fill (if auto-fill is on)
        this.loopTimeout = null; // Timeout for loop scheduling
        
        // Settings
        this.autoFill = false; // Auto-fill toggle
        this.volumeLevel = 0.8; // 0-1
        this.playbackRate = 1.0; // 0.5-2.0 (50-200%)
        
        // Timing
        this.loopDuration = 0;
        
        // Callbacks
        this.onLoopChange = null; // (loopName) => void
        this.onPadActive = null; // (padName) => void
        this.onError = null; // (error) => void
    }

    /**
     * Initialize Tone.js
     * Only called after user interaction (play button click)
     */
    async initialize() {
        if (!this.players) {
            // Start Tone.js audio context
            await Tone.start();
            console.log('Tone.js audio context started');
        }
    }

    /**
     * Load loop samples from the /loops/ folder
     * @param {Object} loopMap - Optional map of loop names to URLs
     * Uses new naming convention v2.0: {taal}_{time}_{tempo}_{genre}_{TYPE}{num}.wav
     * Falls back to keherwa_4_4 files if no map provided (backward compatibility)
     */
    async loadLoops(loopMap = null) {
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

        return new Promise((resolve, reject) => {
            // Create volume node
            this.volume = new Tone.Volume(-10).toDestination(); // -10dB default
            
            // Create Players with all loops
            this.players = new Tone.Players({
                urls: loopMap,
                onload: () => {
                    console.log('All loops loaded successfully');
                    
                    // Set initial loop duration
                    const loop1Player = this.players.player('loop1');
                    if (loop1Player && loop1Player.buffer) {
                        this.loopDuration = loop1Player.buffer.duration;
                    }
                    
                    resolve();
                },
                onerror: (error) => {
                    console.error('Error loading loops:', error);
                    if (this.onError) this.onError(error);
                    reject(error);
                }
            }).connect(this.volume);

            // Set playback rate for all players
            Object.keys(loopMap).forEach(key => {
                const player = this.players.player(key);
                if (player) {
                    player.playbackRate = this.playbackRate;
                }
            });
        });
    }

    /**
     * Start playing the current loop
     */
    async play() {
        if (this.isPlaying) return;
        
        // Initialize Tone.js NOW (after user gesture)
        await this.initialize();
        
        // Check if loops are loaded
        if (!this.players) {
            if (this.onError) this.onError(new Error('No loops loaded'));
            return;
        }
        
        this.isPlaying = true;
        this._playLoop(this.currentLoop, true);
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        
        // Stop all players
        if (this.players) {
            this.players.stopAll();
        }
        
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
        if (this.volume) {
            // Convert 0-1 to dB (logarithmic scale)
            // 0 = -60dB (silent), 1 = 0dB (full volume)
            const db = this.volumeLevel === 0 ? -60 : 20 * Math.log10(this.volumeLevel);
            this.volume.volume.value = db;
        }
    }

    /**
     * Set playback rate (tempo) with pitch preservation
     * Range: 0.5-2.0 (50-200%)
     * Optimal quality: 0.75-1.5 (75-150%)
     * @param {number} rate - Playback speed multiplier
     */
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        
        // Update all players' playback rate
        if (this.players) {
            ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'].forEach(key => {
                const player = this.players.player(key);
                if (player) {
                    player.playbackRate = this.playbackRate;
                }
            });
        }
    }

    /**
     * Internal: Play a specific loop or fill
     * @param {string} name - Loop/fill name
     * @param {boolean} continueSequence - Whether to continue the sequence after playing
     * @private
     */
    _playLoop(name, continueSequence = true) {
        if (!this.players || !this.players.has(name)) {
            console.warn(`Loop ${name} not found`);
            return;
        }

        const player = this.players.player(name);
        if (!player || !player.buffer) {
            console.warn(`Player for ${name} not ready`);
            return;
        }

        // Stop all other players
        this.players.stopAll();
        
        // Clear existing timeout
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
            this.loopTimeout = null;
        }

        // Start the player
        player.start();

        // Calculate duration accounting for playback rate
        const duration = player.buffer.duration / this.playbackRate;

        // Set up loop end handling
        if (continueSequence) {
            this.loopTimeout = setTimeout(() => {
                if (!this.isPlaying) return;

                // Priority: Fill -> Next Loop -> Continue Current Loop
                if (this.nextFill) {
                    // Play queued fill
                    const fill = this.nextFill;
                    this.nextFill = null;
                    
                    if (this.onPadActive) this.onPadActive(fill);
                    if (this.onLoopChange) this.onLoopChange(fill);
                    
                    // Play fill (not continuing sequence)
                    this._playLoop(fill, false);
                    
                    // Schedule next loop after fill
                    const fillPlayer = this.players.player(fill);
                    const fillDuration = fillPlayer.buffer.duration / this.playbackRate;
                    
                    this.loopTimeout = setTimeout(() => {
                        if (this.isPlaying) {
                            const targetLoop = this.nextLoop || this.currentLoop;
                            this.currentLoop = targetLoop;
                            this.nextLoop = null;
                            
                            if (this.onPadActive) this.onPadActive(targetLoop);
                            if (this.onLoopChange) this.onLoopChange(targetLoop);
                            
                            this._playLoop(targetLoop, true);
                        }
                    }, fillDuration * 1000);
                    
                } else if (this.nextLoop) {
                    // Switch to queued loop
                    this.currentLoop = this.nextLoop;
                    this.nextLoop = null;
                    
                    if (this.onPadActive) this.onPadActive(this.currentLoop);
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
            playbackRate: this.playbackRate,
            loopsLoaded: this.players ? this.players.size : 0
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.pause();
        if (this.players) {
            this.players.dispose();
            this.players = null;
        }
        if (this.volume) {
            this.volume.dispose();
            this.volume = null;
        }
    }
}
