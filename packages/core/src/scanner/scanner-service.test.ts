import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectModules, mergeDetectedIntoDocsMap } from './scanner-service.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-scan-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── detectModules ─────────────────────────────────────────────────────────────

describe('detectModules', () => {
  it('returns empty array when no code files found', async () => {
    const result = await detectModules(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('detects a module under a common top-level dir (src/auth)', async () => {
    await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'auth', 'token.ts'), '// token', 'utf-8');
    const result = await detectModules(tmpDir);
    const names = result.map((m) => m.name);
    expect(names).toContain('auth');
  });

  it('ignores node_modules', async () => {
    await mkdir(join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    await writeFile(join(tmpDir, 'node_modules', 'some-pkg', 'index.ts'), '', 'utf-8');
    const result = await detectModules(tmpDir);
    expect(result.every((m) => m.name !== 'some-pkg')).toBe(true);
  });

  it('ignores dist/', async () => {
    await mkdir(join(tmpDir, 'dist'), { recursive: true });
    await writeFile(join(tmpDir, 'dist', 'index.js'), '', 'utf-8');
    const result = await detectModules(tmpDir);
    expect(result.every((m) => m.name !== 'dist')).toBe(true);
  });

  it('generates docs path for each module', async () => {
    await mkdir(join(tmpDir, 'src', 'billing'), { recursive: true });
    await writeFile(join(tmpDir, 'src', 'billing', 'service.ts'), '', 'utf-8');
    const result = await detectModules(tmpDir);
    const billing = result.find((m) => m.name === 'billing');
    expect(billing?.entry.docs).toContain('docs/modules/billing/overview.md');
  });

  it('detects modules in multiple top-level dirs', async () => {
    await mkdir(join(tmpDir, 'backend', 'auth'), { recursive: true });
    await mkdir(join(tmpDir, 'frontend', 'auth'), { recursive: true });
    await writeFile(join(tmpDir, 'backend', 'auth', 'service.ts'), '', 'utf-8');
    await writeFile(join(tmpDir, 'frontend', 'auth', 'component.tsx'), '', 'utf-8');
    const result = await detectModules(tmpDir);
    const names = result.map((m) => m.name);
    expect(names).toContain('auth');
  });

  it('does not include .ts files at the root', async () => {
    await writeFile(join(tmpDir, 'index.ts'), '', 'utf-8');
    const result = await detectModules(tmpDir);
    expect(result).toHaveLength(0);
  });
});

// ── mergeDetectedIntoDocsMap ──────────────────────────────────────────────────

describe('mergeDetectedIntoDocsMap', () => {
  it('adds new modules to an empty map', async () => {
    const detected = [
      {
        name: 'auth',
        entry: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'], owners: [] },
      },
    ];
    const merged = mergeDetectedIntoDocsMap({ modules: {} }, detected);
    expect(merged.modules.auth).toBeDefined();
  });

  it('does not overwrite an existing module', async () => {
    const existing = {
      modules: {
        auth: { code: ['backend/auth/**'], docs: ['custom/auth.md'], owners: [] },
      },
    };
    const detected = [
      {
        name: 'auth',
        entry: { code: ['src/auth/**'], docs: ['docs/modules/auth/overview.md'], owners: [] },
      },
    ];
    const merged = mergeDetectedIntoDocsMap(existing, detected);
    expect(merged.modules.auth?.docs).toEqual(['custom/auth.md']);
  });
});
