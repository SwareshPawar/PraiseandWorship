const http = require('http');

function testPasswordReset() {
  console.log('Testing password reset functionality...');
  
  // Test 1: Forgot password with non-existent user
  console.log('\n1. Testing with non-existent user:');
  
  const postData = JSON.stringify({
    identifier: 'nonexistent@example.com',
    method: 'email'
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/forgot-password',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('Response:', result);
      } catch (e) {
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Request error:', error.message);
  });

  req.write(postData);
  req.end();
}

testPasswordReset();