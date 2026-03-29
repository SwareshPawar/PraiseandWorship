#!/usr/bin/env node

require('dotenv').config();

const { connectToDatabase } = require('../../api/_db');
const { syncExternalRhythmNotes } = require('../../utils/external-rhythm-notes-sync');

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has('--apply'),
    sourceId: args.has('--source-oldandnew') ? 'oldandnew' : 'oldandnew'
  };
}

async function run() {
  const { apply, sourceId } = parseArgs(process.argv);

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Source: ${sourceId}`);

  const { db, client } = await connectToDatabase();

  try {
    const result = await syncExternalRhythmNotes({
      db,
      sourceId,
      apply,
      actor: 'script:sync-external-rhythm-notes'
    });

    console.log(`Loaded external groups: ${result.groupCount}`);
    console.log(`Notes available from external source: ${result.notesAvailable ? 'YES' : 'NO (check OLDANDNEW_JWT_SECRET in .env)'}`);
    console.log(`Matched rhythm sets in DB: ${result.matchedRhythmSetCount}`);
    console.log(`Would update notes for: ${result.changedCount}`);
    console.log(`Source notes missing/blank: ${result.blankCount}`);

    if (!result.applied) {
      console.log('Dry run complete. Re-run with --apply to persist changes.');
      return;
    }

    if (!result.changedCount) {
      console.log('No note changes required.');
      return;
    }

    console.log(`Updated documents: ${result.updatedCount}`);
  } finally {
    await client.close();
  }
}

run().catch(error => {
  console.error('sync-external-rhythm-notes failed:', error.message || error);
  process.exit(1);
});
