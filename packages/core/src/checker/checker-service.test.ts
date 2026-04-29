import { describe, expect, it } from 'vitest';
import type { DocsMap } from '../config/schema.js';
import { checkDrift } from './checker-service.js';

const docsMap: DocsMap = {
  modules: {
    auth: {
      code: ['src/auth/**'],
      docs: ['docs/modules/auth/overview.md'],
      owners: [],
    },
    payments: {
      code: ['src/payments/**'],
      docs: ['docs/modules/payments/overview.md', 'docs/modules/payments/api.md'],
      owners: [],
    },
  },
};

describe('checkDrift', () => {
  it('returns ok status when no files changed', () => {
    const report = checkDrift([], docsMap);
    expect(report.status).toBe('ok');
    expect(report.affected).toHaveLength(0);
    expect(report.changedFiles).toHaveLength(0);
  });

  it('returns ok when changed files match no module', () => {
    const report = checkDrift(['README.md', 'package.json'], docsMap);
    expect(report.status).toBe('ok');
    expect(report.affected).toHaveLength(0);
  });

  it('flags warning when code changed but no docs updated', () => {
    const report = checkDrift(['src/auth/service.ts'], docsMap);
    expect(report.status).toBe('warning');
    expect(report.affected).toHaveLength(1);
    expect(report.affected[0]?.module).toBe('auth');
    expect(report.affected[0]?.missingDocs).toBe(true);
    expect(report.affected[0]?.changedCode).toEqual(['src/auth/service.ts']);
    expect(report.affected[0]?.updatedDocs).toHaveLength(0);
  });

  it('returns ok when code and docs both changed', () => {
    const report = checkDrift(['src/auth/service.ts', 'docs/modules/auth/overview.md'], docsMap);
    expect(report.status).toBe('ok');
    expect(report.affected[0]?.missingDocs).toBe(false);
    expect(report.affected[0]?.updatedDocs).toEqual(['docs/modules/auth/overview.md']);
  });

  it('handles multiple modules independently', () => {
    const report = checkDrift(
      ['src/auth/service.ts', 'src/payments/gateway.ts', 'docs/modules/payments/overview.md'],
      docsMap,
    );
    expect(report.status).toBe('warning');
    expect(report.affected).toHaveLength(2);

    const auth = report.affected.find((m) => m.module === 'auth');
    const payments = report.affected.find((m) => m.module === 'payments');
    expect(auth?.missingDocs).toBe(true);
    expect(payments?.missingDocs).toBe(false);
  });

  it('counts drift modules in the message', () => {
    const report = checkDrift(['src/auth/service.ts', 'src/payments/gateway.ts'], docsMap);
    expect(report.message).toContain('2');
  });

  it('reports ok message when all docs are updated', () => {
    const report = checkDrift(['src/auth/service.ts', 'docs/modules/auth/overview.md'], docsMap);
    expect(report.message).toMatch(/all affected/i);
  });
});
