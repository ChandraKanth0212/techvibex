import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  FlaskConical,
  Lock,
  MapPin,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import type { OptimizerBlocker } from '@/services/optimizerService';
import type { BlockerGroup, OptimizerDiagnosticsView } from '@/services/optimizerReadinessDiagnostics';

/**
 * Colour treatment for a readiness STATUS. An unavailable or unresolved status
 * is never given the "available" colour: a blocker must never read as healthy.
 */
function statusClass(status: string): string {
  switch (status) {
    case 'UNAVAILABLE':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    case 'PARTIAL':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'UNRESOLVED':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'EXCLUDED':
      return 'bg-slate-500/10 text-slate-400 border-slate-600/40';
    case 'AVAILABLE':
    default:
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  }
}

/**
 * Colour treatment for a provenance LABEL. Synthetic is deliberately never green
 * and never shares the "real data" treatment, so a synthetic result can never be
 * mistaken for real Module 4 data at a glance.
 */
function provenanceClass(label: string): string {
  switch (label) {
    case 'MODULE_3_SYNTHETIC_DEMO':
      return 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30';
    case 'UNRESOLVED':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'UNAVAILABLE_FROM_MODULE_4':
      return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
    case 'MODULE_3_DEFAULT':
      return 'bg-slate-500/10 text-slate-300 border-slate-600/40';
    default:
      return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  }
}

/** One blocker, showing only what the service actually reported. */
export const BlockerRow: React.FC<{ blocker: OptimizerBlocker }> = ({
  blocker,
}) => (
  <li className="rounded border border-slate-800 bg-slate-950/50 p-2.5 space-y-1.5">
    <div className="flex items-start justify-between gap-2">
      <code className="text-[11px] font-mono text-rose-300 break-all">
        {blocker.field}
      </code>
      <span
        data-testid="blocker-status"
        className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-mono font-bold ${statusClass(blocker.status)}`}
      >
        {blocker.status}
      </span>
    </div>

    <code data-testid="blocker-id" className="block text-[9px] font-mono text-slate-500">
      {blocker.id}
    </code>

    <dl className="grid grid-cols-[86px_1fr] gap-x-2 gap-y-0.5 text-[10px] font-mono">
      <dt className="text-slate-500">collection</dt>
      <dd className="text-slate-300 break-all">{blocker.collection}</dd>

      <dt className="text-slate-500">requirement</dt>
      <dd className="text-slate-300">{blocker.requirement}</dd>

      <dt className="text-slate-500">reason</dt>
      <dd className="text-slate-200 leading-relaxed">{blocker.reason}</dd>

      <dt className="text-slate-500">source</dt>
      <dd className="text-slate-400">{blocker.source}</dd>

      {blocker.coverage && (
        <>
          <dt className="text-slate-500">coverage</dt>
          <dd className="text-slate-300">
            {blocker.coverage.present}/{blocker.coverage.total} present
          </dd>
        </>
      )}

      <dt className="text-slate-500">user action</dt>
      <dd className={blocker.resolvableByUserAction ? 'text-sky-300' : 'text-slate-500'}>
        {blocker.resolvableByUserAction
          ? 'Resolvable by user action'
          : 'Not resolvable by user action'}
      </dd>
    </dl>
  </li>
);

const GROUP_ICON: Record<BlockerGroup['id'], React.ElementType> = {
  MISSING_SELECTION: MapPin,
  MISSING_SOURCE_DATA: Wrench,
  UNRESOLVED_MAPPING: ShieldAlert,
  OTHER_CONTRACT: CircleDot,
};

export const BlockerGroupCard: React.FC<{ group: BlockerGroup }> = ({ group }) => {
  const Icon = GROUP_ICON[group.id];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="p-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-amber-400" />
          <h4 className="text-[11px] font-bold text-slate-200 font-mono">
            {group.title}
          </h4>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {group.blockers.length} | {group.userResolvable ? 'user actionable' : 'needs upstream data/mapping'}
        </span>
      </div>
      <ul className="p-2 space-y-2">
        {group.blockers.map((blocker) => (
          <BlockerRow key={blocker.id} blocker={blocker} />
        ))}
      </ul>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label,
  value,
  tone = 'text-slate-200',
}) => (
  <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
    <p className="text-[9px] text-slate-500 uppercase tracking-wide font-mono">{label}</p>
    <p className={`text-[11px] font-mono font-bold mt-0.5 break-all ${tone}`}>{value}</p>
  </div>
);

/**
 * Operator diagnostic for the readiness-gated Module 4 optimizer path.
 *
 * Purely presentational: every value comes from `OptimizerDiagnosticsView`,
 * which is built by the tested pure module. This component never computes
 * readiness, never blocks/unblocks, and never calls the network.
 */
export const OptimizerReadinessPanel: React.FC<{
  /** `null` until the operator has requested a readiness check. */
  view: OptimizerDiagnosticsView | null;
  optimizerEnabled: boolean;
  isRunning: boolean;
  onRun: () => void;
  error: string | null;
}> = ({ view, optimizerEnabled, isRunning, onRun, error }) => {
  const blocked = view ? view.kind === 'BLOCKED' || view.blockerCount > 0 : false;
  // Before the first check the operator may run it; afterwards the typed result
  // alone decides, and a BLOCKED result removes the real-API action entirely.
  const canRun = view ? view.canRunRealOptimizer : optimizerEnabled;
  const stateLabel = view ? view.state : 'NOT EVALUATED';

  return (
    <section
      data-testid="optimizer-readiness-panel"
      className="rounded-lg bg-slate-900/60 border border-slate-800 overflow-hidden"
    >
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {blocked ? (
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          ) : view ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <CircleDot className="w-4 h-4 text-slate-400" />
          )}
          <div>
            <h3 className="text-xs font-bold text-slate-200 font-mono">
              Module 4 Optimizer Readiness
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Real request construction gate for the Module 3 optimizer
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid="readiness-state"
            className={`text-[10px] px-2 py-1 rounded border font-mono font-bold ${
              blocked
                ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                : view
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-500/10 text-slate-400 border-slate-600/40'
            }`}
          >
            {stateLabel}
          </span>

          {canRun ? (
            <button
              data-testid="run-real-optimizer"
              onClick={onRun}
              disabled={isRunning}
              className="px-3 py-1 rounded bg-emerald-600 text-white text-[11px] font-mono font-bold hover:bg-emerald-500 disabled:opacity-50"
            >
              {isRunning ? 'Running...' : 'Run Module 4 Optimizer'}
            </button>
          ) : (
            /* Blocked or disabled: no action exists that can reach the real API. */
            <span
              data-testid="run-real-optimizer-disabled"
              className="px-3 py-1 rounded bg-slate-800 text-slate-500 text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-not-allowed"
            >
              <Lock className="w-3 h-3" />
              {blocked ? 'Run Optimizer unavailable (BLOCKED)' : 'Run Optimizer unavailable'}
            </span>
          )}
        </div>
      </div>

      {!view ? (
        <div className="p-3">
          <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
            Readiness has not been evaluated for the current scope. Running the
            check builds the real Module 4 request through the readiness gate;
            nothing is sent to the optimizer unless that gate passes.
          </p>
          {error && (
            <p
              data-testid="optimizer-error"
              className="mt-2 p-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-[11px] font-mono text-rose-200"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="p-3 space-y-3">
        {view.synthetic && (
          <div
            data-testid="synthetic-notice"
            className="p-2.5 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 flex items-start gap-2"
          >
            <FlaskConical className="w-4 h-4 text-fuchsia-300 shrink-0 mt-0.5" />
            <p className="text-[11px] font-mono text-fuchsia-200 leading-relaxed">
              SYNTHETIC: this result is derived from MODULE_3_SYNTHETIC_DEMO data
              (dataMode {view.dataMode}). It is Module 3's demonstration world and
              must not be read as real Module 4 data.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat
            label="selected corridor"
            value={
              view.corridor.corridorId ?? (
                <span className="text-amber-400">
                  {view.corridor.unavailable ? 'UNAVAILABLE_FROM_MODULE_4' : 'none selected'}
                </span>
              )
            }
            tone={view.corridor.corridorId ? 'text-emerald-400' : 'text-amber-400'}
          />
          <Stat
            label="corridor source"
            value={view.corridor.source}
            tone={
              view.corridor.source === 'UNAVAILABLE_FROM_MODULE_4'
                ? 'text-rose-300'
                : 'text-slate-300'
            }
          />
          <Stat
            label="selected tasks"
            value={
              view.taskSelection.count === 0
                ? '0 (none selected)'
                : `${view.taskSelection.count}: ${view.taskSelection.ids.join(', ')}`
            }
            tone={view.taskSelection.count === 0 ? 'text-amber-400' : 'text-emerald-400'}
          />
          <Stat
            label="emitted / omitted"
            value={`${view.emitted.length} / ${view.omitted.length}`}
          />
        </div>

        <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
          <p className="text-[9px] text-slate-500 uppercase tracking-wide font-mono mb-1.5">
            provenance summary
          </p>
          {view.provenance.length === 0 ? (
            <p className="text-[10px] font-mono text-slate-500">
              No provenance entries were reported.
            </p>
          ) : (
            <ul className="space-y-1">
              {view.provenance.map((entry) => (
                <li
                  key={entry.label}
                  data-testid="provenance-entry"
                  className="flex items-center justify-between gap-2 text-[10px] font-mono"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      data-testid="provenance-label"
                      className={`px-1.5 py-0.5 rounded border ${provenanceClass(entry.label)}`}
                    >
                      {entry.label}
                    </span>
                    {entry.synthetic && (
                      <span className="text-fuchsia-300 font-bold">SYNTHETIC</span>
                    )}
                  </span>
                  <span className="text-slate-400 truncate" title={entry.fields.join(', ')}>
                    {entry.count} field{entry.count === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {blocked && (
          <div data-testid="blocker-diagnostics" className="space-y-2">
            <p className="text-[11px] font-mono text-rose-300 leading-relaxed">
              The real Module 4 optimizer request cannot be constructed.
              {view.blockerCount} blocking requirement
              {view.blockerCount === 1 ? '' : 's'} reported by the readiness engine.
            </p>
            {view.groups.map((group) => (
              <BlockerGroupCard key={group.id} group={group} />
            ))}
          </div>
        )}

        {view.warnings.length > 0 && (
          <div data-testid="readiness-warnings" className="p-2.5 rounded border border-amber-500/30 bg-amber-500/5">
            <p className="text-[9px] text-amber-400/80 uppercase tracking-wide font-mono mb-1">
              engine warnings
            </p>
            <ul className="space-y-0.5">
              {view.warnings.map((w) => (
                <li key={w} className="text-[10px] font-mono text-amber-200/80">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p
            data-testid="optimizer-error"
            className="p-2.5 rounded border border-rose-500/40 bg-rose-500/10 text-[11px] font-mono text-rose-200"
          >
            {error}
          </p>
        )}
        </div>
      )}
    </section>
  );
};

export default OptimizerReadinessPanel;
