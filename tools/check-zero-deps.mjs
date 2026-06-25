#!/usr/bin/env node
// Make the "framework-core stays zero runtime dependencies / npm-free" guarantee a
// machine-checked invariant instead of a convention. The root package.json must declare
// NO dependencies of any kind, and must NOT ship the apps/ render islands in its published
// `files` allowlist. Render apps (e.g. apps/command-center) are separate dependency
// islands with their OWN package.json; this check fences them off from the core manifest.
//
//   node tools/check-zero-deps.mjs              # assert the real root package.json is clean
//   node tools/check-zero-deps.mjs --self-test  # prove the checker logic (clean + dirty fixtures)
//
// Wired into `npm test` so an accidental root dependency fails the suite.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundledDependencies"];

// The single check, reusable by --self-test. Returns an array of human-readable violations.
export function checkZeroDeps(pkg) {
  const issues = [];
  for (const field of DEP_FIELDS) {
    const v = pkg[field];
    const names = Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v) : [];
    if (names.length) issues.push(`root package.json declares ${field}: ${names.join(", ")} — core must stay npm-free`);
  }
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  if (files.some((f) => f === "apps" || f.startsWith("apps/"))) {
    issues.push(`root package.json "files" ships apps/ — render islands must stay out of the published core package`);
  }
  return issues;
}

function selfTest() {
  const clean = { name: "@trembus/project-system", files: ["lib", "tools", "schema", "examples"] };
  const dirty = { dependencies: { react: "^19" }, devDependencies: { vite: "^7" }, files: ["lib", "apps"] };
  const a = checkZeroDeps(clean);
  const b = checkZeroDeps(dirty);
  const ok = a.length === 0 && b.length === 3;
  if (!ok) {
    console.error(`check-zero-deps self-test FAILED: clean→${a.length} (want 0), dirty→${b.length} (want 3)`);
    process.exit(1);
  }
  console.log("check-zero-deps self-test ok (clean→0, dirty→3)");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const issues = checkZeroDeps(pkg);
  if (issues.length) {
    console.error(`[zero-deps] ${issues.length} violation(s) in root package.json:`);
    for (const i of issues) console.error(`  ✗ ${i}`);
    process.exit(1);
  }
  console.log("[zero-deps] root package.json is dependency-free · apps/ not published — core stays npm-free");
}

main();
