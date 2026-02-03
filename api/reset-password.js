// Serverless function for Vercel - Complete Password Reset
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcrypt');

async function findUserForPasswordReset(db, identifier) {
  const usersCollection = db.collection('Users');
  
  // Try email first (case-insensitive)
  let user = await usersCollection.findOne({ 
    email: identifier.toLowerCase() 
  });
  
  // If not found by email, try phone
  if (!user) {
    user = await usersCollection.findOne({ 
      phone: identifier 
    });
  }
  
  return user;
}

async function verifyOTP(db, identifier, otp) {
  const otpCollection = db.collection('PasswordResetOTPs');
  const resetRecord = await otpCollection.findOne({
    identifier,
    otp,
    verified: false,
    expiresAt: { $gt: new Date() }
  });

  if (!resetRecord) {
    return false;
  }

  // Mark as verified
  await otpCollection.updateOne(
    { _id: resetRecord._id },
    { $set: { verified: true, verifiedAt: new Date() } }
  );

  return true;
}

async function updatePassword(db, identifier, newPassword) {
  const usersCollection = db.collection('Users');
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const result = await usersCollection.updateOne(
    {
      $or: [
        { email: identifier },
        { phone: identifier }
      ]
    },
    {
      $set: {
        password: hashedPassword,
        passwordUpdatedAt: new Date()
      }
    }
  );

  return result.modifiedCount > 0;
}

// Serverless function handler
module.exports = async (req, res) => {
  // CORS headers
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'https://praiseand-worship.vercel.app',
    'https://swareshpawar.github.io',
    'https://praiseandworship.onrender.com'
  ];
  
  const origin = req.headers.origin || req.headers.Origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  
  try {
    const { identifier, otp, newPassword } = req.body;
    
    console.log(`🔐 Password reset completion for ${identifier}`);
    
    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not configured');
    }

    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    const db = client.db('PraiseAndWorship');
    
    // Verify OTP
    const isValidOTP = await verifyOTP(db, identifier, otp);
    if (!isValidOTP) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Find user
    const user = await findUserForPasswordReset(db, identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update password
    const updated = await updatePassword(db, identifier, newPassword);
    if (!updated) {
      throw new Error('Failed to update password');
    }
    
    console.log(`✅ Password reset successful for ${user.firstName || 'Unknown'}`);
    
    res.status(200).json({ 
      message: 'Password reset successful! You can now login with your new password.',
      success: true
    });
    
  } catch (err) {
    console.error('❌ Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  } finally {
    if (client) {
      await client.close();
    }
  }
};
