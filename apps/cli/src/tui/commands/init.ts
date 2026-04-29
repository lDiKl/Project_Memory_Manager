import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DEFAULT_CONFIG, DEFAULT_DOCS_MAP, type ProjectMemoryConfig, writeYaml } from '@pmem/core';
import { message } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runInit(args: string[], context: TuiContext): Promise<TuiBlock> {
  const rootArg = valueAfter(args, '--root');
  const root = rootArg ? resolve(rootArg) : context.projectRoot;
  const force = args.includes('--force');
  const nameArg = valueAfter(args, '--name');
  const projectName = nameArg ?? root.split(/[\\/]/).filter(Boolean).pop() ?? 'my-project';
  const configPath = join(root, '.project-memory.yml');

  if ((await fileExists(configPath)) && !force) {
    return message('warn', 'PMEM is already initialized. Use /init --force to overwrite.');
  }

  const config: ProjectMemoryConfig = {
    ...DEFAULT_CONFIG,
    project: { ...DEFAULT_CONFIG.project, name: projectName },
  };
  await writeYaml(configPath, config);

  const docsMapPath = join(root, 'docs-map.yml');
  if (!(await fileExists(docsMapPath)) || force) await writeYaml(docsMapPath, DEFAULT_DOCS_MAP);

  const docsRoot = join(root, config.project.docs_root);
  for (const dir of [
    'project',
    'modules',
    'tasks',
    'bugs',
    'decisions',
    'agents',
    'llm',
    'knowledge',
    'context',
    join('llm', 'context-packs'),
  ]) {
    await mkdir(join(docsRoot, dir), { recursive: true });
  }

  return message('success', `PMEM initialized in ${root}. Next: run /scan --write.`);
}

function valueAfter(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
