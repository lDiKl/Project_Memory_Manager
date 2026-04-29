import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const CLI_BIN = join(import.meta.dirname, '../..', 'src', 'index.ts');
const TSX = join(import.meta.dirname, '../../../../node_modules/.bin/tsx');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-check-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function pmem(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await exec(TSX, [CLI_BIN, ...args], { cwd: tmpDir });
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

async function git(...args: string[]): Promise<void> {
  await exec('git', args, { cwd: tmpDir });
}

async function initGitRepo(): Promise<void> {
  await git('init');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');
}

async function writeDocsMap(
  modules: Record<string, { code: string[]; docs: string[] }>,
): Promise<void> {
  const lines = ['modules:'];
  for (const [name, m] of Object.entries(modules)) {
    lines.push(`  ${name}:`);
    lines.push('    code:');
    for (const p of m.code) lines.push(`      - '${p}'`);
    lines.push('    docs:');
    for (const d of m.docs) lines.push(`      - '${d}'`);
  }
  await writeFile(join(tmpDir, 'docs-map.yml'), `${lines.join('\n')}\n`, 'utf-8');
}

async function writeConfig(): Promise<void> {
  await writeFile(
    join(tmpDir, '.project-memory.yml'),
    'version: 1\nproject:\n  name: test\n  docs_root: docs\n',
    'utf-8',
  );
}

describe('pmem check', () => {
  it('reports no changed files when working tree is clean', async () => {
    await initGitRepo();
    await writeConfig();
    await writeDocsMap({
      auth: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'] },
    });

    await git('add', '.');
    await git('commit', '-m', 'initial commit');

    const { stdout, code } = await pmem('check');
    expect(code).toBe(0);
    expect(stdout).toMatch(/no changed files/i);
  });

  it('warns when code changed but docs not updated (working tree)', async () => {
    await initGitRepo();
    await writeConfig();
    await writeDocsMap({
      auth: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'] },
    });

    await git('add', '.');
    await git('commit', '-m', 'initial commit');

    await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'auth', 'service.ts'), 'export {}', 'utf-8');

    const { stdout, code } = await pmem('check');
    expect(code).toBe(0);
    expect(stdout).toMatch(/auth/);
    expect(stdout).toMatch(/no docs updated/i);
  });

  it('exits with code 1 under --strict when docs missing', async () => {
    await initGitRepo();
    await writeConfig();
    await writeDocsMap({
      auth: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'] },
    });

    await git('add', '.');
    await git('commit', '-m', 'initial commit');

    await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'auth', 'service.ts'), 'export {}', 'utf-8');

    const { code } = await pmem('check', '--strict');
    expect(code).toBe(1);
  });

  it('outputs valid JSON with --json flag on clean repo', async () => {
    await initGitRepo();
    await writeConfig();
    await writeDocsMap({
      auth: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'] },
    });

    await git('add', '.');
    await git('commit', '-m', 'initial commit');

    const { stdout, code } = await pmem('check', '--json');
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('changedFiles');
  });

  it('detects drift with --base flag against a prior commit', async () => {
    await initGitRepo();
    await writeConfig();
    await writeDocsMap({
      auth: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'] },
    });

    await git('add', '.');
    await git('commit', '-m', 'initial commit');

    await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'auth', 'service.ts'), 'export {}', 'utf-8');
    await git('add', '.');
    await git('commit', '-m', 'add auth service');

    const { stdout, code } = await pmem('check', '--base', 'HEAD~1');
    expect(code).toBe(0);
    expect(stdout).toMatch(/auth/);
  });
});
