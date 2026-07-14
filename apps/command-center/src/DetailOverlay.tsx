// The shared right-overlay detail drawer — the .cc-detailpanel chrome used by the Overview hub,
// the Processes step drawer, and the Decision Surface. The rail floats over the layout's right
// edge (no sibling reflow — see app.css); this wrapper owns the one behavior all three surfaces
// share: Escape closes an open drawer. Children render only while open (they carry their own ✕).
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function DetailOverlay({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside className="cc-detailpanel" data-open={open} aria-label={label}>
      <div className="cc-detailpanel__inner">{open ? children : null}</div>
    </aside>
  );
}
