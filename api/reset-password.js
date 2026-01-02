// Password reset completion serverless function
const { MongoClient, ServerApiVersion } = require('mongodb');

// Import auth functions
const { 
  resetUserPassword
} = require('../utils/auth');

let db, isConnected = false;
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function connectToDatabase() {
  if (isConnected && db) return;
  try {
    await client.connect();
    db = client.db('OldNewSongs'); // Use the correct database name
    isConnected = true;
    console.log('Connected to MongoDB for password reset completion');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    throw err;
  }
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const { identifier, otp, newPassword } = req.body;
    
    console.log(`🔐 Password reset completion for ${identifier}`);
    
    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ error: 'Identifier, OTP, and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const result = await resetUserPassword(db, identifier, newPassword, otp);
    console.log(`✅ Password reset completed successfully`);
    
    return res.json({
      success: true,
      message: result.message || 'Password reset successfully'
    });
    
  } catch (err) {
    console.error('❌ Reset password error:', err);
    return res.status(400).json({ 
      error: err.message || 'Failed to reset password'
    });
  }
};