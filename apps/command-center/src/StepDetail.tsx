// The step-detail drawer for the Processes tab. Clicking a swimlane step opens this panel with a
// <Brief> of the step's guidance — its detail/note as the summary, status + actor as meta pills,
// and, WHEN AUTHORED, three richer sections: a sub-step checklist, its input requirements, and its
// outputs (with the common folder root derived across authored + run-produced artifacts). Below the
// Brief, an interactive footer keeps what a Brief can't express: clickable cross-links to the
// ProjectEntities the step references (navigate the Command Center) and its hand-offs (walk the flow).
import { Brief, Card } from '@trembus/ui';
import type { BriefContract, RunOutput, SwimlaneLane } from '@trembus/ui';
import type { StepOutput, StepWithRefs } from './contract';

function laneFor(lanes: SwimlaneLane[], ref: string | undefined): SwimlaneLane | undefined {
  return lanes.find((l) => l.id === ref || l.label === ref);
}

// A label reads as a file path when it carries a folder separator (`a/b`) — bare artifact chips
// ("PR #482") are left out of the folder computation.
const isPathLike = (label: string): boolean => label.includes('/');
const dirOf = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};

// Longest common directory prefix across a step's output paths. This is the "most common root":
// when a step writes to run-specific folders across runs (e.g. `renders/run-1/…`, `renders/run-2/…`)
// the shared root (`renders`) is what the drawer shows, not any single run's path.
function commonRoot(paths: string[]): string {
  const dirs = paths.filter(isPathLike).map(dirOf).filter(Boolean);
  if (!dirs.length) return '';
  const split = dirs.map((d) => d.split('/'));
  let prefix = split[0];
  for (const segs of split.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < segs.length && segs[i] === prefix[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix.length) break;
  }
  return prefix.join('/');
}

const relativeTo = (root: string, path: string): string =>
  root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;

// Build the step's Brief contract. Sections appear only when their data is authored/produced, so a
// bare step still renders a clean summary card.
function stepBrief(
  step: StepWithRefs,
  lane: SwimlaneLane | undefined,
  runOutputs: RunOutput[],
): BriefContract {
  const meta: NonNullable<BriefContract['meta']> = [];
  if (step.status) meta.push({ label: 'status', value: step.status });
  if (lane) meta.push({ label: lane.kind ?? 'lane', value: lane.label });

  const sections: NonNullable<BriefContract['sections']> = [];

  // detail is the lead; a distinct note becomes a prose section so both survive.
  if (step.note && step.detail) {
    sections.push({ id: 'note', heading: 'Notes', kind: 'prose', body: step.note });
  }

  if (step.substeps?.length) {
    sections.push({
      id: 'substeps',
      heading: 'Sub-steps',
      kind: 'checklist',
      items: step.substeps.map((s) =>
        typeof s === 'string' ? { text: s } : { text: s.text, desc: s.detail, status: s.status },
      ),
    });
  }

  if (step.inputs?.length) {
    sections.push({
      id: 'inputs',
      heading: 'Inputs',
      kind: 'reference',
      items: step.inputs.map((s) => (typeof s === 'string' ? { text: s } : { text: s.text, desc: s.detail })),
    });
  }

  // Outputs: authored + run-produced, deduped by label. File-path labels drive the folder root,
  // shown once as the section note; each item is then displayed relative to that root.
  const authored: StepOutput[] = (step.outputs ?? []).map((o) => (typeof o === 'string' ? { label: o } : o));
  const seen = new Set<string>();
  const outs = [...authored, ...runOutputs].filter((o) => o.label && !seen.has(o.label) && seen.add(o.label));
  if (outs.length) {
    const root = commonRoot(outs.map((o) => o.label));
    sections.push({
      id: 'outputs',
      heading: 'Outputs',
      kind: 'artifacts',
      note: root ? `Folder · ${root}/` : undefined,
      items: outs.map((o) => ({
        text: root ? relativeTo(root, o.label) : o.label,
        status: o.kind,
        ref: o.href,
      })),
    });
  }

  return {
    view: 'brief',
    kind: 'plan',
    id: lane?.label,
    title: step.label,
    summary: step.detail || step.note || undefined,
    meta,
    sections,
  };
}

export function StepDetail({
  step,
  lanes,
  allSteps,
  runOutputs = [],
  onClose,
  onSelectStep,
  onNavigate,
}: {
  step: StepWithRefs;
  lanes: SwimlaneLane[];
  allSteps: StepWithRefs[];
  /** This step's run-produced artifacts, gathered across the workflow's runs by the console. */
  runOutputs?: RunOutput[];
  onClose: () => void;
  onSelectStep: (id: string) => void;
  onNavigate?: (target: string) => void;
}) {
  const lane = laneFor(lanes, step.lane);
  const successors = (step.to ?? [])
    .map((id) => allSteps.find((s) => s.id === id))
    .filter((s): s is StepWithRefs => Boolean(s));
  const isTerminal = Array.isArray(step.to) && step.to.length === 0;
  const refs = step.refs ?? [];

  return (
    <Card className="cc-detailpanel__card cc-stepdetail">
      <button type="button" className="cc-detailpanel__close" onClick={onClose} aria-label="Close step details">
        ✕
      </button>

      <Brief data={stepBrief(step, lane, runOutputs)} className="cc-stepdetail__brief" />

      {refs.length > 0 ? (
        <div className="cc-stepdetail__section">
          <p className="cc-stepdetail__section-head">References</p>
          <ul className="cc-stepdetail__refs">
            {refs.map((r, i) => (
              <li key={`${r.rel}-${r.target}-${i}`}>
                <button
                  type="button"
                  className="cc-stepdetail__ref"
                  disabled={!r.kind || !onNavigate}
                  onClick={() => r.kind && onNavigate?.(r.target)}
                  title={r.kind ? `Go to ${r.kind} “${r.title}”` : 'Unresolved reference'}
                >
                  <span className="cc-stepdetail__ref-rel">{r.rel}</span>
                  <span className="cc-stepdetail__ref-title">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {successors.length > 0 ? (
        <div className="cc-stepdetail__section">
          <p className="cc-stepdetail__section-head">Hands off to</p>
          <ul className="cc-stepdetail__handoffs">
            {successors.map((s) => {
              const sLane = laneFor(lanes, s.lane);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="cc-stepdetail__handoff"
                    onClick={() => s.id && onSelectStep(s.id)}
                  >
                    <span className="cc-stepdetail__handoff-lane">{sLane?.label ?? s.lane}</span>
                    <span className="cc-stepdetail__handoff-label">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : isTerminal ? (
        <p className="cc-stepdetail__terminal">Terminal step — the flow ends here.</p>
      ) : null}
    </Card>
  );
}
