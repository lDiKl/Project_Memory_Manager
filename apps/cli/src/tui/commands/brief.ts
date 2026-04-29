import { message } from '../format.js';
import type { TuiBlock, TuiContext } from '../types.js';

export async function runBrief(args: string[], _context: TuiContext): Promise<TuiBlock> {
  const file = args[0];
  if (!file) return message('error', 'Usage: /brief <file>');
  return message('info', `Brief opens an editor - use CLI mode: pmem brief ${file}`);
}
