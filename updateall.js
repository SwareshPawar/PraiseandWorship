const { MongoClient } = require('mongodb');

async function updateAllSongs() {
  const uri = 'mongodb+srv://genericuser:Swar%40123@cluster0.ovya99h.mongodb.net/PraiseAndWorship?retryWrites=true&w=majority'; // Replace with your connection string
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('PraiseAndWorship');
    const songs = db.collection('PraiseAndWorships');
    const today = new Date().toISOString();
    const result = await songs.updateMany(
      {},
      { $set: { contributor: 'Swaresh', createdAt: today, date: today } }
    );
    console.log('Updated documents:', result.modifiedCount);
  } finally {
    await client.close();
  }
}

updateAllSongs();