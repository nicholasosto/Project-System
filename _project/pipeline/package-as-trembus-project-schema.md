---
title: "Package as trembus project-schema"
status: design
updated: 2026-06-25
---

# Package as trembus project-schema

> **Status:** design (2026-06-25)

## Context

<what is forcing this now>

## Build plan

1. <step>

## Exit criteria

- <the gate that closes this>

## Workflow

A structured swimlane of the packaging plan — extracted into the emitted contract by
`render-hub.mjs` and rendered live by the Command Center's Workflows tab.

```json
{
  "caption": "Where the packaging plan stands today.",
  "lanes": [
    { "id": "framework", "label": "Framework", "kind": "system" },
    { "id": "consumers", "label": "Consumers", "kind": "neutral" },
    { "id": "registry", "label": "npm", "kind": "tool" }
  ],
  "steps": [
    { "id": "mirror", "lane": "framework", "label": "Mirror contract + drift check", "detail": "decision 0002 · check-consumer-drift.mjs", "status": "done", "to": ["adopt"] },
    { "id": "adopt", "lane": "consumers", "label": "3rd consumer adopts", "detail": "the publish threshold", "status": "active", "to": ["publish"] },
    { "id": "publish", "lane": "framework", "label": "Publish package", "detail": "@trembus/project-schema", "status": "pending", "to": ["release"] },
    { "id": "release", "lane": "registry", "label": "Live on npm", "status": "pending", "to": ["install"] },
    { "id": "install", "lane": "consumers", "label": "Consumers install it", "detail": "drop the mirrored copy", "status": "pending", "to": [] }
  ]
}
```

## Runs

Progress checkpoints for this pipeline — extracted by `render-hub.mjs`, windowed to the latest
few, and replayed over the workflow above by the Command Center (pick a run to time-travel the
lanes). Each `stepOutcomes` entry keys to a step `id` in the Workflow block.

```json
[
  {
    "id": "2026-06-24-mirror-shipped",
    "label": "Mirror shipped",
    "status": "partial",
    "startedAt": "2026-06-24",
    "trigger": "decision 0002",
    "note": "Contract mirrored with the CI drift check; nothing downstream has started.",
    "stepOutcomes": [
      { "step": "mirror", "status": "done" }
    ],
    "outputs": [
      { "label": "decision 0002", "kind": "doc" },
      { "label": "check-consumer-drift.mjs", "kind": "log" }
    ]
  },
  {
    "id": "2026-06-25-adoption-gate",
    "label": "At the adoption gate",
    "status": "running",
    "startedAt": "2026-06-25",
    "trigger": "manual",
    "note": "Mirror holding green; waiting on a 3rd independent consumer before publishing.",
    "stepOutcomes": [
      { "step": "mirror", "status": "done" },
      { "step": "adopt", "status": "active" }
    ]
  }
]
```
