const { MongoClient, ServerApiVersion } = require('mongodb');
const { authenticateUser } = require('../utils/auth');

let db;
let isConnected = false;

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectToDatabase() {
  if (isConnected && db) {
    return;
  }
  
  try {
    await client.connect();
    db = client.db('PraiseAndWorship');
    isConnected = true;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    throw err;
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    console.log('Login attempt - DB status:', !!db);
    if (!db) {
      console.error('Database not connected in login endpoint');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    let { usernameOrEmail, username, password } = req.body;
    if ((!usernameOrEmail && !username) || !password) {
      return res.status(400).json({ error: 'Username/email and password required' });
    }
    let loginInput = (usernameOrEmail || username).trim().toLowerCase();
    const { token, user } = await authenticateUser(db, { loginInput, password });
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: err.message });
  }
};
