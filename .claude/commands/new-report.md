---
description: Scaffold a new milestone/retro report with valid ProjectEntity frontmatter
argument-hint: "<title>"
allowed-tools: Bash(node tools/new-entity.mjs:*)
---
Scaffold a new **report** titled: **$ARGUMENTS**

If no title was provided above, ask for one before proceeding. Otherwise run:

`node tools/new-entity.mjs report "$ARGUMENTS"`

The scaffolder writes a `YYYY-MM-DD-<slug>.md` file with valid frontmatter (`status: draft`) and the retro skeleton (Outcome / Surprises / Decisions made / Carry-forward / Verification evidence), then self-validates. If this report is tied to a milestone, add `--link milestone:M<N>`. Report the created path.
