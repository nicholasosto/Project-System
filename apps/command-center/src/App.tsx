import { useState } from 'react';
import { Badge, Brief, Card, EmptyState, Hub, Meter, Stat, Table, Tabs, Timeline } from '@trembus/ui';
import type { BriefContract, SectionKind, TimelineContract, TimelineTone } from '@trembus/ui';
import {
  activeConsumer,
  consumerOptions,
  domainById,
  entities,
  entitiesOfKinds,
  hub,
  hubData,
  kinds,
  phasesByEntity,
  prettify,
  ribbon,
  ribbonTitle,
  ribbonTotal,
  scope,
  setConsumer,
  strategy,
  swimlaneKinds,
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

type NavEntry = { value: string; label: string; panel?: 'overview' | 'progress' | 'workflows'; kinds?: string[] };

// The two editorial seams: which kinds the bespoke panels already surface, so they don't ALSO
// get an auto-tab. Adding a new kind never edits these — it just gets its own tab (or a config
// `render.nav` line places it elsewhere). The Overview hub composes everything, so it consumes none.
const PROGRESS_KINDS = ['roadmap', 'report', 'session'];
const WORKFLOW_TABLE_KINDS = ['pipeline']; // the "Build plans" table inside the Workflows panel

// Default nav when config sets no `render.nav`: Overview + Progress, an auto-tab per kind not
// shown by a special panel (declared order), then Workflows iff any swimlane exists. The old
// Graph/Lineage view is retired (buildGraphContract + @trembus/viz stay for an easy revival).
function deriveNav(): NavEntry[] {
  const consumed = new Set([...PROGRESS_KINDS, ...WORKFLOW_TABLE_KINDS, ...swimlaneKinds]);
  const nav: NavEntry[] = [
    { value: 'overview', label: 'Overview', panel: 'overview' },
    { value: 'progress', label: 'Progress', panel: 'progress' },
  ];
  for (const k of kinds) {
    if (!consumed.has(k)) nav.push({ value: k, label: `${prettify(k)}s`, kinds: [k] });
  }
  if (WORKFLOWS.length || swimlaneKinds.length) {
    nav.push({ value: 'workflows', label: 'Workflows', panel: 'workflows' });
  }
  return nav;
}

// Config-provided `render.nav` (rare) → NavEntry[]; absent → undefined (fall back to deriveNav).
function normalizeNav(raw: unknown): NavEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((e, i) => {
    const entry = e as { panel?: NavEntry['panel']; label?: string; kinds?: string[] };
    if (entry.panel) return { value: entry.panel, label: entry.label ?? prettify(entry.panel), panel: entry.panel };
    const ks = Array.isArray(entry.kinds) ? entry.kinds : [];
    return {
      value: entry.label ?? (ks.join('-') || `tab-${i}`),
      label: entry.label ?? (ks[0] ? `${prettify(ks[0])}s` : `Tab ${i + 1}`),
      kinds: ks,
    };
  });
}

const AREAS: NavEntry[] = normalizeNav(hub.nav) ?? deriveNav();

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

// Section kind per control-surface facet. Commands keep the bespoke command/gloss rows;
// workflows list their swimlane entries; hooks render as a `reference` list so each row can
// carry a role chip (`status`) + its command (`ref` → mono code) — the `rules` renderer shows
// only text + desc, which is what made the old drawer read as a flat, glossless list.
const FACET_SECTION: Record<string, SectionKind> = {
  commands: 'commands',
  hooks: 'reference',
  workflows: 'artifacts',
};

// The Claude Code events that can *block* a tool call (PreToolUse / UserPromptSubmit exit-2);
// everything else only advises. Lets the Hooks brief show a blocking/advisory split without the
// domain-neutral emitter having to carry the role — it's derivable from the event name.
const BLOCKING_HOOK = /^(PreToolUse|UserPromptSubmit)\b/;
const hookRole = (text: string): string => (BLOCKING_HOOK.test(text) ? 'blocking' : 'advisory');

// Selecting a hub tile reveals that tile's detail in the right-side drawer (not below the grid).
// The selected id is the domain id — an entity kind for kind-petals, a facet id (commands /
// workflows / hooks) for control-surface petals, or 'contract' for the center. This projects the
// selection into a Trembus BriefContract: kind tiles list their entities via an `artifacts`
// section; facet tiles list their `entries`; the center carries neither, so it falls back to the
// domain's note + `reference` sources. The eyebrow is the tile's *source path* (its most
// identifying handle) rather than the generic "Control surface" tag three petals share; the meta
// pills lead with a toned count, then the status rollup (or, for hooks, the blocking/advisory
// split) — never the old triple-counted "STATE 2 · … / COUNT 2".
function hexBrief(id: string): BriefContract {
  const domain = domainById.get(id);
  const rows = entitiesOfKinds(id);
  const entries = domain?.entries ?? [];
  const dot = domain?.dot;
  const isHooks = id === 'hooks';
  const sections: NonNullable<BriefContract['sections']> = [];

  if (rows.length) {
    sections.push({
      id: 'artifacts',
      heading: 'Planning artifacts',
      kind: 'artifacts',
      items: rows.map((e) => ({ text: e.title, status: e.status, ref: e.updated })),
    });
  } else if (entries.length) {
    sections.push({
      id: 'entries',
      heading: domain?.name ?? 'Details',
      kind: FACET_SECTION[id] ?? 'reference',
      items: entries.map((e) =>
        isHooks
          ? { text: e.text, status: hookRole(e.text), ref: e.desc?.replace(/^node\s+/, '') }
          : { text: e.text, desc: e.desc, status: e.status, ref: e.ref },
      ),
    });
  } else if (domain?.sources?.length) {
    sections.push({
      id: 'sources',
      heading: 'Sources',
      kind: 'reference',
      items: domain.sources.map((s) => (typeof s === 'string' ? s : { text: s.label, ref: s.href })),
    });
  }

  // Eyebrow (the gold mono `id` slot): the tile's first source path — its most identifying
  // handle — falling back to the shared tag only when a tile declares no source.
  const firstSource = domain?.sources?.[0];
  const eyebrow = (typeof firstSource === 'string' ? firstSource : firstSource?.label) ?? domain?.tag;

  // Meta pills — scannable + toned, no repetition. Lead with a count (entities, or facet items);
  // hooks add the derived blocking/advisory split; every other tile shows the *rollup* — the part
  // of `status` after the leading "N · ", which would otherwise just repeat the count.
  const meta: NonNullable<BriefContract['meta']> = [];
  if (rows.length) meta.push({ label: 'entities', value: rows.length, tone: dot });
  else if (entries.length) meta.push({ label: domain?.name?.toLowerCase() ?? 'items', value: entries.length, tone: dot });

  if (isHooks && entries.length) {
    const blocking = entries.filter((e) => BLOCKING_HOOK.test(e.text)).length;
    if (blocking) meta.push({ label: 'blocking', value: blocking, tone: '#FF9F45' });
    if (entries.length - blocking) meta.push({ label: 'advisory', value: entries.length - blocking, tone: '#5a6478' });
  } else {
    const rollup = (domain?.status ?? '').split(' · ').slice(1).join(' · ').trim();
    if (rollup) meta.push({ label: 'state', value: rollup });
  }
  if (!meta.length && domain?.status) meta.push({ label: 'state', value: domain.status });

  return {
    view: 'brief',
    kind: 'spec',
    id: eyebrow ?? id,
    title: domain?.name ?? id,
    summary: domain?.note ?? domain?.sub,
    meta,
    sections,
  };
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
  const [wfId, setWfId] = useState<string>(WORKFLOWS[0]?.id ?? '');
  const activeWorkflow = WORKFLOWS.find((w) => w.id === wfId) ?? WORKFLOWS[0];

  // The three bespoke panels (compose multiple kinds + non-kind data — not auto-generatable).
  const overviewBody = (
    <div className="cc-overview">
      <div className="cc-overview__hub">
        <Hub data={hubData} selectedId={hubSel} onSelect={setHubSel} />
      </div>
      <aside className="cc-detailpanel" data-open={Boolean(hubSel)} aria-label="Entity details">
        <div className="cc-detailpanel__inner">
          {hubSel ? (
            <Card className="cc-detailpanel__card">
              <button
                type="button"
                className="cc-detailpanel__close"
                onClick={() => setHubSel(undefined)}
                aria-label="Close details"
              >
                ✕
              </button>
              <Brief data={hexBrief(hubSel)} />
            </Card>
          ) : null}
        </div>
      </aside>
    </div>
  );

  const workflowsBody = (
    <>
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
      {activeWorkflow ? (
        <WorkflowConsole
          key={activeWorkflow.id}
          workflow={activeWorkflow.contract}
          runs={activeWorkflow.runs}
          runsTotal={activeWorkflow.runsTotal}
        />
      ) : (
        <EmptyState
          title="No workflows yet"
          description="No entity declares a ## Workflow block. Scaffold one with /new workflow."
        />
      )}
      <section className="cc-section">
        <h3 className="cc-section-title">Build plans</h3>
        <AreaTable kinds={WORKFLOW_TABLE_KINDS} empty="No pipelines defined yet." />
      </section>
    </>
  );

  // Dispatch a nav entry to its panel body: a bespoke panel, or a generic per-kind table.
  const renderPanel = (area: NavEntry) => {
    if (area.panel === 'overview') return overviewBody;
    if (area.panel === 'progress') return <ProgressBoard />;
    if (area.panel === 'workflows') return workflowsBody;
    return <AreaTable kinds={area.kinds ?? []} empty={`No ${area.label.toLowerCase()} yet.`} />;
  };

  return (
    <div className="tcl-root cc-app">
      <header className="cc-head" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 className="cc-title">{hub.brand} · Command Center</h1>
        {consumerOptions.length > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', opacity: 0.85 }}>
            <span>Project</span>
            <select
              value={activeConsumer}
              onChange={(e) => setConsumer(e.target.value)}
              style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', font: 'inherit' }}
              aria-label="Choose which consumer the board renders"
            >
              {consumerOptions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <Tabs value={tab} onValueChange={setTab} className="cc-tabs">
        <Tabs.List aria-label="Project areas" className="cc-tablist">
          {AREAS.map((a) => (
            <Tabs.Tab key={a.value} value={a.value}>
              {a.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {AREAS.map((area) => (
          <Tabs.Panel
            key={area.value}
            value={area.value}
            className={area.panel === 'overview' ? 'cc-panel cc-panel--hub' : 'cc-panel'}
          >
            {renderPanel(area)}
          </Tabs.Panel>
        ))}
      </Tabs>
    </div>
  );
}
