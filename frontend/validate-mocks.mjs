/**
 * Standalone mock-data validation script.
 * Run with: node --input-type=module < validate-mocks.mjs
 * Or: node validate-mocks.mjs
 *
 * This replicates the same checks that mocks/index.ts runs at browser load time,
 * so we can verify the dataset deterministically at build time without needing a browser.
 */

// ── Inline data (duplicates the exact ID sets from the mock files) ─────────────
// We read each file directly to avoid needing a bundler or tsx.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const errors = [];
function fail(msg) { errors.push(msg); }

// ── Helper: parse IDs from a TypeScript mock file with a simple regex ─────────
function extractIds(file, idField) {
  const src = readFileSync(join(__dirname, 'src/mocks', file), 'utf8');
  const re = new RegExp(`${idField}:\\s*'([^']+)'`, 'g');
  const ids = [];
  let m;
  while ((m = re.exec(src)) !== null) ids.push(m[1]);
  return ids;
}

// ── Extract IDs ────────────────────────────────────────────────────────────────
const assetIds   = extractIds('assets.ts',           'assetId');
const defectIds  = extractIds('defects.ts',           'defectId');
const taskIds    = extractIds('maintenanceTasks.ts',  'taskId');
const reqIds     = extractIds('blockRequests.ts',     'requestId');
const blockIds   = extractIds('integratedBlocks.ts',  'blockId');
const conflictIds= extractIds('conflicts.ts',         'conflictId');
const recIds     = extractIds('aiRecommendations.ts', 'recommendationId');
const auditIds   = extractIds('auditEvents.ts',       'auditId');

// ── Helper: extract string field values for a given field ─────────────────────
function extractFieldValues(file, field) {
  const src = readFileSync(join(__dirname, 'src/mocks', file), 'utf8');
  const re = new RegExp(`${field}:\\s*'([^']+)'`, 'g');
  const vals = [];
  let m;
  while ((m = re.exec(src)) !== null) vals.push(m[1]);
  return vals;
}

// ── Extract cross-reference fields from tasks ─────────────────────────────────
const taskAssetIds  = extractFieldValues('maintenanceTasks.ts', 'assetId');
const taskDefectIds = extractFieldValues('maintenanceTasks.ts', 'defectId');
const defectAssetIds= extractFieldValues('defects.ts',          'assetId');
const reqTaskIds    = extractFieldValues('blockRequests.ts',    'taskId');

// We need to extract array items from integratedBlocks (taskIds/requestIds arrays)
// Use a broader regex for array item strings
function extractArrayStringValues(file, arrayField) {
  const src = readFileSync(join(__dirname, 'src/mocks', file), 'utf8');
  // Find the array and grab all quoted strings within it
  const blockRe = new RegExp(`${arrayField}:\\s*\\[([^\\]]+)\\]`, 'g');
  const strRe = /'([^']+)'/g;
  const vals = [];
  let bm;
  while ((bm = blockRe.exec(src)) !== null) {
    let sm;
    while ((sm = strRe.exec(bm[1])) !== null) vals.push(sm[1]);
  }
  return vals;
}

const ibTaskIds  = extractArrayStringValues('integratedBlocks.ts', 'taskIds');
const ibReqIds   = extractArrayStringValues('integratedBlocks.ts', 'requestIds');
const ibDepts    = extractArrayStringValues('integratedBlocks.ts', 'departments');

const conflAffTaskIds  = extractArrayStringValues('conflicts.ts', 'affectedTaskIds');
const conflAffBlockIds = extractArrayStringValues('conflicts.ts', 'affectedBlockIds');

const recAffTaskIds    = extractArrayStringValues('aiRecommendations.ts', 'affectedTaskIds');
const recAffBlockIds   = extractArrayStringValues('aiRecommendations.ts', 'affectedBlockIds');

// Department values for assets & tasks (single-value field)
const assetDepts = extractFieldValues('assets.ts',          'department');
const taskDepts  = extractFieldValues('maintenanceTasks.ts', 'department');

// ── 1. Duplicate ID checks ─────────────────────────────────────────────────────
function checkDuplicates(ids, label) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`Duplicate ID "${id}" in ${label}`);
    seen.add(id);
  }
}
checkDuplicates(assetIds,    'assets');
checkDuplicates(defectIds,   'defects');
checkDuplicates(taskIds,     'maintenanceTasks');
checkDuplicates(reqIds,      'blockRequests');
checkDuplicates(blockIds,    'integratedBlocks');
checkDuplicates(conflictIds, 'conflicts');
checkDuplicates(recIds,      'aiRecommendations');
checkDuplicates(auditIds,    'auditEvents');

// ── 2. Reference checks ────────────────────────────────────────────────────────
const setA = new Set(assetIds);
const setD = new Set(defectIds);
const setT = new Set(taskIds);
const setR = new Set(reqIds);
const setB = new Set(blockIds);

for (const id of defectAssetIds)   if (!setA.has(id)) fail(`defects → assetId "${id}" missing in assets`);
for (const id of taskAssetIds)     if (!setA.has(id)) fail(`maintenanceTasks → assetId "${id}" missing in assets`);

// defectId references in tasks — may have false positives from comments, filter prefix
for (const id of taskDefectIds.filter(v => v.startsWith('DEF-')))
  if (!setD.has(id)) fail(`maintenanceTasks → defectId "${id}" missing in defects`);

for (const id of reqTaskIds)       if (!setT.has(id)) fail(`blockRequests → taskId "${id}" missing in maintenanceTasks`);
for (const id of ibTaskIds)        if (!setT.has(id)) fail(`integratedBlocks → taskId "${id}" missing in maintenanceTasks`);
for (const id of ibReqIds)         if (!setR.has(id)) fail(`integratedBlocks → requestId "${id}" missing in blockRequests`);
for (const id of conflAffTaskIds)  if (!setT.has(id)) fail(`conflicts → affectedTaskId "${id}" missing in maintenanceTasks`);
for (const id of conflAffBlockIds) if (!setB.has(id)) fail(`conflicts → affectedBlockId "${id}" missing in integratedBlocks`);
for (const id of recAffTaskIds)    if (!setT.has(id)) fail(`aiRecommendations → affectedTaskId "${id}" missing in maintenanceTasks`);
for (const id of recAffBlockIds)   if (!setB.has(id)) fail(`aiRecommendations → affectedBlockId "${id}" missing in integratedBlocks`);

// ── 3. Department validity ─────────────────────────────────────────────────────
const VALID = new Set(['ENGINEERING', 'SNT', 'TRACTION']);
for (const d of [...assetDepts, ...taskDepts, ...ibDepts])
  if (!VALID.has(d)) fail(`Invalid department value "${d}"`);

// ── 4. Report ──────────────────────────────────────────────────────────────────
console.log('\n── RailOpt Mock Data Validation ─────────────────────────');
console.log(`  assets:             ${assetIds.length} records`);
console.log(`  defects:            ${defectIds.length} records`);
console.log(`  maintenanceTasks:   ${taskIds.length} records`);
console.log(`  blockRequests:      ${reqIds.length} records`);
console.log(`  integratedBlocks:   ${blockIds.length} records`);
console.log(`  conflicts:          ${conflictIds.length} records`);
console.log(`  aiRecommendations:  ${recIds.length} records`);
console.log(`  auditEvents:        ${auditIds.length} records`);

if (errors.length === 0) {
  console.log('\n✅  All consistency checks PASSED.\n');
  process.exit(0);
} else {
  console.error(`\n❌  ${errors.length} validation error(s) found:\n`);
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
  console.log('');
  process.exit(1);
}
