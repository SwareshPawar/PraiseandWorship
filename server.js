const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection (replace <MONGODB_URI> with your actual connection string)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://genericuser:Swar%40123@cluster0.ovya99h.mongodb.net/PraiseAndWorship?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Test route
app.get('/', (req, res) => {
  res.send('Praise & Worship Songs backend is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
