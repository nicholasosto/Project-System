#!/usr/bin/env node
// Generate a valid project-system.config.json — the ONE project-specific file an adopter writes.
// This replaces "copy an example and hand-edit it": it takes a compact spec (the kinds a project
// plans, their folders/status enums/filename schemes/sections) and/or the built-in `standard`
// preset, fills the conventional defaults, and proves the result loads through the framework's own
// loader (lib/contract.mjs buildContext — the SAME path the engines use) before writing. So a
// generated config is conformant by construction, exactly as new-entity.mjs guarantees for entities.
//
// It is the deterministic engine behind the consumer "setup-project-system" skill: the skill runs
// the naming-convention interview and assembles the spec; this tool normalizes, validates, and writes.
//
// Usage:
//   node tools/init-config.mjs --preset standard --project my-project        # the canonical 6 kinds
//   echo '<spec json>' | node tools/init-config.mjs --spec - --project my-project
//   node tools/init-config.mjs --spec spec.json [--out path] [--dry-run] [--force]
//   node tools/init-config.mjs --self-test
//
//   --spec <path|->     a JSON spec: { project?, extends?, kinds[], tagRegistry?, relTargetKinds?,
//                       milestones?, render?, proseStatusEnforcement? }. '-' reads stdin.
//   --preset <name>     start from a built-in preset (standard) — merged under the spec.
//   --project <slug>    set/override the project slug.
//   --out <path>        where to write (default <root>/project-system.config.json).
//   --schema-path <p>   the $schema pointer to embed (default the vendored consumer path).
//   --root <dir>        the project root (where the config + _project/ live). Default: cwd.
//   --force             overwrite an existing config.
//   --dry-run           print the config to stdout instead of writing it.
//   --self-test         assert the generator's invariants (hermetic).
//
// A spec `kinds` entry: { name, folder?, status[], initialStatus?, filename?, serialPad?,
//   requiredSections?, scaffoldSections?, carriesSwimlanes?, render? }. `kinds` may also be a
// name→spec map. Defaults: folder=name · initialStatus=status[0] · filename=slug · serialPad=4 ·
// scaffoldSections=requiredSections.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildContext, readProjectArgs } from "../lib/contract.mjs";

const FILENAME_SCHEMES = new Set(["serial", "date-slug", "slug"]);
// Default $schema pointer for a CONSUMER (the schema is vendored under .project-system/). Override
// with --schema-path for a different layout (the framework's own config points at ./schema/...).
const DEFAULT_SCHEMA_PATH = "./.project-system/schema/project-config.schema.json";

// The starter `## Workflow` swimlane stub the scaffolder lays down. Mirrors the framework's own
// project-system.config.json sectionHints.Workflow — a born-valid swimlane (referentially clean,
// known lane kinds + statuses) that also demonstrates status/detail/note so authors discover them.
const WORKFLOW_SECTION_HINT =
  "<!-- lanes: who acts; kind is one of human, ai, system, tool, neutral.\n     steps: each needs a lane + label. Optional: status (done|active|pending|blocked|skipped)\n     tints the card; detail shows on the card; note shows in the inspector when the step is\n     clicked; to[] lists the next step id(s) ([] marks a terminal step). -->\n```json\n{\n  \"caption\": \"<one line: what this process reliably produces>\",\n  \"lanes\": [\n    { \"id\": \"you\", \"label\": \"You\", \"kind\": \"human\" },\n    { \"id\": \"system\", \"label\": \"System\", \"kind\": \"system\" }\n  ],\n  \"steps\": [\n    { \"id\": \"start\", \"lane\": \"you\", \"label\": \"<trigger>\", \"status\": \"done\", \"detail\": \"<shown on the card>\", \"to\": [\"work\"] },\n    { \"id\": \"work\", \"lane\": \"system\", \"label\": \"<step>\", \"status\": \"active\", \"note\": \"<shown in the inspector on click>\", \"to\": [] }\n  ]\n}\n```";

// The canonical starting point — the framework's own six planning kinds, domain-neutral. A consumer
// `extends: "standard"` then adds/overrides kinds. This is the spec form (kinds as an array) the
// preset is merged from; nothing here is a project/domain word.
const STANDARD_PRESET = {
  kinds: [
    { name: "decision", folder: "decisions", status: ["proposed", "accepted", "superseded", "rejected"], filename: "serial", requiredSections: ["Context"], scaffoldSections: ["Context", "Decision", "Consequences", "Options considered", "Cites", "Re-open if"] },
    { name: "report", folder: "reports", status: ["draft", "complete"], filename: "date-slug", scaffoldSections: ["Outcome", "Surprises", "Decisions made", "Carry-forward", "Verification evidence"] },
    { name: "pipeline", folder: "pipeline", status: ["design", "qualify", "build", "ship", "archive", "shelved"], filename: "slug", scaffoldSections: ["Context", "Build plan", "Exit criteria"] },
    { name: "roadmap", folder: "roadmap", status: ["proposed", "active", "superseded", "complete"], filename: "slug", requiredSections: ["Context"], scaffoldSections: ["Context", "Plan", "Open questions"] },
    { name: "session", folder: "sessions", status: ["planned", "active", "blocked", "completed", "shelved"], filename: "date-slug", requiredSections: ["Goal", "Success Criteria", "Source References", "Decisions", "Outputs", "Blockers", "Next Action", "Handoff Notes"] },
    { name: "workflow", folder: "workflows", status: ["draft", "active", "deprecated"], filename: "slug", carriesSwimlanes: true, requiredSections: ["Workflow"], scaffoldSections: ["Purpose", "Workflow"] },
  ],
  tagRegistry: {
    priority: { type: "enum", values: ["high", "medium", "low"] },
    agent: { type: "enum", values: ["neutral", "codex", "claude", "human"] },
    horizon: { type: "enum", values: ["milestone", "phase", "cross-domain"] },
  },
  relTargetKinds: {
    supersedes: ["decision", "roadmap"],
    "superseded-by": ["decision", "roadmap"],
    predecessor: ["pipeline", "report"],
    successor: ["pipeline", "report"],
    "decided-in": ["decision"],
    milestone: "marker",
    implements: "external",
    references: "any",
  },
  // A fresh consumer starts lenient on prose↔frontmatter; tighten to "error" once adopted.
  proseStatusEnforcement: { rollout: "warn" },
  // Born-valid starter for the `## Workflow` swimlane section, surfaced by `/new workflow`.
  sectionHints: { Workflow: WORKFLOW_SECTION_HINT },
};

const PRESETS = { standard: STANDARD_PRESET };

// Accept kinds as an array of { name, … } OR a name→spec map; normalize to an array.
function asKindArray(kinds) {
  if (Array.isArray(kinds)) return kinds.map((k) => ({ ...k }));
  if (kinds && typeof kinds === "object") return Object.entries(kinds).map(([name, spec]) => ({ name, ...(spec ?? {}) }));
  return [];
}

// Layer spec kinds over preset kinds: same name → shallow-merge (override); new name → append.
function mergeKinds(presetKinds, specKinds) {
  const out = presetKinds.map((k) => ({ ...k }));
  const idx = new Map(out.map((k, i) => [k.name, i]));
  for (const k of specKinds) {
    if (!k || !k.name) throw new Error('each kind needs a "name"');
    if (idx.has(k.name)) out[idx.get(k.name)] = { ...out[idx.get(k.name)], ...k };
    else {
      idx.set(k.name, out.length);
      out.push({ ...k });
    }
  }
  return out;
}

// One kind spec → the config-shaped object, with defaults filled and only meaningful keys emitted
// (in house order). Throws on the meta-schema constraints buildContext doesn't itself police.
function normalizeKind(k) {
  const name = k.name;
  if (!name || typeof name !== "string") throw new Error('each kind needs a string "name"');
  const folder = k.folder ?? name;
  const status = Array.isArray(k.status) ? k.status.filter(Boolean) : [];
  if (!status.length) throw new Error(`kind "${name}" needs a non-empty status[]`);
  const filename = k.filename ?? "slug";
  if (!FILENAME_SCHEMES.has(filename)) throw new Error(`kind "${name}" has invalid filename "${filename}" (expected: serial · date-slug · slug)`);
  const initialStatus = k.initialStatus ?? status[0];
  if (!status.includes(initialStatus)) throw new Error(`kind "${name}" initialStatus "${initialStatus}" not in its status enum [${status.join(", ")}]`);
  const required = Array.isArray(k.requiredSections) ? k.requiredSections : [];
  const scaffold = Array.isArray(k.scaffoldSections) ? k.scaffoldSections : required;

  const out = { folder, status, initialStatus, filename };
  if (filename === "serial") out.serialPad = Number.isInteger(k.serialPad) ? k.serialPad : 4;
  if (required.length) out.requiredSections = required;
  // scaffoldSections defaults to requiredSections in the loader, so only emit it when it differs.
  if (scaffold.length && JSON.stringify(scaffold) !== JSON.stringify(required)) out.scaffoldSections = scaffold;
  if (k.carriesSwimlanes) out.carriesSwimlanes = true;
  if (k.render && typeof k.render === "object") out.render = k.render;
  return { name, kind: out };
}

// Assemble a complete, house-ordered config object from a spec (+ optional preset). Pure — no I/O.
function buildConfig(spec, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const presetName = spec.extends ?? spec.preset;
  const preset = presetName ? PRESETS[presetName] : null;
  if (presetName && !preset) throw new Error(`unknown preset "${presetName}" (available: ${Object.keys(PRESETS).join(", ")})`);

  const project = spec.project;
  if (!project || typeof project !== "string") throw new Error('a "project" slug is required (--project <slug> or spec.project)');

  const merged = mergeKinds(preset ? asKindArray(preset.kinds) : [], asKindArray(spec.kinds));
  if (!merged.length) throw new Error("at least one kind is required — give kinds[] or --preset standard");

  const kinds = {};
  const folders = new Map();
  for (const raw of merged) {
    const { name, kind } = normalizeKind(raw);
    if (kinds[name]) throw new Error(`duplicate kind "${name}"`);
    if (folders.has(kind.folder)) throw new Error(`kinds "${folders.get(kind.folder)}" and "${name}" share folder "${kind.folder}"`);
    folders.set(kind.folder, name);
    kinds[name] = kind;
  }

  const tagRegistry = spec.tagRegistry ?? preset?.tagRegistry;
  const relTargetKinds = spec.relTargetKinds ?? preset?.relTargetKinds;
  const prose = spec.proseStatusEnforcement ?? preset?.proseStatusEnforcement;
  const sectionHints = spec.sectionHints ?? preset?.sectionHints;

  // Build in the house key order ($schema first; render last).
  const cfg = { $schema: schemaPath, project };
  if (spec.projectRoot) cfg.projectRoot = spec.projectRoot;
  if (spec.demo) cfg.demo = true;
  cfg.kinds = kinds;
  if (sectionHints && Object.keys(sectionHints).length) cfg.sectionHints = sectionHints;
  if (tagRegistry && Object.keys(tagRegistry).length) cfg.tagRegistry = tagRegistry;
  if (relTargetKinds && Object.keys(relTargetKinds).length) cfg.relTargetKinds = relTargetKinds;
  if (Array.isArray(spec.milestones) && spec.milestones.length) cfg.milestones = spec.milestones;
  if (prose) cfg.proseStatusEnforcement = prose;
  if (spec.render && Object.keys(spec.render).length) cfg.render = spec.render;
  return cfg;
}

// Prove the config loads through the engines' own seam (single source) — no temp file, no I/O.
function validateConfig(cfg, outPath) {
  try {
    buildContext(cfg, { configPath: outPath, projectRoot: dirname(outPath) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function readSpec(specArg) {
  if (!specArg) return {};
  const text = specArg === "-" ? readFileSync(0, "utf8") : readFileSync(specArg, "utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`--spec is not valid JSON: ${e.message}`);
  }
}

function parseArgs(rest) {
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--self-test") opts.selfTest = true;
    else if (a === "--spec") opts.spec = rest[++i];
    else if (a === "--preset") opts.preset = rest[++i];
    else if (a === "--project") opts.project = rest[++i];
    else if (a === "--out") opts.out = rest[++i];
    else if (a === "--schema-path") opts.schemaPath = rest[++i];
    // unknown flags ignored (forward-compatible)
  }
  return opts;
}

// --- self-test: hermetic, builds + loads configs in memory (no disk) ----------
function selfTest() {
  const probePath = join(process.cwd(), ".ps-init-self-test", "project-system.config.json");
  const loads = (cfg) => validateConfig(cfg, probePath).ok;
  const throws = (fn, re) => {
    try {
      fn();
      return false;
    } catch (e) {
      return re ? re.test(e.message) : true;
    }
  };

  const cases = [
    ["standard preset builds 6 kinds + loads clean", () => { const c = buildConfig({ project: "p", extends: "standard" }); return Object.keys(c.kinds).length === 6 && loads(c); }],
    ["minimal spec loads; folder/initialStatus/filename defaulted", () => { const c = buildConfig({ project: "p", kinds: [{ name: "note", status: ["open", "done"] }] }); const k = c.kinds.note; return loads(c) && k.folder === "note" && k.initialStatus === "open" && k.filename === "slug"; }],
    ["kinds as a name→spec map is accepted", () => { const c = buildConfig({ project: "p", kinds: { note: { status: ["a"] } } }); return !!c.kinds.note && loads(c); }],
    ["missing project → throws", () => throws(() => buildConfig({ kinds: [{ name: "x", status: ["a"] }] }), /project/)],
    ["empty status → throws", () => throws(() => buildConfig({ project: "p", kinds: [{ name: "x", status: [] }] }), /non-empty status/)],
    ["duplicate folder → throws", () => throws(() => buildConfig({ project: "p", kinds: [{ name: "a", folder: "shared", status: ["s"] }, { name: "b", folder: "shared", status: ["s"] }] }), /share folder/)],
    ["invalid filename scheme → throws", () => throws(() => buildConfig({ project: "p", kinds: [{ name: "x", status: ["a"], filename: "weird" }] }), /invalid filename/)],
    ["initialStatus outside enum → throws", () => throws(() => buildConfig({ project: "p", kinds: [{ name: "x", status: ["a", "b"], initialStatus: "c" }] }), /initialStatus/)],
    ["scaffoldSections omitted when equal to required", () => { const c = buildConfig({ project: "p", kinds: [{ name: "x", status: ["a"], requiredSections: ["A", "B"] }] }); return !("scaffoldSections" in c.kinds.x) && JSON.stringify(c.kinds.x.requiredSections) === JSON.stringify(["A", "B"]); }],
    ["serialPad emitted only for serial scheme", () => { const c = buildConfig({ project: "p", kinds: [{ name: "d", status: ["a"], filename: "serial" }, { name: "s", status: ["a"], filename: "slug" }] }); return c.kinds.d.serialPad === 4 && !("serialPad" in c.kinds.s); }],
    ["extends standard + override a kind merges (not duplicates)", () => { const c = buildConfig({ project: "p", extends: "standard", kinds: [{ name: "decision", status: ["draft", "final"] }] }); return Object.keys(c.kinds).length === 6 && c.kinds.decision.status.join() === "draft,final" && loads(c); }],
    ["extends standard + a brand-new kind appends + loads", () => { const c = buildConfig({ project: "p", extends: "standard", kinds: [{ name: "character", folder: "characters", status: ["concept", "canon"], requiredSections: ["Concept"] }] }); return Object.keys(c.kinds).length === 7 && loads(c); }],
    ["unknown preset → throws", () => throws(() => buildConfig({ project: "p", extends: "nope" }), /unknown preset/)],
    ["$schema pointer is set + overridable", () => { const a = buildConfig({ project: "p", extends: "standard" }); const b = buildConfig({ project: "p", extends: "standard" }, { schemaPath: "./schema/project-config.schema.json" }); return a.$schema === DEFAULT_SCHEMA_PATH && b.$schema === "./schema/project-config.schema.json"; }],
  ];

  let pass = 0;
  for (const [name, fn] of cases) {
    let ok = false;
    try {
      ok = fn();
    } catch {
      ok = false;
    }
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

  const root = resolve(projOpts.root ?? process.cwd());
  const outPath = opts.out ? resolve(opts.out) : join(root, "project-system.config.json");

  let cfg;
  try {
    const spec = readSpec(opts.spec);
    if (opts.preset) spec.extends = opts.preset;
    if (opts.project) spec.project = opts.project;
    if (!opts.spec && !opts.preset && !spec.project) {
      throw new Error("nothing to build — pass --preset standard, or --spec <file|-> with kinds.");
    }
    cfg = buildConfig(spec, { schemaPath: opts.schemaPath ?? DEFAULT_SCHEMA_PATH });
  } catch (e) {
    console.error(`init-config: ${e.message}`);
    console.error('usage: node tools/init-config.mjs --preset standard --project <slug> [--dry-run]');
    process.exit(1);
  }

  const check = validateConfig(cfg, outPath);
  if (!check.ok) {
    console.error(`init-config: the generated config would not load — ${check.error}`);
    process.exit(1);
  }

  const json = `${JSON.stringify(cfg, null, 2)}\n`;

  if (opts.dryRun) {
    console.log(json);
    return;
  }

  if (existsSync(outPath) && !opts.force) {
    console.error(`init-config: refusing to overwrite existing ${outPath} (pass --force to replace it)`);
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
  const kindList = Object.keys(cfg.kinds).join(", ");
  console.log(`wrote ${outPath}`);
  console.log(`  project "${cfg.project}" · ${Object.keys(cfg.kinds).length} kinds: ${kindList}`);
  console.log("  validated: loads cleanly through lib/contract.mjs");
  console.log("  next: create the _project/<folder>/ tree with `node .project-system/tools/new-entity.mjs <kind> \"<title>\"`");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { buildConfig, validateConfig, normalizeKind, mergeKinds, STANDARD_PRESET };
