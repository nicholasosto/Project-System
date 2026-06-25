import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..'); // the Project-System repo (holds previews/)

// The Trembus packages (@trembus/ui · @trembus/viz · their transitive @trembus/tokens) are
// installed from the npm registry — no aliases needed. `dedupe` still pins a single React
// instance so a dependency can't pull a second copy (the null-dispatcher useState crash).
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5175,
    // Allow the dev server to read the emitted contract in REPO_ROOT/previews (outside the app root).
    fs: { allow: [REPO_ROOT] },
  },
  build: { target: 'es2022', outDir: 'dist' },
});
