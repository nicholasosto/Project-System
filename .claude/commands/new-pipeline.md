---
description: Scaffold a new pipeline/build-plan with valid ProjectEntity frontmatter
argument-hint: "<title>"
allowed-tools: Bash(node tools/new-entity.mjs:*)
---
Scaffold a new **pipeline** (build plan) titled: **$ARGUMENTS**

If no title was provided above, ask for one before proceeding. Otherwise run:

`node tools/new-entity.mjs pipeline "$ARGUMENTS"`

The scaffolder writes a `<slug>.md` file with valid frontmatter (`status: design` — the first stage of the lifecycle design → qualify → build → ship → archive) and a Context / Build plan / Exit criteria skeleton, then self-validates. Use `--link predecessor:pipeline/<prev>` to chain it to a preceding plan. Report the created path.
