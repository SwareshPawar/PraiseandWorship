/**
 * Data Normalization Script for Loop Matching System
 * 
 * This script fixes data inconsistencies that prevent loop matching:
 * 1. Normalizes taal values to lowercase (Keherwa → keherwa)
 * 2. Ensures tempo is stored as BPM number (not category string)
 * 3. Converts single genre string to genres array
 * 
 * Run this ONCE after connecting to MongoDB
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/songsdb';

// Taal normalization map (UI values → standardized lowercase)
const TAAL_NORMALIZATION = {
    'Keherwa': 'keherwa',
    'Keherwa Slow': 'keherwa slow',
    'Keherwa Bhajani': 'keherwa bhajani',
    'Dadra': 'dadra',
    'Dadra Slow': 'dadra slow',
    'TeenTaal': 'teentaal',
    'EkTaal': 'ektaal',
    'JhapTaal': 'jhaptaal',
    'Rupak': 'rupak',
    'Deepchandi': 'deepchandi',
    'Chautaal': 'chautaal',
    'Tilwada': 'tilwada',
    'Addha': 'addha',
    // Add more as needed
};

async function normalizeData() {
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db();
        const songsCollection = db.collection('songs');
        
        const allSongs = await songsCollection.find({}).toArray();
        console.log(`📊 Found ${allSongs.length} songs to check\n`);
        
        let taalFixed = 0;
        let genreFixed = 0;
        let tempoFixed = 0;
        
        for (const song of allSongs) {
            const updates = {};
            
            // 1. Fix taal casing
            if (song.taal && TAAL_NORMALIZATION[song.taal]) {
                updates.taal = TAAL_NORMALIZATION[song.taal];
                console.log(`🔧 Song ${song.id}: Taal "${song.taal}" → "${updates.taal}"`);
                taalFixed++;
            } else if (song.taal && song.taal !== song.taal.toLowerCase()) {
                updates.taal = song.taal.toLowerCase();
                console.log(`🔧 Song ${song.id}: Taal "${song.taal}" → "${updates.taal}"`);
                taalFixed++;
            }
            
            // 2. Fix genre (string → array)
            if (song.genre && typeof song.genre === 'string' && !song.genres) {
                updates.genres = [song.genre];
                console.log(`🔧 Song ${song.id}: Added genres array from genre "${song.genre}"`);
                genreFixed++;
            } else if (!song.genres && !song.genre) {
                updates.genres = [];
                console.log(`🔧 Song ${song.id}: Set empty genres array`);
                genreFixed++;
            }
            
            // 3. Fix tempo (ensure BPM number exists)
            // If tempo is a category string but no BPM, log warning
            if (song.tempo && ['slow', 'medium', 'fast'].includes(song.tempo.toLowerCase())) {
                if (!song.bpm) {
                    console.log(`⚠️  Song ${song.id}: Has tempo category "${song.tempo}" but no BPM value`);
                }
            }
            // If BPM exists but is string, convert to number
            if (song.bpm && typeof song.bpm === 'string') {
                updates.bpm = parseInt(song.bpm);
                console.log(`🔧 Song ${song.id}: BPM "${song.bpm}" → ${updates.bpm}`);
                tempoFixed++;
            }
            
            // Apply updates
            if (Object.keys(updates).length > 0) {
                await songsCollection.updateOne(
                    { _id: song._id },
                    { 
                        $set: {
                            ...updates,
                            updatedAt: new Date().toISOString(),
                            updatedBy: 'DataNormalizationScript'
                        }
                    }
                );
            }
        }
        
        console.log('\n📊 Summary:');
        console.log(`✅ Taal values normalized: ${taalFixed}`);
        console.log(`✅ Genre strings converted to arrays: ${genreFixed}`);
        console.log(`✅ BPM values converted to numbers: ${tempoFixed}`);
        
        // Generate report of current state
        console.log('\n📈 Current Data State:');
        
        // Unique taals
        const taals = await songsCollection.distinct('taal');
        console.log('\n🎵 Unique Taal values:');
        taals.forEach(t => console.log(`  - ${t}`));
        
        // Songs without genres array
        const noGenres = await songsCollection.countDocuments({ 
            $or: [
                { genres: { $exists: false } },
                { genres: { $size: 0 } }
            ]
        });
        console.log(`\n⚠️  Songs without genres: ${noGenres}`);
        
        // Songs without BPM
        const noBpm = await songsCollection.countDocuments({ 
            $or: [
                { bpm: { $exists: false } },
                { bpm: null },
                { bpm: '' }
            ]
        });
        console.log(`⚠️  Songs without BPM: ${noBpm}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run if called directly
if (require.main === module) {
    normalizeData()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { normalizeData };
