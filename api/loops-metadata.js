const { getCorsHeaders } = require('./_auth');
const { buildRhythmSetIndexFromMetadata, readLoopsMetadataSafe } = require('./_loops');

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
      fileCount: set.loopCount
    }));

    const payload = {
      ...metadata,
      loops: Array.isArray(metadata.loops) ? metadata.loops : [],
      rhythmSets,
      tempoRanges: metadata.tempoRanges || {
        slow: { min: 0, max: 80, label: 'Slow' },
        medium: { min: 80, max: 120, label: 'Medium' },
        fast: { min: 120, max: 999, label: 'Fast' }
      },
      supportedTaals: Array.isArray(metadata.supportedTaals) ? metadata.supportedTaals : [],
      supportedGenres: Array.isArray(metadata.supportedGenres) ? metadata.supportedGenres : [],
      supportedTimeSignatures: Array.isArray(metadata.supportedTimeSignatures) ? metadata.supportedTimeSignatures : []
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Loops metadata API error:', error);
    return res.status(500).json({ error: error.message });
  }
};
