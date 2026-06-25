import { useEffect, useMemo, useState } from 'react';
import { Lineage } from '@trembus/viz';
import { Badge, EmptyState, Hub, Table, Tabs } from '@trembus/ui';
import { buildGraphContract, entitiesOfKinds, hub, hubData } from './contract';
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

// The areas the command center navigates. Overview is the hub landing, Graph is the entity
// lineage; the rest list one or more kinds. Together the kinds cover every entity.
const AREAS = [
  { value: 'overview', label: 'Overview' },
  { value: 'graph', label: 'Graph' },
  { value: 'decisions', label: 'Decisions', kinds: ['decision'] },
  { value: 'workflows', label: 'Workflows', kinds: ['pipeline'] },
  { value: 'progress', label: 'Progress', kinds: ['roadmap', 'report', 'session'] },
] as const;

// Which tab a hub petal routes to. A petal's domain id is its kind; center/tooling have no
// area, so selecting them just opens the hub's own inspector (handled below).
const TAB_FOR_KIND: Record<string, string> = {};
for (const a of AREAS) if ('kinds' in a) for (const k of a.kinds) TAB_FOR_KIND[k] = a.value;

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

export function App() {
  const { data, dropped } = useMemo(() => buildGraphContract(), []);
  const [tab, setTab] = useState('overview');
  const [graphSel, setGraphSel] = useState<string | undefined>(undefined);
  const [hubSel, setHubSel] = useState<string | undefined>(undefined);
  const [wfId, setWfId] = useState<string>(WORKFLOWS[0].id);
  const activeWorkflow = WORKFLOWS.find((w) => w.id === wfId) ?? WORKFLOWS[0];

  useEffect(() => {
    if (dropped.length) console.warn('[command-center] unresolved edges:', dropped);
  }, [dropped]);

  // Click a petal → jump to that kind's area tab; click the contract/tooling tiles → just
  // select them so the hub's own inspector shows the note + sources.
  function onHubSelect(id: string) {
    const dest = TAB_FOR_KIND[id];
    if (dest) setTab(dest);
    else setHubSel(id);
  }

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
          <Hub data={hubData} selectedId={hubSel} onSelect={onHubSelect} />
        </Tabs.Panel>

        <Tabs.Panel value="graph" className="cc-panel cc-panel--stage">
          <Lineage data={data} selectedId={graphSel} onSelect={setGraphSel} />
          {dropped.length > 0 && (
            <p className="cc-foot">
              ⚠ {dropped.length} edge(s) did not resolve to a node — the committed contract may be
              stale. Regenerate with <code>node ../../tools/render-hub.mjs</code>.
            </p>
          )}
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
        <Tabs.Panel value="progress" className="cc-panel">
          <AreaTable
            kinds={['roadmap', 'report', 'session']}
            empty="No roadmaps, reports, or sessions yet."
          />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
