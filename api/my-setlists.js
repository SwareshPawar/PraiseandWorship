// Vercel Serverless Function: My Setlists API
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
      const setlists = await db.collection('MySetlists').find({ userId }).toArray();
      return res.status(200).json(setlists);
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
        userId,
        createdBy: auth.user.firstName || auth.user.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const result = await db.collection('MySetlists').insertOne(setlist);
      const insertedSetlist = await db.collection('MySetlists').findOne({ _id: result.insertedId });
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
      
      const result = await db.collection('MySetlists').updateOne(
        { _id: new ObjectId(id), userId },
        update
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'My setlist not found' });
      }
      
      return res.status(200).json({ message: 'My setlist updated' });
    }

    if (req.method === 'DELETE') {
      const result = await db.collection('MySetlists').deleteOne({
        _id: new ObjectId(id),
        userId
      });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'My setlist not found' });
      }
      
      return res.status(200).json({ message: 'My setlist deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('My Setlists API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
