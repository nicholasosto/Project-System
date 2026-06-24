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

function parseFlowMap(s) {
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  const inner = open >= 0 && close > open ? s.slice(open + 1, close).trim() : "";
  const obj = {};
  if (!inner) return obj;
  for (const pair of inner.split(",")) {
    const idx = pair.indexOf(":");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key) obj[key] = parseScalar(pair.slice(idx + 1));
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
  if (!text.startsWith("---\n")) return { data: {}, body: text, hasFrontmatter: false };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { data: {}, body: text, hasFrontmatter: false };
  const raw = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, "");
  return { data: parseYamlSubset(raw), body, hasFrontmatter: true };
}

// --- body sections / inline helpers -------------------------------------------

export function parseSections(body) {
  const sections = {};
  const headingRegex = /^##\s+(.+?)\s*$/gm;
  const matches = [...body.matchAll(headingRegex)];
  for (let i = 0; i < matches.length; i += 1) {
    const title = matches[i][1].trim();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    sections[title] = body.slice(start, end).trim();
  }
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
