# Migration eval — Soul-Steel (pre-framework → golden config)

A **golden test for the `migrate-project-space` skill**: a believable *pre-framework* project
snapshot whose correct inference is a known-good config, plus a deterministic scorer for "how close
did the inference land?". Named in [decision 0014](../../_project/decisions/0014-migration-skill-infers-config-from-existing-planning.md)'s
*Re-open if*.

> **This is NOT a consumer and NOT dogfood.** `before/` has **no** `project-system.config.json` — that's
> the whole point (pre-migration). No engine scans it: `validate.mjs`/`render-hub.mjs` only touch the
> repo-root `_project/`, and `check-consumer-drift.mjs` only processes *registered* consumers + configs
> flagged `"demo": true`. It is fixture data for an eval, nothing else. (See the dogfood-vs-demo split in
> the root `CLAUDE.md`.)

## The pieces

| Path | Role |
|---|---|
| `before/` | The **input** — an organically messy pre-framework Soul-Steel: ADRs under `docs/decisions/`, dated retros in `reports/`, a delivery board in `delivery/`, work logs in `journal/`, a `docs/roadmap.md`, ad-hoc frontmatter tags. |
| [`../soul-steel.config.json`](../soul-steel.config.json) | The **golden** — the hand-authored config from the original Soul-Steel migration. The target the inference should hit. |
| `inferred.config.json` | The **captured baseline** — what the skill's procedure infers from `before/`, generated born-valid through `init-config.mjs`. Re-generate by re-running the skill (below). |
| [`../../tools/compare-config.mjs`](../../tools/compare-config.mjs) | The **scorer** — neutral, structural, self-tested. Scores any inferred config against the golden. |

## Run it

```bash
# 1. Run the skill (judgment): point migrate-project-space at before/, which derives a spec and
#    generates a config via init-config.mjs. The captured baseline below is one such run.
# 2. Score the result (determinism):
node tools/compare-config.mjs \
  --expected examples/soul-steel.config.json \
  --actual   examples/soul-steel-premigration/inferred.config.json
```

`compare-config.mjs --self-test` runs in `npm test`; the eval *run* itself is manual (the inference is
an LLM/skill step, not a deterministic tool — by [0014](../../_project/decisions/0014-migration-skill-infers-config-from-existing-planning.md)'s design, judgment lives in the skill).

## Baseline result — overall similarity **99%**

The reference inference recovers all 5 kinds, every filename scheme, the tag + rel registries, and the
section conventions. What it does *not* perfectly reproduce is exactly what an eval should surface:

- **Scored miss (1):** `pipeline.status` recovered `[design, qualify, build, ship, shelved]` but the
  golden also has `archive` — the snapshot's delivery board only evidences five stages, so the
  inference honestly under-recovers the lifecycle. *This is the eval doing its job:* a real gap shows
  up as a concrete checkpoint failure, not a silent pass.
- **Advisories (not scored — normalization choices, not correctness):**
  - folder `delivery` → golden `pipeline`, and `journal` → golden `sessions`. The skill **preserves the
    project's own folder names**; the human **normalized** them at migration time. A genuine, expected
    divergence — folder naming is a human call the inference shouldn't presume.
  - `agent` tag values: inference recovered only the observed `[neutral, claude, human]`; the golden
    registry also lists `codex`. (Tag *values* are advisory; the *key* + *type* matched.)
  - `proseStatusEnforcement.rollout`: inference proposes `warn` (the lenient adoption default); the
    mature Soul-Steel config runs `error`. You tighten *after* adopting — correct to diverge here.

## Why this exists

It converts "is the migration skill any good?" into a number with a per-axis breakdown. Edit the skill
and the score moves: drop the session sections and `attributes` accuracy falls with a concrete diff;
rename `decisions`→`docs` and a folder advisory appears; invent a `workflow` kind with no evidence and
`kinds` precision drops. The scorer weights *structure* (kinds, schemes, status sets, sections, tag/rel
registries) and treats *naming/strictness* as advisory — so the headline tracks correctness, not taste.
