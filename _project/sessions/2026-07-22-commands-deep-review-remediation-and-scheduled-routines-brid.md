---
title: "Commands deep-review remediation and scheduled-routines bridge"
status: completed
updated: 2026-07-22
tags: { last-active: 2026-07-22T13:55, kos: "spec, decisions, consumers, dashboards, memory" }
---

# Commands deep-review remediation and scheduled-routines bridge

> **Status:** completed (2026-07-22)

## Goal

Close out a deep review of the command surface — remediate the drift it found — and extend the
session lifecycle with a propose-only lane that spots recurring toil worth becoming a standing
scheduled routine.

## Success Criteria

- `node tools/validate.mjs` reports 0 errors and 0 warnings.
- `npm test` green, including an extended `init-config.mjs` self-test asserting the new `cadence` tag.
- `node tools/check-consumer-drift.mjs` green across all registered consumers.
- `diff -r examples/soul-steel-demo/.claude templates/consumer/.claude` is empty (the fixture gate the
  port pipeline claimed but could not actually satisfy).
- ADR 0017, a `session-lifecycle-and-bridge` feature entity, and the deep-review report all exist and
  are linked.
- The upgraded `/end` sweep runs its own new Automation-candidates lane over this session.

## Source References

- [Port pipeline](../pipeline/port-session-lifecycle-self-improvement-bridge.md) — the 2026-07-21 lifecycle + bridge build record.
- [Spec](../../docs/spec/schema.md) — §3 · §4a · §4b · §7a · §7b · §8.
- The five command files: `.claude/commands/{start,end}.md`, `templates/consumer/.claude/commands/{start,end,reflect}.md`.
- `apps/command-center/src/workflows.ts` — the empty `SCHEDULED_IDS` group awaiting a contract signal.

## Decisions

- Routine detection is **two-stage**: `/end` records candidates per-session into the First-Principles
  export queue under a new `routine` home token; `/reflect` aggregates the window and emits the actual
  proposals. A single session cannot establish recurrence — that is the whole reason for stage two.
- An **accepted** routine is recorded as a workflow entity carrying a registered `cadence` tag. That is
  the contract signal the Command Center's empty `SCHEDULED_IDS` group has been waiting for; the hookup
  itself stays deferred to the queued runs/facet governance ADRs.
- **One merged ADR 0017** covering lifecycle + bridge + routines lane, as the port pipeline reserved
  ("do not mint two 0017s"). Runs/facets governance moves to 0018+.
- The demo fixture's `.claude/` gets a **full verbatim re-vendor including `skills/`** — it mirrors the
  complete consumer surface an adopter is told to copy, and it is never executed in place.
- `session.render.sub` ("8 sections") **left as-is**: `requiredSections` is exactly 8, and the 8-required
  / 9-scaffolded asymmetry is the documented contract, not a typo.

## First-Principles Candidates

- Parallel authoring converges on plausible-but-contradictory text; only an adversarial reader comparing
  the surfaces against each other catches it → decision (recorded in ADR 0017's Consequences)
- A mirror that is only spot-checked drifts precisely where the check does not look — the demo's command
  surface rotted silently because hook-parity compares only the `hooks` block → decision (a command-file
  drift axis is the natural follow-on; carried forward, not built this pass)
- Prose that instructs a reader to transcribe a placeholder is a latent bug when a downstream parser
  discriminates on that placeholder's syntax → none yet
- A doc surface with no engine watching it drifts on exactly the timescale of the work it describes → routine
- Assert the vendored mirror byte-for-byte across every consumer and the demo fixture, not just its hooks block → routine
- Re-verify the claims docs make about the consumer registry — counts, de-migrations, command enumerations — against the registry itself → routine

## Outputs

- **ADR 0017** — [session lifecycle, self-improvement bridge, and a scheduled-routines lane](../decisions/0017-session-lifecycle-self-improvement-bridge-and-a-scheduled-ro.md) (accepted).
- **Feature entity** — [session-lifecycle-and-bridge](../features/session-lifecycle-and-bridge.md) (available · optional · framework).
- **Report** — [commands deep-review](../reports/2026-07-22-commands-deep-review-remediation-and-the-scheduled-routines-.md), findings A1–A8 with evidence.
- **The routines lane**, shipped across five command files, two engines, three configs, and spec §4b.
- **`examples/soul-steel-demo/.claude/`** re-vendored — byte-identical to the consumer template for the first time since the 2026-07-21 port.
- Commit `d04eff1`; `README.md`, `CLAUDE.md`, spec §4a/§4b/§7a, and two shipped pipeline records reconciled to reality.

## Blockers

- none

## Next Action

Re-copy `templates/consumer/.claude/` into the three registered consumer spaces (Asset-Studio ·
Astrix-Systems · Roblox-Development-Studio) — their command surfaces now trail canonical, and the
drift check cannot see it.

## Handoff Notes

The lane was **dogfooded at close**: this session's own `/end` sweep ran the Automation-candidates
bullet it had just shipped and produced the three `→ routine` lines above. They are candidates, not
proposals — the next `/reflect` (run by hand here; canonical ships no `/reflect`) is what turns them
into routine proposals, and it needs a wider window than one session to justify any of them.

Two things a successor should know. **The drift check has a blind spot**: hook-parity compares only
the `hooks` block of `settings.json`, so command files, `skills/`, and `permissions` can rot green.
That is what happened to the demo fixture, and it is why `[CF-2]` (a command-file axis) exists.
**Governance renumbers**: 0017 is now taken by this merged decision, so the queued runs and facet
ADRs are 0018+.

One unexplained observation, recorded rather than papered over: `previews/dashboards/*.json` were
regenerated at 13:52 by something outside the engines this session ran. `render-hub.mjs --check` is
verifiably read-only (it exits before `write()`), and `.claude/settings.json` still wires exactly two
hooks. The emitted content is correct and in sync; the *writer* is unidentified. If it recurs, find
it before trusting an "in sync" result.
