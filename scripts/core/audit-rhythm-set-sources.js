#!/usr/bin/env node

require('dotenv').config();

const { connectToDatabase } = require('../../api/_db');
const {
  buildRhythmSetIndexFromMetadata,
  parseRhythmSetId,
  readLoopsMetadataSafe
} = require('../../api/_loops');

function buildDuplicateFilenameReport(loops) {
  const refsByFilename = new Map();

  (Array.isArray(loops) ? loops : []).forEach(loop => {
    const filename = String(loop && loop.filename || '').trim();
    if (!filename) return;

    const refs = refsByFilename.get(filename) || [];
    refs.push({
      id: String(loop && loop.id || ''),
      rhythmSetId: String(loop && loop.rhythmSetId || ''),
      slot: `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}`
    });
    refsByFilename.set(filename, refs);
  });

  return Array.from(refsByFilename.entries())
    .filter(([, refs]) => refs.length > 1)
    .map(([filename, refs]) => ({ filename, refs }))
    .sort((left, right) => right.refs.length - left.refs.length || left.filename.localeCompare(right.filename));
}

function buildInvalidMetadataLoopReport(loops) {
  return (Array.isArray(loops) ? loops : [])
    .map(loop => {
      const parsed = parseRhythmSetId(String(loop && loop.rhythmSetId || '').trim().toLowerCase());
      const slotKey = `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}`;
      const validSlot = /^(loop|fill)[1-3]$/.test(slotKey);
      if (parsed && validSlot) {
        return null;
      }
      return {
        id: String(loop && loop.id || ''),
        rhythmSetId: String(loop && loop.rhythmSetId || ''),
        type: String(loop && loop.type || ''),
        number: loop && loop.number,
        filename: String(loop && loop.filename || '')
      };
    })
    .filter(Boolean);
}

async function run() {
  const { metadata } = readLoopsMetadataSafe();
  const metadataLoops = Array.isArray(metadata && metadata.loops) ? metadata.loops : [];
  const metadataSets = buildRhythmSetIndexFromMetadata(metadata);
  const metadataMap = new Map(metadataSets.map(set => [String(set.rhythmSetId || ''), set]));

  const { db, client } = await connectToDatabase();

  try {
    const dbSets = await db.collection('RhythmSets').find(
      {},
      {
        projection: {
          _id: 0,
          rhythmSetId: 1,
          rhythmFamily: 1,
          rhythmSetNo: 1,
          files: 1,
          status: 1,
          lastSource: 1,
          updatedAt: 1
        }
      }
    ).toArray();

    const dbMap = new Map(dbSets.map(set => [String(set.rhythmSetId || ''), set]));
    const metadataOnly = metadataSets
      .filter(set => !dbMap.has(set.rhythmSetId))
      .map(set => ({ rhythmSetId: set.rhythmSetId, files: set.files || {} }));
    const dbOnly = dbSets
      .filter(set => !metadataMap.has(set.rhythmSetId))
      .map(set => ({ rhythmSetId: set.rhythmSetId, files: set.files || {} }));

    const slotMismatches = [];
    dbSets.forEach(set => {
      const metadataSet = metadataMap.get(set.rhythmSetId);
      if (!metadataSet) return;

      const dbFiles = set && set.files && typeof set.files === 'object' ? set.files : {};
      const metadataFiles = metadataSet && metadataSet.files && typeof metadataSet.files === 'object' ? metadataSet.files : {};
      const slotKeys = Array.from(new Set([
        ...Object.keys(dbFiles),
        ...Object.keys(metadataFiles)
      ])).sort();
      const diffs = slotKeys
        .filter(slotKey => String(dbFiles[slotKey] || '') !== String(metadataFiles[slotKey] || ''));

      if (diffs.length) {
        slotMismatches.push({
          rhythmSetId: set.rhythmSetId,
          dbFiles,
          metadataFiles,
          diffs,
          lastSource: set.lastSource || null,
          updatedAt: set.updatedAt || null
        });
      }
    });

    const duplicateFilenames = buildDuplicateFilenameReport(metadataLoops);
    const invalidMetadataLoops = buildInvalidMetadataLoopReport(metadataLoops);
    const dbWithExplicitFiles = dbSets
      .filter(set => set.files && Object.keys(set.files).length > 0)
      .map(set => ({
        rhythmSetId: set.rhythmSetId,
        fileCount: Object.keys(set.files || {}).length,
        files: set.files,
        lastSource: set.lastSource || null,
        updatedAt: set.updatedAt || null
      }))
      .sort((left, right) => left.rhythmSetId.localeCompare(right.rhythmSetId));

    const report = {
      summary: {
        metadataLoopCount: metadataLoops.length,
        metadataSetCount: metadataSets.length,
        dbSetCount: dbSets.length,
        metadataOnlyCount: metadataOnly.length,
        dbOnlyCount: dbOnly.length,
        slotMismatchCount: slotMismatches.length,
        duplicateFilenameCount: duplicateFilenames.length,
        invalidMetadataLoopCount: invalidMetadataLoops.length,
        dbWithExplicitFilesCount: dbWithExplicitFiles.length
      },
      metadataOnly,
      dbOnly,
      slotMismatches,
      duplicateFilenames,
      invalidMetadataLoops,
      dbWithExplicitFiles
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close();
  }
}

run().catch(error => {
  console.error('audit-rhythm-set-sources failed:', error.message || error);
  process.exit(1);
});