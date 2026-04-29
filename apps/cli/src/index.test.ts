import { describe, expect, it } from 'vitest';

function shouldLaunchTUI(args: string[], commandNames: Set<string>): boolean {
  if (args.length === 0) return true;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h' || arg === '--version' || arg === '-v') {
      return false;
    }
    if (!arg.startsWith('-')) {
      if (commandNames.has(arg)) return false;
    }
  }

  return true;
}

function hasOnlyVersionRequest(args: string[]): boolean {
  return args.length > 0 && args.every((a) => a === '--version' || a === '-v');
}

const COMMAND_NAMES = new Set([
  'init',
  'scan',
  'check',
  'task',
  'bug',
  'adr',
  'context',
  'brief',
  'regression',
  'mcp',
  'hooks',
]);

describe('shouldLaunchTUI', () => {
  it('launches TUI when no args', () => {
    expect(shouldLaunchTUI([], COMMAND_NAMES)).toBe(true);
  });

  it('launches CLI for known command', () => {
    expect(shouldLaunchTUI(['check'], COMMAND_NAMES)).toBe(false);
  });

  it('launches CLI for subcommand with flags', () => {
    expect(shouldLaunchTUI(['task', 'list'], COMMAND_NAMES)).toBe(false);
  });

  it('launches CLI for --help', () => {
    expect(shouldLaunchTUI(['--help'], COMMAND_NAMES)).toBe(false);
  });

  it('launches CLI for -v', () => {
    expect(shouldLaunchTUI(['-v'], COMMAND_NAMES)).toBe(false);
  });

  it('launches TUI for unknown flag-only args', () => {
    expect(shouldLaunchTUI(['--root', '/path'], COMMAND_NAMES)).toBe(true);
  });

  it('launches CLI for check with --staged flag', () => {
    expect(shouldLaunchTUI(['check', '--staged'], COMMAND_NAMES)).toBe(false);
  });

  it('launches CLI for regression with subcommands', () => {
    expect(shouldLaunchTUI(['regression', 'run', 'REG-001'], COMMAND_NAMES)).toBe(false);
  });
});

describe('hasOnlyVersionRequest', () => {
  it('returns true for -v only', () => {
    expect(hasOnlyVersionRequest(['-v'])).toBe(true);
  });

  it('returns false for --help only', () => {
    expect(hasOnlyVersionRequest(['--help'])).toBe(false);
  });

  it('returns false for check command', () => {
    expect(hasOnlyVersionRequest(['check'])).toBe(false);
  });

  it('returns false for command with --help', () => {
    expect(hasOnlyVersionRequest(['task', '--help'])).toBe(false);
  });
});
