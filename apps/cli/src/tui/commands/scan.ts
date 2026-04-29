import {
  detectModules,
  loadConfig,
  loadDocsMap,
  mergeDetectedIntoDocsMap,
  writeDocsMap,
} from '@pmem/core';
import { line, message } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runScan(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);
  const detected = await detectModules(root);

  if (detected.length === 0) return message('info', 'No modules detected.');

  if (args.includes('--write') || args.includes('-y')) {
    try {
      const docsMap = await loadDocsMap(root, config);
      await writeDocsMap(root, config, mergeDetectedIntoDocsMap(docsMap, detected));
      return message('success', `Detected ${detected.length} module(s) and updated docs-map.yml.`);
    } catch {
      return message('warn', 'docs-map.yml not found. Run /init first, then /scan --write.');
    }
  }

  const lines: TuiBlock = [line(`Detected ${detected.length} module(s):`, 'title')];
  for (const module of detected) {
    lines.push(line(`  ${module.name}: ${module.entry.description ?? 'no description'}`, 'dim'));
  }
  lines.push(line('Use /scan --write to update docs-map.yml.', 'info'));
  return lines;
}
