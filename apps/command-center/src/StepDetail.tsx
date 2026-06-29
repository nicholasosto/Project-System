// The step-detail drawer for the Workflows tab. Mirrors the Overview hub's right-side
// `.cc-detailpanel` pattern: clicking a swimlane step opens this panel with the step's guidance
// (lane · status · detail · note) and its handoffs resolved to successor LABELS — each clickable,
// so the drawer walks the flow. The kit `Swimlane` keeps its own inline inspector for a
// quick-glance below the board; this is the roomier surface. (Commit 4 adds clickable cross-links
// to the ProjectEntities a step references.)
import { Badge, Card } from '@trembus/ui';
import type { SwimlaneLane, SwimlaneStep } from '@trembus/ui';

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
}: {
  step: SwimlaneStep;
  lanes: SwimlaneLane[];
  allSteps: SwimlaneStep[];
  onClose: () => void;
  onSelectStep: (id: string) => void;
}) {
  const lane = laneFor(lanes, step.lane);
  const successors = (step.to ?? [])
    .map((id) => allSteps.find((s) => s.id === id))
    .filter((s): s is SwimlaneStep => Boolean(s));
  const isTerminal = Array.isArray(step.to) && step.to.length === 0;

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
