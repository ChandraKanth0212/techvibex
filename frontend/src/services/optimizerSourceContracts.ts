/**
 * Phase 9B-8, Decisions D and E — THE MISSING AUTHORITATIVE SOURCES.
 *
 * Both decisions have the same shape, so they live together:
 *
 *   "The authoritative source for this is <an external system>. Do not fabricate
 *    it. Keep the path blocked until that source is connected."
 *
 * That is a contract, not a feature, and the only thing this module does is make
 * the contract CHECKABLE. It defines what a conforming record must contain and
 * reports every violation by name, so that when a real source is connected the
 * first thing it can be asked is whether it is actually conforming, rather than
 * being discovered through a malformed plan.
 *
 * NOTHING HERE IS INSTANTIATED. There is no `MovementRegister` value and no
 * `CorridorTopologySource` value in Module 4, and this module does not create
 * one. Withholding the data is the decision; these functions exist so the
 * decision is verifiable rather than merely asserted.
 *
 * EVERYTHING HERE IS PURE.
 */

import type { Corridor, CorridorTopologyRecord, CorridorTopologySource } from '@/types/corridor';
import type { TrainMovementRecord } from '@/types/train';

// ─────────────────────────────────────────────────────────────────────────────
// Decision D — per-run movement register
// ─────────────────────────────────────────────────────────────────────────────

export interface ContractViolationReport<T> {
  readonly ok: boolean;
  readonly violations: readonly string[];
  /** Present only when `ok`. */
  readonly value?: T;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Whether one movement record satisfies the register contract.
 *
 * The check that matters most is the last: `movementId !== trainId`. Everything
 * else is a completeness test, but that one is what stops a service being
 * presented as one of its own runs, which is the specific substitution Decision D
 * refuses. A register that copied the service id into the movement field would
 * satisfy every other rule here.
 */
export function validateTrainMovementRecord(
  record: TrainMovementRecord,
): ContractViolationReport<TrainMovementRecord> {
  const violations: string[] = [];

  if (!isNonEmptyString(record.movementId)) {
    violations.push('movementId is required: a movement is identified in its own right.');
  }
  if (!isNonEmptyString(record.trainId)) {
    violations.push('trainId is required: a movement belongs to a service.');
  }
  if (!isNonEmptyString(record.runIdentity)) {
    violations.push('runIdentity is required: without it a movement cannot be tied to one run.');
  }
  if (!isNonEmptyString(record.runDate)) {
    violations.push('runDate is required: a service has many runs, so the date distinguishes them.');
  }
  if (!isNonEmptyString(record.corridorId)) {
    violations.push('corridorId is required and explicit: it is never derived from section.');
  }
  if (!isNonEmptyString(record.section)) {
    violations.push('section is required.');
  }
  if (!isNonEmptyString(record.departure)) {
    violations.push('departure is required.');
  }
  if (!isNonEmptyString(record.arrival)) {
    violations.push('arrival is required.');
  }
  if (isNonEmptyString(record.departure) && isNonEmptyString(record.arrival)) {
    if (!(Date.parse(record.arrival) > Date.parse(record.departure))) {
      violations.push('arrival must be after departure: a movement occupies the corridor between them.');
    }
  }
  if (record.direction !== 'UP' && record.direction !== 'DOWN') {
    violations.push('direction is required: UP or DOWN.');
  }
  if (isNonEmptyString(record.movementId) && record.movementId === record.trainId) {
    violations.push(
      'movementId must differ from trainId: a trainId is a service and a movement is one run of it. A trainId is never accepted as a movement_id.',
    );
  }

  return violations.length === 0
    ? { ok: true, violations: [], value: record }
    : { ok: false, violations };
}

/**
 * Validates a whole register, including cross-record uniqueness.
 *
 * Uniqueness is checked because a per-run register that reuses an id is not
 * per-run: two runs sharing a movement id are indistinguishable to the
 * optimiser, which is the failure the register exists to prevent.
 */
export function validateMovementRegister(
  register: MovementRegisterLike,
): ContractViolationReport<readonly TrainMovementRecord[]> {
  const violations: string[] = [];
  const byId = new Map<string, number>();

  register.movements.forEach((record, index) => {
    for (const violation of validateTrainMovementRecord(record).violations) {
      violations.push(`movements[${index}]: ${violation}`);
    }
    const seen = byId.get(record.movementId);
    if (seen !== undefined) {
      violations.push(
        `movements[${index}]: movementId ${record.movementId} is already used by movements[${seen}]; a per-run register must be unique per run.`,
      );
    } else {
      byId.set(record.movementId, index);
    }
  });

  return violations.length === 0
    ? { ok: true, violations: [], value: register.movements }
    : { ok: false, violations };
}

/** Structural view of {@link import('@/types/train').MovementRegister}. */
export interface MovementRegisterLike {
  readonly movements: readonly TrainMovementRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision E — authoritative ordered corridor topology
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether one topology record satisfies the source contract.
 *
 * The ordering rule is the substantive one: a topology that lists sections in
 * arbitrary order cannot be used to reason about a route, and a single-element
 * list is the specific degenerate case of "this route has no internal structure"
 * that must never be manufactured from `Corridor.sectionId`.
 */
export function validateCorridorTopologyRecord(
  record: CorridorTopologyRecord,
): ContractViolationReport<CorridorTopologyRecord> {
  const violations: string[] = [];

  if (!isNonEmptyString(record.corridorId)) {
    violations.push('corridorId is required.');
  }
  if (!Array.isArray(record.orderedSectionIds) || record.orderedSectionIds.length === 0) {
    violations.push(
      'orderedSectionIds is required and must be non-empty: topology is never back-filled from sectionId, a corridor id, or neighbouring corridors.',
    );
  } else {
    if (!record.orderedSectionIds.every(isNonEmptyString)) {
      violations.push('every entry in orderedSectionIds must be a non-empty section id.');
    }
    const duplicates = record.orderedSectionIds.filter(
      (id, index) => record.orderedSectionIds.indexOf(id) !== index,
    );
    if (duplicates.length > 0) {
      violations.push(
        `orderedSectionIds repeats ${[...new Set(duplicates)].join(', ')}: a route traverses each section once, so a repeated entry is not a usable ordering.`,
      );
    }
  }

  return violations.length === 0
    ? { ok: true, violations: [], value: record }
    : { ok: false, violations };
}

/** Validates a topology source, including one-record-per-corridor. */
export function validateCorridorTopologySource(
  source: CorridorTopologySource,
): ContractViolationReport<readonly CorridorTopologyRecord[]> {
  const violations: string[] = [];
  const seen = new Set<string>();

  source.topology.forEach((record, index) => {
    for (const violation of validateCorridorTopologyRecord(record).violations) {
      violations.push(`topology[${index}]: ${violation}`);
    }
    const key = `${record.corridorId}|${record.direction ?? 'UNSPECIFIED'}|${record.effectiveFrom ?? 'UNSPECIFIED'}`;
    if (seen.has(key)) {
      violations.push(
        `topology[${index}]: corridor ${record.corridorId} already has a record for this direction and effective date.`,
      );
    }
    seen.add(key);
  });

  return violations.length === 0
    ? { ok: true, violations: [], value: source.topology }
    : { ok: false, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Source-linkage metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata only: a DECLARATION that a source is connected, not the source itself.
 *
 * Why this is not `MovementRegister` / `CorridorTopologySource`:
 *
 * Putting those in the readiness snapshot would drag the whole authoritative
 * source into a pure availability check, and — worse — it would make the check
 * depend on data whose provenance is the very thing in question. A caller that
 * supplied an empty-but-valid register would satisfy readiness while supplying
 * no movement ids, and the two failures would be indistinguishable.
 *
 * So readiness is told *that* a source is connected, in a form it cannot mistake
 * for the data. The register and the topology source stay where they are: the
 * ingestion layer that owns them, which populates this metadata from the same
 * place it populates the entities. Readiness never constructs one.
 *
 * Every field is a claim, and a claim has to be made explicitly:
 *   - `sourceKind` stops a movement register vouching for corridor topology.
 *   - `sourceId` identifies which connection, so a half-finished or wrong
 *     connection is nameable rather than anonymous.
 *   - `authoritative` is a separate boolean, not inferred from `sourceId` being
 *     present. A caller cannot obtain authority by typing a string.
 *   - `sourceStatus` separates "connected" from "connected but unverified", which
 *     are different claims and only the first is a source.
 */
export const MOVEMENT_REGISTER_SOURCE_KIND = 'MOVEMENT_REGISTER';
export const CORRIDOR_TOPOLOGY_SOURCE_KIND = 'CORRIDOR_TOPOLOGY';
export const POSSESSION_GRANT_SYSTEM_SOURCE_KIND = 'POSSESSION_GRANT_SYSTEM';

export type AuthoritativeSourceKind =
  | typeof MOVEMENT_REGISTER_SOURCE_KIND
  | typeof CORRIDOR_TOPOLOGY_SOURCE_KIND
  | typeof POSSESSION_GRANT_SYSTEM_SOURCE_KIND;

export type AuthoritativeSourceStatus = 'CONNECTED' | 'CONNECTED_UNVERIFIED' | 'NOT_CONNECTED';

export interface AuthoritativeSourceLinkage {
  readonly sourceKind: AuthoritativeSourceKind;
  /** Identifies the connection. Never a movement id, section id or data value. */
  readonly sourceId: string;
  /** Must be explicitly true. Authority is claimed, never derived. */
  readonly authoritative: boolean;
  readonly sourceStatus: AuthoritativeSourceStatus;
}

export interface SourceLinkageReport {
  readonly ok: boolean;
  /** Present only when `ok`; the connection that was accepted. */
  readonly linkage?: AuthoritativeSourceLinkage;
  /** Always present; names the specific missing claim when `ok` is false. */
  readonly reason: string;
}

const SOURCE_KIND_NAMES: Record<AuthoritativeSourceKind, string> = {
  [MOVEMENT_REGISTER_SOURCE_KIND]: 'per-run movement register',
  [CORRIDOR_TOPOLOGY_SOURCE_KIND]: 'authoritative corridor topology source',
  [POSSESSION_GRANT_SYSTEM_SOURCE_KIND]: 'possession/grant system',
};

/**
 * Whether a linkage declaration actually establishes an authoritative source of
 * the requested kind.
 *
 * Every condition is a separate explicit claim, and the first one that fails is
 * the reported reason. There is deliberately no "best effort" path and no
 * tolerance: a linkage that is absent, of the wrong kind, un-named, not
 * authoritative, or unverified yields `ok: false`, and callers treat that as
 * "the source is not connected".
 *
 * Nothing here inspects the data the source allegedly produced. That is the
 * point of the split: the data and the claim are assessed independently, and
 * neither alone is sufficient.
 */
export function assessSourceLinkage(
  linkage: AuthoritativeSourceLinkage | undefined,
  expectedKind: AuthoritativeSourceKind,
): SourceLinkageReport {
  const sourceName = SOURCE_KIND_NAMES[expectedKind];

  if (linkage === undefined) {
    return {
      ok: false,
      reason: `No ${sourceName} is linked, so nothing states where the values came from. Values alone do not establish a source.`,
    };
  }
  if (linkage.sourceKind !== expectedKind) {
    return {
      ok: false,
      reason: `The linkage declares source kind ${linkage.sourceKind}, which cannot speak for the ${sourceName}. A source only ever vouches for its own kind.`,
    };
  }
  if (!isNonEmptyString(linkage.sourceId)) {
    return {
      ok: false,
      reason: `The ${sourceName} linkage names no sourceId. An unnamed connection cannot be identified, audited or withdrawn.`,
    };
  }
  if (linkage.authoritative !== true) {
    return {
      ok: false,
      reason: `The ${sourceName} linkage (${linkage.sourceId}) is not marked authoritative. Authority is never inferred: a source that exists but is not authoritative cannot establish provenance.`,
    };
  }
  if (linkage.sourceStatus !== 'CONNECTED') {
    return {
      ok: false,
      reason: `The ${sourceName} linkage (${linkage.sourceId}) reports status ${linkage.sourceStatus}, not CONNECTED. A source that is connected but unverified is still unverified.`,
    };
  }

  return {
    ok: true,
    linkage,
    reason: `Linked to the ${sourceName} ${linkage.sourceId}, marked authoritative and connected.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a corridor's sections from an authoritative source
// ─────────────────────────────────────────────────────────────────────────────

export type CorridorSectionsResult =
  | {
      readonly status: 'AUTHORITATIVE';
      readonly corridorId: string;
      readonly orderedSectionIds: readonly string[];
      readonly version?: string;
    }
  | {
      readonly status: 'UNAVAILABLE';
      readonly reason: string;
    };

/**
 * The ordered sections of one corridor, from an authoritative source only.
 *
 * The signature is the point: there is no fallback parameter and no way to pass
 * a candidate list. With no source, or no record for the corridor, the answer is
 * `UNAVAILABLE`. It is structurally impossible for this function to return
 * `[corridor.sectionId]`, which is the fabrication Decision E refuses.
 */
export function resolveAuthoritativeCorridorSections(
  corridor: Pick<Corridor, 'corridorId' | 'sectionId'>,
  source: CorridorTopologySource | undefined,
): CorridorSectionsResult {
  if (source === undefined) {
    return {
      status: 'UNAVAILABLE',
      reason: `No authoritative topology source is connected. Corridor ${corridor.corridorId} declares one section (${corridor.sectionId}); Module 3 needs the ordered extent of the route, and that has not been surveyed here. It is never back-filled from sectionId.`,
    };
  }

  const report = validateCorridorTopologySource(source);
  if (!report.ok) {
    return {
      status: 'UNAVAILABLE',
      reason: `The connected topology source is not conforming: ${report.violations.join(' ')}`,
    };
  }

  const records = source.topology.filter((r) => r.corridorId === corridor.corridorId);
  if (records.length === 0) {
    return {
      status: 'UNAVAILABLE',
      reason: `The authoritative topology source has no record for corridor ${corridor.corridorId}. Topology is never inferred from its sectionId or from neighbouring corridors.`,
    };
  }
  if (records.length > 1) {
    return {
      status: 'UNAVAILABLE',
      reason: `The authoritative topology source has ${records.length} records for corridor ${corridor.corridorId}. Picking one would be a data-reading decision about which route is real, so this fails explicitly.`,
    };
  }

  const record = records[0];
  const validated = validateCorridorTopologyRecord(record);
  if (!validated.ok) {
    return {
      status: 'UNAVAILABLE',
      reason: `Topology for corridor ${corridor.corridorId} is not conforming: ${validated.violations.join(' ')}`,
    };
  }

  return {
    status: 'AUTHORITATIVE',
    corridorId: record.corridorId,
    orderedSectionIds: [...record.orderedSectionIds],
    ...(record.version !== undefined ? { version: record.version } : {}),
  };
}
