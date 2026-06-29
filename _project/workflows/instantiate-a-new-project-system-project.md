---
title: "Instantiate a new Project-System project"
status: draft
updated: 2026-06-29
links:
  - { rel: references, target: decisions/0009-born-valid-config-generator }
  - { rel: references, target: features/init-config-and-setup }
  - { rel: references, target: workflows/authoring-loop }
---

# Instantiate a new Project-System project

> **Status:** draft (2026-06-29)

## Purpose

The consumer-onboarding loop — how a fresh repo becomes a Project-System consumer: vendor
the framework verbatim, generate a **born-valid** config, wire the Claude Code control
surface, register for the drift check, then verify the mirror. The end state hands off to
the [authoring loop](authoring-loop.md) — the day-to-day operating loop for writing entities.

This realizes the framework's promise — *"the consumer supplies a config, the framework
supplies everything else"* — end-to-end: the only project-specific artifact you author is
`project-system.config.json`, and [0009](../decisions/0009-born-valid-config-generator.md)
makes even that born valid by proving it loads through `lib/contract.mjs` before writing.
The canonical step list lives in `CLAUDE.md` → *Using it in another project*; this is its
swimlane form.

## Workflow

```json
{
  "caption": "From an empty repo to a verified, ready-to-author Project-System consumer.",
  "lanes": [
    { "id": "you", "label": "You", "kind": "human" },
    { "id": "engines", "label": "Engines", "kind": "system" }
  ],
  "steps": [
    { "id": "vendor", "lane": "you", "label": "Vendor .project-system/", "detail": "copy schema · lib · tools verbatim — never edit/rename", "note": "Copy schema/ · lib/ · tools/ into a reserved .project-system/ at the project root. Never edit or rename anything inside it — updating the framework = re-copy the folder.", "to": ["interview"] },
    { "id": "interview", "lane": "you", "label": "Run setup-project-system", "detail": "naming-convention interview", "note": "The setup-project-system skill runs the naming-convention interview and assembles a config spec, then drives init-config.mjs.", "to": ["generate"] },
    { "id": "generate", "lane": "engines", "label": "Generate born-valid config", "detail": "init-config.mjs · proven to load via contract before write", "note": "init-config.mjs fills conventional defaults and proves the config loads through lib/contract.mjs before writing it — born valid, like a scaffolded entity.", "to": ["wire"] },
    { "id": "wire", "lane": "you", "label": "Copy templates/consumer/.claude", "detail": "guard + health hooks · /new · setup skill", "note": "Copy templates/consumer/.claude verbatim: the blocking PreToolUse guard, the advisory SessionStart health summary, the generic /new command, and the setup skill. The wiring is identical for every consumer.", "to": ["register"] },
    { "id": "register", "lane": "you", "label": "Register the consumer", "detail": "check-consumer-drift.mjs · schema · root · config · claudeDir", "note": "Add the project to check-consumer-drift.mjs (schema · root · config, plus claudeDir for hook-parity) so the mirror stays honest until the framework is published.", "to": ["verify"] },
    { "id": "verify", "lane": "engines", "label": "Verify the mirror", "detail": "check-consumer-drift.mjs · validate.mjs --summary", "note": "Run check-consumer-drift.mjs (or npm test from the framework) to confirm the vendored contract, validator, and hooks match the canonical source.", "to": ["ready"] },
    { "id": "ready", "lane": "you", "label": "Author first entity", "detail": "/new <kind> → the authoring loop takes over", "note": "From here the authoring loop takes over — /new <kind> scaffolds your first born-valid artifact.", "to": [] }
  ]
}
```
