import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const CLI_BIN = join(import.meta.dirname, '../..', 'src', 'index.ts');
const TSX = join(import.meta.dirname, '../../../../node_modules/.bin/tsx');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-records-cli-'));
  await mkdir(join(tmpDir, 'docs', 'tasks'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'bugs'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'decisions'), { recursive: true });
  // Minimal config
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    join(tmpDir, '.project-memory.yml'),
    'version: 1\nproject:\n  name: test\n  docs_root: docs\n',
    'utf-8',
  );
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

describe('pmem task', () => {
  it('creates a task and lists it', async () => {
    const create = await pmem('task', 'create', 'Add dark mode');
    expect(create.code).toBe(0);
    expect(create.stdout).toContain('TASK-001');

    const list = await pmem('task', 'list');
    expect(list.code).toBe(0);
    expect(list.stdout).toContain('TASK-001');
    expect(list.stdout).toContain('Add dark mode');
  });

  it('shows a task', async () => {
    await pmem('task', 'create', 'Fix login');
    const show = await pmem('task', 'show', 'TASK-001');
    expect(show.code).toBe(0);
    expect(show.stdout).toContain('Fix login');
    expect(show.stdout).toContain('open');
  });

  it('closes a task', async () => {
    await pmem('task', 'create', 'Close me');
    const close = await pmem('task', 'close', 'TASK-001');
    expect(close.code).toBe(0);

    const show = await pmem('task', 'show', 'TASK-001');
    expect(show.stdout).toContain('done');
  });

  it('increments IDs correctly', async () => {
    await pmem('task', 'create', 'First');
    const second = await pmem('task', 'create', 'Second');
    expect(second.stdout).toContain('TASK-002');
  });

  it('creates and updates a task with JSON agent metadata', async () => {
    const create = await pmem(
      'task',
      'create',
      'Add registration form',
      '--module',
      'auth',
      'frontend',
      '--source',
      'jira',
      '--external-id',
      'ABC-42',
      '--json',
    );
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout);
    expect(created.record.id).toBe('TASK-001');
    expect(created.record.modules).toEqual(['auth', 'frontend']);
    expect(created.record.external_id).toBe('ABC-42');

    const update = await pmem(
      'task',
      'update',
      'TASK-001',
      '--status',
      'in_progress',
      '--append',
      'Started implementation.',
      '--json',
    );
    expect(update.code).toBe(0);
    const updated = JSON.parse(update.stdout);
    expect(updated.record.status).toBe('in_progress');

    const show = await pmem('task', 'show', 'TASK-001', '--json');
    const shown = JSON.parse(show.stdout);
    expect(shown.body).toContain('Started implementation.');
  });
});

describe('pmem bug', () => {
  it('creates a bug', async () => {
    const { stdout, code } = await pmem('bug', 'create', 'Crash on startup');
    expect(code).toBe(0);
    expect(stdout).toContain('BUG-001');
  });

  it('lists bugs', async () => {
    await pmem('bug', 'create', 'Bug A');
    await pmem('bug', 'create', 'Bug B');
    const list = await pmem('bug', 'list');
    expect(list.stdout).toContain('BUG-001');
    expect(list.stdout).toContain('BUG-002');
  });

  it('appends an attempt to a bug', async () => {
    await pmem('bug', 'create', 'Flaky test');
    const append = await pmem('bug', 'append', 'BUG-001');
    expect(append.code).toBe(0);
    expect(append.stdout).toContain('attempt');
  });

  it('creates and appends to a bug with JSON output', async () => {
    const create = await pmem(
      'bug',
      'create',
      'Login crashes',
      '--severity',
      'high',
      '--source',
      'manual',
      '--json',
    );
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout);
    expect(created.record.severity).toBe('high');
    expect(created.record.source).toBe('manual');

    const append = await pmem(
      'bug',
      'append',
      'BUG-001',
      '--note',
      'Captured reproduction.',
      '--json',
    );
    expect(append.code).toBe(0);
    const appended = JSON.parse(append.stdout);
    expect(appended.status).toBe('ok');
  });
});

describe('pmem adr', () => {
  it('creates an ADR', async () => {
    const { stdout, code } = await pmem('adr', 'create', 'Use Zod for validation');
    expect(code).toBe(0);
    expect(stdout).toContain('ADR-001');
  });

  it('lists ADRs', async () => {
    await pmem('adr', 'create', 'Decision One');
    const list = await pmem('adr', 'list');
    expect(list.stdout).toContain('ADR-001');
    expect(list.stdout).toContain('Decision One');
  });

  it('accepts an ADR', async () => {
    await pmem('adr', 'create', 'Something');
    const accept = await pmem('adr', 'accept', 'ADR-001');
    expect(accept.code).toBe(0);

    const show = await pmem('adr', 'show', 'ADR-001');
    expect(show.stdout).toContain('accepted');
  });
});
