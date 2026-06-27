---
description: Scaffold a new _project/ entity of any kind your project-system.config.json declares
argument-hint: "<kind> <title>"
allowed-tools: Bash(node .project-system/tools/new-entity.mjs:*)
---
Scaffold a new ProjectEntity from: **$ARGUMENTS**

Read `$ARGUMENTS` as `<kind> <title…>` — the **first whitespace-delimited token is the kind**, everything after it is the title. Valid kinds are whatever your `project-system.config.json` declares; the scaffolder validates `<kind>` against the config and lists the current set on a mismatch, so this command never hard-codes the kinds.

- If no kind/title was given, ask which kind and a title before proceeding.
- Otherwise run, quoting the title so multi-word titles survive the shell:

  `node .project-system/tools/new-entity.mjs <kind> "<title>"`

The scaffolder derives the filename per the kind's scheme (serial · date-slug · slug), writes valid frontmatter (`status` = the kind's `initialStatus`), lays down that kind's section skeleton, and self-validates — so the file is conformant by construction (frontmatter + prose↔status agreement included). Report the created path, then offer to help fill the sections.

Useful flags (pass through verbatim): `--status <s>` · `--link <rel:target>` (repeatable) · `--scope <s>` · `--slug <slug>` · `--date <YYYY-MM-DD>` · `--dry-run`. Add `--root <dir>` / `--config <path>` to scaffold into a different project.
