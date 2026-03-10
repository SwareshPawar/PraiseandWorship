// Vercel Serverless Function: Smart Setlists API
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware } = require('./_auth');
const { ObjectId } = require('mongodb');

function getSetlistIdFromUrl(url) {
  const match = String(url || '').match(/\/api\/smart-setlists\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function buildIdQuery(setlistId) {
  if (!setlistId) return null;
  if (ObjectId.isValid(setlistId)) {
    return { $or: [{ _id: new ObjectId(setlistId) }, { _id: setlistId }] };
  }
  return { _id: setlistId };
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

  const auth = authMiddleware(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const { db } = await connectToDatabase();
    const userId = auth.user.id;
    const username = auth.user.username;
    const isAdmin = auth.user.isAdmin === true;

    if (req.method === 'GET') {
      const smartSetlists = await db.collection('SmartSetlists').find({
        $or: [
          { isAdminCreated: true },
          { createdBy: userId },
          { createdByUsername: username }
        ]
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json(smartSetlists);
    }

    if (req.method === 'POST') {
      const { name, description, conditions, songs } = req.body || {};

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Smart setlist name is required' });
      }

      const smartSetlist = {
        name: String(name).trim(),
        description: description || '',
        conditions: conditions || {},
        songs: songs || [],
        createdAt: new Date().toISOString(),
        createdBy: userId,
        createdByUsername: username,
        isAdminCreated: isAdmin,
        updatedAt: new Date().toISOString()
      };

      const result = await db.collection('SmartSetlists').insertOne(smartSetlist);
      const insertedSetlist = await db.collection('SmartSetlists').findOne({ _id: result.insertedId });
      return res.status(201).json(insertedSetlist);
    }

    const setlistId = getSetlistIdFromUrl(req.url);
    if (!setlistId) {
      return res.status(400).json({ error: 'Smart setlist ID is required' });
    }

    const idQuery = buildIdQuery(setlistId);
    const existingSetlist = await db.collection('SmartSetlists').findOne(idQuery);

    if (!existingSetlist) {
      return res.status(404).json({ error: 'Smart setlist not found' });
    }

    const isOwner = String(existingSetlist.createdBy || '') === String(userId || '')
      || String(existingSetlist.createdByUsername || '') === String(username || '');

    if (req.method === 'PUT') {
      const { name, description, conditions, songs } = req.body || {};

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Smart setlist name is required' });
      }

      const canEdit = isOwner || (isAdmin && existingSetlist.isAdminCreated);
      if (!canEdit) {
        return res.status(403).json({ error: 'You do not have permission to edit this smart setlist' });
      }

      const updateData = {
        name: String(name).trim(),
        description: description || '',
        conditions: conditions || {},
        songs: songs || [],
        updatedAt: new Date().toISOString(),
        updatedBy: auth.user.firstName || username
      };

      await db.collection('SmartSetlists').updateOne(idQuery, { $set: updateData });
      const updatedSetlist = await db.collection('SmartSetlists').findOne(idQuery);
      return res.status(200).json(updatedSetlist);
    }

    if (req.method === 'DELETE') {
      const canDelete = isOwner || (isAdmin && existingSetlist.isAdminCreated);
      if (!canDelete) {
        return res.status(403).json({ error: 'You do not have permission to delete this smart setlist' });
      }

      await db.collection('SmartSetlists').deleteOne(idQuery);
      return res.status(200).json({ success: true, message: 'Smart setlist deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Smart Setlists API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
