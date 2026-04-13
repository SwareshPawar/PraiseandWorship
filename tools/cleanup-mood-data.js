// Cleanup script to fix mood data inconsistencies
// This script will:
// 1. Find songs with mood arrays containing comma-separated strings
// 2. Split comma-separated strings into individual mood elements
// 3. Remove duplicates and clean up the data
// 4. Standardize everything to clean arrays before final migration

const MOOD_TAGS = [
    "Dance", "Patriotic", "Christmas", "Easter", "Action", "Forgiveness", 
    "Thanksgiving", "Good Friday", "Holy Spirit", "Love", "Qawalli", "Miracle"
];

// Authentication functions
async function getStoredAuthData() {
    try {
        // Check for jwtToken (used by main app)
        const jwtToken = localStorage.getItem('jwtToken');
        if (jwtToken && jwtToken.trim()) {
            console.log('✅ Found stored JWT token');
            return {
                token: jwtToken,
                user: { email: 'authenticated_user' } // Simplified user object
            };
        }
        
        // Fallback: Check for authData format
        const authData = localStorage.getItem('authData');
        if (authData) {
            const parsed = JSON.parse(authData);
            if (parsed.token && parsed.user) {
                console.log('✅ Found stored authentication data');
                return parsed;
            }
        }
    } catch (e) {
        console.warn('⚠️ Could not read stored auth data:', e.message);
    }
    return null;
}

async function authenticate() {
    // Try to get stored auth data first
    let authData = await getStoredAuthData();
    
    if (!authData) {
        console.log('❌ No stored authentication found. Please login to your main app first.');
        console.log('💡 Open your main application (index.html) and login, then come back to this tool.');
        return null;
    }
    
    console.log(`✅ Authenticated as: ${authData.user.email}`);
    return authData;
}

// Clean and normalize mood data
function cleanMoodArray(moodArray) {
    if (!Array.isArray(moodArray)) {
        return [];
    }
    
    const allMoods = new Set();
    
    moodArray.forEach(mood => {
        if (typeof mood === 'string' && mood.trim()) {
            // Check if this mood contains commas (comma-separated string)
            if (mood.includes(',')) {
                // Split the comma-separated string and add each part
                const splitMoods = mood.split(',').map(m => m.trim()).filter(m => m);
                splitMoods.forEach(splitMood => {
                    if (MOOD_TAGS.includes(splitMood)) {
                        allMoods.add(splitMood);
                    }
                });
            } else {
                // Single mood string
                if (MOOD_TAGS.includes(mood.trim())) {
                    allMoods.add(mood.trim());
                }
            }
        }
    });
    
    return Array.from(allMoods).sort();
}

// Process a single song
function processSongForCleanup(song) {
    const originalMood = Array.isArray(song.mood) ? [...song.mood] : [];
    const cleanedMood = cleanMoodArray(originalMood);
    
    // Check if cleaning is needed
    const needsCleaning = JSON.stringify(originalMood.sort()) !== JSON.stringify(cleanedMood.sort());
    
    return {
        needsUpdate: needsCleaning,
        originalMood,
        cleanedMood,
        changes: {
            before: originalMood,
            after: cleanedMood,
            hasCommaSeparated: originalMood.some(mood => typeof mood === 'string' && mood.includes(',')),
            removedInvalid: originalMood.filter(mood => !MOOD_TAGS.includes(mood.trim())),
            splitCommas: originalMood.filter(mood => typeof mood === 'string' && mood.includes(','))
        }
    };
}

// Main cleanup function
async function cleanupMoodData(dryRun = true) {
    console.log('🧹 Starting mood data cleanup...');
    console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE UPDATE'}`);
    
    const authData = await authenticate();
    if (!authData) {
        return {
            totalSongs: 0,
            songsNeedingCleanup: 0,
            problematicSongs: [],
            error: 'Authentication failed'
        };
    }
    
    try {
        // Fetch all songs
        console.log('📥 Fetching all songs...');
        const response = await fetch('http://localhost:3001/api/songs', {
            headers: {
                'Authorization': `Bearer ${authData.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const songs = await response.json();
        console.log(`📊 Found ${songs.length} songs to analyze`);
        
        let processedCount = 0;
        let needsUpdateCount = 0;
        const problematicSongs = [];
        
        for (const song of songs) {
            const result = processSongForCleanup(song);
            processedCount++;
            
            if (result.needsUpdate) {
                needsUpdateCount++;
                problematicSongs.push({
                    id: song.id,
                    title: song.title,
                    result
                });
                
                console.log(`\n🔍 Song "${song.title}" (ID: ${song.id}):`);
                console.log(`   📝 Original mood: [${result.originalMood.join(', ')}]`);
                console.log(`   ✨ Cleaned mood: [${result.cleanedMood.join(', ')}]`);
                
                if (result.changes.hasCommaSeparated) {
                    console.log(`   🔄 Found comma-separated: [${result.changes.splitCommas.join(', ')}]`);
                }
                
                if (result.changes.removedInvalid.length > 0) {
                    console.log(`   🚫 Removed invalid: [${result.changes.removedInvalid.join(', ')}]`);
                }
                
                // Update the song if not in dry run mode
                if (!dryRun) {
                    try {
                        console.log(`   📤 Updating song...`);
                        const updateResponse = await fetch(`http://localhost:3001/api/songs/${song.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${authData.token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                ...song,
                                mood: result.cleanedMood
                            })
                        });
                        
                        if (updateResponse.ok) {
                            console.log(`   ✅ Successfully updated`);
                        } else {
                            console.log(`   ❌ Update failed: ${updateResponse.status}`);
                        }
                    } catch (error) {
                        console.log(`   ❌ Update error: ${error.message}`);
                    }
                }
            }
        }
        
        console.log('\n📊 Cleanup Summary:');
        console.log(`   📝 Total songs processed: ${processedCount}`);
        console.log(`   🔧 Songs needing cleanup: ${needsUpdateCount}`);
        console.log(`   ✅ Songs already clean: ${processedCount - needsUpdateCount}`);
        
        if (dryRun && needsUpdateCount > 0) {
            console.log('\n⚠️ This was a DRY RUN - no changes were made.');
            console.log('💡 Run with cleanupMoodData(false) to apply changes.');
        } else if (!dryRun) {
            console.log('\n🎉 Cleanup completed! All mood data has been standardized.');
        } else {
            console.log('\n🎉 No cleanup needed - all mood data is already clean!');
        }
        
        return {
            totalSongs: processedCount,
            songsNeedingCleanup: needsUpdateCount,
            problematicSongs: problematicSongs
        };
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        return {
            totalSongs: 0,
            songsNeedingCleanup: 0,
            problematicSongs: [],
            error: error.message
        };
    }
}

// Export functions for use
if (typeof window !== 'undefined') {
    window.cleanupMoodData = cleanupMoodData;
    window.processSongForCleanup = processSongForCleanup;
}

console.log('🧹 Mood Data Cleanup Tool Loaded');
console.log('📋 Available commands:');
console.log('   cleanupMoodData(true)  - Dry run (analyze only)');
console.log('   cleanupMoodData(false) - Live update (apply changes)');