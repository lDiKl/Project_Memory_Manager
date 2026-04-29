import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dump as dumpYaml } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PmemError } from '../errors.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_DOCS_MAP,
  findProjectRoot,
  loadConfig,
  loadDocsMap,
  writeConfig,
  writeDocsMap,
} from './config-service.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── findProjectRoot ───────────────────────────────────────────────────────────

describe('findProjectRoot', () => {
  it('returns cwd when no .git or .project-memory.yml found', async () => {
    const result = await findProjectRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });

  it('finds root by .git directory', async () => {
    await mkdir(join(tmpDir, '.git'));
    const nested = join(tmpDir, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });
    const result = await findProjectRoot(nested);
    expect(result).toBe(tmpDir);
  });

  it('finds root by .project-memory.yml', async () => {
    await writeFile(join(tmpDir, '.project-memory.yml'), 'version: 1\nproject:\n  name: Test\n');
    const result = await findProjectRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });
});

// ── loadConfig ────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('returns DEFAULT_CONFIG when no file exists', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.project.docs_root).toBe('docs');
    expect(config.records.task_prefix).toBe('TASK');
  });

  it('loads and validates a valid config file', async () => {
    const data = {
      version: 1,
      project: { name: 'My App', docs_root: 'documentation', default_branch: 'develop' },
    };
    await writeFile(join(tmpDir, '.project-memory.yml'), dumpYaml(data), 'utf-8');
    const config = await loadConfig(tmpDir);
    expect(config.project.name).toBe('My App');
    expect(config.project.docs_root).toBe('documentation');
    expect(config.project.default_branch).toBe('develop');
    // Defaults should be filled in
    expect(config.records.task_prefix).toBe('TASK');
  });

  it('throws E_CONFIG_INVALID for a malformed config', async () => {
    await writeFile(
      join(tmpDir, '.project-memory.yml'),
      'version: 999\nproject:\n  name: Bad\n',
      'utf-8',
    );
    await expect(loadConfig(tmpDir)).rejects.toThrow(PmemError);
    await expect(loadConfig(tmpDir)).rejects.toMatchObject({ code: 'E_CONFIG_INVALID' });
  });
});

// ── writeConfig / round-trip ──────────────────────────────────────────────────

describe('writeConfig', () => {
  it('writes a config and reloads it identically', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      project: { ...DEFAULT_CONFIG.project, name: 'Round Trip' },
    };
    await writeConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);
    expect(loaded.project.name).toBe('Round Trip');
  });
});

// ── loadDocsMap ───────────────────────────────────────────────────────────────

describe('loadDocsMap', () => {
  it('throws E_DOCS_MAP_MISSING when file does not exist', async () => {
    const config = { ...DEFAULT_CONFIG };
    await expect(loadDocsMap(tmpDir, config)).rejects.toMatchObject({
      code: 'E_DOCS_MAP_MISSING',
    });
  });

  it('loads a valid docs-map.yml', async () => {
    const map = {
      modules: {
        auth: {
          code: ['backend/auth/**'],
          docs: ['docs/modules/auth/overview.md'],
        },
      },
    };
    await writeFile(join(tmpDir, 'docs-map.yml'), dumpYaml(map), 'utf-8');
    const config = { ...DEFAULT_CONFIG };
    const loaded = await loadDocsMap(tmpDir, config);
    expect(loaded.modules.auth?.code).toEqual(['backend/auth/**']);
  });

  it('round-trips DEFAULT_DOCS_MAP', async () => {
    const config = { ...DEFAULT_CONFIG };
    await writeDocsMap(tmpDir, config, DEFAULT_DOCS_MAP);
    const loaded = await loadDocsMap(tmpDir, config);
    expect(Object.keys(loaded.modules)).toContain('example');
  });
});
