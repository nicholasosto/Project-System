#!/usr/bin/env node
// Validate a project's _project/ planning artifacts against the effective
// ProjectEntity contract (base schema + the project's project-system.config.json).
//
// Zero-dependency. All project specifics come from ctx (see lib/contract.mjs); this
// file is the check LOGIC and the CLI, and is identical across every consuming project.
// validateEntity() is the single source of truth reused by the scaffolder, the guard,
// and the renderer — no check is re-implemented anywhere else.
//
// Usage:
//   node tools/validate.mjs [--root <dir>] [--config <path>]   # report (exit 1 on errors)
//   node tools/validate.mjs --json                              # machine-readable issues + summary
//   node tools/validate.mjs --summary                           # one compact health line (always exit 0; for a SessionStart hook)
//   node tools/validate.mjs --self-test                         # assert the checks themselves work

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { daysSince } from "../lib/md.mjs";
import {
  AUTHORED_FIELDS,
  DERIVED_FIELDS,
  PRIMITIVE_KEYS,
  REQUIRED_AUTHORED,
  buildContext,
  classifyTarget,
  loadBaseSchema,
  loadContract,
  loadEntities,
  readProjectArgs,
} from "../lib/contract.mjs";
import { validateSwimlane } from "../lib/swimlane.mjs";

// Pull the leading status word out of a prose "**Status:** …" header, normalized.
function proseStatusWord(fullText) {
  const m = fullText.match(/\*\*status:?\*\*:?\s*([^\n]+)/i);
  if (!m) return null;
  const word = m[1].replace(/^[^A-Za-z]+/, "").match(/^([A-Za-z]+)/);
  return word ? word[1].toLowerCase() : null;
}

function statusesAgree(prose, fm) {
  if (prose === fm) return true;
  const synonyms = { complete: "completed", completed: "complete" };
  return synonyms[prose] === fm;
}

// Validate one typed link ({ rel, target }) against the rel vocabulary + relTargetKinds rules.
// `label` is the noun used in messages, so the SAME check serves frontmatter `links` ("link") and
// per-step `refs` ("workflow step \"x\" ref") — single source, no second link checker. Pushes via add.
function validateRel(ctx, link, add, label = "link") {
  if (!link || typeof link !== "object") return add("error", `malformed ${label} (expected { rel, target })`);
  if (!ctx.relEnum.has(link.rel)) return add("error", `invalid ${label} rel "${link.rel}"`);
  if (!link.target) return add("error", `${label} rel ${link.rel} has no target`);
  const allowed = ctx.relTargetKinds[link.rel];
  const t = classifyTarget(ctx, link.target);
  if (allowed === "marker") {
    if (t.type !== "marker") add("error", `${label} rel ${link.rel} expects a milestone marker, got "${link.target}"`);
    else if (ctx.knownMilestones.size && !ctx.knownMilestones.has(t.milestone)) add("warning", `unknown milestone ${t.milestone}`);
  } else if (allowed === "external" || allowed === "any") {
    if (t.type === "internal" && !t.exists) add("error", `dangling ${label} target: ${link.target}`);
  } else if (Array.isArray(allowed)) {
    if (t.type !== "internal") add("error", `${label} rel ${link.rel} expects ${allowed.join("/")} target, got "${link.target}"`);
    else if (!t.exists) add("error", `dangling ${label} target: ${link.target}`);
    else if (!allowed.includes(t.kind)) add("error", `${label} rel ${link.rel} points at a ${t.kind} (${link.target}); expected ${allowed.join("/")}`);
  }
}

export function validateEntity(entity, ctx) {
  const issues = [];
  const add = (severity, message) => issues.push({ severity, file: entity.file, message });
  const fm = entity.fm ?? {};

  if (!entity.hasFrontmatter) {
    add("info", "pending migration — no frontmatter block yet");
    return issues;
  }

  // Field hygiene: derived fields authored, legacy fields to migrate.
  const migrate = [];
  for (const key of Object.keys(fm)) {
    if (ctx.authoredFields.has(key)) continue;
    migrate.push(ctx.derivedFields.has(key) ? `${key} (derived — remove)` : `${key} (→ tags/links)`);
  }
  if (migrate.length) add("info", `frontmatter fields to migrate: ${migrate.join(", ")}`);

  // Required authored fields (single source — same set the schema-parity self-test pins).
  for (const field of REQUIRED_AUTHORED) {
    if (!fm[field]) add("error", `missing required field: ${field}`);
  }

  // status ∈ per-kind enum.
  const enumForKind = ctx.statusEnums[entity.kind];
  if (fm.status && enumForKind && !enumForKind.has(fm.status)) {
    add("error", `invalid status "${fm.status}" for kind ${entity.kind} (expected: ${[...enumForKind].join(", ")})`);
  }

  // updated: ISO + not in the future.
  if (fm.updated) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.updated)) add("error", `updated not ISO YYYY-MM-DD: "${fm.updated}"`);
    else if (daysSince(fm.updated) < 0) add("warning", `updated is in the future: ${fm.updated}`);
  }

  // Conventional sections for the kind — convention, not contract → warning, never error.
  for (const section of ctx.requiredSections[entity.kind] ?? []) {
    if (!entity.sections[section]) add("warning", `missing conventional section: ${section}`);
  }

  // tags.
  if (fm.tags && typeof fm.tags === "object" && !Array.isArray(fm.tags)) {
    for (const [key, val] of Object.entries(fm.tags)) {
      if (ctx.primitiveKeys.has(key)) {
        add("error", `tag "${key}" shadows a primitive — belongs in ${key === "supersedes" || key === "superseded-by" ? "links" : "the core fields"}, not tags`);
        continue;
      }
      const reg = ctx.tagRegistry[key];
      if (!reg) {
        add("info", `unknown tag key "${key}" (allowed; promote if it recurs)`);
      } else if (reg.type === "enum" && !reg.values.includes(val)) {
        add("error", `invalid tag ${key}="${val}" (expected: ${reg.values.join(", ")})`);
      } else if (reg.lintAgainst && !reg.lintAgainst.includes(val) && !reg.unknownAllowed) {
        add("warning", `unfamiliar ${key} "${val}" (known: ${reg.lintAgainst.join(", ")}; allowed)`);
      }
    }
  } else if (fm.tags) {
    add("warning", "tags is not a map");
  }

  // links.
  if (Array.isArray(fm.links)) {
    for (const link of fm.links) validateRel(ctx, link, add, "link");
  } else if (fm.links) {
    add("warning", "links is not a sequence");
  }

  // Prose ↔ frontmatter status agreement (severity per config rollout).
  if (ctx.proseSeverity !== "off") {
    const prose = proseStatusWord(entity.fullText ?? "");
    if (prose && fm.status && enumForKind?.has(prose) && !statusesAgree(prose, fm.status)) {
      add(ctx.proseSeverity, `prose status "${prose}" disagrees with frontmatter status "${fm.status}"`);
    }
  }

  // Swimlane body — only for kinds that ARE workflows (config carriesSwimlanes). This is the
  // one kind-aware check, and it reads a config-derived list, so the engine stays domain-neutral.
  // entity.workflow was parsed once at load (lib/contract.mjs): null | { value } | { error }.
  if (ctx.swimlaneKinds?.includes(entity.kind) && ctx.swimlaneSeverity && ctx.swimlaneSeverity !== "off") {
    const wf = entity.workflow;
    if (wf?.error) {
      add(ctx.swimlaneSeverity, `workflow block is not valid JSON: ${wf.error}`);
    } else if (wf && wf.value !== undefined) {
      for (const issue of validateSwimlane(wf.value, { laneKinds: ctx.swimlaneLaneKinds, severity: ctx.swimlaneSeverity })) {
        add(issue.severity, issue.path ? `workflow ${issue.path}: ${issue.message}` : `workflow: ${issue.message}`);
      }
      // Per-step refs: typed links into the planning graph, validated like fm.links (relTargetKinds).
      for (const step of Array.isArray(wf.value.steps) ? wf.value.steps : []) {
        if (step?.refs == null) continue;
        const sid = typeof step.id === "string" ? step.id : "?";
        if (!Array.isArray(step.refs)) { add(ctx.swimlaneSeverity, `workflow step "${sid}" refs must be an array`); continue; }
        for (const ref of step.refs) validateRel(ctx, ref, add, `workflow step "${sid}" ref`);
      }
    }
    // wf == null (no block) → nothing here; a required-but-missing Workflow section already warns.
  }

  return issues;
}

export function run(opts) {
  const ctx = loadContract(opts);
  const entities = loadEntities(ctx);
  const issues = entities.flatMap((e) => validateEntity(e, ctx));
  const migrated = entities.filter((e) => e.hasFrontmatter).length;
  const counts = {
    error: issues.filter((i) => i.severity === "error").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
  return { ctx, entities, issues, migrated, counts };
}

function printReport({ ctx, entities, issues, migrated, counts }) {
  console.log(
    `[${ctx.project}] ${entities.length} files across ${ctx.kinds.length} kinds — ` +
      `${migrated} with frontmatter, ${entities.length - migrated} pending; ` +
      `${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`,
  );
  const order = { error: 0, warning: 1, info: 2 };
  for (const issue of [...issues].sort((a, b) => order[a.severity] - order[b.severity])) {
    console.log(`${issue.severity.toUpperCase()}: ${issue.file}: ${issue.message}`);
  }
  return counts.error === 0;
}

// Compact, never-failing health line for an advisory SessionStart hook. Always prints one
// line; on a broken tree it also lists the error/warning issues so the agent sees WHICH
// files are off at session open. main() returns after this (exit 0) — it must never gate a
// session: a red tree should not stop you opening one to fix it.
function printSummary({ ctx, entities, issues, counts }) {
  console.log(
    `[${ctx.project}] ${entities.length} files · ${counts.error} errors · ${counts.warning} warnings · ${counts.info} info`,
  );
  if (counts.error > 0) {
    const order = { error: 0, warning: 1 };
    for (const issue of issues.filter((i) => i.severity in order).sort((a, b) => order[a.severity] - order[b.severity])) {
      console.log(`${issue.severity.toUpperCase()}: ${issue.file}: ${issue.message}`);
    }
  }
}

// Run `fn`, capturing everything it writes to console.log as an array of lines (used by the
// self-test to assert printSummary's shape without spawning a subprocess).
function captureLines(fn) {
  const orig = console.log;
  const out = [];
  console.log = (...a) => out.push(a.join(" "));
  try { fn(); } finally { console.log = orig; }
  return out;
}

// --- self-test: assert the checks themselves catch what they should ----------
// Hermetic: builds a synthetic ctx + a throwaway fixture tree, independent of any
// real project config, so it tests the LOGIC, not a particular project's content.

function syntheticCtx(projectRoot) {
  return {
    project: "synthetic",
    projectRoot,
    kinds: ["decision", "pipeline", "report", "workflow"],
    folderByKind: { decision: "decisions", pipeline: "pipeline", report: "reports", workflow: "workflows" },
    kindByFolder: { decisions: "decision", pipeline: "pipeline", reports: "report", workflows: "workflow" },
    statusEnums: {
      decision: new Set(["proposed", "accepted", "superseded", "rejected"]),
      pipeline: new Set(["design", "qualify", "build", "ship", "archive", "shelved"]),
      report: new Set(["draft", "complete"]),
      workflow: new Set(["draft", "active", "deprecated"]),
    },
    requiredSections: { decision: ["Context"], pipeline: [], report: [], workflow: ["Workflow"] },
    swimlaneKinds: ["workflow"],
    swimlaneLaneKinds: new Set(["human", "ai", "system", "tool", "neutral"]),
    swimlaneSeverity: "error",
    workflowSection: "Workflow",
    tagRegistry: {
      priority: { type: "enum", values: ["high", "medium", "low"] },
      scope: { type: "string", lintAgainst: ["alpha", "beta"], unknownAllowed: true },
    },
    relEnum: new Set(loadBaseSchema().$defs.rel.enum),
    relTargetKinds: { "superseded-by": ["decision"], predecessor: ["pipeline", "report"], milestone: "marker", references: "any" },
    knownMilestones: new Set(["M5"]),
    milestonePattern: /^M\d+$/,
    proseSeverity: "error",
    primitiveKeys: PRIMITIVE_KEYS,
    derivedFields: DERIVED_FIELDS,
    authoredFields: AUTHORED_FIELDS,
  };
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "ps-validate-"));
  try {
    mkdirSync(join(root, "_project", "decisions"), { recursive: true });
    writeFileSync(join(root, "_project", "decisions", "sample.md"), "---\ntitle: S\nstatus: accepted\nupdated: 2026-06-20\n---\n\n## Context\n\nx\n");
    const ctx = syntheticCtx(root);
    const sectionsFor = (kind) => Object.fromEntries((ctx.requiredSections[kind] ?? []).map((s) => [s, "x"]));
    const base = (over = {}) => ({
      kind: "decision",
      id: "synthetic",
      file: "synthetic.md",
      hasFrontmatter: true,
      sections: sectionsFor("decision"),
      fullText: "",
      fm: { title: "T", status: "accepted", updated: "2026-06-20" },
      ...over,
    });
    const errs = (e) => validateEntity(e, ctx).filter((i) => i.severity === "error");
    // A workflow-kind entity carrying a parsed swimlane (mirrors what loadEntities produces).
    const wf = (workflow, over = {}) => ({
      kind: "workflow", id: "wfx", file: "workflows/wfx.md", hasFrontmatter: true,
      sections: { Workflow: "present" }, fullText: "",
      fm: { title: "T", status: "draft", updated: "2026-06-20" },
      workflow, ...over,
    });
    const cases = [
      ["valid decision → 0 errors", () => errs(base()).length === 0],
      ["bad status enum → error", () => errs(base({ fm: { title: "T", status: "active", updated: "2026-06-20" } })).some((i) => /invalid status/.test(i.message))],
      ["missing title → error", () => errs(base({ fm: { status: "accepted", updated: "2026-06-20" } })).some((i) => /missing required field: title/.test(i.message))],
      ["bad date format → error", () => errs(base({ fm: { title: "T", status: "accepted", updated: "June 20" } })).some((i) => /not ISO/.test(i.message))],
      ["missing section → warning (not error)", () => { const r = validateEntity(base({ sections: {} }), ctx); return r.some((i) => i.severity === "warning" && /missing conventional section/.test(i.message)) && !r.some((i) => i.severity === "error"); }],
      ["primitive-shadowing tag → error", () => errs(base({ fm: { title: "T", status: "accepted", updated: "2026-06-20", tags: { status: "x" } } })).some((i) => /shadows a primitive/.test(i.message))],
      ["tag outside lintAgainst with unknownAllowed → silent (no warning)", () => !validateEntity(base({ fm: { title: "T", status: "accepted", updated: "2026-06-20", tags: { scope: "gamma" } } }), ctx).some((i) => /unfamiliar scope/.test(i.message))],
      ["tag outside lintAgainst without unknownAllowed → warning", () => { const c = { ...ctx, tagRegistry: { ...ctx.tagRegistry, scope: { type: "string", lintAgainst: ["alpha", "beta"] } } }; return validateEntity(base({ fm: { title: "T", status: "accepted", updated: "2026-06-20", tags: { scope: "gamma" } } }), c).some((i) => i.severity === "warning" && /unfamiliar scope/.test(i.message)); }],
      ["dangling link → error", () => errs(base({ fm: { title: "T", status: "accepted", updated: "2026-06-20", links: [{ rel: "superseded-by", target: "decisions/does-not-exist" }] } })).some((i) => /dangling/.test(i.message))],
      ["wrong-kind link → error", () => errs(base({ fm: { title: "T", status: "accepted", updated: "2026-06-20", links: [{ rel: "predecessor", target: "decisions/sample" }] } })).some((i) => /expected pipeline\/report/.test(i.message))],
      ["valid milestone marker → 0 errors", () => errs(base({ fm: { title: "T", status: "accepted", updated: "2026-06-20", links: [{ rel: "milestone", target: "M5" }] } })).length === 0],
      ["no frontmatter → pending info, no error", () => { const r = validateEntity(base({ hasFrontmatter: false }), ctx); return r.length === 1 && r[0].severity === "info"; }],
      ["prose↔fm mismatch → ratcheted severity", () => validateEntity(base({ fullText: "> **Status:** proposed (draft)" }), ctx).some((i) => i.severity === ctx.proseSeverity && /disagrees/.test(i.message))],
      ["--summary on a clean tree → exactly one compact line", () => {
        const lines = captureLines(() => printSummary({ ctx, entities: [base()], issues: [], counts: { error: 0, warning: 0, info: 0 } }));
        return lines.length === 1 && lines[0] === "[synthetic] 1 files · 0 errors · 0 warnings · 0 info";
      }],
      ["--summary on a broken tree → header + the offending error line", () => {
        const lines = captureLines(() => printSummary({ ctx, entities: [base()], issues: [{ severity: "error", file: "decisions/x.md", message: "boom" }], counts: { error: 1, warning: 0, info: 0 } }));
        return lines.length === 2 && /^\[synthetic\] 1 files · 1 errors/.test(lines[0]) && lines[1] === "ERROR: decisions/x.md: boom";
      }],
      // --- swimlane validation (gated on carriesSwimlanes) ---
      ["valid swimlane → 0 errors", () => errs(wf({ value: { lanes: [{ id: "you", label: "You", kind: "human" }], steps: [{ id: "a", lane: "you", label: "A", to: [] }] } })).length === 0],
      ["dangling step.to → error", () => errs(wf({ value: { lanes: [{ id: "you", label: "You" }], steps: [{ id: "a", lane: "you", label: "A", to: ["ghost"] }] } })).some((i) => /workflow .*to/.test(i.message))],
      ["step.lane references missing lane → error", () => errs(wf({ value: { lanes: [{ id: "you", label: "You" }], steps: [{ id: "a", lane: "ghost", label: "A", to: [] }] } })).some((i) => /workflow .*lane/.test(i.message))],
      ["duplicate step id → error", () => errs(wf({ value: { lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: [] }, { id: "a", lane: "l", label: "B", to: [] }] } })).some((i) => /duplicate step id/.test(i.message))],
      ["unknown lane.kind → warning, not error", () => { const r = validateEntity(wf({ value: { lanes: [{ id: "l", label: "L", kind: "robot" }], steps: [{ id: "a", lane: "l", label: "A", to: [] }] } }), ctx); return r.some((i) => i.severity === "warning" && /lane kind/.test(i.message)) && !r.some((i) => i.severity === "error"); }],
      ["unreachable step → warning, not error", () => { const r = validateEntity(wf({ value: { lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: [] }, { id: "b", lane: "l", label: "B", to: ["c"] }, { id: "c", lane: "l", label: "C", to: ["b"] }] } }), ctx); return r.some((i) => i.severity === "warning" && /unreachable/.test(i.message)) && !r.some((i) => i.severity === "error"); }],
      ["malformed workflow JSON → error", () => errs(wf({ error: "invalid JSON (boom)" })).some((i) => /not valid JSON/.test(i.message))],
      ["swimlane severity off → suppressed", () => validateEntity(wf({ value: { lanes: [], steps: [{ lane: "x", label: "Y", to: ["ghost"] }] } }), { ...ctx, swimlaneSeverity: "off" }).every((i) => !/workflow/.test(i.message))],
      ["non-swimlane kind ignores a broken ## Workflow block (gate proof)", () => !validateEntity(base({ workflow: { value: { lanes: "bad" } } }), ctx).some((i) => /workflow/.test(i.message))],
      ["step ref to a real target → 0 errors", () => errs(wf({ value: { lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: [], refs: [{ rel: "references", target: "decisions/sample" }] }] } })).length === 0],
      ["step ref to a missing target → error", () => errs(wf({ value: { lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: [], refs: [{ rel: "references", target: "decisions/nope" }] }] } })).some((i) => /dangling workflow step .* ref target/.test(i.message))],
      ["step ref with wrong-kind rel → error", () => errs(wf({ value: { lanes: [{ id: "l", label: "L" }], steps: [{ id: "a", lane: "l", label: "A", to: [], refs: [{ rel: "predecessor", target: "decisions/sample" }] }] } })).some((i) => /expected pipeline\/report/.test(i.message))],
      // --- schema parity (CF-6b): the validator's hand-coded constants must still mirror the
      // canonical base schema, else schema and checker drift silently. Both pass today → a guard. ---
      ["schema parity — tag shadow-rule equals PRIMITIVE_KEYS", () => {
        const shadow = (loadBaseSchema().properties?.tags?.not?.anyOf ?? []).flatMap((c) => c.required ?? []);
        return [...shadow].sort().join(",") === [...PRIMITIVE_KEYS].sort().join(",");
      }],
      ["schema parity — base.required equals REQUIRED_AUTHORED ∪ DERIVED_FIELDS", () => {
        const req = [...(loadBaseSchema().required ?? [])].sort().join(",");
        return req === [...REQUIRED_AUTHORED, ...DERIVED_FIELDS].sort().join(",");
      }],
      // --- ctx-drift guard (CF-4): the hand-built syntheticCtx must not reference a ctx key the
      // real buildContext seam no longer produces (a renamed/removed field would break the real
      // path while this synthetic test stayed green). ---
      ["synthetic ctx keys ⊆ buildContext output (no parallel-ctx drift)", () => {
        const real = buildContext({ project: "p", kinds: { decision: { folder: "decisions", status: ["proposed", "accepted"] } } }, { configPath: "/x/c.json", projectRoot: "/x" });
        const realKeys = new Set(Object.keys(real));
        return Object.keys(syntheticCtx(root)).every((k) => realKeys.has(k));
      }],
    ];
    let pass = 0;
    for (const [name, fn] of cases) {
      let ok = false;
      try { ok = fn(); } catch { ok = false; }
      console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
      if (ok) pass += 1;
    }
    console.log(`self-test: ${pass}/${cases.length} passed`);
    return pass === cases.length;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

  const { opts, rest } = readProjectArgs(argv);
  let result;
  try {
    result = run(opts);
  } catch (e) {
    console.error(`validate: ${e.message}`);
    process.exit(1);
  }
  if (rest.includes("--summary")) {
    printSummary(result); // advisory SessionStart hook — returns (exit 0) regardless of errors
    return;
  }
  if (rest.includes("--json")) {
    console.log(JSON.stringify({ summary: { project: result.ctx.project, files: result.entities.length, migrated: result.migrated, ...result.counts }, issues: result.issues }, null, 2));
    return;
  }
  process.exit(printReport(result) ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
