require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
let db;
let songsCollection;
let deletedSongsCollection;

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://praiseand-worship.vercel.app', // Primary Vercel domain
    /^https:\/\/praiseand-worship-.*\.vercel\.app$/, // All Vercel deployment URLs
    /^https:\/\/.*-swareshs-projects\.vercel\.app$/, // User-specific Vercel URLs
    'https://swareshpawar.github.io', // GitHub Pages root
    'https://swareshpawar.github.io/PraiseandWorship', // GitHub Pages app path
    'https://praiseandworship.onrender.com', // Primary Render deployment
    /^https:\/\/.*\.onrender\.com$/ // All Render domains (fallback)
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Allow cookies/auth headers for cross-origin requests
}));
app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit for loop uploads
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Increase URL-encoded payload limit
app.use(express.static('.'));

// Serve loops directory for audio file access
const loopsStaticDir = path.join(__dirname, 'loops');
app.use('/loops', express.static(loopsStaticDir));

// Initialize connection for serverless
let isConnected = false;

async function connectToDatabase() {
  if (isConnected && db) {
    return;
  }
  
  try {
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set - please configure it in your Render dashboard');
    }
    
    await client.connect();
    db = client.db('PraiseAndWorship');
    songsCollection = db.collection('PraiseAndWorships');
    deletedSongsCollection = db.collection('DeletedSongs');
    isConnected = true;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    isConnected = false;
    db = null;
    throw err;
  }
}

// Middleware to ensure DB connection - MUST be before routes
app.use(async (req, res, next) => {
  try {
    // Skip connection attempt if we're in local development and already connected
    if (process.env.NODE_ENV !== 'production' && db) {
      return next();
    }

    await connectToDatabase();
    if (!db) {
      throw new Error('Database connection failed - db is still undefined');
    }
    next();
  } catch (err) {
    console.error('Database connection middleware error:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

const { 
  registerUser, 
  authenticateUser, 
  verifyToken,
  generateOTP,
  storeOTP,
  sendEmailOTP,
  sendSMSOTP,
  findUserForPasswordReset,
  resetUserPassword
} = require('./utils/auth');

// Import loop helpers
const {
  buildRhythmSetIndexFromMetadata,
  buildRhythmSetId,
  normalizeRhythmFamily,
  normalizeRhythmSetNo,
  parseRhythmSetId,
  readWritableLoopsMetadata,
  writeLoopsMetadata,
  readLoopsMetadataSafe,
  listMelodicLoops
} = require('./utils/loops');
const { updateRhythmSetProfile } = require('./utils/rhythm-set-profile-manager');
const {
  copyExternalLoopFile,
  getExternalLoopSources,
  listExternalLoopGroups
} = require('./utils/external-loop-sources');
const { syncExternalRhythmNotes } = require('./utils/external-rhythm-notes-sync');

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
const CHORD_LINE_REGEX = /^(\s*[A-G](?:#|b)?(?:[a-zA-Z0-9+#]*)?(?:\/[A-G](?:#|b)?)?[\s\-\/\|]*)+$/i;
const CHORD_TOKEN_REGEX = /([A-G](?:#|b)?(?:[a-zA-Z0-9+#]*)?(?:\/[A-G](?:#|b)?)?)/gi;
const INLINE_CHORD_REGEX = /([\[(])([A-G](?:#|b)?(?:[a-zA-Z0-9+#]*)?(?:\/[A-G](?:#|b)?)?)([\])])/gi;

function normalizeBaseNote(note) {
  if (!note || typeof note !== 'string') return note;
  const normalizedInput = note.charAt(0).toUpperCase() + note.slice(1);
  const index = NOTE_TO_INDEX[normalizedInput];
  if (index === undefined) return note;
  return CANONICAL_CHROMATIC[index];
}

function normalizeMelodicKey(key) {
  if (!key || typeof key !== 'string') return key;
  const trimmed = key.trim();
  const match = trimmed.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!match) return trimmed;
  return `${normalizeBaseNote(match[1])}${match[2] || ''}`;
}

function normalizeChordToken(chordToken) {
  if (!chordToken || typeof chordToken !== 'string') return chordToken;

  if (chordToken.includes('/')) {
    const [base, bass] = chordToken.split('/');
    const normalizedBase = normalizeChordToken(base);
    const normalizedBass = bass ? normalizeChordToken(bass) : '';
    return normalizedBass ? `${normalizedBase}/${normalizedBass}` : normalizedBase;
  }

  const match = chordToken.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!match) return chordToken;
  return `${normalizeBaseNote(match[1])}${match[2] || ''}`;
}

function normalizeManualChords(manualChords) {
  if (!manualChords || typeof manualChords !== 'string') return manualChords;
  return manualChords
    .split(',')
    .map(chord => normalizeChordToken(chord.trim()))
    .filter(Boolean)
    .join(', ');
}

function normalizeLyricsChords(lyrics) {
  if (!lyrics || typeof lyrics !== 'string') return lyrics;
  return lyrics
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (CHORD_LINE_REGEX.test(trimmed)) {
        return line.replace(CHORD_TOKEN_REGEX, chord => normalizeChordToken(chord));
      }

      return line.replace(INLINE_CHORD_REGEX, (match, open, chord, close) => {
        return `${open}${normalizeChordToken(chord)}${close}`;
      });
    })
    .join('\n');
}

function expandKeyFilterVariants(keys) {
  const expanded = new Set();
  (Array.isArray(keys) ? keys : []).forEach(key => {
    if (typeof key !== 'string' || !key.trim()) return;

    const normalizedKey = normalizeMelodicKey(key);
    const match = normalizedKey.match(/^([A-G][#b]?)(m?)$/);
    if (!match) {
      expanded.add(normalizedKey);
      return;
    }

    const root = match[1];
    const suffix = match[2] || '';
    const variants = KEY_VARIANTS_BY_CANONICAL[root] || [root];
    variants.forEach(variantRoot => expanded.add(`${variantRoot}${suffix}`));
  });

  return Array.from(expanded);
}

function normalizeRhythmCategory(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'indian') return 'Indian';
  if (normalized === 'western') return 'Western';
  if (normalized === 'others' || normalized === 'other') return 'Others';
  return '';
}

function getTempoCategoryFromValue(tempoValue) {
  if (tempoValue === null || tempoValue === undefined) return '';
  if (typeof tempoValue === 'string') {
    const normalized = tempoValue.trim().toLowerCase();
    if (['slow', 'medium', 'fast'].includes(normalized)) return normalized;
  }

  const parsedTempo = parseInt(tempoValue, 10);
  if (!Number.isFinite(parsedTempo)) return '';
  if (parsedTempo < 80) return 'slow';
  if (parsedTempo > 120) return 'fast';
  return 'medium';
}

function getSongGenreList(song) {
  if (!song || typeof song !== 'object') return [];
  const genres = Array.isArray(song.genres)
    ? song.genres
    : (song.genre ? [song.genre] : []);

  return genres
    .map(genre => String(genre || '').trim().toLowerCase())
    .filter(Boolean);
}

function isEquivalentTimeSignature(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;

  const map = {
    '6/8': ['3/4'],
    '3/4': ['6/8', '9/8'],
    '9/8': ['3/4'],
    '12/8': ['4/4'],
    '4/4': ['12/8']
  };

  return Array.isArray(map[left]) && map[left].includes(right);
}

function resolveSongRhythmSelection(songPayload, recommendation) {
  const parsedFromId = parseRhythmSetId(songPayload && songPayload.rhythmSetId || '');

  const rhythmFamily = normalizeRhythmFamily(
    songPayload && (songPayload.rhythmFamily || songPayload.taal)
      || (parsedFromId && parsedFromId.rhythmFamily)
      || (recommendation && recommendation.rhythmFamily)
      || ''
  );

  const rhythmSetNo = normalizeRhythmSetNo(
    songPayload && (songPayload.rhythmSetNo || songPayload.setNo)
      || (parsedFromId && parsedFromId.rhythmSetNo)
      || (recommendation && recommendation.rhythmSetNo)
      || null
  );

  const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);
  return {
    rhythmFamily,
    rhythmSetNo,
    rhythmSetId,
    recommendation: recommendation
      ? {
          score: recommendation.score,
          reason: recommendation.reason,
          at: new Date().toISOString()
        }
      : null
  };
}

async function ensureRhythmSetDocument({ rhythmSetId, rhythmFamily, rhythmSetNo }, actor = 'system', source = 'song') {
  if (!db || !rhythmSetId) return;

  const rhythmSetsCollection = db.collection('RhythmSets');
  const now = new Date().toISOString();

  await rhythmSetsCollection.updateOne(
    { rhythmSetId },
    {
      $setOnInsert: {
        rhythmSetId,
        rhythmFamily,
        rhythmSetNo,
        status: 'active',
        notes: '',
        createdAt: now,
        createdBy: actor,
        mappedSongCount: 0
      },
      $set: {
        updatedAt: now,
        updatedBy: actor,
        lastSource: source
      }
    },
    { upsert: true }
  );
}

async function recomputeRhythmSetDerivedMetadata(rhythmSetId) {
  if (!db || !rhythmSetId) return;

  const rhythmSetsCollection = db.collection('RhythmSets');
  const mappedSongCount = await songsCollection.countDocuments({ rhythmSetId });

  await rhythmSetsCollection.updateOne(
    { rhythmSetId },
    {
      $set: {
        mappedSongCount,
        updatedAt: new Date().toISOString()
      }
    }
  );
}

async function refreshRhythmSetProfiles(oldRhythmSetId, newRhythmSetId) {
  if (!db) return;

  const profilesCollection = db.collection('RhythmSetProfiles');
  const targets = new Set([
    oldRhythmSetId ? String(oldRhythmSetId) : '',
    newRhythmSetId ? String(newRhythmSetId) : ''
  ]);

  await Promise.all(
    Array.from(targets)
      .filter(Boolean)
      .map(rhythmSetId => updateRhythmSetProfile(profilesCollection, songsCollection, rhythmSetId, true))
  );
}

async function bootstrapRhythmSetsFromMetadata() {
  if (!db) {
    return { insertedOrUpdated: 0 };
  }

  const { metadata } = readLoopsMetadataSafe();
  const sets = buildRhythmSetIndexFromMetadata(metadata);
  if (!sets.length) {
    return { insertedOrUpdated: 0 };
  }

  const rhythmSetsCollection = db.collection('RhythmSets');
  const actor = 'system';
  const now = new Date().toISOString();

  await Promise.all(sets.map(set => rhythmSetsCollection.updateOne(
    { rhythmSetId: set.rhythmSetId },
    {
      $setOnInsert: {
        rhythmSetId: set.rhythmSetId,
        rhythmFamily: set.rhythmFamily,
        rhythmSetNo: set.rhythmSetNo,
        status: 'active',
        notes: '',
        createdAt: now,
        createdBy: actor
      },
      $set: {
        updatedAt: now,
        updatedBy: actor,
        lastSource: 'bootstrap-rhythm-metadata'
      }
    },
    { upsert: true }
  )));

  return { insertedOrUpdated: sets.length };
}

async function renameRhythmSetInLoopsMetadata(oldRhythmSetId, newRhythmFamily, newRhythmSetNo, newRhythmSetId) {
  if (!oldRhythmSetId || !newRhythmSetId) {
    return { updatedLoops: 0 };
  }

  const writable = readWritableLoopsMetadata();
  const metadata = writable.metadata || { loops: [] };
  let updatedLoops = 0;

  const loops = Array.isArray(metadata.loops) ? metadata.loops : [];
  metadata.loops = loops.map(loop => {
    if (String(loop.rhythmSetId || '') !== String(oldRhythmSetId)) {
      return loop;
    }

    updatedLoops += 1;
    return {
      ...loop,
      rhythmFamily: newRhythmFamily,
      rhythmSetNo: newRhythmSetNo,
      rhythmSetId: newRhythmSetId,
      conditions: {
        ...(loop.conditions || {}),
        taal: newRhythmFamily
      }
    };
  });

  if (!updatedLoops || !writable.metadataPath) {
    return { updatedLoops };
  }

  metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
    rhythmSetId: set.rhythmSetId,
    rhythmFamily: set.rhythmFamily,
    rhythmSetNo: set.rhythmSetNo,
    fileCount: set.loopCount
  }));

  writeLoopsMetadata(metadata, writable.metadataPath);
  return { updatedLoops };
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

function shouldSyncExternalSlot(metadata, rhythmSetId, slotKey, sourceFilename) {
  const loopIndex = findLoopIndexBySlot(metadata, rhythmSetId, slotKey);
  if (loopIndex < 0) {
    return { shouldImport: true, reason: 'missing-local-slot' };
  }

  const loops = Array.isArray(metadata && metadata.loops) ? metadata.loops : [];
  const existing = loops[loopIndex] || {};
  const existingSourceFilename = String(existing.originalFilename || '').trim();
  const existingLocalFilename = String(existing.filename || '').trim();
  const incomingSourceFilename = String(sourceFilename || '').trim();

  if (existingLocalFilename) {
    return { shouldImport: false, reason: 'slot-already-has-loop' };
  }

  if (!existingSourceFilename && existingLocalFilename) {
    return { shouldImport: false, reason: 'existing-local-file-no-source-tracking' };
  }

  if (existingSourceFilename && incomingSourceFilename && existingSourceFilename !== incomingSourceFilename) {
    return { shouldImport: true, reason: 'source-filename-changed' };
  }

  return { shouldImport: false, reason: 'already-up-to-date' };
}

function syncRhythmSetsFromMetadata(metadata) {
  metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
    rhythmSetId: set.rhythmSetId,
    rhythmFamily: set.rhythmFamily,
    rhythmSetNo: set.rhythmSetNo,
    fileCount: set.loopCount
  }));
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  next();
}

// Health check endpoint for deployment detection
app.get('/api/health', async (req, res) => {
  try {
    // Test database connectivity
    const dbStatus = db ? 'connected' : 'not connected';
    
    // Test collections
    let collectionsCount = 0;
    if (db) {
      const collections = await db.listCollections().toArray();
      collectionsCount = collections.length;
    }
    
    res.json({
      status: 'healthy',
      service: 'Praise & Worship API',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
      collectionsCount,
      emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
      smsConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      mongoUri: process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 50) + '...' : 'NOT SET'
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get recommendation weights config
app.get('/api/recommendation-weights', async (req, res) => {
  try {
    const config = await db.collection('config').findOne({ _id: 'weights' });
    if (!config) {
      // Default if not set
      return res.json({
        language: 10,
        scale: 18,
        timeSignature: 18,
        taal: 18,
        tempo: 5,
        genre: 13,
        vocal: 8,
        mood: 10,
        rhythmCategory: 0,
        lastModified: null
      });
    }
    // Remove _id for frontend, include lastModified
    const { _id, ...weights } = config;
    res.json(weights);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update recommendation weights config (admin only)
app.put('/api/recommendation-weights', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { language, scale, timeSignature, taal, tempo, genre, vocal, mood, rhythmCategory } = req.body;
    if ([language, scale, timeSignature, taal, tempo, genre, vocal, mood, rhythmCategory].some(v => typeof v !== 'number')) {
      return res.status(400).json({ error: 'All weights must be numbers' });
    }
    const total = language + scale + timeSignature + taal + tempo + genre + vocal + mood + rhythmCategory;
    if (total !== 100) {
      return res.status(400).json({ error: 'Total must be 100' });
    }
    const lastModified = new Date().toISOString();
    await db.collection('config').updateOne(
      { _id: 'weights' },
      { $set: { language, scale, timeSignature, taal, tempo, genre, vocal, mood, rhythmCategory, lastModified } },
      { upsert: true }
    );
    res.json({ message: 'Recommendation weights updated', lastModified });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Do NOT use global auth middleware
// Only use authMiddleware on protected routes below

// Get all users (admin only)
app.get('/api/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await db.collection('Users').find({}, { projection: { password: 0 } }).toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark user as admin (admin only)
app.patch('/api/users/:id/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await db.collection('Users').updateOne(
      { _id: new (require('mongodb').ObjectId)(userId) },
      { $set: { isAdmin: true } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User marked as admin' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove admin role from user
app.patch('/api/users/:id/remove-admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent removing admin from yourself
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Cannot remove admin role from yourself' });
    }
    
    // Update user to remove admin role
    const result = await db.collection('Users').updateOne(
      { _id: new (require('mongodb').ObjectId)(userId) },
      { $set: { isAdmin: false } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'Admin role removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove admin role' });
  }
});

// Database connection will be handled by connectToDatabase() function

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin access required' });
}
// User registration
app.post('/api/register', async (req, res) => {
  try {
    let { firstName, lastName, username, email, phone, password, isAdmin } = req.body;
    if (!firstName || !lastName || !username || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    username = username.trim().toLowerCase(); // store username as lowercase
    email = email.trim().toLowerCase();
    // Pass all fields to registerUser
    const user = await registerUser(db, { firstName, lastName, username, email, phone, password, isAdmin });
    res.status(201).json({ message: 'User registered', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Debug endpoint to check database connection
app.get('/api/debug/db', async (req, res) => {
  try {
    res.json({ 
      dbConnected: !!db,
      isConnected,
      mongoUri: process.env.MONGODB_URI ? 'Set' : 'Not Set',
      collections: db ? await db.listCollections().toArray() : 'DB not available'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, dbStatus: !!db });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    if (!db) {
      console.error('Database not connected in login endpoint');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    let { usernameOrEmail, username, password } = req.body;
    if ((!usernameOrEmail && !username) || !password) {
      return res.status(400).json({ error: 'Username/email and password required' });
    }
    let loginInput = (usernameOrEmail || username).trim().toLowerCase();
    const { token, user } = await authenticateUser(db, { loginInput, password });
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: err.message });
  }
});

// Initiate password reset (send OTP)
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { identifier, method } = req.body; // identifier can be email or phone, method is 'email' or 'sms'

    if (!identifier || !method) {
      return res.status(400).json({ error: 'Email/phone and method are required' });
    }
    
    if (!['email', 'sms'].includes(method)) {
      return res.status(400).json({ error: 'Method must be email or sms' });
    }
    
    // Find user
    const user = await findUserForPasswordReset(db, identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP in database
    await storeOTP(db, identifier, otp, method);
    
    // Send OTP based on method
    if (method === 'email') {
      if (!user.email) {
        return res.status(400).json({ error: 'No email associated with this account' });
      }
      await sendEmailOTP(user.email, otp, user.firstName);
    } else if (method === 'sms') {
      if (!user.phone) {
        return res.status(400).json({ error: 'No phone number associated with this account' });
      }
      await sendSMSOTP(user.phone, otp, user.firstName);
    }

    res.json({ 
      message: `OTP sent successfully via ${method}`,
      method,
      maskedIdentifier: method === 'email' 
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
        : user.phone.replace(/(\+?\d{2})(\d*)(\d{2})/, '$1***$3')
    });
    
  } catch (err) {
    console.error('Forgot password error:', err);
    
    // Send appropriate error response
    let errorMessage = err.message || 'Failed to send OTP';
    
    // Don't expose sensitive information in production
    if (process.env.NODE_ENV === 'production') {
      if (err.message && err.message.includes('Email service not configured')) {
        errorMessage = 'Email service is currently unavailable. Please try SMS option or contact support.';
      } else if (err.message && err.message.includes('SMS service not configured')) {
        errorMessage = 'SMS service is currently unavailable. Please try email option or contact support.';
      } else if (err.message && err.message.includes('credentials')) {
        errorMessage = 'Service configuration error. Please contact support.';
      } else {
        errorMessage = 'Password reset service is currently unavailable. Please try again later or contact support.';
      }
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Verify OTP and reset password
app.post('/api/reset-password', async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;
    
    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ error: 'Identifier, OTP, and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const result = await resetUserPassword(db, identifier, newPassword, otp);
    res.json(result);
    
  } catch (err) {
    console.error('Reset password error:', err);
    
    let errorMessage = err.message || 'Failed to reset password';
    
    // Don't expose sensitive information in production
    if (process.env.NODE_ENV === 'production') {
      if (err.message && err.message.includes('User not found')) {
        errorMessage = 'Invalid reset request. Please restart the password reset process.';
      } else if (err.message && err.message.includes('Invalid or expired OTP')) {
        errorMessage = 'Invalid or expired verification code. Please request a new one.';
      } else {
        errorMessage = 'Password reset failed. Please try again or contact support.';
      }
    }
    
    res.status(400).json({ error: errorMessage });
  }
});

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

async function ensureUniqueSongIdIndex() {
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

async function ensureSongIdCounterAligned(maxSongId) {
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

async function reserveNextSongId() {
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

async function ensureSongsUseCanonicalIds() {
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

    await ensureUniqueSongIdIndex();
    await ensureSongIdCounterAligned(maxId);

    songsIdsCanonicalized = true;
  })().finally(() => {
    songsIdCanonicalizationPromise = null;
  });

  return songsIdCanonicalizationPromise;
}

async function resolveCanonicalSongByRouteId(routeId) {
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
    canonicalId = await reserveNextSongId();
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

app.get('/api/songs', async (req, res) => {
  try {
    await ensureSongsUseCanonicalIds();

    // Support delta fetching: if ?since=TIMESTAMP is provided, only return songs updated after that
    const { since } = req.query;
    let query = {};
    if (since) {
      // updatedAt or createdAt newer than 'since'
      query = {
        $or: [
          { updatedAt: { $gt: since } },
          { createdAt: { $gt: since } }
        ]
      };
    }
    const songs = await songsCollection.find(query).toArray();
    const formattedSongs = songs.map(formatSongForClient);
    
    res.json(formattedSongs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/songs/deleted', async (req, res) => {
  try {
    const { since } = req.query;
    if (!since) {
      return res.json([]);
    }

    const deletedSongs = await deletedSongsCollection.find({
      deletedAt: { $gt: since }
    }).toArray();

    const deletedIds = deletedSongs.map(doc => doc.songId);
    res.json(deletedIds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected: only logged-in users can add, update, or delete songs
app.post('/api/songs', authMiddleware, async (req, res) => {
  try {
    await ensureSongsUseCanonicalIds();

    req.body.rhythmCategory = normalizeRhythmCategory(req.body.rhythmCategory || '');
    const resolvedRhythm = resolveSongRhythmSelection(req.body, null);
    req.body.rhythmFamily = resolvedRhythm.rhythmFamily;
    req.body.rhythmSetNo = resolvedRhythm.rhythmSetNo;
    req.body.rhythmSetId = resolvedRhythm.rhythmSetId;
    req.body.rhythmRecommendation = resolvedRhythm.recommendation;

    const incomingId = normalizeSongId(req.body.id);
    if (incomingId) {
      req.body.id = incomingId;
      const existingSong = await songsCollection.findOne({ id: incomingId });
      if (existingSong) {
        return res.status(409).json({ error: `Song with ID ${incomingId} already exists` });
      }

      await ensureSongIdCounterAligned(incomingId);
    } else {
      req.body.id = await reserveNextSongId();
    }

    // Add createdBy and createdAt if not present
    // Always use createdBy and createdAt from request if present, else fallback to user/date
    if (!req.body.createdBy && req.user) {
      if (req.user.firstName) {
        // Capitalize first letter of firstName
        const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
        req.body.createdBy = cap(req.user.firstName);
      } else if (req.user.username) {
        req.body.createdBy = req.user.username;
      }
    }
    if (!req.body.createdAt) {
      req.body.createdAt = new Date().toISOString();
    }
    
    // Ensure artistDetails and mood fields are included
    if (!req.body.artistDetails) {
      req.body.artistDetails = '';
    }
    if (!req.body.mood) {
      req.body.mood = '';
    }
    
    // Convert category from capitalized to lowercase for database storage
    if (req.body.category === 'Praise') {
      req.body.category = 'praise';
    } else if (req.body.category === 'Worship') {
      req.body.category = 'worship';
    }
    
    const result = await songsCollection.insertOne(req.body);
    const insertedSong = await songsCollection.findOne({ _id: result.insertedId });

    if (insertedSong && insertedSong.rhythmSetId) {
      const actor = req.user?.firstName || req.user?.username || 'system';
      try {
        await ensureRhythmSetDocument(
          {
            rhythmSetId: insertedSong.rhythmSetId,
            rhythmFamily: insertedSong.rhythmFamily,
            rhythmSetNo: insertedSong.rhythmSetNo
          },
          actor,
          'song-create'
        );
        await recomputeRhythmSetDerivedMetadata(insertedSong.rhythmSetId);
        await refreshRhythmSetProfiles(null, insertedSong.rhythmSetId);
      } catch (rhythmErr) {
        console.warn('Could not sync rhythm-set metadata after song creation:', rhythmErr.message);
      }
    }
    
    // Convert category back to capitalized for frontend compatibility (like GET does)
    const formattedSong = formatSongForClient(insertedSong);
    
    res.status(201).json(formattedSong);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Song ID already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', authMiddleware, async (req, res) => {
  try {
    await ensureSongsUseCanonicalIds();

    const { id } = req.params;
    const resolvedSongRef = await resolveCanonicalSongByRouteId(id);
    if (!resolvedSongRef.numericId) {
      return res.status(400).json({ error: 'Song ID must be a positive integer' });
    }

    const existingSongQuery = { id: resolvedSongRef.numericId };
    const existingSong = resolvedSongRef.song || await songsCollection.findOne(existingSongQuery);

    if (!existingSong) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const incomingRhythmCategory = Object.prototype.hasOwnProperty.call(req.body, 'rhythmCategory')
      ? req.body.rhythmCategory
      : existingSong.rhythmCategory;
    req.body.rhythmCategory = normalizeRhythmCategory(incomingRhythmCategory || '');

    const mergedSong = { ...existingSong, ...req.body };
    const resolvedRhythm = resolveSongRhythmSelection(mergedSong, null);
    req.body.rhythmFamily = resolvedRhythm.rhythmFamily || existingSong.rhythmFamily || '';
    req.body.rhythmSetNo = resolvedRhythm.rhythmSetNo || existingSong.rhythmSetNo || null;
    req.body.rhythmSetId = resolvedRhythm.rhythmSetId || existingSong.rhythmSetId || '';
    req.body.rhythmRecommendation = resolvedRhythm.recommendation || existingSong.rhythmRecommendation || null;

    if (req.body.category === 'Praise') {
      req.body.category = 'praise';
    } else if (req.body.category === 'Worship') {
      req.body.category = 'worship';
    }

    // Always set updatedAt to now on edit
    req.body.updatedAt = new Date().toISOString();
    if (req.user && req.user.firstName) {
      // Capitalize first letter of firstName only
      const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
      req.body.updatedBy = cap(req.user.firstName);
    } else if (req.user && req.user.username) {
      // Fallback to capitalized username
      const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
      req.body.updatedBy = cap(req.user.username);
    }
    const update = { $set: req.body };

    const result = await songsCollection.updateOne(existingSongQuery, update);
    const updatedSong = await songsCollection.findOne(existingSongQuery);

    if (result.matchedCount === 0 || !updatedSong) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const actor = req.user?.firstName || req.user?.username || 'system';
    const previousRhythmSetId = existingSong.rhythmSetId;
    const nextRhythmSetId = updatedSong.rhythmSetId;

    if (nextRhythmSetId) {
      try {
        await ensureRhythmSetDocument(
          {
            rhythmSetId: nextRhythmSetId,
            rhythmFamily: updatedSong.rhythmFamily,
            rhythmSetNo: updatedSong.rhythmSetNo
          },
          actor,
          'song-update'
        );
        await recomputeRhythmSetDerivedMetadata(nextRhythmSetId);

        if (previousRhythmSetId && previousRhythmSetId !== nextRhythmSetId) {
          await recomputeRhythmSetDerivedMetadata(previousRhythmSetId);
        }

        if (previousRhythmSetId !== nextRhythmSetId) {
          await refreshRhythmSetProfiles(previousRhythmSetId, nextRhythmSetId);
        }
      } catch (rhythmErr) {
        console.warn('Could not sync rhythm-set metadata after song update:', rhythmErr.message);
      }
    } else if (previousRhythmSetId) {
      try {
        await recomputeRhythmSetDerivedMetadata(previousRhythmSetId);
        await refreshRhythmSetProfiles(previousRhythmSetId, null);
      } catch (rhythmErr) {
        console.warn('Could not sync rhythm-set metadata after song unassign:', rhythmErr.message);
      }
    }

    const formattedSong = {
      ...formatSongForClient(updatedSong)
    };

    res.json(formattedSong);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/songs/:id/rhythm-set', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureSongsUseCanonicalIds();

    const { id } = req.params;
    const resolvedSongRef = await resolveCanonicalSongByRouteId(id);
    if (!resolvedSongRef.numericId) {
      return res.status(400).json({ error: 'Song ID must be a positive integer' });
    }

    const existingSongQuery = { id: resolvedSongRef.numericId };
    const existingSong = resolvedSongRef.song || await songsCollection.findOne(existingSongQuery);
    if (!existingSong) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const requestedRhythmSetId = req.body && Object.prototype.hasOwnProperty.call(req.body, 'rhythmSetId')
      ? req.body.rhythmSetId
      : null;

    const cap = str => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    const actor = cap(req.user?.firstName || req.user?.username || 'admin');
    const updateFields = {
      updatedAt: new Date().toISOString(),
      updatedBy: actor
    };

    if (!requestedRhythmSetId) {
      updateFields.rhythmSetId = null;
      updateFields.rhythmFamily = null;
      updateFields.rhythmSetNo = null;
      updateFields.rhythmRecommendation = null;
    } else {
      const parsed = parseRhythmSetId(String(requestedRhythmSetId));
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid rhythmSetId format' });
      }

      updateFields.rhythmSetId = parsed.rhythmSetId;
      updateFields.rhythmFamily = parsed.rhythmFamily;
      updateFields.rhythmSetNo = parsed.rhythmSetNo;
      updateFields.rhythmRecommendation = {
        score: 100,
        reason: 'manual-admin-assignment',
        at: new Date().toISOString()
      };
    }

    await songsCollection.updateOne(existingSongQuery, { $set: updateFields });
    const updatedSong = await songsCollection.findOne(existingSongQuery);

    try {
      if (updatedSong && updatedSong.rhythmSetId) {
        await ensureRhythmSetDocument(
          {
            rhythmSetId: updatedSong.rhythmSetId,
            rhythmFamily: updatedSong.rhythmFamily,
            rhythmSetNo: updatedSong.rhythmSetNo
          },
          actor,
          'song-rhythm-set-patch'
        );
        await recomputeRhythmSetDerivedMetadata(updatedSong.rhythmSetId);
      }

      if (existingSong.rhythmSetId && existingSong.rhythmSetId !== (updatedSong && updatedSong.rhythmSetId)) {
        await recomputeRhythmSetDerivedMetadata(existingSong.rhythmSetId);
      }

      if (existingSong.rhythmSetId !== (updatedSong && updatedSong.rhythmSetId)) {
        await refreshRhythmSetProfiles(existingSong.rhythmSetId, updatedSong && updatedSong.rhythmSetId);
      }
    } catch (rhythmErr) {
      console.warn('Could not sync rhythm-set metadata after patch:', rhythmErr.message);
    }

    return res.json(formatSongForClient(updatedSong));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureSongsUseCanonicalIds();

    const { id } = req.params;
    const resolvedSongRef = await resolveCanonicalSongByRouteId(id);
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

    res.json({ message: 'Song deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await ensureSongsUseCanonicalIds();

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

    res.json({ message: 'All songs deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/userdata', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const doc = await db.collection('UserData').findOne({ _id: userId });
  res.json(doc || { favorites: [], transpose: {} });
});

app.put('/api/userdata', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { favorites, name, email, transpose } = req.body;
  // Always use firstName and lastName from authenticated user
  const firstName = req.user.firstName;
  const lastName = req.user.lastName;
  // Update Activitydate for each activity
  const Activitydate = new Date().toISOString();
  await db.collection('UserData').updateOne(
    { _id: userId },
    { $set: { favorites, name, email, transpose, firstName, lastName, Activitydate } },
    { upsert: true }
  );
  res.json({ message: 'User data updated' });
});

// Global Setlist endpoints (admin only)
app.get('/api/global-setlists', async (req, res) => {
  try {
    const setlists = await db.collection('GlobalSetlists').find({}).toArray();
    res.json(setlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/global-setlists', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, description, songs } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Setlist name is required' });
    }
    
    const setlist = {
      name,
      description: description || '',
      songs: songs || [],
      createdBy: req.user.firstName || req.user.username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const result = await db.collection('GlobalSetlists').insertOne(setlist);
    const insertedSetlist = await db.collection('GlobalSetlists').findOne({ _id: result.insertedId });
    res.status(201).json(insertedSetlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/global-setlists/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, songs } = req.body;
    
    const update = {
      $set: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(songs && { songs }),
        updatedBy: req.user.firstName || req.user.username,
        updatedAt: new Date().toISOString()
      }
    };
    
    const result = await db.collection('GlobalSetlists').updateOne(
      { _id: new (require('mongodb').ObjectId)(id) },
      update
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Global setlist not found' });
    }
    res.json({ message: 'Global setlist updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/global-setlists/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.collection('GlobalSetlists').deleteOne({
      _id: new (require('mongodb').ObjectId)(id)
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Global setlist not found' });
    }
    res.json({ message: 'Global setlist deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// My Setlist endpoints (user specific)
app.get('/api/my-setlists', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const setlists = await db.collection('MySetlists').find({ userId }).toArray();
    res.json(setlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/my-setlists', authMiddleware, async (req, res) => {
  try {
    const { name, description, songs } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Setlist name is required' });
    }
    
    const setlist = {
      name,
      description: description || '',
      songs: songs || [],
      userId: req.user.id,
      createdBy: req.user.firstName || req.user.username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const result = await db.collection('MySetlists').insertOne(setlist);
    const insertedSetlist = await db.collection('MySetlists').findOne({ _id: result.insertedId });
    res.status(201).json(insertedSetlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/my-setlists/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, songs } = req.body;
    const userId = req.user.id;
    
    const update = {
      $set: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(songs && { songs }),
        updatedBy: req.user.firstName || req.user.username,
        updatedAt: new Date().toISOString()
      }
    };
    
    const result = await db.collection('MySetlists').updateOne(
      { _id: new (require('mongodb').ObjectId)(id), userId },
      update
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'My setlist not found' });
    }
    res.json({ message: 'My setlist updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/my-setlists/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = await db.collection('MySetlists').deleteOne({
      _id: new (require('mongodb').ObjectId)(id),
      userId
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'My setlist not found' });
    }
    res.json({ message: 'My setlist deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Smart Setlists endpoints
app.get('/api/smart-setlists', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Return:
    // 1. All admin-created smart setlists (visible to everyone)
    // 2. User's own smart setlists (visible only to creator)
    const smartSetlists = await db.collection('SmartSetlists').find({
      $or: [
        { isAdminCreated: true },
        { createdBy: userId }
      ]
    }).sort({ createdAt: -1 }).toArray();

    res.json(smartSetlists);
  } catch (err) {
    console.error('Error fetching smart setlists:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/smart-setlists', authMiddleware, async (req, res) => {
  try {
    const { name, description, conditions, songs } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin === true;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Smart setlist name is required' });
    }

    const smartSetlist = {
      name: name.trim(),
      description: description || '',
      conditions: conditions || {},
      songs: songs || [],
      createdAt: new Date().toISOString(),
      createdBy: userId,
      createdByUsername: req.user.username,
      isAdminCreated: isAdmin,
      updatedAt: new Date().toISOString()
    };

    const result = await db.collection('SmartSetlists').insertOne(smartSetlist);
    const insertedSetlist = await db.collection('SmartSetlists').findOne({ _id: result.insertedId });
    res.status(201).json(insertedSetlist);
  } catch (err) {
    console.error('Error creating smart setlist:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/smart-setlists/:id', authMiddleware, async (req, res) => {
  try {
    const setlistId = req.params.id;
    const { name, description, conditions, songs } = req.body;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin === true;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Smart setlist name is required' });
    }

    const idQuery = ObjectId.isValid(setlistId)
      ? { $or: [{ _id: new ObjectId(setlistId) }, { _id: setlistId }] }
      : { _id: setlistId };

    const existingSetlist = await db.collection('SmartSetlists').findOne(idQuery);
    if (!existingSetlist) {
      return res.status(404).json({ error: 'Smart setlist not found' });
    }

    // Allow edit if: user is creator OR (user is admin AND setlist was created by admin)
    const canEdit = existingSetlist.createdBy === userId || (isAdmin && existingSetlist.isAdminCreated);
    if (!canEdit) {
      return res.status(403).json({ error: 'You do not have permission to edit this smart setlist' });
    }

    const updateData = {
      name: name.trim(),
      description: description || '',
      conditions: conditions || {},
      songs: songs || [],
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.firstName || req.user.username
    };

    await db.collection('SmartSetlists').updateOne(
      idQuery,
      { $set: updateData }
    );

    const updatedSetlist = await db.collection('SmartSetlists').findOne(idQuery);
    res.json(updatedSetlist);
  } catch (err) {
    console.error('Error updating smart setlist:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/smart-setlists/:id', authMiddleware, async (req, res) => {
  try {
    const setlistId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin === true;

    const idQuery = ObjectId.isValid(setlistId)
      ? { $or: [{ _id: new ObjectId(setlistId) }, { _id: setlistId }] }
      : { _id: setlistId };

    const existingSetlist = await db.collection('SmartSetlists').findOne(idQuery);
    if (!existingSetlist) {
      return res.status(404).json({ error: 'Smart setlist not found' });
    }

    // Allow delete if: user is creator OR (user is admin AND setlist was created by admin)
    const canDelete = existingSetlist.createdBy === userId || (isAdmin && existingSetlist.isAdminCreated);
    if (!canDelete) {
      return res.status(403).json({ error: 'You do not have permission to delete this smart setlist' });
    }

    await db.collection('SmartSetlists').deleteOne(idQuery);
    res.json({ success: true, message: 'Smart setlist deleted successfully' });
  } catch (err) {
    console.error('Error deleting smart setlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add song to global setlist
app.post('/api/global-setlists/add-song', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { setlistId, songId, manualSong } = req.body;
    if (!setlistId || !songId) {
      return res.status(400).json({ error: 'Setlist ID and song ID are required' });
    }
    
    // If it's a manual song, store the full song object, otherwise just the ID
    const songToAdd = manualSong ? manualSong : songId;
    
    const result = await db.collection('GlobalSetlists').updateOne(
      { _id: new (require('mongodb').ObjectId)(setlistId) },
      { 
        $addToSet: { songs: songToAdd },
        $set: { updatedAt: new Date().toISOString() }
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Global setlist not found' });
    }
    
    res.json({ success: true, message: 'Song added to global setlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove song from global setlist
app.post('/api/global-setlists/remove-song', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { setlistId, songId } = req.body;
    if (!setlistId || !songId) {
      return res.status(400).json({ error: 'Setlist ID and song ID are required' });
    }

    // Try to remove song ID directly (for new format)
    let result = await db.collection('GlobalSetlists').updateOne(
      { _id: new (require('mongodb').ObjectId)(setlistId) },
      { 
        $pull: { songs: songId },
        $set: { updatedAt: new Date().toISOString() }
      }
    );
    
    // If no modification happened, try to remove song object (for old format)
    if (result.modifiedCount === 0) {
      result = await db.collection('GlobalSetlists').updateOne(
        { _id: new (require('mongodb').ObjectId)(setlistId) },
        { 
          $pull: { songs: { id: songId } },
          $set: { updatedAt: new Date().toISOString() }
        }
      );
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Global setlist not found' });
    }
    
    res.json({ success: true, message: 'Song removed from global setlist' });
  } catch (err) {
    console.error('Error removing song from global setlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add song to personal setlist
app.post('/api/my-setlists/add-song', authMiddleware, async (req, res) => {
  try {
    const { setlistId, songId, manualSong } = req.body;
    const userId = req.user.id;
    
    if (!setlistId || !songId) {
      return res.status(400).json({ error: 'Setlist ID and song ID are required' });
    }
    
    // If it's a manual song, store the full song object, otherwise just the ID
    const songToAdd = manualSong ? manualSong : songId;
    
    const result = await db.collection('MySetlists').updateOne(
      { 
        _id: new (require('mongodb').ObjectId)(setlistId),
        userId 
      },
      { 
        $addToSet: { songs: songToAdd },
        $set: { updatedAt: new Date().toISOString() }
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Personal setlist not found' });
    }
    
    res.json({ success: true, message: 'Song added to personal setlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove song from personal setlist
app.post('/api/my-setlists/remove-song', authMiddleware, async (req, res) => {
  try {
    const { setlistId, songId } = req.body;
    const userId = req.user.id;

    if (!setlistId || !songId) {
      return res.status(400).json({ error: 'Setlist ID and song ID are required' });
    }

    // Try to remove song ID directly (for new format)
    let result = await db.collection('MySetlists').updateOne(
      { 
        _id: new (require('mongodb').ObjectId)(setlistId),
        userId 
      },
      { 
        $pull: { songs: songId },
        $set: { updatedAt: new Date().toISOString() }
      }
    );
    
    // If no modification happened, try to remove song object (for old format)
    if (result.modifiedCount === 0) {
      result = await db.collection('MySetlists').updateOne(
        { 
          _id: new (require('mongodb').ObjectId)(setlistId),
          userId 
        },
        { 
          $pull: { songs: { id: songId } },
          $set: { updatedAt: new Date().toISOString() }
        }
      );
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Personal setlist not found' });
    }
    
    res.json({ success: true, message: 'Song removed from personal setlist' });
  } catch (err) {
    console.error('Error removing song from personal setlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// LOOP MANAGEMENT API
// ============================================================================

// Multer configuration for loop uploads
const loopsDir = path.join(__dirname, 'loops');

function destination(req, file, cb) {
  if (!fs.existsSync(loopsDir)) {
    fs.mkdirSync(loopsDir, { recursive: true });
  }
  cb(null, loopsDir);
}

function filename(req, file, cb) {
  cb(null, file.originalname);
}

function fileFilter(req, file, cb) {
  if (file.mimetype === 'audio/wav' || file.mimetype === 'audio/x-wav' || file.mimetype === 'audio/wave') {
    cb(null, true);
  } else {
    cb(new Error('Only WAV files are allowed'));
  }
}

const loopUpload = multer({
  storage: multer.diskStorage({
    destination,
    filename
  }),
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// GET /api/loops/metadata - Get loops metadata
app.get('/api/loops/metadata', async (req, res) => {
  try {
    const { metadata } = readLoopsMetadataSafe();

    const rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
      rhythmSetId: set.rhythmSetId,
      rhythmFamily: set.rhythmFamily,
      rhythmSetNo: set.rhythmSetNo,
      fileCount: set.loopCount
    }));

    const payload = {
      ...metadata,
      loops: Array.isArray(metadata.loops) ? metadata.loops : [],
      rhythmSets,
      tempoRanges: metadata.tempoRanges || {
        slow: { min: 0, max: 80, label: 'Slow' },
        medium: { min: 80, max: 120, label: 'Medium' },
        fast: { min: 120, max: 999, label: 'Fast' }
      },
      supportedTaals: Array.isArray(metadata.supportedTaals) ? metadata.supportedTaals : [],
      supportedGenres: Array.isArray(metadata.supportedGenres) ? metadata.supportedGenres : [],
      supportedTimeSignatures: Array.isArray(metadata.supportedTimeSignatures) ? metadata.supportedTimeSignatures : []
    };

    res.json(payload);
  } catch (error) {
    console.error('Loops metadata API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/loops/local-files - List loop audio files from current repo loops folder
app.get('/api/loops/local-files', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const audioPattern = /\.(wav|mp3)$/i;
    if (!fs.existsSync(loopsDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(loopsDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && audioPattern.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b));

    return res.json({ files });
  } catch (error) {
    console.error('Local loop files API error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/loops/upload-single - Upload a single loop/fill file
app.post('/api/loops/upload-single', authMiddleware, loopUpload.single('file'), async (req, res) => {
  try {
    const { timeSignature, tempo, genre, type, number, description } = req.body;
    const requestedTaal = req.body?.taal || '';
    const rhythmFamily = normalizeRhythmFamily(req.body?.rhythmFamily || requestedTaal);
    const taal = rhythmFamily || normalizeRhythmFamily(requestedTaal);
    const rhythmSetNo = normalizeRhythmSetNo(req.body?.rhythmSetNo || req.body?.setNo || 1) || 1;
    const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate required fields
    if (!rhythmFamily || !timeSignature || !tempo || !genre || !type || !number) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!rhythmSetId) {
      return res.status(400).json({ error: 'Invalid rhythmFamily/rhythmSetNo combination' });
    }

    const metadataPath = path.join(loopsDir, 'loops-metadata.json');
    let metadata;

    try {
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } else {
        metadata = {
          version: '2.0',
          loops: [],
          tempoRanges: {
            slow: { min: 0, max: 80, label: 'Slow' },
            medium: { min: 80, max: 120, label: 'Medium' },
            fast: { min: 120, max: 999, label: 'Fast' }
          },
          supportedTaals: ['keherwa', 'dadra', 'rupak', 'jhaptal', 'teental', 'ektaal', 'sitarkhani'],
          supportedGenres: ['acoustic', 'rock', 'rd', 'qawalli', 'blues', 'folk', 'classical'],
          supportedTimeSignatures: ['4/4', '3/4', '6/8', '7/8', '5/4', '6/4', '2/4', '9/8']
        };
      }
    } catch (err) {
      console.error('Error reading metadata:', err);
      return res.status(500).json({ error: 'Failed to read loop metadata' });
    }

    // Generate correct filename based on naming convention
    const taalSanitized = taal.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
    const timeFormatted = timeSignature.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
    const tempoSanitized = tempo.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
    const genreSanitized = genre.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
    
    const basePattern = `${taalSanitized}_${timeFormatted}_${tempoSanitized}_${genreSanitized}`;
    const typeUpper = type.toUpperCase();
    const correctFilename = `${basePattern}_${typeUpper}${number}.wav`;

    // Rename uploaded file
    const oldPath = file.path;
    const newPath = path.join(loopsDir, correctFilename);

    try {
      // If file with same name exists, delete it first
      if (fs.existsSync(newPath) && oldPath !== newPath) {
        fs.unlinkSync(newPath);
      }

      // Rename file
      if (oldPath !== newPath) {
        fs.renameSync(oldPath, newPath);
      }
    } catch (err) {
      console.error('Error moving file:', err);
      return res.status(500).json({ error: 'Failed to save uploaded file' });
    }

    // Create metadata entry
    const loopId = `${basePattern}_${type}${number}`;
    const loopEntry = {
      id: loopId,
      filename: correctFilename,
      type: type,
      number: parseInt(number),
      rhythmFamily,
      rhythmSetNo,
      rhythmSetId,
      conditions: {
        taal: taal,
        timeSignature: timeSignature,
        tempo: tempo,
        genre: genre
      },
      metadata: {
        duration: 0,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.username || req.user.email || 'admin',
        description: description || ''
      }
    };

    // Remove existing entry with same ID if exists
    metadata.loops = metadata.loops.filter(loop => loop.id !== loopId);
    
    // Add new entry
    metadata.loops.push(loopEntry);

    // Save updated metadata
    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (err) {
      console.error('Error writing metadata:', err);
      return res.status(500).json({ error: 'Failed to update loop metadata' });
    }

    // Auto-create rhythm set document in database
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
            createdBy: req.user.username || req.user.email || 'admin',
            status: 'active',
            mappedSongCount: 0
          },
          $set: {
            updatedAt: now,
            updatedBy: req.user.username || req.user.email || 'admin',
            lastSource: 'loop-upload-single'
          }
        },
        { upsert: true }
      );
    } catch (dbErr) {
      console.error('Could not auto-create rhythm set document:', dbErr);
    }

    res.json({
      success: true,
      filename: correctFilename,
      id: loopId,
      pattern: basePattern,
      rhythmSetId
    });
  } catch (error) {
    console.error('Error uploading single loop:', error);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error('Error cleaning up uploaded file:', cleanupErr);
      }
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/rhythm-sets - Get rhythm sets with loop file info
app.get('/api/rhythm-sets', authMiddleware, async (req, res) => {
  try {
    const { metadata } = readLoopsMetadataSafe();
    const metadataSets = buildRhythmSetIndexFromMetadata(metadata);
    const metadataMap = new Map(metadataSets.map(set => [set.rhythmSetId, set]));

    const rhythmSetsCollection = db.collection('RhythmSets');
    const dbSets = await rhythmSetsCollection
      .find({})
      .sort({ rhythmFamily: 1, rhythmSetNo: 1 })
      .toArray();

    const songCounts = await songsCollection.aggregate([
      { $match: { rhythmSetId: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$rhythmSetId', count: { $sum: 1 } } }
    ]).toArray();
    const songCountMap = new Map(songCounts.map(entry => [String(entry._id), entry.count]));

    const merged = dbSets.map(set => {
      const loopSet = metadataMap.get(set.rhythmSetId);
      const fileKeys = loopSet ? Object.keys(loopSet.files || {}) : [];
      return {
        ...set,
        files: loopSet ? { ...(loopSet.files || {}) } : {},
        conditionsHint: loopSet?.conditionsHint || null,
        mappedSongCount: songCountMap.get(String(set.rhythmSetId)) || 0,
        availableFiles: fileKeys,
        isComplete: ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'].every(k => fileKeys.includes(k))
      };
    });

    // Include loop-only rhythm sets that may not be persisted yet
    metadataSets.forEach(loopSet => {
      if (!merged.some(set => set.rhythmSetId === loopSet.rhythmSetId)) {
        const fileKeys = Object.keys(loopSet.files || {});
        merged.push({
          rhythmSetId: loopSet.rhythmSetId,
          rhythmFamily: loopSet.rhythmFamily,
          rhythmSetNo: loopSet.rhythmSetNo,
          files: { ...(loopSet.files || {}) },
          conditionsHint: loopSet.conditionsHint || null,
          status: 'active',
          mappedSongCount: songCountMap.get(String(loopSet.rhythmSetId)) || 0,
          availableFiles: fileKeys,
          isComplete: ['loop1', 'loop2', 'loop3', 'fill1', 'fill2', 'fill3'].every(k => fileKeys.includes(k)),
          source: 'loops-metadata'
        });
      }
    });

    merged.sort((a, b) => {
      if (a.rhythmFamily !== b.rhythmFamily) {
        return String(a.rhythmFamily).localeCompare(String(b.rhythmFamily));
      }
      return (a.rhythmSetNo || 0) - (b.rhythmSetNo || 0);
    });

    res.json(merged);
  } catch (err) {
    console.error('Rhythm sets API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/melodic-loops - Get melodic loops (atmosphere/tanpura)
app.get('/api/melodic-loops', async (req, res) => {
  try {
    const { loopsDir } = readLoopsMetadataSafe();
    const melodicLoops = listMelodicLoops(loopsDir);
    res.json(melodicLoops);
  } catch (error) {
    console.error('Melodic loops API error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/external-loop-sources', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const sources = getExternalLoopSources().map(source => ({
      id: source.id,
      label: source.label,
      available: source.available
    }));
    res.json(sources);
  } catch (err) {
    console.error('External loop sources error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/external-loop-sources/:sourceId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await listExternalLoopGroups(req.params.sourceId);
    res.json({
      source: {
        id: result.source.id,
        label: result.source.label,
        available: true
      },
      totalFiles: result.totalFiles,
      groups: result.groups
    });
  } catch (err) {
    console.error('External loop source listing error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/external-loop-sources/:sourceId/import-loop', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const targetSet = parseRhythmSetId(String(req.body?.targetRhythmSetId || '').trim());
    const slotInfo = parseLoopSlotKey(req.body?.targetLoopType);
    const sourceFilename = String(req.body?.sourceFilename || '').trim();

    if (!targetSet || !slotInfo || !sourceFilename) {
      return res.status(400).json({ error: 'targetRhythmSetId, targetLoopType and sourceFilename are required' });
    }

    const writable = readWritableLoopsMetadata();
    const metadata = writable.metadata;
    const targetIndex = findLoopIndexBySlot(metadata, targetSet.rhythmSetId, slotInfo.key);
    const existingLoop = targetIndex >= 0 ? (metadata.loops[targetIndex] || {}) : null;
    const existingSourceFilename = String(existingLoop && existingLoop.originalFilename || '').trim();
    const existingLocalFilename = String(existingLoop && existingLoop.filename || '').trim();

    if (existingLocalFilename || (existingSourceFilename && existingSourceFilename === sourceFilename)) {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'slot-already-has-loop',
        targetRhythmSetId: targetSet.rhythmSetId,
        targetLoopType: slotInfo.key,
        existingFilename: existingLocalFilename,
        existingSourceFilename
      });
    }

    const copied = await copyExternalLoopFile({
      sourceId: req.params.sourceId,
      sourceFilename,
      destinationDir: writable.loopsDir,
      targetBaseName: `${targetSet.rhythmSetId}_${slotInfo.key}_${req.params.sourceId}`
    });

    const loopEntry = {
      id: `${targetSet.rhythmSetId}_${slotInfo.key}`,
      type: slotInfo.type,
      number: slotInfo.number,
      rhythmSetId: targetSet.rhythmSetId,
      rhythmFamily: targetSet.rhythmFamily,
      rhythmSetNo: targetSet.rhythmSetNo,
      filename: copied.filename,
      originalFilename: sourceFilename,
      conditions: {
        taal: targetSet.rhythmFamily
      },
      metadata: {
        updatedAt: new Date().toISOString(),
        importedFrom: `${req.params.sourceId}:${sourceFilename}`
      }
    };

    if (targetIndex >= 0) {
      metadata.loops[targetIndex] = {
        ...metadata.loops[targetIndex],
        ...loopEntry
      };
    } else {
      metadata.loops.push(loopEntry);
    }

    syncRhythmSetsFromMetadata(metadata);
    writeLoopsMetadata(metadata, writable.metadataPath);

    await ensureRhythmSetDocument(targetSet, req.user.username || req.user.email || 'admin', 'external-loop-import');

    res.status(201).json({
      success: true,
      importedFilename: copied.filename,
      targetRhythmSetId: targetSet.rhythmSetId,
      targetLoopType: slotInfo.key
    });
  } catch (err) {
    console.error('External loop import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/external-loop-sources/:sourceId/import-rhythm-set', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const sourceRhythmSetId = String(req.body?.sourceRhythmSetId || '').trim().toLowerCase();
    const parsedTarget = parseRhythmSetId(String(req.body?.targetRhythmSetId || sourceRhythmSetId).trim().toLowerCase());

    if (!sourceRhythmSetId || !parsedTarget) {
      return res.status(400).json({ error: 'sourceRhythmSetId and valid targetRhythmSetId are required' });
    }

    const sourceGroups = await listExternalLoopGroups(req.params.sourceId);
    const sourceGroup = sourceGroups.groups.find(group => group.sourceRhythmSetId === sourceRhythmSetId);
    if (!sourceGroup) {
      return res.status(404).json({ error: `External rhythm set ${sourceRhythmSetId} not found` });
    }

    const importNotes = String(sourceGroup.notesHint || '').trim();

    const writable = readWritableLoopsMetadata();
    const metadata = writable.metadata;
    const importedFiles = [];
    const skippedFiles = [];

    for (const [slotKey, sourceFilename] of Object.entries(sourceGroup.files || {})) {
      const slotInfo = parseLoopSlotKey(slotKey);
      if (!slotInfo) continue;

      const syncDecision = shouldSyncExternalSlot(metadata, parsedTarget.rhythmSetId, slotInfo.key, sourceFilename);
      if (!syncDecision.shouldImport) {
        skippedFiles.push({ slotKey: slotInfo.key, sourceFilename, reason: syncDecision.reason });
        continue;
      }

      const copied = await copyExternalLoopFile({
        sourceId: req.params.sourceId,
        sourceFilename,
        destinationDir: writable.loopsDir,
        targetBaseName: `${parsedTarget.rhythmSetId}_${slotInfo.key}_${req.params.sourceId}`
      });

      const targetIndex = findLoopIndexBySlot(metadata, parsedTarget.rhythmSetId, slotInfo.key);
      const loopEntry = {
        id: `${parsedTarget.rhythmSetId}_${slotInfo.key}`,
        type: slotInfo.type,
        number: slotInfo.number,
        rhythmSetId: parsedTarget.rhythmSetId,
        rhythmFamily: parsedTarget.rhythmFamily,
        rhythmSetNo: parsedTarget.rhythmSetNo,
        filename: copied.filename,
        originalFilename: sourceFilename,
        conditions: {
          taal: parsedTarget.rhythmFamily
        },
        metadata: {
          updatedAt: new Date().toISOString(),
          importedFrom: `${req.params.sourceId}:${sourceRhythmSetId}`
        }
      };

      if (targetIndex >= 0) {
        metadata.loops[targetIndex] = {
          ...metadata.loops[targetIndex],
          ...loopEntry
        };
      } else {
        metadata.loops.push(loopEntry);
      }

      importedFiles.push({ slotKey: slotInfo.key, filename: copied.filename, sourceFilename });
    }

    syncRhythmSetsFromMetadata(metadata);
    writeLoopsMetadata(metadata, writable.metadataPath);

    await ensureRhythmSetDocument(parsedTarget, req.user.username || req.user.email || 'admin', 'external-rhythm-set-import');
    if (db && importNotes) {
      const rhythmSetsCollection = db.collection('RhythmSets');
      await rhythmSetsCollection.updateOne(
        { rhythmSetId: parsedTarget.rhythmSetId },
        {
          $set: {
            notes: importNotes,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.username || req.user.email || 'admin',
            lastSource: 'external-rhythm-set-import'
          }
        },
        { upsert: true }
      );
    }

    res.status(importedFiles.length > 0 ? 201 : 200).json({
      success: true,
      targetRhythmSetId: parsedTarget.rhythmSetId,
      importedFiles,
      skippedFiles,
      delta: {
        totalSlots: Object.keys(sourceGroup.files || {}).length,
        importedCount: importedFiles.length,
        skippedCount: skippedFiles.length
      }
    });
  } catch (err) {
    console.error('External rhythm set import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/external-loop-sources/:sourceId/sync-notes', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await syncExternalRhythmNotes({
      db,
      sourceId: req.params.sourceId,
      apply: true,
      actor: req.user.username || req.user.email || 'admin'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('External rhythm note sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rhythm-sets/loops/swap
 * Swap loop files between two slots (same or different rhythm sets).
 */
app.post('/api/rhythm-sets/loops/swap', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { slot1, slot2 } = req.body || {};
    const slot1Info = parseLoopSlotKey(slot1 && slot1.loopType);
    const slot2Info = parseLoopSlotKey(slot2 && slot2.loopType);

    if (!slot1 || !slot2 || !slot1.rhythmSetId || !slot2.rhythmSetId || !slot1Info || !slot2Info) {
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

    return res.status(200).json({
      success: true,
      message: 'Loop slots swapped successfully',
      slot1: {
        rhythmSetId: slot1.rhythmSetId,
        loopType: slot1Info.key,
        newFilename: filename2
      },
      slot2: {
        rhythmSetId: slot2.rhythmSetId,
        loopType: slot2Info.key,
        newFilename: filename1
      }
    });
  } catch (err) {
    console.error('Swap loops error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rhythm-sets/:rhythmSetId/loops/assign
 * Assign any existing local filename to a specific slot.
 */
app.post('/api/rhythm-sets/:rhythmSetId/loops/assign', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const parsedSet = parseRhythmSetId(String(req.params.rhythmSetId || '').trim().toLowerCase());
    if (!parsedSet) {
      return res.status(400).json({ error: 'Invalid rhythmSetId format' });
    }

    const slotInfo = parseLoopSlotKey(req.body?.loopType);
    const filename = String(req.body?.filename || '').trim();
    if (!slotInfo || !filename) {
      return res.status(400).json({ error: 'loopType and filename are required' });
    }

    const writable = readWritableLoopsMetadata();
    const metadata = writable.metadata;
    const targetIndex = findLoopIndexBySlot(metadata, parsedSet.rhythmSetId, slotInfo.key);
    const template = (metadata.loops || []).find(loop => String(loop.filename || '') === filename);
    const targetExisting = targetIndex >= 0 ? metadata.loops[targetIndex] : null;
    const base = targetExisting || template || {};
    const now = new Date().toISOString();

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
        assignedBy: req.user.username || req.user.email || 'admin'
      }
    };

    const slotMatches = (loop) => String(loop && loop.rhythmSetId || '') === String(parsedSet.rhythmSetId) &&
      `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}` === slotInfo.key;
    metadata.loops = (metadata.loops || []).filter(loop => !slotMatches(loop));
    metadata.loops.push(assignedLoop);

    syncRhythmSetsFromMetadata(metadata);
    writeLoopsMetadata(metadata, writable.metadataPath);

    return res.status(200).json({
      success: true,
      message: `${slotInfo.key} assigned successfully`,
      rhythmSetId: parsedSet.rhythmSetId,
      loopType: slotInfo.key,
      filename
    });
  } catch (err) {
    console.error('Assign existing loop error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/rhythm-sets - Create a new rhythm set
app.post('/api/rhythm-sets', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const rhythmFamily = normalizeRhythmFamily(req.body?.rhythmFamily || '');
    const rhythmSetNo = normalizeRhythmSetNo(req.body?.rhythmSetNo || req.body?.setNo);
    const rhythmSetId = buildRhythmSetId(rhythmFamily, rhythmSetNo);

    if (!rhythmSetId) {
      return res.status(400).json({ error: 'rhythmFamily and positive rhythmSetNo are required' });
    }

    const rhythmSetsCollection = db.collection('RhythmSets');
    const existing = await rhythmSetsCollection.findOne({ rhythmSetId });
    if (existing) {
      return res.status(409).json({ error: `Rhythm set ${rhythmSetId} already exists` });
    }

    const now = new Date().toISOString();
    const doc = {
      rhythmSetId,
      rhythmFamily,
      rhythmSetNo,
      status: req.body?.status || 'active',
      notes: req.body?.notes || '',
      createdAt: now,
      updatedAt: now,
      createdBy: req.user.firstName || req.user.username,
      updatedBy: req.user.firstName || req.user.username,
      mappedSongCount: 0
    };

    await rhythmSetsCollection.insertOne(doc);
    res.status(201).json(doc);
  } catch (err) {
    console.error('Rhythm set creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rhythm-sets/:rhythmSetId - Update a rhythm set
app.put('/api/rhythm-sets/:rhythmSetId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const parsed = parseRhythmSetId(req.params.rhythmSetId);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid rhythmSetId format. Expected family_setNo' });
    }

    const rhythmSetsCollection = db.collection('RhythmSets');
    const existing = await rhythmSetsCollection.findOne({ rhythmSetId: parsed.rhythmSetId });
    if (!existing) {
      return res.status(404).json({ error: 'Rhythm set not found' });
    }

    const updates = {
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.firstName || req.user.username
    };

    if (typeof req.body?.status === 'string' && req.body.status.trim()) {
      updates.status = req.body.status.trim();
    }
    if (typeof req.body?.notes === 'string') {
      updates.notes = req.body.notes;
    }

    await rhythmSetsCollection.updateOne(
      { rhythmSetId: parsed.rhythmSetId },
      { $set: updates }
    );

    const updated = await rhythmSetsCollection.findOne({ rhythmSetId: parsed.rhythmSetId });
    res.json(updated);
  } catch (err) {
    console.error('Rhythm set update error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rhythm-sets/:rhythmSetId/recompute', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const parsed = parseRhythmSetId(req.params.rhythmSetId);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid rhythmSetId format. Expected family_setNo' });
    }

    const rhythmSetsCollection = db.collection('RhythmSets');
    const existing = await rhythmSetsCollection.findOne({ rhythmSetId: parsed.rhythmSetId });
    if (!existing) {
      return res.status(404).json({ error: 'Rhythm set not found' });
    }

    await recomputeRhythmSetDerivedMetadata(parsed.rhythmSetId);
    const updated = await rhythmSetsCollection.findOne({ rhythmSetId: parsed.rhythmSetId });
    res.json({ success: true, rhythmSet: updated });
  } catch (err) {
    console.error('Rhythm set recompute error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// END LOOP MANAGEMENT API
// ============================================================================

// Start server - works for both local development and production (Render, etc.)
async function startServer() {
  try {
    await connectToDatabase();
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start server unless we're being imported (for Vercel)
if (require.main === module) {
  startServer();
}

// Export for Vercel
module.exports = app;