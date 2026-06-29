#!/usr/bin/env node
// Consumer drift check — the packaging discipline from decision 0002 (and schema.md §8 #4).
//
// While there are only 2 consumers of the contract we do NOT publish an npm package; each
// consumer keeps its own copy and THIS check keeps the copies honest. It is the build-time
// "mirror a type with an equality check" — not a second live runtime source.
//
// Three checks per consumer:
//   1. STRUCTURAL  — the consumer's schema CORE (rel vocabulary, link shape, the primitive
//                    field set, the required set, the tag shadow-rule) is identical to the
//                    canonical base schema. Robust to descriptions/cosmetic constraints; it
//                    fails only on real drift (a new field, a changed rel set, a new required).
//   2. BEHAVIORAL  — the generalized engines + the consumer's project-system config, pointed
//                    at the consumer's _project/, reproduce the consumer's OWN validator
//                    baseline (same file/error/warning/info counts; 0 errors).
//   3. HOOKS       — opt-in (a consumer entry with a `claudeDir`): the consumer's .claude/
//                    settings.json wires the canonical hook surface (the PreToolUse guard +
//                    the SessionStart summary) un-renamed. Compared by NORMALIZED command
//                    shape against templates/consumer/.claude/settings.json — path prefix is
//                    stripped, so vendored vs. framework-root paths match, but a RENAMED tool
//                    (guard-project-entity.mjs ≠ guard.mjs) or a missing canonical hook fails.
//                    This is the same "mirror, then assert equality" discipline as the other
//                    two, applied to the harness wiring — the thing that makes "copy the
//                    template" actually stick instead of drifting like Soul-Steel's did.
//
// Usage:  node tools/check-consumer-drift.mjs            # run all configured consumers
//         node tools/check-consumer-drift.mjs --json     # machine-readable
//         node tools/check-consumer-drift.mjs --self-test # assert the checks themselves work

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FRAMEWORK_ROOT, loadBaseSchema } from "../lib/contract.mjs";

const __filename = fileURLToPath(import.meta.url);
const VALIDATE = join(FRAMEWORK_ROOT, "tools", "validate.mjs");
// The canonical consumer wiring every consumer mirrors. Hook parity normalizes against this.
const TEMPLATE_SETTINGS = join(FRAMEWORK_ROOT, "templates", "consumer", ".claude", "settings.json");

// Registered consumers. As REAL (non-demo) consumers are added here and that count reaches 3,
// decision 0002 re-opens in favor of publishing @trembus/project-schema. A consumer whose own
// config declares `"demo": true` is an in-repo fixture — validated every run, but it does NOT
// count toward that trigger (a local demo is not an independent consumer). Demo-ness is DERIVED
// from each consumer's config (single source), never hardcoded on the entry here.
const CONSUMERS = [
  {
    name: "soul-steel",
    // De-forked 2026-06-29: SS now VENDORS the framework. Compare its vendored base-schema copy
    // (not the old fused documents/specs schema, which is retired) against canonical.
    schema: "/Users/nicholasosto/Master-Managed/Project-Spaces/Roblox-Development/Soul-Steel-Official/.project-system/schema/project-entity.base.schema.json",
    // The consumer's _project/ root + its OWN root project-system config (no longer the golden example).
    root: "/Users/nicholasosto/Master-Managed/Project-Spaces/Roblox-Development/Soul-Steel-Official",
    config: "/Users/nicholasosto/Master-Managed/Project-Spaces/Roblox-Development/Soul-Steel-Official/project-system.config.json",
    // No ownValidator: SS relies on the vendored validate.mjs, so there is no separate fork to compare
    // counts against (behavioral = 0-errors). claudeDir opts SS into the HOOKS parity axis.
    claudeDir: "/Users/nicholasosto/Master-Managed/Project-Spaces/Roblox-Development/Soul-Steel-Official/.claude",
  },
  {
    name: "soul-steel-demo",
    // An in-repo FICTIONAL consumer (adds `character` + `workflow` kinds the core has never
    // seen) — the test bed for consumer-shaped `/new`, validation, and drift. Always reachable,
    // so it runs in CI. Its demo-ness is declared in its OWN config (`"demo": true`) and derived
    // by isDemoConfig() below — not duplicated on this entry.
    // This consumer's mirrored copy of the canonical contract core (a copy of the base schema).
    schema: join(FRAMEWORK_ROOT, "examples", "soul-steel-demo", "project-entity.schema.json"),
    root: join(FRAMEWORK_ROOT, "examples", "soul-steel-demo"),
    config: join(FRAMEWORK_ROOT, "examples", "soul-steel-demo", "project-system.config.json"),
    // Opt this fixture into the HOOKS axis: its .claude/ mirrors templates/consumer/.claude/,
    // so `--demos-only` exercises hook parity end-to-end with no external checkout.
    claudeDir: join(FRAMEWORK_ROOT, "examples", "soul-steel-demo", ".claude"),
  },
];

// Demo-ness is a property the consumer declares about ITSELF, in its config. We read it here so
// the registry stays a single source — no duplicated flag to drift out of sync.
function isDemoConfig(configPath) {
  try {
    return JSON.parse(readFileSync(configPath, "utf8")).demo === true;
  } catch {
    return false;
  }
}

const setEq = (a, b) => a.length === b.length && [...a].sort().join("\0") === [...b].sort().join("\0");
const shadowKeys = (schema) => (schema?.properties?.tags?.not?.anyOf ?? []).flatMap((c) => c.required ?? []);

// The universal invariants the core must share. Prose/descriptions/cosmetic constraints ignored.
function structuralCheck(base, consumer) {
  const diffs = [];
  const relB = base.$defs?.rel?.enum ?? [];
  const relC = consumer.$defs?.rel?.enum ?? [];
  if (!setEq(relB, relC)) diffs.push(`rel vocabulary differs (base: ${relB.join(",")} | consumer: ${relC.join(",")})`);

  const linkReqB = base.$defs?.link?.required ?? [];
  const linkReqC = consumer.$defs?.link?.required ?? [];
  if (!setEq(linkReqB, linkReqC)) diffs.push(`link.required differs (${linkReqB} vs ${linkReqC})`);
  const linkPropsB = Object.keys(base.$defs?.link?.properties ?? {});
  const linkPropsC = Object.keys(consumer.$defs?.link?.properties ?? {});
  if (!setEq(linkPropsB, linkPropsC)) diffs.push(`link properties differ (${linkPropsB} vs ${linkPropsC})`);

  const propsB = Object.keys(base.properties ?? {});
  const propsC = Object.keys(consumer.properties ?? {});
  if (!setEq(propsB, propsC)) diffs.push(`primitive field set differs (${propsB} vs ${propsC})`);

  const reqB = base.required ?? [];
  const reqC = consumer.required ?? [];
  if (!setEq(reqB, reqC)) diffs.push(`required set differs (${reqB} vs ${reqC})`);

  if (!setEq(shadowKeys(base), shadowKeys(consumer))) {
    diffs.push(`tag shadow-rule differs (${shadowKeys(base)} vs ${shadowKeys(consumer)})`);
  }
  return diffs;
}

function runValidatorJson(args, cwd) {
  const out = execFileSync("node", args, { cwd, encoding: "utf8" });
  return JSON.parse(out).summary;
}

function behavioralCheck(consumer) {
  const notes = [];
  const framework = runValidatorJson([VALIDATE, "--root", consumer.root, "--config", consumer.config, "--json"], FRAMEWORK_ROOT);
  notes.push(`framework engines: ${framework.files} files, ${framework.error} errors, ${framework.warning} warnings, ${framework.info} info`);

  const diffs = [];
  if (framework.error !== 0) diffs.push(`generalized validator reports ${framework.error} errors against the consumer (expected 0)`);

  if (consumer.ownValidator && existsSync(consumer.ownValidator)) {
    const own = runValidatorJson([consumer.ownValidator, "--json"], consumer.root);
    notes.push(`consumer's own validator: ${own.files} files, ${own.error} errors, ${own.warning} warnings, ${own.info} info`);
    for (const k of ["files", "migrated", "error", "warning", "info"]) {
      if (framework[k] !== own[k]) diffs.push(`count "${k}" differs — framework ${framework[k]} vs consumer ${own[k]}`);
    }
  } else {
    notes.push("consumer has no own validator to compare counts against (behavioral = 0-errors only)");
  }
  return { diffs, notes };
}

// Reduce a hook command to its tool + args, dropping the path prefix and quotes, so that
// `node "$CLAUDE_PROJECT_DIR/.project-system/tools/guard.mjs"` and the framework's own
// `node "$CLAUDE_PROJECT_DIR/tools/guard.mjs"` both normalize to `guard.mjs` — but a renamed
// `guard-project-entity.mjs` does not. Everything up to and including the last `/tools/` is cut.
function normalizeCommand(cmd) {
  const i = cmd.lastIndexOf("/tools/");
  const tail = i >= 0 ? cmd.slice(i + "/tools/".length) : cmd;
  return tail.replace(/"/g, "").trim();
}

// A settings.json `hooks` block reduced to { event -> sorted ["<matcher>::<normalizedCmd>"] }.
function hookShape(settings) {
  const shape = {};
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const entries = [];
    for (const g of groups ?? []) {
      const matcher = g.matcher ?? "";
      for (const h of g.hooks ?? []) {
        if (h.command) entries.push(`${matcher}::${normalizeCommand(h.command)}`);
      }
    }
    shape[event] = entries.sort();
  }
  return shape;
}

// HOOKS axis. Opt-in: only consumers whose registry entry carries a `claudeDir` are checked
// (absent ⇒ skipped, fail-open like a missing ownValidator). A consumer must contain EVERY
// canonical hook the template wires, un-renamed — a missing one is a failure (this is what
// catches a renamed guard). Extra consumer hooks are reported as notes, never failures, so a
// consumer may add its own wiring without tripping the mirror.
function hookCheck(consumer, templateShape) {
  if (!consumer.claudeDir) return { ok: true, skipped: true, reason: "no claudeDir registered — hook parity not checked", diffs: [], notes: [] };
  const settingsPath = join(consumer.claudeDir, "settings.json");
  if (!existsSync(settingsPath)) return { ok: true, skipped: true, reason: `no settings.json at ${settingsPath}`, diffs: [], notes: [] };

  let consumerShape;
  try {
    consumerShape = hookShape(JSON.parse(readFileSync(settingsPath, "utf8")));
  } catch (e) {
    return { ok: false, skipped: false, diffs: [`could not parse ${settingsPath}: ${e.message}`], notes: [] };
  }

  const diffs = [];
  const notes = [];
  for (const [event, expected] of Object.entries(templateShape)) {
    const actual = consumerShape[event] ?? [];
    for (const entry of expected) {
      if (!actual.includes(entry)) diffs.push(`${event}: missing canonical hook "${entry}"`);
    }
  }
  for (const [event, actual] of Object.entries(consumerShape)) {
    const expected = templateShape[event] ?? [];
    for (const entry of actual) {
      if (!expected.includes(entry)) notes.push(`${event}: extra hook "${entry}" (not in template)`);
    }
  }
  return { ok: diffs.length === 0, skipped: false, diffs, notes };
}

function run(consumers = CONSUMERS) {
  const base = loadBaseSchema();
  const templateShape = hookShape(JSON.parse(readFileSync(TEMPLATE_SETTINGS, "utf8")));
  const results = [];
  for (const c of consumers) {
    const r = {
      name: c.name,
      structural: { ok: true, diffs: [] },
      behavioral: { ok: true, diffs: [], notes: [] },
      hooks: { ok: true, skipped: true, diffs: [], notes: [] },
      skipped: false,
    };
    if (!existsSync(c.schema) || !existsSync(c.root) || !existsSync(c.config)) {
      r.skipped = true;
      r.reason = `missing path (schema/root/config) — not reachable from here`;
      results.push(r);
      continue;
    }
    const consumerSchema = JSON.parse(readFileSync(c.schema, "utf8"));
    r.structural.diffs = structuralCheck(base, consumerSchema);
    r.structural.ok = r.structural.diffs.length === 0;
    const b = behavioralCheck(c);
    r.behavioral.diffs = b.diffs;
    r.behavioral.notes = b.notes;
    r.behavioral.ok = b.diffs.length === 0;
    r.hooks = hookCheck(c, templateShape);
    results.push(r);
  }
  return results;
}

// Hermetic test of the hook-parity logic (mkdtemp fixtures, no external consumer needed).
// This is the contract on the new code — `npm test` runs it.
function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "ps-drift-"));
  try {
    const tpl = {
      hooks: {
        PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.project-system/tools/guard.mjs"' }] }],
        SessionStart: [{ hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.project-system/tools/validate.mjs" --summary' }] }],
      },
    };
    const templateShape = hookShape(tpl);
    const writeSettings = (name, obj) => {
      const dir = join(root, name, ".claude");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "settings.json"), JSON.stringify(obj, null, 2));
      return dir;
    };

    // A faithful vendored copy uses a different PATH but the same normalized shape.
    const okDir = writeSettings("ok", tpl);
    // A renamed guard — the exact Soul-Steel drift.
    const renamedDir = writeSettings("renamed", {
      hooks: {
        PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/tools/guard-project-entity.mjs"' }] }],
        SessionStart: tpl.hooks.SessionStart,
      },
    });
    // Missing the SessionStart event entirely.
    const missingDir = writeSettings("missing", { hooks: { PreToolUse: tpl.hooks.PreToolUse } });
    // A consumer that ALSO wires its own unrelated hook — allowed.
    const extraDir = writeSettings("extra", {
      hooks: { ...tpl.hooks, PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "node ./scripts/format.mjs" }] }] },
    });

    const cases = [
      ["normalizeCommand strips path + quotes, keeps args", () => normalizeCommand('node "$CLAUDE_PROJECT_DIR/.project-system/tools/validate.mjs" --summary') === "validate.mjs --summary"],
      ["faithful vendored copy → parity PASS", () => { const r = hookCheck({ claudeDir: okDir }, templateShape); return r.ok && !r.skipped && r.diffs.length === 0; }],
      ["renamed guard.mjs → FAIL naming the canonical hook", () => { const r = hookCheck({ claudeDir: renamedDir }, templateShape); return !r.ok && r.diffs.some((d) => /guard\.mjs/.test(d)); }],
      ["missing SessionStart → FAIL naming the event", () => { const r = hookCheck({ claudeDir: missingDir }, templateShape); return !r.ok && r.diffs.some((d) => /SessionStart/.test(d)); }],
      ["extra unrelated hook → PASS, reported as a note", () => { const r = hookCheck({ claudeDir: extraDir }, templateShape); return r.ok && r.notes.some((n) => /PostToolUse/.test(n)); }],
      ["no claudeDir registered → SKIPPED, non-fatal", () => { const r = hookCheck({}, templateShape); return r.ok && r.skipped; }],
      ["the shipped template parses + has the two canonical events", () => { const s = hookShape(JSON.parse(readFileSync(TEMPLATE_SETTINGS, "utf8"))); return Array.isArray(s.PreToolUse) && Array.isArray(s.SessionStart); }],
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
  if (process.argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);
  // --demos-only: validate just the in-repo demo consumer(s). Used by `npm test` for
  // deterministic, always-present consumer-path coverage that does NOT depend on an external
  // consumer checkout (the real soul-steel consumer auto-skips when its path is absent).
  const demosOnly = process.argv.includes("--demos-only");
  // Annotate each registered consumer with the demo flag it declares in its own config.
  const registry = CONSUMERS.map((c) => ({ ...c, demo: isDemoConfig(c.config) }));
  const consumers = demosOnly ? registry.filter((c) => c.demo) : registry;
  const results = run(consumers);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ consumers: consumers.length, results }, null, 2));
    const failed = results.some((r) => !r.skipped && (!r.structural.ok || !r.behavioral.ok || !r.hooks.ok));
    process.exit(failed ? 1 : 0);
  }

  let failed = false;
  if (demosOnly) {
    console.log(`demo consumer smoke — ${consumers.length} in-repo demo consumer(s)`);
  } else {
    const realCount = registry.filter((c) => !c.demo).length;
    const demoCount = registry.length - realCount;
    console.log(`consumer drift check — ${realCount} consumer(s)${demoCount ? ` + ${demoCount} demo` : ""} registered (publish trigger: 3 real)`);
  }
  for (const r of results) {
    if (r.skipped) {
      console.log(`\n  ~ ${r.name}: SKIPPED (${r.reason})`);
      continue;
    }
    console.log(`\n  ${r.name}:`);
    console.log(`    structural (core == canonical base): ${r.structural.ok ? "PASS" : "FAIL"}`);
    for (const d of r.structural.diffs) console.log(`      ✗ ${d}`);
    console.log(`    behavioral (reproduces consumer baseline): ${r.behavioral.ok ? "PASS" : "FAIL"}`);
    for (const n of r.behavioral.notes) console.log(`      · ${n}`);
    for (const d of r.behavioral.diffs) console.log(`      ✗ ${d}`);
    const hookStatus = r.hooks.skipped ? `SKIPPED (${r.hooks.reason})` : r.hooks.ok ? "PASS" : "FAIL";
    console.log(`    hooks (.claude/ == consumer template): ${hookStatus}`);
    for (const n of r.hooks.notes ?? []) console.log(`      · ${n}`);
    for (const d of r.hooks.diffs) console.log(`      ✗ ${d}`);
    if (!r.structural.ok || !r.behavioral.ok || !r.hooks.ok) failed = true;
  }
  console.log(failed ? "\nDRIFT DETECTED — a consumer has diverged from the canonical contract." : "\nin sync — every consumer mirrors the canonical contract.");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { CONSUMERS, structuralCheck, behavioralCheck, hookCheck, hookShape, normalizeCommand };
