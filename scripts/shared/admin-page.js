(function initAdminPage(global) {
    function showAlert(elementId, message, type = 'info', duration = 5000) {
        const alertElement = global.document.getElementById(elementId);
        if (!alertElement) return;

        alertElement.textContent = message;
        alertElement.className = `alert alert-${type}`;
        alertElement.style.display = 'block';

        global.setTimeout(() => {
            alertElement.style.display = 'none';
        }, duration);
    }

    function showHtmlAlert(elementId, html, type = 'info') {
        const alertElement = global.document.getElementById(elementId);
        if (!alertElement) return;

        alertElement.innerHTML = html;
        alertElement.className = `alert alert-${type}`;
        alertElement.style.display = 'block';
    }

    function disableInteraction(selector) {
        const element = global.document.querySelector(selector);
        if (!element) return;

        element.style.opacity = '0.5';
        element.style.pointerEvents = 'none';
    }

    function showAuthenticationWarnings(config) {
        const alerts = Array.isArray(config?.alerts) ? config.alerts : [];
        const disableSelectors = Array.isArray(config?.disableSelectors) ? config.disableSelectors : [];

        alerts.forEach(alertConfig => {
            if (!alertConfig?.elementId || !alertConfig?.html) return;
            showHtmlAlert(alertConfig.elementId, alertConfig.html, alertConfig.type || 'info');
        });

        disableSelectors.forEach(disableInteraction);
    }

    function createAudioPreviewController(config = {}) {
        const buttonSelector = config.buttonSelector || '.play-btn';
        const playingClass = config.playingClass || '';
        let currentAudio = null;

        function resetButtons() {
            global.document.querySelectorAll(buttonSelector).forEach(button => {
                if (playingClass) {
                    button.classList.remove(playingClass);
                }

                const icon = button.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-play';
                }
            });
        }

        function play(url, button) {
            if (currentAudio) {
                currentAudio.pause();
                resetButtons();
            }

            const icon = button?.querySelector('i');

            if (currentAudio && currentAudio.src.endsWith(url) && !currentAudio.paused) {
                currentAudio.pause();
                return;
            }

            currentAudio = new global.Audio(url);
            currentAudio.play();

            if (playingClass && button) {
                button.classList.add(playingClass);
            }
            if (icon) {
                icon.className = 'fas fa-pause';
            }

            currentAudio.addEventListener('ended', () => {
                if (playingClass && button) {
                    button.classList.remove(playingClass);
                }
                if (icon) {
                    icon.className = 'fas fa-play';
                }
            });
        }

        return {
            play,
            resetButtons
        };
    }

    global.AdminPage = {
        createAudioPreviewController,
        disableInteraction,
        showAlert,
        showAuthenticationWarnings,
        showHtmlAlert
    };
})(window);