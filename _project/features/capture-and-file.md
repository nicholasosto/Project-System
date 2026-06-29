---
title: "Quick-capture and file-to-inbox surface"
status: planned
updated: 2026-06-29
links:
  - { rel: references, target: pipeline/migrate-soul-steel-command-center }
tags: { scope: tooling, tier: optional }
---

# Quick-capture and file-to-inbox surface

> **Status:** planned (2026-06-29)

## Summary

A first-class **capture → file** surface: a durable quick-capture buffer (one record per pending
idea/concept) plus an idempotent "file" action that writes a born-valid `_project/` (or `inbox/`)
entity from the capture and flips the record to *filed*. Surfaced by the Soul-Steel-Official
assessment ([[migrate-soul-steel-command-center]] item 5), where it exists as an SS-native server
(`command-center-server.mjs` + `_project/command-center/captures.json` + a file-to-inbox flow) with
**no framework equivalent**. The proposal is to generalize that pattern into the framework so any
consumer gets it.

## Why it matters

The framework scaffolds *deliberately* (`/new <kind>`), but there's a gap before deliberation: the
fleeting idea you want to record without choosing a kind, folder, and title yet. SS solved this with a
capture buffer that later **files** into a real entity through the scaffolder — capture is cheap,
filing stays born-valid. That's a genuinely missing primitive, not a domain quirk:

- **Cheap capture, disciplined filing.** Capture is unstructured; filing routes through
  `new-entity.mjs` so nothing enters `_project/` un-validated (the framework's core discipline holds).
- **Idempotent + durable.** Re-filing the same capture is a no-op; collisions get `-2`/`-3`. A
  committed buffer survives across machines (SS's was a server-backed replacement for browser
  `localStorage`).
- **It's the natural front door** to the planning surface and pairs with the Command Center.

## Notes

- **Shape to generalize (from SS):** a `captures` buffer (`{id, type, title, summary, category,
  capturedAt, status: pending|filed, filedAs}`) + a `file` action mapping a capture → `new-entity.mjs`
  invocation (kind/tags/links inferred or prompted). Keep it zero-dep and config-driven (the target
  kind/folder comes from the consumer's config, not hard-coded).
- **Open design questions:** is the buffer a tool (`tools/capture.mjs`) + a `/capture` command, or part
  of the Command Center app? where does the buffer live (a sidecar JSON vs an entity kind)? how does
  "file" choose the kind — interview, or a per-capture `type→kind` map in config?
- **Decision when adopted:** record an ADR (capture buffer location, file-routing contract) — this
  feature is the *proposal*; the how is a later decision. Relates to [[command-center-dashboard]] and
  [[new-scaffolder]].
- **Do not** fork SS's server in; design the framework primitive from first principles, then SS adopts
  it and retires its bespoke server.
