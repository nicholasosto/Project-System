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

**Re-validated 2026-06-29** — a 7-reviewer adversarial pass re-checked each item against the
live repo (each charged to *refute* the problem or the fix). Five of seven were re-scoped; the
revised items below supersede the original framing. The big find: **CF-2 and CF-4 collapse onto
one untested seam — `buildContext` (`lib/contract.mjs:91-166`)** — and **CF-5 was aimed at the
frozen base schema instead of the config schema that actually grows.**

- `[CF-1]` **DONE** — added a 16-case `lib/md.mjs --self-test` (wired first in `npm test`) and fixed three real parser defects (flow-map comma split, silently-ignored CRLF frontmatter, `##`-inside-a-fence). Suite now 103 assertions green.
- `[CF-2]` **Reframed → cover `buildContext` end-to-end.** Drop the `fixtures/` matrix — it duplicates `validate.mjs:282-315` (≈26 severity-tagged cases on a real temp tree) and `swimlane.mjs`. The actual gap: every tool's `--self-test` hand-builds a `syntheticCtx` and bypasses `buildContext` (the config→ctx composition: rollout→severity, filename scheme, `carriesSwimlanes`→`swimlaneKinds`, throw-invariants). First slice: a hermetic `lib/contract.mjs --self-test` asserting those derived fields (zero new files). Optional second slice: ONE on-disk *negative* fixture consumer under `examples/` (3-4 broken entities) wired into the drift check — the only thing that exercises the full `md.mjs → loadEntities → buildContext → validateEntity` path. **Status: first slice shipped 2026-06-29** (`contract.mjs --self-test`, 13 cases). Remaining (optional): the on-disk negative fixture consumer.
- `[CF-3]` **Confirmed sound → add CI.** GitHub Actions running `npm test` on push-to-main + PR, Node matrix 18/20/22. **Critical: NO install step** — the repo is zero-dep with no lockfile, so `npm ci` would fail; run `npm test` directly, no caching. Passes today (the external soul-steel consumer is excluded under `--demos-only`). **Status: shipped 2026-06-29** (`.github/workflows/ci.yml`, no install step).
- `[CF-4]` **Narrowed — mostly already covered.** The real seam IS exercised today by `guard.mjs` + `init-config.mjs` self-tests (both drive `loadContract`→`buildContext`). Minimum-viable fix: one assertion that the hand-rolled `syntheticCtx` keys ⊇ `buildContext` keys (directly guards the parallel-ctx-drift risk). Nice-to-have: a small `e2e-smoke.mjs` spawning the four CLI *binaries* in a tmpdir (catches argv/IO-contract regressions the function-level tests can't) + a README bootstrap-arc smoke. **Status: min fix shipped 2026-06-29** (`synthetic ctx ⊆ buildContext` guard in the validator self-test). Remaining (optional): the binary-chain + README bootstrap smoke.
- `[CF-5]` **Reframed → mirror the *config* schema, not version the base one.** The base schema is frozen (one commit since extraction); all contract growth landed in `project-config.schema.json`, which the drift check **never mirrors** (consumers mirror only `project-entity.schema.json`). `x-version` is vestigial (`1.0.0` in both, never bumped). Real win: extend `structuralCheck` to also mirror `project-config.schema.json` — closes the actual gap (a consumer on a stale config-meta-schema, invisible today). The behavioral axis already catches real breaks. If versioning is wanted, put it on the config schema + a one-line "config fields are additive-only" rule in `docs/spec/schema.md`. **Priority: later · publish-gated.**
- `[CF-6a]` **Reframed → pin the path the dogfood *hides*.** Drop `buildGuide` uniqueness (already covered by `verify-contract.mjs:79-94`) and the facet readers (impure — read `.claude/` off disk). The genuinely 0%-covered, highest-risk code is the **auto-place + overflow** branch (`render-hub.mjs:591-616`) — never run because the dogfood declares explicit `render.hex.petals` while its 7 kinds *would* overflow. Best done by extracting a pure `placePetals(ctx, model)` helper, then pinning it + `extractRuns` windowing (>25 records) + `tone/dot` rotation fallbacks, with a teeth-check (mutate a constant, confirm red). **Status: shipped 2026-06-29** (`placeDomains` extracted as a pure helper + a 10-case `render-hub --self-test`; `--check` byte-identical, so no contract drift). Dropped as planned: `buildGuide` (covered by `verify-contract`) and the impure facet readers.
- `[CF-6b]` **Reframed → hoist the third copy, then assert equality.** The required-set is a *third* hand-copy (inline literal at `validate.mjs:87`), not derived from `AUTHORED_FIELDS`. Hoist it to a named export (that hoist *is* the value — removes the duplicate), then assert `schema.required == REQUIRED_AUTHORED ∪ DERIVED_FIELDS` and shadow-keys **equality** (not subset — subset tolerates the dangerous direction). Drop the rel-enum check (tautological — `relEnum` is derived from base). ~10-line case in the existing `validate.mjs` self-test. Passes today → it's a guard. **Status: shipped 2026-06-29** (`REQUIRED_AUTHORED` hoisted to `lib/contract.mjs`; shadow-equality + required-set parity cases added; rel-enum check dropped).
- `[CF-6c]` **Reframed → doc line now, allowlist at publish.** The whole install is checkout-based `cp -R` (`private:true`, no npm-install path yet), so the `files` allowlist is dormant. Now-action: one doc line that the wiring is vendored-from-checkout. At publish, set `files: [lib, tools, schema, templates]` and drop `examples/` (checkout/CI-only). Optional guard: assert every path the docs say to `cp -R` appears in `files`. **Status: now-action shipped 2026-06-29** (`templates` added to `files`; README clarifies the wiring is vendored-from-checkout). Remaining: finalize the allowlist (drop `examples/`) at publish.

**Implemented 2026-06-29** (suite 87 → 129 self-test assertions): CF-1, CF-2 (first slice),
CF-3, CF-4 (min guard), CF-6a, CF-6b, CF-6c (now-action). **Still open:** CF-5 (mirror the config
schema — publish-gated), plus the two optional larger slices (CF-2's negative-fixture consumer and
CF-4's binary-chain/bootstrap smoke) and CF-6c's publish-time allowlist finalization.

## Verification evidence

| Gate | Method | Evidence |
|---|---|---|
| Suite green at review time | `npm test` | 87 assertions across six engine self-tests (swimlane 15 · init-config 14 · validate 25 · scaffolder 13 · guard 13 · drift 7) + check-zero-deps + demos-only drift + render `--check` + verify-contract — all PASS |
| Core read in full | manual read | `schema/*` (2), `lib/*` (3), `tools/*` (8), `templates/consumer/.claude/*`, `apps/command-center/scripts/{verify-contract,render-all}.mjs`, both configs, `docs/spec/schema.md`, demo fixtures |
| Single-source claim verified | code trace | `validateEntity` imported + reused by new-entity / guard (and render reads the same `ctx`); `lib/md.mjs` imported by every tool; `loadBaseSchema()` consumed only for `$defs.rel.enum` |
| Latent parser defect | code inspection | `lib/md.mjs` `parseFlowMap` splits on every `,` — `tags: { note: "a, b" }` mis-parses; no test guards it |
| Packaging enforcement gap | repo inspection | no `.github/workflows`; `check-consumer-drift.mjs` `CONSUMERS[0]` paths are absolute to this machine |
