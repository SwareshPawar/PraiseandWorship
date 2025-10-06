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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Verify token for all operations
    const decoded = verifyToken(req);
    const currentUserId = decoded.id;

    await connectToDatabase();
    
    // Extract userId from URL path if present
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const userId = pathParts[3]; // /api/users/{userId}/...
    const action = pathParts[4]; // admin, etc.
    
    if (req.method === 'GET' && !userId) {
      // Get all users (admin only)
      const currentUser = await db.collection('Users').findOne({ _id: new ObjectId(currentUserId) });
      if (!currentUser || !currentUser.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const users = await db.collection('Users').find({}, {
        projection: { password: 0 } // Exclude password field
      }).toArray();
      
      return res.json(users);
    }
    
    if (req.method === 'PUT' && userId && action === 'admin') {
      // Toggle admin status for a user
      const currentUser = await db.collection('Users').findOne({ _id: new ObjectId(currentUserId) });
      if (!currentUser || !currentUser.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      const { isAdmin } = req.body;
      
      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'isAdmin must be a boolean value' });
      }
      
      const result = await db.collection('Users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { isAdmin, updatedAt: new Date() } }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      return res.json({ message: `User admin status updated to ${isAdmin}` });
    }
    
    return res.status(404).json({ error: 'Endpoint not found' });
    
  } catch (err) {
    if (err.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('Error in users endpoint:', err);
    res.status(500).json({ error: err.message });
  }
};