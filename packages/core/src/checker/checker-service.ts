import micromatch from 'micromatch';
const { isMatch } = micromatch;
import type { DocsImpactReport, ModuleImpact } from '@pmem/shared-types';
import type { DocsMap } from '../config/schema.js';

export function checkDrift(changedFiles: string[], docsMap: DocsMap): DocsImpactReport {
  const affected: ModuleImpact[] = [];

  for (const [moduleName, entry] of Object.entries(docsMap.modules)) {
    const changedCode = changedFiles.filter((f) => isMatch(f, entry.code));
    if (changedCode.length === 0) continue;

    const updatedDocs = changedFiles.filter((f) => isMatch(f, entry.docs));
    const missingDocs = updatedDocs.length === 0;

    affected.push({
      module: moduleName,
      changedCode,
      expectedDocs: entry.docs,
      updatedDocs,
      missingDocs,
    });
  }

  const hasDrift = affected.some((m) => m.missingDocs);
  const status = affected.length === 0 ? 'ok' : hasDrift ? 'warning' : 'ok';

  const message =
    affected.length === 0
      ? 'No modules affected by the change.'
      : hasDrift
        ? `${affected.filter((m) => m.missingDocs).length} module(s) changed without doc updates.`
        : 'All affected modules have doc updates.';

  return { changedFiles, affected, status, message };
}
