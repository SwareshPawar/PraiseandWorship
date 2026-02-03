// Vercel Serverless Function: Register
const { connectToDatabase } = require('./_db');
const { getCorsHeaders, hashPassword, generateToken } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).json({});
  }

  const corsHeaders = getCorsHeaders();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    let { firstName, lastName, username, email, phone, password, isAdmin } = req.body;

    if (!firstName || !lastName || !username || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    username = username.trim().toLowerCase();
    email = email.trim().toLowerCase();

    // Check if user already exists (username or email)
    const existingUser = await db.collection('Users').findOne({ 
      $or: [
        { username: username },
        { email: email }
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User or email already exists' });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = {
      firstName,
      lastName,
      username,
      email,
      phone,
      password: hashedPassword,
      isAdmin: isAdmin || false,
      createdAt: new Date().toISOString()
    };

    const result = await db.collection('Users').insertOne(newUser);
    const userId = result.insertedId.toString();

    const token = generateToken({
      id: userId,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      isAdmin: newUser.isAdmin
    });

    return res.status(201).json({
      token,
      user: {
        id: userId,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        isAdmin: newUser.isAdmin
      }
    });

  } catch (error) {
    console.error('Register API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
