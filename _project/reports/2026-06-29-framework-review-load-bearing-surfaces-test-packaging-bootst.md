---
title: "Framework review — load-bearing surfaces, test/packaging/bootstrap assurance, and future"
status: draft
updated: 2026-06-29
tags: { scope: framework }
---

# Framework review — load-bearing surfaces, test/packaging/bootstrap assurance, and future

> **Status:** draft (2026-06-29)

A full read-through and critical review of the framework, commissioned to answer six
questions: what is load-bearing, how to test the framework's features / packaging /
bootstrap, what standardized test data would give consistent and varied starting points,
and where the system's potential and future lie. **Verdict: the design is sound and the
single-source discipline is real; the weaknesses are in assurance coverage and in
packaging claims that outrun their enforcement — all fixable without redesign.**

## Outcome

**What shipped**

- A critical review covering the whole core read in full: `schema/` (both schemas),
  `lib/{md,contract,swimlane}.mjs`, all eight `tools/`, `templates/consumer/.claude/`
  (settings + `setup-project-system` skill), `apps/command-center` contract scripts
  (`verify-contract.mjs`, `render-all.mjs`), both live configs, `docs/spec/schema.md`, and
  the `examples/soul-steel-demo/` fixtures.
- **A load-bearing map ranked by blast radius.** Headline: the two highest-blast-radius
  files — `lib/md.mjs` (the frontmatter/section parser every tool reads through) and
  `lib/contract.mjs` `buildContext` (the base+config seam) — carry the *least* direct test
  coverage, while the well-tested `validateEntity` (`tools/validate.mjs`) sits one layer
  above them and silently inherits their bugs. Test investment is inverted relative to risk.
- Tiering used: **Tier 0** (catastrophic blast radius) — `lib/md.mjs`, `buildContext`,
  `validateEntity`; **Tier 1** (contract artifacts) — `schema/project-entity.base.schema.json`,
  the per-project config; **Tier 2** (engines) — swimlane, new-entity, guard, init-config,
  check-consumer-drift, render-hub; **Tier 3** (surfaces) — `.claude/` template, the React
  app, the emitted `previews/dashboards/*.json`.

**What didn't**

- No code or test changes were made — this report is analysis only. Every concrete
  follow-up is filed under Carry-forward for separate build sessions.

## Surprises

- **`lib/md.mjs` has no `--self-test` and is absent from `npm test`** — yet every engine
  parses through it, making it the single highest-blast-radius file in the repo. A latent
  defect already exists: `parseFlowMap` splits a flow map on *every* comma, so
  `tags: { note: "a, b" }` mis-parses. Pattern: the least-guarded code is the most
  load-bearing. (`lib/swimlane.mjs`, the *other* lib file, is well tested — the asymmetry is
  the tell.)
- **The base schema is documentary, not executed.** `loadBaseSchema()` is consumed at
  runtime only for `$defs.rel.enum`; the schema's `required`, `additionalProperties:false`,
  `format:date`, and the tag shadow-rule are hand-reimplemented inside `validateEntity`. A
  deliberate zero-dep tradeoff — but nothing tests that the schema and the validator still
  agree, so they can diverge silently. The config meta-schema is likewise unenforced against
  a hand-written config (only `buildContext`'s subset + `init-config`'s `normalizeKind` run).
- **"CI drift check" has no CI.** The README and `check-consumer-drift.mjs` both call it
  that, but there is no `.github/workflows`; the suite runs only on a manual `npm test`. The
  `SessionStart` hook runs `validate.mjs --summary` only, never the suite.
- **The consumer registry is pinned to absolute machine paths.** `soul-steel`'s
  `schema`/`root`/`ownValidator` are `/Users/nicholasosto/...`, so off this laptop the only
  real consumer auto-skips and just the in-repo demo runs — the "2 consumers, publish at 3"
  guarantee is verifiable only locally.
- **Self-tests parallel the real seam instead of running through it.** `validate.mjs` and
  `new-entity.mjs` each build a hand-rolled `syntheticCtx` that *mirrors* the real `ctx`
  rather than calling `buildContext`, so a seam-shape regression would not trip them. And
  there are **no negative on-disk fixtures at all** — every bad-input case is an inline
  synthetic string inside a `--self-test`.

## Decisions made

Recommendations, prioritized (each maps to a Carry-forward item):

- **D1 — Test `lib/md.mjs` first.** Add a `--self-test` and wire it into `npm test`. Highest
  ROI, cheapest fix. Pin the comma/colon-in-flow-value, quoted-`#`, CRLF, missing-closing-`---`,
  and `## heading`-inside-code-fence cases. → `[CF-1]`
- **D2 — Build a `fixtures/` conformance corpus.** `(config + _project tree + expected.json)`
  golden pairs across a deliberate matrix (config shapes; per-entity severities for every
  check; variety axes: tiny / large / deliberately-drifted). Makes "same starting point"
  literally true and turns a behavior change into a reviewable diff. → `[CF-2]`
- **D3 — Add real CI** (GitHub Actions, Node ≥18, `npm test`) so the mirror discipline is
  machine-enforced rather than habitual. → `[CF-3]`
- **D4 — Add end-to-end + bootstrap smoke tests** that run the *real* seam from scratch in a
  tmpdir (init-config → new-entity per kind → validate → guard a known-bad write → render-hub
  → verify-contract), plus the README adoption arc (vendor → config → copy `.claude` →
  hook-parity). → `[CF-4]`
- **D5 — Version the contract.** Add a `version` field the drift check *reads*, with a
  documented compat rule, before a 3rd consumer makes migration a live problem (the contract
  just grew: workflow kind, swimlanes, per-step refs). → `[CF-5]`
- **D6 — Hardening cluster.** `render-hub.mjs --self-test` (754 lines, untested beyond
  `--check`); a schema-parity self-test (`shadowKeys(base) ⊆ PRIMITIVE_KEYS`,
  `base.required ⊆ AUTHORED ∪ DERIVED`, rel enum match); resolve the `templates/`-vs-published-`files`
  inconsistency. → `[CF-6]`

Framing for the future (no decision required, recorded for direction): the differentiated
surface is **the AI-native control loop** (guard + session summary + born-valid scaffolder +
replayable swimlane workflows = an agent that plans and stays conformant by construction) and
**the planning surface as a queryable graph** (typed edges already resolved by the validator;
the §6 drift rules in `docs/spec/schema.md` are only partly implemented). Harden the assurance
story, *then* publish `@trembus/project-schema`.

## Carry-forward

- `[CF-1]` Write `lib/md.mjs --self-test` (incl. the `parseFlowMap` comma defect) + add to `npm test`. — deferred: review is analysis-only; small focused build.
- `[CF-2]` Scaffold `fixtures/` conformance corpus + golden-test harness. — deferred: larger build; it's the substrate CF-4 and the schema-parity test build on.
- `[CF-3]` Add `.github/workflows` running `npm test` on Node ≥18. — deferred: independent of the others; do any time.
- `[CF-4]` End-to-end + bootstrap smoke tests through the real seam. — deferred: depends on the CF-2 substrate.
- `[CF-5]` Versioned contract + a drift-check version axis + a compat rule. — deferred: gate it before the 3rd-consumer publish event.
- `[CF-6]` `render-hub.mjs --self-test`; schema-parity self-test; `templates/` packaging fix. — deferred: hardening cluster, lower urgency than CF-1.

## Verification evidence

| Gate | Method | Evidence |
|---|---|---|
| Suite green at review time | `npm test` | 87 assertions across six engine self-tests (swimlane 15 · init-config 14 · validate 25 · scaffolder 13 · guard 13 · drift 7) + check-zero-deps + demos-only drift + render `--check` + verify-contract — all PASS |
| Core read in full | manual read | `schema/*` (2), `lib/*` (3), `tools/*` (8), `templates/consumer/.claude/*`, `apps/command-center/scripts/{verify-contract,render-all}.mjs`, both configs, `docs/spec/schema.md`, demo fixtures |
| Single-source claim verified | code trace | `validateEntity` imported + reused by new-entity / guard (and render reads the same `ctx`); `lib/md.mjs` imported by every tool; `loadBaseSchema()` consumed only for `$defs.rel.enum` |
| Latent parser defect | code inspection | `lib/md.mjs` `parseFlowMap` splits on every `,` — `tags: { note: "a, b" }` mis-parses; no test guards it |
| Packaging enforcement gap | repo inspection | no `.github/workflows`; `check-consumer-drift.mjs` `CONSUMERS[0]` paths are absolute to this machine |
