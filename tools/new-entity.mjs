#!/usr/bin/env node
// Scaffold a new _project/ entity with valid ProjectEntity frontmatter + the
// per-kind section skeleton for its kind. Reuses the contract + validateEntity as the
// single source of truth (it does NOT re-derive the shape), then self-validates the
// file it produces — so a scaffolded entity is conformant by construction, including
// the prose<->frontmatter agreement.
//
// Everything project-specific (which kinds, their folders, status enums, filename
// schemes, sections, section hints) comes from the project's config via ctx.
//
// Usage:
//   node tools/new-entity.mjs <kind> "<title>" [--root <dir>] [--config <path>] [options]
//   Options:
//     --status <s>         initial status (default per kind; must be in the enum)
//     --slug <slug>        filename slug (default: slugified title)
//     --date <YYYY-MM-DD>  the `updated` date (default: today)
//     --scope <s>          add tags.scope
//     --link <rel:target>  add a typed edge (repeatable)
//     --dry-run            print the file instead of writing it
//     --self-test          assert a scaffold of every kind validates clean

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter, parseSections } from "../lib/md.mjs";
import { fencedJson } from "../lib/swimlane.mjs";
import {
  AUTHORED_FIELDS,
  DERIVED_FIELDS,
  PRIMITIVE_KEYS,
  loadBaseSchema,
  loadContract,
  readProjectArgs,
} from "../lib/contract.mjs";
import { validateEntity } from "./validate.mjs";

// Generic section hints; a project can override/extend any of these via config.sectionHints.
const BUILTIN_HINTS = {
  Context: "<what is forcing this now>",
  Decision: "<the choice>",
  Consequences: "<what gets easier; what gets harder>",
  "Options considered": "- **<option>** — <why rejected>",
  Cites: "- <source link>",
  "Re-open if": "<the condition that would reopen this>",
  Outcome: "**What shipped**\n\n- <deliverable — cite file paths>\n\n**What didn't**\n\n- <deferred — cite the carry-forward entry>",
  Surprises: "- **<finding>** — what happened, and the pattern it generalizes.",
  "Decisions made": "- **D1**: <decision> — <rationale>. (Link to a decision if formal.)",
  "Carry-forward": "- `[CF-<id>]` <description> — <reason deferred>.",
  "Verification evidence": "| Gate | Method | Evidence |\n|---|---|---|\n| <criterion> | <method> | <link or note> |",
  "Build plan": "1. <step>",
  "Exit criteria": "- <the gate that closes this>",
  Plan: "- <the roadmap step>",
  "Open questions": "- <unresolved question>",
  Purpose: "<the outcome this process reliably produces>",
  Goal: "<the single outcome this session targets>",
  "Success Criteria": "- <observable criterion>",
  "Source References": "- <spec / file link>",
  Decisions: "- <decision made this session>",
  Outputs: "- <artifact produced>",
  Blockers: "- <blocker, or “none”>",
  "Next Action": "<the single next concrete action>",
  "Handoff Notes": "<what the next session needs to know>",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

function nextSerial(ctx, kind) {
  const dir = join(ctx.projectRoot, "_project", ctx.folderByKind[kind]);
  let max = 0;
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const m = name.match(/^(\d+)-/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(ctx.filenameScheme[kind].pad, "0");
}

function stemFor(ctx, kind, slug, date) {
  switch (ctx.filenameScheme[kind].scheme) {
    case "serial":
      return `${nextSerial(ctx, kind)}-${slug}`;
    case "date-slug":
      return `${date}-${slug}`;
    default: // slug
      return slug;
  }
}

function buildContent(ctx, { kind, title, status, date, scope, tags, links }) {
  const fm = [`title: ${JSON.stringify(title)}`, `status: ${status}`, `updated: ${date}`];
  if (links?.length) {
    fm.push("links:");
    for (const l of links) fm.push(`  - { rel: ${l.rel}, target: ${l.target} }`);
  }
  // Tags: --scope (shorthand) first, then any --tag key=value pairs, as one inline map.
  const tagPairs = [];
  if (scope) tagPairs.push(`scope: ${scope}`);
  for (const t of tags ?? []) tagPairs.push(`${t.key}: ${t.val}`);
  if (tagPairs.length) fm.push(`tags: { ${tagPairs.join(", ")} }`);

  // The prose status header stays as narrative; its leading word matches `status` so the
  // prose<->frontmatter rule is satisfied by construction. Uniform across kinds (cosmetic).
  const prose = `> **Status:** ${status} (${date})`;

  const hintFor = (s) => ctx.sectionHints[s] ?? BUILTIN_HINTS[s] ?? "<…>";
  const body = (ctx.scaffoldSections[kind] ?? [])
    .map((s) => `## ${s}\n\n${hintFor(s)}\n`)
    .join("\n");

  return `---\n${fm.join("\n")}\n---\n\n# ${title}\n\n${prose}\n\n${body}`;
}

function entityFor(ctx, kind, stem, content) {
  const { data, body, hasFrontmatter } = parseFrontmatter(content);
  const sections = parseSections(body);
  return {
    kind,
    id: stem,
    file: `_project/${ctx.folderByKind[kind]}/${stem}.md`,
    fm: data,
    hasFrontmatter,
    sections,
    workflow: fencedJson(sections[ctx.workflowSection]), // so the scaffold self-validates its swimlane
    fullText: content,
  };
}

function parseArgs(rest) {
  const opts = { links: [], tags: [] };
  const positional = [];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--self-test") opts.selfTest = true;
    else if (a === "--status") opts.status = rest[++i];
    else if (a === "--slug") opts.slug = rest[++i];
    else if (a === "--date") opts.date = rest[++i];
    else if (a === "--scope") opts.scope = rest[++i];
    else if (a === "--tag") {
      const raw = rest[++i] ?? "";
      const idx = raw.indexOf("=");
      if (idx > 0) opts.tags.push({ key: raw.slice(0, idx), val: raw.slice(idx + 1) });
    } else if (a === "--link") {
      const raw = rest[++i] ?? "";
      const idx = raw.indexOf(":");
      if (idx > 0) opts.links.push({ rel: raw.slice(0, idx), target: raw.slice(idx + 1) });
    } else if (a.startsWith("--")) {
      // ignore unknown flags
    } else positional.push(a);
  }
  opts.kind = positional[0];
  opts.title = positional[1];
  return opts;
}

function scaffold(opts, ctx) {
  const { kind } = opts;
  if (!ctx.folderByKind[kind]) {
    throw new Error(`unknown kind "${kind}" (expected: ${ctx.kinds.join(", ")})`);
  }
  if (!opts.title) throw new Error('a "<title>" is required');

  const status = opts.status ?? ctx.initialStatus[kind];
  const enumForKind = ctx.statusEnums[kind];
  if (enumForKind && !enumForKind.has(status)) {
    throw new Error(`invalid status "${status}" for ${kind} (expected: ${[...enumForKind].join(", ")})`);
  }
  const date = opts.date ?? todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date not ISO YYYY-MM-DD: "${date}"`);

  const slug = slugify(opts.slug ?? opts.title);
  const stem = stemFor(ctx, kind, slug, date);
  const path = join(ctx.projectRoot, "_project", ctx.folderByKind[kind], `${stem}.md`);
  const relPath = `_project/${ctx.folderByKind[kind]}/${stem}.md`;
  if (existsSync(path)) throw new Error(`refusing to overwrite existing file: ${relPath}`);

  const content = buildContent(ctx, { kind, title: opts.title, status, date, scope: opts.scope, tags: opts.tags, links: opts.links });
  const issues = validateEntity(entityFor(ctx, kind, stem, content), ctx);
  const errors = issues.filter((i) => i.severity === "error");
  return { path, relPath, content, issues, errors, stem };
}

// --- self-test: hermetic, synthetic ctx covering every generic kind ----------

function syntheticCtx() {
  const sections = {
    decision: ["Context", "Decision", "Consequences", "Options considered", "Cites", "Re-open if"],
    report: ["Outcome", "Surprises", "Decisions made", "Carry-forward", "Verification evidence"],
    pipeline: ["Context", "Build plan", "Exit criteria"],
    roadmap: ["Context", "Plan", "Open questions"],
    session: ["Goal", "Success Criteria", "Source References", "Decisions", "Outputs", "Blockers", "Next Action", "Handoff Notes"],
    workflow: ["Purpose", "Workflow"],
  };
  const folderByKind = { decision: "decisions", report: "reports", pipeline: "pipeline", roadmap: "roadmap", session: "sessions", workflow: "workflows" };
  const statusEnums = {
    decision: new Set(["proposed", "accepted", "superseded", "rejected"]),
    report: new Set(["draft", "complete"]),
    pipeline: new Set(["design", "qualify", "build", "ship", "archive", "shelved"]),
    roadmap: new Set(["proposed", "active", "superseded", "complete"]),
    session: new Set(["planned", "active", "blocked", "completed", "shelved"]),
    workflow: new Set(["draft", "active", "deprecated"]),
  };
  const initialStatus = { decision: "proposed", report: "draft", pipeline: "design", roadmap: "proposed", session: "planned", workflow: "draft" };
  const filename = { decision: "serial", report: "date-slug", session: "date-slug", pipeline: "slug", roadmap: "slug", workflow: "slug" };
  const filenameScheme = Object.fromEntries(Object.entries(filename).map(([k, v]) => [k, { scheme: v, pad: 4 }]));
  return {
    project: "synthetic",
    projectRoot: join(process.cwd(), ".ps-self-test-nonexistent"),
    kinds: ["decision", "report", "pipeline", "roadmap", "session", "workflow"],
    folderByKind,
    kindByFolder: Object.fromEntries(Object.entries(folderByKind).map(([k, v]) => [v, k])),
    statusEnums,
    initialStatus,
    filenameScheme,
    requiredSections: sections,
    scaffoldSections: sections,
    // A clean born-valid swimlane stub, so a scaffolded `workflow` exercises swimlane validation
    // (the real config's richer hint demonstrates status/detail/note; this one just must validate).
    sectionHints: { Workflow: '```json\n{\n  "lanes": [ { "id": "you", "label": "You", "kind": "human" } ],\n  "steps": [ { "id": "start", "lane": "you", "label": "Start", "status": "done", "to": [] } ]\n}\n```' },
    swimlaneKinds: ["workflow"],
    swimlaneLaneKinds: new Set(["human", "ai", "system", "tool", "neutral"]),
    swimlaneSeverity: "error",
    workflowSection: "Workflow",
    relEnum: new Set(loadBaseSchema().$defs.rel.enum),
    relTargetKinds: { "superseded-by": ["decision"], milestone: "marker", references: "any" },
    tagRegistry: { tier: { type: "enum", values: ["required", "optional"] } },
    knownMilestones: new Set(["M5"]),
    milestonePattern: /^M\d+$/,
    proseSeverity: "error",
    primitiveKeys: PRIMITIVE_KEYS,
    derivedFields: DERIVED_FIELDS,
    authoredFields: AUTHORED_FIELDS,
  };
}

function selfTest() {
  const ctx = syntheticCtx();
  let pass = 0;
  const cases = [];
  for (const kind of ctx.kinds) {
    cases.push([
      `scaffold ${kind} → 0 errors, 0 warnings`,
      () => {
        const r = scaffold({ kind, title: `Synthetic ${kind}`, links: [] }, ctx);
        return r.errors.length === 0 && r.issues.filter((i) => i.severity === "warning").length === 0;
      },
    ]);
  }
  cases.push([
    "scaffold with a milestone link → 0 errors",
    () => scaffold({ kind: "report", title: "M9 thing", links: [{ rel: "milestone", target: "M5" }] }, ctx).errors.length === 0,
  ]);
  cases.push([
    "bad --status is rejected",
    () => {
      try {
        scaffold({ kind: "decision", title: "X", status: "shipped", links: [] }, ctx);
        return false;
      } catch (e) {
        return /invalid status/.test(e.message);
      }
    },
  ]);
  cases.push([
    "dangling --link is caught as an error",
    () => scaffold({ kind: "decision", title: "X", links: [{ rel: "superseded-by", target: "decisions/nope" }] }, ctx).errors.some((i) => /dangling/.test(i.message)),
  ]);
  cases.push(["serial stem is zero-padded", () => /^0*\d+-/.test(stemFor(ctx, "decision", "x", "2026-01-01"))]);
  cases.push([
    "scaffolded workflow carries a parsed, born-valid swimlane",
    () => { const r = scaffold({ kind: "workflow", title: "Probe", links: [] }, ctx); return !!entityFor(ctx, "workflow", r.stem, r.content).workflow?.value && r.errors.length === 0; },
  ]);
  cases.push([
    "--tag with a valid enum value → 0 errors + emitted in frontmatter",
    () => {
      const r = scaffold({ kind: "decision", title: "X", tags: [{ key: "tier", val: "required" }], links: [] }, ctx);
      return r.errors.length === 0 && /tags:\s*{[^}]*tier:\s*required/.test(r.content);
    },
  ]);
  cases.push([
    "--tag with an off-enum value is caught as an error",
    () => scaffold({ kind: "decision", title: "X", tags: [{ key: "tier", val: "bogus" }], links: [] }, ctx).errors.some((i) => /tier/.test(i.message)),
  ]);

  for (const [name, fn] of cases) {
    let ok = false;
    try { ok = fn(); } catch { ok = false; }
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
    if (ok) pass += 1;
  }
  console.log(`self-test: ${pass}/${cases.length} passed`);
  return pass === cases.length;
}

function main() {
  const { opts: projOpts, rest } = readProjectArgs(process.argv.slice(2));
  const opts = parseArgs(rest);

  if (opts.selfTest) process.exit(selfTest() ? 0 : 1);

  let ctx;
  try {
    ctx = loadContract(projOpts);
  } catch (e) {
    console.error(`new-entity: ${e.message}`);
    process.exit(1);
  }

  let result;
  try {
    result = scaffold(opts, ctx);
  } catch (e) {
    console.error(`new-entity: ${e.message}`);
    console.error(`usage: node tools/new-entity.mjs <${ctx.kinds.join("|")}> "<title>" [--status s] [--link rel:target] [--dry-run]`);
    process.exit(1);
  }

  if (result.errors.length) {
    console.error(`refusing to write — the scaffold would be invalid:`);
    for (const e of result.errors) console.error(`  ERROR: ${e.message}`);
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(`# would write ${result.relPath}\n`);
    console.log(result.content);
    return;
  }

  mkdirSync(dirname(result.path), { recursive: true }); // a brand-new kind's folder may not exist yet
  writeFileSync(result.path, result.content);
  const warns = result.issues.filter((i) => i.severity === "warning");
  console.log(`created ${result.relPath}  (validated: 0 errors${warns.length ? `, ${warns.length} warnings` : ""})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { scaffold, syntheticCtx };
