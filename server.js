require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
let db;
let songsCollection;

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
    'http://127.0.0.1:5500', // Live Server
    'http://localhost:5500',  // Live Server
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://oldandnew.onrender.com',
    'https://swareshpawar.github.io'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('.'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Initialize connection for serverless
let isConnected = false;

async function connectToDatabase() {
  if (isConnected && db) {
    console.log('Database already connected, reusing connection');
    return;
  }
  
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MongoDB URI available:', !!uri);
    
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    await client.connect();
    db = client.db('PraiseAndWorship');
    songsCollection = db.collection('PraiseAndWorships');
    isConnected = true;
    
    // Debug database connection
    console.log('Successfully connected to MongoDB');
    console.log('Database name:', db.databaseName);
    console.log('Collection name:', songsCollection.collectionName);
    
    // Test query to see what we're actually getting
    const sampleSong = await songsCollection.findOne({});
    console.log('Sample song title:', sampleSong ? sampleSong.title : 'No songs found');
    console.log('Sample song category:', sampleSong ? sampleSong.category : 'N/A');
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
    
    console.log('DB Middleware - Before connection check. DB exists:', !!db, 'isConnected:', isConnected);
    await connectToDatabase();
    console.log('DB Middleware - After connection. DB exists:', !!db);
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
    const { language, scale, timeSignature, taal, tempo, genre, vocal, mood } = req.body;
    if ([language, scale, timeSignature, taal, tempo, genre, vocal, mood].some(v => typeof v !== 'number')) {
      return res.status(400).json({ error: 'All weights must be numbers' });
    }
    const total = language + scale + timeSignature + taal + tempo + genre + vocal + mood;
    if (total !== 100) {
      return res.status(400).json({ error: 'Total must be 100' });
    }
    const lastModified = new Date().toISOString();
    await db.collection('config').updateOne(
      { _id: 'weights' },
      { $set: { language, scale, timeSignature, taal, tempo, genre, vocal, mood, lastModified } },
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
    // Additional debug logging
    console.log('Login attempt - DB status:', !!db);
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
    res.status(500).json({ error: err.message || 'Failed to send OTP' });
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
    res.status(400).json({ error: err.message || 'Failed to reset password' });
  }
});

app.get('/api/songs', async (req, res) => {
  console.log('DEBUG: GET /api/songs request received');
  console.log('DEBUG: Request origin:', req.headers.origin);
  console.log('DEBUG: MongoDB connected:', !!db);
  console.log('DEBUG: Songs collection:', !!songsCollection);
  
  try {
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
    console.log('DEBUG: MongoDB query:', JSON.stringify(query));
    const songs = await songsCollection.find(query).toArray();
    console.log('DEBUG: Found songs count:', songs.length);
    res.json(songs);
  } catch (err) {
    console.error('DEBUG: Error in GET /api/songs:', err);
    res.status(500).json({ error: err.message });
  }
});

// Protected: only logged-in users can add, update, or delete songs
app.post('/api/songs', authMiddleware, async (req, res) => {
  try {
    console.log('DEBUG /api/songs POST req.user:', req.user);
    console.log('DEBUG /api/songs POST req.body:', req.body);
    if (typeof req.body.id !== 'number') {
      const last = await songsCollection.find().sort({ id: -1 }).limit(1).toArray();
      req.body.id = last.length ? last[0].id + 1 : 1;
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
    
    const result = await songsCollection.insertOne(req.body);
    const insertedSong = await songsCollection.findOne({ _id: result.insertedId });
    res.status(201).json(insertedSong);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/songs/:id', authMiddleware, async (req, res) => {
  console.log('DEBUG /api/songs/:id req.user:', req.user);
  try {
    const { id } = req.params;
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
    const result = await songsCollection.updateOne({ id: parseInt(id) }, update);
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    // Fetch and return the updated song object
    const updatedSong = await songsCollection.findOne({ id: parseInt(id) });
    res.json(updatedSong);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await songsCollection.deleteOne({ id: parseInt(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }
    res.json({ message: 'Song deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/songs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    await songsCollection.deleteMany({});
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
    console.log('Removing song from global setlist:', { setlistId, songId });
    if (!setlistId || !songId) {
      return res.status(400).json({ error: 'Setlist ID and song ID are required' });
    }
    
    // First, let's check what the setlist looks like before removal
    const setlistBefore = await db.collection('GlobalSetlists').findOne(
      { _id: new (require('mongodb').ObjectId)(setlistId) }
    );
    console.log('Setlist before removal:', setlistBefore ? setlistBefore.songs : 'not found');
    
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
    
    console.log('Remove result:', result);
    
    // Check what the setlist looks like after removal
    const setlistAfter = await db.collection('GlobalSetlists').findOne(
      { _id: new (require('mongodb').ObjectId)(setlistId) }
    );
    console.log('Setlist after removal:', setlistAfter ? setlistAfter.songs : 'not found');
    
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
    console.log('Removing song from personal setlist:', { setlistId, songId, userId });
    
    if (!setlistId || !songId) {
      return res.status(400).json({ error: 'Setlist ID and song ID are required' });
    }
    
    // First, let's check what the setlist looks like before removal
    const setlistBefore = await db.collection('MySetlists').findOne(
      { _id: new (require('mongodb').ObjectId)(setlistId), userId }
    );
    console.log('Personal setlist before removal:', setlistBefore ? setlistBefore.songs : 'not found');
    
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
    
    console.log('Remove result:', result);
    
    // Check what the setlist looks like after removal
    const setlistAfter = await db.collection('MySetlists').findOne(
      { _id: new (require('mongodb').ObjectId)(setlistId), userId }
    );
    console.log('Personal setlist after removal:', setlistAfter ? setlistAfter.songs : 'not found');
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Personal setlist not found' });
    }
    
    res.json({ success: true, message: 'Song removed from personal setlist' });
  } catch (err) {
    console.error('Error removing song from personal setlist:', err);
    res.status(500).json({ error: err.message });
  }
});

// For local development - initialize database first
if (process.env.NODE_ENV !== 'production') {
  async function startLocalServer() {
    try {
      await connectToDatabase();
      const PORT = process.env.PORT || 3001;
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }
  startLocalServer();
}

// Export for Vercel
module.exports = app;