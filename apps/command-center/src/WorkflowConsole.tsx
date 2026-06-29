// A workflow console: the Swimlane (workflow definition) on top, optional RunHistory below.
// Adapted from @trembus/ui's Examples/SwimlaneRuns, with the layout flipped (flow first,
// history second) per the project-system design call.
//
// Phase 1: no run source exists yet, so `runs` defaults to [] — the history switch renders
// disabled (greyed) and only the flow shows, exactly like the reference's NoHistory state.
// Phase 3 will pass real runs (e.g. from session entities or CI) and add run→swimlane
// time-travel (applyRun) so selecting a run replays its state across the lanes.
import { useState } from 'react';
import { RunHistory, Swimlane } from '@trembus/ui';
import type { RunRecord } from '@trembus/ui';
import { StepDetail } from './StepDetail';
import type { StepWithRefs, WorkflowContract } from './contract';

// A true on/off pill that greys out + disables when there is nothing to toggle.
// role=switch + aria-checked keeps it accessible. (Ported from the SwimlaneRuns example.)
function SwitchPill({
  checked,
  onChange,
  label,
  count,
  disabled = false,
  disabledHint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  count?: number;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const on = checked && !disabled; // a disabled switch always reads + paints as off
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      onClick={() => onChange(!checked)}
      style={{
        appearance: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--tcl-space-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        font: 'inherit',
        fontSize: 'var(--tcl-text-sm)',
        fontWeight: 600,
        color: disabled ? 'var(--tcl-text-faint)' : on ? 'var(--tcl-text)' : 'var(--tcl-text-dim)',
        padding: '6px 14px 6px 8px',
        borderRadius: 'var(--tcl-radius-full)',
        border: '1px solid var(--tcl-border)',
        background: disabled ? 'var(--tcl-surface-sunken)' : 'var(--tcl-surface-raised)',
        opacity: disabled ? 0.6 : 1,
        boxShadow: on ? 'var(--tcl-elevation-1)' : 'none',
        transition: 'color var(--tcl-dur-fast) var(--tcl-ease-calm)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          flex: 'none',
          width: 32,
          height: 18,
          borderRadius: 'var(--tcl-radius-full)',
          background: on ? 'var(--tcl-accent)' : 'var(--tcl-border-strong)',
          transition: 'background var(--tcl-dur-fast) var(--tcl-ease-calm)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 14,
            height: 14,
            borderRadius: 'var(--tcl-radius-full)',
            background: 'var(--tcl-surface-raised)',
            boxShadow: 'var(--tcl-elevation-1)',
            transform: on ? 'translateX(14px)' : 'none',
            transition: 'transform var(--tcl-dur-fast) var(--tcl-ease-calm)',
          }}
        />
      </span>
      <span>
        {label}
        {typeof count === 'number' && (
          <span style={{ fontWeight: 500, color: 'var(--tcl-text-dim)' }}> · {count}</span>
        )}
      </span>
    </button>
  );
}

// Replay one run over the workflow definition ("time-travel"). The library keeps applyRun
// page-local (it is not barrel-exported), so we carry our own copy of the same logic: index
// outcomes by step id, set each step's status from its outcome (steps the run never mentions
// fall to `pending`), and fold per-step output labels into the inspector note.
function applyRun(base: WorkflowContract, run: RunRecord): WorkflowContract {
  if (!run.stepOutcomes?.length) return base;
  const byStep = new Map(run.stepOutcomes.map((o) => [o.step, o]));
  return {
    ...base,
    steps: base.steps.map((step): StepWithRefs => {
      const outcome = step.id != null ? byStep.get(step.id) : undefined;
      if (!outcome) return { ...step, status: 'pending' };
      const outs = outcome.outputs?.length
        ? `Output: ${outcome.outputs.map((o) => o.label).join(', ')}`
        : undefined;
      const note = [step.note, outs].filter(Boolean).join(' · ') || undefined;
      return { ...step, status: outcome.status, note };
    }),
  };
}

export function WorkflowConsole({
  workflow,
  runs = [],
  runsTotal = 0,
  onNavigate,
}: {
  workflow: WorkflowContract;
  runs?: RunRecord[];
  runsTotal?: number;
  onNavigate?: (target: string) => void;
}) {
  const hasRuns = runs.length > 0;
  const [showRuns, setShowRuns] = useState(true);
  // Runs arrive newest-first; seed selection on the most recent failed run (so a failure is
  // visible at a glance), else the newest. Re-seeds per workflow because App keys this console.
  const [selectedRunId, setSelectedRunId] = useState(
    () => runs.find((r) => r.status === 'failed')?.id ?? runs[0]?.id ?? '',
  );
  // App-managed step selection drives our richer right-side drawer; the kit Swimlane keeps its own
  // inline inspector (uncontrolled — we don't pass selectedId). Switching workflows remounts this
  // console (App keys it by workflow id), so stepSel resets for free.
  const [stepSel, setStepSel] = useState<string | undefined>(undefined);

  const runsVisible = showRuns && hasRuns;
  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0];
  const swimlaneData = runsVisible && selectedRun ? applyRun(workflow, selectedRun) : workflow;
  const windowed = runsTotal > runs.length;
  // Resolve the selection against the CURRENT data so a stale id (e.g. after a run swap) closes the
  // drawer rather than leaking. Step ids are stable across runs (applyRun maps by id), so a valid
  // selection survives a run change.
  const selectedStep = swimlaneData.steps.find((s) => s.id === stepSel);

  return (
    <div className="cc-workflow">
      <div className="cc-workflow__bar">
        <p className="cc-eyebrow">Workflow console</p>
        <SwitchPill
          checked={showRuns}
          onChange={setShowRuns}
          label="Run history"
          count={hasRuns ? runsTotal : undefined}
          disabled={!hasRuns}
          disabledHint="No run history captured for this workflow yet"
        />
      </div>

      <div className="cc-workflow__layout">
        <div className="cc-workflow__board">
          {/* key by run so the diagram's own step-selection resets when the run changes */}
          <Swimlane key={runsVisible ? selectedRunId : 'base'} data={swimlaneData} onSelect={setStepSel} />

          {runsVisible && (
            <RunHistory
              data={{
                view: 'run-history',
                title: 'Run history',
                caption: windowed ? `Latest ${runs.length} of ${runsTotal} runs.` : undefined,
                runs,
              }}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
            />
          )}
        </div>

        {/* Richer step guidance — opens on step-select, mirrors the Overview hub's detail drawer. */}
        <aside className="cc-detailpanel" data-open={Boolean(selectedStep)} aria-label="Step details">
          <div className="cc-detailpanel__inner">
            {selectedStep ? (
              <StepDetail
                step={selectedStep}
                lanes={swimlaneData.lanes}
                allSteps={swimlaneData.steps}
                onClose={() => setStepSel(undefined)}
                onSelectStep={setStepSel}
                onNavigate={onNavigate}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
