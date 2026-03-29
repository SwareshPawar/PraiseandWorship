(function initAppApiBase(global) {
    function resolve() {
        const locationRef = global.location || {};
        const protocol = locationRef.protocol || '';
        const hostname = locationRef.hostname || '';
        const port = locationRef.port || '';
        const origin = locationRef.origin || '';
        const runtimeApiBaseOverride = ((global.__API_BASE_URL__ || '') + '').trim();
        const storedApiBase = ((global.localStorage?.getItem('apiBaseUrl') || '') + '').trim();
        const backendPreference = ((global.localStorage?.getItem('pw_admin_backend') || '') + '').trim().toLowerCase();

        const isLocalRuntime = protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1';

        if (runtimeApiBaseOverride) {
            return runtimeApiBaseOverride.replace(/\/$/, '');
        }

        // Always use local backend while developing on localhost unless explicitly overridden.
        if (isLocalRuntime) {
            const localHost = hostname || 'localhost';
            return port === '3001' ? origin : `http://${localHost}:3001`;
        }

        if (storedApiBase) {
            return storedApiBase.replace(/\/$/, '');
        }

        if (backendPreference === 'render') {
            return 'https://praiseandworship.onrender.com';
        }

        if (backendPreference === 'vercel') {
            return 'https://praiseand-worship.vercel.app';
        }

        if (hostname.endsWith('github.io')) {
            return 'https://praiseand-worship.vercel.app';
        }

        return origin;
    }

    global.AppApiBase = {
        resolve
    };
})(window);