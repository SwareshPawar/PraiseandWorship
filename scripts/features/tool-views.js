(function attachToolViews(window) {
    if (!window || window.ToolViews) return;

    const TOOL_VIEWS = {
        tuner: 'toolView-tuner',
        pads: 'toolView-pads',
        metronome: 'toolView-metronome'
    };

    let activeToolView = null;

    function getRoot(name) {
        const id = TOOL_VIEWS[name];
        return id ? document.getElementById(id) : null;
    }

    function setNavActive(destination) {
        document.querySelectorAll('[data-mobile-destination]').forEach((button) => {
            const isActive = button.dataset.mobileDestination === destination;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
    }

    function applyView(name) {
        Object.keys(TOOL_VIEWS).forEach((key) => {
            const root = getRoot(key);
            if (root) root.hidden = key !== name;
        });
        document.body.classList.add('tool-view-open');
        window.MobileUI?.closeHomeDrawer?.(false);
        document.getElementById('mobileToolsMenu')?.classList.remove('open');
        document.getElementById('mobileToolsMenu')?.setAttribute('aria-hidden', 'true');
        setNavActive('more');
    }

    function clearView(previousName) {
        const root = getRoot(previousName);
        if (root) root.hidden = true;
        document.body.classList.remove('tool-view-open');
        // Mic capture stops on leaving Tuner; metronome/pads audio keeps playing by design.
        if (previousName === 'tuner') window.PWTools?.tuner?.stopMicrophone?.();
        if (window.MobileUI?.restoreActiveDestination) window.MobileUI.restoreActiveDestination();
        else setNavActive('home');
    }

    function open(name) {
        if (!TOOL_VIEWS[name] || !getRoot(name)) return;
        if (activeToolView === name) return;
        const wasActive = Boolean(activeToolView);
        activeToolView = name;
        applyView(name);
        const state = { toolView: name };
        if (wasActive) history.replaceState(state, '');
        else history.pushState(state, '');
    }

    function close() {
        if (!activeToolView) return;
        if (history.state && history.state.toolView) {
            history.back();
        } else {
            const previous = activeToolView;
            activeToolView = null;
            clearView(previous);
        }
    }

    window.addEventListener('popstate', (event) => {
        const name = event.state && event.state.toolView;
        if (name && TOOL_VIEWS[name]) {
            activeToolView = name;
            applyView(name);
        } else if (activeToolView) {
            const previous = activeToolView;
            activeToolView = null;
            clearView(previous);
        }
    });

    document.addEventListener('click', (event) => {
        const opener = event.target.closest('[data-tool-view-open]');
        if (opener) {
            event.preventDefault();
            open(opener.dataset.toolViewOpen);
            return;
        }
        const backBtn = event.target.closest('[data-tool-view-back]');
        if (backBtn) {
            event.preventDefault();
            close();
        }
    });

    function initialToolFromUrl() {
        const fromQuery = new URLSearchParams(window.location.search).get('tool');
        const fromHash = window.location.hash.startsWith('#tool=') ? window.location.hash.slice('#tool='.length) : '';
        return fromQuery || fromHash || null;
    }

    // "Now playing" indicator: tools that keep making sound after you navigate away.
    const activeAudioTools = new Set();

    function updateAudioIndicator() {
        const isActive = activeAudioTools.size > 0;
        document.querySelectorAll('[data-mobile-destination="more"], #toolsFolderHeader').forEach((el) => {
            el.classList.toggle('tool-audio-active', isActive);
        });
    }

    document.addEventListener('pw:tool-audio-state', (event) => {
        const { tool, active } = event.detail || {};
        if (!tool) return;
        if (active) activeAudioTools.add(tool);
        else activeAudioTools.delete(tool);
        updateAudioIndicator();
    });

    function initialize() {
        const initialTool = initialToolFromUrl();
        if (initialTool && TOOL_VIEWS[initialTool]) open(initialTool);
    }

    window.ToolViews = { open, close };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})(window);
