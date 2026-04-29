import { mkdir, writeFile } from 'node:fs/promises';
import {
  type TaskRecord,
  createRecord,
  findRecord,
  listRecords,
  loadConfig,
  patchRecord,
  recordDir,
  recordPath,
  renderTemplate,
} from '@pmem/core';
import { templatesRoot } from '../../paths.js';
import { message, recordDetail, recordList } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runTask(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);
  const sub = args[0] ?? 'list';

  switch (sub) {
    case 'create': {
      const title = args.slice(1).join(' ');
      if (!title) return message('error', 'Usage: /task create <title>');
      const record = await createRecord(root, config, 'task', title);
      const content = await renderTemplate(templatesRoot(), 'task', {
        id: record.id,
        title: record.title,
        created_at: record.created_at,
      });
      await mkdir(recordDir(root, config, 'task'), { recursive: true });
      await writeFile(recordPath(root, config, record.id, 'task'), content, 'utf-8');
      return message('success', `Created ${record.id}: ${title}`);
    }
    case 'list': {
      const records = (await listRecords(root, config, 'task')) as TaskRecord[];
      const statusIdx = args.indexOf('--status');
      const filtered =
        statusIdx >= 0
          ? records.filter((record) => record.status === args[statusIdx + 1])
          : records;
      return recordList(filtered, 'Tasks');
    }
    case 'show': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /task show <id>');
      const found = await findRecord(root, config, id.toUpperCase());
      if (!found) return message('error', `Record ${id} not found.`);
      return recordDetail(found.record, found.body);
    }
    case 'close': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /task close <id>');
      const found = await findRecord(root, config, id.toUpperCase());
      if (!found) return message('error', `Record ${id} not found.`);
      await patchRecord(found.filePath, { status: 'done', docs_impact: 'completed' });
      return message('success', `${id.toUpperCase()} closed.`);
    }
    default:
      return message('error', `Unknown task subcommand: ${sub}. Use: create, list, show, close.`);
  }
}
