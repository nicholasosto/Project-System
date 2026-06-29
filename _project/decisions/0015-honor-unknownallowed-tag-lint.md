---
title: "Honor unknownAllowed so a lintAgainst tag can allow unfamiliar values silently"
status: accepted
updated: 2026-06-29
links:
  - { rel: references, target: pipeline/migrate-soul-steel-official }
---

# Honor unknownAllowed so a lintAgainst tag can allow unfamiliar values silently

> **Status:** accepted (2026-06-29)

## Context

The Soul-Steel-Official migration ([[migrate-soul-steel-official]], Phase 4) surfaced a real bug: the
config field `unknownAllowed` was **dead**. `schema/project-config.schema.json` declared it on a
`tagSpec` (with `default: true`) and the `lintAgainst` description promised "an unfamiliar value =>
warning, still allowed" — but `tools/validate.mjs` never read `unknownAllowed`. A `type:"string"` tag
with `lintAgainst` **always** warned on out-of-list values, regardless of the field. SS's golden config
declares `scope: { lintAgainst: [steel-city, ip-wide, tooling], unknownAllowed: true }` precisely to
mean "other scopes are fine, don't warn" — yet three sessions using `soul-steel`/`assets`/`tgl-library`
would have emitted warnings, blocking the migration's `0/0/0` target on a field that was supposed to
prevent exactly that.

## Decision

Honor `unknownAllowed` in the single validator: a `lintAgainst` miss warns **only when the tag is not
marked `unknownAllowed`**. The change is one clause —
`reg.lintAgainst && !reg.lintAgainst.includes(val) && !reg.unknownAllowed` — so:

- `unknownAllowed: true` → out-of-list value **allowed silently** (no diagnostic).
- `unknownAllowed: false` or absent → **warning** (unchanged behavior).

The meta-schema is corrected to match: `unknownAllowed` default `false` (absent ⇒ warn, the prior
behavior — defaults aren't applied by `buildContext`, so this is doc accuracy, not a runtime change),
and the `lintAgainst`/`unknownAllowed` descriptions now state the gated behavior. Two self-tests pin
both directions (silent with the flag, warning without). Since this changes validation *semantics*, it
gets this ADR.

## Consequences

- **Easier:** a project can declare a familiar-values list for lint *and* opt into an open vocabulary
  (`unknownAllowed: true`) without per-value enumeration — which is what SS needs, and what the field
  always claimed to offer. The fix is in the one check, so the guard, scaffolder, and drift behavioral
  axis inherit it.
- **Harder / blast radius:** only configs that **explicitly** set `unknownAllowed: true` on a
  `lintAgainst` tag change behavior (their out-of-list values go from warning → silent). Configs without
  the flag are unaffected. The framework's own config and the demo don't rely on it.
- **Neutral:** no entity content changes; counts only drop where a now-honored flag suppresses a
  previously-spurious warning.

## Options considered

- **Expand SS's `scope.lintAgainst` to enumerate every scope (SS-local)** — rejected: leaves the field
  dead, diverges SS from the golden, and requires enumerating scopes forever — the very thing
  `unknownAllowed` exists to avoid.
- **Treat `unknownAllowed` as error-vs-allow (warn always; the flag gates error)** — rejected: doesn't
  match the field name or the migration need; the author's intent was "don't warn on unfamiliar."
- **Drop the soft data instead** — rejected for `scope` (unlike the non-marker `milestone` labels,
  scope is real per-session facet data worth keeping).

## Cites

- `tools/validate.mjs` (the gated `lintAgainst` clause + two self-tests) · `schema/project-config.schema.json` (`tagSpec.unknownAllowed`).
- [[migrate-soul-steel-official]] — the migration whose Phase 4 surfaced the dead field.

## Re-open if

A project needs unfamiliar values to be *info* (tracked) rather than fully silent, or needs
`unknownAllowed: false` to make out-of-list values a hard **error** (today they warn) — either would
mean a richer severity knob than a single boolean.
