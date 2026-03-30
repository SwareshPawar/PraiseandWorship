/*
 * Sync local loops/loops-metadata.json from a production metadata endpoint.
 *
 * Usage:
 *   node scripts/core/sync-loops-metadata-from-production.js
 *   node scripts/core/sync-loops-metadata-from-production.js --url https://your-prod-host/api/loops/metadata
 *   node scripts/core/sync-loops-metadata-from-production.js --dry-run
 *
 * Environment:
 *   LOOPS_METADATA_SOURCE_URL      Full metadata URL
 *   PRODUCTION_BASE_URL            Base URL (appends /api/loops/metadata)
 *   OLDANDNEW_BASE_URL             Fallback base URL (appends /api/loops/metadata)
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    url: '',
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--url') {
      args.url = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return args;
}

function resolveSourceUrl(cliUrl) {
  const fromCli = String(cliUrl || '').trim();
  if (fromCli) return fromCli;

  const explicit = String(process.env.LOOPS_METADATA_SOURCE_URL || '').trim();
  if (explicit) return explicit;

  const prodBase = String(process.env.PRODUCTION_BASE_URL || '').trim().replace(/\/$/, '');
  if (prodBase) return `${prodBase}/api/loops/metadata`;

  const oldAndNewBase = String(process.env.OLDANDNEW_BASE_URL || 'https://oldand-new.vercel.app')
    .trim()
    .replace(/\/$/, '');
  return `${oldAndNewBase}/api/loops/metadata`;
}

function ensureValidMetadataShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Metadata payload is not an object');
  }

  if (!Array.isArray(payload.loops)) {
    throw new Error('Metadata payload is missing loops[]');
  }

  const normalized = {
    ...payload,
    loops: payload.loops
  };

  if (!Array.isArray(normalized.rhythmSets)) {
    normalized.rhythmSets = [];
  }

  return normalized;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: HTTP ${response.status}`);
  }

  return response.json();
}

function writeWithBackup(targetFilePath, dataObject) {
  const dir = path.dirname(targetFilePath);
  fs.mkdirSync(dir, { recursive: true });

  const backupDir = path.join(dir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  if (fs.existsSync(targetFilePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `loops-metadata.${stamp}.json`);
    fs.copyFileSync(targetFilePath, backupPath);
    console.log(`Backup created: ${backupPath}`);
  }

  fs.writeFileSync(targetFilePath, JSON.stringify(dataObject, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceUrl = resolveSourceUrl(args.url);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const targetPath = path.join(repoRoot, 'loops', 'loops-metadata.json');

  console.log(`Source URL: ${sourceUrl}`);
  console.log(`Target file: ${targetPath}`);

  const payload = await fetchJson(sourceUrl);
  const metadata = ensureValidMetadataShape(payload);

  const loopCount = metadata.loops.length;
  const setCount = Array.isArray(metadata.rhythmSets) ? metadata.rhythmSets.length : 0;
  console.log(`Fetched metadata: loops=${loopCount}, rhythmSets=${setCount}`);

  if (args.dryRun) {
    console.log('Dry run enabled: no file changes written.');
    return;
  }

  writeWithBackup(targetPath, metadata);
  console.log('Local loops-metadata.json updated successfully.');
}

main().catch((error) => {
  console.error('Sync failed:', error.message || error);
  process.exit(1);
});
