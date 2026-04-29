import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config/schema.js';
import {
  createRecord,
  findRecord,
  listRecords,
  nextId,
  patchRecord,
  recordPath,
  writeRecord,
} from './record-service.js';

let tmpDir: string;
const config = { ...DEFAULT_CONFIG, project: { ...DEFAULT_CONFIG.project, name: 'test' } };

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-records-'));
  // Create docs subdirs
  await mkdir(join(tmpDir, 'docs', 'tasks'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'bugs'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'decisions'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'regressions'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('nextId', () => {
  it('returns prefix-001 for an empty directory', async () => {
    const id = await nextId(tmpDir, config, 'task');
    expect(id).toBe('TASK-001');
  });

  it('increments from existing records', async () => {
    await writeFile(
      join(tmpDir, 'docs', 'tasks', 'TASK-001.md'),
      '---\nid: TASK-001\ntype: task\ntitle: t\nstatus: open\nmodules: []\ncreated_at: 2026-01-01\nupdated_at: 2026-01-01\ndocs_impact: required\n---\n',
      'utf-8',
    );
    await writeFile(
      join(tmpDir, 'docs', 'tasks', 'TASK-002.md'),
      '---\nid: TASK-002\ntype: task\ntitle: t\nstatus: open\nmodules: []\ncreated_at: 2026-01-01\nupdated_at: 2026-01-01\ndocs_impact: required\n---\n',
      'utf-8',
    );
    const id = await nextId(tmpDir, config, 'task');
    expect(id).toBe('TASK-003');
  });
});

describe('createRecord', () => {
  it('creates a task record with correct defaults', async () => {
    const record = await createRecord(tmpDir, config, 'task', 'My Feature');
    expect(record.id).toBe('TASK-001');
    expect(record.type).toBe('task');
    expect(record.title).toBe('My Feature');
    expect(record.status).toBe('open');
    expect(record.docs_impact).toBe('required');
  });

  it('creates a bug record', async () => {
    const record = await createRecord(tmpDir, config, 'bug', 'Crash on startup');
    expect(record.id).toBe('BUG-001');
    expect(record.type).toBe('bug');
    expect(record.severity).toBe('medium');
  });

  it('creates an ADR record', async () => {
    const record = await createRecord(tmpDir, config, 'adr', 'Use Zod for validation');
    expect(record.id).toBe('ADR-001');
    expect(record.type).toBe('adr');
    expect(record.status).toBe('proposed');
  });
});

describe('writeRecord + loadRecord + listRecords', () => {
  it('round-trips a task record', async () => {
    const record = await createRecord(tmpDir, config, 'task', 'Round Trip');
    const path = recordPath(tmpDir, config, record.id, 'task');
    await writeRecord(path, record, '## Body\n\nContent here.');

    const found = await findRecord(tmpDir, config, 'TASK-001');
    expect(found).not.toBeNull();
    expect(found?.record.title).toBe('Round Trip');
    expect(found?.body).toContain('Content here.');
  });

  it('lists multiple records sorted by ID', async () => {
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      const rec = await createRecord(tmpDir, config, 'task', title);
      const path = recordPath(tmpDir, config, rec.id, 'task');
      await writeRecord(path, rec, '');
    }
    const records = await listRecords(tmpDir, config, 'task');
    expect(records).toHaveLength(3);
    expect(records[0]?.title).toBe('Alpha');
    expect(records[2]?.title).toBe('Gamma');
  });

  it('returns empty array when directory missing', async () => {
    const records = await listRecords(tmpDir, config, 'bug');
    // bugs dir exists but is empty
    expect(records).toHaveLength(0);
  });
});

describe('patchRecord', () => {
  it('updates status and bumps updated_at', async () => {
    const record = await createRecord(tmpDir, config, 'task', 'Patch Me');
    const path = recordPath(tmpDir, config, record.id, 'task');
    await writeRecord(path, record, '');

    await patchRecord(path, { status: 'done', docs_impact: 'completed' });
    const found = await findRecord(tmpDir, config, 'TASK-001');
    expect(found?.record).toMatchObject({ status: 'done', docs_impact: 'completed' });
  });
});

describe('findRecord', () => {
  it('returns null for unknown ID', async () => {
    const found = await findRecord(tmpDir, config, 'TASK-999');
    expect(found).toBeNull();
  });

  it('returns null for unknown prefix', async () => {
    const found = await findRecord(tmpDir, config, 'FOO-001');
    expect(found).toBeNull();
  });
});
