import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { DocsMap, ModuleEntry, ProjectMemoryConfig } from '../config/schema.js';
import { PmemError } from '../errors.js';

const require = createRequire(import.meta.url);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContextPack {
  id: string;
  title: string;
  description: string;
  include?: string[] | undefined;
  exclude?: string[] | undefined;
  format?: string | undefined;
}

export interface ContextOptions {
  task?: string;
  bug?: string;
  files?: string[];
  diff?: boolean;
  pack?: string;
  includeRegressions?: boolean;
  root?: string;
}

export interface ContextOutput {
  markdown: string;
  tokens: number;
}

// ── Context Pack Management ───────────────────────────────────────────────────

export async function loadContextPack(
  root: string,
  config: ProjectMemoryConfig,
  kind: string,
): Promise<ContextPack> {
  const packPath = join(root, config.project.docs_root, 'llm', 'context-packs', `${kind}-pack.md`);

  let raw: string;
  try {
    raw = await readFile(packPath, 'utf-8');
  } catch {
    throw new PmemError('E_PACK_NOT_FOUND', `Context pack not found: ${kind}`);
  }

  const { data } = matter(raw);

  return {
    id: kind,
    title: data.title as string,
    description: data.description as string,
    include: data.include as string[] | undefined,
    exclude: data.exclude as string[] | undefined,
    format: data.format as string | undefined,
  };
}

export async function listContextPacks(
  root: string,
  config: ProjectMemoryConfig,
): Promise<string[]> {
  const dir = join(root, config.project.docs_root, 'llm', 'context-packs');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  return files.filter((f) => f.endsWith('-pack.md')).map((f) => f.replace(/-pack\.md$/, ''));
}

// ── Context Assembly ──────────────────────────────────────────────────────────

export async function buildContext(
  root: string,
  config: ProjectMemoryConfig,
  docsMap: DocsMap,
  opts: ContextOptions,
): Promise<string> {
  const pieces: string[] = [];

  // 1. Module-level context from docs/context/<module>.context.md
  const moduleContext = await collectModuleContext(root, config, docsMap);
  if (moduleContext.length > 0) {
    pieces.push(`## Module Context\n\n${moduleContext.join('\n\n')}`);
  }

  // 2. ADRs related to touched modules
  const adrs = await collectADRs(root, config, docsMap);
  if (adrs.length > 0) {
    pieces.push(`## Architecture Decisions\n\n${adrs.join('\n\n')}`);
  }

  // 3. Test files for touched modules
  const tests = await collectTests(root, config, docsMap);
  if (tests.length > 0) {
    pieces.push(`## Tests\n\n${tests.join('\n\n')}`);
  }

  // 4. Regressions for touched modules
  const regIds = await collectRegressions(root, config, docsMap);
  if (regIds.length > 0) {
    pieces.push(`## Regressions\n\n${regIds.join('\n')}`);
  }

  // 5. Regression results (if requested)
  if (opts.includeRegressions && regIds.length > 0) {
    const regressionResults = await collectRegressionResults(root, regIds);
    if (regressionResults.length > 0) {
      pieces.push(`## Regression Results\n\n${regressionResults.join('\n\n')}`);
    }
  }

  // 6. Commands for touched modules
  const commands = await collectCommands(root, config, docsMap);
  if (commands.length > 0) {
    pieces.push(`## Useful Commands\n\n${commands.join('\n\n')}`);
  }

  // 7. Explicit "do not change" directives
  const doNotChange = collectDoNotChange(docsMap);
  if (doNotChange.length > 0) {
    pieces.push(`## Do Not Change\n\n${doNotChange.join('\n\n')}`);
  }

  return pieces.join('\n\n');
}

async function collectModuleContext(
  root: string,
  config: ProjectMemoryConfig,
  docsMap: DocsMap,
): Promise<string[]> {
  const contexts: string[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    if (!entry.context || entry.context.length === 0) continue;

    for (const pattern of entry.context) {
      const matches = await matchFiles(root, pattern);
      for (const path of matches) {
        try {
          const raw = await readFile(path, 'utf-8');
          const { content } = matter(raw);
          contexts.push(`### ${moduleName}\n\n${content.trim()}`);
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  return contexts;
}

async function collectADRs(
  root: string,
  config: ProjectMemoryConfig,
  docsMap: DocsMap,
): Promise<string[]> {
  const adrs: string[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    if (!entry.decisions || entry.decisions.length === 0) continue;

    for (const pattern of entry.decisions) {
      const matches = await matchFiles(root, pattern);
      for (const path of matches) {
        try {
          const raw = await readFile(path, 'utf-8');
          const { data, content } = matter(raw);
          const title = data.title as string;
          adrs.push(`### ${path.replace(`${root}/`, '')}\n\n${content.trim()}`);
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  return adrs;
}

async function collectTests(
  root: string,
  config: ProjectMemoryConfig,
  docsMap: DocsMap,
): Promise<string[]> {
  const tests: string[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    if (!entry.tests || entry.tests.length === 0) continue;

    for (const pattern of entry.tests) {
      const matches = await matchFiles(root, pattern);
      tests.push(...matches.map((p) => p.replace(`${root}/`, '')));
    }
  }

  return tests;
}

async function collectRegressions(
  root: string,
  config: ProjectMemoryConfig,
  docsMap: DocsMap,
): Promise<string[]> {
  const regIds: string[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    if (!entry.regressions || entry.regressions.length === 0) continue;
    regIds.push(...entry.regressions);
  }

  return [...new Set(regIds)];
}

async function collectCommands(
  root: string,
  config: ProjectMemoryConfig,
  docsMap: DocsMap,
): Promise<string[]> {
  const commands: string[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    if (!entry.commands) continue;
    for (const [cmdName, cmdValue] of Object.entries(entry.commands)) {
      commands.push(`\`${cmdName}\` → ${cmdValue}`);
    }
  }

  return commands;
}

async function collectRegressionResults(root: string, regIds: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const regId of regIds) {
    const { getRegressionStatus } = await import('../regression/regression-service.js');
    const status = await getRegressionStatus(root, regId);
    if (status?.lastRun) {
      const badge =
        status.lastRun.status === 'pass' ? '✅' : status.lastRun.status === 'fail' ? '❌' : '⚠️';
      results.push(
        `### ${regId} — ${badge}\n\n**Status:** ${status.lastRun.status}\n**Timestamp:** ${status.lastRun.timestamp}\n\n${status.lastRun.error ? `**Error:** ${status.lastRun.error}` : status.lastRun.output ? `**Output:**\n\`\`\`\n${status.lastRun.output}\n\`\`\`` : ''}`,
      );
    }
  }

  return results;
}

function collectDoNotChange(docsMap: DocsMap): string[] {
  const doNotChange: string[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    if (entry.owners && entry.owners.length > 0) {
      doNotChange.push(`- **${moduleName}**: owned by ${entry.owners.join(', ')}`);
    }
  }

  return doNotChange;
}

async function matchFiles(root: string, pattern: string): Promise<string[]> {
  let glob: typeof import('glob');
  try {
    glob = require('glob');
  } catch {
    glob = { globSync: () => [] } as unknown as typeof import('glob');
  }
  const absolutePattern = pattern.startsWith('/') ? pattern : join(root, pattern);
  const files = glob.globSync(absolutePattern, { nodir: true }) as string[];
  return files.map((f) => f.replace(`${root}/`, ''));
}
