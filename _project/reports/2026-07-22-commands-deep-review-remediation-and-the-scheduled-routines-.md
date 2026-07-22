---
title: "Commands deep-review — remediation and the scheduled-routines bridge"
status: complete
updated: 2026-07-22
links:
  - { rel: references, target: decisions/0017-session-lifecycle-self-improvement-bridge-and-a-scheduled-ro }
  - { rel: references, target: features/session-lifecycle-and-bridge }
  - { rel: references, target: pipeline/port-session-lifecycle-self-improvement-bridge }
  - { rel: references, target: sessions/2026-07-22-commands-deep-review-remediation-and-scheduled-routines-brid }
---

# Commands deep-review — remediation and the scheduled-routines bridge

> **Status:** complete (2026-07-22)

## Outcome

A deep review of the command surface, its eight findings remediated, and the lifecycle extended with
a propose-only scheduled-routines lane.

**What shipped**

- **The routines lane** — `Automation candidates` in both `end.md` variants; mine pass 5 and the
  `routine` placement in `templates/consumer/.claude/commands/reflect.md`; the `routine` home token in
  `tools/new-entity.mjs` `BUILTIN_HINTS` and both `start.md` engram sections; a `cadence` tag
  registered in `STANDARD_PRESET` and both live configs; spec §4b.
- **A1 — the demo fixture re-vendored.** `examples/soul-steel-demo/.claude/` is now byte-identical to
  `templates/consumer/.claude/` (it had been missing `start.md`, `reflect.md`, all of `skills/`, and
  carried a pre-port `end.md`).
- **A2 — stale Soul-Steel claims retired** in `CLAUDE.md`, `docs/spec/schema.md` §7a,
  `examples/soul-steel-demo/README.md`, `README.md`, and — as a dated superseding note rather than a
  rewrite — `_project/pipeline/migrate-soul-steel-official.md`.
- **A3 — spec §7a rewritten** for the skills era (generator + the two skills, not "copy a config") and
  renumbered to align 1–5 with `CLAUDE.md`.
- **A4 — the command set enumerated** in all four under-counting places, plus a fifth found in review
  (`README.md`'s consumer count, which still said two consumers and an unfired publish trigger).
- **A5 — spec §4a** gains the missing `workflow` and `feature` rows (the table showed five of seven kinds).
- **A6 — the nudge constant reconciled** to N=3 in the port pipeline's design record.
- **A7 — the boundary coupling named** in all three command files that carry it.
- **A8 — `session.render.sub` deliberately left alone** (see D3).
- **The governance record** — [ADR 0017](../decisions/0017-session-lifecycle-self-improvement-bridge-and-a-scheduled-ro.md)
  and the [feature entity](../features/session-lifecycle-and-bridge.md).

**What didn't**

- The Command Center's `SCHEDULED_IDS` hookup — the `cadence` signal now exists, the wiring does not
  (`[CF-3]`). No app code changed.
- A command-file axis in `check-consumer-drift.mjs` (`[CF-2]`) — the mirror discipline that would have
  caught A1 mechanically.
- The runs/facet governance ADRs and the fired-but-unacted 0002 publish trigger (`[CF-4]`).

## Surprises

- **The mirror rots exactly where the check does not look.** The demo fixture's command surface was
  stale for a month while `check-consumer-drift.mjs` reported PASS on every axis — because hook-parity
  compares only the `hooks` block of `settings.json`, never `commands/`, `skills/`, or `permissions`.
  The port pipeline had even *named* this fixture as its `/start`→`/end`→`/reflect` gate. A gate
  asserted in prose and unasserted in code is not a gate. Generalizes: every "vendored verbatim"
  convention decays to advisory unless something compares bytes.
- **Parallel authoring converges on plausible contradictions.** Seven agents editing disjoint files
  produced text that was locally correct and globally inconsistent — canonical `start.md` pointing at a
  `/reflect` this repo deliberately does not ship; `/end` emitting "proposals" one sentence before
  asserting only the bridge does; spec §4b's own `cadence` example unwritable through the command
  `/reflect` prescribes, because `new-entity.mjs` emits tag values unquoted and the example carried a
  comma. None was visible from inside the file that contained it. Only adversarial readers comparing
  surfaces *against each other* found them.
- **Prose that tells a reader to transcribe a placeholder is a latent bug** when a downstream parser
  discriminates on that placeholder's syntax. `/end` instructed recording
  `- <recurring toil…> → routine`; `/reflect` mines only lines containing no `<`. A literal
  transcription would have been silently unmineable forever.
- **Doc surfaces drift on the timescale of the work they describe** — because no engine watches them.
  Every finding in A2–A5 was a doc, and `validate.mjs` was green throughout.

## Decisions made

- **D1**: Routine detection is two-stage — `/end` records, `/reflect` proposes. A single session can
  assert intra-session recurrence; only the bridge sees across sessions, and cross-session recurrence
  is what justifies standing work. (Formal: ADR 0017.)
- **D2**: An accepted routine is a `cadence`-tagged **workflow** entity, not a new kind — the tag
  carries the same signal and passes the change-test. The entity is the *record*, never the runner.
  (Formal: ADR 0017.)
- **D3**: `session.render.sub` ("reference shape · 8 sections") left as-is — `requiredSections` is
  exactly 8, and the 8-required / 9-scaffolded asymmetry is the documented contract, not a typo.
- **D4**: Historical records are corrected by **dated superseding notes**, never by rewriting shipped
  acceptance criteria — falsifying a record is worse than the drift it carries. Applied to
  `migrate-soul-steel-official.md` and the port pipeline's forward pointer. *(No formal ADR.)*

## Carry-forward

- `[CF-1]` Re-copy `templates/consumer/.claude/` into the three registered consumers (Asset-Studio,
  Astrix-Systems, Roblox-Development-Studio) — their command surfaces now trail canonical, and nothing
  turns red. Deferred: each is a separate space, and Astrix is not git-tracked.
- `[CF-2]` Add a command-file axis to `check-consumer-drift.mjs` so vendor-verbatim is enforced rather
  than advised. Deferred: the port pipeline explicitly excluded it, and reversing that is its own
  decision. This review is the evidence that it is now warranted.
- `[CF-3]` Wire the Command Center's `Scheduled` group to `cadence`. Deferred behind the runs/facet
  governance ADRs, which own how derived views are declared.
- `[CF-4]` The runs and facet governance ADRs (0018+), and the 0002 publish decision queued behind
  them — the trigger fired at three consumers and `README.md` now says so.
- `[CF-5]` Mirror the *config* schema (carried forward from the 2026-06-29 framework review) — still
  publish-gated.

## Verification evidence

| Gate | Method | Evidence |
|---|---|---|
| Planning tree clean | `node tools/validate.mjs` | 49 files across 7 kinds · 0 errors · 0 warnings · 0 info |
| Suite green | `npm test` | exit 0 · 148 PASS assertions across 10 self-tests + zero-deps + demo drift + contract verify |
| Emitted contract fresh | `node tools/render-hub.mjs --check` | in sync (re-emitted after the config note and `cadence` registration) |
| Consumer mirrors honest | `node tools/check-consumer-drift.mjs` | in sync — structural · behavioral · hooks PASS for all four registered consumers |
| Demo fixture gate | `diff -r examples/soul-steel-demo/.claude templates/consumer/.claude` | empty — byte-identical (the gate the port pipeline claimed but could not satisfy) |
| Routines design coherent | 5 adversarial verifier agents, 3 lenses + 2 regression lenses | 16 defects found and closed; final read confirms record → aggregate → propose → `cadence` record with no remaining contradiction |
| Lane dogfooded | the upgraded `/end` sweep run against this session | see the session's Handoff Notes |
