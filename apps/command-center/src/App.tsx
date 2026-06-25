import { useEffect, useMemo, useState } from 'react';
import { Lineage } from '@trembus/viz';
import { buildGraphContract, hub } from './contract';

export function App() {
  const { data, dropped } = useMemo(() => buildGraphContract(), []);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (dropped.length) console.warn('[command-center] unresolved edges:', dropped);
  }, [dropped]);

  return (
    <div className="tcl-root cc-app">
      <header className="cc-head">
        <div>
          <h1 className="cc-title">{hub.brand} · Command Center</h1>
          <p className="cc-tagline">{hub.tagline}</p>
        </div>
        <dl className="cc-stats">
          {hub.stats.map((s, i) => (
            <div className="cc-stat" key={`${s.label}-${i}`}>
              <dt>{s.label}</dt>
              <dd style={s.color ? { color: s.color } : undefined}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <main className="cc-stage">
        <Lineage data={data} selectedId={selectedId} onSelect={setSelectedId} />
      </main>

      {dropped.length > 0 && (
        <footer className="cc-foot">
          ⚠ {dropped.length} edge(s) did not resolve to a node — the committed contract may be
          stale. Regenerate with <code>node ../../tools/render-hub.mjs --no-render</code>.
        </footer>
      )}
    </div>
  );
}
