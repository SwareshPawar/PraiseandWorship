const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

let db;
let songsCollection;
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
    songsCollection = db.collection('PraiseAndWorships');
    isConnected = true;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    throw err;
  }
}

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }
  
  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded;
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
    
    // Extract songId from URL path if present
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const songId = pathParts[3]; // /api/songs/{songId}
    
    if (req.method === 'GET' && !songId) {
      // Get all songs or filtered songs
      const { since } = req.query;
      let query = {};
      if (since) {
        query = {
          $or: [
            { updatedAt: { $gt: since } },
            { createdAt: { $gt: since } }
          ]
        };
      }
      
      const songs = await songsCollection.find(query).toArray();
      return res.json(songs);
    }
    
    if (req.method === 'GET' && songId) {
      // Get individual song
      const song = await songsCollection.findOne({ _id: new ObjectId(songId) });
      if (!song) {
        return res.status(404).json({ error: 'Song not found' });
      }
      return res.json(song);
    }
    
    if (req.method === 'PUT' && songId) {
      // Update individual song (requires authentication)
      const decoded = verifyToken(req);
      const userId = decoded.id;
      
      // Check if user has permission to edit songs (admin or song owner)
      const user = await db.collection('Users').findOne({ _id: new ObjectId(userId) });
      if (!user || !user.isAdmin) {
        // For now, only admins can edit songs. You can modify this logic later.
        return res.status(403).json({ error: 'Admin access required to edit songs' });
      }
      
      const updateData = { ...req.body };
      delete updateData._id; // Don't allow ID changes
      updateData.lastModified = new Date();
      updateData.modifiedBy = userId;
      
      const result = await songsCollection.updateOne(
        { _id: new ObjectId(songId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Song not found' });
      }
      
      return res.json({ message: 'Song updated successfully' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (err) {
    if (err.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in songs endpoint:', err);
    res.status(500).json({ error: err.message });
  }
};