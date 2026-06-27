import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  absWorkingDir: here,
  entryPoints: [path.join(here, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(here, 'dist', 'index.js'),
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  // Don't bundle native Node built-ins (they're external by default on platform:node)
});
console.log('[cotext-cli] built dist/index.js');
