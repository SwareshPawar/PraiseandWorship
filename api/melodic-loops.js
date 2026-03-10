const fs = require('fs');
const path = require('path');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');
const {
  decodeBase64Payload,
  findExistingMelodicFile,
  getWritableLoopsLocation,
  isServerlessRuntime,
  listMelodicLoops,
  normalizeBaseNote,
  readLoopsMetadataSafe
} = require('./_loops');

function getRouteTail(url, basePath) {
  const pathOnly = String(url || '').split('?')[0];
  if (!pathOnly.startsWith(basePath)) return '';
  return pathOnly.slice(basePath.length).replace(/^\/+/, '');
}

function parseMelodicId(value) {
  const decoded = decodeURIComponent(String(value || ''));
  const match = decoded.match(/^(atmosphere|tanpura)_(.+)$/i);
  if (!match) return null;

  const type = match[1].toLowerCase();
  const normalizedKey = normalizeBaseNote(match[2]);
  if (!normalizedKey) return null;

  return {
    id: `${type}_${normalizedKey}`,
    type,
    key: normalizedKey
  };
}

function getMelodicPath(loopsDir, type, key) {
  const folder = path.join(loopsDir, 'melodies', type);
  const filename = `${type}_${key}.wav`;
  return {
    folder,
    filename,
    fullPath: path.join(folder, filename)
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
    const routeTail = getRouteTail(req.url, '/api/melodic-loops');

    if (req.method === 'GET' && (!routeTail || routeTail === '')) {
      const { loopsDir } = readLoopsMetadataSafe();
      const result = listMelodicLoops(loopsDir);
      return res.status(200).json(result);
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
        message: 'Use local backend for melodic loop upload/replace/delete operations.'
      });
    }

    const { loopsDir } = getWritableLoopsLocation();

    if (req.method === 'POST' && routeTail === 'upload') {
      const body = req.body || {};
      const type = String(body.type || '').toLowerCase();
      const key = normalizeBaseNote(body.key);
      const audioBuffer = decodeBase64Payload(body.base64);

      if (!['atmosphere', 'tanpura'].includes(type) || !key || !audioBuffer || !audioBuffer.length) {
        return res.status(400).json({ error: 'type, key, and base64 are required' });
      }

      const existing = findExistingMelodicFile(loopsDir, type, key);
      const target = getMelodicPath(loopsDir, type, key);

      fs.mkdirSync(target.folder, { recursive: true });
      fs.writeFileSync(target.fullPath, audioBuffer);

      if (existing && existing.filename !== target.filename && fs.existsSync(existing.fullPath)) {
        fs.unlinkSync(existing.fullPath);
      }

      return res.status(200).json({
        message: 'Melodic loop uploaded',
        id: `${type}_${key}`,
        filename: target.filename
      });
    }

    if (req.method === 'PUT' && routeTail.endsWith('/replace')) {
      const idValue = routeTail.replace(/\/replace$/, '');
      const parsedId = parseMelodicId(idValue);
      const body = req.body || {};
      const audioBuffer = decodeBase64Payload(body.base64);

      if (!parsedId || !audioBuffer || !audioBuffer.length) {
        return res.status(400).json({ error: 'Valid id and base64 are required' });
      }

      const existing = findExistingMelodicFile(loopsDir, parsedId.type, parsedId.key);
      const target = getMelodicPath(loopsDir, parsedId.type, parsedId.key);

      fs.mkdirSync(target.folder, { recursive: true });
      fs.writeFileSync(target.fullPath, audioBuffer);

      if (existing && existing.filename !== target.filename && fs.existsSync(existing.fullPath)) {
        fs.unlinkSync(existing.fullPath);
      }

      return res.status(200).json({ message: 'Melodic loop replaced', filename: target.filename });
    }

    if (req.method === 'DELETE' && routeTail) {
      const parsedId = parseMelodicId(routeTail);
      if (!parsedId) {
        return res.status(400).json({ error: 'Invalid melodic loop id' });
      }

      const existing = findExistingMelodicFile(loopsDir, parsedId.type, parsedId.key);
      if (!existing) {
        return res.status(404).json({ error: 'Melodic loop not found' });
      }

      if (fs.existsSync(existing.fullPath)) {
        fs.unlinkSync(existing.fullPath);
      }

      return res.status(200).json({ message: 'Melodic loop deleted', filename: existing.filename });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Melodic loops API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
