#!/usr/bin/env node
// Emit EVERY in-repo consumer's Command-Center contract into one co-located dir
// (previews/dashboards/), namespaced by project slug, so the app can bundle + switch between
// them. Reuses the single render-hub generator (no re-implementation) and the CONSUMERS list
// from tools/check-consumer-drift.mjs (the one source of truth for who consumes the contract).
//
// Targets = the framework dogfood + every consumer whose root lives INSIDE this repo. An
// external consumer (e.g. the real Soul-Steel, in another repo) is skipped — its contract isn't
// bundled into this app. Run: node apps/command-center/scripts/render-all.mjs
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSUMERS } from '../../../tools/check-consumer-drift.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const RENDER_HUB = join(REPO_ROOT, 'tools', 'render-hub.mjs');
const OUT = join(REPO_ROOT, 'previews', 'dashboards');

const inRepo = (p) => p === REPO_ROOT || p.startsWith(`${REPO_ROOT}/`);

// The framework dogfood first, then every in-repo consumer (demo fixtures). All slug-namespaced
// by render-hub (<project>-graph.json / <project>-hub.json), so they never collide in OUT.
const targets = [
  { name: 'project-system', root: REPO_ROOT, config: join(REPO_ROOT, 'project-system.config.json') },
  ...CONSUMERS.filter((c) => inRepo(c.root) && existsSync(c.root) && existsSync(c.config)),
];

let failed = 0;
for (const t of targets) {
  try {
    const out = execFileSync('node', [RENDER_HUB, '--root', t.root, '--config', t.config, '--out', OUT], { encoding: 'utf8' });
    const model = out.split('\n').find((l) => l.startsWith('model:'))?.replace('model:', '').trim();
    console.log(`[render-all] ${t.name}${model ? ` — ${model}` : ''}`);
  } catch (e) {
    failed += 1;
    console.error(`[render-all] ${t.name}: FAILED — ${e.message}`);
  }
}

console.log(`[render-all] ${targets.length - failed}/${targets.length} contract(s) → previews/dashboards/`);
process.exit(failed ? 1 : 0);
