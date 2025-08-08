
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// Auth0 dependencies
const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'https://oldandnew.onrender.com',
    'https://swareshpawar.github.io'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Auth0 JWT middleware
const authMiddleware = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://dev-yr80e6pevtcdjxvg.us.auth0.com/.well-known/jwks.json`
  }),
  audience: "https://oldandnew.onrender.com/api",
  issuer: `https://dev-yr80e6pevtcdjxvg.us.auth0.com/`,
  algorithms: ["RS256"]
});
app.use(bodyParser.json());

// MongoDB connection (replace <MONGODB_URI> with your actual connection string)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://genericuser:Swar%40123@cluster0.ovya99h.mongodb.net/PraiseAndWorship?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));


// Song Schema & Model
const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, enum: ['praise', 'worship'], required: true },
  key: { type: String, required: true },
  tempo: String,
  time: String,
  taal: String,
  genres: [String],
  lyrics: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Song = mongoose.model('PraiseAndWorship', songSchema, 'PraiseAndWorships');

// Serve static frontend files
const path = require('path');
app.use(express.static(path.join(__dirname)));

// API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Get all songs
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await Song.find();
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

// Get song by ID
app.get('/api/songs/:id', async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    res.json(song);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch song' });
  }
});



// Add new song (public)
app.post('/api/songs', async (req, res) => {
  try {
    const song = new Song(req.body);
    await song.save();
    res.status(201).json(song);
  } catch (err) {
    res.status(400).json({ error: 'Failed to add song', details: err.message });
  }
});

// Update song (public)
app.put('/api/songs/:id', async (req, res) => {
  try {
    const song = await Song.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!song) return res.status(404).json({ error: 'Song not found' });
    res.json(song);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update song', details: err.message });
  }
});

// Delete song (protected)
app.delete('/api/songs/:id', authMiddleware, async (req, res) => {
  try {
    const song = await Song.findByIdAndDelete(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    res.json({ message: 'Song deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

// Main function to start the server
async function main() {
  try {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
