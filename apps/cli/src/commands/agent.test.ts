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
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-agent-'));
  await mkdir(join(tmpDir, 'docs', 'tasks'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'bugs'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'decisions'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'regressions'), { recursive: true });
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

describe('agent scenario: user prompt creates a new task', () => {
  it('creates a task from a loose user request, builds context, runs checks, and closes the loop', async () => {
    await initGitRepo();
    await writeDocsMap({
      auth: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'] },
    });
    await git('add', '.');
    await git('commit', '-m', 'initial');

    // 1. Agent creates a task with --json
    const create = await pmem(
      'task',
      'create',
      'Add registration form',
      '--module',
      'auth',
      '--json',
    );
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout);
    expect(created.status).toBe('ok');
    expect(created.record.id).toBe('TASK-001');
    expect(created.record.modules).toContain('auth');

    // 2. Agent reads the task back with --json
    const show = await pmem('task', 'show', 'TASK-001', '--json');
    expect(show.code).toBe(0);
    const shown = JSON.parse(show.stdout);
    expect(shown.record.id).toBe('TASK-001');
    expect(shown.record.title).toBe('Add registration form');
    expect(shown.body).toContain('Add registration form');

    // 3. Agent marks task in progress
    const update = await pmem('task', 'update', 'TASK-001', '--status', 'in_progress', '--json');
    expect(update.code).toBe(0);
    const updated = JSON.parse(update.stdout);
    expect(updated.record.status).toBe('in_progress');

    // 4. Agent creates a regression check for the task
    const reg = await pmem('regression', 'create', '--task', 'TASK-001', '--json');
    expect(reg.code).toBe(0);
    const regCreated = JSON.parse(reg.stdout);
    expect(regCreated.record.id).toBe('REG-001');
    expect(regCreated.record.related.tasks).toContain('TASK-001');

    // 5. Agent runs checks with --records --json (single JSON object)
    const check = await pmem('check', '--records', '--json');
    expect(check.code).toBe(0);
    const checkResult = JSON.parse(check.stdout);
    expect(checkResult).toHaveProperty('changedFiles');
    expect(checkResult).toHaveProperty('affected');
    expect(checkResult.pending_docs_impact).toBeDefined();
    expect(checkResult.pending_docs_impact.length).toBeGreaterThan(0);
    expect(checkResult.pending_docs_impact[0].id).toBe('TASK-001');

    // 6. Agent updates the task with implementation notes
    const append = await pmem(
      'task',
      'update',
      'TASK-001',
      '--append',
      'Implemented registration form. All checks passed.',
      '--json',
    );
    expect(append.code).toBe(0);
    expect(JSON.parse(append.stdout).status).toBe('ok');

    // 7. Agent closes the task
    const close = await pmem('task', 'close', 'TASK-001', '--json');
    expect(close.code).toBe(0);
    const closed = JSON.parse(close.stdout);
    expect(closed.record.status).toBe('done');
    expect(closed.record.docs_impact).toBe('completed');

    // 8. Verify task list shows the closed task
    const list = await pmem('task', 'list', '--json');
    expect(list.code).toBe(0);
    const listed = JSON.parse(list.stdout);
    expect(listed.records.length).toBeGreaterThanOrEqual(1);
    const task = listed.records.find((r: { id: string }) => r.id === 'TASK-001');
    expect(task.status).toBe('done');
  }, 120_000);
});

describe('agent scenario: imported external issue drives implementation', () => {
  it('imports a Jira issue as a task, reads context, verifies, and updates', async () => {
    await initGitRepo();
    await writeDocsMap({
      api: { code: ['src/api/**'], docs: ['docs/modules/api/overview.md'] },
    });
    await git('add', '.');
    await git('commit', '-m', 'initial');

    // 1. Agent creates a task from an external issue with metadata
    const create = await pmem(
      'task',
      'create',
      'Implement rate limiting',
      '--module',
      'api',
      '--source',
      'jira',
      '--external-id',
      'PROJ-123',
      '--external-url',
      'https://jira.example/PROJ-123',
      '--json',
    );
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout);
    expect(created.record.id).toBe('TASK-001');
    expect(created.record.source).toBe('jira');
    expect(created.record.external_id).toBe('PROJ-123');
    expect(created.record.external_url).toBe('https://jira.example/PROJ-123');

    // 2. Agent reads the imported task
    const show = await pmem('task', 'show', 'TASK-001', '--json');
    const shown = JSON.parse(show.stdout);
    expect(shown.record.source).toBe('jira');
    expect(shown.record.external_id).toBe('PROJ-123');

    // 3. Agent creates a bug for a related issue
    const bugCreate = await pmem(
      'bug',
      'create',
      'API returns 500 on burst requests',
      '--severity',
      'high',
      '--module',
      'api',
      '--source',
      'github',
      '--external-id',
      'issue-456',
      '--json',
    );
    expect(bugCreate.code).toBe(0);
    const bug = JSON.parse(bugCreate.stdout);
    expect(bug.record.id).toBe('BUG-001');
    expect(bug.record.source).toBe('github');
    expect(bug.record.external_id).toBe('issue-456');

    // 4. Agent creates a regression check for the bug
    const reg = await pmem('regression', 'create', '--bug', 'BUG-001', '--json');
    expect(reg.code).toBe(0);
    const regCreated = JSON.parse(reg.stdout);
    expect(regCreated.record.related.bugs).toContain('BUG-001');

    // 5. Agent appends investigation notes to the bug
    const bugAppend = await pmem(
      'bug',
      'append',
      'BUG-001',
      '--note',
      'Root cause: missing rate limiter middleware.',
      '--json',
    );
    expect(bugAppend.code).toBe(0);
    expect(JSON.parse(bugAppend.stdout).status).toBe('ok');

    // 6. Agent updates bug status and task status
    const bugUpdate = await pmem('bug', 'update', 'BUG-001', '--status', 'fixed', '--json');
    expect(bugUpdate.code).toBe(0);
    expect(JSON.parse(bugUpdate.stdout).record.status).toBe('fixed');

    const taskUpdate = await pmem('task', 'update', 'TASK-001', '--status', 'done', '--json');
    expect(taskUpdate.code).toBe(0);
    expect(JSON.parse(taskUpdate.stdout).record.status).toBe('done');

    // 7. Agent runs check --json to confirm status
    const check = await pmem('check', '--json');
    expect(check.code).toBe(0);
    const checkResult = JSON.parse(check.stdout);
    expect(checkResult.status).toBe('ok');
  }, 120_000);
});
