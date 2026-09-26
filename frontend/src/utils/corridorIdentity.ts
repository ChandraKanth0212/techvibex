/**
 * RailOpt Module 4 – Corridor Identity Helpers (Phase 9B-2A)
 *
 * Resolves the provenance of a corridor reference without ever reconstructing
 * one from a section id. Every function here is pure and synchronous so it can
 * be unit tested and reused by future real request builders.
 */

import type { Corridor } from '@/types/corridor';
import type {
  CorridorBearing,
  CorridorIdentity,
  CorridorIdSource,
  CorridorTopology,
} from '@/types/corridorIdentity';

const UNAVAILABLE: CorridorIdSource = 'UNAVAILABLE_FROM_MODULE_4';

/**
 * Trims a caller-supplied id and treats blank values as absent. This is
 * whitespace hygiene only: no id is ever produced, split or inferred here.
 */
function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds the corridor-to-section relation from Module 4 `Corridor` records.
 * Uses each corridor's declared `sectionId` verbatim; performs no matching on
 * the id strings themselves.
 */
export function buildCorridorTopology(
  corridors: readonly Corridor[],
): CorridorTopology {
  const byCorridorId = new Map<string, string>();
  const bySectionId = new Map<string, string[]>();

  for (const corridor of corridors) {
    const corridorId = normalizeId(corridor.corridorId);
    if (!corridorId) continue;

    const sectionId = normalizeId(corridor.sectionId);
    if (!sectionId) continue;

    byCorridorId.set(corridorId, sectionId);

    const claimants = bySectionId.get(sectionId);
    if (claimants) {
      if (!claimants.includes(corridorId)) claimants.push(corridorId);
    } else {
      bySectionId.set(sectionId, [corridorId]);
    }
  }

  return { byCorridorId, bySectionId };
}

/** Returns the single corridor claiming `sectionId`, or null when ambiguous. */
function candidateFor(
  sectionId: string | null,
  topology?: CorridorTopology,
): string | null {
  if (!sectionId || !topology) return null;
  const claimants = topology.bySectionId.get(sectionId);
  if (!claimants || claimants.length !== 1) return null;
  return claimants[0];
}

/**
 * Resolves corridor provenance for a Module 4 entity.
 *
 * Returns `MAPPED_FROM_MODULE_4` only when the entity carries an explicit
 * `corridorId`. A `sectionId` alone always yields
 * `UNAVAILABLE_FROM_MODULE_4` with `corridorId: null`, even when a corridor
 * declares that section, because a section prefix is not a corridor.
 */
export function resolveCorridorIdentity(
  entity: CorridorBearing,
  topology?: CorridorTopology,
): CorridorIdentity {
  const sectionId = normalizeId(entity.sectionId);
  const explicit = normalizeId(entity.corridorId);

  if (explicit) {
    return {
      corridorId: explicit,
      sectionId,
      source: 'MAPPED_FROM_MODULE_4',
      reason: `corridorId "${explicit}" is carried explicitly on the Module 4 entity.`,
      candidateCorridorId: null,
    };
  }

  const candidate = candidateFor(sectionId, topology);

  if (candidate) {
    return {
      corridorId: null,
      sectionId,
      source: UNAVAILABLE,
      reason: `Module 4 entity carries no corridorId. Corridor "${candidate}" declares section "${sectionId}", but section ownership is not an explicit corridor reference.`,
      candidateCorridorId: candidate,
    };
  }

  return {
    corridorId: null,
    sectionId,
    source: UNAVAILABLE,
    reason:
      'Module 4 entity carries no corridorId, and no single corridor claims its section. corridorId is unavailable from Module 4.',
    candidateCorridorId: null,
  };
}

/**
 * Corridor provenance for a Module 3 `SYNTHETIC_DEMO` world. The id comes from
 * the vendored Module 3 demo payload, never from Module 4.
 */
export function syntheticDemoCorridorIdentity(
  corridorId: string | null,
  sectionId: string | null = null,
): CorridorIdentity {
  const id = normalizeId(corridorId);
  return {
    corridorId: id,
    sectionId: normalizeId(sectionId),
    source: 'MODULE_3_SYNTHETIC_DEMO',
    reason: id
      ? `corridor_id "${id}" originates from the Module 3 SYNTHETIC_DEMO payload and is not real railway data.`
      : 'Module 3 SYNTHETIC_DEMO payload carries no corridor_id.',
    candidateCorridorId: null,
  };
}

/**
 * Corridor provenance for an operator's explicit selection of a Module 4
 * `Corridor` record in the planner.
 */
export function explicitCorridorSelection(
  corridorId: string | null,
  corridor?: Corridor,
): CorridorIdentity {
  const id = normalizeId(corridorId);
  if (!id) {
    return {
      corridorId: null,
      sectionId: null,
      source: UNAVAILABLE,
      reason: 'No corridor selected in planner scope.',
      candidateCorridorId: null,
    };
  }

  return {
    corridorId: id,
    sectionId: normalizeId(corridor?.sectionId) ?? null,
    source: 'MAPPED_FROM_MODULE_4',
    reason: corridor
      ? `Corridor "${id}" was selected explicitly from the Module 4 corridor register.`
      : `Corridor "${id}" was selected explicitly, but it is not present in the Module 4 corridor register.`,
    candidateCorridorId: null,
  };
}
