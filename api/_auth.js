// Shared auth middleware and helpers for Vercel serverless functions
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Middleware to extract and verify JWT from request
function authMiddleware(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }
  
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  
  if (!payload) {
    return { error: 'Invalid or expired token', status: 401 };
  }
  
  return { user: payload };
}

// Check if user is admin
function requireAdmin(user) {
  if (!user || !user.isAdmin) {
    return { error: 'Admin access required', status: 403 };
  }
  return null;
}

// CORS headers for Vercel
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  };
}

module.exports = {
  verifyToken,
  generateToken,
  hashPassword,
  comparePassword,
  authMiddleware,
  requireAdmin,
  getCorsHeaders,
  JWT_SECRET
};
