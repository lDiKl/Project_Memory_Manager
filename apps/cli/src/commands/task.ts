import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type TaskRecord,
  createRecord,
  findProjectRoot,
  findRecord,
  listRecords,
  loadConfig,
  patchRecord,
  recordDir,
  recordPath,
  renderTemplate,
} from '@pmem/core';
import type { Command } from 'commander';
import { writeJson, writeJsonError } from '../json.js';
import { templatesRoot } from '../paths.js';
import { ui } from '../ui.js';

interface TaskCreateOptions {
  root?: string;
  module?: string[];
  docsImpact?: string;
  source?: string;
  externalId?: string;
  externalUrl?: string;
  json?: boolean;
}

interface TaskUpdateOptions extends TaskCreateOptions {
  status?: string;
  append?: string;
}

export function registerTask(program: Command): void {
  const task = program.command('task').description('Manage task records.');

  task
    .command('create <title>')
    .description('Create a new task record.')
    .option('--root <path>', 'Project root.')
    .option('--module <name...>', 'Affected module(s).')
    .option('--docs-impact <value>', 'Docs impact: none, required, completed.')
    .option('--source <name>', 'External source name, e.g. jira, linear, github, manual.')
    .option('--external-id <id>', 'External issue/task ID.')
    .option('--external-url <url>', 'External issue/task URL.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (title: string, opts: TaskCreateOptions) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const tplRoot = templatesRoot();

        let record = await createRecord(root, config, 'task', title);
        applyTaskOptions(record, opts);

        const content = await renderTemplate(tplRoot, 'task', {
          id: record.id,
          title: record.title,
          created_at: record.created_at,
        });

        const dir = recordDir(root, config, 'task');
        await mkdir(dir, { recursive: true });
        const path = recordPath(root, config, record.id, 'task');
        await writeFile(path, content, 'utf-8');
        record = (await patchRecord(
          path,
          record as unknown as Partial<Record<string, unknown>>,
        )) as TaskRecord;

        if (opts.json) {
          writeJson({ status: 'ok', record, path: path.replace(`${root}/`, '') }, 'mutation');
          return;
        }

        ui.blank();
        ui.success(`Created ${record.id}: ${title}`);
        ui.dim(`  ${path.replace(`${root}/`, '')}`);
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  task
    .command('list')
    .description('List all tasks.')
    .option('--root <path>', 'Project root.')
    .option('--status <status>', 'Filter by status.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (opts: { root?: string; status?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const records = (await listRecords(root, config, 'task')) as TaskRecord[];
        const filtered = opts.status ? records.filter((r) => r.status === opts.status) : records;

        if (opts.json) {
          writeJson({ records: filtered }, 'list');
          return;
        }

        if (filtered.length === 0) {
          ui.dim('No tasks found.');
          return;
        }

        ui.blank();
        for (const r of filtered) {
          ui.plain(`  ${r.id}  ${statusBadge(r.status)}  ${r.title}`);
        }
        ui.blank();
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  task
    .command('show <id>')
    .description('Show a task record.')
    .option('--root <path>', 'Project root.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (id: string, opts: { root?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const found = await findRecord(root, config, id.toUpperCase());
        if (!found) {
          if (opts.json) writeJson({ error: `Record ${id} not found.` });
          else ui.error(`Record ${id} not found.`);
          process.exitCode = 1;
          return;
        }

        const record = found.record as TaskRecord;
        if (opts.json) {
          writeJson(
            { record, body: found.body, path: found.filePath.replace(`${root}/`, '') },
            'record',
          );
          return;
        }

        ui.blank();
        ui.header(`${record.id} - ${record.title}`);
        ui.plain(`  status:      ${record.status}`);
        ui.plain(`  docs_impact: ${record.docs_impact}`);
        if (record.modules.length > 0) ui.plain(`  modules:     ${record.modules.join(', ')}`);
        if (record.source) ui.plain(`  source:      ${record.source}`);
        if (record.external_id) ui.plain(`  external_id: ${record.external_id}`);
        if (record.external_url) ui.plain(`  external_url: ${record.external_url}`);
        if (found.body) {
          ui.blank();
          ui.dim(found.body);
        }
        ui.blank();
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  task
    .command('update <id>')
    .description('Update a task record frontmatter and/or append a note.')
    .option('--root <path>', 'Project root.')
    .option('--status <status>', 'Set task status.')
    .option('--docs-impact <value>', 'Set docs impact: none, required, completed.')
    .option('--module <name...>', 'Replace affected module(s).')
    .option('--source <name>', 'Set external source name.')
    .option('--external-id <id>', 'Set external issue/task ID.')
    .option('--external-url <url>', 'Set external issue/task URL.')
    .option('--append <text>', 'Append an auditable note to the task body.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (id: string, opts: TaskUpdateOptions) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const found = await findRecord(root, config, id.toUpperCase());
        if (!found) {
          if (opts.json) writeJson({ error: `Record ${id} not found.` });
          else ui.error(`Record ${id} not found.`);
          process.exitCode = 1;
          return;
        }

        const patches: Partial<Record<string, unknown>> = {};
        if (opts.status) patches.status = opts.status;
        if (opts.docsImpact) patches.docs_impact = opts.docsImpact;
        if (opts.module) patches.modules = opts.module;
        if (opts.source) patches.source = opts.source;
        if (opts.externalId) patches.external_id = opts.externalId;
        if (opts.externalUrl) patches.external_url = opts.externalUrl;

        let record = found.record as TaskRecord;
        if (Object.keys(patches).length > 0) {
          record = (await patchRecord(found.filePath, patches)) as TaskRecord;
        }

        if (opts.append) {
          const date = new Date().toISOString();
          await appendFile(found.filePath, `\n\n## Update ${date}\n\n${opts.append}\n`, 'utf-8');
          record = (await patchRecord(found.filePath, {})) as TaskRecord;
        }

        if (opts.json) {
          writeJson(
            {
              status: 'ok',
              record,
              path: found.filePath.replace(`${root}/`, ''),
              message: `${id.toUpperCase()} updated.`,
            },
            'mutation',
          );
          return;
        }

        ui.success(`${id.toUpperCase()} updated.`);
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  task
    .command('close <id>')
    .description('Mark a task as done.')
    .option('--root <path>', 'Project root.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (id: string, opts: { root?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const found = await findRecord(root, config, id.toUpperCase());
        if (!found) {
          if (opts.json) writeJson({ error: `Record ${id} not found.` });
          else ui.error(`Record ${id} not found.`);
          process.exitCode = 1;
          return;
        }

        const record = await patchRecord(found.filePath, {
          status: 'done',
          docs_impact: 'completed',
        });

        if (opts.json) {
          writeJson(
            { status: 'ok', record, path: found.filePath.replace(`${root}/`, '') },
            'mutation',
          );
          return;
        }

        ui.success(`${id.toUpperCase()} closed.`);
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}

function applyTaskOptions(record: TaskRecord, opts: TaskCreateOptions): void {
  if (opts.module) record.modules = opts.module;
  if (opts.docsImpact) record.docs_impact = opts.docsImpact as TaskRecord['docs_impact'];
  if (opts.source) record.source = opts.source;
  if (opts.externalId) record.external_id = opts.externalId;
  if (opts.externalUrl) record.external_url = opts.externalUrl;
}

function statusBadge(status: string): string {
  const badges: Record<string, string> = {
    open: '[open]',
    in_progress: '[in_progress]',
    blocked: '[blocked]',
    done: '[done]',
  };
  return badges[status] ?? `[${status}]`;
}
