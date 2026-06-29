---
name: migrate-project-space
description: >-
  Adopt project-system in a project that ALREADY has planning material — scan its existing
  docs, ADRs, roadmap, session notes, TODOs, and git history, then PROPOSE a config (entity
  kinds + conventions) and an initial set of entities inferred from that evidence. Use when
  migrating/importing/onboarding an existing project ("scan this project and set up
  project-system", "import our docs/ADRs into project-system", "migrate this repo's planning"),
  as opposed to standing up a blank project (use setup-project-system / the preset for that).
allowed-tools: Bash(node .project-system/tools/init-config.mjs:*), Bash(node .project-system/tools/validate.mjs:*), Bash(node .project-system/tools/new-entity.mjs:*), Bash(git log:*), Bash(git branch:*), Read, Glob, Grep, Edit
---

# Migrate an existing project into project-system

You are onboarding a project that **already encodes its planning conventions implicitly** — in folder
names, doc headers, ADR numbering, a roadmap, dated notes, git history. Your job is to **read that
evidence and propose** the one project-specific file the framework needs (`project-system.config.json`)
*plus* an initial `_project/` entity set, then let the human review and confirm. The framework core is
identical for every project; you change nothing under `.project-system/`.

**The contract you operate under (do not break these):**
- **Discover, don't invent.** Infer kinds/conventions from what's in the repo. Don't impose vocabulary
  the project doesn't already use.
- **Propose, never write blind.** Inference is lossy. Every proposal — the config and *each* migrated
  entity — is previewed for the human, who owns the result.
- **Compose, don't fork.** The config goes through `init-config.mjs`; every entity goes through
  `new-entity.mjs`. Both prove conformance before writing, so you never emit an un-validated artifact
  and never hand-write a `_project/` file. You are the judgment; the tools are the determinism.

If the project has **no** existing planning to mine, stop and redirect to `setup-project-system` (the
interview) or `init-config.mjs --preset standard` — this skill earns its keep only when there's
evidence to read.

## 0. Preconditions
- Confirm the framework is vendored at `.project-system/` (it holds `schema/`, `lib/`, `tools/`). If
  not, tell the user to vendor it first (copy `schema/ lib/ tools/` into `.project-system/`).
- If a `project-system.config.json` already exists, **read it first**. Note that `init-config.mjs`
  *regenerates the whole file* (it has no merge-with-existing path) — so to **augment** rather than
  clobber, fold the existing config's kinds and keys (`tagRegistry`, `relTargetKinds`, `render`,
  `sectionHints`, custom kinds) into the spec you build in §3, making the regenerated config a strict
  superset before re-running with `--force`. For a *single* deliberate kind add, prefer editing the
  existing config in place over regenerating.
- Get the **project slug** (lowercase, no spaces) — infer a candidate from the repo/dir name and
  confirm it.

## 1. Scan — gather the evidence (read-only)
Sweep the repo for planning signal. Don't classify yet; just collect. Look at:

- **Folder structure** — `docs/`, `adr/`, `decisions/`, `rfcs/`, `roadmap/`, `planning/`, `notes/`,
  `journal/`, `specs/`, `.github/ISSUE_TEMPLATE/`. Each recurring family is a candidate *kind*.
- **Filename patterns** (these map directly to a kind's `filename` scheme):
  - `NNNN-slug.md` (zero-padded serial) → **`serial`** — ordered, cited-by-number things (ADRs).
  - `YYYY-MM-DD-slug.md` → **`date-slug`** — dated, append-only logs (reports, sessions, journals).
  - bare `slug.md` → **`slug`** — named singular things (roadmaps, pipelines, most domain kinds).
- **Frontmatter keys** present across docs (`status`, `date`, `tags`, `owner`, …) — frequency tells
  you which fields the project already tracks, and candidate `tagRegistry` entries.
- **Heading vocabulary** inside docs (Grep for `^## `) — the body conventions become
  `requiredSections`/`scaffoldSections`. Recognizable shapes:
  - `Context` · `Decision` · `Consequences` → a **decision/ADR** kind.
  - `Goal` · `Outcome` · `Next` → a **session** or **report** kind.
  - `Plan` · `Phases` · `Milestones` → a **roadmap**.
  - swimlane / actor / step language → a **workflow** kind (`carriesSwimlanes: true`).
- **Status signals** (so migrated entities land in the *right* state, not all "draft"):
  - explicit `**Status:** accepted/proposed/done`, `status:` frontmatter, `[x]`/`[ ]` checkboxes,
    "Done / In progress / Blocked" labels.
  - **git recency** — `git log -1 --format=%cs -- <path>` for last-touched date; `git branch -a` and
    open work to gauge what's active vs shipped vs shelved.
- **The plan itself** — README status tables, `ROADMAP.md`, `CHANGELOG.md`, milestone/TODO lists:
  the raw material for the pipeline/progress snapshot in step 5.

Summarize the inventory back to the user before interpreting it.

## 2. Cluster & map — evidence → kinds (the judgment step)
Group the evidence into artifact families, then map each family to a **kind**. Start from the
`standard` vocabulary (`decision · report · pipeline · roadmap · session · workflow`) and reach for it
whenever the shape matches — only mint a **domain kind** when the evidence is strong and none of the
six fit (e.g. a repo full of `components/*.md` with a `Purpose`/`Interface` shape → a `component`
kind). For each kind, derive from the evidence (not from assumption):
- **folder** — reuse the project's own folder name where sensible (convention: plural).
- **filename scheme** — from the observed naming pattern (§1).
- **status enum** — from the observed lifecycle words; the first value is the `initialStatus`.
- **sections** — `requiredSections` (the few whose absence should warn — keep small) and a generous
  `scaffoldSections` from the observed headings.
- **`carriesSwimlanes: true`** if the kind's reason to exist is a process/swimlane.

Present the proposed kind→evidence mapping and get a thumbs-up before generating.

## 3. Propose the config (dry-run first — never write blind)
Assemble a JSON **spec** and pipe it to the generator with `--dry-run`. `extends: "standard"` seeds
the six kinds; same-named kinds you list **override**, new names **append**:

```bash
echo '{
  "extends": "standard",
  "kinds": [
    { "name": "decision", "folder": "adr", "filename": "serial",
      "status": ["proposed","accepted","superseded"],
      "scaffoldSections": ["Context","Decision","Consequences"] }
  ]
}' | node .project-system/tools/init-config.mjs --spec - --project <slug> --dry-run
```

Show the user the generated config. The tool fills defaults and **proves the config loads through the
framework's own loader** before emitting — so the preview is conformant by construction. Fix the spec
and re-run on any error. When the user confirms, re-run **without `--dry-run`** (add `--force` only to
replace an existing config — and only after you've folded its existing keys into the spec per §0, since
`--force` rewrites the whole file). This step is the same tail as `setup-project-system` — share it,
don't reinvent it.

## 4. Migrate the entities (the payload — one cluster at a time)
For each piece of existing planning the scan found, propose a corresponding entity and scaffold it
through `new-entity.mjs` — **never write `_project/` files by hand.** Work per-cluster (all decisions,
then all sessions, …), confirming the batch before creating it. For each entity:
- choose `--status` from the inferred status signal (§1), not the default;
- carry the inferred date with `--date YYYY-MM-DD` (from frontmatter or git);
- reconstruct edges with `--link <rel:target>` where the source doc references another artifact;
- carry registry-backed frontmatter values with `--tag <key=value>` (only keys you registered in the
  config's `tagRegistry` in §3 — otherwise the value is dropped, so don't fabricate a tag);
- then **transcribe** the source doc's content into the scaffolded sections with `Edit` (the scaffolder
  lays down the validated skeleton; you fill the body from the original, the human reviews — you never
  re-write the file from scratch, which would bypass the born-valid frontmatter).

```bash
node .project-system/tools/new-entity.mjs decision "<title from source>" \
  --status accepted --date 2025-11-03 --link references:decisions/0002-<slug>
```

Inference is lossy — flag anything ambiguous for the human rather than guessing silently. Skip, don't
fabricate: if a doc doesn't clearly map to a kind, leave it out and say so.

## 5. Snapshot the pipeline / progress (the "where are we" entity)
Synthesize the project's **current state** into entities the dashboard can render:
- a **`roadmap`** capturing the phases/milestones found in README/ROADMAP, each with its status;
- a **`pipeline`** for in-flight work, with stages reflecting what's `done` vs `active` vs `pending`
  (derived from checkboxes, git recency, open branches);
- optionally a **`session`** seeding the next-step handoff from the most recent activity.

Scaffold these the same way (§4), through `new-entity.mjs`, with statuses grounded in the evidence.

## 6. Confirm + next steps
- `node .project-system/tools/validate.mjs --root . --config ./project-system.config.json` → expect
  0 errors. Fix anything it flags (it reuses the same check the guard enforces).
- If the `.claude/` wiring isn't in place, copy `templates/consumer/.claude/` into the project (the two
  hooks + the `/new` command + these skills).
- If a Command Center is in use, the **Field Guide** now reflects the inferred conventions and the
  graph shows the migrated entities — point the user there to review the result.

## Principles to hold to
- **The config is the only project-specific file.** Never edit anything under `.project-system/`.
- **Validate, don't hand-craft.** Config → `init-config.mjs`; entities → `new-entity.mjs`. Everything
  is born valid; nothing is written un-checked.
- **Domain-neutral core, project-specific vocabulary.** You *infer* the project's own kind/folder/
  status words from its evidence — you don't impose a vocabulary, and the framework only validates the
  *shape*.
- **The human owns the result.** You produce a reviewable draft from evidence; inference is a proposal,
  not a decision. When unsure, ask or skip — never fabricate planning.
