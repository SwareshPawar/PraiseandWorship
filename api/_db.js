// Shared database connection module for Vercel serverless functions
const { MongoClient, ServerApiVersion } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  // Return cached connection if available
  if (cachedDb && cachedClient) {
    return { db: cachedDb, client: cachedClient };
  }

  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  const db = client.db('PraiseAndWorship');

  cachedClient = client;
  cachedDb = db;

  return { db, client };
}

module.exports = { connectToDatabase };
