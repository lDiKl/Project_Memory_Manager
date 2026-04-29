import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { ProjectMemoryConfig } from '../config/schema.js';
import { PmemError } from '../errors.js';
import {
  type AdrRecord,
  AdrRecordSchema,
  type AnyRecord,
  AnyRecordSchema,
  type BugRecord,
  BugRecordSchema,
  type RecordType,
  type RegressionRecord,
  RegressionRecordSchema,
  type TaskRecord,
  TaskRecordSchema,
} from './record-schema.js';

const RECORD_DIRS: Record<RecordType, string> = {
  task: 'tasks',
  bug: 'bugs',
  adr: 'decisions',
  reg: 'regressions',
};

const RECORD_PREFIXES: Record<RecordType, keyof ProjectMemoryConfig['records']> = {
  task: 'task_prefix',
  bug: 'bug_prefix',
  adr: 'adr_prefix',
  reg: 'reg_prefix',
};

// ── Path helpers ──────────────────────────────────────────────────────────────

export function recordDir(root: string, config: ProjectMemoryConfig, type: RecordType): string {
  return join(root, config.project.docs_root, RECORD_DIRS[type]);
}

export function recordPath(
  root: string,
  config: ProjectMemoryConfig,
  id: string,
  type: RecordType,
): string {
  return join(recordDir(root, config, type), `${id}.md`);
}

// ── ID generation ─────────────────────────────────────────────────────────────

export async function nextId(
  root: string,
  config: ProjectMemoryConfig,
  type: RecordType,
): Promise<string> {
  const prefix = config.records[RECORD_PREFIXES[type]];
  const dir = recordDir(root, config, type);

  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    // directory doesn't exist yet → start at 001
  }

  const nums = files
    .map((f) => {
      const m = f.match(/^[A-Z]+-(\d+)\.md$/);
      return m ? Number.parseInt(m[1] ?? '0', 10) : 0;
    })
    .filter((n) => n > 0);

  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// ── Parse a record file ───────────────────────────────────────────────────────

export async function loadRecord(filePath: string): Promise<{ record: AnyRecord; body: string }> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    throw new PmemError('E_DOCS_MAP_MISSING', `Record file not found: ${filePath}`);
  }

  let data: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter(raw);
    data = parsed.data;
    content = parsed.content;
  } catch (yamlErr) {
    const hint =
      'YAML parse error in frontmatter. If a value contains special characters like {, }, :, or #, wrap it in quotes. Example: command: \'echo {"valid": true}\'';
    throw new PmemError(
      'E_CONFIG_INVALID',
      `Failed to parse ${filePath}: ${yamlErr instanceof Error ? yamlErr.message : String(yamlErr)}. ${hint}`,
    );
  }

  const validated = AnyRecordSchema.safeParse(data);
  if (!validated.success) {
    throw new PmemError(
      'E_CONFIG_INVALID',
      `Invalid record frontmatter in ${filePath}: ${validated.error.message}`,
    );
  }
  return { record: validated.data, body: content.trim() };
}

// ── List records ──────────────────────────────────────────────────────────────

export async function listRecords(
  root: string,
  config: ProjectMemoryConfig,
  type: RecordType,
): Promise<AnyRecord[]> {
  const dir = recordDir(root, config, type);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
  const records: AnyRecord[] = [];

  for (const f of mdFiles) {
    try {
      const { record } = await loadRecord(join(dir, f));
      records.push(record);
    } catch {
      // skip malformed records
    }
  }

  return records;
}

// ── Write a record ────────────────────────────────────────────────────────────

export async function writeRecord(
  filePath: string,
  record: AnyRecord,
  body: string,
): Promise<void> {
  const content = matter.stringify(body, record as Record<string, unknown>);
  await writeFile(filePath, content, 'utf-8');
}

// ── Create a new record ───────────────────────────────────────────────────────

export async function createRecord(
  root: string,
  config: ProjectMemoryConfig,
  type: 'task',
  title: string,
): Promise<TaskRecord>;
export async function createRecord(
  root: string,
  config: ProjectMemoryConfig,
  type: 'bug',
  title: string,
): Promise<BugRecord>;
export async function createRecord(
  root: string,
  config: ProjectMemoryConfig,
  type: 'adr',
  title: string,
): Promise<AdrRecord>;
export async function createRecord(
  root: string,
  config: ProjectMemoryConfig,
  type: 'reg',
  title: string,
): Promise<RegressionRecord>;
export async function createRecord(
  root: string,
  config: ProjectMemoryConfig,
  type: RecordType,
  title: string,
): Promise<AnyRecord> {
  const id = await nextId(root, config, type);
  const now = new Date().toISOString().slice(0, 10);

  let record: AnyRecord;
  if (type === 'task') {
    record = TaskRecordSchema.parse({ id, type, title, created_at: now, updated_at: now });
  } else if (type === 'bug') {
    record = BugRecordSchema.parse({ id, type, title, created_at: now, updated_at: now });
  } else if (type === 'reg') {
    record = RegressionRecordSchema.parse({
      id,
      type,
      title,
      created_at: now,
      updated_at: now,
      check: { type: 'manual' },
    });
  } else {
    record = AdrRecordSchema.parse({ id, type, title, created_at: now, updated_at: now });
  }

  return record;
}

// ── Update frontmatter fields ─────────────────────────────────────────────────

export async function patchRecord(
  filePath: string,
  patches: Partial<Record<string, unknown>>,
): Promise<AnyRecord> {
  const raw = await readFile(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const updated = { ...data, ...patches, updated_at: new Date().toISOString().slice(0, 10) };
  const parsed = AnyRecordSchema.safeParse(updated);
  if (!parsed.success) {
    throw new PmemError('E_CONFIG_INVALID', `Invalid record after patch: ${parsed.error.message}`);
  }
  await writeFile(filePath, matter.stringify(content, updated), 'utf-8');
  return parsed.data;
}

// ── Find a record by ID (searches all types) ──────────────────────────────────

export async function findRecord(
  root: string,
  config: ProjectMemoryConfig,
  id: string,
): Promise<{ record: AnyRecord; body: string; filePath: string } | null> {
  const type = inferTypeFromId(id, config);
  if (!type) return null;

  const path = recordPath(root, config, id, type);
  try {
    await access(path);
  } catch {
    return null;
  }

  const { record, body } = await loadRecord(path);
  return { record, body, filePath: path };
}

function inferTypeFromId(id: string, config: ProjectMemoryConfig): RecordType | null {
  const prefix = id.split('-')[0]?.toUpperCase() ?? '';
  if (prefix === config.records.task_prefix) return 'task';
  if (prefix === config.records.bug_prefix) return 'bug';
  if (prefix === config.records.adr_prefix) return 'adr';
  if (prefix === config.records.reg_prefix) return 'reg';
  return null;
}
