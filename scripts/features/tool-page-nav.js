(function attachToolPageNavigation(window) {
    'use strict';

    function navigateToApp(destination) {
        const target = destination === 'songs' || destination === 'setlist' ? destination : 'home';
        localStorage.setItem('pw_mobileLastOpenedPanel', target === 'setlist' ? 'songs' : target);
        sessionStorage.setItem('pw_pendingMobileDestination', target);
        sessionStorage.setItem('pw_skipInitialSetlistViewRestore', 'true');
        window.location.href = 'index.html';
    }

    function initialize() {
        document.body.classList.toggle(
            'dark-mode',
            localStorage.getItem('pw_darkMode') === 'true' || localStorage.getItem('darkMode') === 'true'
        );

        document.querySelectorAll('[data-app-destination]').forEach((button) => {
            button.addEventListener('click', () => navigateToApp(button.dataset.appDestination));
        });

        document.getElementById('toolPageBack')?.addEventListener('click', () => {
            if (window.history.length > 1) window.history.back();
            else navigateToApp('home');
        });

        const toggles = document.querySelectorAll('[data-tool-menu-toggle]');
        const menu = document.getElementById('toolMenu');
        toggles.forEach((toggle) => {
            toggle.addEventListener('click', (event) => {
                event.stopPropagation();
                const open = menu?.classList.toggle('open') || false;
                toggles.forEach((button) => button.setAttribute('aria-expanded', String(open)));
                menu?.setAttribute('aria-hidden', String(!open));
            });
        });
        document.addEventListener('click', (event) => {
            if (!menu?.classList.contains('open')) return;
            if (event.target.closest('#toolMenu, [data-tool-menu-toggle]')) return;
            menu.classList.remove('open');
            menu.setAttribute('aria-hidden', 'true');
            toggles.forEach((button) => button.setAttribute('aria-expanded', 'false'));
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})(window);