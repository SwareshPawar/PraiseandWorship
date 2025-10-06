const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    await connectToDatabase();
    
    // Parse URL to extract path segments
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const setlistId = pathParts[3]; // /api/global-setlists/{setlistId}
    const action = pathParts[4]; // add-song, etc.
    
    if (req.method === 'GET' && !setlistId) {
      // Get all global setlists
      const setlists = await db.collection('GlobalSetlists').find({}).toArray();
      return res.json(setlists);
    }
    
    if (req.method === 'GET' && setlistId && setlistId !== 'add-song') {
      // Get individual setlist
      const setlist = await db.collection('GlobalSetlists').findOne({ _id: new ObjectId(setlistId) });
      if (!setlist) {
        return res.status(404).json({ error: 'Setlist not found' });
      }
      return res.json(setlist);
    }
    
    if (req.method === 'POST' && action === 'add-song') {
      // Add song to global setlist
      const decoded = verifyToken(req);
      const { setlistId: targetSetlistId, songId } = req.body;
      
      if (!targetSetlistId || !songId) {
        return res.status(400).json({ error: 'setlistId and songId are required' });
      }
      
      const result = await db.collection('GlobalSetlists').updateOne(
        { _id: new ObjectId(targetSetlistId) },
        { 
          $addToSet: { songs: songId },
          $set: { updatedAt: new Date() }
        }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Setlist not found' });
      }
      
      return res.json({ message: 'Song added to setlist successfully' });
    }
    
    if (req.method === 'PUT' && setlistId) {
      // Update setlist (requires authentication)
      const decoded = verifyToken(req);
      
      const updateData = { ...req.body };
      delete updateData._id;
      updateData.updatedAt = new Date();
      
      const result = await db.collection('GlobalSetlists').updateOne(
        { _id: new ObjectId(setlistId) },
        { $set: updateData }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Setlist not found' });
      }
      
      return res.json({ message: 'Setlist updated successfully' });
    }
    
    if (req.method === 'DELETE' && setlistId) {
      // Delete setlist (requires authentication)
      const decoded = verifyToken(req);
      
      const result = await db.collection('GlobalSetlists').deleteOne({ _id: new ObjectId(setlistId) });
      
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
    console.error('Error in global-setlists endpoint:', err);
    res.status(500).json({ error: err.message });
  }
};