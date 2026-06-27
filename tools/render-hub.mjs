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
import { listMarkdown, parseFrontmatter } from "../lib/md.mjs";
import { validateEntity } from "./validate.mjs";

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

// Parse a single fenced ```json block out of an entity body section. The ONE place that reads
// a structured block — both the Workflow and Runs facets go through it (single source, no
// second fence parser). Returns { value }, { error } to warn on, or null (no block present).
function fencedJson(sectionText) {
  if (!sectionText) return null;
  const m = sectionText.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (!m) return null;
  try {
    return { value: JSON.parse(m[1]) };
  } catch (e) {
    return { error: `invalid JSON (${e.message})` };
  }
}

// A structured workflow (a Trembus swimlane contract). Domain-neutral: the engine invents no
// workflow semantics — it just passes a `{ lanes[], steps[] }` block through.
function extractWorkflow(sectionText) {
  const block = fencedJson(sectionText);
  if (!block || block.error) return block;
  if (!Array.isArray(block.value?.lanes) || !Array.isArray(block.value?.steps)) {
    return { error: "needs lanes[] and steps[] arrays" };
  }
  return { contract: block.value };
}

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

const FACET_READERS = { commands: readCommandsFacet, hooks: readHooksFacet, workflows: readWorkflowsFacet };

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
};

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
  ctx.kinds.forEach((kind, i) => {
    byKind[kind] = { total: 0, byStatus: {}, ids: [], tone: toneForKind(ctx, kind, i) };
  });
  for (const e of entities) {
    const b = (byKind[e.kind] ??= { total: 0, byStatus: {}, ids: [] });
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
  const nodes = entities.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.fm?.title ?? null,
    status: e.fm?.status ?? null,
    updated: e.fm?.updated ?? null,
    file: e.file,
  }));

  // Optional structured workflows: any entity may declare a swimlane in a `## <section>` body
  // (a fenced json block). Keyed by entity id; the Command Center renders each as a Swimlane.
  // The section name is config-driven so the engine carries no domain word.
  const workflowSection = ctx.render?.workflowSection ?? "Workflow";
  const workflows = {};
  for (const e of entities) {
    const found = extractWorkflow(e.sections?.[workflowSection]);
    if (!found) continue;
    if (found.error) {
      console.warn(`! ${e.kind}/${e.id}: "${workflowSection}" block ignored — ${found.error}`);
      continue;
    }
    workflows[e.id] = { view: "swimlane", title: e.fm?.title ?? e.id, code: `${e.kind}.${e.id}`, ...found.contract };
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

  return { entities: entities.length, migrated, counts, nodes, byKind, edges, edgesByRel, workflows, runs, phases, swimlaneKinds: ctx.swimlaneKinds ?? [] };
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
      status: `${entities} entities · ${migrated}/${entities} conformant`,
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
      status: `${b.total} · ${statusSummary(b.byStatus)}`,
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
      status: copy.status ?? `${count} · ${copy.sub ?? copy.name.toLowerCase()}`,
      dot: copy.dot ?? "#5a6478",
      note: copy.note ?? "",
      entries,
      sources: copy.sources ?? [`.claude/${facetId}`],
    };
  };

  if (Array.isArray(render.hex?.petals)) {
    render.hex.petals.forEach((petal, i) => {
      const pos = KIT_HEX_SLOTS.petals[i];
      if (!pos) {
        console.warn(`! hub view holds ${MAX_PETALS} petals; petal #${i + 1} (${petal.facet ?? petal.kind}) overflows and is dropped`);
        return;
      }
      if (petal.facet) domains.push(facetPetal(petal.facet, pos));
      else if (petal.kind) domains.push(kindPetal(petal.kind, i, pos));
    });
  } else {
    // Auto-place: one petal per kind-with-entities, then a tooling petal — in declared order.
    let petalIdx = 0;
    const overflow = [];
    for (const kind of kindsWithEntities) {
      if (petalIdx >= MAX_PETALS - 1) { overflow.push(kind); continue; } // reserve last slot for tooling
      domains.push(kindPetal(kind, petalIdx, KIT_HEX_SLOTS.petals[petalIdx]));
      petalIdx += 1;
    }
    if (overflow.length) {
      console.warn(`! hub view holds ${MAX_PETALS} petals; ${overflow.length} kind(s) overflow and are summarized, not tiled: ${overflow.join(", ")}`);
    }
    domains.push({
      id: "tooling",
      pos: KIT_HEX_SLOTS.petals[Math.min(petalIdx, MAX_PETALS - 1)],
      kind: "shipped",
      tag: "Tooling",
      name: "Triad",
      sub: "validator · scaffolder · guard",
      status: `${counts.error} errors · prose↔fm ${ctx.proseSeverity}`,
      dot: "#5a6478",
      note:
        "Three zero-dependency engines, all reading the one contract via lib/contract.mjs (no check re-implemented): the validator (per-kind enums, link resolution, prose↔frontmatter), the scaffolder behind /new <kind>, and the PreToolUse guard that blocks any _project/ write that would break the contract.",
      sources: ["tools/validate.mjs", "tools/new-entity.mjs", "tools/guard.mjs"],
    });
  }

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

function main() {
  const argv = process.argv.slice(2);
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
