export const ANSI = {
  altScreen: '\x1b[?1049h',
  mainScreen: '\x1b[?1049l',
  clear: '\x1b[2J',
  home: '\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

export function stripAnsi(value: string): string {
  const esc = String.fromCharCode(27);
  return value.replace(new RegExp(`${esc}\\[[0-9;?]*[A-Za-z]`, 'g'), '');
}

export function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

export function color(value: string, code: string): string {
  return `${code}${value}${ANSI.reset}`;
}

export function truncate(value: string, width: number): string {
  if (width <= 0) return '';
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  if (width <= 3) return '.'.repeat(width);
  return `${plain.slice(0, width - 3)}...`;
}

export function padEndVisible(value: string, width: number): string {
  const len = visibleLength(value);
  if (len >= width) return value;
  return `${value}${' '.repeat(width - len)}`;
}
