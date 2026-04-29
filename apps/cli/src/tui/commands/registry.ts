import { message } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export interface TuiCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  run(args: string[], context: TuiContext): Promise<TuiBlock>;
}

export const COMMANDS: TuiCommand[] = [
  {
    name: '/init',
    description: 'Initialize PMM',
    usage: '/init [--force] [--name name]',
    run: async (args, context) => (await import('./init.js')).runInit(args, context),
  },
  {
    name: '/scan',
    description: 'Detect modules',
    usage: '/scan [--write]',
    run: async (args, context) => (await import('./scan.js')).runScan(args, context),
  },
  {
    name: '/check',
    description: 'Check docs drift',
    usage: '/check [--staged] [--base branch]',
    run: async (args, context) => (await import('./check.js')).runCheck(args, context),
  },
  {
    name: '/task',
    description: 'Manage tasks',
    usage: '/task create|list|show|close',
    run: async (args, context) => (await import('./task.js')).runTask(args, context),
  },
  {
    name: '/bug',
    description: 'Manage bugs',
    usage: '/bug create|list|show|append',
    run: async (args, context) => (await import('./bug.js')).runBug(args, context),
  },
  {
    name: '/adr',
    description: 'Manage ADRs',
    usage: '/adr create|list|show|accept',
    run: async (args, context) => (await import('./adr.js')).runAdr(args, context),
  },
  {
    name: '/context',
    description: 'Build context packs',
    usage: '/context build|list-packs',
    run: async (args, context) => (await import('./context.js')).runContext(args, context),
  },
  {
    name: '/brief',
    description: 'Open current-state brief',
    usage: '/brief <file>',
    run: async (args, context) => (await import('./brief.js')).runBrief(args, context),
  },
  {
    name: '/regression',
    description: 'Manage regressions',
    usage: '/regression create|run|list|status',
    run: async (args, context) => (await import('./regression.js')).runRegression(args, context),
  },
];

export async function executeCommand(input: string, context: TuiContext): Promise<TuiBlock> {
  const parts = parseCommandLine(input.trim());
  const raw = parts[0] ?? '';
  const name = raw.startsWith('/') ? raw : `/${raw}`;
  const args = parts.slice(1);
  const command = COMMANDS.find((item) => item.name === name || item.aliases?.includes(name));

  if (!command)
    return message('error', `Unknown command: ${raw}. Type /help for available commands.`);

  try {
    return await command.run(args, context);
  } catch (err) {
    return message('error', err instanceof Error ? err.message : String(err));
  }
}

export function helpBlock(): TuiBlock {
  return [
    { text: 'Available commands', style: 'title' },
    ...COMMANDS.map((command) => ({
      text: `  ${command.name.padEnd(12)} ${command.description}  ${command.usage}`,
      style: 'dim' as const,
    })),
    { text: '  /clear       Clear output', style: 'dim' },
    { text: '  /exit        Exit TUI', style: 'dim' },
  ];
}

export function parseCommandLine(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i] ?? '';
    if ((ch === '"' || ch === "'") && quote === null) {
      quote = ch;
      continue;
    }
    if (ch === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(ch) && quote === null) {
      if (current) {
        result.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (current) result.push(current);
  return result;
}
