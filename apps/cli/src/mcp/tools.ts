import { z } from 'zod';

const commonRootField = {
  root: z
    .string()
    .optional()
    .describe('Project root path. Defaults to auto-detected project root.'),
};

export const TOOL_DEFINITIONS = {
  pmem_init: {
    description:
      'Initialize Project Memory Manager in the current repository. Creates .project-memory.yml, docs-map.yml, and docs/ structure.',
    inputSchema: {
      force: z.boolean().optional().describe('Overwrite existing PMEM config files.'),
      name: z.string().optional().describe('Project name. Defaults to current directory name.'),
      ...commonRootField,
    },
  },
  pmem_scan: {
    description:
      'Scan the repository and detect modules. Returns detected modules with code and docs paths.',
    inputSchema: {
      write: z.boolean().optional().describe('Write detected modules to docs-map.yml.'),
      ...commonRootField,
    },
  },
  pmem_check: {
    description:
      'Check which documentation files are at risk based on changed source files. Returns a drift report.',
    inputSchema: {
      staged: z.boolean().optional().describe('Check staged files (git diff --cached).'),
      base: z.string().optional().describe('Compare HEAD against a base branch (e.g. main).'),
      strict: z
        .boolean()
        .optional()
        .describe('Return error status if any docs are missing updates.'),
      records: z
        .boolean()
        .optional()
        .describe('Cross-check open tasks with docs_impact: required.'),
      ...commonRootField,
    },
  },
  pmem_task_create: {
    description: 'Create a new task record in project memory.',
    inputSchema: {
      title: z.string().describe('Task title.'),
      module: z.array(z.string()).optional().describe('Affected module(s).'),
      source: z.string().optional().describe('External source: jira, linear, github, manual.'),
      external_id: z.string().optional().describe('External issue/task ID.'),
      external_url: z.string().optional().describe('External issue/task URL.'),
      ...commonRootField,
    },
  },
  pmem_task_show: {
    description: 'Show a task record by ID.',
    inputSchema: {
      id: z.string().describe('Task ID, e.g. TASK-001.'),
      ...commonRootField,
    },
  },
  pmem_task_list: {
    description: 'List all task records.',
    inputSchema: {
      status: z.string().optional().describe('Filter by status: open, in_progress, blocked, done.'),
      ...commonRootField,
    },
  },
  pmem_task_update: {
    description: 'Update a task record frontmatter and/or append a note.',
    inputSchema: {
      id: z.string().describe('Task ID, e.g. TASK-001.'),
      status: z.string().optional().describe('Set task status.'),
      docs_impact: z.string().optional().describe('Set docs impact: none, required, completed.'),
      module: z.array(z.string()).optional().describe('Replace affected module(s).'),
      source: z.string().optional().describe('Set external source name.'),
      external_id: z.string().optional().describe('Set external issue/task ID.'),
      external_url: z.string().optional().describe('Set external issue/task URL.'),
      append: z.string().optional().describe('Append an auditable note to the task body.'),
      ...commonRootField,
    },
  },
  pmem_task_close: {
    description: 'Mark a task as done.',
    inputSchema: {
      id: z.string().describe('Task ID, e.g. TASK-001.'),
      ...commonRootField,
    },
  },
  pmem_bug_create: {
    description: 'Create a new bug record in project memory.',
    inputSchema: {
      title: z.string().describe('Bug title.'),
      severity: z.string().optional().describe('Bug severity: low, medium, high, critical.'),
      module: z.array(z.string()).optional().describe('Affected module(s).'),
      source: z.string().optional().describe('External source: jira, linear, github, manual.'),
      external_id: z.string().optional().describe('External issue ID.'),
      external_url: z.string().optional().describe('External issue URL.'),
      ...commonRootField,
    },
  },
  pmem_bug_show: {
    description: 'Show a bug record by ID.',
    inputSchema: {
      id: z.string().describe('Bug ID, e.g. BUG-001.'),
      ...commonRootField,
    },
  },
  pmem_bug_list: {
    description: 'List all bug records.',
    inputSchema: {
      status: z.string().optional().describe('Filter by status: open, in_progress, blocked, done.'),
      ...commonRootField,
    },
  },
  pmem_bug_update: {
    description: 'Update a bug record frontmatter and/or append a note.',
    inputSchema: {
      id: z.string().describe('Bug ID, e.g. BUG-001.'),
      status: z.string().optional().describe('Set bug status.'),
      severity: z.string().optional().describe('Set bug severity.'),
      module: z.array(z.string()).optional().describe('Replace affected module(s).'),
      source: z.string().optional().describe('Set external source name.'),
      external_id: z.string().optional().describe('Set external issue ID.'),
      external_url: z.string().optional().describe('Set external issue URL.'),
      append: z.string().optional().describe('Append an auditable note to the bug body.'),
      ...commonRootField,
    },
  },
  pmem_bug_append: {
    description: 'Append an investigation attempt to a bug record.',
    inputSchema: {
      id: z.string().describe('Bug ID, e.g. BUG-001.'),
      note: z
        .string()
        .optional()
        .describe('Append this note instead of the default attempt template.'),
      ...commonRootField,
    },
  },
  pmem_adr_create: {
    description: 'Create a new Architecture Decision Record (ADR).',
    inputSchema: {
      title: z.string().describe('ADR title.'),
      ...commonRootField,
    },
  },
  pmem_adr_show: {
    description: 'Show an ADR by ID.',
    inputSchema: {
      id: z.string().describe('ADR ID, e.g. ADR-001.'),
      ...commonRootField,
    },
  },
  pmem_adr_list: {
    description: 'List all Architecture Decision Records.',
    inputSchema: {
      ...commonRootField,
    },
  },
  pmem_adr_accept: {
    description: 'Mark an ADR as accepted.',
    inputSchema: {
      id: z.string().describe('ADR ID, e.g. ADR-001.'),
      ...commonRootField,
    },
  },
  pmem_context_build: {
    description:
      'Build a context pack for LLM consumption. Returns markdown content with relevant project context.',
    inputSchema: {
      task: z.string().optional().describe('Include context for this task ID.'),
      bug: z.string().optional().describe('Include context for this bug ID.'),
      files: z.array(z.string()).optional().describe('Include context for these file paths.'),
      diff: z
        .boolean()
        .optional()
        .describe('Include context for current diff (staged or working).'),
      pack: z
        .string()
        .optional()
        .describe('Built-in context pack kind: bugfix, feature, refactor, architecture.'),
      include_regressions: z
        .boolean()
        .optional()
        .describe('Include regression check results in the context pack.'),
      output: z.string().optional().describe('Write to file instead of returning content.'),
      ...commonRootField,
    },
  },
  pmem_context_list_packs: {
    description: 'List available context pack kinds.',
    inputSchema: {
      ...commonRootField,
    },
  },
  pmem_brief: {
    description: 'Create/update a current-state brief for a record.',
    inputSchema: {
      file: z.string().describe('The brief file content.'),
      task: z.string().optional().describe('Update task record current-state.md.'),
      bug: z.string().optional().describe('Update bug record current-state.md.'),
      ...commonRootField,
    },
  },
  pmem_regression_create: {
    description: 'Create a new regression check record.',
    inputSchema: {
      bug: z.string().optional().describe('Related bug ID.'),
      task: z.string().optional().describe('Related task ID.'),
      module: z.array(z.string()).optional().describe('Related module(s).'),
      title: z.string().optional().describe('Regression title.'),
      ...commonRootField,
    },
  },
  pmem_regression_run: {
    description: 'Run a regression check, or all checks related to a task/bug.',
    inputSchema: {
      id: z.string().describe('Regression ID (REG-XXX), bug ID (BUG-XXX), or task ID (TASK-XXX).'),
      ...commonRootField,
    },
  },
  pmem_regression_list: {
    description: 'List regression check records.',
    inputSchema: {
      bug: z.string().optional().describe('Filter by bug ID.'),
      task: z.string().optional().describe('Filter by task ID.'),
      module: z.string().optional().describe('Filter by module name.'),
      ...commonRootField,
    },
  },
  pmem_regression_status: {
    description: 'Show regression check status.',
    inputSchema: {
      id: z.string().optional().describe('Specific regression ID.'),
      ...commonRootField,
    },
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;
