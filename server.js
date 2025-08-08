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

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
let db;
let songsCollection;

const uri = process.env.MONGODB_URI || 'mongodb+srv://genericuser:Swar%40123@cluster0.ovya99h.mongodb.net/PraiseAndWorship?retryWrites=true&w=majority';
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
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://praiseandworship.onrender.com',
    'https://swareshpawar.github.io'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.static('public'));


const JWT_SECRET = process.env.JWT_SECRET || 'changeme_secret';
let usersCollection;

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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}


async function main() {
  try {
    await client.connect();
    db = client.db('PraiseAndWorship');
    songsCollection = db.collection('PraiseAndWorships');
    usersCollection = db.collection('Users');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.isAdmin) {
    return next();
  }
  return res.status(403).json({ error: 'Admin access required' });
}

// ===== Local Auth Endpoints =====
// Register
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const existing = await usersCollection.findOne({ email });
  if (existing) return res.status(409).json({ error: 'User already exists' });
  const hash = await bcrypt.hash(password, 10);
  const user = { email, password: hash, name, isAdmin: false };
  const result = await usersCollection.insertOne(user);
  const token = generateToken({ ...user, _id: result.insertedId });
  res.json({ token });
});

// Login
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

// Promote user to admin (admin only)
app.post('/api/users/:id/promote', localAuthMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { isAdmin: true } });
  if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User promoted to admin' });
});

// List users (admin only)
app.get('/api/users', localAuthMiddleware, requireAdmin, async (req, res) => {
  const users = await usersCollection.find({}, { projection: { password: 0 } }).toArray();
  res.json(users);
});
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await songsCollection.find({}).toArray();
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/songs', localAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    if (typeof req.body.id !== 'number') {
      const last = await songsCollection.find().sort({ id: -1 }).limit(1).toArray();
      req.body.id = last.length ? last[0].id + 1 : 1;
    }
    const result = await songsCollection.insertOne(req.body);
    const insertedSong = await songsCollection.findOne({ _id: result.insertedId });
    res.status(201).json(insertedSong);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', localAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const update = { $set: req.body };
    const result = await songsCollection.updateOne({ id: parseInt(id) }, update);
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    res.json({ message: 'Song updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', localAuthMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let result = { deletedCount: 0 };
    // Try to delete by numeric id first
    if (!isNaN(Number(id))) {
      result = await songsCollection.deleteOne({ id: parseInt(id) });
    }
    // If not found, try by MongoDB _id
    if (result.deletedCount === 0) {
      try {
        result = await songsCollection.deleteOne({ _id: new ObjectId(id) });
      } catch (e) {
        // Not a valid ObjectId, ignore
      }
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

app.get('/api/userdata', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const doc = await db.collection('UserData').findOne({ _id: userId });
  res.json(doc || { favorites: [], praiseSetlist: [], worshipSetlist: [] });
});

app.put('/api/userdata', localAuthMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { favorites, praiseSetlist, worshipSetlist, name, email } = req.body;
  await db.collection('UserData').updateOne(
    { _id: userId },
    { $set: { favorites, praiseSetlist, worshipSetlist, name, email } },
    { upsert: true }
  );
  res.json({ message: 'User data updated' });
});

// ====== SPACE FOR ADMIN ASSIGNMENT ======
// To assign admin, use the /api/users/:id/promote endpoint as an admin user.

// --- TEMPORARY: Promote Swaresh to admin via GET /make-me-admin (for setup only) ---
app.get('/make-me-admin', async (req, res) => {
  const email = 'swareshpawar@gmail.com';
  const result = await usersCollection.updateOne({ email }, { $set: { isAdmin: true } });
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ message: `${email} promoted to admin` });
});
main().then(() => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('Error starting server:', err);
});