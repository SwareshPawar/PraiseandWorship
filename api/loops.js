const fs = require('fs');
const path = require('path');
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');
const {
  buildLoopFilename,
  buildLoopId,
  buildRhythmSetId,
  buildRhythmSetIndexFromMetadata,
  decodeBase64Payload,
  isServerlessRuntime,
  normalizeLoopType,
  normalizeRhythmFamily,
  normalizeRhythmSetNo,
  readWritableLoopsMetadata,
  writeLoopsMetadata
} = require('./_loops');

function getRouteTail(url, basePath) {
  const pathOnly = String(url || '').split('?')[0];
  if (!pathOnly.startsWith(basePath)) return '';
  return pathOnly.slice(basePath.length).replace(/^\/+/, '');
}

function upsertLoopEntry(metadata, entry) {
  metadata.loops = Array.isArray(metadata.loops) ? metadata.loops : [];
  metadata.loops = metadata.loops.filter(loop => loop.id !== entry.id);
  metadata.loops.push(entry);
  metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
    rhythmSetId: set.rhythmSetId,
    rhythmFamily: set.rhythmFamily,
    rhythmSetNo: set.rhythmSetNo,
    fileCount: set.loopCount
  }));
}

async function ensureRhythmSetDocument(db, rhythmSetId, rhythmFamily, rhythmSetNo, actor = 'system') {
  if (!db || !rhythmSetId) return;
  try {
    const rhythmSetsCollection = db.collection('RhythmSets');
    const now = new Date().toISOString();
    await rhythmSetsCollection.updateOne(
      { rhythmSetId },
      {
        $setOnInsert: {
          rhythmSetId,
          rhythmFamily,
          rhythmSetNo,
          createdAt: now,
          createdBy: actor,
          status: 'active',
          mappedSongCount: 0
        },
        $set: {
          updatedAt: now,
          updatedBy: actor,
          lastSource: 'loop-upload'
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Error ensuring rhythm set document:', err);
  }
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  try {
    const routeTail = getRouteTail(req.url, '/api/loops');

    // Read-only helper endpoint for debugging manager state.
    if (req.method === 'GET' && (!routeTail || routeTail === 'metadata')) {
      const { metadata } = readWritableLoopsMetadata();
      return res.status(200).json(metadata);
    }

    const auth = authMiddleware(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const adminCheck = requireAdmin(auth.user);
    if (adminCheck) {
      return res.status(adminCheck.status).json({ error: adminCheck.error });
    }

    if (isServerlessRuntime()) {
      return res.status(501).json({
        error: 'Write operations are not supported in serverless runtime',
        message: 'Use local backend for loop file upload/replace/delete operations.'
      });
    }

    const writable = readWritableLoopsMetadata();
    const metadata = writable.metadata;
    const loopsDir = writable.loopsDir;

    if (req.method === 'POST' && routeTail === 'upload-single') {
      const body = req.body || {};
      const rhythmFamily = normalizeRhythmFamily(body.rhythmFamily || body.taal || '');
      const rhythmSetNo = normalizeRhythmSetNo(body.rhythmSetNo || body.setNo || 1);
      const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);
      const type = normalizeLoopType(body.type);
      const number = parseInt(body.number, 10);
      const timeSignature = body.timeSignature || body.time;
      const tempo = body.tempo;
      const genre = body.genre;

      if (!rhythmFamily || !rhythmSetNo || !rhythmSetId || !type || !number || !timeSignature || !tempo || !genre) {
        return res.status(400).json({ error: 'Missing required fields for loop upload' });
      }

      const audioBuffer = decodeBase64Payload(body.base64);
      if (!audioBuffer || !audioBuffer.length) {
        return res.status(400).json({ error: 'Missing or invalid base64 audio payload' });
      }

      const filename = buildLoopFilename({
        taal: rhythmFamily,
        timeSignature,
        tempo,
        genre,
        type,
        number
      });
      const loopId = buildLoopId({
        taal: rhythmFamily,
        timeSignature,
        tempo,
        genre,
        type,
        number
      });

      if (!filename || !loopId) {
        return res.status(400).json({ error: 'Could not derive filename/id from provided metadata' });
      }

      fs.mkdirSync(loopsDir, { recursive: true });
      fs.writeFileSync(path.join(loopsDir, filename), audioBuffer);

      const entry = {
        id: loopId,
        filename,
        type,
        number,
        rhythmFamily,
        rhythmSetNo,
        rhythmSetId,
        conditions: {
          taal: rhythmFamily,
          timeSignature,
          tempo,
          genre
        },
        metadata: {
          duration: 0,
          uploadedAt: new Date().toISOString(),
          uploadedBy: auth.user.username || auth.user.email || 'admin',
          description: body.description || ''
        }
      };

      upsertLoopEntry(metadata, entry);
      writeLoopsMetadata(metadata, writable.metadataPath);

      // Auto-create rhythm set document in database
      try {
        const { db } = await connectToDatabase();
        await ensureRhythmSetDocument(
          db,
          rhythmSetId,
          rhythmFamily,
          rhythmSetNo,
          auth.user.username || auth.user.email || 'admin'
        );
      } catch (dbErr) {
        console.error('Could not auto-create rhythm set document:', dbErr);
      }

      return res.status(200).json({
        success: true,
        id: loopId,
        filename,
        rhythmSetId
      });
    }

    if (req.method === 'PUT' && routeTail.endsWith('/replace')) {
      const loopId = decodeURIComponent(routeTail.replace(/\/replace$/, ''));
      const body = req.body || {};
      const audioBuffer = decodeBase64Payload(body.base64);

      if (!audioBuffer || !audioBuffer.length) {
        return res.status(400).json({ error: 'Missing or invalid base64 audio payload' });
      }

      metadata.loops = Array.isArray(metadata.loops) ? metadata.loops : [];
      const loop = metadata.loops.find(item => item.id === loopId);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }

      fs.mkdirSync(loopsDir, { recursive: true });
      fs.writeFileSync(path.join(loopsDir, loop.filename), audioBuffer);

      loop.metadata = {
        ...(loop.metadata || {}),
        replacedAt: new Date().toISOString(),
        replacedBy: auth.user.username || auth.user.email || 'admin'
      };

      writeLoopsMetadata(metadata, writable.metadataPath);
      return res.status(200).json({ message: 'Loop replaced successfully', filename: loop.filename });
    }

    if (req.method === 'DELETE' && routeTail) {
      const loopId = decodeURIComponent(routeTail);
      metadata.loops = Array.isArray(metadata.loops) ? metadata.loops : [];
      const loop = metadata.loops.find(item => item.id === loopId);
      if (!loop) {
        return res.status(404).json({ error: 'Loop not found' });
      }

      const filePath = path.join(loopsDir, loop.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      metadata.loops = metadata.loops.filter(item => item.id !== loopId);
      metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
        rhythmSetId: set.rhythmSetId,
        rhythmFamily: set.rhythmFamily,
        rhythmSetNo: set.rhythmSetNo,
        fileCount: set.loopCount
      }));

      writeLoopsMetadata(metadata, writable.metadataPath);
      return res.status(200).json({ message: 'Loop deleted', id: loopId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Loops API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
