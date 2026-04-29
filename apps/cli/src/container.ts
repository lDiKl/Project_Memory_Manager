// Assembles core services for a given project root.
// The CLI calls this once per invocation; future `pmem serve` will call it at startup.

import {
  type DocsMap,
  type ProjectMemoryConfig,
  findProjectRoot,
  loadConfig,
  loadDocsMap,
} from '@pmem/core';

export interface Container {
  root: string;
  config: ProjectMemoryConfig;
  docsMap: DocsMap;
}

export interface ContainerOptions {
  /** Override the project root (e.g. from --root flag). */
  root?: string;
  /** Skip loading docs-map.yml (for `pmem init` which runs before the map exists). */
  skipDocsMap?: boolean;
}

export async function createContainer(opts: ContainerOptions = {}): Promise<Container> {
  const root = opts.root ?? (await findProjectRoot());
  const config = await loadConfig(root);
  const docsMap = opts.skipDocsMap ? { modules: {} } : await loadDocsMap(root, config);

  return { root, config, docsMap };
}
