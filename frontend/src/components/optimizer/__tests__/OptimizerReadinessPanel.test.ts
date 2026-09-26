/**
 * Phase 9B-2F: the operator diagnostic UI.
 *
 * Rendering is asserted for real (not mocked) with `react-dom/server`, which
 * works in the Node test environment the project already uses - so no jsdom and
 * no new dependencies are required.
 *
 * The bias of every test here is toward the failure modes that matter for an
 * operator tool: never showing a real-API action while blocked, never
 * fabricating a blocker or an explanation, and never letting synthetic Module 3
 * demo data look like real Module 4 data.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mockAIRecommendations,
  mockAssets,
  mockBlockRequests,
  mockCorridors,
  mockGoodsForecasts,
  mockMaintenanceTasks,
  mockResources,
  mockTrains,
} from '@/mocks';
import { API_CONFIG } from '@/services/api.config';
import { createOptimizerClient } from '@/services/optimizerClient';
import { optimizerService, setOptimizerClient } from '@/services/optimizerService';
import type { OptimizerModule4Result } from '@/services/optimizerService';
import type { Module4ReadinessSnapshot } from '@/services/optimizerRequestReadiness';
import {
  buildDiagnosticsView,
  groupBlockers,
  type OptimizerDiagnosticsView,
} from '@/services/optimizerReadinessDiagnostics';
import { OptimizerReadinessPanel } from '@/components/optimizer/OptimizerReadinessPanel';
import {
  INITIAL_PLANNER_SCOPE,
  selectPlannerCorridor,
  setPlannerTasks,
} from '@/utils/plannerScope';
import { clonePlan } from '@/services/__tests__/optimizerFixtures';

const CORRIDOR = mockCorridors[0];
const CORRIDOR_ID = CORRIDOR.corridorId;
const originalFlag = API_CONFIG.useRealOptimizer;

/** The real, unpopulated Module 4 world. This is what the page actually has. */
function blockedSnapshot(): Module4ReadinessSnapshot {
  return {
    tasks: mockMaintenanceTasks,
    blockRequests: mockBlockRequests,
    assets: mockAssets,
    trains: mockTrains,
    goodsForecasts: mockGoodsForecasts,
    resources: mockResources,
    corridors: mockCorridors,
    integratedBlocks: [],
    occupancies: [],
    recommendations: mockAIRecommendations,
    scope: setPlannerTasks(
      selectPlannerCorridor(INITIAL_PLANNER_SCOPE, CORRIDOR_ID, mockCorridors),
      [mockMaintenanceTasks[0].taskId],
      mockMaintenanceTasks,
    ),
  };
}

function render(view: OptimizerDiagnosticsView | null, optimizerEnabled = true): string {
  return renderToStaticMarkup(
    createElement(OptimizerReadinessPanel, {
      view,
      optimizerEnabled,
      isRunning: false,
      onRun: () => undefined,
      error: null,
    }),
  );
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** React escapes text nodes; match on the escaped form the renderer emits. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function enableOptimizer(): void {
  API_CONFIG.useRealOptimizer = true;
  setOptimizerClient(
    createOptimizerClient({
      baseUrl: 'http://localhost:5002',
      fetchImpl: async () =>
        new Response(JSON.stringify(clonePlan()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      timeoutMs: 0,
    }),
  );
}

beforeEach(() => {
  API_CONFIG.useRealOptimizer = true;
});

afterEach(() => {
  API_CONFIG.useRealOptimizer = originalFlag;
  setOptimizerClient(createOptimizerClient());
  vi.restoreAllMocks();
});

describe('the real Module 4 world is blocked, and says so', () => {
  it('returns BLOCKED from the service without touching the network', async () => {
    const fetchSpy = vi.fn();
    enableOptimizer();
    setOptimizerClient(
      createOptimizerClient({
        baseUrl: 'http://localhost:5002',
        fetchImpl: fetchSpy as never,
        timeoutMs: 0,
      }),
    );

    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());

    expect(result.kind).toBe('BLOCKED');
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders the blocker diagnostics the service actually returned', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    const html = render(buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [mockMaintenanceTasks[0].taskId] }));

    expect(html).toContain('cannot be constructed');
    expect(html).toContain(`${result.blockers.length} blocking requirement`);

    // Every blocker the service reported is surfaced, with its own field path.
    for (const blocker of result.blockers) {
      expect(html).toContain(escapeHtml(blocker.field));
      expect(html).toContain(escapeHtml(blocker.collection));
      expect(html).toContain(escapeHtml(blocker.requirement));
      expect(html).toContain(escapeHtml(blocker.reason));
      expect(html).toContain(escapeHtml(blocker.id));
    }
    // Status, source and coverage are shown, not summarised away.
    expect(countOccurrences(html, 'data-testid="blocker-status"')).toBe(
      result.blockers.length,
    );
    expect(html).toContain('coverage');
    expect(html).toContain('Resolvable by user action');
  });

  it('never paints a blocking status with the "available" colour', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    const html = render(buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] }));

    // A rose/amber/slate badge may never carry the emerald available treatment.
    const badges = html.match(/<span data-testid="blocker-status"[^>]*>/g) ?? [];
    expect(badges.length).toBe(result.blockers.length);
    for (const badge of badges) {
      expect(badge).not.toContain('emerald');
    }
  });

  it('offers no action that can reach the real API while blocked', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    const html = render(buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] }));

    expect(html).toContain('data-testid="run-real-optimizer-disabled"');
    expect(html).not.toContain('data-testid="run-real-optimizer"');
    expect(html).toContain('Run Optimizer unavailable (BLOCKED)');
    // The disabled affordance is not a button, so it cannot be activated.
    expect(html).not.toMatch(/<button[^>]*run-real-optimizer-disabled/);
  });

  it('groups blockers without changing any of their classifications', async () => {    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');

    const groups = groupBlockers(result.blockers);
    const grouped = groups.flatMap((g) => g.blockers);

    // Nothing lost, nothing invented, nothing reclassified.
    expect(grouped).toHaveLength(result.blockers.length);
    expect(new Set(grouped).size).toBe(result.blockers.length);
    for (const blocker of result.blockers) {
      expect(grouped).toContain(blocker);
    }
    for (const group of groups) {
      expect(group.blockers.length).toBeGreaterThan(0);
    }
  });

  it('separates unresolved mappings from missing source data', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    const groups = groupBlockers(result.blockers);

    const unresolved = groups.find((g) => g.id === 'UNRESOLVED_MAPPING');
    expect(unresolved).toBeDefined();
    // An UNRESOLVED mapping is never presented as merely missing data.
    for (const blocker of unresolved?.blockers ?? []) {
      expect(blocker.status).toBe('UNRESOLVED');
    }

    const html = render(buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] }));
    expect(html).toContain('Unresolved semantic mapping');
    expect(html).toContain('UNRESOLVED');
  });
});

describe('the diagnostic never fabricates', () => {
  it('invents no field, collection or blocker of its own', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    if (result.kind !== 'BLOCKED') throw new Error('expected BLOCKED');
    const html = render(buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] }));

    const reported = new Set(
      result.blockers.flatMap((b) => [b.field, b.collection, b.requirement, b.reason]),
    );
    // A readiness id shown in the UI must correspond to a real reported blocker.
    const readinessIds = /data-testid="blocker-id">([^<]+)</g;
    for (const match of html.matchAll(readinessIds)) {
      expect(reported.has(match[1])).toBe(true);
    }
    // The group headings are the only fixed strings added for presentation.
    expect(html).toContain('Missing source data');
  });

  it('keeps an unavailable corridor unavailable', async () => {
    enableOptimizer();
    // No corridor selected at all.
    const snapshot: Module4ReadinessSnapshot = { ...blockedSnapshot(), scope: INITIAL_PLANNER_SCOPE };
    const result = await optimizerService.generatePlanFromModule4(snapshot);
    const view = buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] });
    const html = render(view);

    expect(view.corridor.corridorId).toBeNull();
    expect(view.taskSelection.count).toBe(0);
    expect(html).toContain('UNAVAILABLE_FROM_MODULE_4');
    // No corridor id is conjured out of the section id.
    expect(html).not.toContain(CORRIDOR.sectionId + '</');
  });

  it('reports an empty task selection as empty, never as all tasks', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    const view = buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] });

    expect(view.taskSelection.count).toBe(0);
    expect(view.taskSelection.ids).toEqual([]);
    expect(render(view)).toContain('0 (none selected)');
  });
});

describe('the diagnostic reports the selected scope accurately', () => {
  it('shows the selected corridor, its source and the selected task ids', async () => {
    enableOptimizer();
    const taskIds = [mockMaintenanceTasks[0].taskId, mockMaintenanceTasks[1].taskId];
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    const view = buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: taskIds });
    const html = render(view);

    expect(view.corridor.corridorId).toBe(CORRIDOR_ID);
    expect(view.taskSelection.count).toBe(2);
    expect(html).toContain(CORRIDOR_ID);
    for (const id of taskIds) expect(html).toContain(id);
  });

  it('does not mutate the caller selection', async () => {
    enableOptimizer();
    const ids = [mockMaintenanceTasks[0].taskId];
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: ids });
    expect(ids).toEqual([mockMaintenanceTasks[0].taskId]);
  });
});

describe('provenance is reported, and synthetic stays visibly synthetic', () => {
  it('summarises provenance by label', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    const view = buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] });

    for (const label of new Set(result.provenance.map((e) => e.label))) {
      expect(view.provenance.map((e) => e.label)).toContain(label);
    }
    expect(view.provenance.reduce((n, e) => n + e.count, 0)).toBe(result.provenance.length);
  });

  it('marks synthetic provenance distinctly and never as real Module 4 data', () => {
    // A UI-level fixture standing in for a synthetic result. It deliberately
    // carries MODULE_3_SYNTHETIC_DEMO so the renderer must keep it distinct.
    const syntheticResult = {
      kind: 'BLOCKED',
      readiness: {
        state: 'BLOCKED',
        dataMode: 'SYNTHETIC_DEMO',
        scope: {
          corridorId: 'COR-001',
          sectionId: 'COR-001-S1',
          source: 'MODULE_3_SYNTHETIC_DEMO',
        },
        inputs: [],
        blocking: [],
        warnings: [],
        unresolvedMappings: [],
        summary: {
          total: 1,
          available: 0,
          partial: 0,
          unavailable: 0,
          unresolved: 1,
          excluded: 0,
          blocking: 1,
        },
      },
      blockers: [],
      provenance: [
        {
          field: 'context.tasks',
          label: 'MODULE_3_SYNTHETIC_DEMO',
          count: 100,
          reason: 'Module 3 deterministic demo data.',
        },
      ],
    } as unknown as OptimizerModule4Result;

    const view = buildDiagnosticsView(syntheticResult, {
      optimizerEnabled: true,
      selectedTaskIds: ['T-1'],
    });
    const html = render(view);

    expect(view.synthetic).toBe(true);
    expect(html).toContain('data-testid="synthetic-notice"');
    expect(html).toContain('MODULE_3_SYNTHETIC_DEMO');
    expect(html).toContain('SYNTHETIC');
    // Synthetic is never given the real-data treatment.
    expect(html).not.toContain('MAPPED_FROM_MODULE_4');
  });

  it('never flags a real Module 4 result as synthetic', async () => {
    enableOptimizer();
    const result = await optimizerService.generatePlanFromModule4(blockedSnapshot());
    const view = buildDiagnosticsView(result, { optimizerEnabled: true, selectedTaskIds: [] });

    expect(view.dataMode).toBe('MODULE_4');
    expect(view.synthetic).toBe(false);
    expect(render(view)).not.toContain('data-testid="synthetic-notice"');
  });
});

describe('a constructable request keeps the real action available', () => {
  it('enables the action only when readiness passes and the feature is on', () => {
    const ready = {
      kind: 'PLAN',
      plan: {},
      readiness: {
        state: 'READY',
        dataMode: 'MODULE_4',
        scope: { corridorId: CORRIDOR_ID, sectionId: CORRIDOR.sectionId, source: 'MAPPED_FROM_MODULE_4' },
        inputs: [],
        blocking: [],
        warnings: [],
        unresolvedMappings: [],
        summary: { total: 1, available: 1, partial: 0, unavailable: 0, unresolved: 0, excluded: 0, blocking: 0 },
      },
      provenance: [{ field: 'context.tasks', label: 'MAPPED_FROM_MODULE_4', count: 1, reason: 'r' }],
      emitted: ['tasks', 'corridors'],
      omitted: [{ collection: 'resources', blockedBy: ['resources.resource_type'] }],
    } as unknown as OptimizerModule4Result;

    const enabled = buildDiagnosticsView(ready, { optimizerEnabled: true, selectedTaskIds: ['T-1'] });
    expect(enabled.canRunRealOptimizer).toBe(true);
    expect(render(enabled)).toContain('data-testid="run-real-optimizer"');

    // Disabling the feature must remove the real action outright.
    const disabled = buildDiagnosticsView(ready, { optimizerEnabled: false, selectedTaskIds: ['T-1'] });
    expect(disabled.canRunRealOptimizer).toBe(false);
    const html = render(disabled, false);
    expect(html).not.toContain('data-testid="run-real-optimizer"');
    expect(html).toContain('Run Optimizer unavailable');
  });

  it('reports emitted and omitted collection counts', () => {
    const plan = {
      kind: 'PLAN',
      plan: {},
      readiness: {
        state: 'READY',
        dataMode: 'MODULE_4',
        scope: { corridorId: CORRIDOR_ID, sectionId: null, source: 'MAPPED_FROM_MODULE_4' },
        inputs: [],
        blocking: [],
        warnings: [],
        unresolvedMappings: [],
        summary: { total: 1, available: 1, partial: 0, unavailable: 0, unresolved: 0, excluded: 0, blocking: 0 },
      },
      provenance: [],
      emitted: ['tasks', 'corridors', 'trains'],
      omitted: [{ collection: 'resources', blockedBy: ['resources.resource_type'] }],
    } as unknown as OptimizerModule4Result;

    const html = render(buildDiagnosticsView(plan, { optimizerEnabled: true, selectedTaskIds: [] }));
    expect(html).toContain('3 / 1');
  });

  it('never shows a blocker list for a plan result', () => {
    const plan = {
      kind: 'PLAN',
      plan: {},
      readiness: {
        state: 'READY',
        dataMode: 'MODULE_4',
        scope: { corridorId: CORRIDOR_ID, sectionId: null, source: 'MAPPED_FROM_MODULE_4' },
        inputs: [],
        blocking: [],
        warnings: [],
        unresolvedMappings: [],
        summary: { total: 1, available: 1, partial: 0, unavailable: 0, unresolved: 0, excluded: 0, blocking: 0 },
      },
      provenance: [],
      emitted: ['tasks'],
      omitted: [],
    } as unknown as OptimizerModule4Result;

    const view = buildDiagnosticsView(plan, { optimizerEnabled: true, selectedTaskIds: [] });
    expect(view.blockerCount).toBe(0);
    expect(view.groups).toEqual([]);
    expect(render(view)).not.toContain('data-testid="blocker-diagnostics"');
  });
});

describe('PlannerPage integration', () => {
  const pagePath = resolve(process.cwd(), 'src/pages/PlannerPage.tsx');
  const page = readFileSync(pagePath, 'utf8');

  it('renders the readiness panel and calls only the real Module 4 entry point', () => {
    expect(page).toContain('<OptimizerReadinessPanel');
    expect(page).toContain('generatePlanFromModule4');
  });

  it('never falls back to synthetic or mock data from the diagnostic', () => {
    expect(page).not.toContain('generateSyntheticDemoPlan');
    expect(page).not.toContain('generatePlan(');
    // A blocked result must be stored and displayed, never retried as synthetic.
    expect(page).toContain('setOptimizerResult(result)');
  });

  it('supplies the collections the readiness gate reads, and no invented ones', () => {
    for (const key of [
      'tasks:',
      'blockRequests:',
      'assets:',
      'trains:',
      'goodsForecasts:',
      'resources:',
      'corridors:',
      'integratedBlocks:',
      'occupancies:',
      'recommendations:',
      'scope,',
    ]) {
      expect(page).toContain(key);
    }
  });

  it('leaves the existing planner lanes and detail modal intact', () => {
    expect(page).toContain('DEPARTMENT LANES');
    expect(page).toContain('Train Timetable Constraints Lane');
    expect(page).toContain('DETAIL MODAL');
    expect(page).toContain('Corridor Block Planner');
  });
});
