// Only set API_BASE_URL when it isn't already declared (main1.js declares it when this script is embedded in the SPA).
if (typeof API_BASE_URL === 'undefined') {
    window.API_BASE_URL = window.AppApiBase ? window.AppApiBase.resolve() : window.location.origin;
}

(function initializePadsAndTanpura() {
    'use strict';

    const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let player = null;
    let selectedKey = 'C';
    let loadedKey = null;

    function ensurePlayer() {
        if (player) return player;
        player = new LoopPlayerPad();
        player.onMelodicPadToggle = (type, playing) => {
            const button = document.getElementById(type === 'atmosphere' ? 'padAtmosphere' : 'padTanpura');
            if (!button) return;
            button.classList.toggle('playing', playing);
            button.querySelector('.pads-sound-state').textContent = playing ? 'Playing...' : 'Tap to Play';
            const icon = button.querySelector('.pads-play-icon i');
            if (icon) icon.className = playing ? 'fas fa-stop' : 'fas fa-play';
            const anyPlaying = Boolean(player.melodicPads.atmosphere.isPlaying || player.melodicPads.tanpura.isPlaying);
            document.dispatchEvent(new CustomEvent('pw:tool-audio-state', { detail: { tool: 'pads', active: anyPlaying } }));
        };
        player.onMelodicError = (type) => {
            document.getElementById('padsAvailabilityHint').textContent = `Could not play ${type} for key ${selectedKey}.`;
        };
        return player;
    }

    async function refreshAvailability() {
        const availability = await ensurePlayer().checkMelodicAvailability(['atmosphere', 'tanpura']);
        const atmosphere = document.getElementById('padAtmosphere');
        const tanpura = document.getElementById('padTanpura');
        atmosphere.classList.toggle('unavailable', !availability.atmosphere);
        tanpura.classList.toggle('unavailable', !availability.tanpura);
        atmosphere.disabled = !availability.atmosphere;
        tanpura.disabled = !availability.tanpura;
        const missing = [!availability.atmosphere && 'atmosphere', !availability.tanpura && 'tanpura'].filter(Boolean);
        document.getElementById('padsAvailabilityHint').textContent = missing.length ? `Unavailable for ${selectedKey}: ${missing.join(' and ')}.` : `Both sounds are available for ${selectedKey}.`;
    }

    async function selectKey(key) {
        selectedKey = key;
        document.getElementById('padsCurrentKeyLabel').textContent = key;
        document.querySelectorAll('.pads-key-btn').forEach((button) => button.classList.toggle('active', button.dataset.key === key));
        if (loadedKey === key) return;
        loadedKey = key;
        const activePlayer = ensurePlayer();
        const atmospherePlaying = activePlayer.melodicPads.atmosphere.isPlaying;
        const tanpuraPlaying = activePlayer.melodicPads.tanpura.isPlaying;
        await activePlayer.setSongKeyAndTranspose(key, 0, true);
        await refreshAvailability();
        if (atmospherePlaying) await activePlayer.toggleAtmosphere();
        if (tanpuraPlaying) await activePlayer.toggleTanpura();
    }

    function renderKeys() {
        const container = document.getElementById('padsKeySelector');
        container.innerHTML = KEYS.map((key) => `<button class="pads-key-btn${key === selectedKey ? ' active' : ''}" type="button" data-key="${key}">${key}</button>`).join('');
        container.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => selectKey(button.dataset.key)));
    }

    function stopAudio() {
        player?.stopAllMelodicPads?.();
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderKeys();
        document.getElementById('padAtmosphere').addEventListener('click', () => ensurePlayer().toggleAtmosphere());
        document.getElementById('padTanpura').addEventListener('click', () => ensurePlayer().toggleTanpura());
        document.getElementById('padsVolume').addEventListener('input', (event) => {
            const value = Number(event.target.value);
            document.getElementById('padsVolumeValue').textContent = `${value}%`;
            ensurePlayer().setMelodicVolume(value / 100);
        });
        selectKey(selectedKey).catch((error) => {
            console.warn('Failed to load melodic pad availability:', error);
            document.getElementById('padsAvailabilityHint').textContent = 'Could not load pad availability.';
        });
    });

    window.addEventListener('pagehide', stopAudio);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
})();