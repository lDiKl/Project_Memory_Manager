import {
  type DiffMode,
  type DocsMap,
  PmemError,
  checkDrift,
  getChangedFiles,
  loadConfig,
  loadDocsMap,
} from '@pmem/core';
import { driftReport, message } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runCheck(args: string[], context: TuiContext): Promise<TuiBlock> {
  const root = context.projectRoot;
  const config = await loadConfig(root);

  let docsMap: DocsMap;
  try {
    docsMap = await loadDocsMap(root, config);
  } catch (err) {
    if (err instanceof PmemError && err.code === 'E_DOCS_MAP_MISSING') {
      return message('warn', 'docs-map.yml not found. Run /init first.');
    }
    throw err;
  }

  const staged = args.includes('--staged');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const mode: DiffMode = base
    ? { kind: 'base', branch: base }
    : staged
      ? { kind: 'staged' }
      : { kind: 'working' };
  const changedFiles = await getChangedFiles(root, mode);

  if (changedFiles.length === 0) return message('success', 'No changed files detected.');
  return driftReport(checkDrift(changedFiles, docsMap));
}
