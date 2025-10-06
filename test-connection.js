const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for all origins during testing
app.use(cors());
app.use(express.json());

// Simple test endpoint
app.get('/test', (req, res) => {
  console.log('Test endpoint hit!');
  res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

app.get('/api/global-setlists', (req, res) => {
  console.log('Global setlists endpoint hit!');
  res.json([]);
});

const PORT = 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Server address: ${JSON.stringify(server.address())}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

// Test that the server is actually accessible
setTimeout(() => {
  console.log('Testing server accessibility...');
  const http = require('http');
  const req = http.request({ hostname: 'localhost', port: PORT, path: '/test' }, (res) => {
    console.log('Self-test successful:', res.statusCode);
    res.on('data', (chunk) => {
      console.log('Response:', chunk.toString());
    });
  });
  req.on('error', (err) => {
    console.error('Self-test failed:', err.message);
  });
  req.end();
}, 1000);