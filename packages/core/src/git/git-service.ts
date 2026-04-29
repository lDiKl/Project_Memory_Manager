import { simpleGit } from 'simple-git';
import { PmemError } from '../errors.js';

export type DiffMode = { kind: 'working' } | { kind: 'staged' } | { kind: 'base'; branch: string };

export async function getChangedFiles(root: string, mode: DiffMode): Promise<string[]> {
  const git = simpleGit(root);

  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    throw new PmemError('E_GIT_NOT_REPO', `${root} is not a git repository.`);
  }

  try {
    if (mode.kind === 'working') {
      const modified = await git.diff(['--name-only']);
      const untracked = await git.raw(['ls-files', '--others', '--exclude-standard']);
      return [...modified.split('\n'), ...untracked.split('\n')]
        .map((f) => f.trim())
        .filter(Boolean);
    }
    if (mode.kind === 'staged') {
      const raw = await git.diff(['--name-only', '--cached']);
      return raw
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    }
    const raw = await git.diff(['--name-only', `${mode.branch}...HEAD`]);
    return raw
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
  } catch (err) {
    throw new PmemError(
      'E_GIT_FAILED',
      `git diff failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

export async function getCurrentBranch(root: string): Promise<string> {
  const git = simpleGit(root);
  try {
    return (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  } catch (err) {
    throw new PmemError(
      'E_GIT_FAILED',
      `git rev-parse failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
