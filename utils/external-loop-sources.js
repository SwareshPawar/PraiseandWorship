const fs = require('fs');
const path = require('path');
const { parseRhythmSetId } = require('./loops');

const LOOP_FILE_PATTERN = /^(.*)_(LOOP|FILL)([1-3])\.(wav|mp3)$/i;

function getExternalLoopSources() {
	const baseUrl = String(process.env.OLDANDNEW_BASE_URL || 'https://oldand-new.vercel.app')
		.trim()
		.replace(/\/$/, '');

	return [{
		id: 'oldandnew',
		label: 'OldandNew',
		baseUrl,
		metadataUrl: `${baseUrl}/api/loops/metadata`,
		loopsBaseUrl: `${baseUrl}/loops`,
		available: Boolean(baseUrl)
	}];
}

function resolveExternalLoopSource(sourceId) {
	const source = getExternalLoopSources().find(item => item.id === sourceId);
	if (!source) {
		throw new Error(`Unknown external loop source: ${sourceId}`);
	}
	if (!source.available) {
		throw new Error(`External loop source not available: ${source.label}`);
	}
	return source;
}

function buildGroupIdFromLoop(loop) {
	const explicitId = String(loop && loop.rhythmSetId || '').trim().toLowerCase();
	if (explicitId) {
		return explicitId;
	}

	const filename = String(loop && loop.filename || '').trim();
	const match = filename.match(LOOP_FILE_PATTERN);
	if (match) {
		return String(match[1] || '').trim().toLowerCase();
	}

	return '';
}

async function fetchExternalLoopMetadata(sourceId) {
	const source = resolveExternalLoopSource(sourceId);
	const response = await fetch(source.metadataUrl, {
		headers: {
			'Accept': 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`External source metadata request failed with status ${response.status}`);
	}

	const payload = await response.json();
	return {
		source,
		metadata: payload
	};
}

async function listExternalLoopGroups(sourceId) {
	const { source, metadata } = await fetchExternalLoopMetadata(sourceId);
	const loops = Array.isArray(metadata && metadata.loops) ? metadata.loops : [];
	const groups = new Map();
	let totalFiles = 0;

	loops.forEach(loop => {
		const filename = String(loop && loop.filename || '').trim();
		if (!filename) return;

		totalFiles += 1;

		const rawGroupId = buildGroupIdFromLoop(loop);
		if (!rawGroupId) return;

		const loopType = String(loop && loop.type || '').trim().toLowerCase();
		const loopNumber = Number(loop && loop.number || 0);
		const slotKey = loopType && loopNumber > 0 ? `${loopType}${loopNumber}` : '';
		if (!slotKey) return;

		const parsed = parseRhythmSetId(rawGroupId);
		const groupId = parsed ? parsed.rhythmSetId : rawGroupId;

		if (!groups.has(groupId)) {
			groups.set(groupId, {
				sourceId: source.id,
				sourceLabel: source.label,
				sourceRhythmSetId: groupId,
				rawGroupId,
				rhythmSetId: parsed ? parsed.rhythmSetId : null,
				rhythmFamily: parsed
					? parsed.rhythmFamily
					: String(loop && loop.rhythmFamily || loop && loop.conditions && loop.conditions.taal || rawGroupId),
				rhythmSetNo: parsed ? parsed.rhythmSetNo : null,
				importableAsRhythmSet: Boolean(parsed),
				files: {},
				availableFiles: [],
				conditionsHint: {
					taal: String(loop && loop.conditions && loop.conditions.taal || ''),
					timeSignature: String(loop && loop.conditions && loop.conditions.timeSignature || ''),
					tempo: String(loop && loop.conditions && loop.conditions.tempo || ''),
					genre: String(loop && loop.conditions && loop.conditions.genre || '')
				}
			});
		}

		const group = groups.get(groupId);
		group.files[slotKey] = filename;
		if (!group.availableFiles.includes(slotKey)) {
			group.availableFiles.push(slotKey);
		}
	});

	const sortedGroups = Array.from(groups.values()).sort((a, b) => {
		return String(a.sourceRhythmSetId || '').localeCompare(String(b.sourceRhythmSetId || ''));
	});

	return {
		source: {
			id: source.id,
			label: source.label,
			baseUrl: source.baseUrl,
			metadataUrl: source.metadataUrl,
			loopsBaseUrl: source.loopsBaseUrl
		},
		totalFiles,
		groups: sortedGroups
	};
}

async function copyExternalLoopFile({ sourceId, sourceFilename, destinationDir, targetBaseName }) {
	const source = resolveExternalLoopSource(sourceId);
	const encodedFilename = sourceFilename.split('/').map(part => encodeURIComponent(part)).join('/');
	const sourceUrl = `${source.loopsBaseUrl}/${encodedFilename}`;
	const response = await fetch(sourceUrl);
	if (!response.ok) {
		throw new Error(`Source loop download failed with status ${response.status}: ${sourceFilename}`);
	}

	const extension = path.extname(sourceFilename) || '.wav';
	const safeBaseName = String(targetBaseName || path.basename(sourceFilename, extension))
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, '_') || 'imported_loop';

	let candidateName = `${safeBaseName}${extension}`;
	let counter = 1;
	while (fs.existsSync(path.join(destinationDir, candidateName))) {
		counter += 1;
		candidateName = `${safeBaseName}_${counter}${extension}`;
	}

	const destinationPath = path.join(destinationDir, candidateName);
	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));

	return {
		filename: candidateName,
		sourceUrl,
		destinationPath,
		sourceLabel: source.label
	};
}

module.exports = {
	copyExternalLoopFile,
	fetchExternalLoopMetadata,
	getExternalLoopSources,
	listExternalLoopGroups,
	resolveExternalLoopSource
};
