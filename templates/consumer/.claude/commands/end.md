---
description: End-of-session sweep — drift check, knowledge-capture opportunities, and a conflict audit across instructions · memory · skills
argument-hint: "[--report]"
allowed-tools: Bash(node .project-system/tools/validate.mjs:*), Bash(node .project-system/tools/render-hub.mjs:*), Bash(node .project-system/tools/new-entity.mjs:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*)
---
Close out this working session with three passes, then present ONE compact report — **Drift · Capture · Conflicts** — ending in a proposed-actions checklist.

Ground rules (the framework's ethos, applied to session hygiene): **engines validate, they never mutate**; you may apply fixes directly only to **your own memory layer** (auto-memory files — they're your notebook); everything else — repo docs, planning entities, vault captures, config — is **proposed**, applied only on approval or where this project's standing conventions already authorize it. If the session did little, say so in one line and keep the sweep to the engines.

## 1 · Drift — does recorded state still match reality?

Run and *interpret* (summarize; don't paste raw output):

- `node .project-system/tools/validate.mjs --root . --config ./project-system.config.json` — planning-tree health: errors/warnings, prose↔frontmatter status agreement.
- `node .project-system/tools/render-hub.mjs --root . --check` — is the emitted JSON contract stale against `_project/` + config? If this project pipes the emitted JSON onward (e.g. an app's bundled snapshot), check that copy is fresh too.
- `git status` (+ `git log` for context) — work finished but uncommitted? (Skip if this space isn't git-tracked; say so.)
- **Memory vs. reality**: for each persistent-memory fact this session actually *relied on or contradicted*, re-verify it against the repo. A memory that names files, versions, counts, or statuses is a claim — check the claim, not the vibe.
- Mirror drift (the vendored `.project-system/` vs. the canonical framework) is asserted from the framework side by its consumer drift check — flag only if you observed the vendored copy being edited in place (it must only ever be re-copied).

## 2 · Capture — what would evaporate when this session ends?

Sweep the conversation for durable knowledge with no home yet:

- **Auto-memory** — non-derivable facts worth keeping (user preferences and corrections, project state not recorded in the repo, external references). Write or update the memory files directly, keep the index line in sync, and say what changed. Delete or amend memories pass 1 proved stale.
- **The planning ledger** — the contract's own capture surface, using whatever kinds this project's `project-system.config.json` declares:
  - a decision made ad hoc in conversation but recorded nowhere → offer `/new decision` (or this project's decision-shaped kind);
  - substantial work completed and verified → offer `/new` for its retro-shaped kind;
  - work left mid-flight that a future session must pick up → offer `/new` for its handoff-shaped kind — unless an open session entity already exists (see **Close the open session** below): then the handoff lives in ITS Handoff Notes, not a new file.
- **Automation candidates** — toil better served as a standing scheduled routine: recurring or inherently periodic · self-contained · propose/report-shaped, never destructive · cadence proportional to its watched signal · never event-shaped enforcement (that is a hook's job — **two hooks, no more**). Record each into the open session entity's First-Principles Candidates queue, ahead of the close below: `- <recurring toil, one sentence> → routine` (placeholder notation — the recorded line carries no `<`, or the bridge reads it as an untouched hint). Propose nothing here: a routine proposal needs the cross-session view only the `/reflect` bridge review has. No open session, or no such section in this project's scaffold → say so and offer a durable sink (a `--report` Carry-forward line); a candidate written nowhere does not survive the conversation.
- **Close the open session** — Grep the handoff-shaped kind's folder (standard: `_project/sessions/`) for its open or parked frontmatter statuses (standard: `planned`, `active`, `blocked`).
  - **None** → skip in one line; the offers above are unchanged.
  - **One this conversation actually advanced** → draft its close: backfill Outputs / Blockers / Next Action / Handoff Notes from the session; set `tags.last-active` (time of the last user message, `YYYY-MM-DDTHH:MM`) and refresh `tags.kos` (union — never truncate what /start wrote); pick the end state — `completed` (Goal met), `blocked` (parked, blocker named), `shelved` (abandoned). **Never leave `planned` or `active`** — that is the dangling signal /start's wake-check hunts. Propose the close in the checklist; on approval apply as **one Edit spanning the frontmatter `status:`/`updated:` lines through the prose `> **Status:** …` line** — where `proseStatusEnforcement` is `error` a half-flip is guard-blocked; at `warn` it is flagged, not blocked — keep the flip atomic regardless.
  - **Multiple open** → propose a real close only for the one this session advanced; list each other with a suggested `shelved` (abandoned) or `blocked` (genuinely parked) and let the user pick. Never bulk-`completed` work this conversation can't vouch for.
- **Knowledge vaults** — concepts, patterns, or hard-won lessons that belong in a wired knowledge-capture skill (brain/vault plugins, when this space has them): list each candidate with the exact capture invocation to run. Never auto-capture into a vault — those skills own their own intake.

## 3 · Conflicts — do the instruction surfaces agree?

Cross-check what governed this session — the project `CLAUDE.md`/`AGENTS.md`, `.claude/` (commands · skills · settings/hooks), persistent memory, and any skill guidance that was loaded — against **each other** and against observed reality. Scope honestly: audit surfaces this session actually touched or loaded; don't boil the ocean of global plugins.

Flag each contradiction as: the two (or more) sources, file paths, which one reality supports, and a one-line proposed resolution. Typical finds: a doc claiming a state the code disproves; a memory predating a rename or migration; two instructions prescribing different tools for the same job; a stated convention vs. the actual wiring.

## The report

Present the three sections compactly, then the checklist: memory fixes **applied**, and each remaining item as an offer (`/new …`, a capture invocation, a doc edit, a commit). With `--report` — or whenever the user wants a durable record — scaffold it into the ledger with `node .project-system/tools/new-entity.mjs` using this project's retro-shaped kind, and fill its sections from the sweep itself.
