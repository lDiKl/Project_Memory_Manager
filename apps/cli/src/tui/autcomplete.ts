export const AVAILABLE_COMMANDS = [
  '/init',
  '/scan',
  '/check',
  '/task',
  '/bug',
  '/adr',
  '/context',
  '/brief',
  '/regression',
  '/help',
  '/clear',
  '/exit',
] as const;

export const SUBCOMMANDS: Record<string, string[]> = {
  '/task': ['create', 'list', 'show', 'close'],
  '/bug': ['create', 'list', 'show', 'append'],
  '/adr': ['create', 'list', 'show', 'accept'],
  '/context': ['build', 'list-packs'],
  '/regression': ['create', 'run', 'list', 'status'],
};

export type AvailableCommand = (typeof AVAILABLE_COMMANDS)[number];

export function autocomplete(input: string): string | null {
  if (!input || !input.startsWith('/')) return null;

  const parts = input.split(/\s+/);
  const command = parts[0] ?? '';

  if (parts.length > 1 && !input.endsWith(' ')) {
    const subcommands = SUBCOMMANDS[command] ?? [];
    const partial = parts[1] ?? '';
    const match = completeFrom(subcommands, partial);
    return match ? `${command} ${match}` : null;
  }

  if (SUBCOMMANDS[command] && input === command) {
    return `${command} `;
  }

  const match = completeFrom([...AVAILABLE_COMMANDS], command);
  return match ? `${match}${SUBCOMMANDS[match] ? ' ' : ''}` : null;
}

export function suggestions(input: string): string[] {
  if (!input.startsWith('/')) return [];
  if (input === '/') return [...AVAILABLE_COMMANDS];

  const parts = input.split(/\s+/);
  const command = parts[0] ?? '';

  if (parts.length > 1) {
    const subcommands = SUBCOMMANDS[command] ?? [];
    const partial = parts[1] ?? '';
    return subcommands.filter((sub) => sub.startsWith(partial)).map((sub) => `${command} ${sub}`);
  }

  return AVAILABLE_COMMANDS.filter((cmd) => cmd.startsWith(command));
}

function completeFrom(values: string[], input: string): string | null {
  if (!input) return null;
  const matching = values.filter((value) => value.startsWith(input));
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0] === input ? null : (matching[0] ?? null);

  const first = matching[0] ?? '';
  let i = input.length;
  while (i < first.length) {
    const ch = first[i];
    if (ch !== undefined && matching.every((value) => value[i] === ch)) i++;
    else break;
  }

  const common = first.slice(0, i);
  return common === input ? null : common;
}
