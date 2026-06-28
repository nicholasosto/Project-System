// The authored half of the Command Center's Field Guide tree (the derived half is built from
// `ctx` in tools/render-hub.mjs:buildGuide). This module describes the framework's OWN anatomy —
// the vendored core (schema/ · lib/ · tools/), the two hooks, and the three primitives — which is
// IDENTICAL for every consuming project. So it lives as a static, zero-dependency data constant,
// the same register as FACET_DEFAULTS in render-hub.mjs: framework/platform vocabulary only,
// never a project's kinds/folders/statuses. (The one quarantined domain word in the framework
// stays KIT_HEX_SLOTS in render-hub.mjs — nothing here names a domain.)
//
// Shape of every node: { id, label, path?, nodeType, origin, brief, facts?, children? }
//   nodeType ∈ root | folder | file | kind-folder | kind-file | concept
//   origin   ∈ authored | derived       (these nodes are all `authored`)
//   facts    = [{ label, value: string | string[] }]
//
// Keep this in step with the files it names: it ships and versions WITH the core it describes, so
// renaming an engine here is part of renaming the engine.

export const GUIDE_ANATOMY = {
  // Prose for the derived nodes buildGuide assembles (kept here so all Field-Guide copy lives in
  // one place; the facts on these nodes are derived from ctx, the prose is universal).
  rootBrief:
    "A first-principles, project-agnostic framework for the planning layer of any project. One " +
    "contract — ProjectEntity — that every planning artifact derives from, plus the zero-dependency " +
    "tooling that validates, scaffolds, guards, and renders it. This guide is itself derived from the " +
    "contract: the framework anatomy below is authored, the _project/ surface and conventions are " +
    "generated live from this project's config, so the guide can't drift from reality.",

  projectBrief:
    "The project's planning surface — every file here is exactly one ProjectEntity. There is one " +
    "subfolder per declared kind, and the subtree below is generated from THIS project's " +
    "project-system.config.json, so it reflects exactly the kinds, folders, naming schemes, and " +
    "status enums this project declares. kind is derived from the folder; id from the filename; the " +
    "authored surface of a file is just title · status · updated (+ optional links · tags).",

  primitivesBrief:
    "Everything reduces to three primitives — Identity (kind · id · title) · State (status · updated) " +
    "· Relation (links[]). kind and id are loader-derived from the file's path; the rest is the " +
    "authored frontmatter. Everything else a file might carry is an optional `tags` facet. A good " +
    "reduction deletes fields; this one dropped many per-kind interfaces to one shape.",

  relsBrief:
    "The universal vocabulary for the typed edges between entities (links[].rel), defined once in the " +
    "base schema and shared by every project. WHICH kinds each rel may point at is this project's " +
    "config (relTargetKinds) — the facts below are that resolution. A link target is a " +
    "`<folder>/<id>` path, a milestone marker, or an external ref.",

  // The vendored framework core — byte-identical across every consumer.
  coreNode: {
    id: "core",
    label: ".project-system/ — the vendored core",
    path: null,
    nodeType: "concept",
    origin: "authored",
    brief:
      "How a consuming project carries the framework: vendor schema/ + lib/ + tools/ verbatim into a " +
      "reserved .project-system/ at the project root, and never edit or rename a file inside it — " +
      "updating means re-copying the folder. The only project-specific file an adopter writes is " +
      "project-system.config.json at the root. This core is universal: identical in every project.",
    children: [
      {
        id: "core/schema",
        label: "schema/",
        path: "schema",
        nodeType: "folder",
        origin: "authored",
        brief:
          "The contract layer — machine-readable JSON Schema. Holds the universal base contract every " +
          "consumer mirrors, and the meta-schema that validates a project's config.",
        children: [
          {
            id: "core/schema/base",
            label: "project-entity.base.schema.json",
            path: "schema/project-entity.base.schema.json",
            nodeType: "file",
            origin: "authored",
            brief:
              "The universal contract: the three primitives plus the link/rel definitions. Identical " +
              "across every consuming project — the artifact a consumer mirrors, and what the drift " +
              "check compares against.",
            facts: [
              { label: "primitives", value: ["Identity (kind · id · title)", "State (status · updated)", "Relation (links[])"] },
              { label: "required", value: ["kind", "id", "title", "status", "updated"] },
              { label: "rel vocabulary", value: ["supersedes", "superseded-by", "predecessor", "successor", "milestone", "implements", "decided-in", "references"] },
            ],
          },
          {
            id: "core/schema/config",
            label: "project-config.schema.json",
            path: "schema/project-config.schema.json",
            nodeType: "file",
            origin: "authored",
            brief:
              "The meta-schema: validates a project's project-system.config.json. The only " +
              "project-specific file an adopter authors is checked against this.",
          },
        ],
      },
      {
        id: "core/lib",
        label: "lib/",
        path: "lib",
        nodeType: "folder",
        origin: "authored",
        brief:
          "The shared library every engine reads through — a zero-dependency parser plus the seam that " +
          "composes the base schema with a project's config. Single source: no tool re-implements either.",
        children: [
          {
            id: "core/lib/md",
            label: "md.mjs",
            path: "lib/md.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "Zero-dependency frontmatter/markdown parser — the single source all tools read frontmatter " +
              "and body sections through, so they can never drift on what a file says.",
          },
          {
            id: "core/lib/contract",
            label: "contract.mjs",
            path: "lib/contract.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "The seam between the project-agnostic engines and a project's specifics. loadContract() " +
              "composes base schema + config into the runtime `ctx` every engine consumes; " +
              "loadEntities() reads the _project/ tree, deriving kind from the folder and id from the filename.",
          },
        ],
      },
      {
        id: "core/tools",
        label: "tools/",
        path: "tools",
        nodeType: "folder",
        origin: "authored",
        brief:
          "The zero-dependency engines, all reading the one contract via lib/contract.mjs — no check is " +
          "re-implemented in a second place. The validator is the single check the others reuse.",
        children: [
          {
            id: "core/tools/validate",
            label: "validate.mjs",
            path: "tools/validate.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "The validator + validateEntity — the single check (per-kind enums, link resolution, " +
              "prose ↔ frontmatter) that the scaffolder, guard, and renderer all reuse.",
          },
          {
            id: "core/tools/new-entity",
            label: "new-entity.mjs",
            path: "tools/new-entity.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "The scaffolder behind the single /new <kind> command. Validates the kind against your " +
              "config and writes valid frontmatter + the kind's scaffold sections, so there are no " +
              "per-kind commands to hand-maintain.",
          },
          {
            id: "core/tools/guard",
            label: "guard.mjs",
            path: "tools/guard.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "The PreToolUse guard — the only hook that can block. Rejects any _project/ write that would " +
              "break the contract (exit 2 + reason); read-only and fails open.",
          },
          {
            id: "core/tools/render-hub",
            label: "render-hub.mjs",
            path: "tools/render-hub.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "The renderer. Projects the validated entity graph into the two JSON contracts the Command " +
              "Center consumes (graph.json + hub.json) — including this very guide. Domain-neutral end to end.",
          },
          {
            id: "core/tools/check-consumer-drift",
            label: "check-consumer-drift.mjs",
            path: "tools/check-consumer-drift.mjs",
            nodeType: "file",
            origin: "authored",
            brief:
              "The packaging discipline: asserts each consumer mirrors the canonical contract (schema, " +
              "validator behavior, and hook parity). The gate that keeps the un-published mirror honest.",
          },
        ],
      },
      {
        id: "core/hooks",
        label: "the two hooks",
        path: ".claude/settings.json",
        nodeType: "concept",
        origin: "authored",
        brief:
          "The contract is enforced by exactly two Claude Code hooks: a BLOCKING PreToolUse(Write|Edit) " +
          "guard (tools/guard.mjs — the only hook that can block; exit 2 + reason, read-only, fails open) " +
          "and an ADVISORY SessionStart health summary (validate.mjs --summary, always exit 0). Rendering " +
          "is NOT a hook — it's the Command Center's Vite dev plugin. Consumers vendor these verbatim.",
        facts: [
          { label: "blocking", value: "PreToolUse(Write|Edit) → guard.mjs" },
          { label: "advisory", value: "SessionStart → validate.mjs --summary" },
        ],
      },
    ],
  },
};
