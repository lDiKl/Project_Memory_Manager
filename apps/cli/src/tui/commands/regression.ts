import { mkdir, writeFile } from 'node:fs/promises';
import {
  type RegressionRecord,
  runRegression as coreRunRegression,
  createRecord,
  getRegressionStatus,
  listRegressions,
  listRegressionsByBug,
  listRegressionsByModule,
  loadConfig,
  loadRegression,
  recordDir,
  recordPath,
  renderTemplate,
  saveResult,
} from '@pmem/core';
import { templatesRoot } from '../../paths.js';
import { message, regressionList } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runRegression(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);
  const sub = args[0] ?? 'list';

  switch (sub) {
    case 'create': {
      const bugId = valueAfter(args, '--bug');
      if (!bugId) return message('error', 'Usage: /regression create --bug <id> [--title <title>]');
      const title = valueAfter(args, '--title') ?? `Regression check for ${bugId}`;
      const record = await createRecord(root, config, 'reg', title);
      const content = await renderTemplate(templatesRoot(), 'reg', {
        id: record.id,
        title: record.title,
        created_at: record.created_at,
        bug_id: bugId,
      });
      await mkdir(recordDir(root, config, 'reg'), { recursive: true });
      await writeFile(recordPath(root, config, record.id, 'reg'), content, 'utf-8');
      return message('success', `Created ${record.id}: ${title}`);
    }
    case 'run': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /regression run <id>');
      const loaded = await loadRegression(root, config, id.toUpperCase());
      const result = await coreRunRegression(root, config, loaded.record);
      await saveResult(root, loaded.record.id, result);
      return message(
        result.status === 'pass' ? 'success' : 'error',
        `${result.regId}: ${result.status.toUpperCase()}`,
      );
    }
    case 'list': {
      const bugArg = valueAfter(args, '--bug');
      const moduleArg = valueAfter(args, '--module');
      let records: RegressionRecord[];
      if (bugArg) records = await listRegressionsByBug(root, config, bugArg);
      else if (moduleArg) records = await listRegressionsByModule(root, config, moduleArg);
      else records = await listRegressions(root, config);
      return regressionList(records);
    }
    case 'status': {
      const id = valueAfter(args, '--id');
      if (!id) return message('error', 'Usage: /regression status --id <id>');
      const status = await getRegressionStatus(root, id.toUpperCase());
      if (!status) return message('warn', `${id.toUpperCase()} has not been run yet.`);
      return message(
        status.lastRun?.status === 'pass' ? 'success' : 'error',
        `${id.toUpperCase()} last run: ${status.lastRun?.status ?? 'never run'}`,
      );
    }
    default:
      return message(
        'error',
        `Unknown regression subcommand: ${sub}. Use: create, run, list, status.`,
      );
  }
}

function valueAfter(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
