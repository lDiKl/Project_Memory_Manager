import { existsSync, readFileSync, lstatSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findProjectRoot, PmemError } from '@pmem/core';
import type { Command } from 'commander';
import { ui } from '../ui.js';

const HOOK_MARKER_START = '# === PMEM pre-commit hook (managed by pmem hooks install) ===';
const HOOK_MARKER_END = '# === PMEM pre-commit hook end ===';

function generateHookScript(): string {
  return `${HOOK_MARKER_START}
# This hook was installed by \`pmem hooks install\`
# It runs \`pmem check --staged\` before each commit.
# To remove: pmem hooks uninstall

# Only run if pmem is available
if command -v pmem >/dev/null 2>&1; then
  echo "[pmem pre-commit] Running pmem check --staged..."
  pmem check --staged
  exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "[pmem pre-commit] Docs drift detected. Commit blocked."
    echo "[pmem pre-commit] Run with --no-verify to skip, or update docs and try again."
    exit 1
  fi
else
  # pmem not available — warn but don't block
  echo "[pmem pre-commit] Warning: pmem not found in PATH. Skipping docs check."
fi
${HOOK_MARKER_END}
`;
}

function findGitDir(root: string): string | null {
  const gitDir = join(root, '.git');
  if (existsSync(gitDir)) {
    const stat = lstatSync(gitDir);
    if (stat.isDirectory()) return gitDir;
    // .git may be a file (worktree) — parse it
    try {
      const content = readFileSync(gitDir, 'utf-8').trim();
      if (content.startsWith('gitdir: ')) {
        const realGitDir = content.slice('gitdir: '.length).trim();
        return resolve(root, realGitDir);
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function readHook(gitDir: string): string {
  const hookPath = join(gitDir, 'hooks', 'pre-commit');
  if (!existsSync(hookPath)) return '';
  return readFileSync(hookPath, 'utf-8');
}

function writeHook(gitDir: string, content: string): void {
  const hookPath = join(gitDir, 'hooks', 'pre-commit');
  writeFileSync(hookPath, content, { mode: 0o755 });
}

function removeHook(gitDir: string): void {
  const hookPath = join(gitDir, 'hooks', 'pre-commit');
  if (!existsSync(hookPath)) return;
  const content = readFileSync(hookPath, 'utf-8');
  const startIdx = content.indexOf(HOOK_MARKER_START);
  if (startIdx === -1) {
    // No pmem hook found
    return;
  }
  const endIdx = content.indexOf(HOOK_MARKER_END);
  if (endIdx === -1) {
    throw new PmemError('E_HOOK_CORRUPTED', 'pre-commit hook contains PMEM start marker but no end marker. Please inspect manually.');
  }
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + HOOK_MARKER_END.length);
  const newContent = `${before}${after}`.trimStart();
  if (newContent.trim().length === 0) {
    unlinkSync(hookPath);
  } else {
    writeFileSync(hookPath, newContent, { mode: 0o755 });
  }
}

function isAlreadyInstalled(gitDir: string): boolean {
  return readHook(gitDir).includes(HOOK_MARKER_START);
}

interface HooksOptions {
  root?: string;
}

export function registerHooks(program: Command): void {
  const hooksCommand = program
    .command('hooks')
    .description('Manage Git hooks for PMM.')
    .option('--root <path>', 'Project root.');

  hooksCommand
    .command('install')
    .description('Install the PMEM pre-commit hook (runs `pmem check --staged`).')
    .action(async (opts: HooksOptions) => {
      try {
        await runInstall(opts);
      } catch (err) {
        ui.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  hooksCommand
    .command('uninstall')
    .description('Remove the PMEM pre-commit hook.')
    .action(async (opts: HooksOptions) => {
      try {
        await runUninstall(opts);
      } catch (err) {
        ui.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

async function runInstall(opts: HooksOptions): Promise<void> {
  const root = opts.root ? resolve(opts.root) : await findProjectRoot();
  const gitDir = findGitDir(root);
  if (!gitDir) {
    throw new PmemError('E_NO_GIT', 'No .git directory found. Run `git init` first.');
  }

  if (isAlreadyInstalled(gitDir)) {
    ui.warn('PMEM pre-commit hook is already installed.');
    return;
  }

  const existing = readHook(gitDir);
  const hookScript = generateHookScript();
  const newContent = existing.length > 0
    ? `${existing.trimEnd()}\n\n${hookScript}`
    : `#!/bin/sh\n\n${hookScript}`;

  writeHook(gitDir, newContent);
  ui.success('Installed PMEM pre-commit hook.');
  ui.plain('It will run `pmem check --staged` before every commit.');
  if (existing.length > 0) {
    ui.dim('The existing pre-commit script was preserved.');
  }
}

async function runUninstall(opts: HooksOptions): Promise<void> {
  const root = opts.root ? resolve(opts.root) : await findProjectRoot();
  const gitDir = findGitDir(root);
  if (!gitDir) {
    throw new PmemError('E_NO_GIT', 'No .git directory found.');
  }

  if (!isAlreadyInstalled(gitDir)) {
    ui.warn('No PMEM pre-commit hook found.');
    return;
  }

  removeHook(gitDir);
  ui.success('Removed PMEM pre-commit hook.');
}
