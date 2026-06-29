// Workflows the Command Center can replay as Swimlanes — derived entirely from the contract.
//
// Every workflow is data now: a `workflow`-kind entity (e.g. the authoring loop) or any other
// entity that declares a `## Workflow` block (decision 0004 — e.g. a pipeline's build flow).
// render-hub.mjs extracts each into graph.json's `workflows` map; this module just adapts that
// map into the picker's option shape. Nothing is hardcoded here anymore — the framework's own
// authoring loop moved to _project/workflows/authoring-loop.md (decision 0004, fully realized).
import type { RunRecord } from '@trembus/ui';
import { entities, runs as contractRuns, swimlaneKinds, workflows as contractWorkflows } from './contract';
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

// Everything the Workflows tab can show: every entity that declared a `## Workflow` block,
// standalone `workflow` entities first. Runs (Phase 3) ride along, keyed by the same entity id.
export const WORKFLOWS: WorkflowOption[] = Object.entries(contractWorkflows)
  .map(([id, contract]) => ({
    id,
    label: contract.title ?? id,
    source: WORKFLOW_KIND_IDS.has(id) ? ('workflow' as const) : ('inline' as const),
    contract,
    runs: contractRuns[id]?.runs ?? [],
    runsTotal: contractRuns[id]?.total ?? 0,
  }))
  .sort((a, b) => (a.source === b.source ? 0 : a.source === 'workflow' ? -1 : 1));
