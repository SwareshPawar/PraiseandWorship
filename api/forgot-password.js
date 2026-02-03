// Serverless function for Vercel - Password Reset
const { MongoClient, ServerApiVersion } = require('mongodb');
const nodemailer = require('nodemailer');

// Helper functions
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

async function storeOTP(db, identifier, otp, method) {
  const otpCollection = db.collection('PasswordResetOTPs');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await otpCollection.updateOne(
    { identifier },
    {
      $set: {
        identifier,
        otp,
        method,
        createdAt: new Date(),
        expiresAt,
        verified: false
      }
    },
    { upsert: true }
  );
}

async function sendEmailOTP(email, otp, firstName) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error('Email service not configured');
  }

  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const mailOptions = {
    from: `"Praise & Worship Songs" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${firstName || 'there'},</p>
        <p>Your OTP for password reset is:</p>
        <h1 style="color: #2563eb; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

async function sendSMSOTP(phone, otp, firstName) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    throw new Error('SMS service not configured');
  }

  const twilio = require('twilio')(accountSid, authToken);
  
  await twilio.messages.create({
    body: `Hi ${firstName || 'there'}! Your Praise & Worship password reset OTP is: ${otp}. Valid for 10 minutes.`,
    from: twilioPhone,
    to: phone
  });
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
    const { identifier, method } = req.body;
    
    console.log(`🔐 Password reset request for ${identifier} via ${method}`);
    
    if (!identifier || !method) {
      return res.status(400).json({ error: 'Email/phone and method are required' });
    }
    
    if (!['email', 'sms'].includes(method)) {
      return res.status(400).json({ error: 'Method must be email or sms' });
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
    
    // Find user
    const user = await findUserForPasswordReset(db, identifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ User found: ${user.firstName || 'Unknown'}`);
    
    // Generate and store OTP
    const otp = generateOTP();
    await storeOTP(db, identifier, otp, method);
    
    // Send OTP
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
    
    console.log(`✅ OTP sent successfully via ${method}`);
    
    res.status(200).json({ 
      message: `OTP sent successfully via ${method}`,
      method,
      maskedIdentifier: method === 'email' 
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
        : user.phone.replace(/(\+?\d{2})(\d*)(\d{2})/, '$1***$3')
    });
    
  } catch (err) {
    console.error('❌ Forgot password error:', err);
    
    let errorMessage = 'Failed to send OTP';
    
    if (err.message && err.message.includes('Email service not configured')) {
      errorMessage = 'Email service is currently unavailable. Please try SMS option.';
    } else if (err.message && err.message.includes('SMS service not configured')) {
      errorMessage = 'SMS service is currently unavailable. Please try email option.';
    }
    
    res.status(500).json({ error: errorMessage });
  } finally {
    if (client) {
      await client.close();
    }
  }
};
