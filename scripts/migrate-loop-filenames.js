const fs = require('fs');
const path = require('path');

function normalizeFamily(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

function normalizeSetNo(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildRhythmSetId(family, setNo) {
  return `${family}_${setNo}`;
}

function buildLoopId(family, setNo, type, number) {
  return `${family}_${setNo}_${String(type || '').toLowerCase()}${parseInt(number, 10)}`;
}

function buildLoopFilename(family, setNo, type, number) {
  const safeType = String(type || '').trim().toLowerCase();
  const typeLabel = safeType === 'loop' ? 'Loop' : safeType === 'fill' ? 'Fill' : '';
  if (!family || !setNo || !typeLabel || !number) return null;
  return `${family}_${setNo}_${typeLabel}${parseInt(number, 10)}.wav`;
}

function getSlotKey(loop) {
  return `${String(loop.type || '').toLowerCase()}${parseInt(loop.number, 10)}`;
}

function signatureForLoop(loop) {
  const conditions = loop.conditions || {};
  const metadata = loop.metadata || {};
  const parts = [
    normalizeSetNo(loop.rhythmSetNo || loop.setNo),
    String(conditions.timeSignature || '').trim().toLowerCase(),
    String(conditions.tempo || '').trim().toLowerCase(),
    String(conditions.genre || '').trim().toLowerCase(),
    String(conditions.taal || '').trim().toLowerCase(),
    String(metadata.importedFrom || '').trim().toLowerCase()
  ];
  return parts.join('|');
}

function discoverActualFilename(loop, loopsDir) {
  const slotKey = getSlotKey(loop);
  const candidates = [
    loop.filename,
    loop.files && loop.files[slotKey],
    loop.originalFilename
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(loopsDir, candidate))) {
      return candidate;
    }
  }

  return candidates[0] || null;
}

function rebuildRhythmSets(loops) {
  const bySet = new Map();

  for (const loop of loops) {
    const rhythmSetId = loop.rhythmSetId;
    if (!rhythmSetId) continue;

    if (!bySet.has(rhythmSetId)) {
      bySet.set(rhythmSetId, {
        rhythmSetId,
        rhythmFamily: loop.rhythmFamily,
        rhythmSetNo: loop.rhythmSetNo,
        files: {},
        loopCount: 0
      });
    }

    const set = bySet.get(rhythmSetId);
    set.files[getSlotKey(loop)] = loop.filename;
    set.loopCount += 1;
  }

  return Array.from(bySet.values()).sort((left, right) => {
    if (left.rhythmFamily !== right.rhythmFamily) {
      return left.rhythmFamily.localeCompare(right.rhythmFamily);
    }
    return left.rhythmSetNo - right.rhythmSetNo;
  });
}

function main() {
  const apply = process.argv.includes('--apply');
  const repoRoot = path.resolve(__dirname, '..');
  const loopsDir = path.join(repoRoot, 'loops');
  const metadataPath = path.join(loopsDir, 'loops-metadata.json');
  const backupPath = path.join(loopsDir, `loops-metadata.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const loops = Array.isArray(metadata.loops) ? metadata.loops : [];

  const familyAssignments = new Map();
  const familyNextSetNo = new Map();
  const slotCollisions = new Map();
  const renamePlans = [];
  const missingFiles = [];

  for (const loop of loops) {
    const family = normalizeFamily(loop.rhythmFamily || (loop.conditions && loop.conditions.taal) || '');
    const logicalSignature = signatureForLoop(loop);
    if (!family) {
      throw new Error(`Could not derive rhythm family for ${loop.filename || loop.id || 'unknown loop'}`);
    }

    if (!familyAssignments.has(family)) {
      familyAssignments.set(family, new Map());
      familyNextSetNo.set(family, 1);
    }

    const perFamilyAssignments = familyAssignments.get(family);
    if (!perFamilyAssignments.has(logicalSignature)) {
      const nextSetNo = familyNextSetNo.get(family);
      perFamilyAssignments.set(logicalSignature, nextSetNo);
      familyNextSetNo.set(family, nextSetNo + 1);
    }

    const assignedSetNo = perFamilyAssignments.get(logicalSignature);
    const assignedSetId = buildRhythmSetId(family, assignedSetNo);
    const slotKey = getSlotKey(loop);
    const slotCollisionKey = `${assignedSetId}|${slotKey}`;
    if (slotCollisions.has(slotCollisionKey)) {
      throw new Error(`Collision after reassignment: ${slotCollisionKey}`);
    }
    slotCollisions.set(slotCollisionKey, loop.filename || loop.id);

    const newFilename = buildLoopFilename(family, assignedSetNo, loop.type, loop.number);
    const newId = buildLoopId(family, assignedSetNo, loop.type, loop.number);
    const actualFilename = discoverActualFilename(loop, loopsDir);
    const actualPath = actualFilename ? path.join(loopsDir, actualFilename) : null;
    const actualExists = actualPath ? fs.existsSync(actualPath) : false;

    if (!actualExists) {
      missingFiles.push({ id: loop.id, filename: loop.filename, actualFilename });
    }

    renamePlans.push({
      loop,
      family,
      assignedSetNo,
      assignedSetId,
      newFilename,
      newId,
      slotKey,
      actualFilename,
      actualExists
    });
  }

  if (missingFiles.length) {
    throw new Error(`Migration aborted because ${missingFiles.length} loop files are missing on disk.`);
  }

  const targetUsage = new Map();
  for (const plan of renamePlans) {
    const key = plan.newFilename;
    if (!targetUsage.has(key)) {
      targetUsage.set(key, []);
    }
    targetUsage.get(key).push(plan.actualFilename);
  }

  const targetCollisions = Array.from(targetUsage.entries()).filter(([, sources]) => new Set(sources).size > 1);
  if (targetCollisions.length) {
    throw new Error(`Migration aborted because ${targetCollisions.length} target filenames still collide.`);
  }

  for (const plan of renamePlans) {
    const loop = plan.loop;
    const previousFilename = loop.filename;
    loop.rhythmFamily = plan.family;
    loop.rhythmSetNo = plan.assignedSetNo;
    loop.rhythmSetId = plan.assignedSetId;
    loop.id = plan.newId;
    loop.filename = plan.newFilename;
    loop.files = { [plan.slotKey]: plan.newFilename };
    if (!loop.originalFilename && previousFilename && previousFilename !== plan.newFilename) {
      loop.originalFilename = previousFilename;
    }
    if (loop.conditions) {
      loop.conditions.taal = loop.conditions.taal || plan.family;
    }
    loop.metadata = {
      ...(loop.metadata || {}),
      updatedAt: new Date().toISOString(),
      renamedToCanonicalScheme: true
    };
  }

  metadata.rhythmSets = rebuildRhythmSets(loops);

  const changed = renamePlans.filter(plan => plan.actualFilename !== plan.newFilename);

  console.log(JSON.stringify({
    apply,
    totalLoops: loops.length,
    changedFiles: changed.length,
    families: Array.from(familyAssignments.entries()).reduce((acc, [family, assignments]) => {
      acc[family] = assignments.size;
      return acc;
    }, {})
  }, null, 2));

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to perform file renames and metadata update.');
    return;
  }

  fs.copyFileSync(metadataPath, backupPath);

  const tempRenames = [];
  let tempIndex = 0;
  for (const plan of changed) {
    const currentPath = path.join(loopsDir, plan.actualFilename);
    const tempName = `.__loop_migrate_${tempIndex++}_${plan.actualFilename}`;
    const tempPath = path.join(loopsDir, tempName);
    fs.renameSync(currentPath, tempPath);
    tempRenames.push({ tempName, targetName: plan.newFilename });
  }

  for (const rename of tempRenames) {
    fs.renameSync(path.join(loopsDir, rename.tempName), path.join(loopsDir, rename.targetName));
  }

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`Applied migration. Backup written to ${path.basename(backupPath)}`);
}

main();