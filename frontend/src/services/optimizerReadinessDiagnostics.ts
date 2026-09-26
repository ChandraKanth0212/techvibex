/**
 * Presentation-only view model for the Module 4 optimizer readiness diagnostic.
 *
 * This module is intentionally PURE and has no React/JSX dependency so the
 * operator-facing logic can be asserted in the Node test environment.
 *
 * Hard rules encoded here:
 *  - It NEVER reclassifies a blocker. Grouping is a presentation concern; the
 *    `status`, `reason`, `requirement`, `source` and `coverage` values are
 *    passed through verbatim from the service.
 *  - It NEVER invents a blocker, explanation, or mapping. Anything not present
 *    on the input is rendered as an explicit absence, not a guess.
 *  - `UNAVAILABLE_FROM_MODULE_4` and `UNRESOLVED` are never softened, and
 *    `MODULE_3_SYNTHETIC_DEMO` is never presented as real Module 4 data.
 */
import type {
  OptimizerBlocker,
  OptimizerModule4Result,
} from './optimizerService';
import type { OptimizerRequestReadiness } from './optimizerRequestReadiness';
import type {
  OptimizerProvenanceEntry,
  OptimizerProvenanceLabel,
} from './optimizerDemoRequest';

/**
 * The two Module 3 request-level paths that exist only because of an operator
 * selection. Taken verbatim from the Module 3 request contract; no other path
 * is treated as a planner-selection blocker.
 */
const SELECTION_PATHS: readonly string[] = ['request.corridor_id', 'request.task_ids'];

export type BlockerGroupId =
  | 'MISSING_SELECTION'
  | 'MISSING_SOURCE_DATA'
  | 'UNRESOLVED_MAPPING'
  | 'OTHER_CONTRACT';

export interface BlockerGroup {
  readonly id: BlockerGroupId;
  readonly title: string;
  /** True when the operator can act on this group without new mappings. */
  readonly userResolvable: boolean;
  readonly blockers: readonly OptimizerBlocker[];
}

/** Presentation bucket for a single blocker. Never mutates the blocker. */
export function blockerGroupId(blocker: OptimizerBlocker): BlockerGroupId {
  if (SELECTION_PATHS.includes(blocker.field)) return 'MISSING_SELECTION';
  if (blocker.status === 'UNRESOLVED') return 'UNRESOLVED_MAPPING';
  if (blocker.status === 'PARTIAL') return 'MISSING_SOURCE_DATA';
  if (blocker.status === 'UNAVAILABLE' && blocker.resolvableByUserAction) {
    return 'MISSING_SOURCE_DATA';
  }
  return 'OTHER_CONTRACT';
}

const GROUP_TITLES: Record<BlockerGroupId, string> = {
  MISSING_SELECTION: 'Missing planner selection',
  MISSING_SOURCE_DATA: 'Missing source data',
  UNRESOLVED_MAPPING: 'Unresolved semantic mapping',
  OTHER_CONTRACT: 'Other contract requirements',
};

/** Fixed display order; empty groups are dropped so nothing empty is implied. */
const GROUP_ORDER: readonly BlockerGroupId[] = [
  'MISSING_SELECTION',
  'MISSING_SOURCE_DATA',
  'UNRESOLVED_MAPPING',
  'OTHER_CONTRACT',
];

/**
 * Group blockers for display. Every input blocker appears in exactly one group
 * and is passed through by reference — no field is rewritten, dropped or added.
 */
export function groupBlockers(
  blockers: readonly OptimizerBlocker[],
): BlockerGroup[] {
  const buckets = new Map<BlockerGroupId, OptimizerBlocker[]>();
  for (const blocker of blockers) {
    const id = blockerGroupId(blocker);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(blocker);
    else buckets.set(id, [blocker]);
  }
  return GROUP_ORDER.filter((id) => (buckets.get(id)?.length ?? 0) > 0).map(
    (id) => {
      const members = buckets.get(id) ?? [];
      return {
        id,
        title: GROUP_TITLES[id],
        userResolvable: members.every((b) => b.resolvableByUserAction),
        blockers: members,
      };
    },
  );
}

export interface ProvenanceSummaryEntry {
  readonly label: OptimizerProvenanceLabel;
  readonly count: number;
  /** Fields carrying this label, verbatim. */
  readonly fields: readonly string[];
  /** True when this label means the data is not real Module 4 data. */
  readonly synthetic: boolean;
}

export function isSyntheticLabel(
  label: OptimizerProvenanceLabel,
): boolean {
  return label === 'MODULE_3_SYNTHETIC_DEMO';
}

export function isUnavailableLabel(
  label: OptimizerProvenanceLabel,
): boolean {
  return label === 'UNAVAILABLE_FROM_MODULE_4';
}

/** Count provenance entries by label, preserving first-seen label order. */
export function summarizeProvenance(
  provenance: readonly OptimizerProvenanceEntry[],
): ProvenanceSummaryEntry[] {
  const order: OptimizerProvenanceLabel[] = [];
  const fields = new Map<OptimizerProvenanceLabel, string[]>();
  for (const entry of provenance) {
    const existing = fields.get(entry.label);
    if (existing) existing.push(entry.field);
    else {
      order.push(entry.label);
      fields.set(entry.label, [entry.field]);
    }
  }
  return order.map((label) => {
    const labelFields = fields.get(label) ?? [];
    return {
      label,
      count: labelFields.length,
      fields: labelFields,
      synthetic: isSyntheticLabel(label),
    };
  });
}

export interface OptimizerDiagnosticsView {
  readonly kind: 'PLAN' | 'BLOCKED';
  readonly state: OptimizerRequestReadiness['state'];
  readonly dataMode: OptimizerRequestReadiness['dataMode'];
  /** True when any part of this result originates from Module 3's demo world. */
  readonly synthetic: boolean;
  /**
   * False whenever a real Module 4 request cannot be constructed, or when the
   * real optimizer is disabled. The UI must not offer a real API action then.
   */
  readonly canRunRealOptimizer: boolean;
  readonly corridor: {
    readonly corridorId: string | null;
    readonly sectionId: string | null;
    readonly source: OptimizerProvenanceLabel;
    /** True when the corridor is genuinely absent, never defaulted. */
    readonly unavailable: boolean;
  };
  readonly taskSelection: {
    readonly count: number;
    readonly ids: readonly string[];
  };
  readonly summary: OptimizerRequestReadiness['summary'];
  readonly groups: BlockerGroup[];
  readonly blockerCount: number;
  readonly provenance: ProvenanceSummaryEntry[];
  readonly emitted: readonly string[];
  readonly omitted: readonly {
    readonly collection: string;
    readonly blockedBy: readonly string[];
  }[];
  /** Exact `readiness.warnings` text; empty when the engine reported none. */
  readonly warnings: readonly string[];
}

export interface DiagnosticsOptions {
  /** Mirrors `optimizerService.isEnabled()`. */
  readonly optimizerEnabled: boolean;
  /**
   * The operator's real task selection, read from `PlannerScope` via
   * `plannerScopeTaskIds`. Passed in explicitly because the readiness engine
   * deliberately does not echo the selection back: an empty list means NO
   * tasks are selected, never "all of them".
   */
  readonly selectedTaskIds: readonly string[];
}

/**
 * Build the operator diagnostic view from a typed service result.
 *
 * The typed union is the gate: a BLOCKED result can never report
 * `canRunRealOptimizer: true`, and a PLAN result carries no blockers because
 * the service only constructs it after a fully verified request.
 */
export function buildDiagnosticsView(
  result: OptimizerModule4Result,
  options: DiagnosticsOptions,
): OptimizerDiagnosticsView {
  const readiness = result.readiness;
  const provenance = summarizeProvenance(result.provenance);
  const synthetic =
    readiness.dataMode !== 'MODULE_4' ||
    result.provenance.some((e) => isSyntheticLabel(e.label)) ||
    readiness.inputs.some((i) => i.synthetic);
  const blockers = result.kind === 'BLOCKED' ? result.blockers : [];
  const blocked = result.kind === 'BLOCKED' || blockers.length > 0;
  const notReady = readiness.state !== 'READY';

  return {
    kind: result.kind,
    state: readiness.state,
    dataMode: readiness.dataMode,
    synthetic,
    canRunRealOptimizer: options.optimizerEnabled && !blocked && !notReady,
    corridor: {
      corridorId: readiness.scope.corridorId,
      sectionId: readiness.scope.sectionId,
      source: readiness.scope.source,
      unavailable:
        readiness.scope.corridorId === null &&
        isUnavailableLabel(readiness.scope.source),
    },
    taskSelection: {
      count: options.selectedTaskIds.length,
      ids: [...options.selectedTaskIds],
    },
    summary: readiness.summary,
    groups: groupBlockers(blockers),
    blockerCount: blockers.length,
    provenance,
    emitted: result.kind === 'PLAN' ? result.emitted : [],
    omitted: result.kind === 'PLAN' ? result.omitted : [],
    warnings: readiness.warnings,
  };
}
