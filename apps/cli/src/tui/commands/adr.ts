import { mkdir, writeFile } from 'node:fs/promises';
import {
  type AdrRecord,
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

export async function runAdr(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);
  const sub = args[0] ?? 'list';

  switch (sub) {
    case 'create': {
      const title = args.slice(1).join(' ');
      if (!title) return message('error', 'Usage: /adr create <title>');
      const record = await createRecord(root, config, 'adr', title);
      const content = await renderTemplate(templatesRoot(), 'adr', {
        id: record.id,
        title: record.title,
        created_at: record.created_at,
      });
      await mkdir(recordDir(root, config, 'adr'), { recursive: true });
      await writeFile(recordPath(root, config, record.id, 'adr'), content, 'utf-8');
      return message('success', `Created ${record.id}: ${title}`);
    }
    case 'list': {
      const records = (await listRecords(root, config, 'adr')) as AdrRecord[];
      return recordList(records, 'ADRs');
    }
    case 'show': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /adr show <id>');
      const found = await findRecord(root, config, id.toUpperCase());
      if (!found) return message('error', `Record ${id} not found.`);
      return recordDetail(found.record, found.body);
    }
    case 'accept': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /adr accept <id>');
      const found = await findRecord(root, config, id.toUpperCase());
      if (!found) return message('error', `Record ${id} not found.`);
      await patchRecord(found.filePath, { status: 'accepted' });
      return message('success', `${id.toUpperCase()} accepted.`);
    }
    default:
      return message('error', `Unknown adr subcommand: ${sub}. Use: create, list, show, accept.`);
  }
}
