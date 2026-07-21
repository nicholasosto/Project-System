---
description: Session wake-up — dangling-session triage, one-shot orientation brief, and an engram-style session open
argument-hint: "[<goal>]"
allowed-tools: Bash(node .project-system/tools/new-entity.mjs:*), Bash(node .project-system/tools/validate.mjs:*), Bash(git status:*), Bash(git log:*), Bash(date:*)
---
Open this working session with three passes — **Wake · Orient · Open** — then keep the session
entity current for the rest of the conversation (see "Maintaining the engram", below — it applies
until /end closes the session, not just while this command runs).

Ground rules: engines validate, they never mutate; the session entity is created ONLY via
`new-entity.mjs`; every `_project/` write passes the PreToolUse guard. `$ARGUMENTS`, if present,
is the session goal. Sessions live in this project's handoff-shaped kind (standard: `session`,
folder `_project/sessions/`) — substitute your config's names throughout if they differ. If the
config declares no session-shaped kind, run Wake + Orient only and skip pass 3 (see its degrade
note).

## 1 · Wake — did the previous session end?

Grep the session folder's `*.md` for `^status: (planned|active|blocked)` (Grep tool; files are
tool-scaffolded, so frontmatter is machine-regular; substitute the config's non-terminal status
names if they differ). For each hit, read the file and report one line: goal · status ·
`updated` / `tags.last-active` · its Next Action — more than three hits → detail the first
three, compress the rest into one summary line. Then triage:

- **`blocked`, with real Blockers content** — parked multi-day work, not dangling. Default
  LEAVE (mention in the brief's open threads); offer RESUME only if the stated goal matches it.
- **`active` or `planned`** — the previous session was not ended. Offer, per file:
  - **RESUME** — adopt as this conversation's session: flip to `active` if needed (one-edit
    rule, below), refresh `last-active`, skip pass 3's scaffold.
  - **CLOSE-OUT** — a quick tidy, from evidence: `git log` since the file's date, `git status`
    (skip if this space isn't git-tracked; say so), and the file's own Decisions section.
    Propose Outputs / Next Action / Handoff Notes marked `_(reconstructed at close-out,
    <date>)_`, then flip to `completed` (work verifiably landed) or `shelved` (abandoned).
    Apply only on approval. Full retro rigor belongs to /end — this is the minimal subset;
    never batch-close without per-file approval.

At most one session may be `active` for this conversation. An `active` session updated today is
almost certainly this same working day — default RESUME, not close-out.

**Bridge-review nudge** (silent unless due): count closed engrams — session-folder `*.md`
matching BOTH `^status: (completed|shelved)` AND `^tags:.*last-active`. Find the newest bridge
review: the lexically last file in the retro-shaped kind's folder (standard:
`_project/reports/`) whose frontmatter matches `^title: "Bridge review`; read the `cursor:`
line that opens its `## Window covered` section (no such report → treat the cursor as the
epoch). If the count of closed engrams whose `last-active` is strictly greater than the cursor
is ≥ 3, add ONE line to the wake report: "Bridge: <n> closed sessions since the last review —
consider /reflect" (it ships alongside this command). Below 3 → say nothing.

## 2 · Orient — one-shot brief (compact; no re-running what hooks already ran)

Compose from, in order — the SessionStart hook already printed `validate.mjs --summary`;
interpret that output from context and re-run only if absent:

1. **Health** — the hook line: file count, errors / warnings / info.
2. **Continuity** — the most recent `completed` session (latest date-slug filename): its
   Next Action and Handoff Notes, compressed. If pass 1 resumed a session, that one leads.
3. **Open threads** — statuses greped directly from this project's plan-shaped folders
   (standard: `_project/pipeline/*.md`, `_project/roadmap/*.md`) — any emitted dashboard JSON
   may be stale; `_project/` is the source of truth and is a handful of files.
4. **Repo state** — `git status --porcelain` count, `git log -1 --oneline` (skip if this space
   isn't git-tracked; say so).
5. **Context systems** — from the roster below, name only what plausibly serves the goal.

Output a "Wake report" of ~10–15 lines. Density over ceremony.

<!-- consumer-specific: context-systems roster (KOS). TODO(consumer): replace the exemplar rows
     with this project's real context systems — the slugs here become the canonical `kos` tag
     vocabulary for its sessions. Keep the three columns; one row per system. -->
| slug | system | reach for it when |
|---|---|---|
| memory | auto-memory MEMORY.md + topic files | non-derivable session-to-session facts |
| decisions | the decision-shaped kind's folder (standard: `_project/decisions/`) | why things are the way they are |
| dashboards | the emitted `previews/dashboards/*.json` contract (when this project renders one) | current factual state at a glance |
<!-- /consumer-specific -->

## 3 · Open — the engram session

*Degrade note: if this project's config declares no session-shaped kind, skip this pass — end on
the wake report and note that engram tracking needs one (add it via the `setup-project-system`
skill or `node .project-system/tools/init-config.mjs`).*

**Goal given** (`$ARGUMENTS` non-empty), and nothing was resumed in pass 1 — two separate
commands (never inline `$(date …)` into the scaffold call: command substitution defeats the
permission prefix rule and forces a manual prompt):

    date +%Y-%m-%dT%H:%M
    node .project-system/tools/new-entity.mjs session "<goal as title>" --status active --tag last-active=<literal timestamp from above>

(If the scaffolder refuses — same-day slug collision — re-run with a more specific `--slug`;
never hand-write the file.) Then, with Edit: fill **Goal**; draft 2–4 observable **Success
Criteria** (confirm with the user next exchange if you had to guess); seed **Source References**;
add `kos` for systems the goal already names (quoted, comma-separated). Leave the remaining
sections' scaffold hints untouched — /end fills them.

**Resumed instead**: no scaffold. Flip to `active` if needed and refresh `last-active`
(one-edit rule).

**No goal**: end on the wake report plus the offer — "state a goal and I'll open the session."
Standing instruction for the rest of this conversation: the moment a goal crystallizes, open the
session then, without being re-asked.

## Maintaining the engram (applies all session)

The session file is an engram: rich tracking, minimal space. Touches are event-driven — attach
them to things you already narrate:

- **A decision lands** → append one line to Decisions (offer `/new decision` if formal).
- **A durable insight surfaces** → append to First-Principles Candidates:
  `- <one sentence> → <candidate home: decision · brain capture · memory · none yet>`.
  /end's Capture pass consumes this list — it is the session's export queue.
- **First reach for a context system** → append its slug to `kos`.
- **Any natural checkpoint** (task done, before a long build, on Blockers changes) → refresh
  `last-active`; bump `updated` only if the date rolled.

Write mechanics (where `proseStatusEnforcement` is `error` a violation is guard-blocked; at
`warn` it is flagged, not blocked — keep the discipline regardless; warnings never block):

- `tags` stays a **single-line flow map** — the frontmatter parser does not support nested block
  maps. Quote any value containing a comma (`kos`); bare timestamps are fine.
- **Status flips are one Edit** spanning both the frontmatter `status:` line and the
  `> **Status:** <status> (<date>)` prose line — keep the flip atomic even where the guard would
  only flag a half-flip, including as the first of two "sequential" edits.
- Batch engram updates into as few Edits as practical.
- If you have not touched the engram in a long stretch, do not reconstruct mid-session history —
  /end backfills `last-active`, sweeps `kos`, and harvests candidates at close. Mid-session
  touches are enrichment; /end is reconciliation.
