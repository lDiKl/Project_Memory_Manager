import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type RegressionRecord,
  createRecord,
  findProjectRoot,
  getRegressionStatus,
  listRegressions,
  listRegressionsByBug,
  listRegressionsByModule,
  loadConfig,
  loadRegression,
  patchRecord,
  regressionDir,
  regressionPath,
  renderTemplate,
  runRegression,
  saveResult,
} from '@pmem/core';
import type { Command } from 'commander';
import { writeJson, writeJsonError } from '../json.js';
import { templatesRoot } from '../paths.js';
import { ui } from '../ui.js';

export function registerRegression(program: Command): void {
  const reg = program.command('regression').description('Manage regression checks.');

  reg
    .command('create')
    .description('Create a new regression check.')
    .option('--root <path>', 'Project root.')
    .option('--bug <id>', 'Related bug ID.')
    .option('--task <id>', 'Related task ID.')
    .option('--module <name...>', 'Related module(s).')
    .option('--title <title>', 'Regression title.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(
      async (opts: {
        root?: string;
        bug?: string;
        task?: string;
        module?: string[];
        title?: string;
        json?: boolean;
      }) => {
        try {
          const root = opts.root ? resolve(opts.root) : await findProjectRoot();
          const config = await loadConfig(root);
          const tplRoot = templatesRoot();

          const relatedId = opts.bug ?? opts.task;
          const title = opts.title || `Regression check${relatedId ? ` for ${relatedId}` : ''}`;
          const record = (await createRecord(root, config, 'reg', title)) as RegressionRecord;
          if (opts.bug) record.related.bugs = [opts.bug.toUpperCase()];
          if (opts.task) record.related.tasks = [opts.task.toUpperCase()];
          if (opts.module) record.related.modules = opts.module;

          const content = await renderTemplate(tplRoot, 'reg', {
            id: record.id,
            title: record.title,
            created_at: record.created_at,
          });

          const dir = regressionDir(root, config);
          await mkdir(dir, { recursive: true });
          const path = regressionPath(root, config, record.id);
          await writeFile(path, content, 'utf-8');
          const saved = (await patchRecord(
            path,
            record as unknown as Partial<Record<string, unknown>>,
          )) as RegressionRecord;

          if (opts.json) {
            writeJson({ status: 'ok', record: saved, path: path.replace(`${root}/`, '') });
            return;
          }

          ui.blank();
          ui.success(`Created ${record.id}: ${title}`);
          ui.dim(`  ${path.replace(`${root}/`, '')}`);
          ui.blank();
          ui.info('Edit the file to configure the check type (manual/command/json).');
        } catch (err) {
          if (opts.json) writeJsonError(err);
          else ui.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    );

  reg
    .command('run <id>')
    .description('Run a regression check, or all checks related to a task/bug.')
    .option('--root <path>', 'Project root.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (id: string, opts: { root?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const records = await resolveRegressionTargets(root, config, id.toUpperCase());

        if (records.length === 0) {
          const message = `No regression checks found for ${id.toUpperCase()}.`;
          if (opts.json) writeJson({ error: message, results: [] });
          else ui.error(message);
          process.exitCode = 1;
          return;
        }

        const results = [];
        for (const record of records) {
          const result = await runRegression(root, config, record);
          await saveResult(root, record.id, result);
          results.push({ record, result });
        }

        if (opts.json) {
          writeJson({ status: 'ok', results });
          return;
        }

        ui.blank();
        for (const { record, result } of results) {
          ui.plain(`${record.id} - ${record.title}`);
          if (result.status === 'pass') ui.success('PASS');
          else if (result.status === 'fail') ui.error('FAIL');
          else ui.warn('ERROR');
          if (result.output) ui.dim(result.output);
          if (result.error) ui.plain(result.error);
          ui.blank();
        }
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  reg
    .command('list')
    .description('List regression checks.')
    .option('--root <path>', 'Project root.')
    .option('--bug <id>', 'Filter by bug ID.')
    .option('--task <id>', 'Filter by task ID.')
    .option('--module <name>', 'Filter by module name.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(
      async (opts: {
        root?: string;
        bug?: string;
        task?: string;
        module?: string;
        json?: boolean;
      }) => {
        try {
          const root = opts.root ? resolve(opts.root) : await findProjectRoot();
          const config = await loadConfig(root);

          let records: RegressionRecord[];
          if (opts.bug) records = await listRegressionsByBug(root, config, opts.bug.toUpperCase());
          else if (opts.task) {
            const all = await listRegressions(root, config);
            records = all.filter((r) => r.related.tasks.includes(opts.task?.toUpperCase() ?? ''));
          } else if (opts.module)
            records = await listRegressionsByModule(root, config, opts.module);
          else records = await listRegressions(root, config);

          if (opts.json) {
            writeJson({ records });
            return;
          }

          if (records.length === 0) {
            ui.dim('No regression checks found.');
            return;
          }

          ui.blank();
          for (const r of records) {
            ui.plain(`  ${r.id}  ${statusBadge(r.status)}  ${r.title} (${r.check.type})`);
          }
          ui.blank();
        } catch (err) {
          if (opts.json) writeJsonError(err);
          else ui.error(err instanceof Error ? err.message : String(err));
          process.exitCode = 1;
        }
      },
    );

  reg
    .command('status')
    .description('Show regression check status.')
    .option('--root <path>', 'Project root.')
    .option('--id <id>', 'Specific regression ID.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (opts: { root?: string; id?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);

        if (opts.id) {
          const status = await getRegressionStatus(root, opts.id.toUpperCase());
          if (!status) {
            if (opts.json) writeJson({ error: `No results found for ${opts.id}` });
            else ui.error(`No results found for ${opts.id}`);
            process.exitCode = 1;
            return;
          }

          if (opts.json) {
            writeJson({ status });
            return;
          }

          ui.blank();
          ui.plain(`${status.regId}`);
          ui.plain(`  Run count: ${status.runCount}`);
          ui.plain(`  Last run:  ${status.lastRun?.status ?? 'never'}`);
          ui.blank();
          return;
        }

        const records = await listRegressions(root, config);
        const statuses = [];
        for (const record of records) {
          statuses.push({ record, status: await getRegressionStatus(root, record.id) });
        }

        if (opts.json) {
          writeJson({ statuses });
          return;
        }

        ui.blank();
        ui.plain('Regression status:');
        for (const item of statuses) {
          ui.plain(`  ${item.record.id}: ${item.status?.lastRun?.status ?? 'never'}`);
        }
        ui.blank();
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}

async function resolveRegressionTargets(
  root: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  id: string,
): Promise<RegressionRecord[]> {
  if (id.startsWith('REG-')) {
    return [(await loadRegression(root, config, id)).record];
  }

  const records = await listRegressions(root, config);
  if (id.startsWith('BUG-')) return records.filter((r) => r.related.bugs.includes(id));
  if (id.startsWith('TASK-')) return records.filter((r) => r.related.tasks.includes(id));
  return [];
}

function statusBadge(status: string): string {
  const badges: Record<string, string> = {
    open: '[open]',
    pass: '[pass]',
    fail: '[fail]',
  };
  return badges[status] ?? `[${status}]`;
}
