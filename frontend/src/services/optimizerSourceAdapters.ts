/**
 * Phase 9B-8 — THE UPSTREAM-SOURCE ADAPTER BOUNDARY.
 *
 * This module is the last place external data is allowed to enter the optimizer
 * path, and it contains no data, no connector and no network call. It declares
 * what an upstream system would have to be able to say before any of its values
 * are allowed to mean anything here.
 *
 * WHY A BOUNDARY, GIVEN THAT CONTRACTS ALREADY EXIST
 * --------------------------------------------------
 * `optimizerSourceContracts` already defines the RECORD shapes
 * (`TrainMovementRecord`, `CorridorTopologyRecord`, `ExistingOccupancy`) and
 * `AuthoritativeSourceLinkage` already defines how a source CLAIMS authority. The
 * gap those two leave between them is who supplies the claim.
 *
 * Today `Module4ReadinessSnapshot` takes the records and the linkage as two
 * independent fields, so nothing structurally connects them. A caller can paste
 * records into `occupancies` and declare a linkage for a possession system it has
 * not connected, and readiness will believe both because each is individually
 * well-formed. That is the residual trust weakness in the linkage model, and it
 * is a wiring problem rather than a validation problem.
 *
 * An adapter fixes it by making the two inseparable at the type level: every
 * adapter returns {@link SourcedData}, which carries the records and the
 * descriptor that describes where they came from TOGETHER. A consumer that has
 * records necessarily also has a descriptor, because there is no way to obtain one
 * without the other. The claim can still be a lie — no type can prevent that — but
 * it can no longer be *separated* from the data it is claiming about.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 *   - No implementation of any adapter, and no reference implementation.
 *   - No HTTP client, no connector, no transport, no credentials.
 *   - No records, no sample payloads, no constants carrying source values.
 *   - No default adapter, no null-object adapter, and no `undefined` stand-in.
 *
 * The absence is enforced rather than merely documented: {@link UpstreamSourceBoundary}
 * declares all three adapters as REQUIRED, so a boundary cannot be constructed
 * with a source missing. It cannot be "partially wired" and it cannot be faked by
 * omission. Until a real system is connected, nothing constructs one, and the five
 * readiness blockers stay exactly where they are.
 *
 * FALLBACKS
 * ---------
 * None, and the type signatures are arranged so none can be added quietly:
 *   - no adapter method has a fallback parameter, and none can return records for
 *     a source it did not name, so `movementId` can never be filled from `trainId`;
 *   - no adapter accepts a `Corridor.sectionId` to stand in for topology, so
 *     ordered sections can never be back-filled from a single section;
 *   - possession payloads are `ExistingOccupancy` records only, so an
 *     `IntegratedBlock` or an `AvailabilityWindow` is not assignable to them;
 *   - no adapter maps a resource type, so no implicit resource or occupancy
 *     correspondence can originate at this boundary either.
 *
 * EVERY FUNCTION HERE IS PURE. Nothing in this module performs I/O; the adapters
 * DECLARE that someone else must.
 */

import type { CorridorTopologySource } from '@/types/corridor';
import type { ExistingOccupancy } from '@/types/occupancy';
import type { MovementRegister } from '@/types/train';
import {
  assessSourceLinkage,
  CORRIDOR_TOPOLOGY_SOURCE_KIND,
  MOVEMENT_REGISTER_SOURCE_KIND,
  POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
  type AuthoritativeSourceKind,
  type AuthoritativeSourceLinkage,
  type AuthoritativeSourceStatus,
  type SourceLinkageReport,
} from './optimizerSourceContracts';

// ─────────────────────────────────────────────────────────────────────────────
// What a source says about itself
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An upstream system's self-description. METADATA, never data.
 *
 * Deliberately excludes the records: a descriptor that could carry a payload
 * could be handed a fabricated one and still be a "valid descriptor". Keeping the
 * two apart means a descriptor is always only ever a claim, and a payload is
 * always only ever data, and {@link SourcedData} is the single place they are
 * allowed to meet.
 *
 * The three fields map one-for-one onto `AuthoritativeSourceLinkage`, because
 * that model is the one readiness already trusts and this module extends it rather
 * than replacing it.
 */
export interface UpstreamSourceDescriptor {
  /**
   * Identifies THIS connection — the deployment, tenant or feed, not the data.
   * Two adapters of the same kind pointed at different systems must report
   * different ids, which is what makes a mis-wiring visible instead of silent.
   */
  readonly sourceId: string;
  /** May an adapter of this kind declare itself authoritative? Set by the operator. */
  readonly authoritative: boolean;
  readonly sourceStatus: AuthoritativeSourceStatus;
}

/**
 * A descriptor turned into the linkage readiness consumes.
 *
 * The `sourceKind` is taken as an argument rather than read off the descriptor, so
 * a caller must name which kind of source it is claiming to be. It is then handed
 * straight to `assessSourceLinkage`, which is the single existing gate for that
 * claim — this module adds no second, weaker way of becoming authoritative.
 */
export function toSourceLinkage(
  sourceKind: AuthoritativeSourceKind,
  descriptor: UpstreamSourceDescriptor,
): AuthoritativeSourceLinkage {
  return {
    sourceKind,
    sourceId: descriptor.sourceId,
    authoritative: descriptor.authoritative,
    sourceStatus: descriptor.sourceStatus,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounded queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scopes exist so an adapter is always asked a BOUNDED question.
 *
 * Without one, "give me the movements" is answerable only by returning everything
 * the source holds, and the caller then has to decide which of it applies to the
 * request being built. That decision is a scoping decision about railway reality,
 * and making it here is exactly how a source's data ends up applied to a run it
 * never described.
 *
 * Every field is required and never defaulted.
 */
export interface MovementScope {
  /** ISO date (YYYY-MM-DD). Movements are per-run, so a date is part of the question. */
  readonly runDate: string;
  /** Corridors in scope. Non-empty: "all movements ever" is not a question worth asking. */
  readonly corridorIds: readonly string[];
}

export interface TopologyScope {
  /** Corridors whose topology is needed. */
  readonly corridorIds: readonly string[];
  /**
   * ISO date (YYYY-MM-DD) whose topology is wanted, because a route's ordered
   * sections change over time and "the" topology is not a timeless fact.
   */
  readonly effectiveOn: string;
}

export interface PossessionScope {
  readonly corridorIds: readonly string[];
  /** ISO datetime. The window of possession being asked about. */
  readonly windowStart: string;
  /** ISO datetime. Must be after `windowStart`. */
  readonly windowEnd: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The pairing: data can never arrive without its claim
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records and the descriptor that describes them, together and inseparably.
 *
 * This is the load-bearing type of the module. There is no way to obtain
 * `data` without also obtaining `descriptor`, so the "records from one place,
 * provenance from another" split that `Module4ReadinessSnapshot` currently allows
 * cannot be reproduced by anything that goes through an adapter.
 */
export interface SourcedData<TData> {
  readonly descriptor: UpstreamSourceDescriptor;
  readonly data: TData;
}

// ─────────────────────────────────────────────────────────────────────────────
// The three adapters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The authoritative source of per-run movement identities.
 *
 * `sourceKind` is a literal on the interface, so an adapter is branded with the
 * kind it is and cannot be passed where another kind is expected. The return type
 * is the existing `MovementRegister`, so what arrives is validated by the existing
 * `validateMovementRegister` before anything downstream sees it.
 */
export interface MovementRegisterAdapter {
  readonly sourceKind: typeof MOVEMENT_REGISTER_SOURCE_KIND;
  /** Self-description. Never inferred from the data it returns. */
  describeSource(): UpstreamSourceDescriptor;
  /**
   * @throws when the upstream system is unreachable, or answers with something that
   * is not a movement register. Declared rather than implemented: there is no
   * implementation here, and no fallback for when it fails.
   */
  fetchMovementRegister(scope: MovementScope): Promise<SourcedData<MovementRegister>>;
}

/**
 * The authoritative source of ordered corridor topology.
 *
 * Returns the existing `CorridorTopologySource`, validated by
 * `validateCorridorTopologySource`. Note what is absent from the signature: there
 * is no parameter through which a caller could offer a candidate section list, so
 * this is the same structural guarantee `resolveAuthoritativeCorridorSections`
 * makes — a single-element `[sectionId]` cannot be returned, because there is no
 * input from which it could be manufactured.
 */
export interface CorridorTopologyAdapter {
  readonly sourceKind: typeof CORRIDOR_TOPOLOGY_SOURCE_KIND;
  describeSource(): UpstreamSourceDescriptor;
  fetchCorridorTopology(scope: TopologyScope): Promise<SourcedData<CorridorTopologySource>>;
}

/**
 * The authoritative source of granted possession.
 *
 * Returns `ExistingOccupancy` records and nothing else, so an `IntegratedBlock`
 * (a planning artefact) or an `AvailabilityWindow` (a capacity statement) is not
 * assignable to the payload. The guarantee is the type's, not a runtime filter's.
 *
 * Note also what is NOT a parameter: no `BlockRequest`, no `BlockType`, and no
 * default occupancy type. There is no way to ask this adapter for "whatever
 * occupancy applies" and receive one, so a request can never be answered by its
 * own request.
 */
export interface PossessionGrantAdapter {
  readonly sourceKind: typeof POSSESSION_GRANT_SYSTEM_SOURCE_KIND;
  describeSource(): UpstreamSourceDescriptor;
  fetchGrantedPossessions(
    scope: PossessionScope,
  ): Promise<SourcedData<readonly ExistingOccupancy[]>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// All three, as one explicit dependency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three external sources, required.
 *
 * Every field is non-optional and there is no default, no factory and no
 * null-object implementation, so a boundary cannot exist with a source missing.
 * That is what "the sources remain explicit dependencies" means here: not that
 * this object is checked in a test, but that the compiler will not let a program
 * build one that is incomplete.
 *
 * Grouping them is also what stops a "movement" from being sourced from the
 * possession system by accident: the three are separate, individually-branded
 * fields, and swapping two is a type error rather than a runtime surprise.
 */
export interface UpstreamSourceBoundary {
  readonly movementRegister: MovementRegisterAdapter;
  readonly corridorTopology: CorridorTopologyAdapter;
  readonly possessionGrant: PossessionGrantAdapter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

export interface UpstreamSourceReport {
  readonly sourceKind: AuthoritativeSourceKind;
  /** The connection's self-reported id, or `null` if it declared none. */
  readonly sourceId: string | null;
  /** The verdict from the EXISTING linkage gate; this module adds no rule of its own. */
  readonly linkage: SourceLinkageReport;
  readonly accepted: boolean;
}

/**
 * The boundary's current state, one report per source.
 *
 * Always returns three reports, in a fixed order, whether or not a source is
 * connected. A missing or unconnected source therefore still appears — it is
 * reported as unaccepted rather than omitted, which is the difference between
 * "nobody asked" and "asked, and there is nothing there".
 *
 * Delegates every judgement to `assessSourceLinkage`, so an adapter cannot become
 * authoritative by a route this module invented.
 */
export function describeUpstreamBoundary(
  boundary: UpstreamSourceBoundary,
): readonly UpstreamSourceReport[] {
  const describe = (
    sourceKind: AuthoritativeSourceKind,
    adapter: { describeSource(): UpstreamSourceDescriptor },
  ): UpstreamSourceReport => {
    const descriptor = adapter.describeSource();
    const linkage = assessSourceLinkage(toSourceLinkage(sourceKind, descriptor), sourceKind);
    return {
      sourceKind,
      sourceId: typeof descriptor?.sourceId === 'string' ? descriptor.sourceId : null,
      linkage,
      accepted: linkage.ok,
    };
  };

  return [
    describe(MOVEMENT_REGISTER_SOURCE_KIND, boundary.movementRegister),
    describe(CORRIDOR_TOPOLOGY_SOURCE_KIND, boundary.corridorTopology),
    describe(POSSESSION_GRANT_SYSTEM_SOURCE_KIND, boundary.possessionGrant),
  ];
}
