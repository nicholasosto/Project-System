// Shared status helpers — the one place the app maps an entity's per-kind status word onto the
// Trembus Badge tone ontology, and groups a kind's entities by status in the config's declared
// order. Extracted so App.tsx and the bespoke panels (DecisionSurface) read one source instead of
// re-deriving the shape — the "single check, no re-implementation" ethos applied to the app island.
import { statusOrderForKind } from './contract';
import type { EntityRecord } from './contract';

export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

// Map a per-kind status word onto the shared status-tone ontology. Unknown → neutral.
const STATUS_TONE: Record<string, StatusTone> = {
  accepted: 'success',
  done: 'success',
  shipped: 'success',
  complete: 'success',
  active: 'success',
  proposed: 'info',
  draft: 'info',
  design: 'info',
  qualify: 'warning',
  build: 'warning',
  planned: 'warning',
  blocked: 'danger',
  banned: 'danger',
};
export const statusTone = (s: string): StatusTone => STATUS_TONE[s] ?? 'neutral';

// Group a kind's entities by status, in the config's declared enum order (`statusOrder`); any
// off-enum status (the '—' placeholder, a legacy value) is appended in first-seen order. Each
// group is sorted newest-first. The shared spine of every categorized view.
export function groupByStatus(kind: string, rows: EntityRecord[]): [string, EntityRecord[]][] {
  const byStatus = new Map<string, EntityRecord[]>();
  for (const e of rows) byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e]);
  const declared = statusOrderForKind(kind);
  const ordered = [
    ...declared.filter((s) => byStatus.has(s)),
    ...[...byStatus.keys()].filter((s) => !declared.includes(s)),
  ];
  return ordered.map((s) => [s, byStatus.get(s)!.slice().sort((a, b) => b.updated.localeCompare(a.updated))]);
}
