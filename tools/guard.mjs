#!/usr/bin/env node
// PreToolUse guard: block a Write/Edit that would make a _project/ entity file INVALID
// against the effective ProjectEntity contract (bad status enum, dangling/wrong-kind
// link, missing required field, prose<->frontmatter disagreement).
//
// Reuses validateEntity as the single source of truth — it re-implements no check. The
// project (and thus its kinds/folders/enums) is resolved by walking up from the edited
// file to the nearest project-system.config.json, so one installed framework guards any
// number of projects. Scope is narrow (only _project/<kind-folder>/*.md) and it blocks
// ONLY on error-severity issues; warnings/info never block. It FAILS OPEN: any internal
// error, unparseable stdin, or unreconstructable edit allows the write — a guard bug
// must never wedge editing.
//
// Wired as: hooks.PreToolUse matcher "Write|Edit" -> node tools/guard.mjs
// Block signal: exit code 2 + reason on stderr (the stable PreToolUse contract).
//
// Self-test:  node tools/guard.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { loadContract } from "../lib/contract.mjs";
import { parseFrontmatter, parseSections } from "../lib/md.mjs";
import { fencedJson } from "../lib/swimlane.mjs";
import { validateEntity } from "./validate.mjs";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Resolve the resulting file content for a Write or Edit, or null if not applicable.
// Field names are read defensively so the guard is robust across tool-input shapes.
function resultingContent(tool, ti) {
  if (tool === "Write") {
    return ti.content ?? ti.file_text ?? null;
  }
  if (tool === "Edit") {
    const oldStr = ti.old_string ?? ti.old_text;
    const newStr = ti.new_string ?? ti.new_text ?? "";
    const replaceAll = ti.replace_all ?? ti.replaceAll ?? false;
    if (oldStr == null) return null;
    const filePath = ti.file_path;
    if (!filePath || !existsSync(filePath)) return null;
    const current = readFileSync(filePath, "utf8");
    if (!current.includes(oldStr)) return null; // edit would fail/no-op; let the tool handle it
    return replaceAll ? current.split(oldStr).join(newStr) : current.replace(oldStr, () => newStr);
  }
  return null;
}

// Resolve the project ctx for a given file by walking up from its directory.
// Returns null if the file isn't inside any configured project (=> allow).
function defaultResolveCtx(filePath) {
  try {
    return loadContract({ cwd: dirname(filePath) });
  } catch {
    return null;
  }
}

export function decide(payload, resolveCtx = defaultResolveCtx) {
  const tool = payload?.tool_name;
  const ti = payload?.tool_input ?? {};
  const filePath = ti.file_path;
  if (!filePath) return { allow: true };

  const ctx = resolveCtx(filePath);
  if (!ctx) return { allow: true };

  const relPath = relative(ctx.projectRoot, filePath).replaceAll("\\", "/");
  const folders = Object.keys(ctx.kindByFolder).map(escapeRegex).join("|");
  const m = relPath.match(new RegExp(`^_project/(${folders})/([^/]+)\\.md$`));
  if (!m) return { allow: true };
  const [, folder, stem] = m;
  if (stem === "README" || stem.startsWith("_")) return { allow: true };

  const content = resultingContent(tool, ti);
  if (content == null) return { allow: true };

  const { data, body, hasFrontmatter } = parseFrontmatter(content);
  const sections = parseSections(body);
  const entity = {
    kind: ctx.kindByFolder[folder],
    id: stem,
    file: relPath,
    fm: data,
    hasFrontmatter,
    sections,
    workflow: fencedJson(sections[ctx.workflowSection]), // parsed like loadEntities, so validateEntity sees it
    fullText: content,
  };
  const errors = validateEntity(entity, ctx).filter((i) => i.severity === "error");
  if (!errors.length) return { allow: true };

  return {
    block: true,
    reason:
      `ProjectEntity guard blocked this write — ${relPath} would be invalid:\n` +
      errors.map((e) => `  • ${e.message}`).join("\n") +
      `\nFix the frontmatter to satisfy the ProjectEntity contract ` +
      `(or run: node tools/validate.mjs --root <project>).`,
  };
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "ps-guard-"));
  try {
    // A minimal but real consuming project: config + one decision file.
    const config = {
      project: "guard-test",
      kinds: {
        decision: { folder: "decisions", status: ["proposed", "accepted", "superseded", "rejected"], requiredSections: ["Context"] },
        workflow: { folder: "workflows", status: ["draft", "active", "deprecated"], carriesSwimlanes: true, requiredSections: ["Workflow"] },
      },
      relTargetKinds: { "superseded-by": ["decision"] },
      proseStatusEnforcement: { rollout: "error" },
      swimlaneEnforcement: { rollout: "error" },
    };
    writeFileSync(join(root, "project-system.config.json"), JSON.stringify(config, null, 2));
    mkdirSync(join(root, "_project", "decisions"), { recursive: true });
    const decisionFile = join(root, "_project", "decisions", "0001-sample.md");
    const goodDecision = `---\ntitle: "X"\nstatus: accepted\nupdated: 2026-06-20\n---\n\n# X\n\n**Status**: accepted (2026-06-20)\n\n## Context\n\nx\n`;
    writeFileSync(decisionFile, goodDecision);
    const badStatus = goodDecision.replace("status: accepted", "status: active");

    // A workflow entity whose `## Workflow` swimlane the guard now validates (carriesSwimlanes).
    mkdirSync(join(root, "_project", "workflows"), { recursive: true });
    const wfFile = join(root, "_project", "workflows", "loop.md");
    const goodWf = '---\ntitle: "Loop"\nstatus: active\nupdated: 2026-06-20\n---\n\n# Loop\n\n**Status**: active (2026-06-20)\n\n## Workflow\n\n```json\n{\n  "lanes": [ { "id": "you", "label": "You", "kind": "human" } ],\n  "steps": [ { "id": "a", "lane": "you", "label": "A", "to": [] } ]\n}\n```\n';
    writeFileSync(wfFile, goodWf);
    const danglingWf = goodWf.replace('"to": []', '"to": ["ghost"]');

    const cases = [
      ["valid Write → allow", () => decide({ tool_name: "Write", tool_input: { file_path: decisionFile, content: goodDecision } }).allow === true],
      ["bad-enum Write → block", () => decide({ tool_name: "Write", tool_input: { file_path: decisionFile, content: badStatus } }).block === true],
      ["non-_project Write → allow", () => decide({ tool_name: "Write", tool_input: { file_path: join(root, "tools", "foo.mjs"), content: "x" } }).allow === true],
      ["README → allow", () => decide({ tool_name: "Write", tool_input: { file_path: join(root, "_project", "decisions", "README.md"), content: "x" } }).allow === true],
      ["file outside any project → allow", () => decide({ tool_name: "Write", tool_input: { file_path: join(tmpdir(), "loose-file.md"), content: "x" } }).allow === true],
      ["defensive field names (file_text) → block", () => decide({ tool_name: "Write", tool_input: { file_path: decisionFile, file_text: badStatus } }).block === true],
      ["Edit real file to bad enum → block", () => decide({ tool_name: "Edit", tool_input: { file_path: decisionFile, old_string: "status: accepted", new_string: "status: bogus" } }).block === true],
      ["Edit fm→proposed while prose says accepted → block (prose↔fm)", () => decide({ tool_name: "Edit", tool_input: { file_path: decisionFile, old_string: "status: accepted", new_string: "status: proposed" } }).block === true],
      ["Edit with absent old_string → allow", () => decide({ tool_name: "Edit", tool_input: { file_path: decisionFile, old_string: "this string is not present anywhere", new_string: "x" } }).allow === true],
      ["empty payload → allow", () => decide({}).allow === true],
      ["valid workflow Write → allow", () => decide({ tool_name: "Write", tool_input: { file_path: wfFile, content: goodWf } }).allow === true],
      ["dangling step.to Write → block", () => decide({ tool_name: "Write", tool_input: { file_path: wfFile, content: danglingWf } }).block === true],
      ["Edit a clean workflow into a dangling to → block", () => decide({ tool_name: "Edit", tool_input: { file_path: wfFile, old_string: '"to": []', new_string: '"to": ["ghost"]' } }).block === true],
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

  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // fail-open: unparseable stdin must not block editing
  }
  let verdict;
  try {
    verdict = decide(payload);
  } catch {
    process.exit(0); // fail-open: a guard bug must never wedge a write
  }
  if (verdict.block) {
    console.error(verdict.reason);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
