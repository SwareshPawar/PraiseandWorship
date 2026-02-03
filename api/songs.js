// Vercel Serverless Function: Songs API
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  try {
    const { db } = await connectToDatabase();
    const songsCollection = db.collection('PraiseAndWorships');

    // GET: Fetch all songs (public)
    if (req.method === 'GET') {
      const { since } = req.query;
      let query = {};
      
      if (since) {
        query = {
          $or: [
            { updatedAt: { $gt: since } },
            { createdAt: { $gt: since } }
          ]
        };
      }
      
      const songs = await songsCollection.find(query).toArray();
      
      // Convert category from lowercase to capitalized
      const formattedSongs = songs.map(song => ({
        ...song,
        category: song.category === 'praise' ? 'Praise' : 
                  song.category === 'worship' ? 'Worship' : 
                  song.category
      }));
      
      return res.status(200).json(formattedSongs);
    }

    // POST: Add new song (requires auth)
    if (req.method === 'POST') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const songData = req.body;
      
      // Generate ID if not provided
      if (typeof songData.id !== 'number') {
        const last = await songsCollection.find().sort({ id: -1 }).limit(1).toArray();
        songData.id = last.length ? last[0].id + 1 : 1;
      }
      
      // Add metadata
      if (!songData.createdBy && auth.user) {
        if (auth.user.firstName) {
          const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
          songData.createdBy = cap(auth.user.firstName);
        } else if (auth.user.username) {
          songData.createdBy = auth.user.username;
        }
      }
      
      if (!songData.createdAt) {
        songData.createdAt = new Date().toISOString();
      }
      
      // Ensure fields exist
      if (!songData.artistDetails) songData.artistDetails = '';
      if (!songData.mood) songData.mood = '';
      
      // Convert category to lowercase for storage
      if (songData.category === 'Praise') {
        songData.category = 'praise';
      } else if (songData.category === 'Worship') {
        songData.category = 'worship';
      }
      
      const result = await songsCollection.insertOne(songData);
      const insertedSong = await songsCollection.findOne({ _id: result.insertedId });
      
      // Convert category back to capitalized
      const formattedSong = {
        ...insertedSong,
        category: insertedSong.category === 'praise' ? 'Praise' : 
                  insertedSong.category === 'worship' ? 'Worship' : 
                  insertedSong.category
      };
      
      return res.status(201).json(formattedSong);
    }

    // PUT: Update song (requires auth)
    if (req.method === 'PUT') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      // Extract ID from URL path
      const pathParts = req.url.split('/');
      const id = pathParts[pathParts.length - 1].split('?')[0];
      
      const updateData = req.body;
      updateData.updatedAt = new Date().toISOString();
      
      if (auth.user && auth.user.firstName) {
        const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
        updateData.updatedBy = cap(auth.user.firstName);
      } else if (auth.user && auth.user.username) {
        const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
        updateData.updatedBy = cap(auth.user.username);
      }
      
      const update = { $set: updateData };
      
      // Try numeric id first
      let result = await songsCollection.updateOne({ id: parseInt(id) }, update);
      let updatedSong = null;
      
      if (result.matchedCount === 0) {
        // Try ObjectId as fallback
        try {
          const { ObjectId } = require('mongodb');
          if (ObjectId.isValid(id)) {
            result = await songsCollection.updateOne({ _id: new ObjectId(id) }, update);
            if (result.matchedCount > 0) {
              updatedSong = await songsCollection.findOne({ _id: new ObjectId(id) });
            }
          }
        } catch (err) {
          console.log('Not a valid ObjectId');
        }
      } else {
        updatedSong = await songsCollection.findOne({ id: parseInt(id) });
      }
      
      if (result.matchedCount === 0 || !updatedSong) {
        return res.status(404).json({ error: 'Song not found' });
      }
      
      return res.status(200).json(updatedSong);
    }

    // DELETE: Remove song (requires admin)
    if (req.method === 'DELETE') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      // Check if deleting all songs or specific song
      const pathParts = req.url.split('/');
      const lastPart = pathParts[pathParts.length - 1].split('?')[0];
      
      // If last part is 'songs', delete all
      if (lastPart === 'songs') {
        await songsCollection.deleteMany({});
        return res.status(200).json({ message: 'All songs deleted' });
      }
      
      // Otherwise delete specific song
      const id = lastPart;
      let result = await songsCollection.deleteOne({ id: parseInt(id) });
      
      if (result.deletedCount === 0) {
        try {
          const { ObjectId } = require('mongodb');
          if (ObjectId.isValid(id)) {
            result = await songsCollection.deleteOne({ _id: new ObjectId(id) });
          }
        } catch (err) {
          console.log('Not a valid ObjectId');
        }
      }
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Song not found' });
      }
      
      return res.status(200).json({ message: 'Song deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Songs API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
