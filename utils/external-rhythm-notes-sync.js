const { listExternalLoopGroups } = require('./external-loop-sources');

async function buildSourceNotesMap(sourceId) {
const result = await listExternalLoopGroups(sourceId);
const notesMap = new Map();

(result.groups || []).forEach(group => {
const id = String(group && group.sourceRhythmSetId || '').trim().toLowerCase();
const notes = String(group && group.notesHint || '').trim();
if (!id) return;
notesMap.set(id, notes);
});

return { notesMap, groupCount: (result.groups || []).length };
}

async function syncExternalRhythmNotes({ db, sourceId = 'oldandnew', apply = false, actor = 'system' }) {
if (!db) {
throw new Error('Database connection is required');
}

const { notesMap, groupCount } = await buildSourceNotesMap(sourceId);
const rhythmSetsCollection = db.collection('RhythmSets');

// Match local rhythm sets directly by rhythmSetId — no dependency on lastSource or importedFrom
const externalIds = Array.from(notesMap.keys());
const docs = await rhythmSetsCollection.find(
{ rhythmSetId: { $in: externalIds } },
{ projection: { _id: 1, rhythmSetId: 1, notes: 1 } }
).toArray();

const operations = [];
let blankCount = 0;
let changedCount = 0;

docs.forEach(doc => {
const rhythmSetId = String(doc && doc.rhythmSetId || '').trim().toLowerCase();
if (!rhythmSetId) return;

const sourceNotes = String(notesMap.get(rhythmSetId) || '').trim();
const currentNotes = String(doc && doc.notes || '').trim();

if (!sourceNotes) {
blankCount += 1;
return;
}

if (currentNotes === sourceNotes) {
return;
}

changedCount += 1;
operations.push({
updateOne: {
filter: { _id: doc._id },
update: {
$set: {
notes: sourceNotes,
updatedAt: new Date().toISOString(),
updatedBy: actor
}
}
}
});
});

let updatedCount = 0;
if (apply && operations.length) {
const writeResult = await rhythmSetsCollection.bulkWrite(operations, { ordered: false });
updatedCount = writeResult.modifiedCount || 0;
}

return {
sourceId,
groupCount,
matchedRhythmSetCount: docs.length,
changedCount,
blankCount,
updatedCount,
applied: apply,
notesAvailable: notesMap.size > 0
};
}

module.exports = {
buildSourceNotesMap,
syncExternalRhythmNotes
};
