import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function templatesRoot(): string {
  // When published: __dirname is dist/, templates is at package root
  const published = join(__dirname, '..', 'templates');
  // When in workspace dev: __dirname is src/, templates is 3 levels up
  const workspace = join(__dirname, '../../..', 'templates');
  return existsSync(join(published, 'docs-structure')) ? published : workspace;
}
