// Production Configuration for Praise & Worship App
// Automatic fallback system for multiple deployment platforms

const PRODUCTION_ENDPOINTS = [
    'https://praiseandworship.onrender.com', // Primary - Render deployment
    'https://praiseand-worship.vercel.app'   // Fallback - Vercel deployment
];

const LOCAL_ENDPOINT = 'http://localhost:3001';

// Function to detect the best available API endpoint
async function detectBestEndpoint() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocal) {
        return LOCAL_ENDPOINT;
    }

    // Test production endpoints in order of preference
    for (const endpoint of PRODUCTION_ENDPOINTS) {
        try {
            const response = await fetch(`${endpoint}/api/health`, { 
                method: 'GET',
                timeout: 5000,
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                console.log(`✅ Active endpoint detected: ${endpoint}`);
                return endpoint;
            }
        } catch (error) {
            console.log(`❌ Endpoint ${endpoint} not responding:`, error.message);
        }
    }

    // Fallback to primary if all tests fail
    console.log(`⚠️ Using primary endpoint as fallback: ${PRODUCTION_ENDPOINTS[0]}`);
    return PRODUCTION_ENDPOINTS[0];
}

// Export for use in main application
window.PRODUCTION_CONFIG = {
    PRODUCTION_ENDPOINTS,
    LOCAL_ENDPOINT,
    detectBestEndpoint
};

console.log('Production configuration loaded. Endpoints:', PRODUCTION_ENDPOINTS);