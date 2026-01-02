const https = require('https');

async function testVercelPasswordReset() {
  console.log('🧪 Testing Vercel password reset...');
  
  // Test 1: Health check
  console.log('\n1. Testing Vercel health endpoint:');
  await testHealthEndpoint();
  
  // Test 2: Password reset
  console.log('\n2. Testing password reset via Vercel:');
  await testPasswordResetEndpoint();
}

function testHealthEndpoint() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'praiseand-worship.vercel.app', // Your Vercel domain
      port: 443,
      path: '/api/health',
      method: 'GET',
      headers: {
        'User-Agent': 'Node.js Test Client'
      }
    };

    const req = https.request(options, (res) => {
      console.log(`Health Status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('Health Response:', JSON.stringify(result, null, 2));
        } catch (e) {
          console.log('Health Raw Response:', data);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('Health test error:', error.message);
      resolve();
    });

    req.end();
  });
}

function testPasswordResetEndpoint() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      identifier: 'swarjrs@gmail.com',
      method: 'email'
    });

    const options = {
      hostname: 'praiseand-worship.vercel.app', // Your Vercel domain
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
      console.log(`Password Reset Status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('Password Reset Response:', JSON.stringify(result, null, 2));
          
          if (res.statusCode === 200) {
            console.log('\n✅ SUCCESS! Vercel password reset is working!');
            console.log('🎯 You can now use Vercel instead of Render for password reset');
          } else {
            console.log('\n❌ Issue with password reset. Check response above.');
          }
        } catch (e) {
          console.log('Password Reset Raw Response:', data);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('Password reset test error:', error.message);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

testVercelPasswordReset();