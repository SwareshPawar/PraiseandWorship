require('dotenv').config();
const express = require('express');

const app = express();

app.use(express.json());

// Test routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'Minimal server working', timestamp: new Date().toISOString() });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Minimal server running on port ${PORT}`));
}

module.exports = app;