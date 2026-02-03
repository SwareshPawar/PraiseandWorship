// Vercel Serverless Function: Health Check
const { connectToDatabase } = require('./_db');
const { getCorsHeaders } = require('./_auth');

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    res.status(200).json({
      status: 'healthy',
      service: 'Praise & Worship API',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'production',
      database: 'connected',
      collectionsCount: collections.length,
      emailConfigured: !!process.env.EMAIL_USER,
      smsConfigured: !!process.env.TWILIO_ACCOUNT_SID
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
