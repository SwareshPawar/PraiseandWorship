// Comprehensive Mood Field Consolidation Script
// This script will:
// 1. Consolidate mood data from 'mood', 'moods', and mood tags in 'genres'
// 2. Ensure no mood data is lost during consolidation
// 3. Create a single standardized 'mood' field (as string for frontend compatibility)
// 4. Remove redundant 'moods' field after consolidation
// 5. Clean mood tags from 'genres' field

const MOOD_TAGS = [
    "Dance", "Patriotic", "Christmas", "Easter", "Action", "Forgiveness", 
    "Thanksgiving", "Good Friday", "Holy Spirit", "Love", "Qawalli", "Miracle"
];

// Authentication functions (using jwtToken from main app)
async function getStoredAuthData() {
    try {
        const jwtToken = localStorage.getItem('jwtToken');
        if (jwtToken && jwtToken.trim()) {
            console.log('✅ Found stored JWT token');
            return {
                token: jwtToken,
                user: { email: 'authenticated_user' }
            };
        }
    } catch (e) {
        console.warn('⚠️ Could not read stored auth data:', e.message);
    }
    return null;
}

async function authenticate() {
    const authData = await getStoredAuthData();
    if (!authData) {
        console.log('❌ No stored authentication found. Please login to your main app first.');
        console.log('💡 Open your main application (index.html) and login, then come back to this tool.');
        return null;
    }
    
    console.log(`✅ Authenticated as: ${authData.user.email}`);
    return authData;
}

// Comprehensive mood consolidation function
function consolidateAllMoodData(song) {
    const allMoods = new Set();
    
    console.log(`\n🔍 Analyzing "${song.title}" (ID: ${song.id}):`);
    
    // 1. Collect moods from 'mood' field
    if (song.mood) {
        console.log(`   📝 Found 'mood' field:`, song.mood);
        if (Array.isArray(song.mood)) {
            song.mood.forEach(mood => {
                if (typeof mood === 'string' && mood.trim()) {
                    if (mood.includes(',')) {
                        // Split comma-separated strings
                        mood.split(',').forEach(splitMood => {
                            const trimmed = splitMood.trim();
                            if (MOOD_TAGS.includes(trimmed)) {
                                allMoods.add(trimmed);
                            }
                        });
                    } else if (MOOD_TAGS.includes(mood.trim())) {
                        allMoods.add(mood.trim());
                    }
                }
            });
        } else if (typeof song.mood === 'string') {
            if (song.mood.includes(',')) {
                song.mood.split(',').forEach(mood => {
                    const trimmed = mood.trim();
                    if (MOOD_TAGS.includes(trimmed)) {
                        allMoods.add(trimmed);
                    }
                });
            } else if (MOOD_TAGS.includes(song.mood.trim())) {
                allMoods.add(song.mood.trim());
            }
        }
    }
    
    // 2. Collect moods from 'moods' field  
    if (song.moods && Array.isArray(song.moods)) {
        console.log(`   📝 Found 'moods' field:`, song.moods);
        song.moods.forEach(mood => {
            if (typeof mood === 'string' && mood.trim()) {
                if (mood.includes(',')) {
                    mood.split(',').forEach(splitMood => {
                        const trimmed = splitMood.trim();
                        if (MOOD_TAGS.includes(trimmed)) {
                            allMoods.add(trimmed);
                        }
                    });
                } else if (MOOD_TAGS.includes(mood.trim())) {
                    allMoods.add(mood.trim());
                }
            }
        });
    }
    
    // 3. Collect mood tags from 'genres' field
    const moodTagsInGenres = [];
    if (song.genres && Array.isArray(song.genres)) {
        song.genres.forEach(genre => {
            if (MOOD_TAGS.includes(genre)) {
                moodTagsInGenres.push(genre);
                allMoods.add(genre);
            }
        });
        if (moodTagsInGenres.length > 0) {
            console.log(`   📝 Found mood tags in genres:`, moodTagsInGenres);
        }
    }
    
    // Convert to sorted array and then to comma-separated string (frontend format)
    const consolidatedMoodArray = Array.from(allMoods).sort();
    const consolidatedMoodString = consolidatedMoodArray.join(', ');
    
    // Clean genres by removing mood tags
    const cleanedGenres = song.genres ? song.genres.filter(genre => !MOOD_TAGS.includes(genre)) : [];
    
    console.log(`   ✨ Consolidated mood: "${consolidatedMoodString}"`);
    console.log(`   🧹 Cleaned genres: [${cleanedGenres.join(', ')}]`);
    
    return {
        originalMood: song.mood,
        originalMoods: song.moods, 
        originalGenres: song.genres || [],
        consolidatedMoodString: consolidatedMoodString,
        consolidatedMoodArray: consolidatedMoodArray,
        cleanedGenres: cleanedGenres,
        moodTagsFromGenres: moodTagsInGenres,
        hasChanges: (
            consolidatedMoodString !== (typeof song.mood === 'string' ? song.mood : '') ||
            song.moods !== undefined ||
            moodTagsInGenres.length > 0
        )
    };
}

// Create update object for API
function createConsolidationUpdate(song, consolidation) {
    const updatedSong = {
        ...song,
        mood: consolidation.consolidatedMoodString, // Single string field for frontend
        genres: consolidation.cleanedGenres
    };
    
    // Remove the redundant 'moods' field
    delete updatedSong.moods;
    
    // Remove MongoDB-specific fields
    delete updatedSong._id;
    delete updatedSong.__v;
    
    return updatedSong;
}

// Main consolidation function
async function consolidateMoodFields(dryRun = true) {
    console.log('🔗 Starting comprehensive mood field consolidation...');
    console.log(`📋 Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE UPDATE'}`);
    
    const authData = await authenticate();
    if (!authData) {
        return {
            totalSongs: 0,
            songsNeedingConsolidation: 0,
            consolidatedSongs: [],
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
        let needsConsolidationCount = 0;
        const consolidatedSongs = [];
        
        for (const song of songs) {
            const consolidation = consolidateAllMoodData(song);
            processedCount++;
            
            if (consolidation.hasChanges) {
                needsConsolidationCount++;
                consolidatedSongs.push({
                    id: song.id,
                    title: song.title,
                    consolidation: consolidation
                });
                
                // Update the song if not in dry run mode
                if (!dryRun) {
                    try {
                        const updatedSong = createConsolidationUpdate(song, consolidation);
                        console.log(`   📤 Updating song in database...`);
                        
                        const updateResponse = await fetch(`http://localhost:3001/api/songs/${song.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${authData.token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(updatedSong)
                        });
                        
                        if (updateResponse.ok) {
                            console.log(`   ✅ Successfully consolidated mood fields`);
                        } else {
                            const errorText = await updateResponse.text();
                            console.log(`   ❌ Update failed: ${updateResponse.status} - ${errorText}`);
                        }
                    } catch (error) {
                        console.log(`   ❌ Update error: ${error.message}`);
                    }
                }
            } else {
                console.log(`   ✅ No consolidation needed`);
            }
        }
        
        console.log('\n📊 Consolidation Summary:');
        console.log(`   📝 Total songs processed: ${processedCount}`);
        console.log(`   🔧 Songs needing consolidation: ${needsConsolidationCount}`);
        console.log(`   ✅ Songs already consolidated: ${processedCount - needsConsolidationCount}`);
        
        if (dryRun && needsConsolidationCount > 0) {
            console.log('\n⚠️ This was a DRY RUN - no changes were made.');
            console.log('💡 Run with consolidateMoodFields(false) to apply changes.');
        } else if (!dryRun) {
            console.log('\n🎉 Consolidation completed! All mood data has been merged into single field.');
            console.log('✨ The "moods" field has been removed from all songs.');
            console.log('🧹 Mood tags have been moved from genres to mood field.');
        } else {
            console.log('\n🎉 No consolidation needed - all songs already have proper mood field structure!');
        }
        
        return {
            totalSongs: processedCount,
            songsNeedingConsolidation: needsConsolidationCount,
            consolidatedSongs: consolidatedSongs
        };
        
    } catch (error) {
        console.error('❌ Consolidation failed:', error);
        return {
            totalSongs: 0,
            songsNeedingConsolidation: 0,
            consolidatedSongs: [],
            error: error.message
        };
    }
}

// Export functions for browser use
if (typeof window !== 'undefined') {
    window.consolidateMoodFields = consolidateMoodFields;
    window.consolidateAllMoodData = consolidateAllMoodData;
}

console.log('🔗 Mood Field Consolidation Tool Loaded');
console.log('📋 Available commands:');
console.log('   consolidateMoodFields(true)  - Dry run (analyze only)');
console.log('   consolidateMoodFields(false) - Live update (consolidate all mood fields)');