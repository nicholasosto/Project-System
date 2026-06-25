// Established project-system workflows, authored as Swimlane definitions.
//
// Phase 1: hand-authored. The framework's own operating loop — how every _project/ artifact
// is born valid and reaches this dashboard. Steps carry NO status (this is the *definition*;
// a future run would supply per-step outcomes and replay them — see WorkflowConsole).
//
// Phase 2 (planned): derive these from `pipeline` entities so the workflow comes from the
// emitted contract instead of being authored here.
import type { RunRecord, SwimlaneContract } from '@trembus/ui';
import { runs as contractRuns, workflows as contractWorkflows } from './contract';

// The lanes are the three actors in the loop: you (the author), the zero-dep engines
// (scaffolder · guard · validator · renderer), and the live Command Center surface.
export const AUTHORING_LOOP: SwimlaneContract = {
  view: 'swimlane',
  brand: 'Project System',
  code: 'workflow.author-validate-render',
  title: 'Authoring loop',
  caption: 'How every _project/ artifact is born valid and reaches the dashboard.',
  lanes: [
    { id: 'you', label: 'You', kind: 'human' },
    { id: 'engines', label: 'Engines', kind: 'system' },
    { id: 'surface', label: 'Command Center', kind: 'tool' },
  ],
  steps: [
    { id: 'request', lane: 'you', label: 'Run /new-{kind}', to: ['scaffold'] },
    { id: 'scaffold', lane: 'engines', label: 'Scaffold file', detail: 'new-entity.mjs · born valid', to: ['edit'] },
    { id: 'edit', lane: 'you', label: 'Edit title · status · links', to: ['guard'] },
    { id: 'guard', lane: 'engines', label: 'Guard the save', detail: 'PreToolUse · blocks contract breaks', to: ['validate'] },
    { id: 'validate', lane: 'engines', label: 'Validate the graph', detail: 'validate.mjs', to: ['render'] },
    { id: 'render', lane: 'engines', label: 'Emit JSON contract', detail: 'render-hub.mjs · graph + hub', to: ['view'] },
    { id: 'view', lane: 'surface', label: 'Render live', detail: 'this dashboard', to: [] },
  ],
};

export interface WorkflowOption {
  id: string;
  label: string;
  /** Where the definition comes from — the built-in meta loop, or a _project/ entity. */
  source: 'built-in' | 'entity';
  contract: SwimlaneContract;
  /** The latest (windowed) runs to replay over this workflow; empty when none captured. */
  runs: RunRecord[];
  /** Total runs in the source, for an honest "latest N of M" when windowed. */
  runsTotal: number;
}

// Everything the Workflows tab can show: the framework's built-in authoring loop, plus every
// entity that declared a `## Workflow` block in _project/ (Phase 2 — derived from the contract).
// Runs (Phase 3) ride along, keyed by the same entity id; the built-in loop has none.
export const WORKFLOWS: WorkflowOption[] = [
  { id: 'authoring-loop', label: AUTHORING_LOOP.title ?? 'Authoring loop', source: 'built-in', contract: AUTHORING_LOOP, runs: [], runsTotal: 0 },
  ...Object.entries(contractWorkflows).map(([id, contract]) => ({
    id,
    label: contract.title ?? id,
    source: 'entity' as const,
    contract,
    runs: contractRuns[id]?.runs ?? [],
    runsTotal: contractRuns[id]?.total ?? 0,
  })),
];
