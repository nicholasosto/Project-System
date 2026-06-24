---
description: Scaffold a new roadmap plan with valid ProjectEntity frontmatter
argument-hint: "<title>"
allowed-tools: Bash(node tools/new-entity.mjs:*)
---
Scaffold a new **roadmap** entry titled: **$ARGUMENTS**

If no title was provided above, ask for one before proceeding. Otherwise run:

`node tools/new-entity.mjs roadmap "$ARGUMENTS"`

The scaffolder writes a `<slug>.md` file with valid frontmatter (`status: proposed`) and a Context / Plan / Open questions skeleton, then self-validates. Report the created path.
