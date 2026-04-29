import { resolve } from 'node:path';
import {
  type DiffMode,
  type DocsMap,
  PmemError,
  type ProjectMemoryConfig,
  type TaskRecord,
  checkDrift,
  findProjectRoot,
  getChangedFiles,
  listRecords,
  loadConfig,
  loadDocsMap,
} from '@pmem/core';
import type { DocsImpactReport, ModuleImpact } from '@pmem/shared-types';
import type { Command } from 'commander';
import { writeJson, writeJsonError } from '../json.js';
import { ui } from '../ui.js';

interface CheckOptions {
  root?: string;
  staged: boolean;
  base?: string;
  strict: boolean;
  json: boolean;
  records: boolean;
}

export function registerCheck(program: Command): void {
  program
    .command('check')
    .description('Check which docs are at risk based on changed files.')
    .option('--root <path>', 'Project root.')
    .option('--staged', 'Check staged files (git diff --cached).', false)
    .option('--base <branch>', 'Compare HEAD against a base branch (e.g. main).')
    .option('--strict', 'Exit with code 1 if any docs are missing updates.', false)
    .option('--json', 'Output machine-readable JSON.', false)
    .option('--records', 'Also cross-check open tasks with docs_impact: required.', false)
    .action(async (opts: CheckOptions) => {
      try {
        await runCheck(opts);
      } catch (err) {
        if (opts.json) {
          writeJsonError(err);
        } else {
          ui.error(err instanceof Error ? err.message : String(err));
        }
        process.exitCode = 1;
      }
    });
}

async function runCheck(opts: CheckOptions): Promise<void> {
  const root = opts.root ? resolve(opts.root) : await findProjectRoot();
  const config = await loadConfig(root);

  // Wire strict mode through config when in pre-commit context
  if (opts.staged && config.checks.block_commit) {
    opts.strict = true;
  }

  let docsMap: DocsMap;
  try {
    docsMap = await loadDocsMap(root, config);
  } catch (err) {
    if (err instanceof PmemError && err.code === 'E_DOCS_MAP_MISSING') {
      if (opts.json) {
        writeJson({ error: 'docs-map.yml not found. Run `pmem init` first.' });
      } else {
        ui.warn('docs-map.yml not found. Run `pmem init` first.');
      }
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const mode: DiffMode = opts.base
    ? { kind: 'base', branch: opts.base }
    : opts.staged
      ? { kind: 'staged' }
      : { kind: 'working' };

  const changedFiles = await getChangedFiles(root, mode);

  if (opts.json) {
    let report: DocsImpactReport;
    if (changedFiles.length === 0) {
      report = {
        changedFiles: [],
        affected: [],
        status: 'ok',
        message: 'No changed files.',
      };
    } else {
      report = checkDrift(changedFiles, docsMap);
    }

    const output: Record<string, unknown> = { ...report };
    if (opts.records) {
      const pending = await getPendingDocsImpact(root, config);
      if (pending.length > 0) output.pending_docs_impact = pending;
    }
    writeJson(output);

    if (opts.strict && report.status === 'warning') process.exitCode = 1;
    return;
  }

  if (changedFiles.length === 0) {
    ui.success('No changed files detected.');
    if (opts.records) await checkRecordsHuman(root, config);
    return;
  }

  const report = checkDrift(changedFiles, docsMap);
  printReport(report);

  if (opts.records) await checkRecordsHuman(root, config);

  if (opts.strict && report.status === 'warning') {
    process.exitCode = 1;
  }
}

async function getPendingDocsImpact(
  root: string,
  config: ProjectMemoryConfig,
): Promise<Array<{ id: string; title: string; status: string }>> {
  const tasks = (await listRecords(root, config, 'task')) as TaskRecord[];
  return tasks
    .filter((t) => t.docs_impact === 'required' && t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title, status: t.status }));
}

async function checkRecordsHuman(root: string, config: ProjectMemoryConfig): Promise<void> {
  const pending = await getPendingDocsImpact(root, config);
  if (pending.length === 0) return;

  ui.blank();
  ui.warn(`${pending.length} open task(s) with docs_impact: required:`);
  for (const t of pending) {
    ui.dim(`  ${t.id}  [${t.status}]  ${t.title}`);
  }
}

function printReport(report: DocsImpactReport): void {
  const hasDrift = report.affected.some((m) => m.missingDocs);

  if (report.affected.length === 0) {
    ui.success(`No modules affected. (${report.changedFiles.length} file(s) changed)`);
    return;
  }

  ui.blank();
  for (const impact of report.affected) {
    printModuleImpact(impact);
  }
  ui.blank();

  if (hasDrift) {
    ui.warn(report.message);
  } else {
    ui.success(report.message);
  }
}

function printModuleImpact(impact: ModuleImpact): void {
  if (impact.missingDocs) {
    ui.plain(
      `  ${impact.module}  ← ${impact.changedCode.length} code file(s) changed, no docs updated`,
    );
    for (const f of impact.changedCode) ui.dim(`    code: ${f}`);
    for (const d of impact.expectedDocs) ui.dim(`    docs: ${d}  ← not updated`);
  } else {
    ui.plain(`  ${impact.module}  ✓`);
    for (const f of impact.changedCode) ui.dim(`    code: ${f}`);
    for (const d of impact.updatedDocs) ui.dim(`    docs: ${d}  ← updated`);
  }
}
