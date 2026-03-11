const fs = require('fs');
const path = require('path');

const COMPLETE_LOOP_KEYS = ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'];
const CANONICAL_CHROMATIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const NOTE_TO_INDEX = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
};
const KEY_VARIANTS_BY_CANONICAL = {
  C: ['C'],
  'C#': ['C#', 'Db'],
  D: ['D'],
  Eb: ['Eb', 'D#'],
  E: ['E', 'Fb'],
  F: ['F', 'E#'],
  'F#': ['F#', 'Gb'],
  G: ['G'],
  'G#': ['G#', 'Ab'],
  A: ['A'],
  Bb: ['Bb', 'A#'],
  B: ['B', 'Cb']
};

function normalizeRhythmFamily(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

function normalizeRhythmSetNo(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseRhythmSetId(rhythmSetId) {
  if (typeof rhythmSetId !== 'string') return null;
  const cleaned = rhythmSetId.trim().toLowerCase();
  const match = cleaned.match(/^([a-z0-9_-]+)_([0-9]+)$/);
  if (!match) return null;

  const rhythmSetNo = normalizeRhythmSetNo(match[2]);
  if (!rhythmSetNo) return null;

  return {
    rhythmFamily: normalizeRhythmFamily(match[1]),
    rhythmSetNo,
    rhythmSetId: `${normalizeRhythmFamily(match[1])}_${rhythmSetNo}`
  };
}

function buildRhythmSetId(rhythmFamily, rhythmSetNo) {
  const family = normalizeRhythmFamily(rhythmFamily);
  const setNo = normalizeRhythmSetNo(rhythmSetNo);
  if (!family || !setNo) return null;
  return `${family}_${setNo}`;
}

function getLoopRhythmFields(loop) {
  const rawFamily = loop && (loop.rhythmFamily || (loop.conditions && loop.conditions.taal)) || '';
  const rawSetNo = loop && (loop.rhythmSetNo || loop.setNo) || 1;
  const parsedFromId = parseRhythmSetId(loop && loop.rhythmSetId || '');

  const rhythmFamily = parsedFromId && parsedFromId.rhythmFamily || normalizeRhythmFamily(rawFamily);
  const rhythmSetNo = parsedFromId && parsedFromId.rhythmSetNo || normalizeRhythmSetNo(rawSetNo) || 1;
  const rhythmSetId = parsedFromId && parsedFromId.rhythmSetId || buildRhythmSetId(rhythmFamily, rhythmSetNo);

  return { rhythmFamily, rhythmSetNo, rhythmSetId };
}

function buildRhythmSetIndexFromMetadata(metadata) {
  const loops = Array.isArray(metadata && metadata.loops) ? metadata.loops : [];
  const rhythmSets = new Map();

  loops.forEach(loop => {
    const fields = getLoopRhythmFields(loop);
    if (!fields.rhythmSetId) return;

    if (!rhythmSets.has(fields.rhythmSetId)) {
      rhythmSets.set(fields.rhythmSetId, {
        rhythmSetId: fields.rhythmSetId,
        rhythmFamily: fields.rhythmFamily,
        rhythmSetNo: fields.rhythmSetNo,
        files: {},
        loopCount: 0
      });
    }

    const set = rhythmSets.get(fields.rhythmSetId);
    const fileKey = `${loop.type}${loop.number}`;
    if (loop.filename && fileKey) {
      set.files[fileKey] = loop.filename;
    }
    set.loopCount += 1;
  });

  return Array.from(rhythmSets.values());
}

function getRepoRoot() {
  return path.resolve(__dirname, '..');
}

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getWritableLoopsLocation() {
  const root = getRepoRoot();
  const loopsDir = path.join(root, 'loops');
  return {
    loopsDir,
    metadataPath: path.join(loopsDir, 'loops-metadata.json')
  };
}

function resolveLoopsMetadataLocation() {
  const root = getRepoRoot();
  const directMetadata = path.join(root, 'loops', 'loops-metadata.json');

  if (fs.existsSync(directMetadata)) {
    return {
      metadataPath: directMetadata,
      loopsDir: path.dirname(directMetadata),
      source: 'root-loops'
    };
  }

  const migrationDir = path.join(root, 'migration');
  if (!fs.existsSync(migrationDir)) {
    return {
      metadataPath: directMetadata,
      loopsDir: path.join(root, 'loops'),
      source: 'default-missing'
    };
  }

  let latest = null;
  const entries = fs.readdirSync(migrationDir, { withFileTypes: true });
  entries.forEach(entry => {
    if (!entry.isDirectory()) return;
    if (!entry.name.startsWith('bundle-')) return;

    const candidate = path.join(migrationDir, entry.name, 'source-files', 'loops', 'loops-metadata.json');
    if (!fs.existsSync(candidate)) return;

    const stat = fs.statSync(candidate);
    if (!latest || stat.mtimeMs > latest.mtimeMs) {
      latest = { candidate, mtimeMs: stat.mtimeMs };
    }
  });

  if (latest) {
    return {
      metadataPath: latest.candidate,
      loopsDir: path.dirname(latest.candidate),
      source: 'migration-bundle'
    };
  }

  return {
    metadataPath: directMetadata,
    loopsDir: path.join(root, 'loops'),
    source: 'default-missing'
  };
}

function getDefaultMetadata() {
  return {
    version: '2.0',
    loops: [],
    rhythmSets: [],
    tempoRanges: {
      slow: { min: 0, max: 80, label: 'Slow' },
      medium: { min: 80, max: 120, label: 'Medium' },
      fast: { min: 120, max: 999, label: 'Fast' }
    },
    supportedTaals: ['keherwa', 'dadra', 'rupak', 'jhaptal', 'teental', 'ektaal'],
    supportedGenres: ['acoustic', 'rock', 'rd pattern', 'qawalli', 'blues'],
    supportedTimeSignatures: ['4/4', '3/4', '6/8', '7/8']
  };
}

function readWritableLoopsMetadata() {
  const location = getWritableLoopsLocation();

  if (fs.existsSync(location.metadataPath)) {
    const parsed = JSON.parse(fs.readFileSync(location.metadataPath, 'utf8'));
    return {
      metadata: {
        ...getDefaultMetadata(),
        ...parsed,
        loops: Array.isArray(parsed.loops) ? parsed.loops : []
      },
      metadataPath: location.metadataPath,
      loopsDir: location.loopsDir,
      source: 'root-loops'
    };
  }

  const fallback = readLoopsMetadataSafe();
  return {
    metadata: {
      ...getDefaultMetadata(),
      ...fallback.metadata,
      loops: Array.isArray(fallback.metadata && fallback.metadata.loops) ? fallback.metadata.loops : []
    },
    metadataPath: location.metadataPath,
    loopsDir: location.loopsDir,
    source: fallback.source
  };
}

function writeLoopsMetadata(metadata, metadataPath) {
  ensureDirExists(path.dirname(metadataPath));
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function decodeBase64Payload(base64Payload) {
  if (typeof base64Payload !== 'string' || !base64Payload.trim()) {
    return null;
  }

  const raw = base64Payload.includes(',')
    ? base64Payload.substring(base64Payload.indexOf(',') + 1)
    : base64Payload;

  return Buffer.from(raw, 'base64');
}

function sanitizeFileSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

function normalizeLoopType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'loop') return 'loop';
  if (normalized === 'fill') return 'fill';
  return '';
}

function buildLoopFilename({ taal, timeSignature, tempo, genre, type, number }) {
  const safeTaal = sanitizeFileSegment(taal).toLowerCase();
  const safeTime = sanitizeFileSegment(String(timeSignature || '').replace('/', '_'));
  const safeTempo = sanitizeFileSegment(tempo).toLowerCase();
  const safeGenre = sanitizeFileSegment(genre).toLowerCase();
  const safeType = String(type || '').toUpperCase();
  const safeNo = parseInt(number, 10);

  if (!safeTaal || !safeTime || !safeTempo || !safeGenre || !safeType || !safeNo) {
    return null;
  }

  return `${safeTaal}_${safeTime}_${safeTempo}_${safeGenre}_${safeType}${safeNo}.wav`;
}

function buildLoopId({ taal, timeSignature, tempo, genre, type, number }) {
  const safeTaal = sanitizeFileSegment(taal).toLowerCase();
  const safeTime = sanitizeFileSegment(String(timeSignature || '').replace('/', '_')).toLowerCase();
  const safeTempo = sanitizeFileSegment(tempo).toLowerCase();
  const safeGenre = sanitizeFileSegment(genre).toLowerCase();
  const safeType = String(type || '').toLowerCase();
  const safeNo = parseInt(number, 10);

  if (!safeTaal || !safeTime || !safeTempo || !safeGenre || !safeType || !safeNo) {
    return null;
  }

  return `${safeTaal}_${safeTime}_${safeTempo}_${safeGenre}_${safeType}${safeNo}`;
}

function readLoopsMetadataSafe() {
  try {
    const location = resolveLoopsMetadataLocation();
    if (!fs.existsSync(location.metadataPath)) {
      return {
        metadata: getDefaultMetadata(),
        metadataPath: location.metadataPath,
        loopsDir: location.loopsDir,
        source: location.source
      };
    }

    const parsed = JSON.parse(fs.readFileSync(location.metadataPath, 'utf8'));
    const metadata = {
      ...getDefaultMetadata(),
      ...parsed
    };
    metadata.loops = Array.isArray(metadata.loops) ? metadata.loops : [];

    return {
      metadata,
      metadataPath: location.metadataPath,
      loopsDir: location.loopsDir,
      source: location.source
    };
  } catch (error) {
    return {
      metadata: getDefaultMetadata(),
      metadataPath: null,
      loopsDir: path.join(getRepoRoot(), 'loops'),
      source: 'error'
    };
  }
}

function normalizeBaseNote(note) {
  if (!note || typeof note !== 'string') return null;
  const normalizedInput = note.charAt(0).toUpperCase() + note.slice(1);
  const index = NOTE_TO_INDEX[normalizedInput];
  return index === undefined ? null : CANONICAL_CHROMATIC[index];
}

function findExistingMelodicFile(loopsDir, type, key) {
  const canonicalKey = normalizeBaseNote(key);
  if (!canonicalKey) return null;

  const typeDir = path.join(loopsDir, 'melodies', type);
  if (!fs.existsSync(typeDir)) return null;

  const variants = KEY_VARIANTS_BY_CANONICAL[canonicalKey] || [canonicalKey];
  for (const variant of variants) {
    const filename = `${type}_${variant}.wav`;
    const fullPath = path.join(typeDir, filename);
    if (fs.existsSync(fullPath)) {
      return { filename, fullPath, canonicalKey };
    }
  }

  return null;
}

function listMelodicLoops(loopsDir) {
  const result = [];

  CANONICAL_CHROMATIC.forEach(key => {
    const atmosphere = findExistingMelodicFile(loopsDir, 'atmosphere', key);
    if (atmosphere) {
      const stats = fs.statSync(atmosphere.fullPath);
      result.push({
        id: `atmosphere_${key}`,
        type: 'atmosphere',
        key,
        filename: atmosphere.filename,
        size: stats.size,
        uploadedAt: stats.mtime.toISOString()
      });
    }

    const tanpura = findExistingMelodicFile(loopsDir, 'tanpura', key);
    if (tanpura) {
      const stats = fs.statSync(tanpura.fullPath);
      result.push({
        id: `tanpura_${key}`,
        type: 'tanpura',
        key,
        filename: tanpura.filename,
        size: stats.size,
        uploadedAt: stats.mtime.toISOString()
      });
    }
  });

  return result;
}

module.exports = {
  COMPLETE_LOOP_KEYS,
  CANONICAL_CHROMATIC,
  normalizeRhythmSetNo,
  normalizeRhythmFamily,
  parseRhythmSetId,
  buildRhythmSetId,
  buildRhythmSetIndexFromMetadata,
  normalizeBaseNote,
  findExistingMelodicFile,
  isServerlessRuntime,
  ensureDirExists,
  getWritableLoopsLocation,
  readWritableLoopsMetadata,
  writeLoopsMetadata,
  decodeBase64Payload,
  sanitizeFileSegment,
  normalizeLoopType,
  buildLoopFilename,
  buildLoopId,
  readLoopsMetadataSafe,
  listMelodicLoops
};
