// Config resolution + entity loading for the project-system framework.
//
// This is the single seam between the PROJECT-AGNOSTIC engines (validate / scaffold
// / guard / render) and a consuming project's specifics. Everything project-shaped —
// which kinds exist, their status enums, folders, sections, the tag registry, the
// milestone vocabulary, rel->kind rules, render metadata — is read HERE from a
// project-system.config.json and handed to the engines as a plain `ctx` object. The
// engines never hard-code a kind name, a folder, an enum, or a domain word.
//
// The effective contract = project-entity.base.schema.json (universal, shipped with
// the framework) composed with the project's config. loadContract() does that
// composition once; loadEntities() reads the project's _project/ tree against it.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listMarkdown, parseFrontmatter, parseSections, readText } from "./md.mjs";

const __filename = fileURLToPath(import.meta.url);
export const FRAMEWORK_ROOT = resolve(dirname(__filename), "..");
export const BASE_SCHEMA_PATH = join(FRAMEWORK_ROOT, "schema", "project-entity.base.schema.json");
const CONFIG_NAME = "project-system.config.json";

// Universal field sets — these never vary per project.
export const PRIMITIVE_KEYS = new Set(["kind", "id", "title", "status", "updated", "links", "supersedes", "superseded-by"]);
export const DERIVED_FIELDS = new Set(["kind", "id"]); // authoring these duplicates the file's own path
export const AUTHORED_FIELDS = new Set(["title", "status", "updated", "links", "tags"]);

// Sensible rel->target defaults so a minimal config still behaves; config overrides per rel.
const DEFAULT_REL_TARGETS = {
  supersedes: "any",
  "superseded-by": "any",
  predecessor: "any",
  successor: "any",
  "decided-in": "any",
  milestone: "marker",
  implements: "external",
  references: "any",
};

export function loadBaseSchema() {
  return JSON.parse(readText(BASE_SCHEMA_PATH));
}

// Find the nearest ancestor (from `start`) that holds a project-system.config.json.
function findConfigUpward(start) {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Resolve { configPath, projectRoot } from explicit options or by walking up from cwd.
//   --config <path>  : use exactly this config file.
//   --root <dir>     : the dir containing _project/ (and, by default, the config).
// projectRoot precedence: explicit --root > config.projectRoot (relative to the config) > config's own dir.
export function resolveProject({ root, config, cwd = process.cwd() } = {}) {
  let configPath;
  if (config) configPath = resolve(cwd, config);
  else if (root) configPath = join(resolve(cwd, root), CONFIG_NAME);
  else configPath = findConfigUpward(cwd);

  if (!configPath || !existsSync(configPath)) {
    throw new Error(
      `no ${CONFIG_NAME} found (looked: ${configPath ?? `upward from ${cwd}`}). ` +
        `Pass --config <path> or --root <dir>, or run from inside a project that has one.`,
    );
  }
  const cfg = JSON.parse(readText(configPath));
  const projectRoot = root
    ? resolve(cwd, root)
    : resolve(dirname(configPath), cfg.projectRoot ?? ".");
  return { configPath, projectRoot, cfg };
}

// Build the runtime ctx the engines consume. Pure derivation from base schema + config.
export function loadContract(opts = {}) {
  const base = loadBaseSchema();
  const { configPath, projectRoot, cfg } = resolveProject(opts);

  const kindEntries = Object.entries(cfg.kinds ?? {});
  if (!kindEntries.length) throw new Error(`${configPath}: config.kinds is empty`);

  const kinds = [];
  const folderByKind = {};
  const kindByFolder = {};
  const statusEnums = {};
  const initialStatus = {};
  const filenameScheme = {};
  const requiredSections = {};
  const scaffoldSections = {};
  const renderMeta = {};
  const swimlaneKinds = [];

  for (const [kind, spec] of kindEntries) {
    if (!spec || !spec.folder) throw new Error(`${configPath}: kind "${kind}" needs a folder`);
    if (!Array.isArray(spec.status) || !spec.status.length) {
      throw new Error(`${configPath}: kind "${kind}" needs a non-empty status enum`);
    }
    kinds.push(kind);
    folderByKind[kind] = spec.folder;
    kindByFolder[spec.folder] = kind;
    statusEnums[kind] = new Set(spec.status);
    initialStatus[kind] = spec.initialStatus ?? spec.status[0];
    if (!statusEnums[kind].has(initialStatus[kind])) {
      throw new Error(`${configPath}: kind "${kind}" initialStatus "${initialStatus[kind]}" not in its status enum`);
    }
    filenameScheme[kind] = { scheme: spec.filename ?? "slug", pad: spec.serialPad ?? 4 };
    requiredSections[kind] = spec.requiredSections ?? [];
    scaffoldSections[kind] = spec.scaffoldSections ?? spec.requiredSections ?? [];
    renderMeta[kind] = spec.render ?? {};
    if (spec.carriesSwimlanes) swimlaneKinds.push(kind); // kinds whose entities ARE workflows
  }

  const relEnum = new Set(base.$defs?.rel?.enum ?? []);
  const relTargetKinds = { ...DEFAULT_REL_TARGETS, ...(cfg.relTargetKinds ?? {}) };
  const proseRollout = cfg.proseStatusEnforcement?.rollout ?? "warn";

  return {
    base,
    project: cfg.project ?? basename(projectRoot),
    projectRoot,
    configPath,
    kinds,
    folderByKind,
    kindByFolder,
    statusEnums,
    initialStatus,
    filenameScheme,
    requiredSections,
    scaffoldSections,
    sectionHints: cfg.sectionHints ?? {},
    renderMeta,
    swimlaneKinds,
    relEnum,
    relTargetKinds,
    tagRegistry: cfg.tagRegistry ?? {},
    knownMilestones: new Set(cfg.milestones ?? []),
    milestonePattern: new RegExp(cfg.milestonePattern ?? "^M\\d+$"),
    proseSeverity: proseRollout === "error" ? "error" : proseRollout === "off" ? "off" : "warning",
    render: cfg.render ?? {},
    primitiveKeys: PRIMITIVE_KEYS,
    derivedFields: DERIVED_FIELDS,
    authoredFields: AUTHORED_FIELDS,
  };
}

export function relPath(ctx, path) {
  return relative(ctx.projectRoot, path).replaceAll("\\", "/");
}

// Classify a link target: an internal '<folder>/<stem>' (resolved + kind-checked),
// a milestone marker, or an external/off-graph ref.
export function classifyTarget(ctx, target) {
  if (ctx.milestonePattern.test(target)) return { type: "marker", milestone: target };
  const seg = target.split("/");
  if (seg.length >= 2 && ctx.kindByFolder[seg[0]]) {
    const folder = seg[0];
    const stem = seg.slice(1).join("/").replace(/\.md$/, "").split("#")[0];
    const abs = join(ctx.projectRoot, "_project", folder, `${stem}.md`);
    return { type: "internal", kind: ctx.kindByFolder[folder], exists: existsSync(abs), path: `_project/${folder}/${stem}.md` };
  }
  return { type: "external", target };
}

// Read the _project/ tree into entity records. kind comes from the folder, id from the filename.
export function loadEntities(ctx) {
  const entities = [];
  for (const kind of ctx.kinds) {
    const dir = join(ctx.projectRoot, "_project", ctx.folderByKind[kind]);
    for (const path of listMarkdown(dir)) {
      const name = basename(path);
      if (name === "README.md" || name.startsWith("_")) continue;
      const text = readText(path);
      const { data, body, hasFrontmatter } = parseFrontmatter(text);
      entities.push({
        kind,
        id: name.replace(/\.md$/, ""),
        file: relPath(ctx, path),
        fm: data,
        hasFrontmatter,
        sections: parseSections(body),
        fullText: text,
      });
    }
  }
  return entities;
}

// Tiny shared CLI arg reader for --root / --config (and passthrough of the rest).
export function readProjectArgs(argv) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") opts.root = argv[++i];
    else if (argv[i] === "--config") opts.config = argv[++i];
    else rest.push(argv[i]);
  }
  return { opts, rest };
}

export { existsSync, readdirSync, statSync, readFileSync };
