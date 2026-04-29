import { suggestions } from './autcomplete.js';
import { COMMANDS } from './commands/registry.js';
import { ANSI, color, padEndVisible, truncate, visibleLength } from './theme.js';
import type { AppState, TuiLine, TuiStyle } from './types.js';

const MIN_WIDTH = 64;

export function render(state: AppState, columns: number, rows: number): string {
  const width = Math.max(columns || 80, MIN_WIDTH);
  const height = Math.max(rows || 24, 20);
  const contentWidth = Math.min(width - 4, 98);
  const left = Math.max(0, Math.floor((width - contentWidth) / 2));
  const lines: string[] = [];

  pushLogo(lines, contentWidth);
  lines.push(center(`${state.context.projectName} / ${state.context.branch}`, contentWidth, 'dim'));
  lines.push('');

  const panelGap = 2;
  const panelWidth = Math.floor((contentWidth - panelGap) / 2);
  const dashboardRows = Math.max(4, Math.min(6, Math.floor(height * 0.22)));
  const taskPanel = panel(
    'Tasks',
    dashboardRows,
    panelWidth,
    dashboardLines(state, 'tasks', dashboardRows),
  );
  const bugPanel = panel(
    'Bugs',
    dashboardRows,
    panelWidth,
    dashboardLines(state, 'bugs', dashboardRows),
  );
  for (let i = 0; i < taskPanel.length; i++) {
    lines.push(`${taskPanel[i] ?? ''}${' '.repeat(panelGap)}${bugPanel[i] ?? ''}`);
  }
  lines.push('');

  const usedStaticRows = lines.length + 5;
  const commandPaletteRows = state.input.startsWith('/')
    ? Math.min(3, Math.max(1, height - usedStaticRows - 8))
    : 1;
  const activityRows = Math.max(4, height - usedStaticRows - commandPaletteRows);
  lines.push(...panel('Activity', activityRows, contentWidth, activityLines(state, activityRows)));
  lines.push('');
  lines.push(...inputBox(state, contentWidth));
  lines.push(...paletteLines(state, contentWidth, commandPaletteRows));

  const padded = lines.slice(0, height).map((line) => `${' '.repeat(left)}${line}`);
  while (padded.length < height) padded.push('');
  return padded.join('\n');
}

function pushLogo(lines: string[], width: number): void {
  const logo = ['PROJECT  MEMORY', 'MANAGER'];
  lines.push('');
  for (const row of logo) lines.push(center(row, width, 'title'));
}

function dashboardLines(state: AppState, kind: 'tasks' | 'bugs', rows: number): TuiLine[] {
  if (state.dashboard.loading && state.dashboard[kind].length === 0) {
    return [{ text: 'Loading project memory...', style: 'dim' }];
  }
  if (state.dashboard.error && state.dashboard[kind].length === 0) {
    return [{ text: state.dashboard.error, style: 'warn' }];
  }

  const records = state.dashboard[kind].slice(0, rows);
  if (records.length === 0) return [{ text: `No ${kind} found.`, style: 'dim' }];
  return records.map((record) => ({
    text: `${record.id.padEnd(8)} ${record.status.padEnd(13)} ${record.title}`,
    style: statusStyle(record.status),
  }));
}

function activityLines(state: AppState, rows: number): TuiLine[] {
  if (state.output.length === 0) {
    return [
      { text: 'Type / for commands. Use Tab to complete, Enter to run.', style: 'dim' },
      { text: 'Try /check, /task list, /bug list, or /context list-packs.', style: 'dim' },
    ];
  }

  const flat: TuiLine[] = [];
  for (const entry of state.output.slice(-8)) {
    flat.push({ text: `> ${entry.command}`, style: 'info' });
    flat.push(...entry.lines);
    flat.push({ text: '' });
  }

  const visible = flat.slice(-rows);
  if (state.status === 'running') visible.push({ text: 'running...', style: 'warn' });
  return visible;
}

function inputBox(state: AppState, width: number): string[] {
  const prompt = state.status === 'running' ? '> running...' : `> ${state.input}`;
  return panel('', 1, width, [
    { text: prompt, style: state.status === 'running' ? 'warn' : 'info' },
  ]);
}

function paletteLines(state: AppState, width: number, rows: number): string[] {
  if (!state.input) return [styleLine({ text: 'Type / for commands', style: 'dim' }, width)];
  if (!state.input.startsWith('/')) return [];

  const matches = suggestions(state.input);
  const values = matches.length > 0 ? matches : COMMANDS.map((command) => command.name);
  const commandRows: string[] = [];
  const perRow = Math.max(1, Math.floor(width / 22));
  for (let i = 0; i < values.length && commandRows.length < rows; i += perRow) {
    commandRows.push(
      values
        .slice(i, i + perRow)
        .map((value) => color(value.padEnd(18), ANSI.yellow))
        .join('  '),
    );
  }
  if (commandRows.length === 0)
    return [styleLine({ text: 'No matching commands', style: 'warn' }, width)];
  return commandRows.map((line) => truncate(line, width));
}

function panel(title: string, innerRows: number, width: number, body: TuiLine[]): string[] {
  const safeWidth = Math.max(12, width);
  const titleText = title ? ` ${title} ` : '';
  const top = `${ANSI.gray}+${titleText}${'-'.repeat(Math.max(0, safeWidth - titleText.length - 2))}+${ANSI.reset}`;
  const bottom = `${ANSI.gray}+${'-'.repeat(safeWidth - 2)}+${ANSI.reset}`;
  const rows: string[] = [top];

  for (let i = 0; i < innerRows; i++) {
    rows.push(
      `${ANSI.gray}|${ANSI.reset} ${styleLine(body[i] ?? { text: '' }, safeWidth - 4)} ${ANSI.gray}|${ANSI.reset}`,
    );
  }
  rows.push(bottom);
  return rows;
}

function styleLine(line: TuiLine, width: number): string {
  const text = truncate(line.text, width);
  return padEndVisible(applyStyle(text, line.style), width);
}

function applyStyle(value: string, style?: TuiStyle): string {
  switch (style) {
    case 'title':
      return color(value, `${ANSI.bold}${ANSI.cyan}`);
    case 'success':
      return color(value, ANSI.green);
    case 'warn':
      return color(value, ANSI.yellow);
    case 'error':
      return color(value, ANSI.red);
    case 'info':
      return color(value, ANSI.cyan);
    case 'muted':
    case 'dim':
      return color(value, ANSI.gray);
    default:
      return value;
  }
}

function center(value: string, width: number, style?: TuiStyle): string {
  const styled = applyStyle(value, style);
  const pad = Math.max(0, Math.floor((width - visibleLength(value)) / 2));
  return `${' '.repeat(pad)}${styled}`;
}

function statusStyle(status: string): TuiStyle {
  switch (status) {
    case 'done':
    case 'fixed':
    case 'accepted':
    case 'pass':
      return 'success';
    case 'blocked':
    case 'fail':
    case 'wont_fix':
      return 'error';
    default:
      return 'warn';
  }
}
