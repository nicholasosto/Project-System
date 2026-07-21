---
description: End-of-session sweep — drift check, knowledge-capture opportunities, and a conflict audit across instructions · memory · skills
argument-hint: "[--report]"
allowed-tools: Bash(node tools/validate.mjs:*), Bash(node tools/render-hub.mjs:*), Bash(node tools/check-consumer-drift.mjs:*), Bash(node tools/new-entity.mjs:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*)
---
Close out this working session with three passes, then present ONE compact report — **Drift · Capture · Conflicts** — ending in a proposed-actions checklist.

Ground rules (the framework's own ethos, applied to session hygiene): **engines validate, they never mutate**; you may apply fixes directly only to **your own memory layer** (auto-memory files — they're your notebook); everything else — repo docs, planning entities, vault captures, config — is **proposed**, applied only on approval or where this project's standing conventions already authorize it (e.g. committing completed work). If the session did little, say so in one line and keep the sweep to the engines.

## 1 · Drift — does recorded state still match reality?

Run and *interpret* (summarize; don't paste raw output):

- `node tools/validate.mjs` — planning-tree health: errors/warnings, prose↔frontmatter status agreement.
- `node tools/render-hub.mjs --check` — is the emitted JSON contract stale against `_project/` + config?
- `node tools/check-consumer-drift.mjs` — does every registered consumer still mirror the canonical contract (structural · behavioral · hooks)?
- `git status` (+ `git log` for context) — work finished but uncommitted? Snapshot/preview artifacts regenerated but not committed?
- **Memory vs. reality**: for each persistent-memory fact this session actually *relied on or contradicted*, re-verify it against the repo/registry. A memory that names files, versions, counts, or statuses is a claim — check the claim, not the vibe.

## 2 · Capture — what would evaporate when this session ends?

Sweep the conversation for durable knowledge with no home yet:

- **Auto-memory** — non-derivable facts worth keeping (user preferences and corrections, project state not recorded in the repo, external references). Write or update the memory files directly, keep the index line in sync, and say what changed. Delete or amend memories pass 1 proved stale.
- **The planning ledger** — the contract's own capture surface:
  - a decision made ad hoc in conversation but recorded nowhere → offer `/new decision`;
  - substantial work completed and verified → offer `/new report` (the retro shape);
  - work left mid-flight that a future session must pick up → offer `/new session` (the handoff shape).
- **Knowledge vaults** — concepts, patterns, or hard-won lessons that belong in a wired knowledge-capture skill (brain/vault plugins, when this space has them): list each candidate with the exact capture invocation to run. Never auto-capture into a vault — those skills own their own intake.

## 3 · Conflicts — do the instruction surfaces agree?

Cross-check what governed this session — the project `CLAUDE.md`, `.claude/` (commands · skills · settings/hooks), persistent memory, and any skill guidance that was loaded — against **each other** and against observed reality. Scope honestly: audit surfaces this session actually touched or loaded; don't boil the ocean of global plugins.

Flag each contradiction as: the two (or more) sources, file paths, which one reality supports, and a one-line proposed resolution. Typical finds: a doc claiming a state the code/registry disproves; a memory predating a rename or migration; two instructions prescribing different tools for the same job; a convention ("two hooks, no more") vs. the actual wiring.

## The report

Present the three sections compactly, then the checklist: memory fixes **applied**, and each remaining item as an offer (`/new …`, a capture invocation, a doc edit, a commit). With `--report` — or whenever the user wants a durable record — scaffold it into the ledger: `node tools/new-entity.mjs report "<title>"`, then fill Outcome / Surprises / Decisions made / Carry-forward from the sweep itself.
