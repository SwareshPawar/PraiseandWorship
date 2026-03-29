const { connectToDatabase } = require('./_db');
const { getCorsHeaders, authMiddleware, requireAdmin } = require('./_auth');
const { buildRhythmSetIndexFromMetadata, parseRhythmSetId, readWritableLoopsMetadata, writeLoopsMetadata } = require('./_loops');
const {
	copyExternalLoopFile,
	getExternalLoopSources,
	listExternalLoopGroups
} = require('../utils/external-loop-sources');

function getRouteTail(url, basePath) {
	const pathOnly = String(url || '').split('?')[0];
	if (!pathOnly.startsWith(basePath)) return '';
	return pathOnly.slice(basePath.length).replace(/^\/+/, '');
}

function parseLoopSlotKey(loopTypeValue) {
	const match = String(loopTypeValue || '').trim().toLowerCase().match(/^(loop|fill)([1-3])$/);
	if (!match) return null;
	return {
		key: `${match[1]}${match[2]}`,
		type: match[1],
		number: Number(match[2])
	};
}

function findLoopIndexBySlot(metadata, rhythmSetId, slotKey) {
	return (metadata.loops || []).findIndex(loop => {
		const sameSet = String(loop && loop.rhythmSetId || '') === String(rhythmSetId || '');
		const sameSlot = `${String(loop && loop.type || '').toLowerCase()}${Number(loop && loop.number || 0)}` === slotKey;
		return sameSet && sameSlot;
	});
}

function shouldSyncExternalSlot(metadata, rhythmSetId, slotKey, sourceFilename) {
	const loopIndex = findLoopIndexBySlot(metadata, rhythmSetId, slotKey);
	if (loopIndex < 0) {
		return { shouldImport: true, reason: 'missing-local-slot' };
	}

	const existing = (metadata.loops || [])[loopIndex] || {};
	const existingSourceFilename = String(existing.originalFilename || '').trim();
	const incomingSourceFilename = String(sourceFilename || '').trim();

	if (!existingSourceFilename) {
		return { shouldImport: true, reason: 'missing-source-tracking' };
	}

	if (existingSourceFilename !== incomingSourceFilename) {
		return { shouldImport: true, reason: 'source-filename-changed' };
	}

	return { shouldImport: false, reason: 'already-up-to-date' };
}

function syncRhythmSetsFromMetadata(metadata) {
	metadata.rhythmSets = buildRhythmSetIndexFromMetadata(metadata).map(set => ({
		rhythmSetId: set.rhythmSetId,
		rhythmFamily: set.rhythmFamily,
		rhythmSetNo: set.rhythmSetNo,
		fileCount: set.loopCount
	}));
}

async function ensureRhythmSetDocument(db, parsedTarget, actor, importLabel) {
	const rhythmSetsCollection = db.collection('RhythmSets');
	await rhythmSetsCollection.updateOne(
		{ rhythmSetId: parsedTarget.rhythmSetId },
		{
			$set: {
				rhythmSetId: parsedTarget.rhythmSetId,
				rhythmFamily: parsedTarget.rhythmFamily,
				rhythmSetNo: parsedTarget.rhythmSetNo,
				updatedAt: new Date().toISOString(),
				updatedBy: actor,
				notes: importLabel,
				status: 'active'
			},
			$setOnInsert: {
				createdAt: new Date().toISOString(),
				createdBy: actor
			}
		},
		{ upsert: true }
	);
}

module.exports = async (req, res) => {
	const origin = req.headers.origin || req.headers.Origin;
	const corsHeaders = getCorsHeaders(origin);
	Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

	if (req.method === 'OPTIONS') {
		return res.status(200).json({});
	}

	const auth = authMiddleware(req);
	if (auth.error) {
		return res.status(auth.status).json({ error: auth.error });
	}

	const adminError = requireAdmin(auth.user);
	if (adminError) {
		return res.status(adminError.status).json({ error: adminError.error });
	}

	try {
		const routeTail = getRouteTail(req.url, '/api/external-loop-sources');
		const segments = routeTail ? routeTail.split('/').filter(Boolean) : [];
		const sourceId = segments[0] || '';
		const action = segments[1] || '';

		if (req.method === 'GET' && segments.length === 0) {
			const sources = getExternalLoopSources().map(source => ({
				id: source.id,
				label: source.label,
				available: source.available
			}));
			return res.status(200).json(sources);
		}

		if (req.method === 'GET' && sourceId && !action) {
			const result = await listExternalLoopGroups(sourceId);
			return res.status(200).json({
				source: {
					id: result.source.id,
					label: result.source.label,
					available: true
				},
				totalFiles: result.totalFiles,
				groups: result.groups
			});
		}

		if (req.method === 'POST' && sourceId && action === 'import-loop') {
			const targetSet = parseRhythmSetId(String(req.body?.targetRhythmSetId || '').trim());
			const slotInfo = parseLoopSlotKey(req.body?.targetLoopType);
			const sourceFilename = String(req.body?.sourceFilename || '').trim();
			if (!targetSet || !slotInfo || !sourceFilename) {
				return res.status(400).json({ error: 'targetRhythmSetId, targetLoopType and sourceFilename are required' });
			}

			const writable = readWritableLoopsMetadata();
			const copied = await copyExternalLoopFile({
				sourceId,
				sourceFilename,
				destinationDir: writable.loopsDir,
				targetBaseName: `${targetSet.rhythmSetId}_${slotInfo.key}_${sourceId}`
			});
			const metadata = writable.metadata;
			const loopEntry = {
				id: `${targetSet.rhythmSetId}_${slotInfo.key}`,
				type: slotInfo.type,
				number: slotInfo.number,
				rhythmSetId: targetSet.rhythmSetId,
				rhythmFamily: targetSet.rhythmFamily,
				rhythmSetNo: targetSet.rhythmSetNo,
				filename: copied.filename,
				originalFilename: sourceFilename,
				conditions: {
					taal: targetSet.rhythmFamily
				},
				metadata: {
					updatedAt: new Date().toISOString(),
					importedFrom: `${sourceId}:${sourceFilename}`
				}
			};

			const loopIndex = findLoopIndexBySlot(metadata, targetSet.rhythmSetId, slotInfo.key);
			if (loopIndex >= 0) {
				metadata.loops[loopIndex] = {
					...metadata.loops[loopIndex],
					...loopEntry
				};
			} else {
				metadata.loops.push(loopEntry);
			}

			syncRhythmSetsFromMetadata(metadata);
			writeLoopsMetadata(metadata, writable.metadataPath);

			const { db } = await connectToDatabase();
			await ensureRhythmSetDocument(db, targetSet, auth.user.username || auth.user.email || 'admin', 'external-loop-import');

			return res.status(201).json({
				success: true,
				importedFilename: copied.filename,
				targetRhythmSetId: targetSet.rhythmSetId,
				targetLoopType: slotInfo.key
			});
		}

		if (req.method === 'POST' && sourceId && action === 'import-rhythm-set') {
			const sourceRhythmSetId = String(req.body?.sourceRhythmSetId || '').trim().toLowerCase();
			const parsedTarget = parseRhythmSetId(String(req.body?.targetRhythmSetId || sourceRhythmSetId).trim().toLowerCase());
			if (!sourceRhythmSetId || !parsedTarget) {
				return res.status(400).json({ error: 'sourceRhythmSetId and valid targetRhythmSetId are required' });
			}

			const sourceGroups = await listExternalLoopGroups(sourceId);
			const sourceGroup = sourceGroups.groups.find(group => group.sourceRhythmSetId === sourceRhythmSetId);
			if (!sourceGroup) {
				return res.status(404).json({ error: `External rhythm set ${sourceRhythmSetId} not found` });
			}

			const writable = readWritableLoopsMetadata();
			const metadata = writable.metadata;
			const importedFiles = [];
			const skippedFiles = [];

			for (const [slotKey, sourceFilename] of Object.entries(sourceGroup.files || {})) {
				const slotInfo = parseLoopSlotKey(slotKey);
				if (!slotInfo) continue;

				const syncDecision = shouldSyncExternalSlot(metadata, parsedTarget.rhythmSetId, slotInfo.key, sourceFilename);
				if (!syncDecision.shouldImport) {
					skippedFiles.push({ slotKey: slotInfo.key, sourceFilename, reason: syncDecision.reason });
					continue;
				}

				const copied = await copyExternalLoopFile({
					sourceId,
					sourceFilename,
					destinationDir: writable.loopsDir,
					targetBaseName: `${parsedTarget.rhythmSetId}_${slotInfo.key}_${sourceId}`
				});

				const loopEntry = {
					id: `${parsedTarget.rhythmSetId}_${slotInfo.key}`,
					type: slotInfo.type,
					number: slotInfo.number,
					rhythmSetId: parsedTarget.rhythmSetId,
					rhythmFamily: parsedTarget.rhythmFamily,
					rhythmSetNo: parsedTarget.rhythmSetNo,
					filename: copied.filename,
					originalFilename: sourceFilename,
					conditions: {
						taal: parsedTarget.rhythmFamily
					},
					metadata: {
						updatedAt: new Date().toISOString(),
						importedFrom: `${sourceId}:${sourceRhythmSetId}`
					}
				};

				const loopIndex = findLoopIndexBySlot(metadata, parsedTarget.rhythmSetId, slotInfo.key);
				if (loopIndex >= 0) {
					metadata.loops[loopIndex] = {
						...metadata.loops[loopIndex],
						...loopEntry
					};
				} else {
					metadata.loops.push(loopEntry);
				}

				importedFiles.push({ slotKey: slotInfo.key, filename: copied.filename, sourceFilename });
			}

			syncRhythmSetsFromMetadata(metadata);
			writeLoopsMetadata(metadata, writable.metadataPath);

			const { db } = await connectToDatabase();
			await ensureRhythmSetDocument(db, parsedTarget, auth.user.username || auth.user.email || 'admin', 'external-rhythm-set-import');

			return res.status(importedFiles.length > 0 ? 201 : 200).json({
				success: true,
				targetRhythmSetId: parsedTarget.rhythmSetId,
				importedFiles,
				skippedFiles,
				delta: {
					totalSlots: Object.keys(sourceGroup.files || {}).length,
					importedCount: importedFiles.length,
					skippedCount: skippedFiles.length
				}
			});
		}

		return res.status(404).json({ error: 'Not found' });
	} catch (error) {
		console.error('external-loop-sources error:', error);
		return res.status(500).json({ error: error.message || 'Internal server error' });
	}
};
