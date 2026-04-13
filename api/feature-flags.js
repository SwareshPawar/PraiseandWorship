const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');

const DEFAULT_FLAGS = {
  loopsEnabled: true,
  lastModified: null
};

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
    const { db } = await connectToDatabase();
    const configCollection = db.collection('config');

    if (req.method === 'GET') {
      const doc = await configCollection.findOne({ _id: 'featureFlags' });
      if (!doc) {
        return res.status(200).json({ ...DEFAULT_FLAGS });
      }

      return res.status(200).json({
        loopsEnabled: doc.loopsEnabled !== false,
        lastModified: doc.lastModified || null,
        updatedBy: doc.updatedBy || null
      });
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

      const loopsEnabled = req.body && req.body.loopsEnabled;
      if (typeof loopsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'loopsEnabled must be a boolean' });
      }

      const payload = {
        _id: 'featureFlags',
        loopsEnabled,
        lastModified: new Date().toISOString(),
        updatedBy: (auth.user && (auth.user.firstName || auth.user.username || auth.user.email)) || 'admin'
      };

      await configCollection.updateOne(
        { _id: 'featureFlags' },
        { $set: payload },
        { upsert: true }
      );

      return res.status(200).json(payload);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Feature flags API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
