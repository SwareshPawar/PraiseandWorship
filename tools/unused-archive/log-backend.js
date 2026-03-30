// Logs backend connection details to the frontend console
async function logBackendConnectionDetails() {
    try {
        const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') 
            ? 'http://localhost:3001/api' 
            : 'https://praiseandworship.onrender.com/api';
        const res = await fetch(API_BASE_URL + '/env');
        if (!res.ok) throw new Error('Failed to fetch backend environment info');
        const env = await res.json();
        console.log('--- Backend Connection Details ---');
        console.log('MongoDB URI:', env.mongodbUri);
        console.log('Database Port:', env.port);
        console.log('Backend URL:', env.backendUrl);
        console.log('Node Environment:', env.nodeEnv);
        console.log('Deployed:', env.deployed);
    } catch (err) {
        console.error('Could not log backend connection details:', err);
    }
}

// Call this function on page load
logBackendConnectionDetails();
