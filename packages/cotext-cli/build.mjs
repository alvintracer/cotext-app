import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  // Don't bundle native Node built-ins (they're external by default on platform:node)
});
console.log('[cotext-cli] built dist/index.js');
