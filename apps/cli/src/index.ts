import { Command } from 'commander';

const commandNames = new Set([
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

function shouldLaunchTUI(): boolean {
  const args = process.argv.slice(2);
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

function hasOnlyVersionRequest(): boolean {
  const args = process.argv.slice(2);
  return args.length > 0 && args.every((a) => a === '--version' || a === '-v');
}

function isMcpCommand(): boolean {
  return process.argv.length > 2 && process.argv[2] === 'mcp';
}

if (isMcpCommand()) {
  const { startMcpServer } = await import('./mcp/server.js');
  await startMcpServer();
} else if (shouldLaunchTUI()) {
  import('./tui/launch.js').then(({ launchTUI }) =>
    launchTUI().catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }),
  );
} else if (hasOnlyVersionRequest()) {
  const program = new Command();
  program
    .name('pmem')
    .description('Project Memory Manager — git-native project memory and docs-drift tracker.')
    .version('1.0.0', '-v, --version', 'output the current version');
  program.parseAsync(process.argv);
} else {
  const program = new Command();
  program
    .name('pmem')
    .description('Project Memory Manager — git-native project memory and docs-drift tracker.')
    .version('1.0.0', '-v, --version', 'output the current version');

  const { registerInit } = await import('./commands/init.js');
  const { registerScan } = await import('./commands/scan.js');
  const { registerCheck } = await import('./commands/check.js');
  const { registerTask } = await import('./commands/task.js');
  const { registerBug } = await import('./commands/bug.js');
  const { registerAdr } = await import('./commands/adr.js');
  const { registerContext } = await import('./commands/context.js');
  const { registerBrief } = await import('./commands/brief.js');
  const { registerRegression } = await import('./commands/regression.js');
  const { registerHooks } = await import('./commands/hooks.js');

  registerInit(program);
  registerScan(program);
  registerCheck(program);
  registerTask(program);
  registerBug(program);
  registerAdr(program);
  registerContext(program);
  registerBrief(program);
  registerRegression(program);
  registerHooks(program);

  const { ui } = await import('./ui.js');
  const { PmemError } = await import('@pmem/core');

  program.parseAsync(process.argv).catch((err: unknown) => {
    if (err instanceof PmemError) {
      ui.error(`[${err.code}] ${err.message}`);
    } else {
      ui.error(err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  });
}
