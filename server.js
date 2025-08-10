require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();

// --- Middleware Configuration ---
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://praiseandworship.onrender.com',
    'https://swareshpawar.github.io'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(__dirname));

// --- Constants and Global Variables ---
const PORT = process.env.PORT || 3001;
const uri = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, songsCollection, usersCollection, favoritesCollection, setlistsCollection;

// --- Authentication Middleware ---

// Temporary basic auth middleware for admin actions
function basicAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Authentication required.');
  }
  const base64 = auth.split(' ')[1];
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
  if (user === 'SwareshPawar' && pass === 'Swar@123') { // Change password as needed
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('Invalid credentials.');
}

function generateToken(user) {
  return jwt.sign({
    id: user._id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin || false
  }, JWT_SECRET, { expiresIn: '7d' });
}

function localAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  console.log('[localAuthMiddleware] Authorization header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[localAuthMiddleware] No token provided');
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('[localAuthMiddleware] JWT error:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ===== API Endpoints =====

// --- Debugging and Environment ---
// --- Suggested Songs Weights Placeholder ---
// In-memory storage for suggested songs weights (replace with DB in production)

app.get('/api/suggested-songs-weights', (req, res) => {
  // Read weights from MongoDB
  suggestedWeightsCollection.findOne({})
    .then(doc => {
      if (doc) {
        const { _id, ...weights } = doc;
        res.json(weights);
      } else {
        res.json({
          language: 0,
          scale: 0,
          timeSignature: 0,
          taal: 0,
          tempo: 0,
          genres: 0
        });
      }
    })
    .catch(() => {
      res.status(500).json({ error: 'Failed to load weights' });
    });
});

app.put('/api/suggested-songs-weights', (req, res) => {
  const keys = ['language','scale','timeSignature','taal','tempo','genres'];
  const update = {};
  keys.forEach(key => {
    if (typeof req.body[key] === 'number') {
      update[key] = req.body[key];
    }
  });
  suggestedWeightsCollection.updateOne({}, { $set: update }, { upsert: true })
    .then(() => suggestedWeightsCollection.findOne({}))
    .then(doc => {
      const { _id, ...weights } = doc;
      res.json({ success: true, weights });
    })
    .catch(() => {
      res.status(500).json({ error: 'Failed to save weights' });
    });
});
app.get('/api/env', (req, res) => {
  res.json({
    mongodbUri: process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/:\/\/.*:(.*?)@/, '://***:***@') : '(not set)',
    port: PORT,
    backendUrl: `http://localhost:${PORT}`,
    nodeEnv: process.env.NODE_ENV || 'development',
    deployed: process.env.RENDER === 'true' || false
  });
});

// --- User Registration and Login ---
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const existing = await usersCollection.findOne({ email });
  if (existing) return res.status(409).json({ error: 'User already exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = { email, password: hash, name, isAdmin: false };
  const result = await usersCollection.insertOne(user);
  const userId = result.insertedId.toString();
  // Create empty favorites and setlists documents for the new user
  await favoritesCollection.insertOne({ userId, favorites: [] });
  await setlistsCollection.insertOne({ userId, type: 'praise', setlist: [] });
  await setlistsCollection.insertOne({ userId, type: 'worship', setlist: [] });
  const token = generateToken({ ...user, _id: result.insertedId });
  res.json({ token });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await usersCollection.findOne({ email });
  if (!user) {
    console.log(`[LOGIN FAIL] User not found for email: ${email}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    console.log(`[LOGIN FAIL] Password mismatch for email: ${email}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  console.log(`[LOGIN SUCCESS] User: ${email}`);
  const token = generateToken(user);
  res.json({ token });
});

// --- User Data (Favorites and Setlists) ---
app.get('/api/user/favorites', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const doc = await favoritesCollection.findOne({ userId });
  res.json(doc?.favorites || []);
});

app.post('/api/user/favorites', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const userName = req.user.name || req.user.email || '';
  const { favorites } = req.body;
  await favoritesCollection.updateOne(
    { userId },
    { $set: { favorites, userName } },
    { upsert: true }
  );
  res.json({ message: 'Favorites updated' });
});

app.get('/api/user/setlist', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const type = req.query.type === 'worship' ? 'worship' : 'praise';
  const doc = await setlistsCollection.findOne({ userId, type });
  res.json(doc?.setlist || []);
});

app.post('/api/user/setlist', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const userName = req.user.name || req.user.email || '';
  const { type, setlist } = req.body;
  await setlistsCollection.updateOne(
    { userId, type },
    { $set: { setlist, userName } },
    { upsert: true }
  );
  res.json({ message: 'Setlist updated' });
});

// --- Legacy User Data Endpoints ---
app.get('/api/userdata', async (req, res) => {
  const isDev = (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV);
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.id;
      const userDoc = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!userDoc) {
        return res.json({ favorites: [], praiseSetlist: [], worshipSetlist: [], name: '', email: '' });
      }
      const favDoc = await favoritesCollection.findOne({ userId });
      const praiseDoc = await setlistsCollection.findOne({ userId, type: 'praise' });
      const worshipDoc = await setlistsCollection.findOne({ userId, type: 'worship' });
      const { name, email } = userDoc;
      return res.json({
        favorites: favDoc?.favorites || [],
        praiseSetlist: praiseDoc?.setlist || [],
        worshipSetlist: worshipDoc?.setlist || [],
        name,
        email
      });
    } catch (err) {
      // Invalid token, fall through to dev behavior or require auth
    }
  }

  if (isDev) {
    return res.json({ favorites: [], praiseSetlist: [], worshipSetlist: [], name: '', email: '' });
  } else {
    // In production, if we reach here, it means no valid token was provided.
    return res.status(401).json({ error: 'Authentication required' });
  }
});

app.put('/api/userdata', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { favorites, praiseSetlist, worshipSetlist, name, email } = req.body;
  // Update user's name/email in the main users collection
  await usersCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { name, email } }
  );
  // Update favorites and setlists in their respective collections
  await favoritesCollection.updateOne({ userId }, { $set: { favorites } }, { upsert: true });
  await setlistsCollection.updateOne({ userId, type: 'praise' }, { $set: { setlist: praiseSetlist } }, { upsert: true });
  await setlistsCollection.updateOne({ userId, type: 'worship' }, { $set: { setlist: worshipSetlist } }, { upsert: true });
  res.json({ message: 'User data updated' });
});


// --- Admin User Management ---
app.get('/api/users', localAuthMiddleware, requireAdmin, async (req, res) => {
  const users = await usersCollection.find({}, { projection: { password: 0 } }).toArray();
  res.json(users);
});

app.put('/api/users/:id/admin', localAuthMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { isAdmin } = req.body;
  if (typeof isAdmin !== 'boolean') {
    return res.status(400).json({ error: 'isAdmin (boolean) required' });
  }
  if (req.user.id === id && isAdmin === false) {
    return res.status(400).json({ error: 'You cannot remove your own admin status.' });
  }
  const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { isAdmin } });
  if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: `User admin status set to ${isAdmin}` });
});

// --- Songs API ---
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await songsCollection.find({}).toArray();
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', localAuthMiddleware, async (req, res) => {
  try {
    if (typeof req.body.id !== 'number') {
      const last = await songsCollection.find().sort({ id: -1 }).limit(1).toArray();
      req.body.id = last.length ? last[0].id + 1 : 1;
    }
    const now = new Date().toISOString();
    req.body.createdAt = now;
    req.body.modifiedAt = now;
    req.body.date = req.body.date || now;
    req.body.contributor = req.body.contributor || (req.user && req.user.name ? req.user.name : (req.user && req.user.email ? req.user.email : 'Unknown'));
    const result = await songsCollection.insertOne(req.body);
    const insertedSong = await songsCollection.findOne({ _id: result.insertedId });
    res.status(201).json(insertedSong);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', localAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const update = { $set: { ...req.body, modifiedAt: new Date().toISOString() } };
    let result = { matchedCount: 0 };
    let updatedSong = null;

    if (!isNaN(Number(id))) {
      result = await songsCollection.updateOne({ id: parseInt(id) }, update);
      if (result.matchedCount > 0) {
        updatedSong = await songsCollection.findOne({ id: parseInt(id) });
      }
    }
    if (result.matchedCount === 0) {
      let objectId = null;
      try {
        objectId = new ObjectId(id);
      } catch (e) { /* Not a valid ObjectId, ignore */ }
      if (objectId) {
        result = await songsCollection.updateOne({ _id: objectId }, update);
        if (result.matchedCount > 0) {
          updatedSong = await songsCollection.findOne({ _id: objectId });
        }
      }
    }
    if (!updatedSong) {
      return res.status(404).json({ error: 'Song not found' });
    }
    res.json(updatedSong);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', localAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let result = { deletedCount: 0 };
    if (!isNaN(Number(id))) {
      result = await songsCollection.deleteOne({ id: parseInt(id) });
    }
    if (result.deletedCount === 0) {
      try {
        result = await songsCollection.deleteOne({ _id: new ObjectId(id) });
      } catch (e) { /* Not a valid ObjectId, ignore */ }
    }
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    res.json({ message: 'Song deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs', localAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    await songsCollection.deleteMany({});
    res.json({ message: 'All songs deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Temporary Admin Promotion ---
app.get('/make-me-admin', async (req, res) => {
  const email = 'swareshpawar@gmail.com';
  const result = await usersCollection.updateOne({ email }, { $set: { isAdmin: true } });
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ message: `${email} promoted to admin` });
});

// --- Main Application Logic ---
async function main() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db('PraiseAndWorship');
    songsCollection = db.collection('PraiseAndWorships');
    usersCollection = db.collection('Users');
    favoritesCollection = db.collection('Favorites');
    setlistsCollection = db.collection('Setlists');
  suggestedWeightsCollection = db.collection('SuggestedWeights');

    console.log('[ENV] MONGODB_URI:', process.env.MONGODB_URI ? '(set)' : '(not set)');
    console.log('[ENV] JWT_SECRET:', process.env.JWT_SECRET ? '(set)' : '(not set)');
    console.log('[ENV] PORT:', process.env.PORT);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`[ENV] Backend server URL: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

main();