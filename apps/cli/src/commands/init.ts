import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  DEFAULT_CONFIG,
  DEFAULT_DOCS_MAP,
  type ProjectMemoryConfig,
  findProjectRoot,
  writeYaml,
} from '@pmem/core';
import type { Command } from 'commander';
import { ui } from '../ui.js';

interface InitOptions {
  root?: string;
  force: boolean;
  name?: string;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize Project Memory Manager in the current repository.')
    .option('--root <path>', 'Project root (defaults to nearest .git or .project-memory.yml).')
    .option('--force', 'Overwrite existing PMEM config files.', false)
    .option('--name <name>', 'Project name (defaults to current directory name).')
    .action(async (opts: InitOptions) => {
      try {
        await runInit(opts);
      } catch (err) {
        ui.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}

async function runInit(opts: InitOptions): Promise<void> {
  const root = opts.root ? resolve(opts.root) : await findProjectRoot();
  const projectName = opts.name ?? basename(root);

  const configPath = join(root, '.project-memory.yml');
  const docsMapPath = join(root, 'docs-map.yml');

  // â”€â”€ Conflict check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const configExists = await fileExists(configPath);
  if (configExists && !opts.force) {
    ui.warn(`PMEM is already initialized (${configPath}).`);
    ui.info('Run `pmem init --force` to overwrite config files.');
    return;
  }

  // â”€â”€ Write .project-memory.yml â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const config: ProjectMemoryConfig = {
    ...DEFAULT_CONFIG,
    project: { ...DEFAULT_CONFIG.project, name: projectName },
  };
  await writeYaml(configPath, config);

  // â”€â”€ Write docs-map.yml â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!(await fileExists(docsMapPath)) || opts.force) {
    await writeYaml(docsMapPath, DEFAULT_DOCS_MAP);
  }

  // â”€â”€ Scaffold docs/ structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const docsRoot = join(root, config.project.docs_root);
  await scaffoldDocs(docsRoot, projectName, root);

  // â”€â”€ Create .gitignore with .pmem/ entry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await createGitignore(root);

  // â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ui.blank();
  ui.header('Project Memory Manager initialized.');
  ui.blank();
  ui.success(configPath.replace(`${root}/`, ''));
  ui.success(docsMapPath.replace(`${root}/`, ''));
  ui.success(`${config.project.docs_root}/`);
  ui.blank();
  ui.info('Next: run `pmem scan --write` to detect your project modules.');
}

async function createGitignore(root: string): Promise<void> {
  const gitignorePath = join(root, '.gitignore');
  let content = '';

  try {
    content = await readFile(gitignorePath, 'utf-8');
  } catch {
    // file doesn't exist yet
  }

  if (!content.includes('.pmem/')) {
    const newContent = content ? `${content.trimEnd()}\n` : '';
    await writeFile(
      gitignorePath,
      `${newContent}# PMEM regression results and caches\n.pmem/\n`,
      'utf-8',
    );
  }
}

async function scaffoldDocs(docsRoot: string, projectName: string, root: string): Promise<void> {
  const subdirs = [
    'project',
    'modules',
    'tasks',
    'bugs',
    'decisions',
    'agents',
    'llm',
    'knowledge',
    'context',
    join('llm', 'context-packs'),
  ];
  for (const dir of subdirs) {
    await mkdir(join(docsRoot, dir), { recursive: true });
  }

  // project/vision.md
  await createFile(
    join(docsRoot, 'project', 'vision.md'),
    `# ${projectName} â€” Vision\n\nDescribe the original project idea, goals, and constraints.\n`,
  );

  // project/architecture.md
  await createFile(
    join(docsRoot, 'project', 'architecture.md'),
    `# ${projectName} â€” Architecture\n\nDescribe the high-level architecture.\n`,
  );

  // project/roadmap.md
  await createFile(
    join(docsRoot, 'project', 'roadmap.md'),
    `# ${projectName} â€” Roadmap\n\n## Now\n\n## Next\n\n## Later\n`,
  );

  // llm/rules.md
  await createFile(
    join(docsRoot, 'llm', 'rules.md'),
    '# LLM Rules\n\nRules and constraints for AI assistants working on this project.\n',
  );

  // knowledge/stack.md
  await createFile(
    join(docsRoot, 'knowledge', 'stack.md'),
    '# Technology Stack\n\nList the approved libraries and tools.\n',
  );

  // README.md
  await createFile(
    join(docsRoot, 'README.md'),
    `${[
      `# Project Memory â€” ${projectName}`,
      '',
      'Managed by [Project Memory Manager](https://github.com/lDiKl/Project_Memory_Manager).',
      '',
      '| Folder | Purpose |',
      '|---|---|',
      '| `project/` | Vision, architecture, roadmap. |',
      '| `modules/` | Per-module documentation. |',
      '| `tasks/` | Tasks (TASK-XXX). |',
      '| `bugs/` | Bugs (BUG-XXX). |',
      '| `decisions/` | Architecture decisions (ADR-XXX). |',
      '| `agents/` | Agent workflows and tool contracts. |',
      '| `llm/` | Rules and prompts for AI assistants. |',
      '| `knowledge/` | Stack, patterns, conventions. |',
      '| `context/` | Module-level context for LLMs. |',
    ].join('\n')}\n`,
  );

  // agents/
  await createFile(
    join(docsRoot, 'agents', 'README.md'),
    `${[
      '# Agent Workflows',
      '',
      'This folder defines how AI coding agents should use PMEM as a project-memory tool.',
      '',
      '- `tool-contract.md` - stable command and output expectations for agents.',
      '- `workflows.md` - standard flows for features, bugs, refactors, and imported work.',
      '- `examples.md` - concrete user prompts and PMEM command sequences.',
      '',
      '`docs/llm/` describes what the model should know. `docs/agents/` describes what the agent should do with PMEM.',
    ].join('\n')}\n`,
  );

  await createFile(
    join(docsRoot, 'agents', 'tool-contract.md'),
    `${[
      '# Agent Tool Contract',
      '',
      'Agents should use PMEM through stable commands and machine-readable output.',
      '',
      '## Required commands',
      '',
      '```bash',
      'pmem task create "Title" --json',
      'pmem task show TASK-001 --json',
      'pmem context build --task TASK-001 --pack feature --json',
      'pmem check --records --json',
      'pmem regression run TASK-001 --json',
      '```',
      '',
      'Agents must update the related task or bug after non-trivial work.',
    ].join('\n')}\n`,
  );

  await createFile(
    join(docsRoot, 'agents', 'workflows.md'),
    `${[
      '# Agent Workflows',
      '',
      '## New feature',
      '',
      '```bash',
      'pmem task create "Feature title" --json',
      'pmem context build --task TASK-001 --pack feature --json',
      'pmem check --records --json',
      'pmem task update TASK-001 --json',
      '```',
      '',
      '## Bugfix',
      '',
      '```bash',
      'pmem bug create "Bug title" --json',
      'pmem context build --bug BUG-001 --pack bugfix --include-regressions --json',
      'pmem regression run BUG-001 --json',
      'pmem bug append BUG-001 --json',
      '```',
    ].join('\n')}\n`,
  );

  await createFile(
    join(docsRoot, 'agents', 'examples.md'),
    `${[
      '# Agent Examples',
      '',
      'User: "Add a registration form."',
      '',
      '```bash',
      'pmem task create "Add registration form" --json',
      'pmem context build --task TASK-001 --pack feature --json',
      '```',
      '',
      'User: "TASK-014 was imported from Jira. Implement it."',
      '',
      '```bash',
      'pmem task show TASK-014 --json',
      'pmem context build --task TASK-014 --pack feature --include-regressions --json',
      '```',
    ].join('\n')}\n`,
  );

  // Create project-root CLAUDE.md
  await createFile(
    join(root, 'CLAUDE.md'),
    `# Project Memory Manager\n\nThis project uses Project Memory Manager to track code, docs, tasks, bugs, and ADRs.\n\n## Usage\n\n- \`pmem check\` â€” Check for docs drift.\n- \`pmem context build --diff\` â€” Get context for current changes.\n- \`pmem context build --pack bugfix\` â€” Get bugfix context pack.\n- \`pmem task create "<title>"\` â€” Create a new task.\n- \`pmem bug create "<title>"\` â€” Create a new bug.\n\n## Rules for AI Coding Assistants\n\n1. Always run \`pmem check\` after code changes.\n2. Use \`pmem context build\` to get focused context before working on bugs/tasks.\n3. Respect the \`DO NOT CHANGE\` list in context packs.\n4. Check \`docs-map.yml\` to understand module boundaries.\n`,
  );

  // Create project-root AGENTS.md
  await createFile(
    join(root, 'AGENTS.md'),
    `# Agent Instructions

This project uses Project Memory Manager (PMEM) as repository-owned project memory.

## Agent workflow

1. For new work, create or find a PMEM task/bug.
2. Build focused context before editing.
3. Run checks and regressions before finishing.
4. Update the related PMEM record with results.

## Commands (CLI)

\`\`\`bash
pmem task create "Title" --json
pmem task show TASK-001 --json
pmem context build --task TASK-001 --pack feature --json
pmem check --records --json
pmem regression run TASK-001 --json
pmem task update TASK-001 --json
\`\`\`

## MCP Server (recommended for AI coding agents)

PMEM exposes a local MCP server for AI coding agents that support the Model Context Protocol.
The server runs over stdio â€” no ports, no network, no cloud.

### One-time setup

**Claude Code** (\`~/.claude/settings.json\`):
\`\`\`json
{ "mcpServers": { "pmem": { "command": "pmem", "args": ["mcp"] } } }
\`\`\`

**Cursor** (Settings â†’ MCP â†’ Add new global MCP):
\`\`\`json
{ "pmem": { "command": "pmem", "args": ["mcp"] } }
\`\`\`

**opencode** (\`~/.opencode.json\`):
\`\`\`json
{ "mcp": { "pmem": { "command": "pmem", "args": ["mcp"] } } }
\`\`\`

**GitHub Copilot** (\`.github/copilot-mcp.json\` in the repo):
\`\`\`json
{ "mcpServers": { "pmem": { "command": "pmem", "args": ["mcp"] } } }
\`\`\`

Once configured, the AI client discovers all pmem tools automatically with full JSON Schema
descriptions â€” no need to read documentation or guess CLI flags.

Use \`docs/agents/\` for workflow details and \`docs/llm/\` for model rules and prompt recipes.
`,
  );

  // Create context packs
  const packKinds = ['bugfix', 'feature', 'refactor', 'architecture'];
  for (const kind of packKinds) {
    const content = getPackTemplate(kind);
    await createFile(join(docsRoot, 'llm', 'context-packs', `${kind}-pack.md`), content);
  }

  // Create module context template
  const contextContent = `# <module> Context

This file provides high-level context about this module for AI coding assistants.

## Purpose

Brief description of what this module does and its role in the system.

## Key Components

- Main exports
- Core abstractions
- Public API surface

## Dependencies

- Direct dependencies on other modules
- External libraries with project-scoped usage

## Common Patterns

- How to add new features
- Testing strategy
- Code organization

## Do Not Change

- Public interface contracts
- Serialization formats
- Environment variables used

## Recent Changes

[List recent ADRs or major refactorings that affect this module]
`;
  await createFile(join(docsRoot, 'context', 'module.context.md'), contextContent);
}

function getPackTemplate(kind: string): string {
  const capitalized = kind === 'bugfix' ? 'Bugfix' : kind.charAt(0).toUpperCase() + kind.slice(1);
  if (kind === 'bugfix') {
    return `---
title: Bugfix Context Pack
description: Context pack for debugging and fixing bugs
include:
  - 'module context'
  - 'current state of bug'
  - 'related ADRs'
  - 'regression commands'
exclude:
  - full bug history
  - unrelated modules
format: focused markdown for LLM
---

This pack is optimized for debugging and fixing bugs efficiently.

## What It Includes

1. Module-level context from docs/context/
2. Bug's current_state.md (if present) or full bug description
3. ADRs related to the touched modules
4. Regression commands that failed
5. "Do not change" directives from docs-map.yml

## What It Excludes

- Full bug history (summarized in current_state.md)
- Irrelevant module details
- Long code snippets (prefer references)

## Usage

\`\`\`bash
pmem context build --bug BUG-XXX --pack bugfix
\`\`\`
`;
  }
  if (kind === 'feature') {
    return `---
title: Feature Context Pack
description: Context pack for implementing new features
include:
  - 'module context'
  - 'related ADRs'
  - 'current state'
  - 'test patterns'
exclude:
  - unrelated modules
  - implementation details
format: focused markdown for LLM
---

This pack is optimized for implementing new features.

## What It Includes

1. Module-level context from docs/context/
2. Feature's current_state.md (if present) or full task description
3. ADRs related to the touched modules
4. Test patterns and examples
5. "Do not change" directives

## What It Excludes

- Irrelevant module details
- Implementation artifacts
- Long test files (prefer references)

## Usage

\`\`\`bash
pmem context build --task TASK-XXX --pack feature
\`\`\`
`;
  }
  if (kind === 'refactor') {
    return `---
title: Refactor Context Pack
description: Context pack for code refactoring
include:
  - 'module context'
  - 'current state'
  - 'test coverage'
  - 'ADR decisions about the module'
exclude:
  - unrelated modules
  - implementation details
format: focused markdown for LLM
---

This pack is optimized for code refactoring.

## What It Includes

1. Module-level context from docs/context/
2. Refactoring task's current_state.md or full task description
3. ADRs related to the module architecture
4. Test coverage patterns
5. "Do not change" directives (public API, contracts)

## What It Excludes

- Irrelevant module details
- Old implementation artifacts
- Test history (focus on current state)

## Usage

\`\`\`bash
pmem context build --task TASK-XXX --pack refactor
\`\`\`
`;
  }
  return `---
title: Architecture Context Pack
description: Context pack for architectural decisions and planning
include:
  - 'project vision'
  - 'current architecture'
  - 'ADR history'
  - 'module boundaries'
exclude:
  - implementation details
  - code snippets
format: focused markdown for LLM
---

This pack is optimized for architectural discussions and planning.

## What It Includes

1. Project vision from docs/project/vision.md
2. Current architecture from docs/project/architecture.md
3. ADRs related to architecture decisions
4. Module boundaries and relationships
5. Technology stack

## What It Excludes

- Implementation details
- Specific code examples
- Test coverage details

## Usage

\`\`\`bash
pmem context build --task TASK-XXX --pack architecture
\`\`\`
`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function createFile(path: string, content: string): Promise<void> {
  if (await fileExists(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

