// A C4-style system map of the Project-System framework, for the Overview panel's <SystemMap>.
//
// This is AUTHORED architecture data — the same register as tools/guide-anatomy.mjs (the Field
// Guide's framework-anatomy nodes): it describes the framework's OWN, universal structure
// (schema/ · lib/ · tools/ · the two hooks · the Command Center) and the data-flow between them.
// It names framework/platform files only — never a project's kinds/folders/statuses.
//
// Keep it in step with the files it names (like guide-anatomy.mjs, it versions with the core).
// If this ever needs to be per-consumer or drift-proof, the on-ethos upgrade is to EMIT it from
// render-hub.mjs (derived from guide-anatomy + ctx) rather than author it here — see the Overview
// system-map feature entity.
import type { SystemMapContract } from '@trembus/viz';

export const PROJECT_SYSTEM_MAP: SystemMapContract = {
  view: 'c4',
  brand: 'Project-System',
  code: 'arch.framework',
  title: 'Framework system map',
  caption: 'One contract → the seam → four engines → an emitted contract → the dashboard. Open a container (⌕) to drill in; select a node to inspect it.',
  direction: 'TB',
  nodes: [
    // ── context ──
    { id: 'author', label: 'Author / agent', kind: 'actor', sub: 'writes _project/, runs /new' },
    { id: 'framework', label: 'Project-System', kind: 'system', sub: 'the planning-layer framework' },
    { id: 'consumers', label: 'Consuming projects', kind: 'external', sub: 'soul-steel · asset-studio — vendor .project-system/' },

    // ── containers (inside the framework) ──
    { id: 'schema', label: 'schema/', parentId: 'framework', kind: 'container', sub: 'the contract' },
    { id: 'lib', label: 'lib/', parentId: 'framework', kind: 'container', sub: 'the seam' },
    { id: 'tools', label: 'tools/', parentId: 'framework', kind: 'container', sub: 'the engines' },
    { id: 'hooks', label: 'the two hooks', parentId: 'framework', kind: 'container', sub: 'Claude Code' },
    { id: 'cc', label: 'apps/command-center', parentId: 'framework', kind: 'container', sub: 'React dashboard' },
    { id: 'config', label: 'project-system.config.json', parentId: 'framework', kind: 'datastore', sub: 'the one authored file' },
    { id: 'project', label: '_project/', parentId: 'framework', kind: 'datastore', sub: 'planning entities' },
    { id: 'emitted', label: 'previews/dashboards/', parentId: 'framework', kind: 'datastore', sub: 'graph.json · hub.json' },

    // ── components: schema/ ──
    { id: 's-base', label: 'project-entity.base.schema.json', parentId: 'schema', kind: 'component', note: 'The universal contract — the three primitives (Identity · State · Relation).' },
    { id: 's-config', label: 'project-config.schema.json', parentId: 'schema', kind: 'component', note: 'Meta-schema: validates a project’s project-system.config.json.' },

    // ── components: lib/ ──
    { id: 'l-md', label: 'md.mjs', parentId: 'lib', kind: 'component', note: 'Zero-dep frontmatter/markdown parser — the single source for all tools.' },
    { id: 'l-contract', label: 'contract.mjs', parentId: 'lib', kind: 'component', note: 'The seam: loadContract/buildContext composes base + config into ctx, and loads the _project/ tree.' },
    { id: 'l-swim', label: 'swimlane.mjs', parentId: 'lib', kind: 'component', note: 'Validates the ## Workflow swimlane body (lanes × steps, refs).' },

    // ── components: tools/ (the engines) ──
    { id: 't-validate', label: 'validate.mjs', parentId: 'tools', kind: 'component', note: 'validateEntity — the single check, reused by every other engine.' },
    { id: 't-new', label: 'new-entity.mjs', parentId: 'tools', kind: 'component', note: 'The /new scaffolder — writes born-valid entities.' },
    { id: 't-guard', label: 'guard.mjs', parentId: 'tools', kind: 'component', note: 'PreToolUse guard — blocks any _project/ write that would break the contract. Fails open.' },
    { id: 't-render', label: 'render-hub.mjs', parentId: 'tools', kind: 'component', note: 'Emits graph.json + hub.json (incl. the derived Field Guide + tags).' },
    { id: 't-init', label: 'init-config.mjs', parentId: 'tools', kind: 'component', note: 'Born-valid config generator — proves the config loads before writing.' },
    { id: 't-drift', label: 'check-consumer-drift.mjs', parentId: 'tools', kind: 'component', note: 'Asserts each consumer mirrors the canonical contract.' },

    // ── components: the two hooks ──
    { id: 'h-guard', label: 'PreToolUse(Write|Edit)', parentId: 'hooks', kind: 'component', note: 'Blocking — invokes guard.mjs on every _project/ write.' },
    { id: 'h-summary', label: 'SessionStart', parentId: 'hooks', kind: 'component', note: 'Advisory — validate.mjs --summary; always exit 0.' },
  ],
  ports: [
    { id: 'p-ctx', nodeId: 'l-contract', label: '/ctx', direction: 'provided' },
    { id: 'p-graph', nodeId: 't-render', label: '/graph.json', direction: 'provided' },
    { id: 'p-hub', nodeId: 't-render', label: '/hub.json', direction: 'provided' },
  ],
  edges: [
    // authoring
    { from: 'author', to: 't-new', kind: 'uses', label: '/new' },
    { from: 't-new', to: 'project', kind: 'sync', label: 'scaffolds' },
    // the seam composes the contract
    { from: 'config', to: 'l-contract', kind: 'sync', label: 'loaded' },
    { from: 's-base', to: 'l-contract', kind: 'sync', label: 'composed' },
    { from: 'l-md', to: 'l-contract', kind: 'sync', label: 'parses' },
    // ctx feeds every engine (single source)
    { from: 'l-contract', to: 't-validate', kind: 'sync', label: 'ctx' },
    { from: 'l-contract', to: 't-new', kind: 'sync', label: 'ctx' },
    { from: 'l-contract', to: 't-guard', kind: 'sync', label: 'ctx' },
    { from: 'l-contract', to: 't-render', kind: 'sync', label: 'ctx' },
    { from: 'l-swim', to: 't-validate', kind: 'sync', label: 'swimlane' },
    // engines act on the planning tree
    { from: 't-validate', to: 'project', kind: 'data', label: 'checks' },
    { from: 't-guard', to: 'project', kind: 'data', label: 'guards' },
    { from: 'project', to: 't-render', kind: 'data', label: 'read' },
    // hooks invoke engines (async wiring)
    { from: 'h-guard', to: 't-guard', kind: 'async', dashed: true, label: 'on write' },
    { from: 'h-summary', to: 't-validate', kind: 'async', dashed: true, label: 'on start' },
    // emitted contract → dashboard
    { from: 't-render', to: 'emitted', kind: 'data', label: 'emits' },
    { from: 'emitted', to: 'cc', kind: 'sync', label: 'renders' },
    // config generation + the mirror discipline
    { from: 't-init', to: 'config', kind: 'sync', label: 'generates' },
    { from: 's-config', to: 'config', kind: 'sync', dashed: true, label: 'validates' },
    { from: 't-drift', to: 'consumers', kind: 'sync', label: 'mirrors' },
    { from: 'consumers', to: 'framework', kind: 'uses', dashed: true, label: 'vendor' },
  ],
};
