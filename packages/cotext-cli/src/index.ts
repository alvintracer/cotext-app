/**
 * `cotext` — Cotext CLI entry point.
 *
 * Subcommands:
 *   cotext init                 — scaffold the LLM-wiki structure in a repo
 *   cotext compile              — compile wiki markdown → .cotext/neural.json
 *   cotext check                — exit 1 if the graph is stale (lint / CI)
 *
 * Common flags: --root <dir> | --force | --no-compile | --repo <owner/repo>
 *
 * Bundled via esbuild — single-file distribution, zero runtime deps.
 */

import path from 'node:path';
import { runInit } from './init.js';
import { runNeuralCompile } from './neural-compile.js';

const USAGE = `Usage: cotext <command> [options]

Commands:
  init              Scaffold LLM-wiki structure (folders + seed files + first compile)
  compile           Compile wiki markdown → .cotext/neural.json + NEURAL_INDEX.md
  check             Check whether the graph is up to date (exit 1 if stale)

Options:
  --root <dir>      Target directory (default: cwd)
  --out <dir>       Output dir for compile/check (default: <root>/.cotext)
  --force           init only — overwrite existing seed files
  --no-compile      init only — skip the first graph compile
  --repo <label>    compile only — repo label written into NEURAL_INDEX.md
  -h, --help        Show this help

Examples:
  npx cotext init
  npx cotext init --root ./my-repo --no-compile
  npx cotext compile --repo owner/repo
  npx cotext check
`;

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(USAGE);
    return 0;
  }

  const root = path.resolve(getFlag(rest, '--root') ?? process.cwd());
  const outDir = path.resolve(root, getFlag(rest, '--out') ?? '.cotext');
  const repoLabel = getFlag(rest, '--repo') ?? 'cotext-wiki';

  switch (cmd) {
    case 'init':
      return runInit({ root, force: rest.includes('--force'), compile: !rest.includes('--no-compile') });
    case 'compile':
      return runNeuralCompile({ root, outDir, check: false, repoLabel });
    case 'check':
      return runNeuralCompile({ root, outDir, check: true, repoLabel });
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(USAGE);
      return 2;
  }
}

process.exit(main(process.argv.slice(2)));
