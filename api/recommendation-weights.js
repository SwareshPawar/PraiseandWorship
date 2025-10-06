const { MongoClient, ServerApiVersion } = require('mongodb');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const config = await db.collection('config').findOne({ _id: 'weights' });
    if (!config) {
      // Default if not set
      return res.json({
        language: 10,
        scale: 18,
        timeSignature: 18,
        taal: 18,
        tempo: 5,
        genre: 13,
        vocal: 8,
        mood: 10,
        lastModified: null
      });
    }
    // Remove _id for frontend, include lastModified
    const { _id, ...weights } = config;
    res.json(weights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};