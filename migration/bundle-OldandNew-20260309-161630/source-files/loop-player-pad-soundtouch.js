/**
 * Loop Player - Rhythm Pad Controller (Soundtouch.js version)
 * 
 * Features:
 * - TRUE pitch-preserving time-stretching using WSOLA algorithm
 * - Loads loops from /loops/ folder (LOOP01-03 and FILL1-3)
 * - Pad-based switching (6 pads: 3 loops + 3 fills)
 * - Switches only after current loop completes (maintains rhythm)
 * - Auto-fill mode: plays fill before switching to target loop
 * - Tempo range: 50-200% (0.5x-2x) with consistent pitch
 * - Volume control
 */

class LoopPlayerPad {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = new Map(); // Map of loop names to AudioBuffer
        this.soundtouchNodes = new Map(); // Map of loop names to Soundtouch nodes
        this.currentSource = null;
        this.gainNode = null;
        
        // Playback state
        this.isPlaying = false;
        this.currentLoop = 'loop1';
        this.nextLoop = null;
        this.nextFill = null;
        this.loopTimeout = null;
        
        // Settings
        this.autoFill = false;
        this.volumeLevel = 0.8;
        this.playbackRate = 1.0; // 0.5-2.0 (50-200%)
        
        // Timing
        this.loopDuration = 0;
        
        // Callbacks
        this.onLoopChange = null;
        this.onPadActive = null;
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
            console.log('Web Audio API initialized');
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Load loop samples from the /loops/ folder
     * @param {Object} loopMap - Map of loop names to URLs
     */
    async loadLoops(loopMap = null) {
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

        const loadPromises = Object.entries(loopMap).map(async ([name, url]) => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
                
                const arrayBuffer = await response.arrayBuffer();
                this.audioBuffers.set(name, arrayBuffer);
                
                console.log(`Loaded ${name} from ${url}`);
            } catch (error) {
                console.error(`Error loading ${name}:`, error);
                if (this.onError) this.onError(error);
            }
        });

        await Promise.all(loadPromises);
        console.log(`All loops loaded successfully (${this.audioBuffers.size} files)`);
    }

    /**
     * Decode audio buffer and create Soundtouch processor
     */
    async _prepareSoundtouchNode(name) {
        if (this.soundtouchNodes.has(name)) {
            return this.soundtouchNodes.get(name);
        }

        const arrayBuffer = this.audioBuffers.get(name);
        if (!arrayBuffer) {
            throw new Error(`Audio buffer for ${name} not found`);
        }

        // Decode audio
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
        
        // Create Soundtouch processor
        const soundtouch = new SoundTouch();
        soundtouch.tempo = this.playbackRate;
        soundtouch.pitch = 1.0; // Keep original pitch
        
        const node = {
            audioBuffer,
            soundtouch,
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration
        };
        
        this.soundtouchNodes.set(name, node);
        return node;
    }

    /**
     * Process audio through Soundtouch and play
     */
    async _playWithSoundtouch(name, continueSequence = true) {
        // Prepare soundtouch node
        const node = await this._prepareSoundtouchNode(name);
        
        // Update tempo
        node.soundtouch.tempo = this.playbackRate;
        
        // Extract samples from audio buffer
        const samples = this._extractSamples(node.audioBuffer);
        
        // Create PitchShifter for processing
        const shifter = new PitchShifter(this.audioContext, node.audioBuffer, 16384);
        shifter.tempo = this.playbackRate;
        shifter.pitch = 1.0;
        
        // Connect and play
        shifter.connect(this.gainNode);
        
        const calculatedDuration = node.duration / this.playbackRate;
        console.log(`Playing ${name} with tempo ${this.playbackRate}x, duration: ${calculatedDuration.toFixed(2)}s`);
        
        this.loopDuration = calculatedDuration;
        
        // Store reference to stop later
        this.currentSource = shifter;
        
        // Set up loop end handling
        if (continueSequence) {
            this.loopTimeout = setTimeout(() => {
                if (!this.isPlaying) return;

                // Priority: Fill -> Next Loop -> Continue Current Loop
                if (this.nextFill) {
                    const fill = this.nextFill;
                    this.nextFill = null;
                    
                    if (this.onPadActive) this.onPadActive(fill);
                    if (this.onLoopChange) this.onLoopChange(fill);
                    
                    this._playWithSoundtouch(fill, false).then(() => {
                        const targetLoop = this.nextLoop || this.currentLoop;
                        this.currentLoop = targetLoop;
                        this.nextLoop = null;
                        
                        if (this.onPadActive) this.onPadActive(targetLoop);
                        if (this.onLoopChange) this.onLoopChange(targetLoop);
                        
                        this._playWithSoundtouch(targetLoop, true);
                    });
                } else if (this.nextLoop) {
                    this.currentLoop = this.nextLoop;
                    this.nextLoop = null;
                    
                    if (this.onPadActive) this.onPadActive(this.currentLoop);
                    if (this.onLoopChange) this.onLoopChange(this.currentLoop);
                    
                    this._playWithSoundtouch(this.currentLoop, true);
                } else {
                    if (this.onLoopChange) this.onLoopChange(this.currentLoop);
                    this._playWithSoundtouch(this.currentLoop, true);
                }
            }, calculatedDuration * 1000);
        }
    }

    /**
     * Extract samples from AudioBuffer
     */
    _extractSamples(audioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const samples = new Float32Array(length * numberOfChannels);
        
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                samples[i * numberOfChannels + channel] = channelData[i];
            }
        }
        
        return samples;
    }

    /**
     * Start playing
     */
    async play() {
        if (this.isPlaying) return;
        
        await this.initialize();
        
        if (this.audioBuffers.size === 0) {
            if (this.onError) this.onError(new Error('No loops loaded'));
            return;
        }
        
        this.isPlaying = true;
        await this._playWithSoundtouch(this.currentLoop, true);
    }

    /**
     * Pause playback
     */
    pause() {
        if (!this.isPlaying) return;
        
        this.isPlaying = false;
        
        if (this.currentSource && this.currentSource.disconnect) {
            this.currentSource.disconnect();
            this.currentSource = null;
        }
        
        if (this.loopTimeout) {
            clearTimeout(this.loopTimeout);
            this.loopTimeout = null;
        }
    }

    /**
     * Switch to different loop
     */
    switchToLoop(loopName) {
        if (!['loop1', 'loop2', 'loop3'].includes(loopName)) return;

        if (this.autoFill && loopName !== this.currentLoop) {
            const currentLoopNum = this.currentLoop.replace('loop', '');
            this.nextFill = `fill${currentLoopNum}`;
        }

        this.nextLoop = loopName;
    }

    /**
     * Play fill
     */
    playFill(fillName) {
        if (!['fill1', 'fill2', 'fill3'].includes(fillName)) return;
        this.nextFill = fillName;
    }

    /**
     * Toggle auto-fill
     */
    setAutoFill(enabled) {
        this.autoFill = enabled;
    }

    /**
     * Set volume
     */
    setVolume(vol) {
        this.volumeLevel = Math.max(0, Math.min(1, vol));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volumeLevel;
        }
    }

    /**
     * Set playback rate (tempo) with pitch preservation
     */
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        console.log(`Tempo changed to ${(this.playbackRate * 100).toFixed(0)}% (pitch preserved)`);
    }

    /**
     * Get state
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
            loopsLoaded: this.audioBuffers.size
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        this.pause();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}
