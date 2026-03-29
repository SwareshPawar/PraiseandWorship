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

  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = authMiddleware(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { db } = await connectToDatabase();
    const profiles = await db.collection('RhythmSetProfiles')
      .find({})
      .project({ rhythmSetId: 1, totalSongs: 1, updatedAt: 1, lastRecalculatedAt: 1, _id: 0 })
      .sort({ rhythmSetId: 1 })
      .toArray();

    return res.status(200).json(profiles);
  } catch (error) {
    console.error('Rhythm set profiles API error:', error);
    return res.status(500).json({ error: error.message });
  }
};