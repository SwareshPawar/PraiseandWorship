// Vercel Serverless Function: Recommendation Weights API
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

  try {
    const { db } = await connectToDatabase();

    if (req.method === 'GET') {
      let weights = await db.collection('RecommendationWeights').findOne({ _id: 'global' });
      
      if (!weights) {
        weights = {
          key: 1.5,
          category: 2.0,
          genre: 1.8,
          mood: 1.6,
          artist: 1.4,
          vocal: 1.2,
          tempo: 1.0
        };
      }
      
      return res.status(200).json(weights);
    }

    if (req.method === 'PUT') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const weights = req.body;
      
      await db.collection('RecommendationWeights').updateOne(
        { _id: 'global' },
        { $set: weights },
        { upsert: true }
      );
      
      return res.status(200).json({ message: 'Weights updated', weights });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Recommendation Weights API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
