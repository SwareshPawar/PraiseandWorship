const app = require('../server.js');

// Vercel serverless function handler
module.exports = (req, res) => {
  return app(req, res);
};