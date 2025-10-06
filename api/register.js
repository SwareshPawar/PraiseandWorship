const { MongoClient, ServerApiVersion } = require('mongodb');
const { registerUser } = require('../utils/auth');

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
    
    let { firstName, lastName, username, email, phone, password, isAdmin } = req.body;
    if (!firstName || !lastName || !username || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    username = username.trim().toLowerCase(); // store username as lowercase
    email = email.trim().toLowerCase();
    // Pass all fields to registerUser
    const user = await registerUser(db, { firstName, lastName, username, email, phone, password, isAdmin });
    res.status(201).json({ message: 'User registered', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};