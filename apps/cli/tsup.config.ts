import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/commands/init.ts',
    'src/commands/scan.ts',
    'src/commands/check.ts',
    'src/commands/task.ts',
    'src/commands/bug.ts',
    'src/commands/adr.ts',
    'src/commands/context.ts',
    'src/commands/brief.ts',
    'src/commands/regression.ts',
    'src/commands/hooks.ts',
    'src/ui.ts',
    'src/mcp/server.ts',
    'src/mcp/tools.ts',
    'src/mcp/handlers.ts',
  ],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  splitting: true,
});