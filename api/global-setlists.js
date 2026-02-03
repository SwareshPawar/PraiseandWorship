// Vercel Serverless Function: Global Setlists API
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
      const setlists = await db.collection('GlobalSetlists').find({}).toArray();
      return res.status(200).json(setlists);
    }

    const auth = authMiddleware(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const adminCheck = requireAdmin(auth.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    if (req.method === 'POST') {
      const { name, description, songs } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Setlist name is required' });
      }
      
      const setlist = {
        name,
        description: description || '',
        songs: songs || [],
        createdBy: auth.user.firstName || auth.user.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const result = await db.collection('GlobalSetlists').insertOne(setlist);
      const insertedSetlist = await db.collection('GlobalSetlists').findOne({ _id: result.insertedId });
      return res.status(201).json(insertedSetlist);
    }

    const pathParts = req.url.split('/');
    const id = pathParts[pathParts.length - 1].split('?')[0];
    const { ObjectId } = require('mongodb');

    if (req.method === 'PUT') {
      const { name, description, songs } = req.body;
      
      const update = {
        $set: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(songs && { songs }),
          updatedBy: auth.user.firstName || auth.user.username,
          updatedAt: new Date().toISOString()
        }
      };
      
      const result = await db.collection('GlobalSetlists').updateOne(
        { _id: new ObjectId(id) },
        update
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Global setlist not found' });
      }
      
      return res.status(200).json({ message: 'Global setlist updated' });
    }

    if (req.method === 'DELETE') {
      const result = await db.collection('GlobalSetlists').deleteOne({
        _id: new ObjectId(id)
      });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Global setlist not found' });
      }
      
      return res.status(200).json({ message: 'Global setlist deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Global Setlists API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
