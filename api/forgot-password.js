// Password reset serverless function
const { MongoClient, ServerApiVersion } = require('mongodb');

// Import auth functions
const { 
  generateOTP,
  storeOTP,
  sendEmailOTP,
  findUserForPasswordReset,
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
    console.log('Connected to MongoDB for password reset');
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
    
    const { identifier, method } = req.body;
    
    console.log(`🔐 Password reset request for ${identifier} via ${method}`);
    
    if (!identifier || !method) {
      return res.status(400).json({ error: 'Email/phone and method are required' });
    }
    
    if (!['email', 'sms'].includes(method)) {
      return res.status(400).json({ error: 'Method must be email or sms' });
    }
    
    // Find user
    const user = await findUserForPasswordReset(db, identifier);
    if (!user) {
      console.log(`❌ User not found for: ${identifier}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ User found: ${user.firstName || 'Unknown'}`);
    
    // Generate and store OTP
    const otp = generateOTP();
    await storeOTP(db, identifier, otp, method);
    console.log(`🔢 OTP generated and stored`);
    
    // Send OTP via email
    if (method === 'email') {
      if (!user.email) {
        return res.status(400).json({ error: 'No email associated with this account' });
      }
      await sendEmailOTP(user.email, otp, user.firstName);
      console.log(`✅ Email OTP sent successfully`);
    }
    
    return res.json({ 
      success: true,
      message: `OTP sent successfully via ${method}`,
      method,
      maskedIdentifier: method === 'email' 
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
        : user.phone.replace(/(\+?\d{2})(\d*)(\d{2})/, '$1***$3')
    });
    
  } catch (err) {
    console.error('❌ Password reset error:', err);
    return res.status(500).json({ 
      error: 'Password reset service temporarily unavailable. Please try again later.',
      details: err.message
    });
  }
};