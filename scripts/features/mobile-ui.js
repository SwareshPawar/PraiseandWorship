(function attachMobileUI(window) {
    if (!window || window.MobileUI) return;

    const MOBILE_BREAKPOINT = 768;
    const PANEL_STATE_KEY = 'pw_mobileLastOpenedPanel';
    let homeState = null;
    const catalogueState = {
        observers: [],
        selectMode: false,
        selectedSongIds: new Set()
    };

    function getElements() {
        return {
            shell: document.getElementById('mobileModernShell'),
            backdrop: document.getElementById('mobileHomeBackdrop'),
            sidebar: document.querySelector('.sidebar'),
            songs: document.querySelector('.songs-section'),
            preview: document.querySelector('.preview-section')
        };
    }

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function setActiveDestination(destination) {
        document.querySelectorAll('[data-mobile-destination]').forEach((button) => {
            const isActive = button.dataset.mobileDestination === destination;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
    }

    function updateLayout(elements) {
        if (!elements.sidebar || !elements.songs || !elements.preview) return;

        if (elements.songs.style.left !== '0px') elements.songs.style.left = '0';
        if (elements.preview.style.marginLeft !== '0px') elements.preview.style.marginLeft = '0';
        const shouldBeFullWidth = elements.songs.classList.contains('hidden');
        if (elements.preview.classList.contains('full-width') !== shouldBeFullWidth) {
            elements.preview.classList.toggle('full-width', shouldBeFullWidth);
        }
    }

    function persistPanelState(elements) {
        if (!isMobile() || !elements.sidebar || !elements.songs) return;

        if (!elements.sidebar.classList.contains('hidden') && elements.songs.classList.contains('hidden')) {
            localStorage.setItem(PANEL_STATE_KEY, 'home');
        } else if (elements.sidebar.classList.contains('hidden') && !elements.songs.classList.contains('hidden')) {
            localStorage.setItem(PANEL_STATE_KEY, 'songs');
        }
    }

    function setPanelVisibility(panel) {
        const elements = getElements();
        if (!isMobile() || !elements.sidebar || !elements.songs) return;

        closeHomeDrawer(false);
        const showSongs = panel === 'songs';
        elements.sidebar.classList.toggle('hidden', showSongs);
        elements.songs.classList.toggle('hidden', !showSongs);
        elements.preview?.classList.toggle('full-width', !showSongs);
        localStorage.setItem(PANEL_STATE_KEY, showSongs ? 'songs' : 'home');
        setActiveDestination(showSongs ? 'songs' : 'home');
        updateLayout(elements);
    }

    function openHomeDrawer() {
        const elements = getElements();
        if (!isMobile() || !elements.sidebar || !elements.songs || !elements.backdrop) return;

        if (!homeState) {
            homeState = {
                sidebarHidden: elements.sidebar.classList.contains('hidden'),
                songsHidden: elements.songs.classList.contains('hidden'),
                sidebarScrollTop: elements.sidebar.scrollTop,
                songsScrollTop: elements.songs.scrollTop,
                previewScrollTop: elements.preview?.scrollTop || 0
            };
        }

        elements.songs.classList.add('hidden');
        elements.sidebar.classList.remove('hidden');
        elements.sidebar.classList.add('mobile-home-drawer-open');
        elements.backdrop.classList.add('open');
        elements.backdrop.setAttribute('aria-hidden', 'false');
        document.body.classList.add('mobile-home-open');
        localStorage.setItem(PANEL_STATE_KEY, 'home');
        setActiveDestination('home');
        updateLayout(elements);
    }

    function closeHomeDrawer(restoreState = true) {
        const elements = getElements();
        if (!elements.sidebar || !elements.songs || !elements.backdrop) return;

        if (elements.sidebar.classList.contains('mobile-home-drawer-open')) {
            elements.sidebar.classList.remove('mobile-home-drawer-open');
        }
        if (elements.backdrop.classList.contains('open')) elements.backdrop.classList.remove('open');
        if (elements.backdrop.getAttribute('aria-hidden') !== 'true') {
            elements.backdrop.setAttribute('aria-hidden', 'true');
        }
        if (document.body.classList.contains('mobile-home-open')) {
            document.body.classList.remove('mobile-home-open');
        }

        if (restoreState && homeState) {
            elements.sidebar.classList.toggle('hidden', homeState.sidebarHidden);
            elements.songs.classList.toggle('hidden', homeState.songsHidden);
            elements.sidebar.scrollTop = homeState.sidebarScrollTop;
            elements.songs.scrollTop = homeState.songsScrollTop;
            if (elements.preview) elements.preview.scrollTop = homeState.previewScrollTop;
        }

        homeState = null;
        persistPanelState(elements);
        if (restoreState) {
            const restoredDestination = !elements.songs.classList.contains('hidden') ? 'songs' : 'home';
            setActiveDestination(restoredDestination);
        }
        updateLayout(elements);
    }

    function activateDestination(destination) {
        const elements = getElements();
        if (!isMobile()) return;
        document.dispatchEvent(new CustomEvent('pw:mobile-destination', { detail: { destination } }));
        const toolsMenu = document.getElementById('mobileToolsMenu');

        if (destination === 'home') {
            toolsMenu?.classList.remove('open');
            toolsMenu?.setAttribute('aria-hidden', 'true');
            if (document.body.classList.contains('mobile-home-open')) {
                closeHomeDrawer();
            } else {
                openHomeDrawer();
            }
            return;
        }

        if (destination === 'songs') {
            toolsMenu?.classList.remove('open');
            toolsMenu?.setAttribute('aria-hidden', 'true');
            const showAll = document.getElementById('showAll');
            if (showAll) showAll.click();
            else setPanelVisibility('songs');
            setActiveDestination('songs');
            return;
        }

        if (destination === 'setlist') {
            toolsMenu?.classList.remove('open');
            toolsMenu?.setAttribute('aria-hidden', 'true');
            closeHomeDrawer(false);
            setPanelVisibility('songs');
            setActiveDestination('setlist');
            document.dispatchEvent(new CustomEvent('pw:open-selected-setlist'));
            return;
        }

        closeHomeDrawer();
        const open = toolsMenu?.classList.toggle('open') || false;
        toolsMenu?.setAttribute('aria-hidden', String(!open));
        setActiveDestination(open ? 'more' : (localStorage.getItem(PANEL_STATE_KEY) === 'songs' ? 'songs' : 'home'));
        updateLayout(elements);
    }

    function getSelectedSetlist() {
        const dropdown = document.getElementById('setlistDropdown');
        if (!dropdown?.value) return null;

        const option = dropdown.options[dropdown.selectedIndex];
        return {
            id: dropdown.value,
            name: option?.textContent?.replace(/\s*\((My|Global)\)\s*$/, '').trim() || 'active setlist',
            readOnly: dropdown.value.startsWith('smart_')
        };
    }

    function updateFilterLabel() {
        const label = document.getElementById('mobileFiltersLabel');
        if (!label) return;

        const defaults = new Set(['', 'Key', 'Genre', 'Mood', 'Artist']);
        const activeCount = ['keyFilter', 'genreFilter', 'moodFilter', 'artistFilter']
            .reduce((count, id) => {
                const value = document.getElementById(id)?.value || '';
                return count + (defaults.has(value) ? 0 : 1);
            }, 0);
        label.textContent = `Filters - ${activeCount} active`;
    }

    function updateSelectionBar() {
        const summary = document.getElementById('mobileSelectionSummary');
        const action = document.getElementById('mobileSelectionAction');
        if (!summary || !action) return;

        const count = catalogueState.selectedSongIds.size;
        const setlist = getSelectedSetlist();
        summary.textContent = count ? `${count} song${count === 1 ? '' : 's'} selected` : 'Select songs to add';

        if (!setlist) {
            action.textContent = 'Select a setlist';
            action.disabled = false;
        } else if (setlist.readOnly) {
            action.textContent = 'Smart setlist is read-only';
            action.disabled = true;
        } else {
            action.textContent = count ? `Add ${count} to ${setlist.name}` : `Add to ${setlist.name}`;
            action.disabled = count === 0;
        }
    }

    function decorateSongRows() {
        document.querySelectorAll('#PraiseContent .song-item, #WorshipContent .song-item').forEach((row) => {
            const songId = String(row.dataset.songId || '');
            if (!songId) return;

            const setlistButton = row.querySelector('.toggle-setlist');
            const alreadyAdded = setlistButton?.classList.contains('btn-delete') || false;
            let control = row.querySelector('.mobile-song-select-control');

            if (!control) {
                control = document.createElement('label');
                control.className = 'mobile-song-select-control';
                control.title = 'Select song';
                control.innerHTML = '<input class="mobile-song-select" type="checkbox" aria-label="Select song"><span aria-hidden="true"></span>';
                const input = control.querySelector('input');
                input.addEventListener('click', (event) => event.stopPropagation());
                input.addEventListener('change', () => {
                    if (input.checked) catalogueState.selectedSongIds.add(songId);
                    else catalogueState.selectedSongIds.delete(songId);
                    row.classList.toggle('mobile-selected', input.checked);
                    updateSelectionBar();
                });
                row.querySelector('.song-header')?.prepend(control);
            }

            const input = control.querySelector('input');
            if (!input) return;
            if (input.disabled !== alreadyAdded) input.disabled = alreadyAdded;
            if (alreadyAdded) catalogueState.selectedSongIds.delete(songId);
            const selected = !alreadyAdded && catalogueState.selectedSongIds.has(songId);
            if (input.checked !== selected) input.checked = selected;
            if (row.classList.contains('mobile-selected') !== selected) {
                row.classList.toggle('mobile-selected', selected);
            }
        });

        updateSelectionBar();
    }

    function setSelectMode(enabled) {
        catalogueState.selectMode = enabled;
        document.body.classList.toggle('mobile-select-mode', enabled);
        const toggle = document.getElementById('mobileSelectToggle');
        toggle?.classList.toggle('active', enabled);
        toggle?.setAttribute('aria-pressed', String(enabled));
        const label = toggle?.querySelector('span');
        if (label) label.textContent = enabled ? 'Done' : 'Select';

        if (!enabled) {
            catalogueState.selectedSongIds.clear();
            document.querySelectorAll('.mobile-song-select').forEach((input) => { input.checked = false; });
            document.querySelectorAll('.song-item.mobile-selected').forEach((row) => row.classList.remove('mobile-selected'));
        }
        updateSelectionBar();
    }

    function closeFilters() {
        document.querySelector('.songs-section')?.classList.remove('mobile-filters-open');
        document.getElementById('mobileFiltersToggle')?.setAttribute('aria-expanded', 'false');
        document.getElementById('mobileSortToggle')?.setAttribute('aria-expanded', 'false');
    }

    function openFilters(focusSort = false) {
        document.querySelector('.songs-section')?.classList.add('mobile-filters-open');
        document.getElementById('mobileFiltersToggle')?.setAttribute('aria-expanded', 'true');
        document.getElementById('mobileSortToggle')?.setAttribute('aria-expanded', 'true');
        if (focusSort) window.setTimeout(() => document.getElementById('sortFilter')?.focus(), 0);
    }

    function addSelectedSongs() {
        const setlist = getSelectedSetlist();
        const deps = window.PraiseWorshipMobileDeps;
        if (!setlist) {
            deps?.showNotification?.('Please select a setlist from Home first');
            openHomeDrawer();
            return;
        }
        if (setlist.readOnly || !catalogueState.selectedSongIds.size) return;
        if (typeof deps?.addToSpecificSetlist !== 'function') {
            deps?.showNotification?.('Setlist actions are still loading');
            return;
        }

        catalogueState.selectedSongIds.forEach((songId) => {
            deps.addToSpecificSetlist(Number(songId), setlist.id);
        });
        setSelectMode(false);
    }

    function initializeMobileCatalogue() {
        const controls = document.getElementById('mobileCatalogueControls');
        if (!controls || controls.dataset.bound === 'true') return;
        controls.dataset.bound = 'true';

        document.getElementById('mobileFiltersToggle')?.addEventListener('click', () => {
            const open = document.querySelector('.songs-section')?.classList.contains('mobile-filters-open');
            if (open) closeFilters();
            else openFilters();
        });
        document.getElementById('mobileSortToggle')?.addEventListener('click', () => openFilters(true));
        document.getElementById('mobileFiltersBackdrop')?.addEventListener('click', closeFilters);
        document.getElementById('mobileSelectToggle')?.addEventListener('click', () => setSelectMode(!catalogueState.selectMode));
        document.getElementById('mobileSelectionAction')?.addEventListener('click', addSelectedSongs);
        document.getElementById('setlistDropdown')?.addEventListener('change', updateSelectionBar);

        ['keyFilter', 'genreFilter', 'moodFilter', 'artistFilter'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', updateFilterLabel);
        });
        ['PraiseContent', 'WorshipContent'].forEach((id) => {
            const content = document.getElementById(id);
            if (!content) return;
            const observer = new MutationObserver(decorateSongRows);
            observer.observe(content, { childList: true });
            catalogueState.observers.push(observer);
        });

        updateFilterLabel();
        decorateSongRows();
    }

    function syncResponsiveMode() {
        const elements = getElements();
        const mobile = isMobile();
        document.body.classList.toggle('mobile-modern-mode', mobile);
        elements.shell?.setAttribute('aria-hidden', String(!mobile));

        if (!mobile) {
            closeHomeDrawer(false);
            return;
        }

        const rememberedPanel = localStorage.getItem(PANEL_STATE_KEY) === 'songs' ? 'songs' : 'home';
        setActiveDestination(rememberedPanel);
    }

    function initializeMobileUI() {
        const elements = getElements();
        if (!elements.shell || elements.shell.dataset.bound === 'true') return;

        elements.shell.dataset.bound = 'true';
        elements.shell.querySelectorAll('[data-mobile-destination]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                activateDestination(button.dataset.mobileDestination);
            });
        });

        document.getElementById('mobileHomeClose')?.addEventListener('click', () => closeHomeDrawer());
        elements.backdrop?.addEventListener('click', () => closeHomeDrawer());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.body.classList.contains('mobile-home-open')) {
                closeHomeDrawer();
            }
        });
        document.addEventListener('click', (event) => {
            if (event.target.closest('#showAll, #showFavorites, .setlist-item')) {
                const destination = event.target.closest('.setlist-item') ? 'setlist' : 'songs';
                document.dispatchEvent(new CustomEvent('pw:mobile-destination', {
                    detail: { destination }
                }));
                setActiveDestination(destination);
                closeHomeDrawer(false);
            }
            const toolsMenu = document.getElementById('mobileToolsMenu');
            if (toolsMenu?.classList.contains('open') && !event.target.closest('#mobileToolsMenu, [data-mobile-destination="more"]')) {
                toolsMenu.classList.remove('open');
                toolsMenu.setAttribute('aria-hidden', 'true');
                setActiveDestination(localStorage.getItem(PANEL_STATE_KEY) === 'songs' ? 'songs' : 'home');
            }
        }, true);

        window.addEventListener('resize', syncResponsiveMode);
        syncResponsiveMode();
        initializeMobileCatalogue();
        if (isMobile()) {
            const pendingDestination = sessionStorage.getItem('pw_pendingMobileDestination');
            sessionStorage.removeItem('pw_pendingMobileDestination');
            const rememberedPanel = pendingDestination === 'home' || pendingDestination === 'songs'
                ? pendingDestination
                : (localStorage.getItem(PANEL_STATE_KEY) === 'songs' ? 'songs' : 'home');
            setPanelVisibility(rememberedPanel);
        }
    }

    window.MobileUI = {
        activateDestination,
        closeHomeDrawer,
        initializeMobileUI,
        initializeMobileCatalogue,
        openHomeDrawer,
        setSelectMode,
        setPanelVisibility
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMobileUI, { once: true });
    } else {
        initializeMobileUI();
    }
})(window);