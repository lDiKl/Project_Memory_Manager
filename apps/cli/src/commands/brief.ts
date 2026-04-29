import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type RecordType,
  findProjectRoot,
  findRecord,
  loadConfig,
  renderCurrentState,
} from '@pmem/core';
import type { Command } from 'commander';
import { templatesRoot } from '../paths.js';
import { ui } from '../ui.js';

export function registerBrief(program: Command): void {
  program
    .command('brief <file>')
    .description('Create/update a current-state brief for a record or file.')
    .option('--root <path>', 'Project root.')
    .option('--task <id>', 'Update task record current-state.md.')
    .option('--bug <id>', 'Update bug record current-state.md.')
    .action(async (file: string, opts: { root?: string; task?: string; bug?: string }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const tplRoot = templatesRoot();

        let recordId: string | undefined;
        let type: 'task' | 'bug' | undefined;

        if (opts.task) {
          recordId = opts.task;
          type = 'task';
        } else if (opts.bug) {
          recordId = opts.bug;
          type = 'bug';
        } else {
          ui.error('Must specify --task or --bug');
          process.exitCode = 1;
          return;
        }

        const found = await findRecord(root, config, recordId.toUpperCase());
        if (!found) {
          ui.error(`Record ${recordId} not found.`);
          process.exitCode = 1;
          return;
        }

        const record = found.record;
        const vars = {
          id: record.id,
          title: record.title,
          date: new Date().toISOString().slice(0, 10),
        };

        const content = await renderCurrentState(tplRoot, type as RecordType, vars);

        const statePath = join(dirname(found.filePath), `${record.id}-current-state.md`);
        await mkdir(dirname(statePath), { recursive: true });
        await writeFile(statePath, content, 'utf-8');

        ui.success(`Created ${statePath.replace(`${root}/`, '')}`);
      } catch (err) {
        ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
