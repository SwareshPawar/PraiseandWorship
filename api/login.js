// Vercel Serverless Function: Login
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, comparePassword, generateToken } = require('./_auth');

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    let { usernameOrEmail, username, password } = req.body;

    if ((!usernameOrEmail && !username) || !password) {
      return res.status(400).json({ error: 'Username/email and password required' });
    }

    let loginInput = (usernameOrEmail || username).trim().toLowerCase();

    // Find by username or email, case-insensitive
    const user = await db.collection('Users').findOne({ 
      $or: [
        { username: loginInput },
        { email: loginInput }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await comparePassword(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isAdmin: user.isAdmin || false
    });

    return res.status(200).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin || false
      }
    });

  } catch (error) {
    console.error('Login API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
