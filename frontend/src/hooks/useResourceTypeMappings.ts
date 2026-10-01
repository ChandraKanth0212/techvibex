import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  resourceService,
  type ApproveResourceTypeMappingArgs,
} from '@/services/resourceService';
import type { ResourceTypeMapping } from '@/types/resource';
import { AUDIT_KEYS } from './useAudit';

export const RESOURCE_TYPE_MAPPING_KEYS = {
  all: ['resource-type-mappings'] as const,
  list: () => [...RESOURCE_TYPE_MAPPING_KEYS.all, 'list'] as const,
};

/**
 * The approved Module 4 -> Module 3 correspondence.
 *
 * Empty until a human approves one, which is the honest starting state: the two
 * vocabularies share no values, so nothing resolves until somebody decides and
 * takes responsibility for the decision.
 */
export function useResourceTypeMappings() {
  return useQuery<ResourceTypeMapping[]>({
    queryKey: RESOURCE_TYPE_MAPPING_KEYS.list(),
    queryFn: () => resourceService.getResourceTypeMappings(),
  });
}

/** The two vocabularies a correspondence may be drawn from. */
export function useResourceTypeVocabularies() {
  return {
    sourceTypes: resourceService.getSourceTypes(),
    targetTypes: resourceService.getTargetTypes(),
  } as const;
}

/**
 * Records one human approval of a resource-type correspondence.
 *
 * A refusal is a resolved mutation carrying `ok: false`, not an error: nothing was
 * written and the approved table provably did not change, so nothing is invalidated.
 * A successful approval invalidates the audit log, because it writes the event that
 * makes the decision attributable.
 *
 * The four decision inputs arrive through {@link ApproveResourceTypeMappingArgs} and
 * are never defaulted here — the point of this mutation is to put a named person and
 * their cited decision record on record, and a default for either would defeat it.
 */
export function useApproveResourceTypeMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: ApproveResourceTypeMappingArgs) =>
      resourceService.approveResourceTypeMapping(args),
    onSuccess: (result) => {
      if (!result.ok) return;
      queryClient.invalidateQueries({ queryKey: RESOURCE_TYPE_MAPPING_KEYS.all });
      queryClient.invalidateQueries({ queryKey: AUDIT_KEYS.all });
    },
  });
}