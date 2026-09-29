/**
 * TEST FIXTURE — a Module 4 world in which all five Phase 9B-8 decisions have
 * been MADE, so the success path can be exercised at all.
 *
 * READ THIS BEFORE COPYING ANYTHING OUT OF HERE
 * ----------------------------------------------
 * The real path can only be exercised in a world where the five unresolved
 * inputs have been answered. That is not the world Module 4 is in, and this file
 * is not how it gets there: nothing here is written into `src/mocks`, and no
 * value here is a statement about railway reality.
 *
 * In particular {@link TEST_ONLY_RESOURCE_TYPE_MAPPINGS} below is a set of
 * ARBITRARY placeholders. Decision C explicitly approved the mapping MECHANISM
 * and approved NO mapping values, so the production table
 * (`APPROVED_RESOURCE_TYPE_MAPPINGS`) remains empty. These entries exist only so
 * that "an approved mapping can be applied later without changing the Module 4
 * enum" is testable at all. They are versioned `TEST-ONLY-NOT-APPROVED` so they
 * cannot be mistaken for a decision, and they must never be promoted to
 * production.
 *
 * What each decision requires here, and nothing more:
 *   A  a CONFIRMED priority on every task (an AI recommendation is not enough)
 *   B  a GRANTED possession covering every block request's task, PLUS an explicit
 *      source-linkage declaration — the records alone are never taken as evidence
 *      of a possession system
 *   C  an approved mapping table covering every Module 4 resource type
 *   D  a per-run movementId distinct from trainId, PLUS an explicit source-linkage
 *      declaration — the id alone is never taken as evidence of a register
 *   E  a valid ordered section list, PLUS an explicit source-linkage declaration
 *      — the array alone is never taken as evidence of a survey
 */

import type { Module4ReadinessSnapshot } from '@/services/optimizerRequestReadiness';
import { confirmTaskPriority } from '@/services/taskPriorityDecision';
import {
  CORRIDOR_TOPOLOGY_SOURCE_KIND,
  MOVEMENT_REGISTER_SOURCE_KIND,
  POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
  type AuthoritativeSourceLinkage,
} from '@/services/optimizerSourceContracts';
import { MODULE_4_RESOURCE_TYPES, type ResourceTypeMapping } from '@/types/resource';
import type { ExistingOccupancy } from '@/types/occupancy';
import { MODULE_3_RESOURCE_TYPES } from '@/types/optimizer';

/**
 * ARBITRARY. Chosen to be wrong on purpose as often as possible: `TRACK_MACHINE`
 * is mapped to `MANPOWER` here, which is almost certainly not the right answer
 * and is exactly the kind of answer Decision C refuses to guess.
 */
export const TEST_ONLY_RESOURCE_TYPE_MAPPINGS: readonly ResourceTypeMapping[] =
  MODULE_4_RESOURCE_TYPES.map((module4ResourceType, index) => ({
    module4ResourceType,
    module3ResourceType: MODULE_3_RESOURCE_TYPES[index % MODULE_3_RESOURCE_TYPES.length],
    mappingVersion: 'TEST-ONLY-NOT-APPROVED',
    approval: {
      approvedBy: 'test-fixture',
      approvedAt: '2026-01-01T00:00:00Z',
      reference: 'TEST-FIXTURE-ONLY-NO-REAL-APPROVAL',
    },
  }));

/**
 * TEST-ONLY source-linkage metadata. ARBITRARY, and deliberately named so that
 * it cannot be mistaken for a real connection.
 *
 * These are DECLARATIONS, not sources: no `MovementRegister` and no
 * `CorridorTopologySource` exists in this file, and nothing here connects to an
 * external system. `TEST-ONLY-...` in the `sourceId` is the load-bearing part —
 * if these values were ever copied into production, the id would say so in every
 * log and every operator diagnostic in which it appears.
 *
 * Their only purpose is to make the success path testable: readiness requires an
 * independent provenance claim, so the tests have to be able to supply one to
 * reach READY at all. That is what these are.
 */
export const TEST_ONLY_MOVEMENT_REGISTER_LINKAGE: AuthoritativeSourceLinkage = {
  sourceKind: MOVEMENT_REGISTER_SOURCE_KIND,
  sourceId: 'TEST-ONLY-FAKE-REGISTER-NO-REAL-SOURCE',
  authoritative: true,
  sourceStatus: 'CONNECTED',
};

export const TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE: AuthoritativeSourceLinkage = {
  sourceKind: CORRIDOR_TOPOLOGY_SOURCE_KIND,
  sourceId: 'TEST-ONLY-FAKE-TOPOLOGY-NO-REAL-SURVEY',
  authoritative: true,
  sourceStatus: 'CONNECTED',
};

export const TEST_ONLY_POSSESSION_SOURCE_LINKAGE: AuthoritativeSourceLinkage = {
  sourceKind: POSSESSION_GRANT_SYSTEM_SOURCE_KIND,
  sourceId: 'TEST-ONLY-FAKE-POSSESSION-SYSTEM-NO-REAL-GRANTS',
  authoritative: true,
  sourceStatus: 'CONNECTED',
};

/** A granted possession covering one task, for Decision B. */
function grantedPossessionFor(taskId: string, corridorId: string): ExistingOccupancy {
  return {
    occupancyId: `OCC-${taskId}`,
    corridorId,
    section: 'SEC-TEST-FIXTURE',
    startTime: '2026-01-20T22:00:00Z',
    endTime: '2026-01-20T23:30:00Z',
    status: 'APPROVED',
    occupancyType: 'TRAFFIC_BLOCK',
    relatedTaskIds: [taskId],
  };
}

/**
 * Answers all five decisions for `base`, without mutating it.
 *
 * Note what the block requests keep: their `occupancyType` is left exactly as it
 * was. Decision B says a request is not a grant, so setting it would achieve
 * nothing — which is the point, and the tests assert it.
 */
export function withDecisionsApplied(base: Module4ReadinessSnapshot): Module4ReadinessSnapshot {
  const decidedTasks = base.tasks.map((task) =>
    confirmTaskPriority(
      { ...task, corridorId: task.corridorId ?? base.corridors[0]?.corridorId },
      {
        priority: 'HIGH',
        confirmedBy: 'test-fixture-planner',
        confirmedAt: '2026-01-15T09:00:00Z',
      },
    ),
  );

  const occupancies = base.blockRequests.map((request) =>
    grantedPossessionFor(
      request.taskId,
      request.corridorId ?? base.corridors[0]?.corridorId ?? 'COR-TEST-FIXTURE',
    ),
  );

  return {
    ...base,
    tasks: decidedTasks,
    occupancies,
    corridors: base.corridors.map((corridor, index) => ({
      ...corridor,
      name: corridor.name ?? `Test Corridor ${index}`,
      // Two sections, so it is a survey rather than a restatement of sectionId.
      sections: [`${corridor.sectionId}-A`, `${corridor.sectionId}-B`],
    })),
    trains: base.trains.map((train, index) => ({
      ...train,
      corridorId: train.corridorId ?? base.corridors[0]?.corridorId,
      movementId: `MOV-${index}-RUN-1`,
    })),
    assets: base.assets.map((asset) => ({
      ...asset,
      corridorId: asset.corridorId ?? base.corridors[0]?.corridorId,
      // Pre-existing, NON-BLOCKING gap, unrelated to the five decisions: mock
      // assets carry Module 4 asset types of which only 3 of 10 exist in Module
      // 3. Stating a Module 3 type here is what lets the `assets` COLLECTION gate
      // pass, which the builder needs before it will emit anything.
      assetType: 'TRACK',
    })),
    goodsForecasts: base.goodsForecasts.map((forecast) => ({
      ...forecast,
      corridorId: forecast.corridorId ?? base.corridors[0]?.corridorId,
      windowStart: forecast.windowStart ?? '22:00:00',
      windowEnd: forecast.windowEnd ?? '23:30:00',
      volumeTonnes: forecast.volumeTonnes ?? 800,
    })),
    resourceTypeMappings: TEST_ONLY_RESOURCE_TYPE_MAPPINGS,
    // Decisions D and E: the values above are only half the proof. These are the
    // other half — explicit, test-only, and not inferable from the data.
    movementRegisterLinkage: TEST_ONLY_MOVEMENT_REGISTER_LINKAGE,
    corridorTopologyLinkage: TEST_ONLY_CORRIDOR_TOPOLOGY_LINKAGE,
    possessionSourceLinkage: TEST_ONLY_POSSESSION_SOURCE_LINKAGE,
  };
}
