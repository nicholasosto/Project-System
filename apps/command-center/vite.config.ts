import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..'); // the Project-System repo (holds previews/ and _project/)

// Honor a harness-assigned port (PORT env, set when launch.json runs with autoPort) so the
// server never collides with another chat's instance; fall back to 5175 for manual runs.
const PORT = Number(process.env.PORT) || 5175;

// ── P4 · Live reload (dev only) ───────────────────────────────────────────────────────
// The app imports the emitted contract JSON statically (src/contract.ts), so Vite's dev
// server already reloads the page whenever previews/dashboards/*.json changes. The missing
// half is regenerating that JSON from its `_project/` markdown source. This plugin watches
// `_project/**.md` and re-runs the zero-dep render-hub generator (as a subprocess, so the
// framework-core seam stays intact — exactly a human `node tools/render-hub.mjs`) on each
// edit; Vite then sees the rewritten JSON and repaints. `apply: 'serve'` scopes it to
// `vite dev` only, so `vite build` / `vite preview` keep reading the committed JSON — the
// committed contract stays the source the static build reads (roadmap command-center P4).
function liveContract(): Plugin {
  // Watch the dogfood `_project/` AND every consumer's `examples/*/_project/`, and regenerate
  // ALL contracts via render-all so whichever consumer is selected in the UI stays live.
  const WATCH_DIRS = [resolve(REPO_ROOT, '_project'), resolve(REPO_ROOT, 'examples')];
  const GENERATOR = resolve(REPO_ROOT, 'apps/command-center/scripts/render-all.mjs');
  return {
    name: 'project-system:live-contract',
    apply: 'serve',
    configureServer(server) {
      const log = (msg: string) => server.config.logger.info(`[live-contract] ${msg}`, { timestamp: true });
      let debounce: ReturnType<typeof setTimeout> | null = null;
      let running = false; // a generator subprocess is in flight
      let pending = false; // an edit arrived mid-run; coalesce into one re-run after it
      // chokidar replays an `add` for every existing file when we start watching a populated
      // tree; swallow that initial burst so merely starting the dev server doesn't regenerate.
      let warm = false;
      setTimeout(() => { warm = true; }, 400);

      const regenerate = () => {
        if (running) { pending = true; return; }
        running = true;
        let stderr = '';
        const child = spawn(process.execPath, [GENERATOR], { cwd: REPO_ROOT });
        child.stderr?.on('data', (d) => { stderr += d; });
        child.on('error', (e) => { running = false; log(`could not run render-hub — ${e.message}`); });
        child.on('close', (code) => {
          running = false;
          if (code === 0) log('contract regenerated from _project/ → reloading');
          else log(`render-hub exited ${code}${stderr ? `\n${stderr.trim()}` : ''}`);
          if (pending) { pending = false; regenerate(); }
        });
      };

      const onChange = (file: string) => {
        // Any `_project/` markdown — the dogfood's or a consumer's under examples/ — triggers a
        // full regenerate of every contract.
        if (!warm || !file.endsWith('.md') || !file.includes('/_project/')) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(regenerate, 120);
      };

      for (const dir of WATCH_DIRS) server.watcher.add(dir);
      for (const ev of ['add', 'change', 'unlink'] as const) server.watcher.on(ev, onChange);
      log('watching _project/ + examples/*/_project/ — edits regenerate all dashboard contracts');
    },
  };
}

// The Trembus packages (@trembus/ui · @trembus/viz · their transitive @trembus/tokens) are
// installed from the npm registry — no aliases needed. `dedupe` still pins a single React
// instance so a dependency can't pull a second copy (the null-dispatcher useState crash).
export default defineConfig({
  plugins: [react(), liveContract()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: PORT,
    // Allow the dev server to read the emitted contract in REPO_ROOT/previews (outside the app root).
    fs: { allow: [REPO_ROOT] },
  },
  preview: { port: PORT },
  build: { target: 'es2022', outDir: 'dist' },
});
