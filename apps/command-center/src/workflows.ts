// Workflows the Command Center can replay as Swimlanes — derived entirely from the contract.
//
// Every workflow is data: a `workflow`-kind entity (e.g. the authoring loop) or any other
// entity that declares a `## Workflow` block (decision 0004 — e.g. a pipeline's build flow).
// render-hub.mjs extracts each into graph.json's `workflows` map; this module adapts that map
// into the picker's option shape AND the Processes side-nav tree. Nothing is hardcoded here.
import type { FolderNode, RunRecord } from '@trembus/ui';
import {
  entities,
  relatedEdges,
  runs as contractRuns,
  swimlaneKinds,
  workflows as contractWorkflows,
} from './contract';
import type { WorkflowContract } from './contract';

export interface WorkflowOption {
  id: string;
  label: string;
  /** Which kind of entity declared it — a standalone `workflow`, or another kind's inline block. */
  source: 'workflow' | 'inline';
  contract: WorkflowContract;
  /** The latest (windowed) runs to replay over this workflow; empty when none captured. */
  runs: RunRecord[];
  /** Total runs in the source, for an honest "latest N of M" when windowed. */
  runsTotal: number;
}

// Ids of entities of a swimlane-carrier kind (config `carriesSwimlanes`) — they lead the picker;
// an inline `## Workflow` on some other kind follows. Derived from the contract, not hardcoded.
const carrierKinds = new Set(swimlaneKinds);
const WORKFLOW_KIND_IDS = new Set(entities.filter((e) => carrierKinds.has(e.kind)).map((e) => e.id));

// ── Run history join ─────────────────────────────────────────────────────────────────────
// render-hub keys runs by the entity that AUTHORED the `## Runs` block. This repo's happy path
// is one entity carrying BOTH `## Workflow` and `## Runs` (same id — a trivial 1:1 join). But a
// consumer may split template from instance — a `workflow` holds the swimlane while each
// `pipeline` that `references` it holds its own run log — so a workflow's runs can also live on
// its pipelines, one edge away. This join gathers both, so the picker keeps working either way.
const startedMs = (r: RunRecord): number => {
  const t = typeof r.startedAt === 'number' ? r.startedAt : Date.parse(String(r.startedAt ?? ''));
  return Number.isNaN(t) ? 0 : t;
};

// The runs to replay over one workflow: its own inline runs (if any) plus every referencing
// pipeline's, deduped by authoring entity, namespaced so ids stay unique, and merged newest-first.
function runsForWorkflow(wfId: string): { runs: RunRecord[]; runsTotal: number } {
  const seen = new Set<string>();
  const sources: { id: string; title: string }[] = [];
  const add = (id: string, title: string) => {
    if (contractRuns[id] && !seen.has(id)) {
      seen.add(id);
      sources.push({ id, title });
    }
  };
  add(wfId, contractWorkflows[wfId]?.title ?? wfId); // (1) inline runs on the workflow itself
  for (const e of relatedEdges(wfId)) {
    // (2) pipelines that reference this workflow — the instances that actually ran it
    if (e.dir === 'in' && e.rel === 'references' && e.other.kind === 'pipeline') {
      add(e.other.id, e.other.title);
    }
  }

  // Attribute labels with the source title only when >1 instance feeds this workflow, so the common
  // 1:1 case reads cleanly; ids are always namespaced because separate sources can collide on `run-1`.
  const attribute = sources.length > 1;
  const merged: RunRecord[] = [];
  let runsTotal = 0;
  for (const src of sources) {
    const er = contractRuns[src.id];
    runsTotal += er.total ?? 0;
    for (const r of er.runs ?? []) {
      merged.push({
        ...r,
        id: `${src.id}/${r.id ?? ''}`,
        label: attribute ? `${src.title} · ${r.label ?? r.id ?? ''}` : r.label,
      });
    }
  }
  merged.sort((a, b) => startedMs(b) - startedMs(a)); // newest-first across instances; ties keep order
  return { runs: merged, runsTotal };
}

// Everything the Processes tab can show: every entity that declared a `## Workflow` block,
// standalone `workflow` entities first. Each workflow's runs are joined from itself + the
// pipelines that follow it (see runsForWorkflow) — read off `.runs`/`.runsTotal` unchanged.
export const WORKFLOWS: WorkflowOption[] = Object.entries(contractWorkflows)
  .map(([id, contract]) => {
    const { runs, runsTotal } = runsForWorkflow(id);
    return {
      id,
      label: contract.title ?? id,
      source: WORKFLOW_KIND_IDS.has(id) ? ('workflow' as const) : ('inline' as const),
      contract,
      runs,
      runsTotal,
    };
  })
  .sort((a, b) => (a.source === b.source ? 0 : a.source === 'workflow' ? -1 : 1));

// ── Processes side-nav tree ──────────────────────────────────────────────────────────────
// Node id scheme (entity ids are bare kebab slugs — never contain `/` — so `/` is a safe
// separator; resolveTreeSel mis-splits if that ever changes):
//   root           <wfId>                      the workflow's own console
//   callee link    <rootId>/<calleeId>         a composite's call-site → the callee's console
//   pipeline leaf  <rootId>/pipeline:<plId>    the root's console + that pipeline's latest run

/** A Processes-tab tree selection, resolved: which workflow the console shows, and (for a
 *  pipeline leaf) which pipeline's runs to preselect from. */
export interface WorkflowTreeSel {
  wfId: string;
  pipelineId?: string;
}

const PIPELINE_MARK = 'pipeline:';

/** Tree node id → console target (see the id scheme above). */
export function resolveTreeSel(sel: string): WorkflowTreeSel {
  const slash = sel.indexOf('/');
  if (slash === -1) return { wfId: sel };
  const rest = sel.slice(slash + 1);
  if (rest.startsWith(PIPELINE_MARK)) {
    return { wfId: sel.slice(0, slash), pipelineId: rest.slice(PIPELINE_MARK.length) };
  }
  return { wfId: rest }; // a callee link — the console shows the callee itself
}

// Explorer-style count baked into the label (FolderTree has no counts slot).
const withCount = (title: string, n: number): string => (n > 0 ? `${title} (${n})` : title);

// Deduped callee workflow ids from a composite's steps (refs with kind === 'workflow'), in
// first-seen order. Self-refs are dropped (seen seeded with wfId) and so are targets missing
// from the contract — a dangling id would resolve to a console fallback and mislead.
function calleeIdsOf(wfId: string, contract: WorkflowContract): string[] {
  const seen = new Set<string>([wfId]);
  const out: string[] = [];
  for (const step of contract.steps) {
    for (const ref of step.refs ?? []) {
      if (ref.kind === 'workflow' && !seen.has(ref.target) && contractWorkflows[ref.target]) {
        seen.add(ref.target);
        out.push(ref.target);
      }
    }
  }
  return out;
}

// Deduped pipelines that reference this workflow — the same inbound-edge walk runsForWorkflow does.
function pipelinesOf(wfId: string): { id: string; title: string }[] {
  const seen = new Set<string>();
  const out: { id: string; title: string }[] = [];
  for (const e of relatedEdges(wfId)) {
    if (e.dir === 'in' && e.rel === 'references' && e.other.kind === 'pipeline' && !seen.has(e.other.id)) {
      seen.add(e.other.id);
      out.push({ id: e.other.id, title: e.other.title });
    }
  }
  return out;
}

// ── Process groups ───────────────────────────────────────────────────────────────────────
// The side-nav sorts every process into one of three groups. The contract carries no category
// field (workflow nodes emit only id/kind/title/status) and render-hub is vendored, so the rule
// lives here — derived from what the contract DOES carry:
//   · Scheduled   — flows that run on a cadence. No contract signal yet, so declared by id in
//                   SCHEDULED_IDS (empty today — add ids as flows gain a schedule).
//   · Specialized — composite flows that call other workflows. Derived from callee refs — the
//                   same signal that gives them callee children.
//   · Core flows  — general-purpose, single-flow processes. The default bucket.
const SCHEDULED_IDS = new Set<string>([]); // add workflow ids here as they gain a schedule

type ProcessGroup = 'scheduled' | 'core' | 'specialized';

/** Group-container node ids are marked so callers can tell them apart from workflow ids — a click
 *  on a group toggles its expansion but must NOT be resolved to a console (isGroupId → skip). */
export const isGroupId = (id: string): boolean => id.startsWith('group:');

// Order + labels as listed in the design: Scheduled, Core flows, Specialized.
const GROUP_META: { key: ProcessGroup; id: string; label: string }[] = [
  { key: 'scheduled', id: 'group:scheduled', label: 'Scheduled' },
  { key: 'core', id: 'group:core', label: 'Core flows' },
  { key: 'specialized', id: 'group:specialized', label: 'Specialized' },
];

// One workflow → its root node (callee links + pipeline leaves as children) and its group.
// A pipeline carrying its own inline `## Workflow` legitimately appears both as a root (its
// swimlane) and as a leaf under the workflow it follows — ids stay unique either way.
function buildWorkflowNode(w: WorkflowOption): { node: FolderNode; group: ProcessGroup } {
  const callees = calleeIdsOf(w.id, w.contract);
  const calleeNodes: FolderNode[] = callees.map((calleeId) => ({
    id: `${w.id}/${calleeId}`,
    label: contractWorkflows[calleeId]?.title ?? calleeId,
    kind: 'file',
  }));
  const pipelineNodes: FolderNode[] = pipelinesOf(w.id).map((p) => ({
    id: `${w.id}/${PIPELINE_MARK}${p.id}`,
    label: withCount(p.title, contractRuns[p.id]?.total ?? 0),
    kind: 'file',
  }));
  const children = [...calleeNodes, ...pipelineNodes];
  const group: ProcessGroup = SCHEDULED_IDS.has(w.id)
    ? 'scheduled'
    : callees.length
      ? 'specialized' // a composite (it calls other workflows) — the "specialized" bucket
      : 'core';
  return {
    // Childless leaves render as files (no dead chevron); containers (callees/pipelines) as folders.
    node: {
      id: w.id,
      label: withCount(w.label, w.runsTotal),
      kind: children.length ? 'folder' : 'file',
      children: children.length ? children : undefined,
    },
    group,
  };
}

/** The Processes side-nav forest: three group folders (Scheduled · Core flows · Specialized),
 *  each holding its workflow roots. A composite root expands to its callee links (decision 0004
 *  call edges) + the pipelines that follow it; an empty group shows a disabled placeholder. */
export const WORKFLOW_TREE: FolderNode[] = (() => {
  const built = WORKFLOWS.map(buildWorkflowNode);
  return GROUP_META.map((g) => {
    const members = built.filter((b) => b.group === g.key).map((b) => b.node);
    return {
      id: g.id,
      label: `${g.label} (${members.length})`,
      kind: 'folder',
      children: members.length
        ? members
        : [{ id: `${g.id}/empty`, label: 'None yet', kind: 'file', disabled: true }],
    };
  });
})();

/** Ids to expand by default — every folder that actually has children (the groups plus any
 *  composite/instance roots), so the forest opens down to its workflows on first paint. */
export const WORKFLOW_TREE_EXPANDED: string[] = (function collect(nodes: FolderNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.children?.length && n.id) {
      out.push(n.id);
      out.push(...collect(n.children));
    }
  }
  return out;
})(WORKFLOW_TREE);
