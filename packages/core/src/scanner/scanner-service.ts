import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { DocsMap, ModuleEntry } from '../config/schema.js';

const IGNORE_DIRS = new Set([
  '.git',
  '.venv',
  'venv',
  'node_modules',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.idea',
  '.vscode',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  'tmp',
  'temp',
  'out',
]);

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.php',
  '.rb',
  '.cs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.swift',
  '.dart',
  '.ex',
  '.exs',
  '.clj',
]);

const COMMON_TOP_DIRS = new Set([
  'src',
  'app',
  'apps',
  'backend',
  'frontend',
  'server',
  'client',
  'packages',
  'services',
  'modules',
  'lib',
  'libs',
  'api',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DetectedModule {
  name: string;
  entry: ModuleEntry;
}

/**
 * Walk the repository and infer logical modules from directory structure.
 * Ported from pmem-prototype/pmem/scanner.py.
 */
export async function detectModules(root: string, maxDepth = 3): Promise<DetectedModule[]> {
  const codePathSets = new Map<string, Set<string>>();

  await walk(root, root, [], maxDepth, codePathSets);

  if (codePathSets.size === 0) return [];

  return Array.from(codePathSets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, patterns]) => ({
      name,
      entry: {
        code: [...patterns].sort(),
        docs: [`docs/modules/${name}/overview.md`],
        owners: [],
        description: `Auto-detected module: ${name}`,
      },
    }));
}

/**
 * Build a DocsMap from detected modules. Existing entries are preserved;
 * only new module names are added.
 */
export function mergeDetectedIntoDocsMap(existing: DocsMap, detected: DetectedModule[]): DocsMap {
  const merged = { ...existing.modules };
  for (const { name, entry } of detected) {
    if (!(name in merged)) {
      merged[name] = entry;
    }
  }
  return { modules: merged };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function walk(
  root: string,
  dir: string,
  parts: string[],
  depth: number,
  result: Map<string, Set<string>>,
): Promise<void> {
  if (depth === 0) return;

  let entries: Dirent<string>[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const currentParts = [...parts, entry.name];

    if (entry.isDirectory()) {
      await walk(root, fullPath, currentParts, depth - 1, result);
    } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
      const moduleName = inferModuleName(currentParts);
      if (!moduleName) continue;

      const patternDepth = Math.min(currentParts.length - 1, 3);
      const patternParts = currentParts.slice(0, patternDepth);
      const pattern = `${patternParts.join('/')}/**`;

      if (!result.has(moduleName)) result.set(moduleName, new Set());
      result.get(moduleName)?.add(pattern);
    }
  }
}

function inferModuleName(parts: string[]): string | null {
  if (parts.length < 2) return null;

  const first = parts[0];
  const second = parts[1];
  if (first && COMMON_TOP_DIRS.has(first)) {
    return second ? sanitize(second) : null;
  }

  return first ? sanitize(first) : null;
}

function sanitize(value: string): string {
  return value.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
}
