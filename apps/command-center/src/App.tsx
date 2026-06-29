import { useState } from 'react';
import { Badge, Brief, Card, EmptyState, FolderTree, Hub, Meter, Table, Tabs, Timeline } from '@trembus/ui';
import type { BriefContract, FolderNode, SectionKind, TimelineContract, TimelineTone } from '@trembus/ui';
import {
  activeConsumer,
  consumerOptions,
  domainById,
  entities,
  entitiesOfKinds,
  guide,
  guideIndex,
  guideRoot,
  hasGuide,
  hub,
  hubData,
  kinds,
  phasesByEntity,
  prettify,
  ribbon,
  ribbonTitle,
  ribbonTotal,
  setConsumer,
  strategy,
  swimlaneKinds,
} from './contract';
import type { EntityRecord, GuideNode, Phase } from './contract';
import { WorkflowConsole } from './WorkflowConsole';
import { WORKFLOWS } from './workflows';
import { DecisionSurface } from './DecisionSurface';
import { groupByStatus, statusTone } from './status';

// statusTone + groupByStatus now live in ./status — one source, shared with the DecisionSurface panel.

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

type NavEntry = { value: string; label: string; panel?: 'overview' | 'roadmap' | 'decisions' | 'workflows' | 'guide'; kinds?: string[] };

// The editorial seams: which kinds the bespoke panels already surface, so they don't ALSO get an
// auto-tab. Adding a new kind never edits these — it just gets its own tab (or a config
// `render.nav` line places it elsewhere). The Overview hub composes everything, so it consumes none.
const ROADMAP_KINDS = ['feature', 'roadmap', 'report', 'session']; // the Roadmap panel surfaces these
const WORKFLOW_TABLE_KINDS = ['pipeline']; // the "Build plans" table inside the Workflows panel
const DECISION_KINDS = ['decision']; // the bespoke Decision Surface (constellation + ledger + ego-graph)

// Default nav when config sets no `render.nav`: Overview + Roadmap, the Decision Surface (when the
// project declares the decision kind), an auto-tab per remaining kind (declared order), then
// Workflows iff any swimlane exists. The old Graph/Lineage view is retired (buildGraphContract +
// @trembus/viz stay — the Decision Surface revives the latter for a scoped ego-graph).
function deriveNav(): NavEntry[] {
  const consumed = new Set([...ROADMAP_KINDS, ...DECISION_KINDS, ...WORKFLOW_TABLE_KINDS, ...swimlaneKinds]);
  const nav: NavEntry[] = [
    { value: 'overview', label: 'Overview', panel: 'overview' },
    { value: 'roadmap', label: 'Roadmap', panel: 'roadmap' },
  ];
  const decisionKinds = DECISION_KINDS.filter((k) => kinds.includes(k));
  if (decisionKinds.length) {
    nav.push({ value: 'decisions', label: 'Decisions', panel: 'decisions', kinds: decisionKinds });
  }
  for (const k of kinds) {
    if (!consumed.has(k)) nav.push({ value: k, label: `${prettify(k)}s`, kinds: [k] });
  }
  if (WORKFLOWS.length || swimlaneKinds.length) {
    nav.push({ value: 'workflows', label: 'Workflows', panel: 'workflows' });
  }
  // The Field Guide tab appears only when the contract carries a guide payload, so a consumer
  // (or older contract) without it never gets an empty tab.
  if (hasGuide) nav.push({ value: 'guide', label: 'Field Guide', panel: 'guide' });
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

// Map an entity kind → the nav tab that surfaces it (for step-ref cross-navigation): a
// swimlane-carrier or pipeline → Workflows, a kind the Roadmap panel shows → Roadmap, else the
// kind's own auto-tab, falling back to Overview. Derived from the same seams deriveNav() uses.
function tabForKind(kind: string): string {
  if (swimlaneKinds.includes(kind) || WORKFLOW_TABLE_KINDS.includes(kind)) return 'workflows';
  if (ROADMAP_KINDS.includes(kind)) return 'roadmap';
  if (DECISION_KINDS.includes(kind)) return 'decisions';
  return AREAS.find((a) => a.kinds?.includes(kind))?.value ?? 'overview';
}

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

// A compact, config-ordered status rollup for a kind's entities — e.g. "1 active · 1 proposed".
const statusRollup = (kind: string, rows: EntityRecord[]): string =>
  groupByStatus(kind, rows)
    .map(([s, g]) => `${g.length} ${s}`)
    .join(' · ');

// Selecting a hub tile reveals that tile's detail in the right-side drawer (not below the grid).
// The selected id is the domain id — an entity kind for kind-petals, a facet id (commands /
// workflows / hooks) for control-surface petals, or 'contract' for the center. This projects the
// selection into a Trembus BriefContract:
//   · the CENTER (ProjectEntity) lists every conforming entity, categorized BY KIND — one section
//     per kind (declared order) whose `note` rolls up that kind's status spread — then its sources;
//   · a KIND PETAL categorizes that one kind's entities BY STATUS (config enum order);
//   · a FACET petal lists its `entries`.
// The eyebrow is the tile's *source path* (its most identifying handle) rather than the generic
// "Control surface" tag three petals share; the meta pills lead with a toned count, then the
// status rollup (or, for hooks, the blocking/advisory split) — never a triple-counted "STATE 2 · …".
function hexBrief(id: string): BriefContract {
  const domain = domainById.get(id);
  const rows = entitiesOfKinds(id);
  const entries = domain?.entries ?? [];
  const dot = domain?.dot;
  const isHooks = id === 'hooks';
  const isCenter = domain?.kind === 'center' || id === 'contract';
  const sections: NonNullable<BriefContract['sections']> = [];

  if (isCenter) {
    // The ProjectEntity brief: the contract made legible — the universal shape, then EVERY entity
    // that conforms to it, categorized BY KIND in declared order. Each kind is a section whose
    // `note` rolls up its status spread; items keep a status chip (status varies within a kind
    // here) + the updated date. Newest first per kind.
    for (const kind of kinds) {
      const group = entitiesOfKinds(kind);
      if (!group.length) continue;
      const sorted = group.slice().sort((a, b) => b.updated.localeCompare(a.updated));
      sections.push({
        id: `kind-${kind}`,
        heading: `${prettify(kind)}s`,
        kind: 'artifacts',
        note: statusRollup(kind, group),
        items: sorted.map((e) => ({ text: e.title, status: e.status, ref: e.updated })),
      });
    }
  } else if (rows.length) {
    // A kind petal: categorize that one kind's entities BY STATUS — one section per status, in the
    // config's declared enum order. The heading carries the status, so items drop their (now
    // redundant) chip and the `note` lead-in shows that category's share of the kind.
    for (const [status, group] of groupByStatus(id, rows)) {
      sections.push({
        id: `status-${status}`,
        heading: prettify(status),
        kind: 'artifacts',
        note: `${group.length} of ${rows.length}`,
        items: group.map((e) => ({ text: e.title, ref: e.updated })),
      });
    }
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
  }

  // Sources: the center keeps its provenance (schema + config) as a trailing section beneath the
  // categorized entities; any other tile falls back to sources only when it would otherwise be empty.
  if (domain?.sources?.length && (isCenter || !sections.length)) {
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
  if (isCenter) {
    // Lead with the conformant whole: total entities, how many kinds carry them, then the
    // conformance ratio (the domain status — now a short "M/N" the tile chip also shows).
    meta.push({ label: 'entities', value: entities.length, tone: dot });
    meta.push({ label: 'kinds', value: kinds.filter((k) => entitiesOfKinds(k).length).length });
    if (domain?.status) meta.push({ label: 'conformant', value: domain.status });
  } else if (rows.length) {
    meta.push({ label: 'entities', value: rows.length, tone: dot });
    const categories = new Set(rows.map((e) => e.status)).size;
    if (categories > 1) meta.push({ label: 'categories', value: categories });
  } else if (entries.length) meta.push({ label: domain?.name?.toLowerCase() ?? 'items', value: entries.length, tone: dot });

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

// Field Guide: project a selected tree node into a Brief. The meta pills carry the node's place
// in the hierarchy (type · authored-vs-derived source · child count); a "Conventions" section
// lists its facts (filename scheme, status enum, sections, rel rules), and a "Contains" section
// lists its children so the brief doubles as a map one level down. Reuses the same <Brief> the
// hex drawer uses — same styling, no new component.
const GUIDE_TYPE_LABEL: Record<string, string> = {
  root: 'Overview',
  folder: 'Folder',
  file: 'File',
  'kind-folder': 'Entity kind',
  'kind-file': 'Example file',
  concept: 'Concept',
};
const GUIDE_TYPE_BLURB: Record<string, string> = {
  root: 'The framework, top to bottom.',
  folder: 'A directory in the framework core.',
  file: 'A file in the framework core.',
  'kind-folder': 'A _project/ folder holding one entity kind, named and derived from this project’s config.',
  'kind-file': 'A representative filename for this kind — not a live entity.',
  concept: 'A core concept of the contract.',
};
const factText = (v: string | string[]): string => (Array.isArray(v) ? v.join(' · ') : v);

// Adapt the guide tree to @trembus/ui's <FolderTree> shape (id · label · children). FolderTree
// infers folder-vs-file from the presence of children and supplies icons/keyboard/filter; the
// rest of a GuideNode (brief/facts) is looked up by id via `guideIndex` when a node is selected.
function toFolderNodes(nodes: GuideNode[]): FolderNode[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    children: n.children?.length ? toFolderNodes(n.children) : undefined,
  }));
}
const guideForest: FolderNode[] = toFolderNodes(guide);

function guideBrief(node: GuideNode): BriefContract {
  const meta: NonNullable<BriefContract['meta']> = [
    { label: 'type', value: GUIDE_TYPE_LABEL[node.nodeType] ?? node.nodeType },
  ];
  if (node.origin) meta.push({ label: 'source', value: node.origin });
  if (node.children?.length) meta.push({ label: 'contains', value: node.children.length });

  const sections: NonNullable<BriefContract['sections']> = [];
  if (node.facts?.length) {
    sections.push({
      id: 'conventions',
      heading: 'Conventions',
      kind: 'reference',
      items: node.facts.map((f) => ({ text: f.label, ref: factText(f.value) })),
    });
  }
  if (node.children?.length) {
    sections.push({
      id: 'contains',
      heading: node.nodeType === 'concept' ? 'Related' : 'Contains',
      kind: 'artifacts',
      note: `${node.children.length} ${node.children.length === 1 ? 'entry' : 'entries'}`,
      items: node.children.map((c) => ({ text: c.label, desc: c.brief, ref: c.path ?? undefined })),
    });
  }

  return {
    view: 'brief',
    kind: 'spec',
    id: node.path ?? node.id,
    title: node.label,
    summary: node.brief ?? GUIDE_TYPE_BLURB[node.nodeType],
    meta,
    sections,
  };
}

// The feature catalog — the heart of the Roadmap. Reads `feature` entities (config-driven, so a
// project without that kind simply shows nothing) and groups them by availability: Available now,
// then Planned, each ordered required-before-optional. `tags.tier` carries required/optional;
// `status` carries available/planned. Both come straight from the contract's nodes[] — derived,
// never hand-authored here.
const TIER_RANK: Record<string, number> = { required: 0, optional: 1 };

function FeatureCatalog() {
  const feats = entitiesOfKinds('feature');
  if (!feats.length) return null;
  const byTier = (a: EntityRecord, b: EntityRecord) =>
    (TIER_RANK[a.tags.tier] ?? 2) - (TIER_RANK[b.tags.tier] ?? 2) || a.title.localeCompare(b.title);
  const groups = [
    { key: 'available', title: 'Available now', tone: '#43AA8B', rows: feats.filter((f) => f.status === 'available').sort(byTier) },
    { key: 'planned', title: 'Planned', tone: '#D4AF37', rows: feats.filter((f) => f.status === 'planned').sort(byTier) },
    { key: 'other', title: 'Other', tone: '#6B7280', rows: feats.filter((f) => f.status !== 'available' && f.status !== 'planned').sort(byTier) },
  ].filter((g) => g.rows.length);

  return (
    <section className="cc-section">
      <h3 className="cc-section-title">Features</h3>
      <div className="cc-featcatalog">
        {groups.map((g) => (
          <div key={g.key} className="cc-feat-group">
            <header className="cc-feat-group__head">
              <span className="cc-feat-group__title" style={{ color: g.tone }}>{g.title}</span>
              <span className="cc-feat-group__count">{g.rows.length}</span>
            </header>
            {g.rows.map((f) => (
              <div key={f.id} className="cc-feat-row">
                <span className="cc-feat-dot" style={{ background: g.tone }} aria-hidden />
                <span className="cc-feat-name">{f.title}</span>
                <span className="cc-feat-tier" data-tier={f.tags.tier ?? 'none'}>{f.tags.tier ?? '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// The Roadmap board (repurposed from the old Progress view — the big Stat tiles are gone). Leads
// with the feature catalog, then the milestone `ribbon` (a stacked Meter + a Brief⇄Timeline
// switcher), then the planning-artifacts table (roadmaps / reports / sessions).
function RoadmapBoard() {
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
      <FeatureCatalog />

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

  // Field Guide: selected node drives the right-pane brief. FolderTree owns its own expansion
  // (uncontrolled, the top-level forest open by default); we just track the selection.
  const [guideSel, setGuideSel] = useState<string | undefined>(undefined);
  const selectedGuideNode = guideSel ? guideIndex.get(guideSel) : undefined;

  // Step-ref cross-navigation: jump to the entity a workflow step references. A workflow target
  // re-points the picker + opens Workflows; anything else switches to the tab that lists its kind.
  const navigateToEntity = (target: string) => {
    const e = entities.find((x) => x.id === target);
    if (!e) return;
    if (swimlaneKinds.includes(e.kind)) {
      setWfId(target);
      setTab('workflows');
    } else {
      setTab(tabForKind(e.kind));
    }
  };

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
              {hubSel === 'guide' && (
                <button type="button" className="cc-guide__cta" onClick={() => setTab('guide')}>
                  Open Field Guide →
                </button>
              )}
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
          onNavigate={navigateToEntity}
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

  // Field Guide: an expandable convention tree on the left, the selected node's brief on the right
  // — a docs explorer. Degrades to an EmptyState if the contract carries no guide payload.
  const guideBody = hasGuide ? (
    <div className="cc-guide">
      <aside className="cc-guide__tree" aria-label="Field guide navigation">
        {guideRoot?.brief ? <p className="cc-guide__intro">{guideRoot.brief}</p> : null}
        <FolderTree
          data={guideForest}
          label="Framework & naming conventions"
          defaultExpandedIds={guide.map((n) => n.id)}
          selectedId={guideSel}
          onSelect={(id) => setGuideSel(id)}
          filter
        />
      </aside>
      <section className="cc-guide__detail">
        {selectedGuideNode ? (
          <Card className="cc-detailpanel__card">
            <Brief data={guideBrief(selectedGuideNode)} />
          </Card>
        ) : (
          <EmptyState
            title="Pick a node"
            description="Select a folder, file, or concept to read its purpose and naming conventions."
          />
        )}
      </section>
    </div>
  ) : (
    <EmptyState
      title="No field guide"
      description="This project's contract doesn't include a conventions guide yet."
    />
  );

  // Dispatch a nav entry to its panel body: a bespoke panel, or a generic per-kind table.
  const renderPanel = (area: NavEntry) => {
    if (area.panel === 'overview') return overviewBody;
    if (area.panel === 'roadmap') return <RoadmapBoard />;
    if (area.panel === 'decisions') return <DecisionSurface kind={area.kinds?.[0] ?? 'decision'} onNavigate={navigateToEntity} />;
    if (area.panel === 'workflows') return workflowsBody;
    if (area.panel === 'guide') return guideBody;
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
