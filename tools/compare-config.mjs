#!/usr/bin/env node
// Score one project-system.config.json against another — the measurement half of the migration
// eval (see examples/soul-steel-premigration/). Given an `--expected` (golden, hand-authored) config
// and an `--actual` (e.g. the config the migrate-project-space skill inferred from a pre-framework
// snapshot), it reports per-axis recall/precision and an overall similarity score, so "how close did
// the inference land?" becomes a number you can eyeball or threshold.
//
// It is domain-neutral and structural: it compares config SHAPES (which kinds, their filename scheme,
// status enum, sections; the tag/rel registries) — it knows no kind name or domain word, so it doubles
// as a generic config-drift detector (regenerated vs committed).
//
// Scored axes (drive the headline `overall`):
//   · kinds            — set of kind names (recall/precision/F1)
//   · attributes       — per kind-in-both: filename · status enum (as a set) · initialStatus ·
//                        requiredSections (as a set) → accuracy over all matched-kind checkpoints
//   · tagRegistry      — set of tag keys (+ type) (recall/precision/F1), skipped if expected has none
//   · relTargetKinds   — set of rel keys (recall/precision/F1), skipped if expected has none
// Advisory axes (reported, NOT scored — they're normalization choices, not correctness):
//   · folder name · status-enum order · scaffoldSections · tag values · milestones · enforcement rollout
//
// Usage:
//   node tools/compare-config.mjs --expected <golden.json> --actual <inferred.json> [--json] [--min-score N]
//   node tools/compare-config.mjs --self-test
//     --min-score N   exit 1 if overall < N (0..1) — for CI/threshold use. Default: report only (exit 0).
//     --json          emit the machine-readable report instead of the human one.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ---- set algebra ------------------------------------------------------------
const keysOf = (obj) => (obj && typeof obj === "object" ? Object.keys(obj) : []);
const asArray = (v) => (Array.isArray(v) ? v : []);
const sameSet = (a, b) => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};
const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Precision/Recall/F1 over two key sets.
function prf(expectedKeys, actualKeys) {
  const exp = new Set(expectedKeys);
  const act = new Set(actualKeys);
  const tp = [...exp].filter((k) => act.has(k));
  const missing = [...exp].filter((k) => !act.has(k)); // expected, not produced (false negatives)
  const extra = [...act].filter((k) => !exp.has(k)); // produced, not expected (false positives)
  const recall = exp.size ? tp.length / exp.size : 1;
  const precision = act.size ? tp.length / act.size : 1;
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
  return { tp, missing, extra, recall, precision, f1, expectedCount: exp.size };
}

// ---- the comparison ---------------------------------------------------------
function compare(expected, actual) {
  const advisories = [];
  const expKinds = expected.kinds ?? {};
  const actKinds = actual.kinds ?? {};

  const kinds = prf(keysOf(expKinds), keysOf(actKinds));

  // Attribute accuracy over kinds present in both.
  let checks = 0;
  let hits = 0;
  const attrDiffs = [];
  for (const name of kinds.tp) {
    const e = expKinds[name];
    const a = actKinds[name];
    const checkpoints = [
      ["filename", (e.filename ?? "slug") === (a.filename ?? "slug")],
      ["status", sameSet(asArray(e.status), asArray(a.status))],
      ["initialStatus", (e.initialStatus ?? asArray(e.status)[0]) === (a.initialStatus ?? asArray(a.status)[0])],
      ["requiredSections", sameSet(asArray(e.requiredSections), asArray(a.requiredSections))],
    ];
    for (const [attr, ok] of checkpoints) {
      checks += 1;
      if (ok) hits += 1;
      else attrDiffs.push({ kind: name, attr, expected: e[attr] ?? null, actual: a[attr] ?? null });
    }
    // Advisory, per matched kind.
    if ((e.folder ?? name) !== (a.folder ?? name)) advisories.push({ axis: "folder", kind: name, expected: e.folder ?? name, actual: a.folder ?? name });
    if (sameSet(asArray(e.status), asArray(a.status)) && !sameOrder(asArray(e.status), asArray(a.status))) advisories.push({ axis: "status-order", kind: name, expected: e.status, actual: a.status });
    if (!sameSet(asArray(e.scaffoldSections), asArray(a.scaffoldSections))) advisories.push({ axis: "scaffoldSections", kind: name });
  }
  const attributes = { checks, hits, accuracy: checks ? hits / checks : 1, diffs: attrDiffs };

  // Tag registry (keys + type). Scored only if the golden declares any.
  const tagRegistry = prf(keysOf(expected.tagRegistry), keysOf(actual.tagRegistry));
  for (const k of tagRegistry.tp) {
    const e = expected.tagRegistry[k];
    const a = actual.tagRegistry[k];
    if ((e?.type ?? null) !== (a?.type ?? null)) attrDiffs.push({ kind: `tag:${k}`, attr: "type", expected: e?.type ?? null, actual: a?.type ?? null });
    if (e?.type === "enum" && !sameSet(asArray(e.values), asArray(a.values))) advisories.push({ axis: "tag-values", key: k });
  }
  const relTargetKinds = prf(keysOf(expected.relTargetKinds), keysOf(actual.relTargetKinds));

  // Advisory scalars.
  if (!sameSet(asArray(expected.milestones), asArray(actual.milestones))) advisories.push({ axis: "milestones", expected: expected.milestones ?? null, actual: actual.milestones ?? null });
  const eRoll = expected.proseStatusEnforcement?.rollout ?? null;
  const aRoll = actual.proseStatusEnforcement?.rollout ?? null;
  if (eRoll !== aRoll) advisories.push({ axis: "proseStatusEnforcement.rollout", expected: eRoll, actual: aRoll });

  // Overall: mean of the scored axes the golden actually exercises.
  const parts = [kinds.f1, attributes.accuracy];
  if (tagRegistry.expectedCount) parts.push(tagRegistry.f1);
  if (relTargetKinds.expectedCount) parts.push(relTargetKinds.f1);
  const overall = parts.reduce((s, x) => s + x, 0) / parts.length;

  return { overall, kinds, attributes, tagRegistry, relTargetKinds, advisories };
}

// ---- reporting --------------------------------------------------------------
const pct = (n) => `${(n * 100).toFixed(0)}%`;
function humanReport(r) {
  const L = [];
  L.push(`overall similarity: ${pct(r.overall)}`);
  L.push("");
  L.push(`kinds            recall ${pct(r.kinds.recall)} · precision ${pct(r.kinds.precision)} · F1 ${pct(r.kinds.f1)}`);
  if (r.kinds.missing.length) L.push(`  missing (expected, not inferred): ${r.kinds.missing.join(", ")}`);
  if (r.kinds.extra.length) L.push(`  extra (inferred, not expected):   ${r.kinds.extra.join(", ")}`);
  L.push(`attributes       accuracy ${pct(r.attributes.accuracy)}  (${r.attributes.hits}/${r.attributes.checks} checkpoints over matched kinds)`);
  for (const d of r.attributes.diffs) L.push(`  ✗ ${d.kind}.${d.attr}: expected ${JSON.stringify(d.expected)} · got ${JSON.stringify(d.actual)}`);
  if (r.tagRegistry.expectedCount) {
    L.push(`tagRegistry      recall ${pct(r.tagRegistry.recall)} · precision ${pct(r.tagRegistry.precision)} · F1 ${pct(r.tagRegistry.f1)}`);
    if (r.tagRegistry.missing.length) L.push(`  missing: ${r.tagRegistry.missing.join(", ")}`);
    if (r.tagRegistry.extra.length) L.push(`  extra:   ${r.tagRegistry.extra.join(", ")}`);
  }
  if (r.relTargetKinds.expectedCount) {
    L.push(`relTargetKinds   recall ${pct(r.relTargetKinds.recall)} · precision ${pct(r.relTargetKinds.precision)} · F1 ${pct(r.relTargetKinds.f1)}`);
    if (r.relTargetKinds.missing.length) L.push(`  missing: ${r.relTargetKinds.missing.join(", ")}`);
  }
  if (r.advisories.length) {
    L.push("");
    L.push(`advisory (not scored — normalization choices, ${r.advisories.length}):`);
    for (const a of r.advisories) {
      if (a.axis === "folder") L.push(`  · folder ${a.kind}: golden "${a.expected}" vs inferred "${a.actual}"`);
      else if (a.axis === "status-order") L.push(`  · status order differs for ${a.kind} (same set)`);
      else if (a.axis === "scaffoldSections") L.push(`  · scaffoldSections differ for ${a.kind}`);
      else if (a.axis === "tag-values") L.push(`  · tag values differ for "${a.key}"`);
      else L.push(`  · ${a.axis}: golden ${JSON.stringify(a.expected)} vs inferred ${JSON.stringify(a.actual)}`);
    }
  }
  return L.join("\n");
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`cannot read config "${path}": ${e.message}`);
  }
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--self-test") opts.selfTest = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--expected") opts.expected = argv[++i];
    else if (a === "--actual") opts.actual = argv[++i];
    else if (a === "--min-score") opts.minScore = Number(argv[++i]);
  }
  return opts;
}

// ---- self-test (hermetic; configs built in memory) --------------------------
function selfTest() {
  const golden = {
    kinds: {
      decision: { folder: "decisions", filename: "serial", status: ["proposed", "accepted", "superseded"], initialStatus: "proposed", requiredSections: ["Context"] },
      report: { folder: "reports", filename: "date-slug", status: ["draft", "complete"], initialStatus: "draft" },
    },
    tagRegistry: { priority: { type: "enum", values: ["high", "low"] } },
    relTargetKinds: { references: "any" },
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const cases = [
    ["identical → overall 1, nothing missing/extra", () => { const r = compare(golden, clone(golden)); return r.overall === 1 && !r.kinds.missing.length && !r.kinds.extra.length && !r.attributes.diffs.length; }],
    ["dropped kind → in missing, kindRecall < 1", () => { const a = clone(golden); delete a.kinds.report; const r = compare(golden, a); return r.kinds.missing.includes("report") && r.kinds.recall < 1 && r.overall < 1; }],
    ["extra kind → in extra, kindPrecision < 1", () => { const a = clone(golden); a.kinds.workflow = { folder: "workflows", filename: "slug", status: ["draft"] }; const r = compare(golden, a); return r.kinds.extra.includes("workflow") && r.kinds.precision < 1; }],
    ["wrong filename scheme → attribute diff", () => { const a = clone(golden); a.kinds.decision.filename = "slug"; const r = compare(golden, a); return r.attributes.accuracy < 1 && r.attributes.diffs.some((d) => d.kind === "decision" && d.attr === "filename"); }],
    ["different status set → attribute diff", () => { const a = clone(golden); a.kinds.decision.status = ["proposed", "accepted"]; const r = compare(golden, a); return r.attributes.diffs.some((d) => d.kind === "decision" && d.attr === "status"); }],
    ["status reorder (same set) → advisory only, scored attr still passes", () => { const a = clone(golden); a.kinds.decision.status = ["accepted", "proposed", "superseded"]; const r = compare(golden, a); return r.advisories.some((x) => x.axis === "status-order") && !r.attributes.diffs.some((d) => d.kind === "decision" && d.attr === "status"); }],
    ["folder rename → advisory only, overall unaffected", () => { const a = clone(golden); a.kinds.decision.folder = "adr"; const r = compare(golden, a); return r.advisories.some((x) => x.axis === "folder") && r.overall === 1; }],
    ["missing tag key → tagRegistry recall < 1", () => { const a = clone(golden); delete a.tagRegistry.priority; const r = compare(golden, a); return r.tagRegistry.missing.includes("priority") && r.tagRegistry.recall < 1; }],
    ["no expected tags → tag axis skipped from overall", () => { const g = clone(golden); delete g.tagRegistry; delete g.relTargetKinds; const r = compare(g, clone(g)); return r.overall === 1 && r.tagRegistry.expectedCount === 0; }],
    ["empty vs absent requiredSections treated equal", () => { const g = { kinds: { x: { filename: "slug", status: ["a"], requiredSections: [] } } }; const a = { kinds: { x: { filename: "slug", status: ["a"] } } }; const r = compare(g, a); return r.overall === 1; }],
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
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) process.exit(selfTest() ? 0 : 1);

  if (!opts.expected || !opts.actual) {
    console.error("compare-config: need --expected <golden.json> and --actual <inferred.json> (or --self-test)");
    process.exit(1);
  }

  let report;
  try {
    report = compare(readJson(opts.expected), readJson(opts.actual));
  } catch (e) {
    console.error(`compare-config: ${e.message}`);
    process.exit(1);
  }

  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else console.log(humanReport(report));

  if (Number.isFinite(opts.minScore) && report.overall < opts.minScore) {
    if (!opts.json) console.error(`\nbelow threshold: ${pct(report.overall)} < ${pct(opts.minScore)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { compare, prf };
