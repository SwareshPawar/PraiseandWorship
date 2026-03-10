/**
 * Loop Player - Audio playback engine with tempo control
 * 
 * Plays audio loops in a customizable pattern with support for:
 * - Main loop and variations
 * - Fill-ins between patterns
 * - Tempo/speed adjustment (-50% to +100%)
 * - Volume control
 * - Seamless looping
 */

class LoopPlayer {
  constructor() {
    this.audioContext = null;
    this.audioBuffers = new Map(); // Map<loopType, AudioBuffer>
    this.currentSource = null;
    this.gainNode = null;
    this.pattern = [];
    this.currentPatternIndex = 0;
    this.isPlaying = false;
    this.volume = 0.8; // Default volume (0-1)
    this.playbackRate = 1.0; // Default tempo (0.5 to 2.0)
    this.onLoopChange = null; // Callback when loop changes
    this.onError = null; // Callback for errors
  }

  /**
   * Initialize the audio context
   */
  async initialize() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;
    }
    
    // Resume audio context if it's suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Load audio files for the loops
   * @param {Object} loops - Object with loopType as keys and file URLs as values
   */
  async loadLoops(loops) {
    await this.initialize();
    
    const loadPromises = [];
    
    for (const [loopType, url] of Object.entries(loops)) {
      if (!url) continue;
      
      const promise = fetch(url)
        .then(response => {
          if (!response.ok) throw new Error(`Failed to load ${loopType}: ${response.statusText}`);
          return response.arrayBuffer();
        })
        .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
        .then(audioBuffer => {
          this.audioBuffers.set(loopType, audioBuffer);
          console.log(`Loaded loop: ${loopType} (${audioBuffer.duration.toFixed(2)}s)`);
        })
        .catch(err => {
          console.error(`Error loading ${loopType}:`, err);
          if (this.onError) this.onError(`Failed to load ${loopType}`);
        });
      
      loadPromises.push(promise);
    }
    
    await Promise.all(loadPromises);
    console.log(`Loaded ${this.audioBuffers.size} loops`);
  }

  /**
   * Set the playback pattern
   * @param {Array<string>} pattern - Array of loop types to play in sequence
   */
  setPattern(pattern) {
    if (!Array.isArray(pattern) || pattern.length === 0) {
      console.warn('Invalid pattern provided');
      return;
    }
    this.pattern = pattern;
    this.currentPatternIndex = 0;
  }

  /**
   * Play a specific loop
   * @param {string} loopType - The type of loop to play
   * @param {boolean} continuePattern - Whether to continue to next loop after finish
   */
  async playLoop(loopType, continuePattern = true) {
    await this.initialize();
    
    const buffer = this.audioBuffers.get(loopType);
    if (!buffer) {
      console.warn(`Loop not loaded: ${loopType}`);
      if (this.onError) this.onError(`Loop not loaded: ${loopType}`);
      
      // Skip to next if pattern continues
      if (continuePattern && this.isPlaying) {
        this.playNextInPattern();
      }
      return;
    }

    // Stop current playback
    this.stopCurrentSource();

    // Create new source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = buffer;
    this.currentSource.playbackRate.value = this.playbackRate;
    this.currentSource.connect(this.gainNode);

    // Set up the onended callback
    this.currentSource.onended = () => {
      if (continuePattern && this.isPlaying) {
        this.playNextInPattern();
      }
    };

    // Start playback
    this.currentSource.start(0);
    
    // Notify callback
    if (this.onLoopChange) {
      this.onLoopChange(loopType);
    }
    
    console.log(`Playing: ${loopType} at ${this.playbackRate}x speed`);
  }

  /**
   * Play the next loop in the pattern
   */
  playNextInPattern() {
    if (!this.pattern || this.pattern.length === 0) {
      console.warn('No pattern set');
      return;
    }

    this.currentPatternIndex = (this.currentPatternIndex + 1) % this.pattern.length;
    const nextLoop = this.pattern[this.currentPatternIndex];
    this.playLoop(nextLoop, true);
  }

  /**
   * Start playing the pattern from the beginning
   */
  async play() {
    if (this.isPlaying) return;
    
    await this.initialize();
    
    if (this.audioBuffers.size === 0) {
      if (this.onError) this.onError('No loops loaded');
      return;
    }

    if (!this.pattern || this.pattern.length === 0) {
      if (this.onError) this.onError('No pattern set');
      return;
    }

    this.isPlaying = true;
    this.currentPatternIndex = 0;
    const firstLoop = this.pattern[0];
    await this.playLoop(firstLoop, true);
  }

  /**
   * Pause playback
   */
  pause() {
    this.isPlaying = false;
    this.stopCurrentSource();
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  /**
   * Stop current audio source
   */
  stopCurrentSource() {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null; // Remove callback
        this.currentSource.stop();
      } catch (e) {
        // Source may have already stopped
      }
      this.currentSource = null;
    }
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  /**
   * Set playback rate / tempo
   * @param {number} rate - Playback rate (0.5 = 50% speed, 2.0 = 200% speed)
   */
  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (this.currentSource) {
      this.currentSource.playbackRate.value = this.playbackRate;
    }
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      volume: this.volume,
      playbackRate: this.playbackRate,
      currentLoop: this.pattern[this.currentPatternIndex],
      pattern: this.pattern,
      loadedLoops: Array.from(this.audioBuffers.keys())
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.pause();
    this.audioBuffers.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LoopPlayer;
}
