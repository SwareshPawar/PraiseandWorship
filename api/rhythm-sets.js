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
const { updateRhythmSetProfile } = require('../utils/rhythm-set-profile-manager');

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
    try {
      writeLoopsMetadata(metadata, writable.metadataPath);
    } catch (error) {
      // Vercel serverless filesystem is read-only (/var/task). Keep DB rename successful.
      if (error && (error.code === 'EROFS' || error.code === 'ENOTSUP')) {
        return {
          touched,
          persisted: false,
          warning: 'loops-metadata is read-only in this runtime; DB rename succeeded, metadata file update skipped.'
        };
      }
      throw error;
    }
  }

  return {
    touched,
    persisted: true,
    warning: null
  };
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

function parseLoopSlotKey(loopTypeValue) {
  const match = String(loopTypeValue || '').trim().toLowerCase().match(/^(loop|fill)([1-3])$/);
  if (!match) return null;
  return {
    key: `${match[1]}${match[2]}`,
    type: match[1],
    number: Number(match[2])
  };
}

function syncRhythmSetsFromMetadata(metadata) {
  metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
    rhythmSetId: set.rhythmSetId,
    rhythmFamily: set.rhythmFamily,
    rhythmSetNo: set.rhythmSetNo,
    fileCount: set.loopCount
  }));
}

function findLoopIndexBySlot(metadata, rhythmSetId, slotKey) {
  const loops = Array.isArray(metadata && metadata.loops) ? metadata.loops : [];
  for (let i = loops.length - 1; i >= 0; i -= 1) {
    const loop = loops[i] || {};
    const sameSet = String(loop.rhythmSetId || '') === String(rhythmSetId || '');
    const sameSlot = `${String(loop.type || '').toLowerCase()}${Number(loop.number || 0)}` === slotKey;
    if (sameSet && sameSlot) {
      return i;
    }
  }
  return -1;
}

function buildLoopFromTemplate(templateLoop, targetRhythmSetId, targetRhythmFamily, targetRhythmSetNo, slotInfo) {
  const base = templateLoop && typeof templateLoop === 'object' ? templateLoop : {};
  return {
    ...base,
    id: `${targetRhythmSetId}_${slotInfo.key}`,
    type: slotInfo.type,
    number: slotInfo.number,
    rhythmSetId: targetRhythmSetId,
    rhythmFamily: targetRhythmFamily,
    rhythmSetNo: targetRhythmSetNo,
    conditions: {
      ...(base.conditions || {}),
      taal: targetRhythmFamily
    },
    files: {
      [slotInfo.key]: base.filename || ''
    },
    metadata: {
      ...(base.metadata || {}),
      updatedAt: new Date().toISOString()
    }
  };
}

function normalizeStatusInput(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isReadOnlyFsError(error) {
  return Boolean(error && (error.code === 'EROFS' || error.code === 'ENOTSUP'));
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
        const metadataFiles = loopSet && loopSet.files && typeof loopSet.files === 'object' ? loopSet.files : {};
        const dbFiles = set && set.files && typeof set.files === 'object' ? set.files : {};
        const effectiveFiles = {
          ...metadataFiles,
          ...dbFiles
        };
        const fileKeys = Object.keys(effectiveFiles).filter(key => Boolean(effectiveFiles[key]));

        return {
          ...set,
          files: effectiveFiles,
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

    if (req.method === 'POST' && routeTail === 'duplicate') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const body = req.body || {};
      const sourceRhythmSetId = String(body.sourceRhythmSetId || '').trim();
      const parsedTarget = parseRhythmSetId(String(body.newRhythmSetId || '').trim());

      if (!sourceRhythmSetId || !parsedTarget) {
        return res.status(400).json({ error: 'sourceRhythmSetId and valid newRhythmSetId are required' });
      }

      const { db } = await connectToDatabase();
      const rhythmSetsCollection = db.collection('RhythmSets');
      const existingTarget = await rhythmSetsCollection.findOne({ rhythmSetId: parsedTarget.rhythmSetId });
      if (existingTarget) {
        return res.status(409).json({ error: `Rhythm set ${parsedTarget.rhythmSetId} already exists` });
      }

      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      const sourceLoops = (metadata.loops || []).filter(loop => String(loop.rhythmSetId || '') === sourceRhythmSetId);
      if (!sourceLoops.length) {
        return res.status(404).json({ error: `Source rhythm set ${sourceRhythmSetId} has no loops to duplicate` });
      }

      const copied = sourceLoops.map(loop => ({
        ...loop,
        id: `${parsedTarget.rhythmSetId}_${String(loop.type || '').toLowerCase()}${Number(loop.number || 0)}`,
        rhythmSetId: parsedTarget.rhythmSetId,
        rhythmFamily: parsedTarget.rhythmFamily,
        rhythmSetNo: parsedTarget.rhythmSetNo,
        conditions: {
          ...(loop.conditions || {}),
          taal: parsedTarget.rhythmFamily
        },
        metadata: {
          ...(loop.metadata || {}),
          updatedAt: new Date().toISOString(),
          clonedFrom: sourceRhythmSetId
        }
      }));

      metadata.loops = [...(metadata.loops || []), ...copied];
      syncRhythmSetsFromMetadata(metadata);
      writeLoopsMetadata(metadata, writable.metadataPath);

      const now = new Date().toISOString();
      const sourceSet = await rhythmSetsCollection.findOne({ rhythmSetId: sourceRhythmSetId });
      const createdDoc = {
        rhythmSetId: parsedTarget.rhythmSetId,
        rhythmFamily: parsedTarget.rhythmFamily,
        rhythmSetNo: parsedTarget.rhythmSetNo,
        status: sourceSet && sourceSet.status ? sourceSet.status : 'active',
        notes: sourceSet && typeof sourceSet.notes === 'string' ? sourceSet.notes : '',
        createdAt: now,
        updatedAt: now,
        createdBy: auth.user.username || auth.user.email || 'admin',
        updatedBy: auth.user.username || auth.user.email || 'admin'
      };

      await rhythmSetsCollection.insertOne(createdDoc);
      await recomputeRhythmSetDerivedMetadata(db, parsedTarget.rhythmSetId);

      return res.status(201).json({
        success: true,
        rhythmSetId: parsedTarget.rhythmSetId,
        loopsCopied: copied.length
      });
    }

    if (req.method === 'POST' && routeTail === 'loops/swap') {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const body = req.body || {};
      const slot1 = body.slot1 || {};
      const slot2 = body.slot2 || {};
      const slot1Info = parseLoopSlotKey(slot1.loopType);
      const slot2Info = parseLoopSlotKey(slot2.loopType);

      if (!slot1.rhythmSetId || !slot2.rhythmSetId || !slot1Info || !slot2Info) {
        return res.status(400).json({ error: 'slot1 and slot2 with rhythmSetId + valid loopType are required' });
      }

      const sameSlot = String(slot1.rhythmSetId) === String(slot2.rhythmSetId)
        && slot1Info.key === slot2Info.key;
      if (sameSlot) {
        return res.status(400).json({ error: 'Cannot swap a slot with itself' });
      }

      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      const index1 = findLoopIndexBySlot(metadata, slot1.rhythmSetId, slot1Info.key);
      const index2 = findLoopIndexBySlot(metadata, slot2.rhythmSetId, slot2Info.key);

      if (index1 < 0 || index2 < 0) {
        return res.status(404).json({ error: 'One or both loop slots were not found' });
      }

      const filename1 = metadata.loops[index1].filename;
      const filename2 = metadata.loops[index2].filename;
      metadata.loops[index1].filename = filename2;
      metadata.loops[index1].files = { [slot1Info.key]: filename2 };
      metadata.loops[index2].filename = filename1;
      metadata.loops[index2].files = { [slot2Info.key]: filename1 };

      const slot1Match = (loop) => String(loop && loop.rhythmSetId || '') === String(slot1.rhythmSetId) &&
        `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}` === slot1Info.key;
      const slot2Match = (loop) => String(loop && loop.rhythmSetId || '') === String(slot2.rhythmSetId) &&
        `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}` === slot2Info.key;

      const updatedSlot1Loop = { ...metadata.loops[index1] };
      const updatedSlot2Loop = { ...metadata.loops[index2] };

      metadata.loops = (metadata.loops || []).filter(loop => !slot1Match(loop) && !slot2Match(loop));
      metadata.loops.push(updatedSlot1Loop, updatedSlot2Loop);

      syncRhythmSetsFromMetadata(metadata);
      writeLoopsMetadata(metadata, writable.metadataPath);

      return res.status(200).json({ success: true, message: 'Loop slots swapped successfully' });
    }

    if (req.method === 'POST' && /\/loops\/assign$/.test(routeTail)) {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const rhythmSetId = decodeURIComponent(routeTail.replace(/\/loops\/assign$/, ''));
      const parsedSet = parseRhythmSetId(rhythmSetId);
      if (!parsedSet) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const body = req.body || {};
      const slotInfo = parseLoopSlotKey(body.loopType);
      const filename = String(body.filename || '').trim();
      if (!slotInfo || !filename) {
        return res.status(400).json({ error: 'loopType and filename are required' });
      }

      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      const template = (metadata.loops || []).find(loop => String(loop.filename || '') === filename);
      const targetIndex = findLoopIndexBySlot(metadata, parsedSet.rhythmSetId, slotInfo.key);
      const targetExisting = targetIndex >= 0 ? metadata.loops[targetIndex] : null;
      const base = targetExisting || template || {};
      const now = new Date().toISOString();
      const actor = auth.user.username || auth.user.email || 'admin';
      const assignedLoop = {
        ...base,
        id: `${parsedSet.rhythmSetId}_${slotInfo.key}`,
        type: slotInfo.type,
        number: slotInfo.number,
        rhythmSetId: parsedSet.rhythmSetId,
        rhythmFamily: parsedSet.rhythmFamily,
        rhythmSetNo: parsedSet.rhythmSetNo,
        filename,
        files: { [slotInfo.key]: filename },
        conditions: {
          ...(base.conditions || {}),
          taal: parsedSet.rhythmFamily
        },
        metadata: {
          ...(base.metadata || {}),
          updatedAt: now,
          assignedBy: actor
        }
      };

      const { db } = await connectToDatabase();
      const rhythmSetsCollection = db.collection('RhythmSets');
      await rhythmSetsCollection.updateOne(
        { rhythmSetId: parsedSet.rhythmSetId },
        {
          $setOnInsert: {
            rhythmSetId: parsedSet.rhythmSetId,
            rhythmFamily: parsedSet.rhythmFamily,
            rhythmSetNo: parsedSet.rhythmSetNo,
            createdAt: now,
            createdBy: actor,
            status: 'active',
            mappedSongCount: 0
          },
          $set: {
            [`files.${slotInfo.key}`]: filename,
            updatedAt: now,
            updatedBy: actor
          }
        },
        { upsert: true }
      );

      const slotMatches = (loop) => String(loop && loop.rhythmSetId || '') === String(parsedSet.rhythmSetId) &&
        `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}` === slotInfo.key;
      metadata.loops = (metadata.loops || []).filter(loop => !slotMatches(loop));
      metadata.loops.push(assignedLoop);

      syncRhythmSetsFromMetadata(metadata);
      let loopsMetadataPersisted = true;
      let loopsMetadataWarning = null;
      try {
        writeLoopsMetadata(metadata, writable.metadataPath);
      } catch (error) {
        if (isReadOnlyFsError(error)) {
          loopsMetadataPersisted = false;
          loopsMetadataWarning = 'loops-metadata is read-only in this runtime; assignment was saved in DB files mapping only.';
        } else {
          throw error;
        }
      }

      return res.status(200).json({
        success: true,
        message: `${slotInfo.key} assigned successfully`,
        loopsMetadataPersisted,
        loopsMetadataWarning
      });
    }

    if (req.method === 'GET' && /\/profile$/.test(routeTail)) {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const rhythmSetId = decodeURIComponent(routeTail.replace(/\/profile$/, ''));
      const parsedSet = parseRhythmSetId(rhythmSetId);
      if (!parsedSet) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const { db } = await connectToDatabase();
      const profile = await db.collection('RhythmSetProfiles').findOne({ rhythmSetId: parsedSet.rhythmSetId });

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found for this rhythm set' });
      }

      return res.status(200).json(profile);
    }

    if (req.method === 'POST' && /\/profile\/recalculate$/.test(routeTail)) {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const rhythmSetId = decodeURIComponent(routeTail.replace(/\/profile\/recalculate$/, ''));
      const parsedSet = parseRhythmSetId(rhythmSetId);
      if (!parsedSet) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const { db } = await connectToDatabase();
      const profilesCollection = db.collection('RhythmSetProfiles');
      const songsCollection = db.collection('PraiseAndWorships');

      await updateRhythmSetProfile(
        profilesCollection,
        songsCollection,
        parsedSet.rhythmSetId,
        true
      );

      const updated = await profilesCollection.findOne({ rhythmSetId: parsedSet.rhythmSetId });
      return res.status(200).json(updated || { rhythmSetId: parsedSet.rhythmSetId, totalSongs: 0 });
    }

    if (req.method === 'POST' && /\/loops\/copy$/.test(routeTail)) {
      const auth = authMiddleware(req);
      if (auth.error) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const adminCheck = requireAdmin(auth.user);
      if (adminCheck) {
        return res.status(adminCheck.status).json({ error: adminCheck.error });
      }

      const rhythmSetId = decodeURIComponent(routeTail.replace(/\/loops\/copy$/, ''));
      const parsedSet = parseRhythmSetId(rhythmSetId);
      if (!parsedSet) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const body = req.body || {};
      const targetSlot = parseLoopSlotKey(body.targetLoopType);
      const sourceFilename = String(body.sourceFilename || '').trim();
      if (!targetSlot || !sourceFilename) {
        return res.status(400).json({ error: 'sourceFilename and valid targetLoopType are required' });
      }

      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      const template = (metadata.loops || []).find(loop => String(loop.filename || '') === sourceFilename);
      if (!template) {
        return res.status(404).json({ error: `Source loop file ${sourceFilename} not found in metadata` });
      }

      const targetIndex = findLoopIndexBySlot(metadata, parsedSet.rhythmSetId, targetSlot.key);
      const replacedLoop = targetIndex >= 0 ? metadata.loops[targetIndex] : null;
      const copiedLoop = buildLoopFromTemplate(
        template,
        parsedSet.rhythmSetId,
        parsedSet.rhythmFamily,
        parsedSet.rhythmSetNo,
        targetSlot
      );
      copiedLoop.filename = sourceFilename;
      copiedLoop.files = { [targetSlot.key]: sourceFilename };

      if (targetIndex >= 0) {
        metadata.loops[targetIndex] = {
          ...metadata.loops[targetIndex],
          ...copiedLoop
        };
      } else {
        metadata.loops.push(copiedLoop);
      }

      syncRhythmSetsFromMetadata(metadata);
      writeLoopsMetadata(metadata, writable.metadataPath);

      return res.status(200).json({
        success: true,
        message: `Loop copied to ${targetSlot.key} successfully`,
        sourceFilename,
        targetLoopType: targetSlot.key,
        replacedLoop: replacedLoop && replacedLoop.filename ? replacedLoop.filename : null
      });
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

    if (req.method === 'DELETE' && /\/loops\//.test(routeTail)) {
      const loopMatch = routeTail.match(/^(.+)\/loops\/(loop[1-3]|fill[1-3])$/i);
      if (!loopMatch) {
        return res.status(400).json({ error: 'Invalid loop slot route' });
      }

      const rhythmSetId = decodeURIComponent(loopMatch[1]);
      const parsed = parseRhythmSetId(rhythmSetId);
      const slotInfo = parseLoopSlotKey(loopMatch[2]);
      if (!parsed || !slotInfo) {
        return res.status(400).json({ error: 'Invalid rhythmSetId or loop slot' });
      }

      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      const index = findLoopIndexBySlot(metadata, parsed.rhythmSetId, slotInfo.key);

      if (index < 0) {
        return res.status(404).json({ error: `${slotInfo.key} not found for ${parsed.rhythmSetId}` });
      }

      const removed = metadata.loops.splice(index, 1)[0];
      syncRhythmSetsFromMetadata(metadata);
      writeLoopsMetadata(metadata, writable.metadataPath);

      return res.status(200).json({
        success: true,
        message: `${slotInfo.key} removed from ${parsed.rhythmSetId}`,
        removedFilename: removed && removed.filename ? removed.filename : null
      });
    }

    if (req.method === 'DELETE' && routeTail.endsWith('/force')) {
      const rhythmSetId = decodeURIComponent(routeTail.replace(/\/force$/, ''));
      const parsed = parseRhythmSetId(rhythmSetId);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const now = new Date().toISOString();
      await songsCollection.updateMany(
        { rhythmSetId: parsed.rhythmSetId },
        {
          $set: {
            updatedAt: now,
            updatedBy: auth.user.username || auth.user.email || 'admin'
          },
          $unset: {
            rhythmSetId: '',
            rhythmFamily: '',
            rhythmSetNo: ''
          }
        }
      );

      await rhythmSetsCollection.deleteOne({ rhythmSetId: parsed.rhythmSetId });

      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      metadata.loops = (metadata.loops || []).filter(loop => String(loop.rhythmSetId || '') !== parsed.rhythmSetId);
      syncRhythmSetsFromMetadata(metadata);
      writeLoopsMetadata(metadata, writable.metadataPath);

      return res.status(200).json({ success: true, message: `Force deleted ${parsed.rhythmSetId}` });
    }

    if (req.method === 'DELETE' && routeTail) {
      const parsed = parseRhythmSetId(decodeURIComponent(routeTail));
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      const mappedSongs = await songsCollection.find(
        { rhythmSetId: parsed.rhythmSetId },
        { projection: { _id: 0, id: 1, title: 1 } }
      ).toArray();

      if (mappedSongs.length > 0) {
        return res.status(409).json({
          error: `Rhythm set ${parsed.rhythmSetId} has mapped songs`,
          mappedSongsCount: mappedSongs.length,
          mappedSongs
        });
      }

      await rhythmSetsCollection.deleteOne({ rhythmSetId: parsed.rhythmSetId });
      const writable = readWritableLoopsMetadata();
      const metadata = writable.metadata;
      metadata.loops = (metadata.loops || []).filter(loop => String(loop.rhythmSetId || '') !== parsed.rhythmSetId);
      syncRhythmSetsFromMetadata(metadata);
      writeLoopsMetadata(metadata, writable.metadataPath);

      return res.status(200).json({ success: true, message: `Deleted ${parsed.rhythmSetId}` });
    }

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

      const existing = await rhythmSetsCollection.findOne({ rhythmSetId: parsedOld.rhythmSetId });

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
      let updatedSongsCount = 0;
      let loopsMetadataUpdate = { touched: 0, persisted: true, warning: null };

      const statusToPersist = normalizeStatusInput(body.status) || (existing && existing.status) || 'active';
      const notesToPersist = typeof body.notes === 'string'
        ? body.notes
        : (existing && typeof existing.notes === 'string' ? existing.notes : '');

      await rhythmSetsCollection.updateOne(
        { rhythmSetId: parsedOld.rhythmSetId },
        {
          $set: {
            rhythmSetId: targetRhythmSetId,
            rhythmFamily: targetFamily,
            rhythmSetNo: targetSetNo,
            status: statusToPersist,
            notes: notesToPersist,
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
        const songUpdateResult = await songsCollection.updateMany(
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
        updatedSongsCount = Number(songUpdateResult && songUpdateResult.modifiedCount) || 0;

        loopsMetadataUpdate = updateRhythmSetIdInLoopMetadata(
          parsedOld.rhythmSetId,
          targetRhythmSetId,
          targetFamily,
          targetSetNo
        );
      }

      await recomputeRhythmSetDerivedMetadata(db, targetRhythmSetId);
      if (targetRhythmSetId !== parsedOld.rhythmSetId) {
        await recomputeRhythmSetDerivedMetadata(db, parsedOld.rhythmSetId);
      }

      const updated = await rhythmSetsCollection.findOne({ rhythmSetId: targetRhythmSetId });
      return res.status(200).json({
        ...updated,
        previousRhythmSetId: parsedOld.rhythmSetId,
        renamed: targetRhythmSetId !== parsedOld.rhythmSetId,
        updatedSongsCount,
        updatedLoopsCount: Number(loopsMetadataUpdate && loopsMetadataUpdate.touched) || 0,
        loopsMetadataPersisted: Boolean(loopsMetadataUpdate && loopsMetadataUpdate.persisted),
        loopsMetadataWarning: loopsMetadataUpdate && loopsMetadataUpdate.warning ? loopsMetadataUpdate.warning : null
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Rhythm sets API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
