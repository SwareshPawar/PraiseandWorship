require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function migrateDatabase() {
    try {
        console.log('🔄 Starting database migration...');
        await client.connect();
        
        const db = client.db('PraiseAndWorship');
        const collection = db.collection('PraiseAndWorships');
        
        // Get all documents
        const documents = await collection.find({}).toArray();
        console.log(`📊 Found ${documents.length} documents to migrate`);
        
        let migrated = 0;
        let skipped = 0;
        
        for (let doc of documents) {
            // Check if already has 'id' field
            if (doc.id) {
                skipped++;
                continue;
            }
            
            // Create update object to standardize the structure
            const update = {
                $set: {}
            };
            
            // Add numeric id if missing (use existing id from doc or generate from _id)
            if (!doc.id) {
                // Try to use existing 'id' field, or extract from _id, or generate a unique number
                const existingId = doc.id || parseInt(doc._id.toString().slice(-6), 16);
                update.$set.id = existingId;
            }
            
            // Ensure required fields exist with defaults
            if (!doc.title) update.$set.title = doc.title || 'Untitled Song';
            if (!doc.category) update.$set.category = doc.category || 'praise';
            if (!doc.key) update.$set.key = doc.key || 'C';
            if (!doc.tempo) update.$set.tempo = doc.tempo || '100';
            if (!doc.time) update.$set.time = doc.time || '4/4';
            if (!doc.taal) update.$set.taal = doc.taal || 'Keherwa';
            if (!doc.genres || !Array.isArray(doc.genres)) {
                update.$set.genres = doc.genres || ['Praise', 'Hindi'];
            }
            if (!doc.lyrics) update.$set.lyrics = doc.lyrics || '';
            
            // Only update if we have changes to make
            if (Object.keys(update.$set).length > 0) {
                await collection.updateOne(
                    { _id: doc._id },
                    update
                );
                migrated++;
                console.log(`✅ Migrated: ${doc.title || doc._id}`);
            } else {
                skipped++;
            }
        }
        
        console.log(`\n🎉 Migration completed!`);
        console.log(`📈 Migrated: ${migrated} documents`);
        console.log(`⏭️  Skipped: ${skipped} documents`);
        
        // Show a sample of the updated structure
        const sampleDoc = await collection.findOne({});
        console.log('\n📋 Sample document structure:');
        console.log(JSON.stringify({
            id: sampleDoc.id,
            title: sampleDoc.title,
            category: sampleDoc.category,
            key: sampleDoc.key,
            tempo: sampleDoc.tempo,
            time: sampleDoc.time,
            taal: sampleDoc.taal,
            genres: sampleDoc.genres,
            lyrics: sampleDoc.lyrics ? sampleDoc.lyrics.substring(0, 100) + '...' : ''
        }, null, 2));
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await client.close();
    }
}

// Run migration
migrateDatabase();