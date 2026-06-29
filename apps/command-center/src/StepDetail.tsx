// The step-detail drawer for the Workflows tab. Mirrors the Overview hub's right-side
// `.cc-detailpanel` pattern: clicking a swimlane step opens this panel with the step's guidance
// (lane · status · detail · note), its handoffs resolved to successor LABELS (clickable, so the
// drawer walks the flow), and — the differentiator — clickable cross-links to the ProjectEntities
// the step references (decisions / features / specs), which navigate the Command Center to them.
// The kit `Swimlane` keeps its own inline inspector for a quick-glance below the board; this is
// the roomier surface (augment, not replace).
import { Badge, Card } from '@trembus/ui';
import type { SwimlaneLane } from '@trembus/ui';
import type { StepWithRefs } from './contract';

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

// The kit's swimlane status vocabulary → the shared Badge tone ontology. Distinct from the entity
// status map in App.tsx (different vocabulary), so it lives here. Unknown → neutral.
const STATUS_TONE: Record<string, StatusTone> = {
  done: 'success',
  active: 'info',
  pending: 'neutral',
  blocked: 'danger',
  skipped: 'neutral',
};

function laneFor(lanes: SwimlaneLane[], ref: string | undefined): SwimlaneLane | undefined {
  return lanes.find((l) => l.id === ref || l.label === ref);
}

export function StepDetail({
  step,
  lanes,
  allSteps,
  onClose,
  onSelectStep,
  onNavigate,
}: {
  step: StepWithRefs;
  lanes: SwimlaneLane[];
  allSteps: StepWithRefs[];
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
      <p className="cc-stepdetail__eyebrow">{lane?.label ?? step.lane}</p>
      <h3 className="cc-stepdetail__title">{step.label}</h3>

      <div className="cc-stepdetail__meta">
        {step.status ? (
          <Badge tone={STATUS_TONE[step.status] ?? 'neutral'} variant="soft" size="sm" dot>
            {step.status}
          </Badge>
        ) : null}
        {lane?.kind ? (
          <Badge tone="neutral" variant="soft" size="sm">
            {lane.kind}
          </Badge>
        ) : null}
      </div>

      {step.detail ? <p className="cc-stepdetail__detail">{step.detail}</p> : null}
      {step.note ? <p className="cc-stepdetail__note">{step.note}</p> : null}

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
                  {r.kind ? (
                    <Badge tone="neutral" variant="soft" size="sm">
                      {r.kind}
                    </Badge>
                  ) : null}
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
