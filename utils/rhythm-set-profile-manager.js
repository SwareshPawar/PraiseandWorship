function calculateBpmStats(bpmValues) {
  if (!Array.isArray(bpmValues) || bpmValues.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, count: 0 };
  }

  const sorted = [...bpmValues].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const avg = Math.round(sum / sorted.length);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];

  return { min, max, avg, median, count: sorted.length };
}

async function calculateProfileForRhythmSet(songsCollection, rhythmSetId) {
  const songs = await songsCollection.find({ rhythmSetId }).toArray();

  const profile = {
    rhythmSetId,
    totalSongs: songs.length,
    moods: {},
    genres: {},
    taals: {},
    timeSignatures: {},
    rhythmCategories: {},
    bpm: { min: 0, max: 0, avg: 0, median: 0, count: 0 },
    updatedAt: new Date().toISOString(),
    lastRecalculatedAt: new Date().toISOString()
  };

  if (!songs.length) {
    return profile;
  }

  const bpmValues = [];

  songs.forEach(song => {
    if (Array.isArray(song && song.mood)) {
      song.mood.forEach(mood => {
        if (!mood) return;
        profile.moods[mood] = (profile.moods[mood] || 0) + 1;
      });
    }

    if (song && song.genre) {
      profile.genres[song.genre] = (profile.genres[song.genre] || 0) + 1;
    }

    if (song && song.taal) {
      profile.taals[song.taal] = (profile.taals[song.taal] || 0) + 1;
    }

    if (song && song.rhythmCategory) {
      profile.rhythmCategories[song.rhythmCategory] = (profile.rhythmCategories[song.rhythmCategory] || 0) + 1;
    }

    const timeSignature = song && (song.timeSignature || song.time);
    if (timeSignature) {
      profile.timeSignatures[timeSignature] = (profile.timeSignatures[timeSignature] || 0) + 1;
    }

    const tempo = song && (song.tempo || song.bpm);
    if (tempo === null || typeof tempo === 'undefined') return;

    const bpmValue = Number(tempo);
    if (Number.isFinite(bpmValue) && bpmValue > 0) {
      bpmValues.push(Math.round(bpmValue));
    }
  });

  profile.bpm = calculateBpmStats(bpmValues);
  return profile;
}

async function updateRhythmSetProfile(profilesCollection, songsCollection, rhythmSetId, forceRecalculation = false) {
  if (!rhythmSetId) {
    throw new Error('rhythmSetId is required');
  }

  const profile = await calculateProfileForRhythmSet(songsCollection, rhythmSetId);
  if (!forceRecalculation && !profile.updatedAt) {
    profile.updatedAt = new Date().toISOString();
  }

  await profilesCollection.updateOne(
    { rhythmSetId },
    { $set: profile },
    { upsert: true }
  );

  return profile;
}

module.exports = {
  calculateBpmStats,
  calculateProfileForRhythmSet,
  updateRhythmSetProfile
};