(function initAppAuth(global) {
    const config = {
        loginUrl: 'index.html',
        timeoutMs: 30000,
        onMissingToken: null,
        onUnauthorized: null
    };

    let cachedToken = null;

    function configure(nextConfig = {}) {
        Object.assign(config, nextConfig || {});
    }

    function getToken() {
        if (typeof cachedToken === 'string' && cachedToken.length > 0) {
            return cachedToken;
        }
        const storedToken = global.localStorage?.getItem('pw_jwtToken') || global.localStorage?.getItem('jwtToken') || '';
        cachedToken = storedToken;
        return storedToken;
    }

    function hasToken() {
        return getToken().length > 0;
    }

    function setToken(token) {
        cachedToken = typeof token === 'string' ? token : '';
        if (!global.localStorage) return;

        if (cachedToken) {
            global.localStorage.setItem('pw_jwtToken', cachedToken);
            global.localStorage.setItem('jwtToken', cachedToken);
        } else {
            global.localStorage.removeItem('pw_jwtToken');
            global.localStorage.removeItem('jwtToken');
        }
    }

    function clearSession(options = {}) {
        cachedToken = '';
        if (!global.localStorage) return;

        global.localStorage.removeItem('pw_jwtToken');
        global.localStorage.removeItem('jwtToken');
        if (options.clearCurrentUser) {
            global.localStorage.removeItem('currentUser');
        }
    }

    function getAuthHeaders(headers = {}) {
        const token = getToken();
        if (!token) {
            return { ...headers };
        }
        return {
            ...headers,
            Authorization: `Bearer ${token}`
        };
    }

    function defaultHandleMissingToken() {
        global.alert('Please login first');
        global.location.href = config.loginUrl;
    }

    function defaultHandleUnauthorized() {
        clearSession();
        global.alert('Session expired. Please login again.');
        global.location.href = config.loginUrl;
    }

    async function authFetch(url, options = {}) {
        const requestOptions = { ...options };
        const suppressAuthRedirect = requestOptions.suppressAuthRedirect === true;
        const timeoutMs = Number.isFinite(requestOptions.timeout) ? requestOptions.timeout : config.timeoutMs;

        delete requestOptions.suppressAuthRedirect;
        delete requestOptions.timeout;

        const token = getToken();
        if (!token) {
            if (suppressAuthRedirect) {
                throw new Error('AUTH_REQUIRED');
            }

            if (typeof config.onMissingToken === 'function') {
                config.onMissingToken({ url });
            } else {
                defaultHandleMissingToken();
            }

            throw new Error('Not authenticated');
        }

        requestOptions.headers = getAuthHeaders(requestOptions.headers || {});

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await global.fetch(url, {
                ...requestOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 401) {
                if (suppressAuthRedirect) {
                    throw new Error('AUTH_REQUIRED');
                }

                if (typeof config.onUnauthorized === 'function') {
                    config.onUnauthorized({ url, response });
                } else {
                    defaultHandleUnauthorized();
                }

                throw new Error('Session expired');
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    global.AppAuth = {
        authFetch,
        clearSession,
        configure,
        getAuthHeaders,
        getToken,
        hasToken,
        setToken
    };
})(window);