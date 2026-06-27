# The `ProjectEntity` contract

> **Status:** active (updated 2026-06-24). The project-agnostic core of the project-system
> framework. Extracted and generalized from Soul-Steel-Official on 2026-06-24; the
> machine contract is split into a universal base
> ([project-entity.base.schema.json](../../schema/project-entity.base.schema.json)) and a
> per-project config ([project-config.schema.json](../../schema/project-config.schema.json)).
> This document explains both and the first-principles reduction behind them.

This is the analog, for the planning layer, of a component library's `ComponentContract`:
one non-optional shape that simultaneously feeds the checker, the authoring commands, the
save-time guard, and the dashboard. Pin the shape once; everything downstream is generated
from it.

**Why this exists:** a `_project/` folder holds several *kinds* of planning artifact, and
left alone each invents its own status encoding and structure. This contract defines **one
shape** that all kinds derive from — so validation, drift detection, authoring, guarding,
and rendering all read a single source of truth instead of each re-deriving it.

---

## 0. First principles — the three primitives

A planning artifact is a *projection of work-state over time* — the same way a UI is a
projection of machine state. Reduced to irreducibles (the change-test, orthogonality, and
minimum-description-length; provenance in §9), every `_project/` file is exactly three
things and no more:

| Primitive | Realized as | Why it's irreducible |
|---|---|---|
| **Identity** | `kind` (from folder), `id` (from filename), `title` | without it the artifact is anonymous; `id` is the link target |
| **State** | `status` (+ `updated`) | where it sits in its lifecycle and when it last moved |
| **Relation** | `links[]` | the edges; without them the folder is a pile, not a graph |

Everything else a planning doc *can* carry (`priority`, `agent`, `milestone`, `scope`,
`stage`, …) is an **accidental facet** — it either folds into one of the three above or
rides in an optional `tags` bag.

Cross-domain note: a sibling component library reduced an interactive UI to **five**
primitives (Surface, Mark, Affordance, State, Relation). A planning artifact reduces to
**three** — and two (`State`, `Relation`) are the same primitives by name. It drops
Surface/Mark/Affordance because a document isn't interactive: it doesn't afford action, it
just declares what it is.

---

## 1. Where machine-readable truth lives — base + config

The effective contract is composed from two files:

- **The base schema** (`schema/project-entity.base.schema.json`) — the universal part: the
  three primitives, the `links` shape, the rel vocabulary, the tag shadow-rule. **Identical
  for every project.** Status is just `string` here; `kind` carries no fixed enum.
- **The project config** (`<project>/project-system.config.json`, validated by
  `schema/project-config.schema.json`) — the *only* project-specific file: which kinds
  exist, their folders, per-kind status enums, section conventions, the tag registry,
  milestone markers, rel→kind rules, and render metadata.

`lib/contract.mjs` composes the two into a runtime `ctx`; the engines consume `ctx` and
never read project specifics directly.

**A thin canonical frontmatter block is the machine authority; the prose header stays.**
The rich human-readable `**Status:**` header is not deleted — it becomes *derived
narrative*, and the frontmatter↔prose agreement becomes a free drift rule (§8 #2). Parsing
prose is brittle; YAML is not.

---

## 2. The shared contract (`ProjectEntity`)

Every `_project/` file — regardless of kind — carries this frontmatter (`kind` and `id` are
**not** authored; they are derived from the path — see §8 #3):

```yaml
# file: _project/decisions/0005-slotable-items.md
#   → kind = "decision" (folder), id = "0005-slotable-items" (filename) — both derived
title: Open the slotable-items slot taxonomy
status: accepted             # State — ranges over a per-kind enum (config)
updated: 2026-06-20          # State — ISO date of the last substantive edit
links:                       # Relation — typed edges (§5); omit if none
  - { rel: superseded-by, target: decisions/0009-unified-registry }
tags: { scope: ip-wide }     # accidental facets — optional, linted-not-required
```

As the TypeScript shape the validator and any renderer share:

```ts
export interface ProjectEntity {
  // Identity — kind + id are loader-derived from the file's path, never authored
  kind: string;          // = the folder ('_project/decisions/' → 'decision')
  id: string;            // = the filename stem
  title: string;         // the only authored Identity field
  // State
  status: string;        // narrowed to a per-kind enum by the project config (§4)
  updated: string;       // ISO 'YYYY-MM-DD'; the validator rejects future dates
  // Relation
  links?: { rel: EntityRel; target: string }[];
  // Accidental facets — optional, never required
  tags?: Record<string, string | number>;
}
```

The authored surface is just `title`/`status`/`updated` (+ optional `links`/`tags`).

---

## 3. What differs per kind (only two things) — and it's all config

Every kind shares the identical surface above. A kind is distinguished by exactly two
things, both declared in the project config, **neither a different field set**:

1. **The enum its `status` ranges over** — `config.kinds[kind].status` (§4).
2. **The sections conventionally present in the body** — a *warning*, not an error. Body
   structure is convention, not contract. The config splits this into
   `requiredSections` (absence → warning) and `scaffoldSections` (the fuller template the
   scaffolder writes at CREATE time, so a fresh file has zero missing-section warnings).

What used to tempt a per-kind field, and where it goes instead:

| Tempting field | Becomes | Why |
|---|---|---|
| `stage` (pipeline) | `status`'s enum for `kind: pipeline` | not orthogonal to status; the change-test collapses them |
| `milestone` | a `link`: `{ rel: milestone, target: M5 }` | a milestone is a relation, not an axis |
| `gateDate` | derived — the `updated` at the `status → complete` transition | state-history, not a primitive |
| `id` + `kind` | derived — from the filename + folder (§8 #3) | authoring them duplicates the file's own name/location |
| `priority`, `agent`, `scope` | optional `tags` (§4), warned-not-required | near-constant or kind-local → low information |

---

## 4. `status` enums and the `tags` registry — both config

### 4a. `status`, per kind (`config.kinds[<kind>].status`)

`status` is the single State axis. The framework imposes no fixed enums; a project
declares them. The framework's own config, for example, uses:

| kind | `status` enum |
|---|---|
| `decision` | `proposed` · `accepted` · `superseded` · `rejected` |
| `report` | `draft` · `complete` |
| `pipeline` | `design` · `qualify` · `build` · `ship` · `archive` · `shelved` |
| `roadmap` | `proposed` · `active` · `superseded` · `complete` |
| `session` | `planned` · `active` · `blocked` · `completed` · `shelved` |

### 4b. `tags` — a known-key registry (`config.tagRegistry`)

Facets live in `tags`. **Known keys have their VALUES validated; unknown keys are ALLOWED
but surfaced** (info-level), so a new facet never blocks authoring. Two guardrails are
universal (in the base schema, not config):

- **Primitive-shadowing keys are rejected** — `tags: { status, kind, links, … }` is an
  error; those belong to the three primitives.
- **Promotion on recurrence** — an unknown key appearing in ≥3 files is the signal to
  promote it to a known key or fold it into a primitive.

Rendering richness tracks known-ness: a known tag drives a real encoding; an unknown tag
renders generically or is ignored.

---

## 5. The relationship model (edges)

The highest-leverage primitive. `links` turns the flat folder into a **graph**. The rel
vocabulary is universal (base schema); which *kinds* each rel may target is project config
(`config.relTargetKinds`).

```ts
export type EntityRel =
  | 'supersedes' | 'superseded-by'   // the lineage chain
  | 'predecessor' | 'successor'      // milestone / plan chain (M4 → M5)
  | 'milestone'                      // → a milestone marker
  | 'implements'                     // → an external spec
  | 'decided-in'                     // → a decision
  | 'references';                    // soft pointer
```

Targets are **kind-folder-qualified path stems** (`decisions/0009-…`), a milestone marker
(`M5`), or an external ref (`slice.md#M5`). The validator resolves a target to a file and
checks its `kind` against what the rel expects — a dangling or wrong-kind target is a drift
error.

---

## 6. How every downstream layer derives from this

One contract, derivations everywhere:

| Schema element | Validator check | Drift rule | Visual component |
|---|---|---|---|
| `status` | ∈ per-kind enum (config) | frontmatter ≠ prose `**Status:**` (§8 #2) | `Badge` tone, status bar |
| `updated` | ISO, not future | stale while in-flight | `Stat`, sparkline |
| `links: superseded-by` | target resolves, is a `decision` | superseded item still cited as live | lineage edge |
| `links: milestone` | target ∈ known markers | references a dead milestone | swimlane lane |
| conventional sections | present → warn if missing | — | card body shape |
| rollup of all kinds | — | counts disagree with an external status doc | hub overview |

Drift detection is **not a separate system** — it's the validator run across files instead
of within one. *(The scar this prevents — Duplicate Data Source Across Layers — is exactly
why the contract must exist before the first renderer.)*

---

## 7. Adopting the framework in a project

1. **Author a config.** Copy `examples/soul-steel.config.json`; declare your kinds (folder,
   status enum, initial status, filename scheme, sections) plus the tag registry,
   milestones, rel→kind rules, and render metadata.
2. **Run the validator** (`node tools/validate.mjs --root <project> --config <…>`). Files
   without frontmatter report as *pending migration* (info), so it's useful before any
   migration is complete and tracks the gap.
3. **Wire authoring + guarding.** Copy the `/new` command and add the `PreToolUse`
   (`Write|Edit`) guard hook — a new file is conformant by construction, an invalid write
   is blocked at save time.
4. **Render** (`node tools/render-hub.mjs`) for the model-driven hub dashboard.
5. **Register** the project in `tools/check-consumer-drift.mjs` so its copy of the contract
   stays honest.

*Provenance:* this framework was first built inside Soul-Steel-Official as phases A→E
(sessions = reference shape; migrate; contract + validator; scaffolder + guard; render),
then extracted here. Soul-Steel remains a live consumer (`examples/soul-steel.config.json`
reproduces its baseline exactly).

---

## 8. Design decisions

1. **Pipeline `stage` vs `status`** → **collapsed to one axis.** `stage` is `status`'s
   enum for `kind: pipeline`.
2. **Authority direction** → **frontmatter is authority; the validator ENFORCES agreement,
   never generates.** The leading status word of the prose header (after stripping emoji)
   must map to the frontmatter `status`; trailing qualifiers are free narrative. Severity is
   `config.proseStatusEnforcement.rollout` (`off`/`warn`/`error`).
3. **`id`/`kind` scheme** → **both derived, never authored:** `kind` = the folder, `id` =
   the filename stem. Per-kind filename conventions stay (`serial`/`date-slug`/`slug`, in
   config). A rename is a "fix inbound links" event the dangling-link check surfaces.
4. **Where the contract physically lives / how consumers get it** → **base + config, with a
   mirror-and-CI-check across consumers.** The canonical universal artifact is
   `schema/project-entity.base.schema.json` here; a consumer keeps its own copy and
   `tools/check-consumer-drift.mjs` asserts the copies stay identical (structurally) and
   behaviorally equivalent. **Publish `@trembus/project-schema` only at the 3rd consumer**
   — a build-time type-with-a-check is not the Duplicate-Data-Source scar; two live runtime
   subscribers would be. See `_project/decisions/0002-…`.
5. **`tags` discipline** → **hybrid known-key registry**: known values linted; unknown keys
   allowed but surfaced; primitive-shadowing rejected; recurring unknowns promoted.
6. **Domain neutrality of the renderer** → the hub kit's hex-slot vocabulary is
   **quarantined to one adapter line**; no domain word appears in config/schema/contract/
   docs. See `_project/decisions/0003-…`.

---

## 9. Provenance — the first-principles reduction

The §0 three-primitive core was derived using four artificial-brain concepts as
instruments:

- **The change-test** (`State — UI Primitive`): *a field is State if changing it changes
  where the artifact sits in the work.* `stage` and `status` pass identically → same
  primitive.
- **Orthogonality** (`Primitives as Color-Coded Ontology`): primitives must be orthogonal.
  `stage ⊥ status` fails; `milestone` is a relation, not an axis; `gateDate` derives from a
  status transition.
- **Minimum Description Length** (`Kolmogorov Complexity`): a field earns a required slot
  only if it *varies* and carries information. `scope` is near-constant → a tag.
- **Schema-as-Contract Dual-Renderer**: one contract, many disposable renderers; *resist
  letting a renderer just add a field.* Its companion scar (Duplicate Data Source Across
  Layers) is why the contract must precede the first renderer, and why §8 #4's mirror is a
  type-with-a-check, not a second live source.

*The keystone of the planning support system — the validator, drift rules, commands, guard,
and visual components all derive from the three primitives in §0 and the base contract in
[project-entity.base.schema.json](../../schema/project-entity.base.schema.json).*
