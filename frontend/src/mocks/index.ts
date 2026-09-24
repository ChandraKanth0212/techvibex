/**
 * RailOpt Module 4 – Synthetic Demo Data
 * Division: SECUNDERABAD (SEC)
 *
 * Single barrel export for all mock datasets.
 * Import from this file; never import directly from individual mock modules
 * in service / repository code.
 *
 * Architecture contract:
 *   UI → hooks → services → mock repositories → mock data (this file)
 */

// ── Named dataset exports ────────────────────────────────────────────────────
export { mockAssets }            from './assets';
export { mockDefects }           from './defects';
export { mockMaintenanceTasks }  from './maintenanceTasks';
export { mockBlockRequests }     from './blockRequests';
export { mockCorridors }         from './corridors';
export { mockTrains }            from './trains';
export { mockGoodsForecasts }    from './goodsForecasts';
export { mockResources }         from './resources';
export { mockIntegratedBlocks }  from './integratedBlocks';
export { mockConflicts }         from './conflicts';
export { mockAIRecommendations } from './aiRecommendations';
export { mockAuditEvents }       from './auditEvents';
export { mockSchedules }         from './schedules';
export { mockDashboardMetrics }  from './dashboardMetrics';

// ── Validation utility (development / build-time only) ───────────────────────
import { mockAssets }            from './assets';
import { mockDefects }           from './defects';
import { mockMaintenanceTasks }  from './maintenanceTasks';
import { mockBlockRequests }     from './blockRequests';
import { mockIntegratedBlocks }  from './integratedBlocks';
import { mockConflicts }         from './conflicts';
import { mockAIRecommendations } from './aiRecommendations';
import { mockAuditEvents }       from './auditEvents';

/** Accumulated validation failure messages */
const _errors: string[] = [];

function _fail(msg: string): void {
  _errors.push(`[MockDataValidation] ${msg}`);
}

// ── 1. Duplicate ID checks ───────────────────────────────────────────────────
function _noDuplicates<T>(items: T[], idKey: keyof T, label: string): void {
  const seen = new Set<unknown>();
  for (const item of items) {
    const id = item[idKey];
    if (seen.has(id)) _fail(`Duplicate ${String(idKey)} "${String(id)}" in ${label}.`);
    seen.add(id);
  }
}

_noDuplicates(mockAssets,           'assetId',            'assets');
_noDuplicates(mockDefects,          'defectId',           'defects');
_noDuplicates(mockMaintenanceTasks, 'taskId',             'maintenanceTasks');
_noDuplicates(mockBlockRequests,    'requestId',          'blockRequests');
_noDuplicates(mockIntegratedBlocks, 'blockId',            'integratedBlocks');
_noDuplicates(mockConflicts,        'conflictId',         'conflicts');
_noDuplicates(mockAIRecommendations,'recommendationId',   'aiRecommendations');
_noDuplicates(mockAuditEvents,      'auditId',            'auditEvents');

// ── 2. Reference integrity ────────────────────────────────────────────────────
const _assetIds  = new Set(mockAssets.map((a) => a.assetId));
const _taskIds   = new Set(mockMaintenanceTasks.map((t) => t.taskId));
const _reqIds    = new Set(mockBlockRequests.map((r) => r.requestId));
const _blockIds  = new Set(mockIntegratedBlocks.map((b) => b.blockId));

// defect.assetId → assets
for (const d of mockDefects) {
  if (!_assetIds.has(d.assetId))
    _fail(`Defect "${d.defectId}".assetId "${d.assetId}" not found in assets.`);
}

// maintenanceTask.assetId → assets
// maintenanceTask.defectId (optional) → defects
const _defectIds = new Set(mockDefects.map((d) => d.defectId));
for (const t of mockMaintenanceTasks) {
  if (!_assetIds.has(t.assetId))
    _fail(`Task "${t.taskId}".assetId "${t.assetId}" not found in assets.`);
  if (t.defectId && !_defectIds.has(t.defectId))
    _fail(`Task "${t.taskId}".defectId "${t.defectId}" not found in defects.`);
}

// blockRequest.taskId → maintenanceTasks
for (const r of mockBlockRequests) {
  if (!_taskIds.has(r.taskId))
    _fail(`BlockRequest "${r.requestId}".taskId "${r.taskId}" not found in maintenanceTasks.`);
}

// integratedBlock.taskIds → maintenanceTasks
// integratedBlock.requestIds → blockRequests
for (const b of mockIntegratedBlocks) {
  for (const tid of b.taskIds) {
    if (!_taskIds.has(tid))
      _fail(`IntegratedBlock "${b.blockId}".taskIds contains "${tid}" not found in maintenanceTasks.`);
  }
  for (const rid of b.requestIds) {
    if (!_reqIds.has(rid))
      _fail(`IntegratedBlock "${b.blockId}".requestIds contains "${rid}" not found in blockRequests.`);
  }
}

// conflict.affectedTaskIds → maintenanceTasks
// conflict.affectedBlockIds → integratedBlocks (may be empty for tasks-only conflicts)
for (const c of mockConflicts) {
  for (const tid of c.affectedTaskIds) {
    if (!_taskIds.has(tid))
      _fail(`Conflict "${c.conflictId}".affectedTaskIds contains "${tid}" not found in maintenanceTasks.`);
  }
  for (const bid of c.affectedBlockIds) {
    if (!_blockIds.has(bid))
      _fail(`Conflict "${c.conflictId}".affectedBlockIds contains "${bid}" not found in integratedBlocks.`);
  }
}

// aiRecommendation.affectedTaskIds → maintenanceTasks
// aiRecommendation.affectedBlockIds → integratedBlocks
for (const rec of mockAIRecommendations) {
  for (const tid of rec.affectedTaskIds) {
    if (!_taskIds.has(tid))
      _fail(`AIRecommendation "${rec.recommendationId}".affectedTaskIds contains "${tid}" not found.`);
  }
  for (const bid of rec.affectedBlockIds) {
    if (!_blockIds.has(bid))
      _fail(`AIRecommendation "${rec.recommendationId}".affectedBlockIds contains "${bid}" not found.`);
  }
}

// ── 3. Department value checks ────────────────────────────────────────────────
const VALID_DEPARTMENTS = new Set(['ENGINEERING', 'SNT', 'TRACTION']);

for (const a of mockAssets) {
  if (!VALID_DEPARTMENTS.has(a.department))
    _fail(`Asset "${a.assetId}" has invalid department "${a.department}".`);
}
for (const t of mockMaintenanceTasks) {
  if (!VALID_DEPARTMENTS.has(t.department))
    _fail(`Task "${t.taskId}" has invalid department "${t.department}".`);
}
for (const b of mockIntegratedBlocks) {
  for (const dept of b.departments) {
    if (!VALID_DEPARTMENTS.has(dept))
      _fail(`IntegratedBlock "${b.blockId}" has invalid department "${dept}".`);
  }
}

// ── 4. Status value spot-checks ───────────────────────────────────────────────
const VALID_BLOCK_STATUS  = new Set(['AI_PROPOSED','UNDER_REVIEW','APPROVED','MODIFIED','REJECTED','PUBLISHED','COMPLETED','CANCELLED']);
const VALID_REQ_STATUS    = new Set(['PENDING','ANALYZING','CONFLICT','INTEGRATION_CANDIDATE','SCHEDULED','APPROVED','REJECTED','COMPLETED']);
const VALID_TASK_STATUS   = new Set(['PENDING','PRIORITIZED','SCHEDULED','IN_PROGRESS','COMPLETED','DEFERRED','CANCELLED']);

for (const b of mockIntegratedBlocks) {
  if (!VALID_BLOCK_STATUS.has(b.status))
    _fail(`IntegratedBlock "${b.blockId}" has invalid status "${b.status}".`);
}
for (const r of mockBlockRequests) {
  if (!VALID_REQ_STATUS.has(r.status))
    _fail(`BlockRequest "${r.requestId}" has invalid status "${r.status}".`);
}
for (const t of mockMaintenanceTasks) {
  if (!VALID_TASK_STATUS.has(t.status))
    _fail(`Task "${t.taskId}" has invalid status "${t.status}".`);
}

// ── 5. Report ─────────────────────────────────────────────────────────────────
/**
 * Returns all validation errors discovered at module-load time.
 * Call this in a dev-only script or a Vite plugin to surface problems at build time.
 */
export function getMockDataValidationErrors(): string[] {
  return [..._errors];
}

/**
 * Throws if any validation errors were detected.
 * Safe to call from a Vite plugin's configResolved hook or a Vitest setup file.
 */
export function assertMockDataValid(): void {
  if (_errors.length > 0) {
    throw new Error(
      `Mock data validation failed with ${_errors.length} error(s):\n` +
        _errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n'),
    );
  }
}

// Auto-report in development so errors surface in the browser console.
if (import.meta.env.DEV && _errors.length > 0) {
  console.error(
    '%c[RailOpt Mock Data] Validation FAILED',
    'color:red;font-weight:bold',
    '\n' + _errors.join('\n'),
  );
} else if (import.meta.env.DEV) {
  console.info('%c[RailOpt Mock Data] All consistency checks passed ✓', 'color:green');
}
