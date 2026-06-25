import { useState } from 'react';
import { Badge, Brief, Card, EmptyState, Hub, Meter, Stat, Table, Tabs, Timeline } from '@trembus/ui';
import type { BriefContract, TimelineContract, TimelineTone } from '@trembus/ui';
import {
  domainById,
  entities,
  entitiesOfKinds,
  hub,
  hubData,
  phasesByEntity,
  ribbon,
  ribbonTitle,
  ribbonTotal,
  scope,
  strategy,
} from './contract';
import type { Phase } from './contract';
import { WorkflowConsole } from './WorkflowConsole';
import { WORKFLOWS } from './workflows';

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

// Map a per-kind status word onto the shared status-tone ontology. Unknown → neutral.
const STATUS_TONE: Record<string, StatusTone> = {
  accepted: 'success',
  done: 'success',
  shipped: 'success',
  complete: 'success',
  active: 'success',
  proposed: 'info',
  draft: 'info',
  design: 'info',
  qualify: 'warning',
  build: 'warning',
  planned: 'warning',
  blocked: 'danger',
  banned: 'danger',
};
const statusTone = (s: string): StatusTone => STATUS_TONE[s] ?? 'neutral';

// Phase status → Timeline tone. The status words are the project's own (authored in the
// `## Phases` block); unknown words fall back to neutral. This is the only phase vocabulary
// the app names — the contract stays domain-neutral.
const PHASE_TONE: Record<string, TimelineTone> = {
  done: 'success',
  active: 'accent',
  parked: 'warning',
  blocked: 'danger',
  planned: 'neutral',
};

// Entity id → title, to label each roadmap's phase timeline.
const titleById = new Map(entities.map((e) => [e.id, e.title]));

// Project a `## Phases` array into a Trembus TimelineContract (ordinal scale — one column per
// phase, in authored order). Categories are derived from the distinct statuses present.
function phaseTimeline(title: string, phases: Phase[]): TimelineContract {
  const done = phases.filter((p) => p.status === 'done').length;
  const seen = new Set<string>();
  const categories = phases
    .map((p) => p.status ?? 'planned')
    .filter((s) => (seen.has(s) ? false : seen.add(s)))
    .map((s) => ({
      key: s,
      label: s.charAt(0).toUpperCase() + s.slice(1),
      tone: PHASE_TONE[s] ?? ('neutral' as TimelineTone),
    }));
  return {
    view: 'timeline',
    title,
    caption: `${done}/${phases.length} phases done`,
    scale: 'ordinal',
    categories,
    events: phases.map((p, i) => ({
      id: p.id ?? String(i),
      at: i,
      dateLabel: p.id,
      label: p.label,
      category: p.status ?? 'planned',
      sub: (p.status ?? '').toUpperCase(),
      note: p.detail ?? p.note,
    })),
  };
}

// The areas the command center navigates. Overview is the hub landing; Progress is the
// development board; the rest list one or more kinds. The old Graph/Lineage view is retired
// (the plumbing — buildGraphContract + @trembus/viz — stays in place for an easy revival).
const AREAS = [
  { value: 'overview', label: 'Overview' },
  { value: 'progress', label: 'Progress' },
  { value: 'decisions', label: 'Decisions', kinds: ['decision'] },
  { value: 'workflows', label: 'Workflows', kinds: ['pipeline'] },
] as const;

function AreaTable({ kinds, empty }: { kinds: string[]; empty: string }) {
  const rows = entitiesOfKinds(...kinds);
  if (!rows.length) {
    return <EmptyState title="Nothing here yet" description={empty} />;
  }
  return (
    <Table density="comfortable">
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Title</Table.HeaderCell>
          <Table.HeaderCell>Kind</Table.HeaderCell>
          <Table.HeaderCell>Status</Table.HeaderCell>
          <Table.HeaderCell align="end">Updated</Table.HeaderCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map((e) => (
          <Table.Row key={`${e.kind}/${e.id}`}>
            <Table.Cell>{e.title}</Table.Cell>
            <Table.Cell>
              <Badge tone="neutral" variant="soft" size="sm">
                {e.kind}
              </Badge>
            </Table.Cell>
            <Table.Cell>
              <Badge tone={statusTone(e.status)} variant="soft" size="sm" dot>
                {e.status}
              </Badge>
            </Table.Cell>
            <Table.Cell numeric>{e.updated}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

// Selecting a hub tile no longer navigates — it reveals that tile's planning artifacts here,
// beneath the Hub's own (note + sources) inspector. The selected id is the domain id, which
// equals the entity kind for petals (and 'contract'/'tooling' for the center + tooling slot,
// which carry no entity list — those fall back to the domain's sources).
function HexDetails({ id }: { id?: string }) {
  if (!id) {
    return (
      <Card className="cc-hexdetails cc-hexdetails--empty">
        <p className="cc-hexdetails__hint">Select a hexagon to inspect its planning artifacts.</p>
      </Card>
    );
  }
  const domain = domainById.get(id);
  const rows = entitiesOfKinds(id);
  return (
    <Card className="cc-hexdetails">
      <header className="cc-hexdetails__head">
        <div>
          <p className="cc-eyebrow">{domain?.tag ?? id}</p>
          <h3 className="cc-hexdetails__title">{domain?.name ?? id}</h3>
        </div>
        {domain?.status && (
          <Badge tone="neutral" variant="soft" size="sm">
            {domain.status}
          </Badge>
        )}
      </header>
      {rows.length > 0 ? (
        // A kind tile: list its entities. The Hub's own inspector (above) already carries the
        // note + sources, so the card stays focused on the artifacts it uniquely adds.
        <Table density="compact">
          <Table.Head>
            <Table.Row>
              <Table.HeaderCell>Title</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell align="end">Updated</Table.HeaderCell>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {rows.map((e) => (
              <Table.Row key={`${e.kind}/${e.id}`}>
                <Table.Cell>{e.title}</Table.Cell>
                <Table.Cell>
                  <Badge tone={statusTone(e.status)} variant="soft" size="sm" dot>
                    {e.status}
                  </Badge>
                </Table.Cell>
                <Table.Cell numeric>{e.updated}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : (
        // The center (contract) or tooling tile: no entity list, so the card carries the detail.
        <>
          {domain?.note && <p className="cc-hexdetails__note">{domain.note}</p>}
          {domain?.sources?.length ? (
            <ul className="cc-hexdetails__sources">
              {domain.sources.map((s, i) => (
                <li key={i}>{typeof s === 'string' ? s : s.label}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Card>
  );
}

// The development board (in the slot the Graph view used to hold). It visualizes progress from
// data the contract already emits: the milestone `ribbon` (a Brief of phases + a stacked Meter),
// the coverage `scope` (Stat tiles), and the planning artifacts (roadmaps / reports / sessions).
function ProgressBoard() {
  // The detail card swaps between two takes on the same plan: the Brief (milestone narrative)
  // and the Timeline (roadmap phases). The Meter above stays put as the at-a-glance ratio.
  const [view, setView] = useState<'brief' | 'timeline'>('brief');
  const phaseEntries = Object.entries(phasesByEntity);

  const shipped = ribbon.filter((r) => r.kind === 'shipped').length;
  const current = ribbon.filter((r) => r.kind === 'current').length;
  const planned = ribbon.filter((r) => r.kind === 'planned').length;
  const total = ribbon.length || 1;

  // A planning Brief built straight from the milestone ribbon — Brief's `phases` section kind
  // is purpose-built for exactly this (numbered steps with a status chip + date ref).
  const brief: BriefContract = {
    view: 'brief',
    kind: 'plan',
    id: (hub.code as string) ?? hub.brand,
    title: ribbonTitle,
    summary: strategy,
    meta: [
      { label: 'shipped', value: shipped, tone: '#43AA8B' },
      { label: 'in flight', value: current, tone: '#D4AF37' },
      { label: 'planned', value: planned, tone: '#6B7280' },
    ],
    sections: [
      {
        id: 'milestones',
        heading: 'Milestones',
        kind: 'phases',
        note: ribbonTotal,
        items: ribbon.map((r) => ({
          text: `${r.code}. ${r.name}`,
          status: r.kind === 'current' ? 'in flight' : r.kind,
          ref: r.date,
        })),
      },
    ],
  };

  return (
    <div className="cc-progress">
      <section className="cc-progress__stats">
        <Stat label="Milestones" value={`${shipped}/${total}`} target={ribbonTotal} tone="success" />
        {scope.slice(0, 4).map((s) => (
          <Stat key={s.label} label={s.label} value={s.num} target={s.value} tone="neutral" />
        ))}
      </section>

      <section className="cc-section">
        <h3 className="cc-section-title">Milestone progress</h3>
        <Meter
          variant="stacked"
          max={total}
          segments={[
            { value: shipped, tone: 'success', label: 'shipped' },
            { value: current, tone: 'accent', label: 'in flight' },
            { value: planned, tone: 'neutral', label: 'planned' },
          ]}
          label="Milestone progress"
        />
      </section>

      <section className="cc-section">
        <Card className="cc-switchcard">
          <Tabs value={view} onValueChange={(v) => setView(v as 'brief' | 'timeline')}>
            <Tabs.List aria-label="Roadmap view" className="cc-switch__list">
              <Tabs.Tab value="brief">Brief</Tabs.Tab>
              <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="brief" className="cc-switch__panel">
              <Brief data={brief} />
            </Tabs.Panel>
            <Tabs.Panel value="timeline" className="cc-switch__panel">
              {phaseEntries.length ? (
                phaseEntries.map(([id, phases]) => (
                  <Timeline key={id} data={phaseTimeline(titleById.get(id) ?? id, phases)} />
                ))
              ) : (
                <EmptyState
                  title="No phases yet"
                  description="No roadmap declares a ## Phases block."
                />
              )}
            </Tabs.Panel>
          </Tabs>
        </Card>
      </section>

      <section className="cc-section">
        <h3 className="cc-section-title">Planning artifacts</h3>
        <AreaTable
          kinds={['roadmap', 'report', 'session']}
          empty="No roadmaps, reports, or sessions yet."
        />
      </section>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState('overview');
  const [hubSel, setHubSel] = useState<string | undefined>(undefined);
  const [wfId, setWfId] = useState<string>(WORKFLOWS[0].id);
  const activeWorkflow = WORKFLOWS.find((w) => w.id === wfId) ?? WORKFLOWS[0];

  return (
    <div className="tcl-root cc-app">
      <header className="cc-head">
        <h1 className="cc-title">{hub.brand} · Command Center</h1>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="cc-tabs">
        <Tabs.List aria-label="Project areas" className="cc-tablist">
          {AREAS.map((a) => (
            <Tabs.Tab key={a.value} value={a.value}>
              {a.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="overview" className="cc-panel cc-panel--hub">
          <div className="cc-overview">
            <Hub data={hubData} selectedId={hubSel} onSelect={setHubSel} />
            <HexDetails id={hubSel} />
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="progress" className="cc-panel">
          <ProgressBoard />
        </Tabs.Panel>

        <Tabs.Panel value="decisions" className="cc-panel">
          <AreaTable kinds={['decision']} empty="No decisions recorded yet." />
        </Tabs.Panel>

        <Tabs.Panel value="workflows" className="cc-panel">
          {WORKFLOWS.length > 1 && (
            <div className="cc-wf-picker" aria-label="Choose a workflow">
              {WORKFLOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="cc-wf-picker__btn"
                  aria-pressed={w.id === wfId}
                  data-active={w.id === wfId}
                  onClick={() => setWfId(w.id)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}
          <WorkflowConsole
            key={activeWorkflow.id}
            workflow={activeWorkflow.contract}
            runs={activeWorkflow.runs}
            runsTotal={activeWorkflow.runsTotal}
          />
          <section className="cc-section">
            <h3 className="cc-section-title">Build plans</h3>
            <AreaTable kinds={['pipeline']} empty="No pipelines defined yet." />
          </section>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
