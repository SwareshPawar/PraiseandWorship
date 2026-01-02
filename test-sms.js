const https = require('https');

console.log('🧪 Testing SMS password reset on production...');

const postData = JSON.stringify({
  identifier: 'swarjrs@gmail.com', // Use email to find user, but request SMS
  method: 'sms'
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
  console.log(`📱 SMS Test Status: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('📱 SMS Response:', JSON.stringify(result, null, 2));
      
      if (res.statusCode === 200) {
        console.log('\n✅ SMS PASSWORD RESET IS WORKING!');
        console.log('🎯 Tell users to use SMS option for password reset in production');
      }
    } catch (e) {
      console.log('📱 SMS Raw Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ SMS test error:', error.message);
});

req.write(postData);
req.end();