require('dotenv').config();
const express = require('express');

const app = express();

app.use(express.json());

// Simple test route
app.get('/test', (req, res) => {
  res.json({ message: 'Test successful' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Test server running on port ${PORT}`));