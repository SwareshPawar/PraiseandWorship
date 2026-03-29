const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');

const DEFAULT_WEIGHTS = {
  mood: 22,
  genre: 18,
  taal: 18,
  rhythmCategory: 10,
  bpm: 18,
  timeSignature: 14
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateWeights(weights) {
  if (!weights || typeof weights !== 'object') {
    return 'weights object is required';
  }

  const requiredKeys = Object.keys(DEFAULT_WEIGHTS);
  const missingKey = requiredKeys.find(key => !Object.prototype.hasOwnProperty.call(weights, key));
  if (missingKey) {
    return `Missing required weight: ${missingKey}`;
  }

  const invalidKey = requiredKeys.find(key => !isFiniteNumber(weights[key]));
  if (invalidKey) {
    return `Weight ${invalidKey} must be a number`;
  }

  const total = requiredKeys.reduce((sum, key) => sum + Number(weights[key]), 0);
  if (Math.abs(total - 100) > 1) {
    return `Weights should sum to approximately 100 (current sum: ${total})`;
  }

  return null;
}

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
    const auth = authMiddleware(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { db } = await connectToDatabase();
    const configCollection = db.collection('ProfileScoringConfig');

    if (req.method === 'GET') {
      const config = await configCollection.findOne({ _id: 'default' });
      if (!config) {
        return res.status(200).json({ _id: 'default', weights: DEFAULT_WEIGHTS });
      }

      return res.status(200).json(config);
    }

    if (req.method === 'PUT') {
      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const validationError = validateWeights(req.body && req.body.weights);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const actor = (auth.user && (auth.user.firstName || auth.user.username || auth.user.email)) || 'admin';
      const config = {
        _id: 'default',
        weights: {
          mood: Number(req.body.weights.mood),
          genre: Number(req.body.weights.genre),
          taal: Number(req.body.weights.taal),
          rhythmCategory: Number(req.body.weights.rhythmCategory),
          bpm: Number(req.body.weights.bpm),
          timeSignature: Number(req.body.weights.timeSignature)
        },
        updatedAt: new Date().toISOString(),
        updatedBy: actor
      };

      await configCollection.updateOne(
        { _id: 'default' },
        { $set: config },
        { upsert: true }
      );

      return res.status(200).json(config);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Profile scoring config API error:', error);
    return res.status(500).json({ error: error.message });
  }
};