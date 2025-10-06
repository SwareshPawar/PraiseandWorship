const { MongoClient, ServerApiVersion } = require('mongodb');
const { verifyToken } = require('../utils/auth');

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

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  next();
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await connectToDatabase();
    
    // Auth middleware inline
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
    const user = payload;

    if (req.method === 'GET') {
      const userId = user.id;
      const doc = await db.collection('UserData').findOne({ _id: userId });
      res.json(doc || { favorites: [], transpose: {} });
    } else if (req.method === 'PUT') {
      const userId = user.id;
      const { favorites, name, email, transpose } = req.body;
      // Always use firstName and lastName from authenticated user
      const firstName = user.firstName;
      const lastName = user.lastName;
      // Update Activitydate for each activity
      const Activitydate = new Date().toISOString();
      await db.collection('UserData').updateOne(
        { _id: userId },
        { $set: { favorites, name, email, transpose, firstName, lastName, Activitydate } },
        { upsert: true }
      );
      res.json({ message: 'User data updated' });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Userdata error:', err);
    res.status(500).json({ error: err.message });
  }
};