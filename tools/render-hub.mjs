#!/usr/bin/env node
// Project a validated ProjectEntity graph into the two JSON contracts the Command Center
// consumes — model-driven, so the dashboard derives from the contract instead of being
// hand-rolled. Counts / statuses / edges come from the entities; the editorial framing
// comes from the project's config.render. Domain-neutral end to end.
//
//   source-of-truth (the project's _project/ entities) -> contract (graph.json + hub.json)
//
// The live React Command Center (apps/command-center) renders these. The old static
// single-file HTML — built via the external visual-grammar kit — was retired once the live
// hub superseded it (roadmap command-center P5), so this tool no longer shells out to a kit.
//
// Usage:
//   node tools/render-hub.mjs [--root <dir>] [--config <path>]   # emit graph + hub JSON
//   node tools/render-hub.mjs --check                            # assert outputs are in sync (date-insensitive)
//
// `--no-render` is accepted but ignored — a no-op kept for back-compat (JSON emit is the only mode now).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadContract, loadEntities } from "../lib/contract.mjs";
import { fencedJson } from "../lib/swimlane.mjs";
import { listMarkdown, parseFrontmatter, stripMarkdown } from "../lib/md.mjs";
import { validateEntity } from "./validate.mjs";
import { GUIDE_ANATOMY } from "./guide-anatomy.mjs";

// ── KIT ADAPTER (quarantined) ────────────────────────────────────────────────
// The visual-grammar kit's hub view hard-codes its 7 hex-slot names after Soul-Steel's
// domains (hub/robot/blood/decay/spirit/fate/shared) for historical reasons. The
// framework is domain-neutral: it auto-places the center + up to 6 petals into these
// opaque slots in declared order. THIS CONSTANT IS THE ONLY PLACE IN THE FRAMEWORK THAT
// NAMES THE KIT'S LEGACY SLOTS — nothing upstream (config, schema, contract, docs) sees
// them. If the kit ever gains neutral slot ids, this is the single line to update.
const KIT_HEX_SLOTS = { center: "hub", petals: ["robot", "blood", "decay", "spirit", "fate", "shared"] };
const MAX_PETALS = KIT_HEX_SLOTS.petals.length;

// Neutral default accent palette (NOT domain colors); used when a kind sets no render.dot.
const DEFAULT_DOTS = ["#44DDFF", "#D4AF37", "#7BD88F", "#B884FF", "#FF9F45", "#6BC9FF"];

// Resolve a kind's accent dot — its config render.dot, else a stable palette slot by declared
// index. SINGLE source for both the hub petal dot and the derived per-kind tone, so the two
// can never disagree.
function dotForKind(ctx, kind, declaredIdx) {
  return ctx.renderMeta?.[kind]?.dot ?? DEFAULT_DOTS[declaredIdx % DEFAULT_DOTS.length];
}

// Map an accent hex to a Trembus status-tone for the app's per-kind lineage coloring. `danger`
// is reserved for error states and is NEVER auto-assigned. The table covers the default palette
// so a kind with no render.dot still gets a sensible tone; an unknown hex rotates deterministically.
const HEX_TONE = {
  "#44ddff": "info",
  "#7bd88f": "success",
  "#43aa8b": "success",
  "#b884ff": "accent",
  "#6bc9ff": "neutral",
  "#d4af37": "warning",
  "#ff9f45": "warning",
};
const TONE_ROTATION = ["info", "success", "accent", "warning", "neutral"];

// A kind's tone: an explicit config render.tone wins; else derived from its accent dot.
function toneForKind(ctx, kind, declaredIdx) {
  const explicit = ctx.renderMeta?.[kind]?.tone;
  if (explicit) return explicit;
  return HEX_TONE[String(dotForKind(ctx, kind, declaredIdx)).toLowerCase()] ?? TONE_ROTATION[declaredIdx % TONE_ROTATION.length];
}

// Statuses that read as "in flight" (tile shows `current` rather than `shipped`).
const DEFAULT_IN_FLIGHT = new Set(["proposed", "draft", "design", "qualify", "build", "active", "planned", "blocked"]);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusSummary(byStatus) {
  const entries = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
  if (entries.length === 1) return `all ${entries[0][0]}`;
  return entries.map(([s, n]) => `${n} ${s}`).join(" · ");
}

// `fencedJson` (the ONE fenced-```json reader) now lives in lib/swimlane.mjs, alongside the
// swimlane structural validator. The Workflow block is parsed once at load (entity.workflow);
// the Runs and Phases facets below still read their blocks here via the shared fencedJson.

// A run-history log: an array of run records. Sorted newest-first and WINDOWED to the latest
// `window` so the emitted contract stays bounded even as the authored log grows to hundreds;
// `total` + `rollup` summarize the full set. Past the window, move the source to a sidecar —
// only this function (and the `window`) change, never the renderers.
function extractRuns(sectionText, window) {
  const block = fencedJson(sectionText);
  if (!block || block.error) return block;
  const all = block.value;
  if (!Array.isArray(all)) return { error: "needs an array of run records" };
  const startedMs = (r) => {
    const t = typeof r?.startedAt === "number" ? r.startedAt : Date.parse(r?.startedAt ?? "");
    return Number.isNaN(t) ? 0 : t;
  };
  const sorted = [...all].sort((a, b) => startedMs(b) - startedMs(a));
  const byStatus = {};
  for (const r of all) {
    const s = r?.status ?? "—";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  return { runs: { total: all.length, rollup: { byStatus }, runs: sorted.slice(0, window) } };
}

// A development-phase list: an array of phase records. Domain-neutral — like extractWorkflow,
// the engine invents no phase semantics; it passes a `[{ … }]` block straight through. The
// Command Center renders it as a progress Timeline. Authored shape is open; a typical record is
// `{ id?, label, status?, detail? }`.
function extractPhases(sectionText) {
  const block = fencedJson(sectionText);
  if (!block || block.error) return block;
  if (!Array.isArray(block.value)) return { error: "needs an array of phase records" };
  return { phases: block.value };
}

// ── CONTROL-SURFACE FACETS (Claude Code universals) ──────────────────────────
// A hex petal is normally an entity KIND (the domain-neutral default — one petal per kind).
// It can instead surface the project's Claude Code *control surface* — the slash commands,
// hooks, and workflows that operate the planning loop. These are platform concepts every
// consuming project has (the same register as the engines the Triad names), so they stay
// domain-neutral: nothing here is a project/domain word. Each reader returns { count,
// entries[] }; the editorial copy comes from FACET_DEFAULTS, overridable per project via
// config.render.hex.facets.<id>.

// Slash commands: .claude/commands/*.md — syntax from the filename + argument-hint, gloss
// from the frontmatter description. Reuses the single-source md parser (no second reader).
function readCommandsFacet(ctx) {
  const dir = join(ctx.projectRoot, ".claude", "commands");
  const entries = listMarkdown(dir).map((path) => {
    const { data } = parseFrontmatter(readFileSync(path, "utf8"));
    const name = path.split(/[/\\]/).pop().replace(/\.md$/, "");
    const hint = data["argument-hint"] ? ` ${data["argument-hint"]}` : "";
    return { text: `/${name}${hint}`, desc: data.description ?? "" };
  });
  return { count: entries.length, entries };
}

// Hooks: the PreToolUse / PostToolUse / … wiring in .claude/settings.json. Flattened to one
// entry per command, labelled by event + matcher, with the command (env-var + quotes
// stripped) as the gloss.
function readHooksFacet(ctx) {
  const path = join(ctx.projectRoot, ".claude", "settings.json");
  const entries = [];
  if (existsSync(path)) {
    let settings = {};
    try {
      settings = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      settings = {};
    }
    for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
      for (const group of Array.isArray(groups) ? groups : []) {
        for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
          const cmd = String(hook.command ?? "")
            .replace(/\$CLAUDE_PROJECT_DIR\//g, "")
            .replace(/"/g, "")
            .trim();
          entries.push({
            text: `${event}${group.matcher ? ` · ${group.matcher}` : ""}`,
            desc: cmd || hook.type || "",
          });
        }
      }
    }
  }
  return { count: entries.length, entries };
}

// Workflows: the swimlane definitions the Command Center can replay — the framework's
// built-in authoring loop plus every entity that declared a `## Workflow` block. Mirrors the
// app's WORKFLOWS assembly so the tile count equals what the Workflows tab enumerates. The
// built-in list is overridable via config.render.hex.facets.workflows.builtins.
function readWorkflowsFacet(ctx, model) {
  // The authoring loop now lives as a `workflow` entity (_project/workflows/), so the facet
  // counts purely from entity `## Workflow` blocks — any kind's, per decision 0004 — with no
  // hardcoded built-in. A project may still inject extra built-ins via config if it wants.
  const builtins = ctx.render?.hex?.facets?.workflows?.builtins ?? [];
  const entityWfs = Object.entries(model.workflows ?? {}).map(([id, w]) => ({
    text: w.title ?? id,
    desc: `entity · ${id}`,
    status: "entity",
  }));
  const entries = [...builtins.map((b) => ({ status: "built-in", ...b })), ...entityWfs];
  return { count: entries.length, entries };
}

// Field Guide: the framework & naming reference. The tile is a summary — one row per _project/
// kind folder (derived from config) plus the three core anchors — that previews what the full
// guide tree (built by buildGuide, emitted into graph.json) holds. Domain-neutral: every kind row
// comes from ctx, no kind/folder/status literal here.
function readGuideFacet(ctx) {
  const entries = ctx.kinds.map((kind) => ({
    text: `_project/${ctx.folderByKind[kind]}/`,
    desc: `kind "${kind}" · ${schemeLabel(ctx.filenameScheme[kind])} · status: ${[...ctx.statusEnums[kind]].join(" · ")}`,
    status: "kind",
  }));
  entries.push(
    { text: "schema/", desc: "the universal contract + the config meta-schema", status: "core" },
    { text: "lib/", desc: "the md parser + the contract seam (loadContract)", status: "core" },
    { text: "tools/", desc: "validator · scaffolder · guard · renderer", status: "core" },
  );
  return { count: ctx.kinds.length, entries };
}

const FACET_READERS = { commands: readCommandsFacet, hooks: readHooksFacet, workflows: readWorkflowsFacet, guide: readGuideFacet };

// Neutral editorial defaults per facet; a project overrides any field via
// config.render.hex.facets.<id>. dot colors echo the tiles these typically replace.
const FACET_DEFAULTS = {
  commands: {
    tag: "Control surface",
    name: "Commands",
    sub: "slash commands",
    dot: "#5a6478",
    note: "The project's slash commands (.claude/commands/) — the unified /new <kind> scaffolder + friends. Each writes valid frontmatter and self-validates. The syntax + a one-line gloss of every command is listed here.",
    sources: [".claude/commands/"],
  },
  workflows: {
    tag: "Control surface",
    name: "Workflows",
    sub: "swimlane definitions",
    dot: "#B884FF",
    note: "Operating workflows the Command Center replays as swimlanes — the framework's built-in authoring loop plus any entity that declares a ## Workflow block.",
    sources: ["apps/command-center/src/workflows.ts", "_project/ (## Workflow blocks)"],
  },
  hooks: {
    tag: "Control surface",
    name: "Hooks",
    sub: "guard + session summary",
    dot: "#FF9F45",
    note: "Claude Code hooks wired for this project (.claude/settings.json): a blocking PreToolUse(Write|Edit) guard that rejects any _project/ write breaking the contract — enforcement at save time — and an advisory SessionStart summary (validate.mjs --summary) that surfaces the planning surface's health when a session opens. Rendering is not a hook; it's the Command Center's Vite dev plugin.",
    sources: [".claude/settings.json"],
  },
  guide: {
    tag: "Reference",
    name: "Field Guide",
    sub: "framework & naming guide",
    dot: "#6BC9FF",
    note: "A self-serve map of how this planning system is structured and named: the framework anatomy (schema/ · lib/ · tools/ · the two hooks · the vendored core), the three primitives, and the relation vocabulary — plus, derived live from this project's config, one folder per entity kind with its filename scheme, status enum, and conventional sections. Open the Field Guide tab for the full expandable tree.",
    sources: ["schema/project-entity.base.schema.json", "tools/guide-anatomy.mjs", "project-system.config.json"],
  },
};

// ── FIELD GUIDE (the Command Center's framework & naming reference) ───────────
// A tree the UI renders as an expandable folder explorer. The framework anatomy is AUTHORED
// (guide-anatomy.mjs) and identical for every consumer; the _project/ surface and the
// rel/primitive concepts are DERIVED from ctx, so adding a kind to a config makes it appear here
// automatically — the guide can't drift. Node shape:
//   { id, label, path?, nodeType, origin, brief, facts?: [{label,value}], children? }

// A human label for a kind's filename scheme.
function schemeLabel(fs) {
  if (fs?.scheme === "serial") return `serial · ${fs.pad ?? 4}-digit`;
  if (fs?.scheme === "date-slug") return "date-slug · <date>-<slug>";
  return "slug";
}

// A representative filename synthesized from the scheme (not a live entity) — the example leaf.
function exampleName(fs) {
  if (fs?.scheme === "serial") return `${"0".repeat(Math.max(0, (fs.pad ?? 4) - 1))}1-example-title.md`;
  if (fs?.scheme === "date-slug") return `${todayISO()}-example-title.md`;
  return "example-title.md";
}

// One kind-folder node, fully derived from ctx — no kind/folder/status literal appears in code.
function kindFolderNode(ctx, kind) {
  const folder = ctx.folderByKind[kind];
  const fs = ctx.filenameScheme[kind];
  const statuses = [...(ctx.statusEnums[kind] ?? [])];
  const required = ctx.requiredSections[kind] ?? [];
  const scaffold = ctx.scaffoldSections[kind] ?? required;
  const facts = [
    { label: "kind", value: kind },
    { label: "folder", value: `_project/${folder}/` },
    { label: "filename scheme", value: schemeLabel(fs) },
    { label: "status enum", value: statuses },
    { label: "initial status", value: ctx.initialStatus[kind] },
  ];
  if (required.length) facts.push({ label: "required sections", value: required });
  if (scaffold.length) facts.push({ label: "scaffold sections", value: scaffold });
  if (ctx.swimlaneKinds.includes(kind)) facts.push({ label: "carries swimlanes", value: "yes" });
  return {
    id: `project/${kind}`,
    label: `${folder}/`,
    path: `_project/${folder}`,
    nodeType: "kind-folder",
    origin: "derived",
    brief:
      `Holds entities of kind "${kind}". kind is derived from this folder, id from each filename. ` +
      `Files are named by the ${schemeLabel(fs)} scheme; a freshly scaffolded file is born ` +
      `"${ctx.initialStatus[kind]}" and its status ranges over the per-kind enum below.`,
    facts,
    children: [
      {
        id: `project/${kind}/example`,
        label: exampleName(fs),
        path: null,
        nodeType: "kind-file",
        origin: "derived",
        brief:
          `A representative filename for a ${kind} (synthesized from the ${schemeLabel(fs)} scheme) — ` +
          `not a live entity. The filename stem becomes the entity id.`,
      },
    ],
  };
}

function deriveProjectSubtree(ctx) {
  return {
    id: "project",
    label: "_project/ — planning surface",
    path: "_project",
    nodeType: "folder",
    origin: "derived",
    brief: GUIDE_ANATOMY.projectBrief,
    children: ctx.kinds.map((k) => kindFolderNode(ctx, k)),
  };
}

function derivePrimitivesNode(ctx) {
  return {
    id: "concept/primitives",
    label: "The three primitives",
    path: null,
    nodeType: "concept",
    origin: "derived",
    brief: GUIDE_ANATOMY.primitivesBrief,
    facts: [
      { label: "authored", value: [...ctx.authoredFields] },
      { label: "derived", value: [...ctx.derivedFields] },
    ],
  };
}

// rel target rule → a readable arrow. Array → list of kinds; "marker"/"external"/"any" pass through.
function relTargetLabel(v) {
  return Array.isArray(v) ? `→ ${v.join(" · ")}` : `→ ${v}`;
}

function deriveRelsNode(ctx) {
  return {
    id: "concept/rels",
    label: "Relation vocabulary",
    path: null,
    nodeType: "concept",
    origin: "derived",
    brief: GUIDE_ANATOMY.relsBrief,
    facts: [...ctx.relEnum].map((rel) => ({ label: rel, value: relTargetLabel(ctx.relTargetKinds[rel] ?? "any") })),
  };
}

// The whole guide: authored framework anatomy + the derived planning surface + derived concepts.
export function buildGuide(ctx) {
  return {
    generatedBy: "tools/render-hub.mjs:buildGuide",
    version: 1,
    root: {
      id: "root",
      label: cap(ctx.project),
      path: ".",
      nodeType: "root",
      origin: "authored",
      brief: GUIDE_ANATOMY.rootBrief,
      children: [GUIDE_ANATOMY.coreNode, deriveProjectSubtree(ctx), derivePrimitivesNode(ctx), deriveRelsNode(ctx)],
    },
  };
}

// First-paragraph excerpt of an entity's body — the first non-empty paragraph of its first `## `
// section, markdown-stripped and length-bounded. Domain-neutral: "first section" is whatever the
// kind's body leads with (a decision's Context, a feature's Summary, a roadmap's Context…). Lets a
// view show a one-line gist without re-reading _project/. Empty body → omitted (back-compatible).
const EXCERPT_MAX = 220;
function excerptFor(entity) {
  const sections = entity?.sections;
  if (!sections || typeof sections !== "object") return null;
  const first = Object.values(sections).find((v) => typeof v === "string" && v.trim());
  if (!first) return null;
  // First paragraph = up to the first blank line; drop a per-line blockquote marker (`> `).
  const para = first.trim().split(/\n\s*\n/)[0].replace(/^>\s?/gm, "");
  const text = stripMarkdown(para);
  if (!text) return null;
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : text;
}

export function buildModel(ctx) {
  const entities = loadEntities(ctx);
  const issues = entities.flatMap((e) => validateEntity(e, ctx));
  const counts = {
    error: issues.filter((i) => i.severity === "error").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
  const migrated = entities.filter((e) => e.hasFrontmatter).length;

  const byKind = {};
  // `tone` is derived per kind (from its accent dot) so the app needs no hardcoded kind→tone map.
  // `statusOrder` is the kind's *declared* status enum (config order) — lets a consumer categorize
  // entities the config way instead of by first-seen. Domain-neutral: it's whatever the config lists.
  ctx.kinds.forEach((kind, i) => {
    byKind[kind] = {
      total: 0,
      byStatus: {},
      ids: [],
      tone: toneForKind(ctx, kind, i),
      statusOrder: [...(ctx.statusEnums[kind] ?? [])],
    };
  });
  for (const e of entities) {
    const b = (byKind[e.kind] ??= { total: 0, byStatus: {}, ids: [], statusOrder: [] });
    b.total += 1;
    b.ids.push(e.id);
    const st = e.fm?.status ?? "—";
    b.byStatus[st] = (b.byStatus[st] ?? 0) + 1;
  }

  const edges = [];
  for (const e of entities) {
    for (const l of Array.isArray(e.fm?.links) ? e.fm.links : []) {
      if (l && l.rel && l.target) edges.push({ from: e.id, fromKind: e.kind, rel: l.rel, target: l.target });
    }
  }
  const edgesByRel = {};
  for (const ed of edges) edgesByRel[ed.rel] = (edgesByRel[ed.rel] ?? 0) + 1;

  // Flat per-entity records — the navigable surface (title/status/updated/file) that the
  // aggregate `byKind` buckets can't express. Authored fields only; kind & id stay derived.
  // `tags` is the entity's tag map (omitted when none) — lets a view filter/group by a facet
  // (e.g. a roadmap by tags.tier) without re-reading _project/.
  const nodes = entities.map((e) => {
    const node = {
      id: e.id,
      kind: e.kind,
      title: e.fm?.title ?? null,
      status: e.fm?.status ?? null,
      updated: e.fm?.updated ?? null,
      file: e.file,
    };
    if (e.fm?.tags && typeof e.fm.tags === "object" && Object.keys(e.fm.tags).length) node.tags = e.fm.tags;
    const excerpt = excerptFor(e);
    if (excerpt) node.excerpt = excerpt;
    return node;
  });

  // Optional structured workflows: any entity may declare a swimlane in a `## <section>` body
  // (a fenced json block). Keyed by entity id; the Command Center renders each as a Swimlane.
  // The section name is config-driven so the engine carries no domain word.
  const workflowSection = ctx.workflowSection;
  // Denormalize a step's authored refs ({ rel, target }) into navigable { rel, target, title, kind }
  // — resolved against the same nodes[] the graph emits, so the Command Center shows target TITLES
  // (and routes by kind) without re-deriving the folder/id strip. Unresolved → kind:null (a non-nav
  // chip in the UI) and a warning, mirroring the fail-soft posture of the block-ignored warnings.
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const resolveStepRefs = (refs, e) => {
    const out = [];
    for (const r of Array.isArray(refs) ? refs : []) {
      if (!r || !r.rel || !r.target) continue;
      const bareId = String(r.target).split("/").pop();
      const node = nodesById.get(bareId);
      if (!node) console.warn(`! ${e.kind}/${e.id}: workflow step ref → "${r.target}" resolves to no entity`);
      out.push({ rel: r.rel, target: bareId, title: node?.title ?? bareId, kind: node?.kind ?? null });
    }
    return out;
  };
  const workflows = {};
  for (const e of entities) {
    const wf = e.workflow; // parsed once at load (lib/contract.mjs); validateEntity gates its shape
    if (!wf) continue;
    if (wf.error) {
      console.warn(`! ${e.kind}/${e.id}: "${workflowSection}" block ignored — ${wf.error}`);
      continue;
    }
    if (!Array.isArray(wf.value?.lanes) || !Array.isArray(wf.value?.steps)) {
      console.warn(`! ${e.kind}/${e.id}: "${workflowSection}" block ignored — needs lanes[] and steps[] arrays`);
      continue;
    }
    // Resolve per-step refs; a step without refs passes through unchanged (output stays byte-stable).
    const steps = wf.value.steps.map((s) => {
      if (!s || typeof s !== "object" || !Array.isArray(s.refs)) return s;
      const { refs, ...rest } = s;
      const resolved = resolveStepRefs(refs, e);
      return resolved.length ? { ...rest, refs: resolved } : rest;
    });
    workflows[e.id] = { view: "swimlane", title: e.fm?.title ?? e.id, code: `${e.kind}.${e.id}`, ...wf.value, steps };
  }

  // Optional run history: a `## Runs` block (array of run records) replayed over the workflow.
  // Windowed to the latest `runsWindow` so the contract stays bounded as the log grows.
  const runsSection = ctx.render?.runsSection ?? "Runs";
  const runsWindow = ctx.render?.runsWindow ?? 25;
  const runs = {};
  for (const e of entities) {
    const found = extractRuns(e.sections?.[runsSection], runsWindow);
    if (!found) continue;
    if (found.error) {
      console.warn(`! ${e.kind}/${e.id}: "${runsSection}" block ignored — ${found.error}`);
      continue;
    }
    runs[e.id] = found.runs;
  }

  // Optional development phases: a `## Phases` block (array of phase records) on any entity —
  // typically a roadmap. Keyed by entity id; the Command Center renders each as a Timeline.
  const phasesSection = ctx.render?.phasesSection ?? "Phases";
  const phases = {};
  for (const e of entities) {
    const found = extractPhases(e.sections?.[phasesSection]);
    if (!found) continue;
    if (found.error) {
      console.warn(`! ${e.kind}/${e.id}: "${phasesSection}" block ignored — ${found.error}`);
      continue;
    }
    phases[e.id] = found.phases;
  }

  return { entities: entities.length, migrated, counts, nodes, byKind, edges, edgesByRel, workflows, runs, phases, swimlaneKinds: ctx.swimlaneKinds ?? [], guide: buildGuide(ctx) };
}

// Place the up-to-6 petals around the center — either a curated config.render.hex.petals layout
// or the auto-placed default (one per kind-with-entities, then a reserved tooling slot). Pure given
// the petal builders; returns the petals to append after the center. Extracted so the auto-place +
// overflow branch — which a curated dogfood layout hides from --check — is unit-testable. (CF-6a.)
function placeDomains({ render, kindsWithEntities, kindPetal, facetPetal, errorCount, proseSeverity }) {
  const out = [];
  if (Array.isArray(render.hex?.petals)) {
    render.hex.petals.forEach((petal, i) => {
      const pos = KIT_HEX_SLOTS.petals[i];
      if (!pos) {
        console.warn(`! hub view holds ${MAX_PETALS} petals; petal #${i + 1} (${petal.facet ?? petal.kind}) overflows and is dropped`);
        return;
      }
      if (petal.facet) out.push(facetPetal(petal.facet, pos));
      else if (petal.kind) out.push(kindPetal(petal.kind, i, pos));
    });
    return out;
  }
  // Auto-place: one petal per kind-with-entities, then a tooling petal — in declared order.
  let petalIdx = 0;
  const overflow = [];
  for (const kind of kindsWithEntities) {
    if (petalIdx >= MAX_PETALS - 1) { overflow.push(kind); continue; } // reserve last slot for tooling
    out.push(kindPetal(kind, petalIdx, KIT_HEX_SLOTS.petals[petalIdx]));
    petalIdx += 1;
  }
  if (overflow.length) {
    console.warn(`! hub view holds ${MAX_PETALS} petals; ${overflow.length} kind(s) overflow and are summarized, not tiled: ${overflow.join(", ")}`);
  }
  out.push({
    id: "tooling",
    pos: KIT_HEX_SLOTS.petals[Math.min(petalIdx, MAX_PETALS - 1)],
    kind: "shipped",
    tag: "Tooling",
    name: "Triad",
    sub: "validator · scaffolder · guard",
    status: `${errorCount} errors · prose↔fm ${proseSeverity}`,
    dot: "#5a6478",
    note:
      "Three zero-dependency engines, all reading the one contract via lib/contract.mjs (no check re-implemented): the validator (per-kind enums, link resolution, prose↔frontmatter), the scaffolder behind /new <kind>, and the PreToolUse guard that blocks any _project/ write that would break the contract.",
    sources: ["tools/validate.mjs", "tools/new-entity.mjs", "tools/guard.mjs"],
  });
  return out;
}

function hubContract(ctx, model) {
  const { byKind, edges, counts, migrated, entities } = model;
  const render = ctx.render ?? {};
  const tone = render.tone ?? "#D4AF37";
  const inFlight = render.inFlightStatuses ? new Set(render.inFlightStatuses) : DEFAULT_IN_FLIGHT;

  const kindsWithEntities = ctx.kinds.filter((k) => (byKind[k]?.total ?? 0) > 0);
  const kindCount = kindsWithEntities.length;
  const folderByKind = ctx.folderByKind;
  const edgesTouching = (kind) => edges.filter((e) => e.fromKind === kind || e.target.startsWith(`${folderByKind[kind]}/`)).length;

  // The center is always slot 0; the 6 petals are either entity KINDS or control-surface
  // FACETS. `config.render.hex.petals` declares a curated layout in slot order; absent it,
  // we auto-place one petal per kind-with-entities + a tooling petal (the original behavior).
  const domains = [
    {
      id: "contract",
      pos: KIT_HEX_SLOTS.center,
      kind: "center",
      tag: render.centerTag ?? "Contract",
      name: render.centerName ?? "ProjectEntity",
      sub: render.centerSub ?? "3 primitives · 1 shape",
      // Tile chips stay short so they fit the hex's narrow content band on one line; the full prose
      // ("N entities · M/N conformant") now lives in the drawer's ProjectEntity brief.
      status: `${migrated}/${entities}`,
      dot: tone,
      note:
        render.centerNote ??
        "One non-optional contract every _project/ file derives from — Identity (kind·id·title) · State (status·updated) · Relation (links). kind & id are loader-derived from the path; the authored surface is just title/status/updated (+links/tags). The validator, scaffolder, guard, and this dashboard all read this single source.",
      sources: ["schema/project-entity.base.schema.json", ctx.configPath.split("/").slice(-2).join("/")],
    },
  ];

  // Build one entity-kind petal (the domain-neutral default). `dotIdx` only feeds the fallback
  // accent palette when a kind sets no render.dot.
  const kindPetal = (kind, dotIdx, pos) => {
    const b = byKind[kind] ?? { total: 0, byStatus: {}, ids: [] };
    const meta = ctx.renderMeta[kind] ?? {};
    return {
      id: kind,
      pos,
      kind: Object.keys(b.byStatus).some((s) => inFlight.has(s)) ? "current" : "shipped",
      tag: meta.tag ?? `${cap(kind)}s`,
      name: meta.name ?? `${cap(kind)} log`,
      sub: meta.sub ?? `${folderByKind[kind]}/ · per-kind status enum`,
      status: `${b.total}`,
      dot: dotForKind(ctx, kind, dotIdx),
      note: `${b.total} ${kind} ${b.total === 1 ? "entity" : "entities"} — status over the per-kind enum (${statusSummary(b.byStatus)}). ${edgesTouching(kind)} typed link${edgesTouching(kind) === 1 ? "" : "s"} touch this kind.`,
      sources: [`_project/${folderByKind[kind]}/`],
    };
  };

  // Build one control-surface petal (commands / workflows / hooks). The reader supplies the
  // live count + detail `entries[]`; FACET_DEFAULTS supplies copy, overridable via config.
  const facetPetal = (facetId, pos) => {
    const read = FACET_READERS[facetId];
    const base = { ...(FACET_DEFAULTS[facetId] ?? { tag: "Control surface", name: cap(facetId) }), ...(render.hex?.facets?.[facetId] ?? {}) };
    const { count, entries } = read ? read(ctx, model) : { count: 0, entries: [] };
    const { builtins, ...copy } = base; // `builtins` is reader config, not a display field
    return {
      id: facetId,
      pos,
      kind: count > 0 ? "shipped" : "current",
      tag: copy.tag,
      name: copy.name,
      sub: copy.sub ?? "",
      status: copy.status ?? `${count}`,
      dot: copy.dot ?? "#5a6478",
      note: copy.note ?? "",
      entries,
      sources: copy.sources ?? [`.claude/${facetId}`],
    };
  };

  domains.push(
    ...placeDomains({ render, kindsWithEntities, kindPetal, facetPetal, errorCount: counts.error, proseSeverity: ctx.proseSeverity }),
  );

  // Model-derived defaults; any can be overridden by config.render passthrough below.
  const derived = {
    view: "hub",
    brand: render.brand ?? cap(ctx.project),
    code: render.code ?? `${ctx.project}.entity-graph`,
    tagline: render.tagline ?? "planning contract",
    tone,
    taglineNote: render.taglineNote ?? `1 shape · ${kindCount} kinds · derived renderers`,
    sub:
      render.sub ??
      "Every _project/ artifact is one ProjectEntity — Identity · State · Relation. The center is the contract; each petal is an entity kind; the last slot is the tooling it feeds. Click a tile for the kind detail.",
    axis: render.axis ?? `1 CONTRACT → ${kindCount} KINDS → VALIDATOR · SCAFFOLDER · GUARD → DERIVED DASHBOARD`,
    updated: todayISO(),
    sourceLine: render.sourceLine ?? `source-of-truth: schema/project-entity.base.schema.json + ${ctx.project}'s validated _project/ entities · generated by tools/render-hub.mjs`,
    stats: render.stats ?? [
      { label: "entities", value: entities },
      { label: "kinds", value: kindCount },
      { label: "errors", value: counts.error, color: counts.error ? "#FF4444" : "#43AA8B" },
      { label: "edges", value: edges.length },
    ],
    scopeTitle: render.scopeTitle ?? "Contract · coverage",
    scope: render.scope ?? [
      { label: "Entities", num: String(entities), value: `across ${kindCount} kinds` },
      { label: "Conformant", num: `${migrated}/${entities}`, value: `carry frontmatter · ${entities - migrated} pending` },
      { label: "Validation", num: String(counts.error), value: `errors · ${counts.warning} warnings · ${counts.info} info` },
      { label: "Edges", num: String(edges.length), value: `typed links${Object.keys(model.edgesByRel).length ? ` · ${Object.keys(model.edgesByRel).sort().join(" · ")}` : ""}` },
      { label: "Primitives", num: "3", value: "Identity · State · Relation" },
      { label: "Tooling", num: "3", value: "validator · scaffolder · guard — self-tested, single-source" },
    ],
    strategy:
      render.strategy ??
      "One contract, three primitives, many disposable renderers — the planning layer reduced the way a UI reduces to State and Relation.",
    domains,
  };
  if (render.banner) derived.banner = render.banner;
  if (render.ribbon) {
    derived.ribbon = render.ribbon;
    derived.ribbonTitle = render.ribbonTitle ?? "Phases";
    if (render.ribbonTotal) derived.ribbonTotal = render.ribbonTotal;
  }
  if (render.paths) derived.paths = render.paths;
  if (render.nav) derived.nav = render.nav; // optional editorial nav; app falls back to deriveNav()
  return derived;
}

function outPaths(ctx) {
  const dir = ctx.outDir ?? join(ctx.projectRoot, "previews", "dashboards");
  return {
    dir,
    graph: join(dir, `${ctx.project}-graph.json`),
    hub: join(dir, `${ctx.project}-hub.json`),
  };
}

// The emitted graph document — the Command-Center's topology contract. `folderByKind`
// makes edge resolution collision-safe (an edge `target` is `<folder>/<id>`; see
// docs/spec/command-center-contract.md). Shared by write() and check() so the on-disk
// file and the freshness check derive from one serialization and can't drift apart.
function graphDoc(ctx, model) {
  return { generatedBy: "tools/render-hub.mjs", project: ctx.project, folderByKind: ctx.folderByKind, ...model };
}

function write(ctx, model, hub) {
  const p = outPaths(ctx);
  if (!existsSync(p.dir)) mkdirSync(p.dir, { recursive: true });
  writeFileSync(p.graph, `${JSON.stringify(graphDoc(ctx, model), null, 2)}\n`);
  writeFileSync(p.hub, `${JSON.stringify(hub, null, 2)}\n`);
  return p;
}

function check(ctx) {
  const model = buildModel(ctx);
  const hub = hubContract(ctx, model);
  const p = outPaths(ctx);
  let ok = true;

  // graph.json — the topology the app actually consumes. It carries no daily-drifting
  // field, so an exact byte-diff against a fresh serialization is the whole check.
  if (!existsSync(p.graph)) {
    console.error(`check: ${p.graph} missing — run the generator`);
    ok = false;
  } else if (readFileSync(p.graph, "utf8") !== `${JSON.stringify(graphDoc(ctx, model), null, 2)}\n`) {
    console.log("check: graph.json DRIFT — re-run the generator");
    ok = false;
  }

  // hub.json — date-insensitive: `updated` drifts daily, so normalize it out.
  if (!existsSync(p.hub)) {
    console.error(`check: ${p.hub} missing — run the generator`);
    ok = false;
  } else {
    const norm = (o) => JSON.stringify({ ...o, updated: "X" });
    if (norm(JSON.parse(readFileSync(p.hub, "utf8"))) !== norm(hub)) {
      console.log("check: hub.json DRIFT — re-run the generator");
      ok = false;
    }
  }

  if (ok) console.log("check: in sync");
  return ok;
}

// --- self-test: pin the pure projection logic that --check + verify-contract can't reach —
// the auto-place/overflow branch (a curated dogfood layout hides it), extractRuns windowing
// (the dogfood's Runs block has fewer records than the window), and the tone/dot fallbacks
// (the dogfood sets explicit dots). Hermetic, no project. (CF-6a.)
function selfTest() {
  const kindPetal = (kind, idx, pos) => ({ id: kind, pos, _idx: idx });
  const facetPetal = (f, pos) => ({ id: f, pos, _facet: true });
  const runsBlock = (arr) => "```json\n" + JSON.stringify(arr) + "\n```";
  const ctx = { renderMeta: { a: {}, b: { dot: "#123456" }, c: { tone: "danger" }, d: { dot: "#44DDFF" } } };

  const cases = [
    ["auto-place: 7 kinds → 5 tiled + tooling, 2 overflow", () => {
      const p = placeDomains({ render: {}, kindsWithEntities: ["a", "b", "c", "d", "e", "f", "g"], kindPetal, facetPetal, errorCount: 0, proseSeverity: "warn" });
      return p.length === 6 && p.filter((x) => x.id !== "tooling").length === 5 && p[5].id === "tooling" && p[5].pos === KIT_HEX_SLOTS.petals[5];
    }],
    ["auto-place: tooling slot tracks petalIdx + wires errorCount/proseSeverity", () => {
      const p = placeDomains({ render: {}, kindsWithEntities: ["x", "y"], kindPetal, facetPetal, errorCount: 3, proseSeverity: "error" });
      return p.length === 3 && p[2].id === "tooling" && p[2].pos === KIT_HEX_SLOTS.petals[2] && p[2].status === "3 errors · prose↔fm error";
    }],
    ["curated layout: places kind/facet by slot, no auto tooling", () => {
      const p = placeDomains({ render: { hex: { petals: [{ kind: "a" }, { facet: "hooks" }, { kind: "b" }] } }, kindsWithEntities: ["a", "b", "c", "d", "e", "f", "g"], kindPetal, facetPetal, errorCount: 0, proseSeverity: "warn" });
      return p.length === 3 && p[0]._idx === 0 && p[1]._facet === true && p[2]._idx === 2 && !p.some((x) => x.id === "tooling");
    }],
    ["curated overflow: >6 declared petals are dropped at MAX_PETALS", () => {
      const p = placeDomains({ render: { hex: { petals: Array.from({ length: 8 }, (_, i) => ({ kind: "k" + i })) } }, kindsWithEntities: [], kindPetal, facetPetal, errorCount: 0, proseSeverity: "warn" });
      return p.length === MAX_PETALS;
    }],
    ["extractRuns: windows to `window`, newest-first, totals the full set", () => {
      const recs = Array.from({ length: 30 }, (_, i) => ({ startedAt: 1000 + i, status: i % 2 ? "ok" : "fail" }));
      const r = extractRuns(runsBlock(recs), 25).runs;
      return r.total === 30 && r.runs.length === 25 && r.runs[0].startedAt === 1029 && r.rollup.byStatus.ok === 15 && r.rollup.byStatus.fail === 15;
    }],
    ["extractRuns: missing/NaN startedAt sorts without throwing", () => {
      const r = extractRuns(runsBlock([{ status: "ok" }, { startedAt: "nope", status: "x" }, { startedAt: 5, status: "y" }]), 25).runs;
      return r.total === 3 && r.runs.length === 3;
    }],
    ["extractRuns: non-array block → error", () => !!extractRuns(runsBlock({ a: 1 }), 25).error],
    ["toneForKind: explicit tone > known hex > rotation fallback", () => toneForKind(ctx, "d", 0) === "info" && toneForKind(ctx, "b", 1) === "success" && toneForKind(ctx, "c", 2) === "danger"],
    ["dotForKind: explicit dot, else palette rotation", () => dotForKind(ctx, "b", 1) === "#123456" && dotForKind(ctx, "a", 0) === DEFAULT_DOTS[0] && dotForKind({ renderMeta: {} }, "z", 7) === DEFAULT_DOTS[7 % DEFAULT_DOTS.length]],
    ["statusSummary: single → 'all x', multiple → count-desc", () => statusSummary({ a: 1 }) === "all a" && statusSummary({ a: 1, b: 3 }) === "3 b · 1 a"],
  ];

  const origWarn = console.warn;
  console.warn = () => {}; // silence the expected overflow warns during the run
  let pass = 0;
  try {
    for (const [name, fn] of cases) {
      let ok = false;
      try { ok = fn(); } catch { ok = false; }
      console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
      if (ok) pass += 1;
    }
  } finally {
    console.warn = origWarn;
  }
  console.log(`self-test: ${pass}/${cases.length} passed`);
  return pass === cases.length;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);
  const opts = {};
  const flags = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") opts.root = argv[++i];
    else if (argv[i] === "--config") opts.config = argv[++i];
    else if (argv[i] === "--out") opts.out = argv[++i];
    else flags.push(argv[i]);
  }
  let ctx;
  try {
    ctx = loadContract({ root: opts.root, config: opts.config });
  } catch (e) {
    console.error(`render-hub: ${e.message}`);
    process.exit(1);
  }
  // --out co-locates a consumer's emission into one dir (used by render-all.mjs so the app can
  // bundle every consumer's contract). Default stays <projectRoot>/previews/dashboards/.
  if (opts.out) ctx.outDir = opts.out;

  if (flags.includes("--check")) process.exit(check(ctx) ? 0 : 1);

  const model = buildModel(ctx);
  const hub = hubContract(ctx, model);
  const p = write(ctx, model, hub);
  const relOut = (f) => f.replace(`${ctx.projectRoot}/`, "");
  console.log(`wrote ${relOut(p.graph)}`);
  console.log(`wrote ${relOut(p.hub)}`);
  console.log(`model: ${model.entities} entities, ${model.edges.length} edges, ${model.counts.error} errors`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
