(function attachSongPreviewUI(window) {
    if (!window || window.SongPreviewUI) return;

    let previewObserver = null;
    let autoScrollObserver = null;
    let panelObserver = null;

    function getActiveSetlistName() {
        const dropdown = document.getElementById('setlistDropdown');
        if (!dropdown?.value) return '';
        const option = dropdown.options[dropdown.selectedIndex];
        return option?.textContent?.replace(/\s*\((My|Global)\)\s*$/, '').trim() || '';
    }

    function syncSetlistContext() {
        const context = document.getElementById('mobilePreviewSetlistContext');
        const name = document.getElementById('mobilePreviewSetlistName');
        if (!context || !name) return;

        const activeName = getActiveSetlistName();
        context.hidden = !activeName;
        name.textContent = activeName;
    }

    function syncAutoScrollState() {
        const source = document.getElementById('toggleAutoScroll');
        const mobile = document.getElementById('mobilePreviewAuto');
        if (!source || !mobile) return;

        const active = source.classList.contains('active');
        mobile.classList.toggle('active', active);
        mobile.setAttribute('aria-pressed', String(active));
        const icon = mobile.querySelector('i');
        if (icon) icon.className = active ? 'fas fa-pause' : 'fas fa-play';
    }

    function closeMoreMenu() {
        const menu = document.getElementById('mobilePreviewMoreMenu');
        const toggle = document.getElementById('mobilePreviewMore');
        menu?.classList.remove('open');
        menu?.setAttribute('aria-hidden', 'true');
        toggle?.setAttribute('aria-expanded', 'false');
    }

    function delegateClick(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return false;
        target.click();
        return true;
    }

    function handleRhythmLoop() {
        const preview = document.getElementById('songPreview');
        const loopContainer = preview?.querySelector('.loop-player-container');
        if (!loopContainer || getComputedStyle(loopContainer).display === 'none') {
            window.PraiseWorshipMobileDeps?.showNotification?.('No rhythm or loop is available for this song');
            return;
        }

        const content = loopContainer.querySelector('.loop-player-content');
        if (content?.classList.contains('collapsed')) {
            loopContainer.querySelector('.loop-player-toggle-btn')?.click();
        }
        loopContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function createMenuItem(icon, label, targetId, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `mobile-preview-menu-item ${className}`.trim();
        button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${label}</span>`;
        button.addEventListener('click', () => {
            closeMoreMenu();
            if (targetId === 'rhythm-loop') handleRhythmLoop();
            else delegateClick(targetId);
        });
        return button;
    }

    function prepareMobilePreviewSurface() {
        if (window.innerWidth > 768) return;
        const container = document.querySelector('#songPreview .song-preview-container');
        if (!container || container.dataset.mobilePanelNavigationAllowed === 'true') return;
        window.MobileUI?.closeHomeDrawer?.(false);
        window.MobileUI?.setSelectMode?.(false);
        const sidebar = document.querySelector('.sidebar');
        const songs = document.querySelector('.songs-section');
        const previewSection = document.querySelector('.preview-section');
        if (songs?.classList.contains('mobile-filters-open')) songs.classList.remove('mobile-filters-open');
        if (sidebar && !sidebar.classList.contains('hidden')) sidebar.classList.add('hidden');
        if (songs && !songs.classList.contains('hidden')) songs.classList.add('hidden');
        if (previewSection && !previewSection.classList.contains('full-width')) previewSection.classList.add('full-width');
    }

    function decoratePreview() {
        const preview = document.getElementById('songPreview');
        const container = preview?.querySelector('.song-preview-container');
        const header = container?.querySelector('.song-preview-header');
        const actions = container?.querySelector('.song-preview-actions');
        const transpose = container?.querySelector('.song-preview-transpose');
        if (!container || !header || !actions || !transpose || container.dataset.mobilePreviewDecorated === 'true') return;

        container.dataset.mobilePreviewDecorated = 'true';
        prepareMobilePreviewSurface();

        const recommend = document.createElement('button');
        recommend.id = 'mobilePreviewRecommend';
        recommend.type = 'button';
        recommend.className = 'mobile-preview-recommend';
        recommend.title = 'Suggested Songs';
        recommend.setAttribute('aria-label', 'Open Suggested Songs');
        recommend.innerHTML = '<i class="fas fa-random" aria-hidden="true"></i>';
        recommend.addEventListener('click', (event) => {
            event.stopPropagation();
            delegateClick('toggleSuggestedSongs');
        });
        header.appendChild(recommend);

        const context = document.createElement('div');
        context.id = 'mobilePreviewSetlistContext';
        context.className = 'mobile-preview-setlist-context';
        context.innerHTML = '<i class="fas fa-list" aria-hidden="true"></i><span>Setlist</span><strong id="mobilePreviewSetlistName"></strong>';
        transpose.insertAdjacentElement('afterend', context);

        const mobileActions = document.createElement('div');
        mobileActions.className = 'mobile-preview-actions';
        mobileActions.innerHTML = `
            <button type="button" id="mobilePreviewSetlist" class="mobile-preview-action"><i class="fas fa-plus" aria-hidden="true"></i><span>Setlist</span></button>
            <button type="button" id="mobilePreviewAuto" class="mobile-preview-action" aria-pressed="false"><i class="fas fa-play" aria-hidden="true"></i><span>AUTO</span></button>
            <button type="button" id="mobilePreviewMore" class="mobile-preview-action" aria-expanded="false" aria-controls="mobilePreviewMoreMenu"><i class="fas fa-ellipsis-h" aria-hidden="true"></i><span>More</span></button>
        `;
        context.insertAdjacentElement('afterend', mobileActions);

        const menu = document.createElement('div');
        menu.id = 'mobilePreviewMoreMenu';
        menu.className = 'mobile-preview-more-menu';
        menu.setAttribute('aria-hidden', 'true');
        if (document.getElementById('toggleMetaBtn')) menu.appendChild(createMenuItem('fa-info-circle', 'Song Information', 'toggleMetaBtn'));
        menu.appendChild(createMenuItem('fa-edit', 'Edit Song', 'previewEditBtn'));
        menu.appendChild(createMenuItem('fa-undo', 'Reset Transpose', 'transposeReset'));
        if (document.getElementById('previewDeleteBtn')) menu.appendChild(createMenuItem('fa-trash-alt', 'Delete Song', 'previewDeleteBtn', 'danger'));
        if (container.querySelector('.loop-player-container')) menu.appendChild(createMenuItem('fa-drum', 'Rhythm / Loop', 'rhythm-loop'));
        mobileActions.insertAdjacentElement('afterend', menu);

        document.getElementById('mobilePreviewSetlist')?.addEventListener('click', () => delegateClick('previewSetlistBtn'));
        document.getElementById('mobilePreviewAuto')?.addEventListener('click', () => {
            delegateClick('toggleAutoScroll');
            window.setTimeout(syncAutoScrollState, 0);
        });
        document.getElementById('mobilePreviewMore')?.addEventListener('click', (event) => {
            event.stopPropagation();
            const open = menu.classList.toggle('open');
            menu.setAttribute('aria-hidden', String(!open));
            event.currentTarget.setAttribute('aria-expanded', String(open));
        });

        if (autoScrollObserver) autoScrollObserver.disconnect();
        const sourceAuto = document.getElementById('toggleAutoScroll');
        if (sourceAuto) {
            autoScrollObserver = new MutationObserver(syncAutoScrollState);
            autoScrollObserver.observe(sourceAuto, { attributes: true, attributeFilter: ['class'] });
        }

        syncSetlistContext();
        syncAutoScrollState();
    }

    function initializeSongPreviewUI() {
        const preview = document.getElementById('songPreview');
        if (!preview || preview.dataset.mobilePreviewObserverBound === 'true') return;
        preview.dataset.mobilePreviewObserverBound = 'true';

        previewObserver = new MutationObserver(decoratePreview);
        previewObserver.observe(preview, { childList: true, subtree: true });
        const sidebar = document.querySelector('.sidebar');
        const songs = document.querySelector('.songs-section');
        if (sidebar && songs) {
            panelObserver = new MutationObserver(prepareMobilePreviewSurface);
            panelObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
            panelObserver.observe(songs, { attributes: true, attributeFilter: ['class'] });
        }
        document.getElementById('setlistDropdown')?.addEventListener('change', syncSetlistContext);
        document.addEventListener('pw:mobile-destination', () => {
            const container = document.querySelector('#songPreview .song-preview-container');
            if (container) container.dataset.mobilePanelNavigationAllowed = 'true';
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('#mobilePreviewMore, #mobilePreviewMoreMenu')) closeMoreMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMoreMenu();
        });
        decoratePreview();
    }

    window.SongPreviewUI = {
        closeMoreMenu,
        decoratePreview,
        initializeSongPreviewUI,
        syncAutoScrollState,
        syncSetlistContext
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSongPreviewUI, { once: true });
    } else {
        initializeSongPreviewUI();
    }
})(window);