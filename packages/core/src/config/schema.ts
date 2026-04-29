import { z } from 'zod';

// ─── .project-memory.yml ─────────────────────────────────────────────────────

export const ProjectMemoryConfigSchema = z.object({
  version: z.literal(1),

  project: z.object({
    name: z.string().min(1),
    docs_root: z.string().default('docs'),
    default_branch: z.string().default('main'),
  }),

  records: z
    .object({
      task_prefix: z.string().default('TASK'),
      bug_prefix: z.string().default('BUG'),
      adr_prefix: z.string().default('ADR'),
      reg_prefix: z.string().default('REG'),
    })
    .default({}),

  paths: z
    .object({
      docs_map: z.string().default('docs-map.yml'),
      templates: z.string().default('templates'),
    })
    .default({}),

  features: z
    .object({
      web_ui: z.boolean().default(false),
      ai: z.boolean().default(false),
      cloud_sync: z.boolean().default(false),
      jira: z.boolean().default(false),
      confluence: z.boolean().default(false),
    })
    .default({}),

  checks: z
    .object({
      warn_on_missing_docs_update: z.boolean().default(true),
      block_commit: z.boolean().default(false),
      require_docs_impact_section: z.boolean().default(true),
      ignore: z
        .array(z.string())
        .default(['.git/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**']),
    })
    .default({}),
});

export type ProjectMemoryConfig = z.infer<typeof ProjectMemoryConfigSchema>;

// ─── docs-map.yml ─────────────────────────────────────────────────────────────

export const ModuleEntrySchema = z.object({
  description: z.string().optional(),
  code: z.array(z.string()).default([]),
  docs: z.array(z.string()).default([]),
  owners: z.array(z.string()).default([]),
  context: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  tests: z.array(z.string()).optional(),
  regressions: z.array(z.string()).optional(),
  commands: z.record(z.string()).optional(),
});

export const DocsMapSchema = z.object({
  modules: z.record(z.string(), ModuleEntrySchema).default({}),
});

export type DocsMap = z.infer<typeof DocsMapSchema>;
export type ModuleEntry = z.infer<typeof ModuleEntrySchema>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  version: 1 as const,
  project: {
    name: 'My Project',
    docs_root: 'docs',
    default_branch: 'main',
  },
  records: {
    task_prefix: 'TASK',
    bug_prefix: 'BUG',
    adr_prefix: 'ADR',
    reg_prefix: 'REG',
  },
  paths: {
    docs_map: 'docs-map.yml',
    templates: 'templates',
  },
  features: {
    web_ui: false,
    ai: false,
    cloud_sync: false,
    jira: false,
    confluence: false,
  },
  checks: {
    warn_on_missing_docs_update: true,
    block_commit: false,
    require_docs_impact_section: true,
    ignore: ['.git/**', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  },
} satisfies ProjectMemoryConfig;

export const DEFAULT_DOCS_MAP: DocsMap = {
  modules: {
    example: {
      description: 'Example module. Replace or remove after `pmem scan`.',
      code: ['src/example/**'],
      docs: ['docs/modules/example/overview.md'],
      owners: [],
    },
  },
};
