/**
 * RailOpt Module 4 – Resource Service
 *
 * Owns one thing: the human-approved correspondence between Module 4's resource
 * vocabulary and Module 3's.
 *
 * The two vocabularies share ZERO values (Module 4 says `TRACK_MACHINE`,
 * `OHE_CREW`, `SIGNAL_CREW`; Module 3 says `MANPOWER`, `MACHINERY`, `ON_TRACK_MAINTENANCE`),
 * so every pairing is a business decision that somebody has to make and be on
 * record for. `resourceTypeMapping.ts` is the approved authority for that decision
 * and this module adds no rules of its own — it supplies the approver's four
 * explicit inputs and returns the table the authority accepted.
 */

import { mockStore } from './mockStore';
import {
  MODULE_3_RESOURCE_TYPES,
  MODULE_4_RESOURCE_TYPES,
  isModule3ResourceType,
  isModule4ResourceType,
} from './resourceTypeMapping';
import type { ResourceTypeMappingApprovalFailure } from './mockStore';
import type { PriorityConfirmationActor } from '@/types/maintenance';
import type { OptimizerResourceType } from '@/types/optimizer';
import type { ResourceType, ResourceTypeMapping } from '@/types/resource';

/**
 * The failure of a refused approval, carried out so a caller can branch on WHY.
 *
 * `EXTERNAL_REASON` is for a caller that passed a value outside either module's
 * own vocabulary: that is not a decision the authority refused, it is a pair the
 * application does not recognise at all, and reporting it as `REFUSED` would
 * misattribute the outcome to the authority module.
 */
export type ResourceTypeMappingServiceFailure =
  | ResourceTypeMappingApprovalFailure
  | 'EXTERNAL_REASON';

export type ResourceTypeMappingServiceResult =
  | {
      readonly ok: true;
      readonly mappings: readonly ResourceTypeMapping[];
      readonly mapping: ResourceTypeMapping;
      readonly auditId: string;
    }
  | {
      readonly ok: false;
      readonly reason: ResourceTypeMappingServiceFailure;
      readonly message: string;
    };

export interface ApproveResourceTypeMappingArgs {
  readonly module4ResourceType: string;
  readonly module3ResourceType: string;
  readonly mappingVersion: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly reference: string;
  readonly actor: PriorityConfirmationActor;
}

export const resourceService = {
  /** Both vocabularies, so an operator can only ever choose from real values. */
  getSourceTypes(): readonly string[] {
    return MODULE_4_RESOURCE_TYPES;
  },

  getTargetTypes(): readonly string[] {
    return MODULE_3_RESOURCE_TYPES;
  },

  /**
   * The correspondence approved so far. Empty until a human approves something,
   * which is why `resources.resource_type` reads as unresolved out of the box.
   */
  async getResourceTypeMappings(): Promise<ResourceTypeMapping[]> {
    return mockStore.getResourceTypeMappings();
  },

  /**
   * Records one human approval of a Module 4 -> Module 3 correspondence.
   *
   * Takes all four decision inputs from the caller with NO defaults: the source
   * type, the target type, the named approver, the instant, the decision reference
   * and the mapping version. There is deliberately no fallback approver, no
   * default timestamp and no default version — every one of those defaults would
   * let the gate be satisfied by a decision nobody actually made.
   *
   * The two values are string-typed here (they arrive from form inputs) and are
   * checked against each module's own vocabulary before the store sees them, so a
   * typo such as `MACHINERY -> MACHINERY` is refused as unrecognised rather than
   * reaching the authority as if it were a decision.
   */
  async approveResourceTypeMapping(
    args: ApproveResourceTypeMappingArgs,
  ): Promise<ResourceTypeMappingServiceResult> {
    if (!isModule4ResourceType(args.module4ResourceType)) {
      return {
        ok: false,
        reason: 'EXTERNAL_REASON',
        message: `${JSON.stringify(args.module4ResourceType)} is not a Module 4 ResourceType (${MODULE_4_RESOURCE_TYPES.join(' | ')}). Nothing was recorded, and no value was matched to it by resemblance.`,
      };
    }

    if (!isModule3ResourceType(args.module3ResourceType)) {
      return {
        ok: false,
        reason: 'EXTERNAL_REASON',
        message: `${JSON.stringify(args.module3ResourceType)} is not a Module 3 OptimizerResourceType (${MODULE_3_RESOURCE_TYPES.join(' | ')}). Nothing was recorded.`,
      };
    }

    const result = mockStore.approveResourceTypeMapping({
      module4ResourceType: args.module4ResourceType as ResourceType,
      module3ResourceType: args.module3ResourceType as OptimizerResourceType,
      mappingVersion: args.mappingVersion,
      approvedBy: args.approvedBy,
      approvedAt: args.approvedAt,
      reference: args.reference,
      actor: args.actor,
    });

    return result;
  },
};