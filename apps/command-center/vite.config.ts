import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..'); // the Project-System repo (holds previews/)
const TCL = resolve(HERE, '../../../../Repositories/Trembus-Component-Library'); // sibling component library

// The Trembus packages are consumed via their BUILT dist (run `pnpm -r build` in TCL first),
// aliased here rather than installed as npm deps. Why: @trembus/viz's manifest declares
// `@trembus/tokens: workspace:*`, which a cross-repo `file:` install cannot resolve — but the
// built dist already bundles tokens, so pointing at dist sidesteps the workspace-protocol trap.
// Regex aliases with `$` keep the bare-package and `/styles.css` specifiers from colliding.
const tcl = (p: string) => resolve(TCL, p);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The aliased @trembus dist lives in the sibling TCL repo and does `import 'react'`,
    // which would otherwise resolve to TCL's own node_modules/react — a SECOND React copy,
    // giving the "Cannot read properties of null (reading 'useState')" null-dispatcher crash.
    // dedupe forces every `react`/`react-dom` specifier to the app's single instance.
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^@trembus\/ui\/styles\.css$/, replacement: tcl('packages/ui/dist/styles.css') },
      { find: /^@trembus\/viz\/styles\.css$/, replacement: tcl('packages/viz/dist/styles.css') },
      { find: /^@trembus\/ui$/, replacement: tcl('packages/ui/dist/index.js') },
      { find: /^@trembus\/viz$/, replacement: tcl('packages/viz/dist/index.js') },
    ],
  },
  server: {
    port: 5175,
    // Allow the dev server to read the emitted contract (in REPO_ROOT/previews) and the
    // aliased dist files (in the sibling TCL checkout), both outside the app root.
    fs: { allow: [REPO_ROOT, TCL] },
  },
  build: { target: 'es2022', outDir: 'dist' },
});
