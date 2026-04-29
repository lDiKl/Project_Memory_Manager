import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);

// Path to the compiled CLI entry (built before tests run in CI).
// During local dev, we use `tsx` to run the source directly.
const CLI_BIN = join(import.meta.dirname, '../..', 'src', 'index.ts');
const TSX = 'tsx';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-init-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function pmem(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await exec(TSX, [CLI_BIN, ...args], { cwd: tmpDir });
  return { stdout, stderr };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('pmem init', () => {
  it('creates .project-memory.yml', async () => {
    await pmem('init', '--name', 'test-project');
    expect(await fileExists(join(tmpDir, '.project-memory.yml'))).toBe(true);
  });

  it('creates docs-map.yml', async () => {
    await pmem('init', '--name', 'test-project');
    expect(await fileExists(join(tmpDir, 'docs-map.yml'))).toBe(true);
  });

  it('creates docs/ structure', async () => {
    await pmem('init', '--name', 'test-project');
    for (const dir of [
      'project',
      'modules',
      'tasks',
      'bugs',
      'decisions',
      'agents',
      'llm',
      'knowledge',
    ]) {
      expect(await fileExists(join(tmpDir, 'docs', dir))).toBe(true);
    }
    expect(await fileExists(join(tmpDir, 'AGENTS.md'))).toBe(true);
  });

  it('does not overwrite existing config without --force', async () => {
    await pmem('init', '--name', 'first-run');
    const original = await readFile(join(tmpDir, '.project-memory.yml'), 'utf-8');
    await pmem('init', '--name', 'second-run');
    const after = await readFile(join(tmpDir, '.project-memory.yml'), 'utf-8');
    expect(after).toBe(original);
  });

  it('overwrites config with --force', async () => {
    await pmem('init', '--name', 'first-run');
    await pmem('init', '--name', 'second-run', '--force');
    const content = await readFile(join(tmpDir, '.project-memory.yml'), 'utf-8');
    expect(content).toContain('second-run');
  });
});
