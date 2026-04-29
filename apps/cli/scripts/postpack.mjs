#!/usr/bin/env node
/**
 * POST-PUBLISH CLEANUP
 *
 * Restores apps/cli/package.json from the backup created by prepack.mjs.
 */
import { rm } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const cliRoot = join(__dirname, '..');
const pkgPath = join(cliRoot, 'package.json');
const backupPath = join(cliRoot, 'package.json.bak');

async function main() {
  if (!existsSync(backupPath)) {
    console.log('[postpack] No backup found, nothing to restore.');
    return;
  }
  await rm(pkgPath, { force: true });
  renameSync(backupPath, pkgPath);
  console.log('[postpack] ✅ Restored original package.json');
}

main().catch((err) => {
  console.error('[postpack] ❌ Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
