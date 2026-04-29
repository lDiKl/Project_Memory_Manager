import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type AdrRecord,
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

export function registerAdr(program: Command): void {
  const adr = program.command('adr').description('Manage architecture decision records.');

  adr
    .command('create <title>')
    .description('Create a new ADR.')
    .option('--root <path>', 'Project root.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (title: string, opts: { root?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const tplRoot = templatesRoot();

        const record = await createRecord(root, config, 'adr', title);
        const content = await renderTemplate(tplRoot, 'adr', {
          id: record.id,
          title: record.title,
          created_at: record.created_at,
        });

        const dir = recordDir(root, config, 'adr');
        await mkdir(dir, { recursive: true });
        const path = recordPath(root, config, record.id, 'adr');
        await writeFile(path, content, 'utf-8');

        if (opts.json) {
          writeJson({ status: 'ok', record, path: path.replace(`${root}/`, '') });
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

  adr
    .command('list')
    .description('List all ADRs.')
    .option('--root <path>', 'Project root.')
    .option('--json', 'Output machine-readable JSON.', false)
    .action(async (opts: { root?: string; json?: boolean }) => {
      try {
        const root = opts.root ? resolve(opts.root) : await findProjectRoot();
        const config = await loadConfig(root);
        const records = (await listRecords(root, config, 'adr')) as AdrRecord[];

        if (opts.json) {
          writeJson({ records });
          return;
        }

        if (records.length === 0) {
          ui.dim('No ADRs found.');
          return;
        }

        ui.blank();
        for (const r of records) {
          ui.plain(`  ${r.id}  [${r.status}]  ${r.title}`);
        }
        ui.blank();
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  adr
    .command('show <id>')
    .description('Show an ADR.')
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

        const record = found.record as AdrRecord;
        if (opts.json) {
          writeJson({ record, body: found.body, path: found.filePath.replace(`${root}/`, '') });
          return;
        }

        ui.blank();
        ui.header(`${record.id} - ${record.title}`);
        ui.plain(`  status: ${record.status}`);
        ui.plain(`  date:   ${record.created_at}`);
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

  adr
    .command('accept <id>')
    .description('Mark an ADR as accepted.')
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

        const record = await patchRecord(found.filePath, { status: 'accepted' });
        if (opts.json) {
          writeJson({ status: 'ok', record, path: found.filePath.replace(`${root}/`, '') });
          return;
        }

        ui.success(`${id.toUpperCase()} accepted.`);
      } catch (err) {
        if (opts.json) writeJsonError(err);
        else ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
