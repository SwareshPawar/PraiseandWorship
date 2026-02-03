// Vercel Serverless Function: Users API (Admin only)
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).json({});
  }

  const corsHeaders = getCorsHeaders();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const auth = authMiddleware(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const adminCheck = requireAdmin(auth.user);
  if (adminCheck) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  try {
    const { db } = await connectToDatabase();

    if (req.method === 'GET') {
      const users = await db.collection('Users')
        .find({})
        .project({ password: 0 })
        .toArray();
      
      return res.status(200).json(users);
    }

    if (req.method === 'PUT') {
      const pathParts = req.url.split('/');
      const userId = pathParts[pathParts.length - 1].split('?')[0];
      const { isAdmin } = req.body;

      const { ObjectId } = require('mongodb');
      const result = await db.collection('Users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { isAdmin: !!isAdmin } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({ message: 'User updated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Users API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
