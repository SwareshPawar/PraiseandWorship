(function initializeMetronome() {
    'use strict';

    const MIN_BPM = 40;
    const MAX_BPM = 220;
    const DEFAULT_BPM = 96;
    let bpm = DEFAULT_BPM;
    let accentEnabled = true;
    let audioContext = null;
    let schedulerTimer = null;
    let nextNoteTime = 0;
    let beatIndex = 0;
    let tapTimes = [];

    function setBpm(value) {
        bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
        document.getElementById('metronomeBpm').textContent = String(bpm);
        document.getElementById('metronomeSlider').value = String(bpm);
        document.querySelectorAll('.metronome-quick-btn').forEach((button) => {
            button.classList.toggle('active', Number(button.dataset.bpm) === bpm);
        });
    }

    function scheduleClick(time, accent, beatStart) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = accent ? 1500 : (beatStart ? 1000 : 700);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(accent ? 0.5 : 0.25, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.06);
    }

    function schedule() {
        const beats = Number(document.getElementById('metronomeTimeSignature').value) || 4;
        const subdivision = Number(document.getElementById('metronomeSubdivision').value) || 1;
        const ticks = beats * subdivision;
        while (nextNoteTime < audioContext.currentTime + 0.1) {
            scheduleClick(nextNoteTime, accentEnabled && beatIndex === 0, beatIndex % subdivision === 0);
            nextNoteTime += 60 / bpm / subdivision;
            beatIndex = (beatIndex + 1) % ticks;
        }
    }

    function stop() {
        if (schedulerTimer) clearInterval(schedulerTimer);
        schedulerTimer = null;
        const button = document.getElementById('metronomeStartBtn');
        button.classList.remove('active');
        button.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i><span>Start</span>';
    }

    async function toggle() {
        if (schedulerTimer) {
            stop();
            return;
        }
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        beatIndex = 0;
        nextNoteTime = audioContext.currentTime + 0.05;
        schedulerTimer = window.setInterval(schedule, 25);
        const button = document.getElementById('metronomeStartBtn');
        button.classList.add('active');
        button.innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i><span>Stop</span>';
    }

    function handleTap() {
        const now = performance.now();
        if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2000) tapTimes = [];
        tapTimes.push(now);
        if (tapTimes.length > 6) tapTimes.shift();
        if (tapTimes.length < 2) return;
        const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
        setBpm(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length));
    }

    function reset() {
        stop();
        tapTimes = [];
        accentEnabled = true;
        document.getElementById('metronomeAccentBtn').classList.add('active');
        setBpm(DEFAULT_BPM);
    }

    document.addEventListener('DOMContentLoaded', () => {
        setBpm(DEFAULT_BPM);
        document.getElementById('metronomeAccentBtn').classList.add('active');
        document.getElementById('metronomeMinus').addEventListener('click', () => setBpm(bpm - 1));
        document.getElementById('metronomePlus').addEventListener('click', () => setBpm(bpm + 1));
        document.getElementById('metronomeSlider').addEventListener('input', (event) => setBpm(Number(event.target.value)));
        document.getElementById('metronomeTapBtn').addEventListener('click', handleTap);
        document.getElementById('metronomeStartBtn').addEventListener('click', toggle);
        document.getElementById('metronomeAccentBtn').addEventListener('click', (event) => {
            accentEnabled = !accentEnabled;
            event.currentTarget.classList.toggle('active', accentEnabled);
        });
        document.getElementById('metronomeResetBtn').addEventListener('click', reset);
        document.querySelectorAll('.metronome-quick-btn').forEach((button) => button.addEventListener('click', () => setBpm(Number(button.dataset.bpm))));
    });

    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();