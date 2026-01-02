const https = require('https');

console.log('🔍 Testing Vercel API status...');

// Test just the health endpoint with detailed debugging
const options = {
  hostname: 'praiseand-worship.vercel.app',
  port: 443,
  path: '/api/health',
  method: 'GET',
  headers: {
    'User-Agent': 'Node.js Test Client',
    'Accept': 'application/json',
    'Cache-Control': 'no-cache'
  }
};

const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Status Message: ${res.statusMessage}`);
  console.log('Response Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => data += chunk);
  
  res.on('end', () => {
    console.log('\n📋 Response Analysis:');
    console.log('Response Length:', data.length);
    console.log('Content Type:', res.headers['content-type']);
    
    if (res.headers['content-type']?.includes('application/json')) {
      try {
        const result = JSON.parse(data);
        console.log('✅ Valid JSON Response:', JSON.stringify(result, null, 2));
        
        if (result.emailConfigured !== undefined) {
          console.log('\n🎯 Environment Status:');
          console.log('- Email Configured:', result.emailConfigured);
          console.log('- SMS Configured:', result.smsConfigured);
          console.log('- Database:', result.database);
          console.log('- JWT Secret:', result.hasJwtSecret);
        }
        
      } catch (e) {
        console.log('❌ Invalid JSON Response');
        console.log('First 500 chars:', data.substring(0, 500));
      }
    } else {
      console.log('❌ Non-JSON Response (likely HTML/source code)');
      console.log('First 200 chars:', data.substring(0, 200));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
});

req.setTimeout(10000, () => {
  console.log('⏰ Request timeout');
  req.destroy();
});

req.end();