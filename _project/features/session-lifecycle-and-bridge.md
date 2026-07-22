---
title: "Session lifecycle and self-improvement bridge"
status: available
updated: 2026-07-22
links:
  - { rel: decided-in, target: decisions/0017-session-lifecycle-self-improvement-bridge-and-a-scheduled-ro }
tags: { tier: optional, scope: framework }
---

# Session lifecycle and self-improvement bridge

> **Status:** available (2026-07-22)

## Summary

A three-command loop over the session kind. `/start` opens a tagged **engram** (Wake · Orient ·
Open — dangling-session triage, a one-shot orientation brief, then the session entity itself);
`/end` closes it natively through a three-pass sweep (Drift · Capture · Conflicts); `/reflect`
periodically mines the *closed* ledger for improvements to the project's own working surfaces and
records the review as a report that doubles as the next run's cursor.

Capture has four lanes plus one: memory, the planning ledger, knowledge vaults, the session close —
and **Automation candidates**, which marks recurring toil with a `routine` home in the session's
First-Principles export queue. `/reflect` aggregates those across sessions into approval-gated
routine proposals; an accepted one is recorded as a `cadence`-tagged workflow entity.

All state rides the freeform `tags` map — `last-active` (marks a file as lifecycle-managed), `kos`
(context reach), `cadence` (a standing-routine record). **Zero schema change, no third hook.**

## Why it matters

Three things that used to evaporate now have homes: session continuity across conversations, the
insights a session produced but never filed, and recurring toil that should simply run on a
schedule. The bridge closes the loop — the system reviews its own working surfaces from evidence it
generated, and proposes rather than mutates.

It is also the first **contract signal for scheduled work**: `cadence` gives a renderer something to
group a Scheduled lane on, which nothing in the contract previously offered.

## Notes

- `tier: optional` — a project can adopt the contract and never open a session. The loop degrades
  gracefully: no session-shaped kind → `/start` runs Wake + Orient only and the bridge reports
  *inactive*; no retro-shaped kind → `/reflect` will not run at all (nowhere to record its cursor);
  no workflow-shaped kind → a routine proposal stands on its own rather than scaffolding into a kind
  the config does not declare.
- `/reflect` ships **only** as a consumer template; canonical follows it by hand.
- The nudge constant (fire at 3 closed engrams) and `/reflect`'s low-signal band (warn at 1–2) are
  one boundary constant across three command files — co-edit them.
- Command files are vendored by convention, **not** enforced: `check-consumer-drift.mjs` has no
  command-file axis, so a consumer's copy can trail canonical silently. See
  [ADR 0017](../decisions/0017-session-lifecycle-self-improvement-bridge-and-a-scheduled-ro.md).
- The Command Center hookup for `cadence` is deferred to the runs/facet governance ADRs.
