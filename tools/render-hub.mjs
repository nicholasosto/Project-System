#!/usr/bin/env node
// Project a validated ProjectEntity graph into the Trembus visual-grammar `hub` view
// and render it — model-driven, so the dashboard derives from the contract instead of
// being hand-rolled. Counts / statuses / edges come from the entities; the editorial
// framing comes from the project's config.render. Domain-neutral end to end.
//
//   source-of-truth (the project's _project/ entities) -> contract -> kit -> HTML
//
// Usage:
//   node tools/render-hub.mjs [--root <dir>] [--config <path>]   # emit graph + hub JSON, then render
//   node tools/render-hub.mjs --no-render                         # emit JSON only (skip the kit)
//   node tools/render-hub.mjs --check                             # assert outputs are in sync (date-insensitive)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadContract, loadEntities } from "../lib/contract.mjs";
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
  for (const kind of ctx.kinds) byKind[kind] = { total: 0, byStatus: {}, ids: [] };
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

  return { entities: entities.length, migrated, counts, byKind, edges, edgesByRel };
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

  // Auto-place: center, then one petal per kind, then a tooling petal — in declared order.
  // The petal slot is assigned from the kit's opaque slot list; the framework never names it.
  const placements = [];
  let petalIdx = 0;
  const overflow = [];
  for (const kind of kindsWithEntities) {
    if (petalIdx >= MAX_PETALS - 1) { overflow.push(kind); continue; } // reserve last slot for tooling
    placements.push({ kind, pos: KIT_HEX_SLOTS.petals[petalIdx] });
    petalIdx += 1;
  }
  const toolingPos = KIT_HEX_SLOTS.petals[Math.min(petalIdx, MAX_PETALS - 1)];
  if (overflow.length) {
    console.warn(`! hub view holds ${MAX_PETALS} petals; ${overflow.length} kind(s) overflow and are summarized, not tiled: ${overflow.join(", ")}`);
  }

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

  placements.forEach(({ kind, pos }, i) => {
    const b = byKind[kind];
    const meta = ctx.renderMeta[kind] ?? {};
    const petalKind = Object.keys(b.byStatus).some((s) => inFlight.has(s)) ? "current" : "shipped";
    domains.push({
      id: kind,
      pos,
      kind: petalKind,
      tag: meta.tag ?? `${cap(kind)}s`,
      name: meta.name ?? `${cap(kind)} log`,
      sub: meta.sub ?? `${folderByKind[kind]}/ · per-kind status enum`,
      status: `${b.total} · ${statusSummary(b.byStatus)}`,
      dot: meta.dot ?? DEFAULT_DOTS[i % DEFAULT_DOTS.length],
      note: `${b.total} ${kind} ${b.total === 1 ? "entity" : "entities"} — status over the per-kind enum (${statusSummary(b.byStatus)}). ${edgesTouching(kind)} typed link${edgesTouching(kind) === 1 ? "" : "s"} touch this kind.`,
      sources: [`_project/${folderByKind[kind]}/`],
    });
  });

  domains.push({
    id: "tooling",
    pos: toolingPos,
    kind: "shipped",
    tag: "Tooling",
    name: "Triad",
    sub: "validator · scaffolder · guard",
    status: `${counts.error} errors · prose↔fm ${ctx.proseSeverity}`,
    dot: "#5a6478",
    note:
      "Three zero-dependency engines, all reading the one contract via lib/contract.mjs (no check re-implemented): the validator (per-kind enums, link resolution, prose↔frontmatter), the scaffolder behind /new-<kind>, and the PreToolUse guard that blocks any _project/ write that would break the contract.",
    sources: ["tools/validate.mjs", "tools/new-entity.mjs", "tools/guard.mjs"],
  });

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
  return derived;
}

function outPaths(ctx) {
  const dir = join(ctx.projectRoot, "previews", "dashboards");
  return {
    dir,
    graph: join(dir, `${ctx.project}-graph.json`),
    hub: join(dir, `${ctx.project}-hub.json`),
    html: join(dir, `${ctx.project}-hub.html`),
  };
}

function write(ctx, model, hub) {
  const p = outPaths(ctx);
  if (!existsSync(p.dir)) mkdirSync(p.dir, { recursive: true });
  writeFileSync(p.graph, `${JSON.stringify({ generatedBy: "tools/render-hub.mjs", project: ctx.project, ...model }, null, 2)}\n`);
  writeFileSync(p.hub, `${JSON.stringify(hub, null, 2)}\n`);
  return p;
}

function render(ctx, p) {
  const kit = ctx.render?.kit;
  if (!kit) {
    console.warn("! no render.kit in config — wrote JSON only.");
    return null;
  }
  const build = join(kit, "build.mjs");
  if (!existsSync(build)) {
    console.warn(`! kit not found at ${build} — wrote JSON only.`);
    return null;
  }
  execFileSync("node", [build, "--data", p.hub, "--out", p.html], { stdio: "inherit" });
  return p.html;
}

function check(ctx) {
  const hub = hubContract(ctx, buildModel(ctx));
  const p = outPaths(ctx);
  if (!existsSync(p.hub)) {
    console.error(`check: ${p.hub} missing — run the generator`);
    return false;
  }
  const onDisk = JSON.parse(readFileSync(p.hub, "utf8"));
  const norm = (o) => JSON.stringify({ ...o, updated: "X" }); // date-insensitive: `updated` drifts daily
  const ok = norm(onDisk) === norm(hub);
  console.log(ok ? "check: in sync" : "check: DRIFT — re-run the generator");
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  const opts = {};
  const flags = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") opts.root = argv[++i];
    else if (argv[i] === "--config") opts.config = argv[++i];
    else flags.push(argv[i]);
  }
  let ctx;
  try {
    ctx = loadContract(opts);
  } catch (e) {
    console.error(`render-hub: ${e.message}`);
    process.exit(1);
  }

  if (flags.includes("--check")) process.exit(check(ctx) ? 0 : 1);

  const model = buildModel(ctx);
  const hub = hubContract(ctx, model);
  const p = write(ctx, model, hub);
  const relOut = (f) => f.replace(`${ctx.projectRoot}/`, "");
  console.log(`wrote ${relOut(p.graph)}`);
  console.log(`wrote ${relOut(p.hub)}`);
  console.log(`model: ${model.entities} entities, ${model.edges.length} edges, ${model.counts.error} errors`);

  if (!flags.includes("--no-render")) {
    const out = render(ctx, p);
    if (out) console.log(`rendered ${relOut(out)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
