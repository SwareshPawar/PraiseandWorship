/**
 * Migration Script: Consolidate and Move Mood Data
 * 
 * This script:
 * 1. Moves mood-related tags from genres array to mood field
 * 2. Consolidates existing mood data from multiple fields (mood, moods) into single mood array
 * 3. Removes duplicate mood entries
 * 4. Cleans up old moods field to prevent confusion
 */

const API_BASE_URL = 'http://localhost:3001';

// Define which genre values should be moved to moods
const MOOD_TAGS = [
    "Dance", "Patriotic", "Christmas", "Easter", "Action", "Forgiveness", 
    "Thanksgiving", "Good Friday", "Holy Spirit", "Love", "Qawalli", "Miracle"
];

// Category/Genre tags that should stay in genres
const GENRE_TAGS = [
    "Praise", "Worship", "Hindi", "Marathi", "English", ""
];

let jwtToken = '';
let processedCount = 0;
let updatedCount = 0;
let errorCount = 0;

// Check for existing JWT token from localStorage
function checkExistingAuth() {
    try {
        const storedToken = localStorage.getItem('jwtToken');
        const storedUser = localStorage.getItem('currentUser');
        
        if (storedToken && storedUser) {
            const user = JSON.parse(storedUser);
            jwtToken = storedToken;
            console.log('✅ Found existing authentication');
            console.log(`👤 Already logged in as: ${user.firstName} ${user.lastName} (${user.email})`);
            
            if (!user.isAdmin) {
                console.error('❌ Admin privileges required for migration');
                return false;
            }
            
            return true;
        }
    } catch (e) {
        console.warn('⚠️ Could not read stored auth data:', e.message);
    }
    
    return false;
}

// Simple authentication function
async function authenticate() {
    // First, check if user is already logged in
    if (checkExistingAuth()) {
        return true;
    }
    
    console.log('🔐 No existing authentication found, please login...');
    
    const email = prompt('Enter your admin email:');
    const password = prompt('Enter your password:');
    
    if (!email || !password) {
        console.error('❌ Email and password are required');
        console.log('💡 Tip: You can also login in the main app first (index.html) and then run the migration');
        return false;
    }
    
    try {
        console.log('🔐 Authenticating...');
        
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            credentials: 'same-origin',
            body: JSON.stringify({ loginInput: email, password })
        });
        
        console.log(`📡 Login response: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            let errorText = `HTTP ${response.status}`;
            try {
                const errorBody = await response.text();
                if (errorBody) errorText += ` - ${errorBody}`;
            } catch (e) {}
            throw new Error(`Login failed: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('📄 Login response data keys:', Object.keys(data));
        
        if (data.token && data.user) {
            jwtToken = data.token;
            console.log('✅ Authentication successful');
            console.log(`👤 Logged in as: ${data.user.firstName} ${data.user.lastName} (${data.user.email})`);
            
            // Store in localStorage for future use
            localStorage.setItem('jwtToken', jwtToken);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            
            if (!data.user.isAdmin) {
                console.error('❌ Admin privileges required for migration');
                return false;
            }
            
            return true;
        } else {
            throw new Error('Invalid response format - missing token or user data');
        }
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        console.log('💡 Alternative: Login in the main app first (index.html) and then run the migration');
        return false;
    }
}

// Fetch all songs
async function fetchSongs() {
    try {
        console.log('📥 Fetching songs from database...');
        
        // Add cache-busting and bypass service worker
        const response = await fetch(`${API_BASE_URL}/api/songs?_migrate=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            cache: 'no-store'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch songs: ${response.status} - ${response.statusText}`);
        }
        
        const songs = await response.json();
        console.log(`📊 Found ${songs.length} songs in database`);
        return songs;
        
    } catch (error) {
        console.error('❌ Error fetching songs:', error.message);
        throw error;
    }
}

// Update a single song
async function updateSong(songData) {
    // songData should be the result from processSong containing original, updated, changes
    const song = songData.original;
    const updateFields = createUpdateObject(songData.changes);
    
    try {
        console.log(`🔄 Sending update request for song ID ${song.id}...`);
        console.log(`🔍 Update fields:`, updateFields);
        
        const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
        };
        
        // Add authorization header if we have a token
        if (jwtToken) {
            headers['Authorization'] = `Bearer ${jwtToken}`;
        }
        
        const response = await fetch(`${API_BASE_URL}/api/songs/${song.id}?_migrate=${Date.now()}`, {
            method: 'PUT',
            headers: headers,
            cache: 'no-store',
            body: JSON.stringify(updateFields)
        });
        
        console.log(`📡 Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorBody = await response.text();
                if (errorBody) {
                    errorMessage += ` - Server error: ${errorBody}`;
                }
            } catch (e) {
                errorMessage += ' (Could not read error details)';
            }
            
            // Log the song data that caused the error for debugging
            console.error('🔍 Song data that caused error:', {
                id: song.id,
                title: song.title,
                updateFields: updateFields,
                updateFieldsSize: JSON.stringify(updateFields).length + ' bytes'
            });
            
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        console.log(`✅ Successfully updated song "${song.title}"`);
        return result;
        
    } catch (error) {
        console.error(`❌ Error updating song "${song.title}" (ID: ${song.id}): ${error.message}`);
        
        // Add more debugging info
        console.error(`🔍 Song data being sent:`, {
            id: song.id,
            title: song.title,
            genres: song.genres,
            moods: song.moods,
            dataSize: JSON.stringify(song).length + ' bytes'
        });
        
        throw error;
    }
}

// Clean song data for API requests (remove MongoDB-specific fields)
function cleanSongForApi(song) {
    const cleaned = { ...song };
    
    // Remove MongoDB-specific fields that might cause issues
    delete cleaned._id;
    delete cleaned.__v;
    
    // Ensure required fields exist and have proper types
    if (!cleaned.genres) cleaned.genres = [];
    if (!cleaned.mood) cleaned.mood = '';  // mood should be a string
    
    // Ensure arrays are actually arrays
    if (!Array.isArray(cleaned.genres)) cleaned.genres = [];
    // Ensure mood is a string
    if (typeof cleaned.mood !== 'string') cleaned.mood = '';
    
    return cleaned;
}

// Create update object with only changed fields (for better API compatibility)
function createUpdateObject(changes) {
    return {
        genres: changes.newGenres,
        mood: changes.newMoodString,  // Use the string format for frontend compatibility
        updatedAt: new Date().toISOString(),
        updatedBy: 'migration-script'
    };
}

// Process a single song for mood migration
function processSong(song) {
    const originalGenres = Array.isArray(song.genres) ? [...song.genres] : [];
    
    // Collect ALL existing mood data from multiple possible sources
    let existingMoodData = new Set();
    
    // Add from existing mood array (if exists)
    if (Array.isArray(song.mood)) {
        song.mood.forEach(m => existingMoodData.add(m));
    }
    
    // Add from existing moods array (if exists) 
    if (Array.isArray(song.moods)) {
        song.moods.forEach(m => existingMoodData.add(m));
    }
    
    // Add from single mood string (if exists)
    if (song.mood && typeof song.mood === 'string') {
        existingMoodData.add(song.mood);
    }
    
    const originalMood = Array.from(existingMoodData);
    
    // Find mood tags in genres
    const moodTagsInGenres = originalGenres.filter(genre => 
        MOOD_TAGS.includes(genre)
    );
    
    // Check if there are ANY changes needed (mood tags in genres OR consolidation of mood fields)
    const hasMultipleMoodFields = (song.moods || song.mood && typeof song.mood === 'string');
    
    if (moodTagsInGenres.length === 0 && !hasMultipleMoodFields) {
        // No mood tags found in genres and no field consolidation needed
        return null;
    }
    
    // Remove mood tags from genres
    const cleanedGenres = originalGenres.filter(genre => 
        !MOOD_TAGS.includes(genre)
    );
    
    // Add mood tags from genres to existing mood data
    moodTagsInGenres.forEach(mood => existingMoodData.add(mood));
    const newMoodArray = Array.from(existingMoodData);
    const newMoodString = newMoodArray.join(', ');  // Convert to comma-separated string for frontend
    
    // Create updated song object and clean it for API
    const updatedSong = cleanSongForApi({
        ...song,
        genres: cleanedGenres,
        mood: newMoodString,  // Store as string, not array
        updatedAt: new Date().toISOString(),
        updatedBy: 'migration-script'
    });
    
    // Remove old moods field to avoid confusion
    delete updatedSong.moods;
    
    return {
        original: song,
        updated: updatedSong,
        changes: {
            movedTags: moodTagsInGenres,
            oldGenres: originalGenres,
            newGenres: cleanedGenres,
            oldMood: originalMood,
            newMoodArray: newMoodArray,
            newMoodString: newMoodString,
            consolidatedFields: hasMultipleMoodFields
        }
    };
}

// Generate migration report
function generateReport(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION REPORT');
    console.log('='.repeat(60));
    console.log(`📝 Total songs processed: ${processedCount}`);
    console.log(`✅ Songs updated: ${updatedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⏭️ Songs skipped (no changes): ${processedCount - updatedCount - errorCount}`);
    
    if (results.length > 0) {
        console.log('\n📋 DETAILED CHANGES:');
        console.log('-'.repeat(40));
        
        results.forEach((result, index) => {
            if (result.changes) {
                console.log(`\n${index + 1}. "${result.original.title}" (ID: ${result.original.id})`);
                if (result.changes.movedTags.length > 0) {
                    console.log(`   📝 Moved tags: [${result.changes.movedTags.join(', ')}]`);
                }
                if (result.changes.consolidatedFields) {
                    console.log(`   🔗 Consolidated mood fields`);
                }
                console.log(`   📂 Genres: [${result.changes.oldGenres.join(', ')}] → [${result.changes.newGenres.join(', ')}]`);
                console.log(`   🎭 Mood: [${result.changes.oldMood.join(', ')}] → "${result.changes.newMoodString}"`);
            }
        });
    }
    
    console.log('\n' + '='.repeat(60));
}

// Main migration function
async function runMigration() {
    try {
        console.log('🚀 Starting Mood Migration Script');
        console.log('📝 This script will move mood-related tags from Genres to Moods field\n');
        
        // Temporarily disable service worker
        await temporarilyDisableServiceWorker();
        
        // Authenticate first
        if (!(await authenticate())) {
            return;
        }
        
        // Test API connection first
        const apiWorking = await testApiConnection();
        if (!apiWorking) {
            throw new Error('API connection test failed - cannot proceed with migration');
        }
        
        // Fetch songs
        const songs = await fetchSongs();
        
        if (songs.length === 0) {
            console.log('ℹ️ No songs found in database');
            return;
        }
        
        // Process songs
        console.log('\n🔄 Processing songs...');
        const results = [];
        
        for (const song of songs) {
            processedCount++;
            
            try {
                const processed = processSong(song);
                
                if (processed) {
                    // Song needs updating
                    console.log(`📝 Updating "${song.title}" - Moving: [${processed.changes.movedTags.join(', ')}]`);
                    
                    const updated = await updateSong(processed);
                    updatedCount++;
                    results.push(processed);
                    
                    // Small delay to avoid overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } else {
                    // No changes needed
                    console.log(`⏭️ Skipping "${song.title}" - No mood tags in genres`);
                }
                
            } catch (error) {
                errorCount++;
                console.error(`❌ Error processing "${song.title}":`, error.message);
            }
        }
        
        // Generate final report
        generateReport(results);
        
        if (updatedCount > 0) {
            console.log('\n✅ Migration completed successfully!');
            console.log('💡 You may want to refresh your application cache to see the changes.');
        } else {
            console.log('\nℹ️ No songs required migration.');
        }
        
    } catch (error) {
        console.error('💥 Migration failed:', error.message);
    } finally {
        // Re-register service worker
        await reRegisterServiceWorker();
    }
}

// Dry run function (doesn't update database)
async function runDryRun() {
    try {
        console.log('🔍 Running DRY RUN - No changes will be made to database');
        console.log('📝 This will show you what would be changed\n');
        
        // Temporarily disable service worker
        await temporarilyDisableServiceWorker();
        
        // Authenticate first
        if (!(await authenticate())) {
            return;
        }
        
        // Test API connection first
        const apiWorking = await testApiConnection();
        if (!apiWorking) {
            throw new Error('API connection test failed - cannot proceed with migration');
        }
        
        // Fetch songs
        const songs = await fetchSongs();
        
        if (songs.length === 0) {
            console.log('ℹ️ No songs found in database');
            return;
        }
        
        // Process songs (but don't update)
        console.log('\n🔍 Analyzing songs...');
        const results = [];
        
        for (const song of songs) {
            processedCount++;
            
            const processed = processSong(song);
            
            if (processed) {
                console.log(`📝 Would update "${song.title}" - Move: [${processed.changes.movedTags.join(', ')}]`);
                results.push(processed);
                updatedCount++; // Count what would be updated
            } else {
                console.log(`⏭️ Would skip "${song.title}" - No mood tags in genres`);
            }
        }
        
        // Generate report
        generateReport(results);
        
        console.log('\n🔍 DRY RUN COMPLETE - No actual changes were made');
        console.log('💡 Run runMigration() to perform the actual migration');
        
    } catch (error) {
        console.error('💥 Dry run failed:', error.message);
    } finally {
        // Re-register service worker
        await reRegisterServiceWorker();
    }
}

// Manual token setting function (if needed)
function setJwtToken(token) {
    if (token) {
        jwtToken = token;
        localStorage.setItem('jwtToken', token);
        console.log('✅ JWT token manually set');
        return true;
    } else {
        console.error('❌ Invalid token provided');
        return false;
    }
}

// Export functions for use
if (typeof window !== 'undefined') {
    window.runMoodMigration = runMigration;
    window.runMoodMigrationDryRun = runDryRun;
    window.testApiConnection = testApiConnection;
    window.checkExistingAuth = checkExistingAuth;
    window.setJwtToken = setJwtToken;
} else if (typeof module !== 'undefined') {
    module.exports = { runMigration, runDryRun, testApiConnection, checkExistingAuth, setJwtToken };
}

// Temporarily unregister service worker for migration
async function temporarilyDisableServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                console.log('🔧 Temporarily unregistering service worker for migration...');
                await registration.unregister();
            }
        } catch (e) {
            console.warn('⚠️ Could not unregister service worker:', e.message);
        }
    }
}

// Re-register service worker after migration
async function reRegisterServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            console.log('🔧 Re-registering service worker...');
            await navigator.serviceWorker.register('service-worker.js');
        } catch (e) {
            console.warn('⚠️ Could not re-register service worker:', e.message);
        }
    }
}

// Test function to check API connectivity
async function testApiConnection() {
    try {
        console.log('🧪 Testing API connection...');
        
        // Test GET request (should not require auth)
        const getResponse = await fetch(`${API_BASE_URL}/api/songs?limit=1&_test=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            cache: 'no-store'
        });
        
        console.log(`📡 GET test response: ${getResponse.status} ${getResponse.statusText}`);
        
        if (!getResponse.ok) {
            throw new Error(`GET test failed: ${getResponse.status}`);
        }
        
        const songs = await getResponse.json();
        if (songs.length === 0) {
            console.log('⚠️ No songs found in database');
            return false;
        }
        
        const testSong = songs[0];
        console.log(`🎵 Test song: "${testSong.title}" (ID: ${testSong.id})`);
        
        // Test PUT request with same data (should not change anything)
        const putHeaders = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        };
        
        // Add authorization header if we have a token
        if (jwtToken) {
            putHeaders['Authorization'] = `Bearer ${jwtToken}`;
        }
        
        // Clean the test song data before sending
        const cleanedTestSong = cleanSongForApi(testSong);
        console.log(`🧹 Cleaned test song - removed ${Object.keys(testSong).length - Object.keys(cleanedTestSong).length} MongoDB fields`);
        
        // Create minimal test update (similar to what migration will send)
        const testUpdate = {
            genres: testSong.genres || [],
            mood: testSong.mood || [],  // Note: singular 'mood'
            updatedAt: new Date().toISOString(),
            updatedBy: 'migration-test'
        };
        
        console.log('🔍 Test update object:', testUpdate);
        console.log('🔍 Test update size:', JSON.stringify(testUpdate).length + ' bytes');
        
        const putResponse = await fetch(`${API_BASE_URL}/api/songs/${testSong.id}?_test=${Date.now()}`, {
            method: 'PUT',
            headers: putHeaders,
            cache: 'no-store',
            body: JSON.stringify(testUpdate)
        });
        
        console.log(`📡 PUT test response: ${putResponse.status} ${putResponse.statusText}`);
        
        if (!putResponse.ok) {
            let errorDetails = '';
            try {
                errorDetails = await putResponse.text();
                console.error('🔍 PUT error details:', errorDetails);
            } catch (e) {
                console.error('🔍 Could not read PUT error details');
            }
            
            // Log the test update structure for debugging
            console.error('🔍 Test update structure:', {
                id: testSong.id,
                title: testSong.title,
                updateFields: testUpdate,
                originalFields: Object.keys(testSong).length,
                updateSize: JSON.stringify(testUpdate).length + ' bytes'
            });
            
            throw new Error(`PUT test failed: ${putResponse.status} - ${errorDetails}`);
        }
        
        console.log('✅ API connection test successful!');
        return true;
        
    } catch (error) {
        console.error('❌ API connection test failed:', error.message);
        return false;
    }
}

console.log('📋 Mood Migration Script Loaded');
console.log('🔍 Run runMoodMigrationDryRun() to preview changes');
console.log('🚀 Run runMoodMigration() to perform actual migration');