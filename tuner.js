(function initializeTuner() {
    'use strict';

    const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let reference = 440;
    let targetNote = 'A';
    let toneNote = 'A';
    let octave = 4;
    let audioContext = null;
    let analyser = null;
    let microphoneStream = null;
    let animationFrame = null;
    let oscillator = null;
    let toneGain = null;
    let tonePlaying = false;
    let smoothedFrequency = null;

    function noteFrequency(note, targetOctave) {
        const midi = (targetOctave + 1) * 12 + NOTES.indexOf(note);
        return reference * Math.pow(2, (midi - 69) / 12);
    }

    function nearestNote(frequency) {
        const midi = 69 + 12 * Math.log2(frequency / reference);
        const rounded = Math.round(midi);
        return { note: NOTES[((rounded % 12) + 12) % 12], cents: Math.round((midi - rounded) * 100) };
    }

    function detectPitch(buffer, sampleRate) {
        let rms = 0;
        for (const sample of buffer) rms += sample * sample;
        if (Math.sqrt(rms / buffer.length) < 0.01) return -1;
        const correlations = new Float32Array(buffer.length);
        for (let lag = 0; lag < buffer.length; lag++) {
            for (let index = 0; index < buffer.length - lag; index++) correlations[lag] += buffer[index] * buffer[index + lag];
        }
        let start = 0;
        while (start < correlations.length - 1 && correlations[start] > correlations[start + 1]) start++;
        let bestLag = -1;
        let bestValue = -Infinity;
        for (let lag = start; lag < correlations.length; lag++) {
            if (correlations[lag] > bestValue) { bestValue = correlations[lag]; bestLag = lag; }
        }
        return bestLag > 0 ? sampleRate / bestLag : -1;
    }

    function updateTuner(note, cents, signal) {
        document.getElementById('tunerNote').textContent = signal ? note : '--';
        document.getElementById('tunerCents').textContent = signal ? `${cents > 0 ? '+' : ''}${cents} cents` : '-- cents';
        const needle = document.getElementById('tunerNeedle');
        needle.style.left = `${signal ? 50 + Math.max(-50, Math.min(50, cents)) : 50}%`;
        const pill = document.getElementById('tunerInTunePill');
        if (!signal) {
            pill.textContent = 'Play a note on your instrument';
            pill.className = 'tuner-pill';
        } else {
            const inTune = Math.abs(cents) <= 5;
            pill.textContent = inTune ? 'In tune!' : (cents > 0 ? 'Sharp' : 'Flat');
            pill.className = `tuner-pill ${inTune ? 'in-tune' : 'out-of-tune'}`;
        }
    }

    async function startMicrophone() {
        if (microphoneStream) return;
        const pill = document.getElementById('tunerInTunePill');
        if (!navigator.mediaDevices?.getUserMedia) {
            pill.textContent = 'Microphone tuning is not supported in this browser.';
            return;
        }
        try {
            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            audioContext.createMediaStreamSource(microphoneStream).connect(analyser);
            document.getElementById('tunerListeningStatus').innerHTML = '<i class="fas fa-circle" aria-hidden="true"></i> Listening...';
            const buffer = new Float32Array(analyser.fftSize);
            const update = () => {
                analyser.getFloatTimeDomainData(buffer);
                const frequency = detectPitch(buffer, audioContext.sampleRate);
                if (frequency > 30 && frequency < 1200) {
                    smoothedFrequency = smoothedFrequency === null ? frequency : smoothedFrequency + (frequency - smoothedFrequency) * 0.25;
                    const detected = nearestNote(smoothedFrequency);
                    targetNote = detected.note;
                    updateTuner(detected.note, detected.cents, true);
                }
                animationFrame = requestAnimationFrame(update);
            };
            update();
        } catch (error) {
            pill.textContent = 'Microphone access denied. Use the Tone Generator instead.';
        }
    }

    function stopMicrophone() {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = null;
        microphoneStream?.getTracks().forEach((track) => track.stop());
        microphoneStream = null;
        analyser = null;
        smoothedFrequency = null;
        document.getElementById('tunerListeningStatus').innerHTML = '<i class="fas fa-circle" aria-hidden="true"></i> Idle';
        document.getElementById('tunerInTunePill').textContent = 'Tap Start Listening to begin';
        updateTuner(targetNote, 0, false);
    }

    function stopTone() {
        if (oscillator) { try { oscillator.stop(); } catch {} oscillator.disconnect(); }
        toneGain?.disconnect();
        oscillator = null;
        toneGain = null;
        tonePlaying = false;
        document.getElementById('tonePlayBtn').innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>Play Tone';
    }

    async function toggleTone() {
        if (tonePlaying) { stopTone(); return; }
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        oscillator = audioContext.createOscillator();
        toneGain = audioContext.createGain();
        oscillator.frequency.value = noteFrequency(toneNote, octave);
        toneGain.gain.value = 0.2;
        oscillator.connect(toneGain);
        toneGain.connect(audioContext.destination);
        oscillator.start();
        tonePlaying = true;
        document.getElementById('tonePlayBtn').innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i>Stop Tone';
    }

    function updateTone() {
        const frequency = noteFrequency(toneNote, octave);
        document.getElementById('toneNoteDisplay').textContent = `${toneNote}${octave}`;
        document.getElementById('toneFreqDisplay').textContent = `${frequency.toFixed(1)} Hz`;
        document.getElementById('toneFrequencyReadout').value = `${frequency.toFixed(1)} Hz`;
        document.getElementById('toneOctaveSelect').value = String(octave);
        document.querySelectorAll('#toneNoteButtons .tuner-note-btn').forEach((button) => button.classList.toggle('active', button.dataset.note === toneNote));
        if (tonePlaying && oscillator) oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    }

    function renderNotes(containerId, selected, handler) {
        const container = document.getElementById(containerId);
        container.innerHTML = NOTES.map((note) => `<button class="tuner-note-btn${note === selected ? ' active' : ''}" type="button" data-note="${note}">${note}</button>`).join('');
        container.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => handler(button.dataset.note)));
    }

    function setMode(mode) {
        const microphone = mode === 'microphone';
        document.getElementById('tunerModeMic').classList.toggle('active', microphone);
        document.getElementById('tunerModeTone').classList.toggle('active', !microphone);
        document.getElementById('tunerMicPanel').hidden = !microphone;
        document.getElementById('tunerTonePanel').hidden = microphone;
        if (microphone) stopTone(); else stopMicrophone();
    }

    function cleanup() {
        stopMicrophone();
        stopTone();
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderNotes('tunerTargetNotes', targetNote, (note) => { targetNote = note; updateTuner(note, 0, false); });
        renderNotes('toneNoteButtons', toneNote, (note) => { toneNote = note; updateTone(); });
        updateTone();
        document.getElementById('tunerModeMic').addEventListener('click', () => setMode('microphone'));
        document.getElementById('tunerModeTone').addEventListener('click', () => setMode('tone'));
        document.getElementById('tunerStartMic').addEventListener('click', startMicrophone);
        document.getElementById('tunerStopMic').addEventListener('click', stopMicrophone);
        document.getElementById('tonePlayBtn').addEventListener('click', toggleTone);
        document.getElementById('toneOctaveDown').addEventListener('click', () => { octave = Math.max(2, octave - 1); updateTone(); });
        document.getElementById('toneOctaveUp').addEventListener('click', () => { octave = Math.min(6, octave + 1); updateTone(); });
        document.getElementById('toneOctaveSelect').addEventListener('change', (event) => { octave = Number(event.target.value); updateTone(); });
        document.getElementById('tunerA4Reference').addEventListener('change', (event) => { reference = Number(event.target.value); updateTone(); });
        document.querySelectorAll('.tuner-preset-btn').forEach((button) => button.addEventListener('click', () => {
            reference = Number(button.dataset.freq);
            document.getElementById('tunerA4Reference').value = String(reference);
            document.querySelectorAll('.tuner-preset-btn').forEach((item) => item.classList.toggle('active', item === button));
            updateTone();
        }));
    });

    window.addEventListener('pagehide', cleanup);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cleanup(); });
})();