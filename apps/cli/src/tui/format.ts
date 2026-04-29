import type { AnyRecord, RegressionRecord } from '@pmem/core';
import type { DocsImpactReport, ModuleImpact } from '@pmem/shared-types';
import type { TuiBlock, TuiLine, TuiStyle } from './types.js';

const ICONS: Record<'success' | 'warn' | 'error' | 'info', string> = {
  success: 'OK',
  warn: 'WARN',
  error: 'ERR',
  info: 'INFO',
};

export function line(text: string, style?: TuiStyle): TuiLine {
  return { text, style };
}

export function message(type: 'success' | 'warn' | 'error' | 'info', text: string): TuiBlock {
  return [line(`${ICONS[type]} ${text}`, type)];
}

export function recordList(records: AnyRecord[], title: string): TuiBlock {
  if (records.length === 0) return [line(`No ${title.toLowerCase()} found.`, 'dim')];

  return [
    line(`${title} (${records.length})`, 'title'),
    ...records.map((record) =>
      line(
        `  ${record.id.padEnd(8)} [${record.status}] ${record.title}`,
        statusStyle(record.status),
      ),
    ),
  ];
}

export function recordDetail(record: AnyRecord, body?: string): TuiBlock {
  const lines: TuiBlock = [
    line(`${record.id} - ${record.title}`, 'title'),
    line(`  status: ${record.status}`, statusStyle(record.status)),
    line(`  type:   ${record.type}`, 'dim'),
  ];

  if (body) {
    lines.push(line(''));
    for (const bodyLine of body.split('\n').slice(0, 80)) {
      lines.push(line(bodyLine, 'dim'));
    }
  }

  return lines;
}

export function driftReport(report: DocsImpactReport): TuiBlock {
  if (report.affected.length === 0) {
    return message(
      'success',
      `No modules affected. (${report.changedFiles.length} file(s) changed)`,
    );
  }

  const lines: TuiBlock = [];
  for (const impact of report.affected) lines.push(...moduleImpact(impact));

  const hasDrift = report.affected.some((impact) => impact.missingDocs);
  lines.push(line(''));
  lines.push(line(report.message, hasDrift ? 'warn' : 'success'));
  return lines;
}

export function contextOutput(content: string): TuiBlock {
  return [line('Context Pack', 'title'), ...content.split('\n').map((value) => line(value))];
}

export function regressionList(records: RegressionRecord[]): TuiBlock {
  if (records.length === 0) return message('info', 'No regressions found.');
  return [
    line(`Regressions (${records.length})`, 'title'),
    ...records.map((record) =>
      line(
        `  ${record.id.padEnd(8)} [${record.status}] ${record.title}`,
        statusStyle(record.status),
      ),
    ),
  ];
}

function moduleImpact(impact: ModuleImpact): TuiBlock {
  if (impact.missingDocs) {
    return [
      line(
        `${impact.module} - ${impact.changedCode.length} code file(s) changed, no docs updated`,
        'warn',
      ),
      ...impact.changedCode.map((file) => line(`  code: ${file}`, 'dim')),
      ...impact.expectedDocs.map((file) => line(`  docs: ${file} - not updated`, 'dim')),
    ];
  }

  return [
    line(`${impact.module} OK`, 'success'),
    ...impact.changedCode.map((file) => line(`  code: ${file}`, 'dim')),
    ...impact.updatedDocs.map((file) => line(`  docs: ${file} - updated`, 'dim')),
  ];
}

function statusStyle(status: string): TuiStyle {
  switch (status) {
    case 'done':
    case 'closed':
    case 'accepted':
    case 'fixed':
    case 'pass':
      return 'success';
    case 'open':
    case 'in_progress':
    case 'investigating':
    case 'proposed':
      return 'warn';
    case 'blocked':
    case 'fail':
    case 'wont_fix':
    case 'rejected':
      return 'error';
    default:
      return 'dim';
  }
}
