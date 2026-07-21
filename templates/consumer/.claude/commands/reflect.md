---
description: Bridge review — mine the closed-session ledger for command/instruction/skill/config improvements; propose-only, recorded as a report entity
argument-hint: "[--since <YYYY-MM-DD> | --all]"
allowed-tools: Bash(node .project-system/tools/new-entity.mjs:*), Bash(node .project-system/tools/validate.mjs:*), Bash(git log:*), Bash(git status:*), Bash(date:*)
---
Run a periodic self-improvement review over the session ledger: mine settled engrams for
patterns, propose improvements to this project's working surfaces, and record the review as a
report entity that doubles as the cursor for the next run. **Propose-only** — nothing outside
your own memory layer is applied without approval, and this repo's vendored `.project-system/`
plus the canonical framework are never edited from here at all.

## 0 · Preconditions (degrade gracefully, in this order)

- Config declares **no session-shaped kind** (standard: `session`) → report "bridge inactive —
  no session kind to mine", recommend adding one (`setup-project-system` skill or
  `node .project-system/tools/init-config.mjs`), and stop.
- Config declares **no retro-shaped kind** (standard: `report`) → the review would have nowhere
  to record its cursor: recommend adding one and **do not run**.
- The session folder has **0 engram files** (see the roster below — this includes the case where
  every session file is tag-less legacy) → report "insufficient ledger" in one line and stop.
- **1–2 closed engrams** in the window → warn that the signal is low, then proceed (below 3 the
  /start nudge stays silent for the same reason; a manual run is an explicit ask).

## 1 · Roster — what counts as the ledger

An **engram** is a session-folder file whose frontmatter matches `^tags:.*last-active` — this
auto-excludes legacy retro files and sessions created via a plain `/new session`, which is
intentional: only lifecycle-managed sessions carry mineable structure. Mine **settled** engrams
only: `^status: (completed|shelved)`. A `blocked` engram is parked-but-alive — Wake surfaces it
as a live thread; it is NOT mined.

## 2 · Window — which engrams this review covers

- **Default (cursor-bounded):** find the newest bridge review — the lexically last file in the
  retro-shaped kind's folder (standard: `_project/reports/`) whose frontmatter matches
  `^title: "Bridge review`; read the `cursor:` line that opens its `## Window covered` section
  (the cursor is machine-authoritative; the title is never parsed). No prior review → the epoch.
  Mine closed engrams whose `last-active` is **strictly greater** than the cursor.
- **`--since <YYYY-MM-DD>`** overrides the cursor with that date.
- **`--all`** ignores the cursor, but caps at the **20 most-recent** closed engrams — if the
  ledger holds more, say how many were skipped and that `--since` can reach them.

## 3 · Mine — four passes over the window

1. **First-Principles drain** — from each engram, take the `## First-Principles Candidates`
   section **bounded to the next `## ` heading**; keep list lines of the shape `- … → …` that
   contain no `<` (the scaffold hint's `<…>` placeholders are the discriminator — an untouched
   hint is not a candidate). Lines whose stated home is `none yet` are the unplaced-insight
   queue this review must find homes for; lines with a named home get a quick follow-through
   check (was it actually captured there?).
2. **`kos` reach-frequency** — tally `kos` slugs **within the review window only**. A slug
   reached for by a majority of the window's engrams is a standing-context candidate (its
   system's guidance may belong in CLAUDE.md or higher in the /start roster).
3. **Decisions & friction themes** — read the window's Decisions sections for recurring themes
   worth an ADR, and Handoff Notes / Blockers for repeated pain (the same manual step, the same
   missing tool permission, the same confusion). Agent judgment — no engine parses these.
4. **Ground truth** — before proposing any change to a command, skill, or instruction file,
   **read the actual `.claude/` surface** (and CLAUDE.md) as it exists now. Never propose
   against remembered text.

## 4 · Output — the propose-only checklist

Present one checklist; every item carries exactly one `placement`:

- `upstream` — belongs in the canonical framework or its templates: emit a hand-off note for
  the Project-System repo. A consumer **never** edits canonical or its own vendored copy.
- `consumer-extension` — a consumer-local addition to a templated command: propose the exact
  delimited block (`<!-- consumer-extension: <slug> · <note> -->` …
  `<!-- /consumer-extension: <slug> -->` — the grammar re-vendoring preserves); apply only on
  approval.
- `config` — an edit to this project's own `project-system.config.json` (a tag, a section, an
  enum); apply only on approval.
- `memory` — your own memory layer: apply directly, report what changed.

## 5 · Record — the review report IS the cursor

Two separate commands (never inline `$(date …)`):

    date +%Y-%m-%dT%H:%M
    node .project-system/tools/new-entity.mjs report "Bridge review — <startISO>..<endISO>" --slug bridge-review-<HHMM>

(`<startISO>..<endISO>` = the window actually mined; `<HHMM>` from the timestamp above keeps a
same-day second review from colliding with the first.) Then, with Edit, add at the top of the
body:

- `## Window covered` — **first line** `cursor: <the max last-active among mined engrams, or
  the run timestamp if none>`, then one line naming the window and engram count.
- `## Findings` — the mining evidence, compressed.
- `## Proposals` — every checklist item **with its disposition** (`accepted` / `deferred` /
  `rejected`) once the user has ruled — rejected ideas are recorded so later reviews don't
  re-propose them.
- frontmatter `links` — `{ rel: references, target: sessions/<stem> }` for each mined engram.

Fill the scaffold's own sections (Outcome et al.) from the sweep, set the report `complete`
(paired frontmatter + prose flip), and finish by restating what was applied (memory only) versus
what awaits approval.
