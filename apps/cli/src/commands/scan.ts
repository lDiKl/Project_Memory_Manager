import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type DetectedModule,
  PmemError,
  detectModules,
  findProjectRoot,
  loadConfig,
  loadDocsMap,
  mergeDetectedIntoDocsMap,
  writeDocsMap,
} from '@pmem/core';
import type { Command } from 'commander';
import prompts from 'prompts';
import { ui } from '../ui.js';

interface ScanOptions {
  root?: string;
  write: boolean;
  yes: boolean;
}

export function registerScan(program: Command): void {
  program
    .command('scan')
    .description('Scan the repository and suggest module docs-map entries.')
    .option('--root <path>', 'Project root.')
    .option('--write', 'Write detected modules to docs-map.yml without prompting.', false)
    .option('-y, --yes', 'Auto-confirm all prompts.', false)
    .action(async (opts: ScanOptions) => {
      try {
        await runScan(opts);
      } catch (err) {
        if (err instanceof PmemError && err.code === 'E_DOCS_MAP_MISSING') {
          // docs-map.yml not created yet — treat as empty
          await runScan({ ...opts, _emptyMap: true } as ScanOptions & { _emptyMap: boolean });
          return;
        }
        ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}

async function runScan(opts: ScanOptions & { _emptyMap?: boolean }): Promise<void> {
  const root = opts.root ? join(process.cwd(), opts.root) : await findProjectRoot();
  const config = await loadConfig(root);

  let existingMap = { modules: {} };
  if (!opts._emptyMap) {
    try {
      existingMap = await loadDocsMap(root, config);
    } catch (e) {
      if (!(e instanceof PmemError && e.code === 'E_DOCS_MAP_MISSING')) throw e;
    }
  }

  ui.info(`Scanning ${root} …`);
  const detected = await detectModules(root);

  if (detected.length === 0) {
    ui.warn('No modules detected.');
    ui.dim('  Tip: add source files first, or edit docs-map.yml manually.');
    return;
  }

  // ── Print what was found ──────────────────────────────────────────────────
  ui.blank();
  ui.header('Detected modules:');
  for (const { name, entry } of detected) {
    const isNew = !(name in existingMap.modules);
    const label = isNew ? '' : ' (already mapped)';
    ui.plain(`  ${name}${label}`);
    for (const p of entry.code) ui.dim(`    code: ${p}`);
    for (const d of entry.docs) ui.dim(`    docs: ${d}`);
  }
  ui.blank();

  const newModules = detected.filter(({ name }) => !(name in existingMap.modules));
  if (newModules.length === 0) {
    ui.success('All detected modules are already in docs-map.yml. Nothing to update.');
    return;
  }

  // ── Prompt (unless --write or -y) ─────────────────────────────────────────
  let shouldWrite = opts.write || opts.yes;
  if (!shouldWrite) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message: `Add ${newModules.length} new module(s) to docs-map.yml?`,
      initial: false,
    });
    shouldWrite = response.value === true;
  }

  if (!shouldWrite) {
    ui.dim('No changes written. Run `pmem scan --write` to skip the prompt.');
    return;
  }

  // ── Merge and write ────────────────────────────────────────────────────────
  const merged = mergeDetectedIntoDocsMap(existingMap, newModules);
  await writeDocsMap(root, config, merged);

  // ── Create placeholder overview.md for each new module ────────────────────
  for (const { name } of newModules) {
    const overviewPath = join(root, config.project.docs_root, 'modules', name, 'overview.md');
    await createFile(
      overviewPath,
      `# ${name}\n\nAuto-generated module overview. Replace this with real context.\n`,
    );
  }

  ui.blank();
  ui.success(`docs-map.yml updated with ${newModules.length} new module(s).`);
  ui.info('Edit docs-map.yml to refine code patterns and add doc paths.');
}

async function createFile(path: string, content: string): Promise<void> {
  const { access } = await import('node:fs/promises');
  try {
    await access(path);
    return; // file already exists
  } catch {
    // doesn't exist → create
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}
