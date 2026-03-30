require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
let db;
let songsCollection;

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// CORS configuration for Vercel serverless
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:5501',
  'http://localhost:5501',
  'https://oldandnew.onrender.com',
  'https://swareshpawar.github.io/PraiseandWorship/',
  'https://swareshpawar.github.io',
  'https://praiseand-worship.vercel.app',
  'https://praiseand-worship-bznmhyhlc-swareshs-projects.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or matches Vercel pattern
    if (allowedOrigins.includes(origin) || origin.match(/^https:\/\/praiseand-worship-.*\.vercel\.app$/)) {
      return callback(null, true);
    } else {
      return callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Manual CORS handler for OPTIONS requests
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (corsOptions.origin.includes(origin) || corsOptions.origin.some(o => o instanceof RegExp && o.test(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Additional CORS middleware for all requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOptions.origin.includes(origin) || corsOptions.origin.some(o => o instanceof RegExp && o.test(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(express.json());

// Test routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server working', timestamp: new Date().toISOString() });
});

app.get('/api/songs', async (req, res) => {
  try {
    res.json({ message: 'Songs endpoint working', count: 0 });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// For local development - initialize database first
if (process.env.NODE_ENV !== 'production') {
  async function startLocalServer() {
    try {
      const PORT = process.env.PORT || 3001;
      app.listen(PORT, () => console.log(`Debug server running on port ${PORT}`));
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }
  startLocalServer();
}

// Export for Vercel
module.exports = app;