---
description: Scaffold a new ADR (decision) with valid ProjectEntity frontmatter
argument-hint: "<title>"
allowed-tools: Bash(node tools/new-entity.mjs:*)
---
Scaffold a new **decision** (ADR) titled: **$ARGUMENTS**

If no title was provided above, ask for one before proceeding. Otherwise run:

`node tools/new-entity.mjs decision "$ARGUMENTS"`

The scaffolder auto-assigns the next `NNNN`, writes valid frontmatter (`status: proposed`), and self-validates. Report the created path, then offer to help fill the **Context / Decision / Consequences / Options considered / Cites / Re-open if** sections. Use `--link superseded-by:decisions/NNNN-…` if this ADR supersedes another. (Add `--root <dir>`/`--config <path>` to scaffold into a different project.)
