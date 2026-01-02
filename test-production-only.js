const https = require('https');

console.log('🧪 Testing PRODUCTION server status...');

// Test production forgot-password
const postData = JSON.stringify({
  identifier: 'swarjrs@gmail.com',
  method: 'email'
});

const options = {
  hostname: 'praiseandworship.onrender.com',
  port: 443,
  path: '/api/forgot-password',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'Node.js Test Client'
  }
};

const req = https.request(options, (res) => {
  console.log(`\n📡 PRODUCTION Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('🔍 PRODUCTION Response:', JSON.stringify(result, null, 2));
      
      if (res.statusCode === 500) {
        console.log('\n❌ Still getting 500 error. This means:');
        console.log('1. Render deployment might not be complete yet (wait 2-3 minutes)');
        console.log('2. EMAIL_PASSWORD not updated in Render environment variables');
        console.log('3. Check Render logs for detailed error information');
      } else if (res.statusCode === 200) {
        console.log('\n✅ SUCCESS! Production is working!');
      } else {
        console.log('\n⚠️ Unexpected status. Check the response above.');
      }
      
    } catch (e) {
      console.log('🔍 PRODUCTION Raw Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ PRODUCTION test error:', error.message);
});

req.write(postData);
req.end();