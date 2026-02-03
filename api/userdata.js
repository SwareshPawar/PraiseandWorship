// Vercel Serverless Function: User Data API
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware } = require('./_auth');

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  const auth = authMiddleware(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { db } = await connectToDatabase();
    const userId = auth.user.id;

    if (req.method === 'GET') {
      const doc = await db.collection('UserData').findOne({ _id: userId });
      return res.status(200).json(doc || { favorites: [], transpose: {} });
    }

    if (req.method === 'PUT') {
      const { favorites, transpose } = req.body;
      const firstName = auth.user.firstName;
      const lastName = auth.user.lastName;
      
      const updateData = {
        favorites: favorites || [],
        transpose: transpose || {},
        firstName,
        lastName,
        lastUpdated: new Date().toISOString()
      };
      
      await db.collection('UserData').updateOne(
        { _id: userId },
        { $set: updateData },
        { upsert: true }
      );
      
      return res.status(200).json({ message: 'User data updated', data: updateData });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('UserData API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
