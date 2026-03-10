const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');
const {
  COMPLETE_LOOP_KEYS,
  buildRhythmSetId,
  buildRhythmSetIndexFromMetadata,
  normalizeRhythmFamily,
  normalizeRhythmSetNo,
  parseRhythmSetId,
  readWritableLoopsMetadata,
  writeLoopsMetadata,
  readLoopsMetadataSafe
} = require('./_loops');

function getRouteTail(url, basePath) {
  const pathOnly = String(url || '').split('?')[0];
  if (!pathOnly.startsWith(basePath)) return '';
  return pathOnly.slice(basePath.length).replace(/^\/+/, '');
}

async function recomputeRhythmSetDerivedMetadata(db, rhythmSetId) {
  const songsCollection = db.collection('PraiseAndWorships');
  const rhythmSetsCollection = db.collection('RhythmSets');

  const count = await songsCollection.countDocuments({ rhythmSetId });
  await rhythmSetsCollection.updateOne(
    { rhythmSetId },
    {
      $set: {
        mappedSongCount: count,
        updatedAt: new Date().toISOString()
      },
      $setOnInsert: {
        rhythmSetId,
        createdAt: new Date().toISOString(),
        status: 'active'
      }
    },
    { upsert: true }
  );
}

function updateRhythmSetIdInLoopMetadata(oldRhythmSetId, newRhythmSetId, newRhythmFamily, newRhythmSetNo) {
  const writable = readWritableLoopsMetadata();
  const metadata = writable.metadata;
  let touched = 0;

  metadata.loops = (metadata.loops || []).map(loop => {
    if (String(loop.rhythmSetId || '') !== oldRhythmSetId) return loop;

    touched += 1;
    return {
      ...loop,
      rhythmSetId: newRhythmSetId,
      rhythmFamily: newRhythmFamily,
      rhythmSetNo: newRhythmSetNo,
      conditions: {
        ...(loop.conditions || {}),
        taal: newRhythmFamily
      }
    };
  });

  if (touched > 0) {
    metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
      rhythmSetId: set.rhythmSetId,
      rhythmFamily: set.rhythmFamily,
      rhythmSetNo: set.rhythmSetNo,
      fileCount: set.loopCount
    }));
    writeLoopsMetadata(metadata, writable.metadataPath);
  }

  return touched;
}

function recommendRhythmSetForSong(metadataSets, song) {
  if (!metadataSets.length) return null;

  const preferredFamily = normalizeRhythmFamily(song && (song.rhythmFamily || song.taal || ''));
  if (preferredFamily) {
    const direct = metadataSets.find(set => set.rhythmFamily === preferredFamily);
    if (direct) {
      return {
        rhythmSetId: direct.rhythmSetId,
        rhythmFamily: direct.rhythmFamily,
        rhythmSetNo: direct.rhythmSetNo,
        score: 100,
        reason: 'family-match'
      };
    }
  }

  const fallback = metadataSets[0];
  return {
    rhythmSetId: fallback.rhythmSetId,
    rhythmFamily: fallback.rhythmFamily,
    rhythmSetNo: fallback.rhythmSetNo,
    score: 50,
    reason: 'fallback-first-available'
  };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  try {
    const routeTail = getRouteTail(req.url, '/api/rhythm-sets');

    if (req.method === 'GET' && (!routeTail || routeTail === '')) {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const { metadata } = readLoopsMetadataSafe();
      const metadataSets = buildRhythmSetIndexFromMetadata(metadata);
      const metadataMap = new Map(metadataSets.map(set => [set.rhythmSetId, set]));

      const { db } = await connectToDatabase();
      const rhythmSetsCollection = db.collection('RhythmSets');
      const songsCollection = db.collection('PraiseAndWorships');

      const [dbSets, songCounts] = await Promise.all([
        rhythmSetsCollection.find({}).sort({ rhythmFamily: 1, rhythmSetNo: 1 }).toArray(),
        songsCollection.aggregate([
          { $match: { rhythmSetId: { $exists: true, $nin: [null, ''] } } },
          { $group: { _id: '$rhythmSetId', count: { $sum: 1 } } }
        ]).toArray()
      ]);

      const songCountMap = new Map(songCounts.map(item => [String(item._id), item.count]));

      const merged = dbSets.map(set => {
        const loopSet = metadataMap.get(set.rhythmSetId);
        const fileKeys = loopSet ? Object.keys(loopSet.files || {}) : [];

        return {
          ...set,
          mappedSongCount: songCountMap.get(String(set.rhythmSetId)) || 0,
          availableFiles: fileKeys,
          isComplete: COMPLETE_LOOP_KEYS.every(k => fileKeys.includes(k))
        };
      });

      metadataSets.forEach(loopSet => {
        if (!merged.some(set => set.rhythmSetId === loopSet.rhythmSetId)) {
          const fileKeys = Object.keys(loopSet.files || {});
          merged.push({
            rhythmSetId: loopSet.rhythmSetId,
            rhythmFamily: loopSet.rhythmFamily,
            rhythmSetNo: loopSet.rhythmSetNo,
            status: 'active',
            mappedSongCount: songCountMap.get(String(loopSet.rhythmSetId)) || 0,
            availableFiles: fileKeys,
            isComplete: COMPLETE_LOOP_KEYS.every(k => fileKeys.includes(k)),
            source: 'loops-metadata'
          });
        }
      });

      merged.sort((a, b) => {
        if (a.rhythmFamily !== b.rhythmFamily) {
          return String(a.rhythmFamily || '').localeCompare(String(b.rhythmFamily || ''));
        }
        return (a.rhythmSetNo || 0) - (b.rhythmSetNo || 0);
      });

      return res.status(200).json(merged);
    }

    if (req.method === 'POST' && routeTail === 'recommend') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const { metadata } = readLoopsMetadataSafe();
      const metadataSets = buildRhythmSetIndexFromMetadata(metadata);
      const recommendation = recommendRhythmSetForSong(metadataSets, req.body || {});
      if (!recommendation) {
        return res.status(404).json({ error: 'No rhythm set recommendation available' });
      }

      return res.status(200).json(recommendation);
    }

    const auth = authMiddleware(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const adminCheck = requireAdmin(auth.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    const { db } = await connectToDatabase();
    const rhythmSetsCollection = db.collection('RhythmSets');
    const songsCollection = db.collection('PraiseAndWorships');

    if (req.method === 'POST' && (!routeTail || routeTail === '')) {
      const body = req.body || {};
      const rhythmFamily = normalizeRhythmFamily(body.rhythmFamily || '');
      const rhythmSetNo = normalizeRhythmSetNo(body.rhythmSetNo || body.setNo);
      const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);

      if (!rhythmSetId) {
        return res.status(400).json({ error: 'rhythmFamily and positive rhythmSetNo are required' });
      }

      const existing = await rhythmSetsCollection.findOne({ rhythmSetId });
      if (existing) {
        return res.status(409).json({ error: `Rhythm set ${rhythmSetId} already exists` });
      }

      const now = new Date().toISOString();
      const doc = {
        rhythmSetId,
        rhythmFamily,
        rhythmSetNo,
        status: body.status || 'active',
        notes: body.notes || '',
        createdAt: now,
        updatedAt: now,
        createdBy: auth.user.username || auth.user.email || 'admin',
        updatedBy: auth.user.username || auth.user.email || 'admin'
      };

      await rhythmSetsCollection.insertOne(doc);
      await recomputeRhythmSetDerivedMetadata(db, rhythmSetId);
      return res.status(201).json(doc);
    }

    if (req.method === 'PUT' && routeTail.endsWith('/recompute')) {
      const rhythmSetIdRaw = decodeURIComponent(routeTail.replace(/\/recompute$/, ''));
      const parsed = parseRhythmSetId(rhythmSetIdRaw);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      await recomputeRhythmSetDerivedMetadata(db, parsed.rhythmSetId);
      const updated = await rhythmSetsCollection.findOne({ rhythmSetId: parsed.rhythmSetId });
      return res.status(200).json({ success: true, rhythmSet: updated });
    }

    if (req.method === 'PUT' && routeTail) {
      const oldRhythmSetId = decodeURIComponent(routeTail);
      const parsedOld = parseRhythmSetId(oldRhythmSetId);
      if (!parsedOld) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const body = req.body || {};
      const parsedFromNewId = parseRhythmSetId(body.newRhythmSetId || '');
      const targetFamily = normalizeRhythmFamily(parsedFromNewId ? parsedFromNewId.rhythmFamily : (body.rhythmFamily || parsedOld.rhythmFamily));
      const targetSetNo = normalizeRhythmSetNo(parsedFromNewId ? parsedFromNewId.rhythmSetNo : (body.rhythmSetNo || body.setNo || parsedOld.rhythmSetNo));
      const targetRhythmSetId = buildRhythmSetId(targetFamily, targetSetNo);

      if (!targetRhythmSetId) {
        return res.status(400).json({ error: 'Valid target rhythm set id is required' });
      }

      if (targetRhythmSetId !== parsedOld.rhythmSetId) {
        const conflict = await rhythmSetsCollection.findOne({ rhythmSetId: targetRhythmSetId });
        if (conflict) {
          return res.status(409).json({ error: `Rhythm set ${targetRhythmSetId} already exists` });
        }
      }

      const now = new Date().toISOString();
      await rhythmSetsCollection.updateOne(
        { rhythmSetId: parsedOld.rhythmSetId },
        {
          $set: {
            rhythmSetId: targetRhythmSetId,
            rhythmFamily: targetFamily,
            rhythmSetNo: targetSetNo,
            status: body.status || 'active',
            notes: typeof body.notes === 'string' ? body.notes : '',
            updatedAt: now,
            updatedBy: auth.user.username || auth.user.email || 'admin'
          },
          $setOnInsert: {
            createdAt: now,
            createdBy: auth.user.username || auth.user.email || 'admin'
          }
        },
        { upsert: true }
      );

      if (targetRhythmSetId !== parsedOld.rhythmSetId) {
        await songsCollection.updateMany(
          { rhythmSetId: parsedOld.rhythmSetId },
          {
            $set: {
              rhythmSetId: targetRhythmSetId,
              rhythmFamily: targetFamily,
              rhythmSetNo: targetSetNo,
              updatedAt: now,
              updatedBy: auth.user.username || auth.user.email || 'admin'
            }
          }
        );

        updateRhythmSetIdInLoopMetadata(parsedOld.rhythmSetId, targetRhythmSetId, targetFamily, targetSetNo);
      }

      await recomputeRhythmSetDerivedMetadata(db, targetRhythmSetId);
      if (targetRhythmSetId !== parsedOld.rhythmSetId) {
        await recomputeRhythmSetDerivedMetadata(db, parsedOld.rhythmSetId);
      }

      const updated = await rhythmSetsCollection.findOne({ rhythmSetId: targetRhythmSetId });
      return res.status(200).json({
        ...updated,
        previousRhythmSetId: parsedOld.rhythmSetId,
        renamed: targetRhythmSetId !== parsedOld.rhythmSetId
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Rhythm sets API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
