---
name: setup-project-system
description: >-
  Set up or evolve a project's planning conventions for project-system — choosing the entity
  kinds, their folders, status enums, filename schemes, and body sections, then generating a
  valid project-system.config.json. Use when adopting the framework in a GREENFIELD project (no
  existing planning to mine), when the user asks "what kinds/conventions should my project have",
  or when deliberately adding/renaming a single kind by hand. If the project ALREADY has planning
  material (docs, ADRs, a roadmap) to import, use migrate-project-space instead — it infers the
  config and an initial entity set from that evidence.
allowed-tools: Bash(node .project-system/tools/init-config.mjs:*), Bash(node .project-system/tools/validate.mjs:*), Bash(node .project-system/tools/new-entity.mjs:*), Read, Edit
---

# Set up project-system planning conventions

You are helping the user author the one project-specific file the framework needs:
`project-system.config.json`. It declares the project's **naming conventions** — which entity
*kinds* exist, each kind's folder, status enum, filename scheme, and body sections. The framework
core is identical for every project; only this file changes. Don't hand-write it — run the
interview below, then let `init-config.mjs` generate and validate it.

## 0. Preconditions
- Confirm the framework is vendored at `.project-system/` (it holds `schema/`, `lib/`, `tools/`).
  If not, tell the user to vendor it first (copy `schema/ lib/ tools/` into `.project-system/`).
- If a `project-system.config.json` already exists, read it first and treat this as an *edit*
  (you'll regenerate with `--force`, or hand-edit a single field instead).

## 1. Interview (don't assume — these are the conventions the project will live with)
Ask, in plain language:
1. **Project slug** — a short identifier (e.g. `acme-web`). Lowercase, no spaces.
2. **What does this project plan?** From the answer, derive the **kinds**. Most projects want a
   subset/superset of the `standard` preset's six: `decision · report · pipeline · roadmap ·
   session · workflow`. Add domain kinds if they fit (e.g. `character`, `component`, `experiment`).
3. For **each kind**, settle:
   - **folder** — the subfolder under `_project/` (convention: plural, e.g. `decisions`). `id` is
     derived from the filename, `kind` from this folder.
   - **status enum** — the lifecycle, birth → terminal. The first value is the `initialStatus` a
     freshly scaffolded entity is born with.
   - **filename scheme** — pick by how the kind is referenced:
     - `serial` (`0001-slug`) — ordered things cited by number (decisions/ADRs).
     - `date-slug` (`YYYY-MM-DD-slug`) — dated, append-only logs (reports, sessions).
     - `slug` (`bare-slug`) — named singular things referenced by name (roadmaps, pipelines,
       workflows, most domain kinds).
   - **sections** — `requiredSections` (the few whose absence warns) and, if richer, the fuller
     `scaffoldSections` written at create time. Keep required small; let scaffold be generous.
   - If entities of this kind *are* workflows (their `## Workflow` swimlane is the reason they
     exist), set `carriesSwimlanes: true`.

Default to **starting from the `standard` preset** and tweaking — it's the framework's own six
kinds with sensible schemes/status/sections. Only build from scratch if the project's planning is
genuinely unlike that.

## 2. Generate (preview first — never write blind)
Assemble a JSON **spec** from the interview and pipe it to the generator with `--dry-run` to
preview. `extends: "standard"` seeds the six kinds; same-named kinds you list **override**,
new names **append**. Example:

```bash
echo '{
  "extends": "standard",
  "kinds": [
    { "name": "decision", "status": ["proposed","accepted","superseded","rejected"] },
    { "name": "component", "folder": "components", "status": ["draft","active","deprecated"],
      "filename": "slug", "requiredSections": ["Purpose"],
      "scaffoldSections": ["Purpose","Interface","Notes"] }
  ]
}' | node .project-system/tools/init-config.mjs --spec - --project acme-web --dry-run
```

Show the user the generated config. The tool fills defaults (folder=name, initialStatus=status[0],
filename=slug, scaffoldSections=requiredSections) and **proves the config loads through the
framework's own loader** before emitting — so what you preview is conformant by construction. If
it errors (e.g. duplicate folder, invalid scheme), fix the spec and re-run.

For the plain six-kind default, no spec is needed:
```bash
node .project-system/tools/init-config.mjs --preset standard --project acme-web --dry-run
```

## 3. Write (after the user confirms)
Re-run the same command **without `--dry-run`** (add `--force` only when intentionally replacing an
existing config). The config lands at the project root.

## 4. Confirm + next steps
- `node .project-system/tools/validate.mjs --root . --config ./project-system.config.json` → expect
  0 errors (a fresh project has 0 entities).
- If the `.claude/` wiring isn't in place yet, copy `templates/consumer/.claude/` into the project
  (the two hooks + the `/new`·`/start`·`/end`·`/reflect` commands + these skills).
- Scaffold the first entities: `node .project-system/tools/new-entity.mjs <kind> "<title>"` — one
  per kind to create the `_project/<folder>/` tree.
- If a Command Center is in use, the **Field Guide** tab now reflects exactly these conventions
  (it's derived live from this config) — point the user there to review what they chose.

## Principles to hold to
- **The config is the only project-specific file.** Never edit anything under `.project-system/`.
- **Validate, don't hand-craft.** Always go through `init-config.mjs` so the result is born valid.
- **Domain-neutral core.** Kind/folder/status *words* are the project's to choose; the framework
  only validates the *shape*. Don't push a project toward particular domain vocabulary.
