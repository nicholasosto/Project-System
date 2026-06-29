// The Decision Surface — the bespoke panel for the `decision` kind (routed from App like the
// Roadmap/Workflows panels, so decisions no longer fall through to the generic AreaTable). It makes
// a decision's *shape* legible: how it relates to and impacts the other entity kinds and the system.
//
// Three stacked layers:
//   1. Impact constellation — every decision × the kinds it touches (the "system as a whole").
//   2. The ledger — status-grouped master list, each row impact-aware (excerpt + a relationship strip).
//   3. The detail drawer — a 1-hop ego-graph (@trembus/viz <Lineage>) + the three relationship axes
//      (Provenance · Lineage · Impact) as clickable cross-links + the excerpt. Mirrors the Overview
//      hub's `.cc-detailpanel` master-detail interaction; cross-links re-center within the surface
//      (same kind) or navigate to the target's tab (other kinds), reusing StepDetail's link pattern.
//
// All relationship data comes from the emitted contract (edges[] + nodes[]) via the kind-agnostic
// helpers in contract.ts — the panel adds presentation only, names no rel/kind the contract doesn't.
import { useState } from 'react';
import { Badge, Card, EmptyState } from '@trembus/ui';
import { Lineage } from '@trembus/viz';
import {
  constellation,
  egoGraph,
  entitiesOfKinds,
  prettify,
  recordFor,
  relatedEdges,
} from './contract';
import type { ConstellationRow, RelatedEdge } from './contract';
import { groupByStatus, statusTone } from './status';

// A decision named by the `serial · 4-digit` scheme → its serial ("0013"); anything else → prettified.
const serialOf = (id: string): string => id.match(/^(\d{4})/)?.[1] ?? prettify(id);

// Bucket a decision's incident edges into the three axes the surface reads by:
//   · Provenance — where the call was recorded: an inbound `decided-in` from a report/session.
//   · Lineage    — decision↔decision links (the ADR DAG + supersession), both directions.
//   · Impact     — everything else: inbound from another kind (what depends on it) + outbound see-alsos.
interface Axes {
  provenance: RelatedEdge[];
  lineage: RelatedEdge[];
  impact: RelatedEdge[];
}
function axesFor(id: string, kind: string): Axes {
  const provenance: RelatedEdge[] = [];
  const lineage: RelatedEdge[] = [];
  const impact: RelatedEdge[] = [];
  for (const r of relatedEdges(id)) {
    if (r.dir === 'in' && r.rel === 'decided-in') provenance.push(r);
    else if (r.other.kind === kind) lineage.push(r);
    else impact.push(r);
  }
  return { provenance, lineage, impact };
}

// A direction-aware verb for one related edge, read from the subject's point of view.
function phrase(r: RelatedEdge): string {
  if (r.dir === 'out') {
    if (r.rel === 'supersedes') return 'supersedes';
    if (r.rel === 'decided-in') return 'decided in';
    return 'builds on';
  }
  if (r.rel === 'supersedes') return 'superseded by';
  if (r.rel === 'decided-in') return 'recorded in';
  return 'referenced by';
}

// The ledger row's compact relationship strip — the at-a-glance "shape" (builds-on ↑, governs ↓,
// referenced-by ←, recorded ◆). Empty edge set → a muted dash.
function ImpactStrip({ ax }: { ax: Axes }) {
  const builds = ax.lineage.filter((r) => r.dir === 'out').length;
  const refdBy = ax.lineage.filter((r) => r.dir === 'in').length;
  const governs = ax.impact.filter((r) => r.dir === 'in').length;
  const recorded = ax.provenance.length;
  const chips: { k: string; label: string }[] = [];
  if (builds) chips.push({ k: 'builds', label: `↑ builds on ${builds}` });
  if (governs) chips.push({ k: 'governs', label: `↓ governs ${governs}` });
  if (refdBy) chips.push({ k: 'refby', label: `← ${refdBy}` });
  if (recorded) chips.push({ k: 'rec', label: '◆ recorded' });
  if (!chips.length) return <span className="cc-ledger__noimpact">—</span>;
  return (
    <>
      {chips.map((c) => (
        <span key={c.k} className={`cc-ledger__chip cc-ledger__chip--${c.k}`}>
          {c.label}
        </span>
      ))}
    </>
  );
}

// One relationship axis in the detail drawer: a labeled list of clickable cross-links. A same-kind
// target shows its serial; a cross-kind target shows its kind. Clicking routes via `onGo`.
function Axis({
  title,
  edges,
  kind,
  onGo,
}: {
  title: string;
  edges: RelatedEdge[];
  kind: string;
  onGo: (id: string) => void;
}) {
  if (!edges.length) return null;
  return (
    <div className="cc-axis">
      <p className="cc-axis__head">
        {title}
        <span className="cc-axis__count">{edges.length}</span>
      </p>
      <ul className="cc-axis__list">
        {edges.map((r, i) => (
          <li key={`${r.dir}-${r.rel}-${r.other.id}-${i}`}>
            <button
              type="button"
              className="cc-axis__link"
              onClick={() => onGo(r.other.id)}
              title={`Go to ${r.other.kind} “${r.other.title}”`}
            >
              <span className="cc-axis__rel">{phrase(r)}</span>
              <span className="cc-axis__title">{r.other.title}</span>
              <Badge tone="neutral" variant="soft" size="sm">
                {r.other.kind === kind ? serialOf(r.other.id) : r.other.kind}
              </Badge>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The detail drawer body for the selected decision: eyebrow + title + status, the gist (excerpt), a
// scoped ego-graph, then the three axes, then its source path.
function Detail({
  id,
  kind,
  onGo,
  onClose,
}: {
  id: string;
  kind: string;
  onGo: (id: string) => void;
  onClose: () => void;
}) {
  const d = recordFor(id);
  if (!d) return null;
  const ax = axesFor(id, kind);
  const ego = egoGraph(id);
  const hasNeighbors = ego.nodes.length > 1;
  return (
    <Card className="cc-detailpanel__card cc-decision-detail">
      <button type="button" className="cc-detailpanel__close" onClick={onClose} aria-label="Close details">
        ✕
      </button>
      <p className="cc-decision-detail__eyebrow">
        {kind} · {serialOf(id)}
      </p>
      <h3 className="cc-decision-detail__title">{d.title}</h3>
      <div className="cc-decision-detail__meta">
        <Badge tone={statusTone(d.status)} variant="soft" size="sm" dot>
          {d.status}
        </Badge>
        <span className="cc-decision-detail__updated">{d.updated}</span>
      </div>
      {d.excerpt ? <p className="cc-decision-detail__excerpt">{d.excerpt}</p> : null}

      {hasNeighbors ? (
        <div className="cc-decision-detail__graph" aria-label="Relationship map">
          <Lineage data={ego} selectedId={id} onSelect={(nid) => nid && nid !== id && onGo(nid)} />
        </div>
      ) : (
        <p className="cc-decision-detail__alone">No links yet — this decision stands alone.</p>
      )}

      <Axis title="Provenance" edges={ax.provenance} kind={kind} onGo={onGo} />
      <Axis title="Lineage" edges={ax.lineage} kind={kind} onGo={onGo} />
      <Axis title="Impact" edges={ax.impact} kind={kind} onGo={onGo} />

      {d.file ? <p className="cc-decision-detail__source">{d.file}</p> : null}
    </Card>
  );
}

// The impact constellation: a decisions × other-kinds grid. Each cell's fill scales with how many
// of that kind reference the decision (what depends on it); the trailing column is its same-kind
// (decision↔decision) lineage degree. Clicking a row selects it into the drawer. Pure CSS grid.
function Constellation({
  rows,
  columns,
  sel,
  onSelect,
}: {
  rows: ConstellationRow[];
  columns: string[];
  sel: string | undefined;
  onSelect: (id: string) => void;
}) {
  // Grid template: a wide label column, one narrow column per other-kind, then the lineage column.
  const template = `minmax(11rem, 1.6fr) repeat(${columns.length + 1}, minmax(2.6rem, 0.5fr))`;
  return (
    <div className="cc-constellation" role="table">
      <div className="cc-constellation__row cc-constellation__row--head" role="row" style={{ gridTemplateColumns: template }}>
        <span className="cc-constellation__corner" role="columnheader">
          decision
        </span>
        {columns.map((c) => (
          <span key={c} className="cc-constellation__colhead" role="columnheader" title={`referenced by ${prettify(c)}s`}>
            {prettify(c)}s
          </span>
        ))}
        <span className="cc-constellation__colhead" role="columnheader" title="decision↔decision lineage">
          lineage
        </span>
      </div>
      {rows.map((row) => (
        <button
          key={row.entity.id}
          type="button"
          className="cc-constellation__row cc-constellation__row--data"
          data-selected={row.entity.id === sel}
          role="row"
          style={{ gridTemplateColumns: template }}
          onClick={() => onSelect(row.entity.id)}
        >
          <span className="cc-constellation__label" role="cell">
            <span className="cc-constellation__serial">{serialOf(row.entity.id)}</span>
            <span className="cc-constellation__title">{row.entity.title}</span>
          </span>
          {columns.map((c) => {
            const n = row.reachByKind[c] ?? 0;
            return (
              <span
                key={c}
                className="cc-constellation__cell"
                role="cell"
                data-on={n > 0}
                style={n > 0 ? { ['--heat' as string]: Math.min(n, 4) } : undefined}
                title={n > 0 ? `${n} ${prettify(c)} reference${n === 1 ? '' : 's'}` : undefined}
              >
                {n > 0 ? n : ''}
              </span>
            );
          })}
          <span
            className="cc-constellation__cell cc-constellation__cell--lineage"
            role="cell"
            data-on={row.lineage > 0}
            style={row.lineage > 0 ? { ['--heat' as string]: Math.min(row.lineage, 4) } : undefined}
          >
            {row.lineage > 0 ? row.lineage : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

export function DecisionSurface({ kind, onNavigate }: { kind: string; onNavigate?: (id: string) => void }) {
  const decisions = entitiesOfKinds(kind);
  const [sel, setSel] = useState<string | undefined>(undefined);

  // A same-kind target re-centers the surface (select it in the drawer); any other kind hands off to
  // the app's tab navigation. Keeps decision↔decision exploration inside the surface.
  const goTo = (id: string) => {
    const r = recordFor(id);
    if (r && r.kind === kind) setSel(id);
    else onNavigate?.(id);
  };

  if (!decisions.length) {
    return <EmptyState title="No decisions yet" description={`Scaffold one with /new ${kind}.`} />;
  }

  const { rows, columns } = constellation(kind);

  return (
    <div className="cc-decisions">
      <section className="cc-section cc-constellation-wrap">
        <h3 className="cc-section-title">Impact constellation — what each decision touches</h3>
        <Constellation rows={rows} columns={columns} sel={sel} onSelect={setSel} />
      </section>

      <div className="cc-decisions__body">
        <div className="cc-decisions__ledger">
          {groupByStatus(kind, decisions).map(([status, group]) => (
            <div key={status} className="cc-ledger__group">
              <header className="cc-ledger__grouphead">
                <Badge tone={statusTone(status)} variant="soft" size="sm" dot>
                  {status}
                </Badge>
                <span className="cc-ledger__count">{group.length}</span>
              </header>
              {group.map((d) => {
                const ax = axesFor(d.id, kind);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="cc-ledger__row"
                    data-selected={d.id === sel}
                    onClick={() => setSel(d.id)}
                  >
                    <span className="cc-ledger__serial">{serialOf(d.id)}</span>
                    <span className="cc-ledger__main">
                      <span className="cc-ledger__title">{d.title}</span>
                      {d.excerpt ? <span className="cc-ledger__excerpt">{d.excerpt}</span> : null}
                    </span>
                    <span className="cc-ledger__impact">
                      <ImpactStrip ax={ax} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <aside className="cc-detailpanel" data-open={Boolean(sel)} aria-label="Decision details">
          <div className="cc-detailpanel__inner">
            {sel ? <Detail id={sel} kind={kind} onGo={goTo} onClose={() => setSel(undefined)} /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
