---
title: "Port session lifecycle + self-improvement bridge — implementation"
status: completed
updated: 2026-07-21
tags: { last-active: 2026-07-21T14:50, kos: "spec, consumers, memory, dashboards" }
---

# Port session lifecycle + self-improvement bridge — implementation

> **Status:** completed (2026-07-21)

## Goal

Implement the [port-session-lifecycle-self-improvement-bridge](../pipeline/port-session-lifecycle-self-improvement-bridge.md) pipeline end-to-end: the 10-step framework build, per-consumer adoption (astrix pending a product call), and the pipeline's exit criteria verified.

## Success Criteria

- Both engine self-tests pass including the new preset case; validator clean at canonical root under `error`.
- All five command surfaces authored (start ×2, end ×2, reflect) honoring the pipeline's resolved design decisions verbatim.
- Fixture gate on soul-steel-demo passes; cursor round-trip and `--all` cap proven on a synthetic ledger.
- RDS + asset-studio adoptions validate clean; astrix question surfaced to Nicholas, not guessed.

## Source References

- [_project/pipeline/port-session-lifecycle-self-improvement-bridge.md](../pipeline/port-session-lifecycle-self-improvement-bridge.md) — the work brief
- RDS `.claude/commands/start.md` + `end.md` — the shipped reference implementation (ADR 0010 there)
- [docs/spec/schema.md](../../docs/spec/schema.md) §3 · §4 · §8

## Decisions

- Open question 2: nudge cadence N = **3**, not 5 — every real ledger is small today; at 5 the first loop wouldn't fire for weeks, and a premature nudge costs one line. Prose constant in both /start variants.
- Open question 3: the bridge matches the **literal** `## First-Principles Candidates` heading — fixed framework convention, no config key (one reader; /reflect is consumer-editable anyway). Recorded in spec §3.
- Open question 1 (astrix session-kind vs inert commands) deliberately NOT decided — surfaced to Nicholas as a product call.

## First-Principles Candidates

- <one-sentence insight> → <candidate home: decision · brain capture · memory · none yet>
- Constants coupled to a cadence (the reflect low-signal band ↔ the nudge N) must be co-edited whenever N changes, or the two surfaces contradict at the boundary → recorded in the pipeline's resolution note
- Hook-parity compares settings.json only, so command-template evolution propagates by re-copy + extension re-application, never by drift-failure → none yet
- Adversarial reviewers must read pristine sources: consumer adoption had to wait for the review fan-out before overwriting the RDS reference files → none yet

## Outputs

- Engine defaults: `STANDARD_PRESET` tags + session scaffold (`tools/init-config.mjs`, +1 self-test case), `BUILTIN_HINTS` First-Principles hint (`tools/new-entity.mjs`), same data edits in the dogfood config.
- Five command surfaces: `.claude/commands/start.md`, `templates/consumer/.claude/commands/start.md` + `reflect.md`, native close-the-open-session in both `end.md` variants.
- Spec: schema.md §3 asymmetry example · §4a dangling semantics · §4b lifecycle tags + parser rules · §7a/§7b delimiter grammar · §8#2 paired-flip corollary; CLAUDE.md loop line.
- Adoptions: RDS (reconciliation extension re-applied), Asset-Studio, Astrix (session kind added per product call), soul-steel-demo fixture (+1 completed fixture engram).
- Verification: 7-agent workflow — 4 exit-criteria gates PASS (incl. guard-block exit-2 proof, 22-engram synthetic cursor/cap), 4 review findings all applied.

## Blockers

- none

## Next Action

Commit the port to `main` (canonical + RDS; Asset-Studio/Astrix aren't git-tracked the same way — Nicholas's call per repo).

## Handoff Notes

Asset-Studio still runs `proseStatusEnforcement: warn` — recommended tightening to `error` now that its commands assume atomic flips. RDS `start.md` intentionally lost its dashboard-drift close-out references (generic consumer variant per the brief); its reconciliation lives in `end.md`'s extension block. The bridge's first real `/reflect` will fire once any consumer accrues 3 closed engrams.
