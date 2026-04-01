#!/usr/bin/env node

require('dotenv').config();

const { connectToDatabase } = require('../../api/_db');
const {
  buildRhythmSetIndexFromMetadata,
  normalizeRhythmFamily,
  normalizeRhythmSetNo,
  parseRhythmSetId,
  readLoopsMetadataSafe
} = require('../../api/_loops');

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
    syncFiles: args.has('--sync-files')
  };
}

function buildCanonicalEntryFromId(rawId) {
  const parsed = parseRhythmSetId(String(rawId || '').trim().toLowerCase());
  if (!parsed) return null;
  return {
    rhythmSetId: parsed.rhythmSetId,
    rhythmFamily: parsed.rhythmFamily,
    rhythmSetNo: parsed.rhythmSetNo
  };
}

function buildCanonicalEntryFromMetadataSet(set) {
  const parsedFromId = buildCanonicalEntryFromId(set && set.rhythmSetId);
  if (parsedFromId) {
    return parsedFromId;
  }

  const rhythmFamily = normalizeRhythmFamily(set && set.rhythmFamily || '');
  const rhythmSetNo = normalizeRhythmSetNo(set && set.rhythmSetNo);
  if (!rhythmFamily || !rhythmSetNo) return null;

  return {
    rhythmSetId: `${rhythmFamily}_${rhythmSetNo}`,
    rhythmFamily,
    rhythmSetNo
  };
}

async function run() {
  const { apply, syncFiles } = parseArgs(process.argv);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Sync files from metadata: ${syncFiles ? 'yes' : 'no'}`);

  const { metadata } = readLoopsMetadataSafe();
  const metadataSets = buildRhythmSetIndexFromMetadata(metadata);
  console.log(`Metadata rhythm sets discovered: ${metadataSets.length}`);
  const metadataSetMap = new Map(metadataSets.map(set => [String(set.rhythmSetId || ''), set]));

  const { db, client } = await connectToDatabase();

  try {
    const songsCollection = db.collection('PraiseAndWorships');
    const rhythmSetsCollection = db.collection('RhythmSets');

    const songCounts = await songsCollection.aggregate([
      { $match: { rhythmSetId: { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: '$rhythmSetId', count: { $sum: 1 } } }
    ]).toArray();

    const canonicalMap = new Map();
    let invalidSongIds = 0;

    for (const set of metadataSets) {
      const canonical = buildCanonicalEntryFromMetadataSet(set);
      if (!canonical) continue;
      canonicalMap.set(canonical.rhythmSetId, canonical);
    }

    for (const row of songCounts) {
      const canonical = buildCanonicalEntryFromId(row && row._id);
      if (!canonical) {
        invalidSongIds += 1;
        continue;
      }
      if (!canonicalMap.has(canonical.rhythmSetId)) {
        canonicalMap.set(canonical.rhythmSetId, canonical);
      }
    }

    const songCountMap = new Map();
    for (const row of songCounts) {
      const canonical = buildCanonicalEntryFromId(row && row._id);
      if (!canonical) continue;
      const current = songCountMap.get(canonical.rhythmSetId) || 0;
      songCountMap.set(canonical.rhythmSetId, current + Number(row.count || 0));
    }

    const existingDocs = await rhythmSetsCollection.find(
      {},
      { projection: { _id: 0, rhythmSetId: 1, status: 1, notes: 1, createdAt: 1, createdBy: 1, mappedSongCount: 1 } }
    ).toArray();
    const existingMap = new Map(existingDocs.map(doc => [String(doc.rhythmSetId || ''), doc]));

    const now = new Date().toISOString();
    const actor = 'script:migrate-rhythm-sets-db';

    const plan = Array.from(canonicalMap.values()).map(entry => {
      const existing = existingMap.get(entry.rhythmSetId);
      const mappedSongCount = songCountMap.get(entry.rhythmSetId) || 0;
      const payload = {
        rhythmSetId: entry.rhythmSetId,
        rhythmFamily: entry.rhythmFamily,
        rhythmSetNo: entry.rhythmSetNo,
        status: existing && existing.status ? existing.status : 'active',
        notes: existing && typeof existing.notes === 'string' ? existing.notes : '',
        mappedSongCount,
        updatedAt: now,
        updatedBy: actor,
        lastSource: 'migration-rhythm-sets-db'
      };

      const metadataSet = metadataSetMap.get(entry.rhythmSetId);
      if (syncFiles && metadataSet) {
        payload.files = {
          ...(metadataSet.files || {})
        };
      }

      return {
        entry,
        existing,
        payload,
        mappedSongCount,
        metadataFileCount: metadataSet ? Object.keys(metadataSet.files || {}).length : 0
      };
    });

    const createCount = plan.filter(item => !item.existing).length;
    const updateCount = plan.filter(item => Boolean(item.existing)).length;

    console.log(`Canonical rhythm sets to upsert: ${plan.length}`);
    console.log(`Will create: ${createCount}`);
    console.log(`Will update: ${updateCount}`);
    console.log(`Songs grouped with invalid rhythmSetId format: ${invalidSongIds}`);
    if (syncFiles) {
      const setsWithMetadataFiles = plan.filter(item => item.metadataFileCount > 0).length;
      console.log(`Will sync slot files for metadata-backed rhythm sets: ${setsWithMetadataFiles}`);
    }

    if (!apply) {
      console.log('Dry run complete. Re-run with --apply to persist changes.');
      return;
    }

    for (const item of plan) {
      await rhythmSetsCollection.updateOne(
        { rhythmSetId: item.entry.rhythmSetId },
        {
          $set: item.payload,
          $setOnInsert: {
            createdAt: item.existing && item.existing.createdAt ? item.existing.createdAt : now,
            createdBy: item.existing && item.existing.createdBy ? item.existing.createdBy : actor
          }
        },
        { upsert: true }
      );
    }

    console.log(`Applied upserts: ${plan.length}`);
    console.log('RhythmSets migration completed successfully.');
  } finally {
    await client.close();
  }
}

run().catch(error => {
  console.error('migrate-rhythm-sets-db failed:', error.message || error);
  process.exit(1);
});
