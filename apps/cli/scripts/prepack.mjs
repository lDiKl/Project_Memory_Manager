#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PREPARE FOR PUBLISH
 *
 * This script:
 *  1. Builds all packages
 *  2. Vendors @pmem/core and @pmem/shared-types into apps/cli/dist
 *  3. Rewrites ESM imports from bare specifiers to relative paths
 *  4. Copies templates/
 *  5. Removes workspace:* deps from apps/cli/package.json
 *
 * After running this, cd apps/cli && npm publish
 * Then run postpack.mjs to restore.
 */
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const cliRoot = join(__dirname, '..');
const repoRoot = join(cliRoot, '..', '..');
const cliDist = join(cliRoot, 'dist');
async function buildPackages() {
  console.log('[prepack] Building packages...');
  execSync('pnpm build', { cwd: repoRoot, stdio: 'inherit' });
}

async function vendorPackage(pkgDirName) {
  const srcDist = join(repoRoot, 'packages', pkgDirName, 'dist');
  const srcPkg = join(repoRoot, 'packages', pkgDirName, 'package.json');
  const destDir = join(cliDist, '@pmem', pkgDirName);

  if (!existsSync(srcDist)) {
    throw new Error(`Missing dist for ${pkgDirName}: ${srcDist}`);
  }

  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  for (const entry of await readdir(srcDist, { withFileTypes: true })) {
    await cp(join(srcDist, entry.name), join(destDir, entry.name), { recursive: true });
  }
  await removeTestBuildArtifacts(destDir);

  const pkg = JSON.parse(await readFile(srcPkg, 'utf-8'));
  await writeFile(join(destDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[prepack] Vendored @pmem/${pkgDirName} → dist/@pmem/${pkgDirName}/`);
}

async function removeTestBuildArtifacts(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await removeTestBuildArtifacts(path);
    } else if (entry.name.includes('.test.')) {
      await rm(path, { force: true });
    }
  }
}

async function rewriteImports(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await rewriteImports(path);
    } else if (entry.name.endsWith('.js')) {
      let content = await readFile(path, 'utf-8');
      const rel = relative(cliDist, path);
      const depth = dirname(rel) === '.' ? 0 : dirname(rel).split('/').length;
      const prefix = depth === 0 ? './' : '../'.repeat(depth);

      const orig = content;
      content = content.replaceAll(`from "@pmem/core"`, `from "${prefix}@pmem/core/index.js"`);
      content = content.replaceAll(
        `import("@pmem/core")`,
        `import("${prefix}@pmem/core/index.js")`,
      );
      content = content.replaceAll(
        `from "@pmem/shared-types"`,
        `from "${prefix}@pmem/shared-types/index.js"`,
      );
      content = content.replaceAll(
        `import("@pmem/shared-types")`,
        `import("${prefix}@pmem/shared-types/index.js")`,
      );

      if (content !== orig) {
        await writeFile(path, content);
        console.log(`[prepack] Rewrote imports in ${rel}`);
      }
    }
  }
}

async function copyTemplates() {
  const src = join(repoRoot, 'templates');
  const dest = join(cliRoot, 'templates');
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  console.log('[prepack] Copied templates/ → apps/cli/templates/');
}

async function patchPackageJson() {
  const pkgPath = join(cliRoot, 'package.json');
  const backupPath = join(cliRoot, 'package.json.bak');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

  // backup
  await writeFile(backupPath, `${JSON.stringify(pkg, null, 2)}\n`);

  pkg.dependencies['@pmem/core'] = undefined;
  pkg.dependencies['@pmem/shared-types'] = undefined;

  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log('[prepack] Removed workspace deps from package.json');
  console.log('[prepack] Backup saved to package.json.bak');
}

async function main() {
  try {
    await buildPackages();
    await vendorPackage('core');
    await vendorPackage('shared-types');
    await rewriteImports(cliDist);
    await copyTemplates();
    await patchPackageJson();
    console.log('[prepack] ✅ Ready for publish.');
    console.log('[prepack] Next steps:');
    console.log('  cd apps/cli');
    console.log('  npm publish --access public');
    console.log('  cd ../..');
    console.log('  node apps/cli/scripts/postpack.mjs');
  } catch (err) {
    console.error('[prepack] ❌ Failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
