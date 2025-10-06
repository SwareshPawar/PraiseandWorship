const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Verify token for all operations
    const decoded = verifyToken(req);
    const userId = decoded.id;

    await connectToDatabase();
    
    if (req.method === 'GET') {
      // Get user's setlists
      const setlists = await db.collection('UserSetlists').find({ userId }).toArray();
      return res.json(setlists);
    }
    
    if (req.method === 'POST') {
      // Create new setlist
      const { name, songs, description } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Setlist name is required' });
      }
      
      const newSetlist = {
        userId,
        name: name.trim(),
        songs: songs || [],
        description: description || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('UserSetlists').insertOne(newSetlist);
      return res.json({ ...newSetlist, _id: result.insertedId });
    }
    
    if (req.method === 'PUT') {
      // Update existing setlist
      const { setlistId, name, songs, description } = req.body;
      
      if (!setlistId) {
        return res.status(400).json({ error: 'Setlist ID is required' });
      }
      
      const { ObjectId } = require('mongodb');
      const updateData = {
        updatedAt: new Date()
      };
      
      if (name !== undefined) updateData.name = name.trim();
      if (songs !== undefined) updateData.songs = songs;
      if (description !== undefined) updateData.description = description;
      
      const result = await db.collection('UserSetlists').updateOne(
        { _id: new ObjectId(setlistId), userId },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Setlist not found' });
      }
      
      return res.json({ message: 'Setlist updated successfully' });
    }
    
    if (req.method === 'DELETE') {
      // Delete setlist
      const { setlistId } = req.body;
      
      if (!setlistId) {
        return res.status(400).json({ error: 'Setlist ID is required' });
      }
      
      const { ObjectId } = require('mongodb');
      const result = await db.collection('UserSetlists').deleteOne(
        { _id: new ObjectId(setlistId), userId }
      );
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Setlist not found' });
      }
      
      return res.json({ message: 'Setlist deleted successfully' });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (err) {
    if (err.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in my-setlists endpoint:', err);
    res.status(500).json({ error: err.message });
  }
};