import { exec } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ProjectMemoryConfig } from '../config/schema.js';
import { PmemError } from '../errors.js';
import type { RegressionRecord } from '../records/record-schema.js';

const execAsync = promisify(exec);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegressionResult {
  regId: string;
  status: 'pass' | 'fail' | 'error';
  output?: string | undefined;
  error?: string | undefined;
  timestamp: string;
}

export interface RegressionStatus {
  regId: string;
  lastRun?: RegressionResult | undefined;
  runCount: number;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

export function regressionDir(root: string, config: ProjectMemoryConfig): string {
  return join(root, config.project.docs_root, 'regressions');
}

export function regressionPath(root: string, config: ProjectMemoryConfig, id: string): string {
  return join(regressionDir(root, config), `${id}.md`);
}

export function resultsDir(root: string, regId: string): string {
  return join(root, '.pmem', 'regression-results', regId);
}

// ── Load REG records ──────────────────────────────────────────────────────────

export async function loadRegression(
  root: string,
  config: ProjectMemoryConfig,
  id: string,
): Promise<{ record: RegressionRecord; body: string; filePath: string }> {
  const path = regressionPath(root, config, id);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    throw new PmemError('E_RECORD_NOT_FOUND', `Regression record not found: ${id}`);
  }

  const matter = await import('gray-matter');
  let data: Record<string, unknown>;
  let content: string;
  try {
    const parsed = matter.default(raw);
    data = parsed.data;
    content = parsed.content;
  } catch (yamlErr) {
    const hint =
      'YAML parse error in frontmatter. If a value contains special characters like {, }, :, or #, wrap it in quotes. Example: command: \'echo {"valid": true}\'';
    throw new PmemError(
      'E_CONFIG_INVALID',
      `Failed to parse regression record ${id}: ${yamlErr instanceof Error ? yamlErr.message : String(yamlErr)}. ${hint}`,
    );
  }

  const parsed = RegressionRecordSchema.safeParse(data);
  if (!parsed.success) {
    throw new PmemError(
      'E_CONFIG_INVALID',
      `Invalid regression record frontmatter in ${path}: ${parsed.error.message}`,
    );
  }

  return { record: parsed.data, body: content.trim(), filePath: path };
}

export async function listRegressions(
  root: string,
  config: ProjectMemoryConfig,
): Promise<RegressionRecord[]> {
  const dir = regressionDir(root, config);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = files.filter((f) => f.endsWith('.md') && f.startsWith('REG-')).sort();
  const records: RegressionRecord[] = [];

  for (const f of mdFiles) {
    try {
      const { record } = await loadRegression(root, config, f.replace('.md', ''));
      records.push(record);
    } catch {
      // skip malformed records
    }
  }

  return records;
}

export async function listRegressionsByBug(
  root: string,
  config: ProjectMemoryConfig,
  bugId: string,
): Promise<RegressionRecord[]> {
  const all = await listRegressions(root, config);
  return all.filter((r) => r.related.bugs.includes(bugId));
}

export async function listRegressionsByModule(
  root: string,
  config: ProjectMemoryConfig,
  moduleName: string,
): Promise<RegressionRecord[]> {
  const all = await listRegressions(root, config);
  return all.filter((r) => r.related.modules.includes(moduleName));
}

// ── Run regression checks ─────────────────────────────────────────────────────

export async function runRegression(
  root: string,
  config: ProjectMemoryConfig,
  reg: RegressionRecord,
): Promise<RegressionResult> {
  const timestamp = new Date().toISOString();

  if (reg.check.type === 'manual') {
    return {
      regId: reg.id,
      status: 'error',
      error: 'Manual regressions cannot be run automatically. Please check manually.',
      timestamp,
    };
  }

  if (!reg.check.command) {
    return {
      regId: reg.id,
      status: 'error',
      error: 'No command specified for regression check.',
      timestamp,
    };
  }

  try {
    const { stdout, stderr } = await execAsync(reg.check.command, { cwd: root, encoding: 'utf-8' });
    const output = stdout || stderr;

    if (reg.check.type === 'command') {
      return {
        regId: reg.id,
        status: 'pass',
        output,
        timestamp,
      };
    }

    if (reg.check.type === 'json') {
      try {
        const jsonOutput = JSON.parse(output);
        const expected = reg.check.expect || {};
        const pass = matchJson(jsonOutput, expected);

        return {
          regId: reg.id,
          status: pass ? 'pass' : 'fail',
          output: JSON.stringify(jsonOutput, null, 2),
          error: pass
            ? undefined
            : `Expected: ${JSON.stringify(expected)}\nGot: ${JSON.stringify(jsonOutput)}`,
          timestamp,
        } as RegressionResult;
      } catch (parseErr) {
        return {
          regId: reg.id,
          status: 'fail',
          output,
          error: `Failed to parse JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          timestamp,
        } as RegressionResult;
      }
    }

    return {
      regId: reg.id,
      status: 'error',
      error: `Unknown check type: ${reg.check.type}`,
      timestamp,
    } as RegressionResult;
  } catch (err) {
    return {
      regId: reg.id,
      status: 'fail',
      error: err instanceof Error ? err.message : String(err),
      timestamp,
    } as RegressionResult;
  }
}

function matchJson(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(value)) {
      return false;
    }
  }
  return true;
}

// ── Persist results ───────────────────────────────────────────────────────────

export async function saveResult(
  root: string,
  regId: string,
  result: RegressionResult,
): Promise<void> {
  const dir = resultsDir(root, regId);
  await mkdir(dir, { recursive: true });

  const timestamp = result.timestamp.replace(/[:.]/g, '-');
  const path = join(dir, `${timestamp}.json`);

  await writeFile(path, JSON.stringify(result, null, 2), 'utf-8');

  // Also write latest.json
  const latestPath = join(dir, 'latest.json');
  await writeFile(latestPath, JSON.stringify(result, null, 2), 'utf-8');
}

// ── Get regression status ─────────────────────────────────────────────────────

export async function getRegressionStatus(
  root: string,
  regId: string,
): Promise<RegressionStatus | null> {
  const dir = resultsDir(root, regId);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
  if (jsonFiles.length === 0) {
    return { regId, runCount: 0 };
  }

  const latestPath = join(dir, 'latest.json');
  let lastRun: RegressionResult | undefined;
  try {
    const raw = await readFile(latestPath, 'utf-8');
    lastRun = JSON.parse(raw) as RegressionResult;
  } catch {
    // no latest.json
  }

  return {
    regId,
    lastRun,
    runCount: jsonFiles.filter((f) => f !== 'latest.json').length,
  };
}

// ── Schema import for validation ──────────────────────────────────────────────

import { RegressionRecordSchema } from '../records/record-schema.js';
