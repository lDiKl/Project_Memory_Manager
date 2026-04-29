// Terminal output helpers.
// Keep all chalk calls in this file so the rest of the CLI is testable without a TTY.

import chalk from 'chalk';

export const ui = {
  success: (msg: string) => console.log(`${chalk.green('✓')} ${msg}`),
  warn: (msg: string) => console.log(`${chalk.yellow('⚠')} ${msg}`),
  error: (msg: string) => console.error(`${chalk.red('✗')} ${msg}`),
  info: (msg: string) => console.log(`${chalk.cyan('→')} ${msg}`),
  dim: (msg: string) => console.log(chalk.dim(msg)),
  plain: (msg: string) => console.log(msg),
  blank: () => console.log(),
  header: (msg: string) => console.log(chalk.bold(msg)),
};
