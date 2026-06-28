import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { GuideNode } from './contract';

// A small, dependency-free tree (the @trembus/ui kit ships no tree primitive). It renders the
// Field Guide's folder hierarchy as an ARIA `tree` and drives a detail brief via controlled
// selection. Expansion is controlled by the parent too, so the Overview hex tile can deep-link
// to a node. The visible tree is flattened once per render into an ordered row list — the single
// spine for both rendering and keyboard navigation (the standard roving-tabindex tree pattern).

interface ConventionTreeProps {
  /** Top-level nodes (the guide forest: core / _project / concepts). */
  nodes: GuideNode[];
  /** Controlled selection → drives the detail brief. */
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Controlled expansion set (node ids that are open). */
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

interface Row {
  node: GuideNode;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  /** Index of this row's parent in the flat list, or -1 for a top-level row. */
  parent: number;
}

// Walk the tree depth-first, emitting only rows reachable through expanded ancestors.
function flatten(nodes: GuideNode[], expanded: Set<string>): Row[] {
  const rows: Row[] = [];
  const walk = (list: GuideNode[], depth: number, parent: number) => {
    for (const node of list) {
      const hasChildren = Boolean(node.children?.length);
      const isOpen = hasChildren && expanded.has(node.id);
      const self = rows.length;
      rows.push({ node, depth, hasChildren, isOpen, parent });
      if (isOpen) walk(node.children!, depth + 1, self);
    }
  };
  walk(nodes, 0, -1);
  return rows;
}

export function ConventionTree({ nodes, selectedId, onSelect, expanded, onToggle }: ConventionTreeProps) {
  const rows = useMemo(() => flatten(nodes, expanded), [nodes, expanded]);

  // Roving tabindex: exactly one row is tabbable at a time. Track it by id so it survives
  // expand/collapse reflows; fall back to the selection, then the first row.
  const [activeId, setActiveId] = useState<string | undefined>(selectedId ?? nodes[0]?.id);
  useEffect(() => {
    if (selectedId) setActiveId(selectedId);
  }, [selectedId]);
  // If the active row vanished (its parent collapsed), retarget to the first visible row.
  useEffect(() => {
    if (activeId && !rows.some((r) => r.node.id === activeId)) setActiveId(rows[0]?.node.id);
  }, [rows, activeId]);

  const elRefs = useRef(new Map<string, HTMLLIElement>());
  const focusId = (id: string | undefined) => {
    setActiveId(id);
    if (id) requestAnimationFrame(() => elRefs.current.get(id)?.focus());
  };

  const activeIdx = rows.findIndex((r) => r.node.id === activeId);

  // Selecting a row reveals its brief; a collapsed folder also opens (collapse is via the caret
  // or ArrowLeft, so a label click never hides what you just opened).
  const selectRow = (row: Row) => {
    onSelect(row.node.id);
    setActiveId(row.node.id);
    if (row.hasChildren && !row.isOpen) onToggle(row.node.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>, idx: number) => {
    const row = rows[idx];
    if (!row) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusId(rows[Math.min(idx + 1, rows.length - 1)]?.node.id);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusId(rows[Math.max(idx - 1, 0)]?.node.id);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.hasChildren && !row.isOpen) onToggle(row.node.id);
        else if (row.hasChildren) focusId(rows[idx + 1]?.node.id); // into first child
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.hasChildren && row.isOpen) onToggle(row.node.id);
        else if (row.parent >= 0) focusId(rows[row.parent]?.node.id); // to parent
        break;
      case 'Home':
        e.preventDefault();
        focusId(rows[0]?.node.id);
        break;
      case 'End':
        e.preventDefault();
        focusId(rows[rows.length - 1]?.node.id);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectRow(row);
        break;
      default:
        break;
    }
  };

  return (
    <ul className="cc-tree" role="tree" aria-label="Framework & naming conventions">
      {rows.map((row, idx) => {
        const { node } = row;
        const isActive = node.id === activeId || (activeIdx === -1 && idx === 0);
        return (
          <li
            key={node.id}
            ref={(el) => {
              if (el) elRefs.current.set(node.id, el);
              else elRefs.current.delete(node.id);
            }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-selected={node.id === selectedId}
            aria-expanded={row.hasChildren ? row.isOpen : undefined}
            tabIndex={isActive ? 0 : -1}
            className="cc-tree__node"
            data-selected={node.id === selectedId}
            data-type={node.nodeType}
            data-leaf={!row.hasChildren}
            style={{ ['--depth' as string]: row.depth }}
            onClick={() => selectRow(row)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            <span
              className="cc-tree__caret"
              data-open={row.isOpen}
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                if (row.hasChildren) onToggle(node.id);
              }}
            />
            <span className="cc-tree__icon" data-type={node.nodeType} aria-hidden="true" />
            <span className="cc-tree__label">{node.label}</span>
            {node.facts?.length ? <span className="cc-tree__count">{node.facts.length}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
