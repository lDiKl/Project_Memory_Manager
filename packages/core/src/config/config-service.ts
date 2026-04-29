import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dump as dumpYaml, load as parseYaml } from 'js-yaml';
import { PmemError } from '../errors.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_DOCS_MAP,
  type DocsMap,
  DocsMapSchema,
  type ProjectMemoryConfig,
  ProjectMemoryConfigSchema,
} from './schema.js';

const CONFIG_FILE = '.project-memory.yml';
const GIT_DIR = '.git';

// ─── Root discovery ───────────────────────────────────────────────────────────

export async function findProjectRoot(start?: string): Promise<string> {
  let current = resolve(start ?? process.cwd());

  while (true) {
    const hasPmem = await fileExists(join(current, CONFIG_FILE));
    const hasGit = await fileExists(join(current, GIT_DIR));

    if (hasPmem || hasGit) return current;

    const parent = resolve(join(current, '..'));
    if (parent === current) {
      // Reached filesystem root — return cwd, pmem init will create the config.
      return resolve(start ?? process.cwd());
    }
    current = parent;
  }
}

// ─── Config loading ───────────────────────────────────────────────────────────

export async function loadConfig(root: string): Promise<ProjectMemoryConfig> {
  const path = join(root, CONFIG_FILE);
  const exists = await fileExists(path);

  if (!exists) return { ...DEFAULT_CONFIG };

  const raw = await readFile(path, 'utf-8');
  const parsed = parseYaml(raw);

  const result = ProjectMemoryConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new PmemError('E_CONFIG_INVALID', `${CONFIG_FILE} is invalid:\n${result.error.message}`);
  }
  return result.data;
}

export async function writeConfig(root: string, config: ProjectMemoryConfig): Promise<void> {
  await writeYaml(join(root, CONFIG_FILE), config);
}

// ─── Docs-map loading ─────────────────────────────────────────────────────────

export async function loadDocsMap(root: string, config: ProjectMemoryConfig): Promise<DocsMap> {
  const path = join(root, config.paths.docs_map);
  const exists = await fileExists(path);

  if (!exists) {
    throw new PmemError('E_DOCS_MAP_MISSING', `docs-map.yml not found at ${path}.`);
  }

  const raw = await readFile(path, 'utf-8');
  const parsed = parseYaml(raw);

  const result = DocsMapSchema.safeParse(parsed);
  if (!result.success) {
    throw new PmemError('E_DOCS_MAP_INVALID', `docs-map.yml is invalid:\n${result.error.message}`);
  }
  return result.data;
}

export async function writeDocsMap(
  root: string,
  config: ProjectMemoryConfig,
  map: DocsMap,
): Promise<void> {
  await writeYaml(join(root, config.paths.docs_map), map);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function writeYaml(path: string, data: unknown): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const content = dumpYaml(data, { sortKeys: false, lineWidth: 120, quotingType: '"' });
  await writeFile(path, content, 'utf-8');
}

export async function readYaml(path: string): Promise<unknown> {
  const raw = await readFile(path, 'utf-8');
  return parseYaml(raw);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export { DEFAULT_CONFIG, DEFAULT_DOCS_MAP };
