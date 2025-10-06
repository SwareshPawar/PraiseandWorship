const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

// Optional dependencies - only load if available
let nodemailer = null;
let twilio = null;

try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('Nodemailer not installed - email functionality disabled');
}

try {
  twilio = require('twilio');
} catch (e) {
  console.log('Twilio not installed - SMS functionality disabled');
}

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Email configuration - create transporter only when needed to avoid startup errors
let emailTransporter = null;

function createEmailTransporter() {
  if (!nodemailer) {
    console.log('Nodemailer not available - cannot create email transporter');
    return null;
  }
  
  if (!emailTransporter && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    emailTransporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }
  return emailTransporter;
}

// Twilio configuration  
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function getUserCollection(db) {
  return db.collection('Users');
}

async function registerUser(db, { firstName, lastName, username, email, phone, password, isAdmin = false }) {
  const users = await getUserCollection(db);
  if (!firstName || !lastName || !username || !email || !phone || !password) {
    throw new Error('All fields are required');
  }
  // Check for existing username or email (case-insensitive)
  const existing = await users.findOne({
    $or: [
      { username: username.toLowerCase() },
      { email: email.toLowerCase() }
    ]
  });
  if (existing) throw new Error('User or email already exists');
  const hash = await bcrypt.hash(password, 10);
  const result = await users.insertOne({
    firstName,
    lastName,
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    phone,
    password: hash,
    isAdmin
  });
  return { id: result.insertedId, firstName, lastName, username, email, phone, isAdmin };
}

async function authenticateUser(db, { loginInput, password }) {
  const users = await getUserCollection(db);
  // Find by username or email, case-insensitive
  const user = await users.findOne({
    $or: [
      { username: loginInput },
      { email: loginInput }
    ]
  });
  if (!user) throw new Error('Invalid credentials');
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Invalid credentials');
  const token = jwt.sign({
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    isAdmin: user.isAdmin
  }, JWT_SECRET, { expiresIn: '7d' });
  return {
  token,
  user: {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    isAdmin: user.isAdmin
  }
};
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store OTP in database with expiry (5 minutes)
async function storeOTP(db, identifier, otp, type = 'email') {
  const otpCollection = db.collection('PasswordResetOTPs');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
  
  // Remove any existing OTPs for this identifier
  await otpCollection.deleteMany({ identifier, type });
  
  await otpCollection.insertOne({
    identifier,
    otp,
    type,
    expiresAt,
    createdAt: new Date()
  });
}

// Verify OTP from database
async function verifyOTP(db, identifier, otp, type = 'email') {
  const otpCollection = db.collection('PasswordResetOTPs');
  
  const storedOTP = await otpCollection.findOne({
    identifier,
    otp,
    type,
    expiresAt: { $gt: new Date() }
  });
  
  if (storedOTP) {
    // Delete the OTP after successful verification
    await otpCollection.deleteOne({ _id: storedOTP._id });
    return true;
  }
  
  return false;
}

// Send email OTP
async function sendEmailOTP(email, otp, firstName = 'User') {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error('Email service not configured. Please use SMS option or contact administrator.');
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    throw new Error('Email service not properly configured. Please use SMS option or contact administrator.');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP - New & Old Songs',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">Password Reset Request</h2>
        <p>Hello ${firstName},</p>
        <p>You have requested to reset your password for your New & Old Songs account.</p>
        <p>Your OTP code is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 20px 0;">
          ${otp}
        </div>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">New & Old Songs App</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Email sending error:', error);
    if (error.code === 'EAUTH' || error.message.includes('Username and Password not accepted')) {
      throw new Error('Invalid email credentials. Please check your Gmail app password setup.');
    }
    throw new Error('Failed to send email. Please try again or contact administrator.');
  }
}

// Send SMS OTP
async function sendSMSOTP(phone, otp, firstName = 'User') {
  if (!twilioClient) {
    throw new Error('SMS service not configured. Please contact administrator.');
  }

  // Ensure phone number is in international format
  const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
  
  const message = `Hello ${firstName}, your New & Old Songs password reset OTP is: ${otp}. This code expires in 5 minutes.`;
  
  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: formattedPhone
  });
}

// Find user by email or phone
async function findUserForPasswordReset(db, identifier) {
  const users = await getUserCollection(db);
  
  // Try to find user by email first, then by phone
  let user = await users.findOne({ email: identifier.toLowerCase() });
  
  if (!user) {
    // Try finding by phone (remove any formatting)
    const cleanPhone = identifier.replace(/[\s\-\(\)\+]/g, '');
    user = await users.findOne({ 
      $or: [
        { phone: identifier },
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` }
      ]
    });
  }
  
  return user;
}

// Reset user password
async function resetUserPassword(db, identifier, newPassword, otp) {
  const users = await getUserCollection(db);
  
  // Find user
  const user = await findUserForPasswordReset(db, identifier);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Determine if identifier is email or phone
  const isEmail = identifier.includes('@');
  const otpType = isEmail ? 'email' : 'sms';
  
  // Verify OTP
  const otpValid = await verifyOTP(db, identifier, otp, otpType);
  if (!otpValid) {
    throw new Error('Invalid or expired OTP');
  }
  
  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  // Update user password
  await users.updateOne(
    { _id: user._id },
    { $set: { password: hashedPassword } }
  );
  
  return { message: 'Password reset successfully' };
}

module.exports = { 
  registerUser, 
  authenticateUser, 
  verifyToken,
  generateOTP,
  storeOTP,
  verifyOTP,
  sendEmailOTP,
  sendSMSOTP,
  findUserForPasswordReset,
  resetUserPassword
};
