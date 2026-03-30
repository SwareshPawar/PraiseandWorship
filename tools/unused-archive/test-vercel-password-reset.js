const https = require('https');

// Test Vercel password reset API endpoint
function testVercelPasswordReset() {
    const data = JSON.stringify({
        identifier: 'swarjrs@gmail.com', // Your test email
        method: 'email'
    });

    const options = {
        hostname: 'praiseand-worship.vercel.app',
        port: 443,
        path: '/api/forgot-password',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    console.log('🔍 Testing Vercel password reset API...');
    console.log('Endpoint: https://praiseand-worship.vercel.app/api/forgot-password');
    console.log('Request data:', data);

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
            
            if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                try {
                    const parsed = JSON.parse(responseBody);
                    console.log('✅ Parsed JSON Response:', JSON.stringify(parsed, null, 2));
                    if (parsed.success) {
                        console.log('🎉 PASSWORD RESET WORKING! OTP should be sent to email.');
                    } else {
                        console.log('⚠️ API returned an error:', parsed.error);
                    }
                } catch (e) {
                    console.log('❌ Failed to parse JSON:', e.message);
                    console.log('Raw response:', responseBody.substring(0, 500));
                }
            } else {
                console.log('⚠️ Non-JSON response detected');
                console.log('Content-Type:', res.headers['content-type']);
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

testVercelPasswordReset();