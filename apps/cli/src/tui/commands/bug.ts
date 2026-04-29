import { mkdir, writeFile } from 'node:fs/promises';
import {
  type BugRecord,
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

export async function runBug(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);
  const sub = args[0] ?? 'list';

  switch (sub) {
    case 'create': {
      const rest = args.slice(1);
      const sevIdx = rest.indexOf('--severity');
      const modIdx = rest.indexOf('--module');
      const severity = sevIdx >= 0 && rest[sevIdx + 1] ? rest[sevIdx + 1] : undefined;
      const module = modIdx >= 0 && rest[modIdx + 1] ? rest[modIdx + 1] : undefined;
      const title = titleWithoutFlags(rest, ['--severity', '--module']);
      if (!title) {
        return message(
          'error',
          'Usage: /bug create <title> [--severity low|medium|high|critical] [--module name]',
        );
      }

      const record = await createRecord(root, config, 'bug', title);
      const content = await renderTemplate(templatesRoot(), 'bug', {
        id: record.id,
        title: record.title,
        created_at: record.created_at,
      });
      await mkdir(recordDir(root, config, 'bug'), { recursive: true });
      const path = recordPath(root, config, record.id, 'bug');
      await writeFile(path, content, 'utf-8');

      const patches: Record<string, unknown> = {};
      if (severity) patches.severity = severity;
      if (module) patches.modules = [module];
      if (Object.keys(patches).length > 0) await patchRecord(path, patches);
      return message('success', `Created ${record.id}: ${title}`);
    }
    case 'list': {
      const records = (await listRecords(root, config, 'bug')) as BugRecord[];
      return recordList(records, 'Bugs');
    }
    case 'show': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /bug show <id>');
      const found = await findRecord(root, config, id.toUpperCase());
      if (!found) return message('error', `Record ${id} not found.`);
      return recordDetail(found.record, found.body);
    }
    case 'append': {
      const id = args[1];
      if (!id) return message('error', 'Usage: /bug append <id>');
      return message('info', `Bug append opens an editor - use CLI mode: pmem bug append ${id}`);
    }
    default:
      return message('error', `Unknown bug subcommand: ${sub}. Use: create, list, show, append.`);
  }
}

function titleWithoutFlags(args: string[], flagsWithValues: string[]): string {
  const titleParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const value = args[i] ?? '';
    if (flagsWithValues.includes(value)) {
      i++;
      continue;
    }
    titleParts.push(value);
  }
  return titleParts.join(' ');
}
