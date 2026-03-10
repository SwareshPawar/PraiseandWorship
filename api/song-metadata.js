const { connectToDatabase } = require('./_db');
const { getCorsHeaders } = require('./_auth');
const {
  normalizeRhythmFamily,
  buildRhythmSetIndexFromMetadata,
  readLoopsMetadataSafe
} = require('./_loops');

const NON_MUSICAL_TAGS = new Set([
  'new',
  'old',
  'mid',
  'hindi',
  'marathi',
  'english',
  'female',
  'male',
  'duet'
]);

function toCleanString(value) {
  return String(value || '').trim();
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function formatDisplayName(value) {
  const input = toCleanString(value);
  if (!input) return '';
  return input
    .replace(/_/g, ' ')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || req.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { metadata } = readLoopsMetadataSafe();
    const rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
      rhythmSetId: set.rhythmSetId,
      rhythmFamily: set.rhythmFamily,
      rhythmSetNo: set.rhythmSetNo,
      status: 'active'
    }));

    const fallbackTaals = Array.isArray(metadata.supportedTaals)
      ? metadata.supportedTaals.map(toCleanString)
      : [];
    const fallbackTimes = Array.isArray(metadata.supportedTimeSignatures)
      ? metadata.supportedTimeSignatures.map(toCleanString)
      : [];
    const fallbackGenres = Array.isArray(metadata.supportedGenres)
      ? metadata.supportedGenres.map(toCleanString)
      : [];

    let taals = fallbackTaals;
    let times = fallbackTimes;
    let allGenres = fallbackGenres;
    let timeGenreMap = {};

    try {
      const { db } = await connectToDatabase();
      const songsCollection = db.collection('PraiseAndWorships');

      const [dbTaals, dbTimes, dbTimeSignatures, dbGenre, dbGenres] = await Promise.all([
        songsCollection.distinct('taal'),
        songsCollection.distinct('time'),
        songsCollection.distinct('timeSignature'),
        songsCollection.distinct('genre'),
        songsCollection.distinct('genres')
      ]);

      const expandedGenres = [];
      dbGenres.forEach(entry => {
        if (Array.isArray(entry)) {
          entry.forEach(item => expandedGenres.push(item));
        } else if (entry) {
          expandedGenres.push(entry);
        }
      });

      taals = uniqueSorted([
        ...fallbackTaals,
        ...dbTaals.map(toCleanString)
      ]);
      times = uniqueSorted([
        ...fallbackTimes,
        ...dbTimes.map(toCleanString),
        ...dbTimeSignatures.map(toCleanString)
      ]);
      allGenres = uniqueSorted([
        ...fallbackGenres,
        ...dbGenre.map(toCleanString),
        ...expandedGenres.map(toCleanString)
      ]);

      // Build a lightweight map of time signature -> taals seen in songs.
      const rows = await songsCollection.aggregate([
        {
          $project: {
            time: { $ifNull: ['$time', '$timeSignature'] },
            taal: '$taal'
          }
        },
        {
          $match: {
            time: { $exists: true, $ne: null, $ne: '' },
            taal: { $exists: true, $ne: null, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$time',
            taals: { $addToSet: '$taal' }
          }
        }
      ]).toArray();

      rows.forEach(row => {
        const timeKey = toCleanString(row._id);
        const mappedTaals = uniqueSorted((row.taals || []).map(toCleanString));
        if (timeKey && mappedTaals.length) {
          timeGenreMap[timeKey] = mappedTaals;
        }
      });
    } catch (dbError) {
      // Keep endpoint usable without DB connectivity by returning metadata-driven fallbacks.
      console.warn('Song metadata endpoint using fallback payload:', dbError.message);
    }

    const musicalGenres = allGenres
      .filter(item => !NON_MUSICAL_TAGS.has(item.toLowerCase()))
      .map(formatDisplayName)
      .filter(Boolean);

    const rhythmFamilies = uniqueSorted([
      ...rhythmSets.map(set => normalizeRhythmFamily(set.rhythmFamily)),
      ...taals.map(taal => normalizeRhythmFamily(taal))
    ]);

    return res.status(200).json({
      genres: uniqueSorted(allGenres.map(formatDisplayName)).filter(Boolean),
      musicalGenres: uniqueSorted(musicalGenres),
      taals: uniqueSorted(taals.map(formatDisplayName)).filter(Boolean),
      times,
      timeGenreMap,
      rhythmFamilies,
      rhythmSets,
      rhythmCategoryOptions: ['Indian', 'Western', 'Others'],
      vocalTags: ['Male', 'Female', 'Duet'],
      languageTags: ['Hindi', 'Marathi', 'English'],
      eraSettings: ['New', 'Old', 'Mid']
    });
  } catch (error) {
    console.error('Song metadata API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
