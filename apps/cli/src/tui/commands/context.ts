import {
  type ContextOptions,
  buildContext,
  listContextPacks,
  loadConfig,
  loadDocsMap,
} from '@pmem/core';
import { contextOutput, message } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runContext(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);
  const sub = args[0] ?? 'list-packs';

  switch (sub) {
    case 'build': {
      const docsMap = await loadDocsMap(root, config);
      const opts: ContextOptions = { root };
      const taskVal = valueAfter(args, '--task');
      const bugVal = valueAfter(args, '--bug');
      const filesVal = valueAfter(args, '--files');
      const packVal = valueAfter(args, '--pack');
      if (taskVal !== undefined) opts.task = taskVal;
      if (bugVal !== undefined) opts.bug = bugVal;
      if (filesVal !== undefined) opts.files = [filesVal];
      if (packVal !== undefined) opts.pack = packVal;
      if (args.includes('--diff')) opts.diff = true;
      if (args.includes('--include-regressions')) opts.includeRegressions = true;
      return contextOutput(await buildContext(root, config, docsMap, opts));
    }
    case 'list-packs': {
      const packs = await listContextPacks(root, config);
      if (packs.length === 0) return message('info', 'No context packs found.');
      return [
        { text: 'Available context packs:', style: 'title' },
        ...packs.map((pack) => ({ text: `  ${pack}`, style: 'dim' as const })),
      ];
    }
    default:
      return message('error', `Unknown context subcommand: ${sub}. Use: build, list-packs.`);
  }
}

function valueAfter(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}
