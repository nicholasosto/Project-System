// Shared markdown / frontmatter helpers for the project-system tooling.
//
// Single source for parsing so every tool (validator, scaffolder, guard, renderer)
// reads a planning file the same way and can't drift — the same anti-duplication
// discipline the contract itself enforces.
//
// The frontmatter parser is a small zero-dependency YAML subset that covers exactly
// the shapes the ProjectEntity contract uses: scalars, inline flow maps
// (`tags: { scope: ip-wide }`), and block sequences of inline maps or scalars
// (`links:\n  - { rel: ..., target: ... }`). It is a strict superset of a plain
// scalar-only parser, so existing scalar frontmatter parses identically.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => extname(name) === ".md")
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort((a, b) => a.localeCompare(b));
}

// --- frontmatter (zero-dep YAML subset) ---------------------------------------

function stripTrailingComment(s) {
  let depth = 0;
  let quote = null;
  for (let k = 0; k < s.length; k += 1) {
    const c = s[k];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "{" || c === "[") depth += 1;
    else if (c === "}" || c === "]") depth -= 1;
    else if (c === "#" && depth === 0 && (k === 0 || /\s/.test(s[k - 1]))) {
      return s.slice(0, k);
    }
  }
  return s;
}

function parseScalar(v) {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

// Split `s` on top-level occurrences of a single-char `sep`, ignoring any that fall inside
// quotes or nested {}/[]. So a flow-map value may itself contain the separator —
// `{ note: "a, b" }` stays one pair, `{ url: "http://x" }` keeps its colon. Pieces are
// returned untrimmed (the callers trim); separators are dropped.
function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "{" || c === "[") {
      depth += 1;
    } else if (c === "}" || c === "]") {
      depth -= 1;
    } else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function parseFlowMap(s) {
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  const inner = open >= 0 && close > open ? s.slice(open + 1, close).trim() : "";
  const obj = {};
  if (!inner) return obj;
  for (const pair of splitTopLevel(inner, ",")) {
    if (!pair.trim()) continue;
    const [rawKey, ...rest] = splitTopLevel(pair, ":");
    if (!rest.length) continue; // no top-level colon → not a key:value pair
    const key = rawKey.trim();
    if (key) obj[key] = parseScalar(rest.join(":"));
  }
  return obj;
}

function parseYamlSubset(raw) {
  const lines = raw.split(/\r?\n/);
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }
    const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      i += 1;
      continue;
    }
    const key = match[1];
    const rest = stripTrailingComment(match[2]).trim();

    if (rest === "") {
      // Possibly a block sequence on the following indented `- ` lines.
      const seq = [];
      let j = i + 1;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (!t.startsWith("- ")) break;
        const item = stripTrailingComment(t.slice(2).trim()).trim();
        seq.push(item.startsWith("{") ? parseFlowMap(item) : parseScalar(item));
        j += 1;
      }
      data[key] = seq.length ? seq : "";
      i = seq.length ? j : i + 1;
      continue;
    }

    data[key] = rest.startsWith("{") ? parseFlowMap(rest) : parseScalar(rest);
    i += 1;
  }
  return data;
}

export function parseFrontmatter(text) {
  // CRLF-tolerant: normalize line endings for boundary detection so a Windows-saved file's
  // frontmatter isn't silently ignored. parseYamlSubset / parseSections already split on \r?\n.
  if (!/^---\r?\n/.test(text)) return { data: {}, body: text, hasFrontmatter: false };
  const norm = text.replace(/\r\n/g, "\n");
  const end = norm.indexOf("\n---", 4);
  if (end < 0) return { data: {}, body: text, hasFrontmatter: false };
  const raw = norm.slice(4, end);
  const body = norm.slice(end + 4).replace(/^\n/, "");
  return { data: parseYamlSubset(raw), body, hasFrontmatter: true };
}

// --- body sections / inline helpers -------------------------------------------

// Split a body into its `## ` (h2) sections. Fence-aware: a `## ` line INSIDE a fenced code
// block (e.g. a ```json swimlane that happens to contain `## …`) is NOT a section boundary,
// so a section that holds a code block can't be silently truncated. h3+ are not boundaries.
export function parseSections(body) {
  const sections = {};
  let inFence = false;
  let current = null;
  let buf = [];
  const flush = () => {
    if (current !== null) sections[current] = buf.join("\n").trim();
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = inFence ? null : line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = heading[1].trim();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export function stripMarkdown(input) {
  return String(input ?? "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMarkdownLinks(text) {
  const links = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of text.matchAll(regex)) {
    links.push({ label: match[1], href: match[2] });
  }
  return links;
}

export function isExternalHref(href) {
  return /^(https?:|mailto:|app:|plugin:|#)/.test(href);
}

export function daysSince(dateText) {
  const time = Date.parse(`${dateText}T00:00:00Z`);
  if (Number.isNaN(time)) return 0;
  return Math.floor((Date.now() - time) / 86400000);
}

// --- self-test: pin the parser contract (pure, no fixtures) -------------------
// The frontmatter parser + section splitter are the single source every engine reads
// through, so a defect here mis-feeds the validator, guard, scaffolder, and renderer at
// once. These cases pin the YAML-subset shapes the contract actually uses — including the
// two formerly-unguarded ones (a comma inside a flow-map value, a `## ` inside a fence).
function selfTest() {
  const fm = (t) => parseFrontmatter(t);
  const cases = [
    // frontmatter — scalars (back-compat)
    ["plain scalars parse", () => { const d = fm("---\ntitle: Hello\nstatus: accepted\nupdated: 2026-06-20\n---\n\nbody").data; return d.title === "Hello" && d.status === "accepted" && d.updated === "2026-06-20"; }],
    ["no frontmatter → flagged, body intact", () => { const r = fm("# just a doc\n"); return r.hasFrontmatter === false && r.body === "# just a doc\n"; }],
    ["missing closing fence → not frontmatter", () => fm("---\ntitle: X\n").hasFrontmatter === false],
    ["quoted scalar keeps its colon", () => fm('---\ntitle: "A: B"\n---\n').data.title === "A: B"],
    ["CRLF frontmatter parses", () => fm("---\r\ntitle: X\r\nstatus: draft\r\n---\r\n\r\nbody").data.status === "draft"],
    // frontmatter — trailing comments
    ["trailing # comment stripped", () => fm("---\nstatus: accepted # done\n---\n").data.status === "accepted"],
    ["# inside quotes is preserved", () => fm('---\ntitle: "a # b"\n---\n').data.title === "a # b"],
    // frontmatter — flow maps
    ["flow map parses", () => fm("---\ntags: { scope: ip-wide }\n---\n").data.tags?.scope === "ip-wide"],
    ["flow map: multiple pairs", () => { const t = fm("---\ntags: { scope: ip-wide, priority: high }\n---\n").data.tags; return t.scope === "ip-wide" && t.priority === "high"; }],
    ["flow map: comma inside a quoted value (regression)", () => fm('---\ntags: { note: "a, b" }\n---\n').data.tags?.note === "a, b"],
    ["flow map: colon inside a quoted value", () => fm('---\ntags: { url: "http://x" }\n---\n').data.tags?.url === "http://x"],
    // frontmatter — block sequences
    ["block sequence of inline maps (links)", () => { const l = fm("---\nlinks:\n  - { rel: references, target: decisions/0001 }\n  - { rel: milestone, target: M5 }\n---\n").data.links; return Array.isArray(l) && l.length === 2 && l[0].rel === "references" && l[1].target === "M5"; }],
    ["block sequence of scalars", () => { const s = fm("---\nfoo:\n  - a\n  - b\n---\n").data.foo; return Array.isArray(s) && s.join(",") === "a,b"; }],
    // sections
    ["sections split + trimmed", () => { const s = parseSections("## A\n\nalpha\n\n## B\n\nbeta\n"); return s.A === "alpha" && s.B === "beta"; }],
    ["### is not an h2 section", () => { const s = parseSections("## A\n\n### Sub\n\nx\n"); return "A" in s && !("Sub" in s); }],
    ["## inside a fenced block is not a section (regression)", () => { const s = parseSections('## Workflow\n\n```json\n{ "x": "## not a heading" }\n```\n\n## Next\n\nn\n'); return "Workflow" in s && "Next" in s && s.Workflow.includes('"## not a heading"') && !("not a heading" in s); }],
  ];
  let pass = 0;
  for (const [name, f] of cases) {
    let ok = false;
    try { ok = f(); } catch { ok = false; }
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
    if (ok) pass += 1;
  }
  console.log(`self-test: ${pass}/${cases.length} passed`);
  return pass === cases.length;
}

if (process.argv[1] && process.argv[1].endsWith("md.mjs") && process.argv.includes("--self-test")) {
  process.exit(selfTest() ? 0 : 1);
}
