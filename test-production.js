// Simple test script to check production server status
const https = require('https');
const http = require('http');

function testLocalServer() {
  console.log('🧪 Testing LOCAL server...');
  
  const postData = JSON.stringify({
    identifier: 'swarjrs@gmail.com',
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
    console.log(`LOCAL Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('LOCAL Response:', JSON.stringify(result, null, 2));
      } catch (e) {
        console.log('LOCAL Raw Response:', data);
      }
      
      // Now test production
      testProductionServer();
    });
  });

  req.on('error', (error) => {
    console.error('LOCAL test error:', error.message);
  });

  req.write(postData);
  req.end();
}

function testProductionServer() {
  console.log('\n🧪 Testing PRODUCTION server...');
  
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
    console.log(`PRODUCTION Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('PRODUCTION Response:', JSON.stringify(result, null, 2));
      } catch (e) {
        console.log('PRODUCTION Raw Response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('PRODUCTION test error:', error.message);
  });

  req.write(postData);
  req.end();
}

testLocalServer();