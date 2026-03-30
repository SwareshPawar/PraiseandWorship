const https = require('https');

// Test Vercel test endpoint  
function testVercelTestEndpoint() {
    const data = JSON.stringify({
        test: true,
        message: "Testing POST request"
    });

    const options = {
        hostname: 'praiseand-worship.vercel.app',
        port: 443,
        path: '/api/test',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    console.log('🔍 Testing Vercel test endpoint...');
    console.log('Endpoint: https://praiseand-worship.vercel.app/api/test');

    const req = https.request(options, (res) => {
        console.log('\n📋 Response Status:', res.statusCode, res.statusMessage);
        console.log('Response Headers:', JSON.stringify(res.headers, null, 2));

        let responseBody = '';
        res.on('data', (chunk) => {
            responseBody += chunk;
        });

        res.on('end', () => {
            console.log('\n📄 Response Body:');
            console.log('Length:', responseBody.length);
            console.log('Content-Type:', res.headers['content-type']);
            
            if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                try {
                    const parsed = JSON.parse(responseBody);
                    console.log('✅ JSON Response:', JSON.stringify(parsed, null, 2));
                    if (parsed.success) {
                        console.log('🎉 SERVERLESS FUNCTION IS WORKING!');
                    }
                } catch (e) {
                    console.log('❌ Failed to parse JSON:', e.message);
                    console.log('Raw response:', responseBody.substring(0, 500));
                }
            } else {
                console.log('⚠️ Non-JSON response detected');
                console.log('First 500 chars:', responseBody.substring(0, 500));
            }
        });
    });

    req.on('error', (e) => {
        console.error('❌ Request error:', e.message);
    });

    req.write(data);
    req.end();
}

testVercelTestEndpoint();