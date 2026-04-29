import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type ContextOptions,
  buildContext,
  findProjectRoot,
  listContextPacks,
  loadConfig,
  loadDocsMap,
} from '@pmem/core';
import type { Command } from 'commander';
import { writeJson, writeJsonError } from '../json.js';
import { ui } from '../ui.js';

export function registerContext(program: Command): void {
  const ctx = program.command('context').description('Build LLM context packs.');

  ctx
    .command('build')
    .description('Build a context pack for LLM consumption.')
    .option('--root <path>', 'Project root.')
    .option('--task <id>', 'Include context for this task.')
    .option('--bug <id>', 'Include context for this bug.')
    .option('--files <files...>', 'Include context for these files.')
    .option('--diff', 'Include context for the current diff (staged or working).')
    .option('--pack <kind>', 'Built-in context pack kind: bugfix, feature, refactor, architecture.')
    .option('--include-regressions', 'Include regression check results in the context pack.')
    .option('--output <path>', 'Write to file instead of stdout.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(
      async (opts: {
        root?: string;
        task?: string;
        bug?: string;
        files?: string[];
        diff?: boolean;
        pack?: string;
        includeRegressions?: boolean;
        output?: string;
        json?: boolean;
      }) => {
        try {
          const root = opts.root ? resolve(opts.root) : await findProjectRoot();
          const config = await loadConfig(root);
          const docsMap = await loadDocsMap(root, config);

          const contextOpts: ContextOptions = { root };
          if (opts.task) contextOpts.task = opts.task;
          if (opts.bug) contextOpts.bug = opts.bug;
          if (opts.files) contextOpts.files = opts.files;
          if (opts.diff) contextOpts.diff = opts.diff;
          if (opts.pack) contextOpts.pack = opts.pack;
          if (opts.includeRegressions) contextOpts.includeRegressions = opts.includeRegressions;

          const markdown = await buildContext(root, config, docsMap, contextOpts);

          if (opts.output) {
            const { writeFile } = await import('node:fs/promises');
            await writeFile(join(root, opts.output), markdown, 'utf-8');
            if (opts.json) {
              writeJson({ status: 'ok', markdown, output: opts.output });
              return;
            }
            ui.success(`Context written to ${opts.output}`);
          } else if (opts.json) {
            writeJson({ status: 'ok', markdown });
          } else {
            console.log(markdown);
          }
        } catch (err) {
          if (opts.json) writeJsonError(err);
          else ui.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    );

  ctx
    .command('list-packs')
    .description('List available context pack kinds.')
    .option('--root <path>', 'Project root.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (opts: { root?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const packs = await listContextPacks(root, config);

        if (opts.json) {
          writeJson({ packs });
          return;
        }

        if (packs.length === 0) {
          ui.dim('No context packs found.');
          return;
        }

        ui.blank();
        ui.plain('Available context pack kinds:');
        for (const pack of packs) {
          ui.plain(`  - ${pack}`);
        }
        ui.blank();
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
