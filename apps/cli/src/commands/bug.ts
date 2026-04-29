import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BUG_ATTEMPT_TEMPLATE,
  type BugRecord,
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

interface BugCreateOptions {
  root?: string;
  module?: string[];
  severity?: string;
  source?: string;
  externalId?: string;
  externalUrl?: string;
  json?: boolean;
}

interface BugUpdateOptions extends BugCreateOptions {
  status?: string;
  append?: string;
}

export function registerBug(program: Command): void {
  const bug = program.command('bug').description('Manage bug records.');

  bug
    .command('create <title>')
    .description('Create a new bug record.')
    .option('--root <path>', 'Project root.')
    .option('--module <name...>', 'Affected module(s).')
    .option('--severity <value>', 'Bug severity: low, medium, high, critical.')
    .option('--source <name>', 'External source name, e.g. jira, linear, github, manual.')
    .option('--external-id <id>', 'External issue ID.')
    .option('--external-url <url>', 'External issue URL.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (title: string, opts: BugCreateOptions) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const tplRoot = templatesRoot();

        let record = await createRecord(root, config, 'bug', title);
        applyBugOptions(record, opts);

        const content = await renderTemplate(tplRoot, 'bug', {
          id: record.id,
          title: record.title,
          created_at: record.created_at,
        });

        const dir = recordDir(root, config, 'bug');
        await mkdir(dir, { recursive: true });
        const path = recordPath(root, config, record.id, 'bug');
        await writeFile(path, content, 'utf-8');
        record = (await patchRecord(
          path,
          record as unknown as Partial<Record<string, unknown>>,
        )) as BugRecord;

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

  bug
    .command('list')
    .description('List all bugs.')
    .option('--root <path>', 'Project root.')
    .option('--status <status>', 'Filter by status.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (opts: { root?: string; status?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const records = (await listRecords(root, config, 'bug')) as BugRecord[];
        const filtered = opts.status ? records.filter((r) => r.status === opts.status) : records;

        if (opts.json) {
          writeJson({ records: filtered }, 'list');
          return;
        }

        if (filtered.length === 0) {
          ui.dim('No bugs found.');
          return;
        }

        ui.blank();
        for (const r of filtered) {
          ui.plain(`  ${r.id}  [${r.status}]  [${r.severity}]  ${r.title}`);
        }
        ui.blank();
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  bug
    .command('show <id>')
    .description('Show a bug record.')
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

        const record = found.record as BugRecord;
        if (opts.json) {
          writeJson(
            { record, body: found.body, path: found.filePath.replace(`${root}/`, '') },
            'record',
          );
          return;
        }

        ui.blank();
        ui.header(`${record.id} - ${record.title}`);
        ui.plain(`  status:   ${record.status}`);
        ui.plain(`  severity: ${record.severity}`);
        if (record.modules.length > 0) ui.plain(`  modules:  ${record.modules.join(', ')}`);
        if (record.source) ui.plain(`  source:        ${record.source}`);
        if (record.external_id) ui.plain(`  external_id:   ${record.external_id}`);
        if (record.external_url) ui.plain(`  external_url:  ${record.external_url}`);
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

  bug
    .command('update <id>')
    .description('Update a bug record frontmatter and/or append a note.')
    .option('--root <path>', 'Project root.')
    .option('--status <status>', 'Set bug status.')
    .option('--severity <value>', 'Set bug severity.')
    .option('--module <name...>', 'Replace affected module(s).')
    .option('--source <name>', 'Set external source name.')
    .option('--external-id <id>', 'Set external issue ID.')
    .option('--external-url <url>', 'Set external issue URL.')
    .option('--append <text>', 'Append an auditable note to the bug body.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (id: string, opts: BugUpdateOptions) => {
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
        if (opts.severity) patches.severity = opts.severity;
        if (opts.module) patches.modules = opts.module;
        if (opts.source) patches.source = opts.source;
        if (opts.externalId) patches.external_id = opts.externalId;
        if (opts.externalUrl) patches.external_url = opts.externalUrl;

        let record = found.record as BugRecord;
        if (Object.keys(patches).length > 0) {
          record = (await patchRecord(found.filePath, patches)) as BugRecord;
        }

        if (opts.append) {
          const date = new Date().toISOString();
          await appendFile(found.filePath, `\n\n## Update ${date}\n\n${opts.append}\n`, 'utf-8');
          record = (await patchRecord(found.filePath, {})) as BugRecord;
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

  bug
    .command('append <id>')
    .description('Append an investigation attempt to a bug record.')
    .option('--root <path>', 'Project root.')
    .option('--note <text>', 'Append this note instead of the default attempt template.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (id: string, opts: { root?: string; note?: string; json?: boolean }) => {
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

        const date = new Date().toISOString().slice(0, 10);
        const attempt = opts.note
          ? `\n\n## Update ${new Date().toISOString()}\n\n${opts.note}\n`
          : `\n${BUG_ATTEMPT_TEMPLATE.replace('{{date}}', date)}`;
        await appendFile(found.filePath, attempt, 'utf-8');
        const record = (await patchRecord(found.filePath, {})) as BugRecord;

        if (opts.json) {
          writeJson(
            {
              status: 'ok',
              record,
              path: found.filePath.replace(`${root}/`, ''),
              message: `Appended to ${id.toUpperCase()}.`,
            },
            'mutation',
          );
          return;
        }

        ui.success(`Appended attempt ${date} to ${id.toUpperCase()}.`);
        ui.dim(`  Edit ${found.filePath.replace(`${root}/`, '')} to fill in the details.`);
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}

function applyBugOptions(record: BugRecord, opts: BugCreateOptions): void {
  if (opts.module) record.modules = opts.module;
  if (opts.severity) record.severity = opts.severity as BugRecord['severity'];
  if (opts.source) record.source = opts.source;
  if (opts.externalId) record.external_id = opts.externalId;
  if (opts.externalUrl) record.external_url = opts.externalUrl;
}
