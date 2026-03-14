// Vercel Serverless Function: Songs API
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');
const { ObjectId } = require('mongodb');

let songsIdCanonicalizationPromise = null;
let songsIdsCanonicalized = false;
let songsIdIndexPromise = null;

function normalizeSongId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function capitalizeSongCategory(category) {
  if (category === 'praise') return 'Praise';
  if (category === 'worship') return 'Worship';
  return category;
}

function formatSongForClient(song) {
  return {
    ...song,
    id: normalizeSongId(song && song.id),
    category: capitalizeSongCategory(song && song.category)
  };
}

function compareSongCanonicalizationOrder(a, b) {
  const createdAtA = String((a && a.createdAt) || '');
  const createdAtB = String((b && b.createdAt) || '');
  if (createdAtA !== createdAtB) {
    return createdAtA.localeCompare(createdAtB);
  }

  return String((a && a._id) || '').localeCompare(String((b && b._id) || ''));
}

async function ensureUniqueSongIdIndex(songsCollection) {
  if (songsIdIndexPromise) {
    return songsIdIndexPromise;
  }

  songsIdIndexPromise = (async () => {
    const indexes = await songsCollection.indexes();
    const idIndex = indexes.find(index => index && index.key && index.key.id === 1);

    if (idIndex && idIndex.unique === true) {
      return;
    }

    if (idIndex && idIndex.name) {
      await songsCollection.dropIndex(idIndex.name);
    }

    await songsCollection.createIndex(
      { id: 1 },
      { name: 'uniq_song_id', unique: true }
    );
  })().finally(() => {
    songsIdIndexPromise = null;
  });

  return songsIdIndexPromise;
}

async function ensureSongIdCounterAligned(db, maxSongId) {
  const countersCollection = db.collection('Counters');
  const normalizedMax = normalizeSongId(maxSongId) || 0;
  await countersCollection.updateOne(
    { _id: 'songId' },
    {
      $max: { seq: normalizedMax },
      $setOnInsert: { createdAt: new Date().toISOString() }
    },
    { upsert: true }
  );
}

async function reserveNextSongId(db) {
  const countersCollection = db.collection('Counters');
  const result = await countersCollection.findOneAndUpdate(
    { _id: 'songId' },
    {
      $inc: { seq: 1 },
      $setOnInsert: { createdAt: new Date().toISOString() }
    },
    {
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: true
    }
  );

  const resultSeq = normalizeSongId(
    result && (result.value ? result.value.seq : result.seq)
  );
  if (resultSeq) {
    return resultSeq;
  }

  const counterDoc = await countersCollection.findOne({ _id: 'songId' });
  const fallbackSeq = normalizeSongId(counterDoc && counterDoc.seq);
  if (fallbackSeq) {
    return fallbackSeq;
  }

  throw new Error('Failed to reserve next song id');
}

async function ensureSongsUseCanonicalIds(songsCollection, db) {
  if (songsIdsCanonicalized) {
    return;
  }

  if (songsIdCanonicalizationPromise) {
    return songsIdCanonicalizationPromise;
  }

  songsIdCanonicalizationPromise = (async () => {
    const songs = await songsCollection.find({}, { projection: { _id: 1, id: 1, createdAt: 1 } }).toArray();
    songs.sort(compareSongCanonicalizationOrder);

    let maxId = 0;
    const usedIds = new Set();
    const updates = [];

    songs.forEach(song => {
      const normalizedId = normalizeSongId(song && song.id);
      if (normalizedId && !usedIds.has(normalizedId)) {
        usedIds.add(normalizedId);
        if (normalizedId > maxId) {
          maxId = normalizedId;
        }
        return;
      }

      maxId += 1;
      usedIds.add(maxId);
      updates.push({
        updateOne: {
          filter: { _id: song._id },
          update: {
            $set: {
              id: maxId,
              updatedAt: new Date().toISOString(),
              updatedBy: 'system-id-normalizer'
            }
          }
        }
      });
    });

    if (updates.length > 0) {
      await songsCollection.bulkWrite(updates);
      console.warn(`Canonicalized ${updates.length} song(s) to numeric id and resolved duplicates.`);
    }

    await ensureUniqueSongIdIndex(songsCollection);
    await ensureSongIdCounterAligned(db, maxId);

    songsIdsCanonicalized = true;
  })().finally(() => {
    songsIdCanonicalizationPromise = null;
  });

  return songsIdCanonicalizationPromise;
}

async function resolveCanonicalSongByRouteId(routeId, songsCollection, db) {
  const rawId = String(routeId || '').trim();
  const numericId = normalizeSongId(rawId);

  if (numericId) {
    const song = await songsCollection.findOne({ id: numericId });
    return { numericId, song };
  }

  if (!ObjectId.isValid(rawId)) {
    return { numericId: null, song: null };
  }

  const legacySong = await songsCollection.findOne({ _id: new ObjectId(rawId) });
  if (!legacySong) {
    return { numericId: null, song: null };
  }

  let canonicalId = normalizeSongId(legacySong.id);
  if (!canonicalId) {
    canonicalId = await reserveNextSongId(db);
    await songsCollection.updateOne(
      { _id: legacySong._id },
      {
        $set: {
          id: canonicalId,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system-id-normalizer'
        }
      }
    );
  }

  const canonicalSong = await songsCollection.findOne({ id: canonicalId });
  return { numericId: canonicalId, song: canonicalSong || { ...legacySong, id: canonicalId } };
}

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
    const deletedSongsCollection = db.collection('DeletedSongs');
    const pathWithoutQuery = (req.url || '').split('?')[0];
    const pathParts = pathWithoutQuery.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'songs';

    // GET: Fetch all songs (public)
    if (req.method === 'GET') {
      if (lastPart === 'deleted') {
        const { since } = req.query;
        if (!since) {
          return res.status(200).json([]);
        }

        const deletedSongs = await deletedSongsCollection.find({
          deletedAt: { $gt: since }
        }).toArray();

        return res.status(200).json(deletedSongs.map(doc => doc.songId));
      }

      await ensureSongsUseCanonicalIds(songsCollection, db);

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
      const formattedSongs = songs.map(formatSongForClient);
      
      return res.status(200).json(formattedSongs);
    }

    // POST: Add new song (requires auth)
    if (req.method === 'POST') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      await ensureSongsUseCanonicalIds(songsCollection, db);

      const songData = req.body;
      
      const incomingId = normalizeSongId(songData.id);
      if (incomingId) {
        songData.id = incomingId;
        const existingSong = await songsCollection.findOne({ id: incomingId });
        if (existingSong) {
          return res.status(409).json({ error: `Song with ID ${incomingId} already exists` });
        }

        await ensureSongIdCounterAligned(db, incomingId);
      } else {
        songData.id = await reserveNextSongId(db);
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
      
      let result;
      try {
        result = await songsCollection.insertOne(songData);
      } catch (insertError) {
        if (insertError && insertError.code === 11000) {
          return res.status(409).json({ error: 'Song ID already exists' });
        }
        throw insertError;
      }
      const insertedSong = await songsCollection.findOne({ _id: result.insertedId });
      
      const formattedSong = formatSongForClient(insertedSong);
      
      return res.status(201).json(formattedSong);
    }

    // PUT: Update song (requires auth)
    if (req.method === 'PUT') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      await ensureSongsUseCanonicalIds(songsCollection, db);

      const id = lastPart;
      const resolvedSongRef = await resolveCanonicalSongByRouteId(id, songsCollection, db);
      if (!resolvedSongRef.numericId) {
        return res.status(400).json({ error: 'Song ID must be a positive integer' });
      }
      
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
      
      const result = await songsCollection.updateOne({ id: resolvedSongRef.numericId }, update);
      const updatedSong = await songsCollection.findOne({ id: resolvedSongRef.numericId });
      
      if (result.matchedCount === 0 || !updatedSong) {
        return res.status(404).json({ error: 'Song not found' });
      }
      
      return res.status(200).json(formatSongForClient(updatedSong));
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

      // If last part is 'songs', delete all
      if (lastPart === 'songs') {
        await ensureSongsUseCanonicalIds(songsCollection, db);
        const allSongs = await songsCollection.find({}, { projection: { id: 1 } }).toArray();
        await songsCollection.deleteMany({});

        if (allSongs.length > 0) {
          const deletedAt = new Date().toISOString();
          const deletionRecords = allSongs.map(song => ({
            songId: song.id,
            deletedAt
          }));
          await deletedSongsCollection.insertMany(deletionRecords);
        }

        return res.status(200).json({ message: 'All songs deleted' });
      }
      
      // Otherwise delete specific song
      const id = lastPart;
      await ensureSongsUseCanonicalIds(songsCollection, db);
      const resolvedSongRef = await resolveCanonicalSongByRouteId(id, songsCollection, db);
      if (!resolvedSongRef.numericId) {
        return res.status(400).json({ error: 'Song ID must be a positive integer' });
      }

      const songToDelete = resolvedSongRef.song || await songsCollection.findOne({ id: resolvedSongRef.numericId });

      if (!songToDelete) {
        return res.status(404).json({ error: 'Song not found' });
      }

      const result = await songsCollection.deleteOne({ _id: songToDelete._id });
      if (result.deletedCount > 0) {
        await deletedSongsCollection.insertOne({
          songId: resolvedSongRef.numericId,
          deletedAt: new Date().toISOString()
        });
      }
      
      return res.status(200).json({ message: 'Song deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Songs API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
