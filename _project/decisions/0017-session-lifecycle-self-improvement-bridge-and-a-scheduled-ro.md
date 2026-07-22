---
title: "Session lifecycle, self-improvement bridge, and a scheduled-routines lane"
status: accepted
updated: 2026-07-22
links:
  - { rel: references, target: pipeline/port-session-lifecycle-self-improvement-bridge }
---

# Session lifecycle, self-improvement bridge, and a scheduled-routines lane

> **Status:** accepted (2026-07-22)

## Context

The session lifecycle shipped on 2026-07-21 as a pipeline entity and five command files, with no
decision record behind it — the port pipeline reserved exactly one ADR slot for the merged design
and warned against minting two. Three things then forced the record to be written now.

First, the lifecycle had accumulated a **cross-file constant** (the `/start` nudge fires at three
closed engrams; `/reflect` warns below three) held in prose in three files with nothing naming the
coupling — a maintenance trap the implementing session flagged and no artifact owned.

Second, a deep review of the command surface found the **mirror rots where the check does not look**:
`examples/soul-steel-demo/.claude/` had never been re-vendored after the port, so the fixture the
pipeline named as its `/start`→`/end`→`/reflect` gate could not run any of them. The drift check's
hook-parity axis compares only the `hooks` block of `settings.json`, so three missing command files
and an entire `skills/` tree passed green for a month.

Third, sessions kept surfacing **recurring toil** — the same sweep, the same staleness check, the
same manual reconciliation — with no capture surface. The planning ledger had homes for a decision, a
retro, and a handoff, but none for "this should just run on a schedule." Meanwhile the Command
Center already carried an empty `Scheduled` workflow group whose comment read *no contract signal
yet* — a socket with nothing to plug into it.

## Decision

Record the lifecycle as shipped, and extend it with a propose-only routines lane.

**The lifecycle.** `/start` opens a tagged engram (Wake · Orient · Open), `/end` closes it natively,
and `/reflect` mines the closed ledger. Engram state rides entirely in the freeform `tags` map
(`last-active` marks a file as lifecycle-managed; `kos` records context reach) — **zero schema
change**, and no third hook. `/reflect` ships only as a consumer template; canonical follows it by
hand, because canonical's own sessions largely predate engrams.

**The routines lane, two-stage.** `/end`'s Capture pass records candidates into the open session's
First-Principles export queue under a new `routine` home token; it proposes nothing. `/reflect` gains
a fifth mine pass that merges those marked lines with a cross-session recurrence lens (the same toil
in two or more of the window's engrams) and a fifth `placement`, `routine`, whose proposals carry
**name · trigger cadence · the exact prompt the routine runs · expected output shape · registration
note**. The split is load-bearing: a single session can assert that toil recurred *within* it, but
only the bridge sees across sessions, and recurrence across sessions is what justifies standing work.

**Registration is surface-agnostic and approval-gated.** A proposal names the environment's
scheduling surface generically; nothing auto-registers, and where no such surface exists the proposal
stands as documentation — a complete outcome, not a failure.

**The ledger record.** An accepted routine is recorded as a workflow-shaped entity carrying a newly
registered `cadence` tag, with a minimal honest swimlane (trigger → what it runs → output). The
entity is the *record*, never the runner: a `cadence`-tagged entity can exist with nothing scheduling
it. This is the contract signal a renderer can group a Scheduled lane on — but the Command Center
hookup is **deferred**, and no app code changed.

**The boundary that keeps this honest:** a routine is a scheduled run, never event-shaped
enforcement. That stays a hook, and this contract wires two hooks, no more.

## Consequences

**Easier.** Recurring toil now has a home in the ledger instead of evaporating at session end. The
`Scheduled` group has a contract signal whenever someone decides to wire it. The lifecycle finally has
a decision record, and the nudge/low-signal coupling is named in all three command files that carry it.

**Harder.** The lane's judgment is entirely agentic — no engine parses a candidate, and none can:
"is this worth scheduling" is not a validation. `/reflect`'s propose-only discipline is the only
guard against a lane that quietly registers work.

**Accepted cost.** Template command files changed, so every consumer's `.claude/` copy now trails
canonical until re-copied — and the drift check still cannot see it, because there is deliberately no
command-file axis. The demo re-vendor closes the fixture, not the class of problem; a command-file
drift axis remains the natural follow-on and is explicitly *not* built here.

**Unchanged.** No schema change, no new engine, no third hook, no new runtime dependency.

## Options considered

- **A third hook for scheduled work** — rejected outright. "Two hooks, no more" is a load-bearing
  constraint, and a scheduled run is not an event-shaped enforcement point. A routine that needed a
  hook would be a hook.
- **A `routine` entity kind** — rejected. It would duplicate `workflow` almost exactly; a registered
  tag on the existing kind carries the same signal and passes the change-test (nothing in the engines
  needs to know).
- **A config key for the cadence constants** (`bridgeReview.cadence`, a scheduling-surface name) —
  rejected. Each has exactly one reader, and a config key implies an engine consumes it. Prose
  constants with a named co-edit coupling are honest about what they are.
- **Detection in `/end` alone** — rejected: one session cannot establish recurrence, so proposals
  would be noise.
- **Detection in `/reflect` alone** — rejected: without a per-session mark, detection depends on
  sessions happening to narrate their toil in prose.
- **Auto-registering accepted routines** — rejected. Propose-only is the framework's ethos; an agent
  that schedules its own future runs without approval is exactly the failure mode this ethos exists
  to prevent.
- **A framework-variant `/reflect`** — rejected again (as at the port): canonical's ledger is too
  small to mine, and the by-hand pointer is honest.

## Cites

- [Port pipeline](../pipeline/port-session-lifecycle-self-improvement-bridge.md) — the 2026-07-21 build record this ADR finally decides.
- [Spec](../../docs/spec/schema.md) — §3 (required ⊂ scaffold), §4a (dangling · settled · parked semantics), §4b (`last-active` · `kos` · `cadence`), §7b (delimiter grammar), §8 (paired-flip corollary).
- The five command files: `.claude/commands/{start,end}.md` · `templates/consumer/.claude/commands/{start,end,reflect}.md`.
- `apps/command-center/src/workflows.ts` — the `SCHEDULED_IDS` group this tag will eventually feed.
- [ADR 0002](0002-mirror-the-contract-with-a-ci-check-before-publishing.md) — the mirror discipline whose blind spot let the demo fixture rot.

## Re-open if

The runs/facet governance ADRs land and change how derived views are declared; the Command Center's
Scheduled group is actually wired to `cadence`; a scheduling surface becomes first-class enough to
name normatively; the nudge constant N moves; or a command-file drift axis is added to
`check-consumer-drift.mjs`, which would make the vendor-verbatim convention enforceable rather than
advisory.
