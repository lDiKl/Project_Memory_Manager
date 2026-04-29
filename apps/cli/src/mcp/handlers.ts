import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type AdrRecord,
  BUG_ATTEMPT_TEMPLATE,
  type BugRecord,
  type ContextOptions,
  DEFAULT_CONFIG,
  DEFAULT_DOCS_MAP,
  type DocsMap,
  PmemError,
  type ProjectMemoryConfig,
  type RegressionRecord,
  type TaskRecord,
  buildContext,
  checkDrift,
  createRecord,
  detectModules,
  findProjectRoot,
  findRecord,
  getChangedFiles,
  getRegressionStatus,
  listContextPacks,
  listRecords,
  listRegressions,
  listRegressionsByBug,
  listRegressionsByModule,
  loadConfig,
  loadDocsMap,
  loadRegression,
  mergeDetectedIntoDocsMap,
  patchRecord,
  recordDir,
  recordPath,
  regressionDir,
  regressionPath,
  renderCurrentState,
  renderTemplate,
  runRegression,
  saveResult,
  writeDocsMap,
  writeYaml,
} from '@pmem/core';
import { templatesRoot } from '../paths.js';
import type { ToolName } from './tools.js';

type ToolArgs = Record<string, unknown>;

async function getRoot(args: ToolArgs): Promise<string> {
  return args.root ? resolve(args.root as string) : await findProjectRoot();
}

function text(content: unknown): { content: { type: 'text'; text: string }[] } {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
      },
    ],
  };
}

function errorResult(message: string): {
  content: { type: 'text'; text: string }[];
  isError: boolean;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

async function initProject(args: ToolArgs) {
  const root = await getRoot(args);
  const projectName = (args.name as string) || root.split('/').pop() || 'project';
  const force = (args.force as boolean) || false;

  const configPath = join(root, '.project-memory.yml');
  let configExists = false;
  try {
    await access(configPath);
    configExists = true;
  } catch {
    configExists = false;
  }

  if (configExists && !force) {
    return text({
      status: 'error',
      message: `PMEM already initialized at ${configPath}. Use --force to overwrite.`,
    });
  }

  const config: ProjectMemoryConfig = {
    ...DEFAULT_CONFIG,
    project: { ...DEFAULT_CONFIG.project, name: projectName },
  };
  await writeYaml(configPath, config);

  const docsMapPath = join(root, 'docs-map.yml');
  let docsMapExists = false;
  try {
    await access(docsMapPath);
    docsMapExists = true;
  } catch {
    docsMapExists = false;
  }
  if (!docsMapExists || force) {
    await writeYaml(docsMapPath, DEFAULT_DOCS_MAP);
  }

  const docsRoot = join(root, config.project.docs_root);
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

  const tplRoot = templatesRoot();

  const packKinds = ['bugfix', 'feature', 'refactor', 'architecture'];
  for (const kind of packKinds) {
    const packPath = join(docsRoot, 'llm', 'context-packs', `${kind}-pack.md`);
    if (!(await fileExists(packPath))) {
      const content = await readFile(
        join(tplRoot, 'docs-structure', 'llm', 'context-packs', `${kind}-pack.md`),
        'utf-8',
      ).catch(
        () =>
          `# ${kind.charAt(0).toUpperCase() + kind.slice(1)} Context Pack\n\nContext pack for ${kind}.\n`,
      );
      await mkdir(dirname(packPath), { recursive: true });
      await writeFile(packPath, content, 'utf-8');
    }
  }

  const contextPath = join(docsRoot, 'context', 'module.context.md');
  if (!(await fileExists(contextPath))) {
    await mkdir(dirname(contextPath), { recursive: true });
    await writeFile(
      contextPath,
      '# <module> Context\n\nModule-level context for AI coding assistants.\n',
      'utf-8',
    );
  }

  const agentsReadme = join(docsRoot, 'agents', 'README.md');
  if (!(await fileExists(agentsReadme))) {
    await mkdir(dirname(agentsReadme), { recursive: true });
    await writeFile(agentsReadme, '# Agent Workflows\n\nHow AI coding agents use PMEM.\n', 'utf-8');
  }

  const agentsMdPath = join(root, 'AGENTS.md');
  if (!(await fileExists(agentsMdPath))) {
    await writeFile(
      agentsMdPath,
      `# Agent Instructions

This project uses Project Memory Manager (PMEM) as repository-owned project memory.

## Agent workflow

1. For new work, create or find a PMEM task/bug.
2. Build focused context before editing.
3. Run checks and regressions before finishing.
4. Update the related PMEM record with results.

## MCP Server (recommended for AI coding agents)

PMEM exposes a local MCP server for AI coding agents that support the Model Context Protocol.
The server runs over stdio — no ports, no network, no cloud.

### One-time setup

**Claude Code** (\`~/.claude/settings.json\`):
\`\`\`json
{ "mcpServers": { "pmem": { "command": "pmem", "args": ["mcp"] } } }
\`\`\`

**Cursor** (Settings → MCP → Add new global MCP):
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
descriptions — no need to read documentation or guess CLI flags.
`,
      'utf-8',
    );
  }

  const gitignorePath = join(root, '.gitignore');
  let gitignoreContent = '';
  try {
    gitignoreContent = await readFile(gitignorePath, 'utf-8');
  } catch {
    // file doesn't exist
  }
  if (!gitignoreContent.includes('.pmem/')) {
    const newContent = gitignoreContent ? `${gitignoreContent.trimEnd()}\n` : '';
    await writeFile(
      gitignorePath,
      `${newContent}# PMEM regression results and caches\n.pmem/\n`,
      'utf-8',
    );
  }

  return text({
    status: 'ok',
    root,
    configPath: configPath.replace(`${root}/`, ''),
    docsMapPath: docsMapPath.replace(`${root}/`, ''),
  });
}

async function scanProject(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const write = (args.write as boolean) || false;

  const detected = await detectModules(root);
  if (detected.length === 0) {
    return text({ status: 'ok', detected: [], message: 'No modules detected.' });
  }

  let existingMap: DocsMap;
  try {
    existingMap = await loadDocsMap(root, config);
  } catch {
    existingMap = { modules: {} };
  }

  if (write) {
    const merged = mergeDetectedIntoDocsMap(existingMap, detected);
    await writeDocsMap(root, config, merged);
    return text({ status: 'ok', detected, message: 'docs-map.yml updated.' });
  }

  return text({
    status: 'ok',
    detected: detected.map((d) => ({ name: d.name, code: d.entry.code, docs: d.entry.docs })),
  });
}

async function checkProject(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);

  let docsMap: DocsMap;
  try {
    docsMap = await loadDocsMap(root, config);
  } catch (err) {
    if (err instanceof PmemError && err.code === 'E_DOCS_MAP_MISSING') {
      return errorResult('docs-map.yml not found. Run `pmem init` first.');
    }
    throw err;
  }

  let mode: { kind: 'working' } | { kind: 'staged' } | { kind: 'base'; branch: string };
  if (args.base) mode = { kind: 'base', branch: args.base as string };
  else if (args.staged) mode = { kind: 'staged' };
  else mode = { kind: 'working' };

  const changedFiles = await getChangedFiles(root, mode);

  if (changedFiles.length === 0) {
    const result: Record<string, unknown> = {
      changedFiles: [],
      affected: [],
      status: 'ok',
      message: 'No changed files.',
    };
    if (args.records) {
      const pending = await getPendingDocsImpact(root, config);
      if (pending.length > 0) result.pending_docs_impact = pending;
    }
    return text(result);
  }

  const report = checkDrift(changedFiles, docsMap);
  const result: Record<string, unknown> = { ...report };
  if (args.records) {
    const pending = await getPendingDocsImpact(root, config);
    if (pending.length > 0) result.pending_docs_impact = pending;
  }
  if (args.strict && report.status === 'warning') {
    return { ...text(result), isError: true };
  }
  return text(result);
}

async function getPendingDocsImpact(root: string, config: ProjectMemoryConfig) {
  const tasks = (await listRecords(root, config, 'task')) as TaskRecord[];
  return tasks
    .filter((t) => t.docs_impact === 'required' && t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title, status: t.status }));
}

async function taskCreate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const tplRoot = templatesRoot();
  const title = args.title as string;

  let record = await createRecord(root, config, 'task', title);
  if (args.module) record.modules = args.module as string[];
  if (args.docs_impact) record.docs_impact = args.docs_impact as TaskRecord['docs_impact'];
  if (args.source) record.source = args.source as string;
  if (args.external_id) record.external_id = args.external_id as string;
  if (args.external_url) record.external_url = args.external_url as string;

  const content = await renderTemplate(tplRoot, 'task', {
    id: record.id,
    title: record.title,
    created_at: record.created_at,
  });

  const dir = recordDir(root, config, 'task');
  await mkdir(dir, { recursive: true });
  const path = recordPath(root, config, record.id, 'task');
  await writeFile(path, content, 'utf-8');
  record = (await patchRecord(
    path,
    record as unknown as Partial<Record<string, unknown>>,
  )) as TaskRecord;

  return text({ status: 'ok', record, path: path.replace(`${root}/`, '') });
}

async function taskShow(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);
  const record = found.record as TaskRecord;
  return text({ record, body: found.body, path: found.filePath.replace(`${root}/`, '') });
}

async function taskList(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  let records = (await listRecords(root, config, 'task')) as TaskRecord[];
  if (args.status) records = records.filter((r) => r.status === args.status);
  return text({ records });
}

async function taskUpdate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);

  const patches: Partial<Record<string, unknown>> = {};
  if (args.status) patches.status = args.status;
  if (args.docs_impact) patches.docs_impact = args.docs_impact;
  if (args.module) patches.modules = args.module;
  if (args.source) patches.source = args.source;
  if (args.external_id) patches.external_id = args.external_id;
  if (args.external_url) patches.external_url = args.external_url;

  let record = found.record as TaskRecord;
  if (Object.keys(patches).length > 0) {
    record = (await patchRecord(found.filePath, patches)) as TaskRecord;
  }

  if (args.append) {
    const date = new Date().toISOString();
    await appendFile(found.filePath, `\n\n## Update ${date}\n\n${args.append}\n`, 'utf-8');
    record = (await patchRecord(found.filePath, {})) as TaskRecord;
  }

  return text({
    status: 'ok',
    record,
    path: found.filePath.replace(`${root}/`, ''),
    message: `${(args.id as string).toUpperCase()} updated.`,
  });
}

async function taskClose(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);

  const record = await patchRecord(found.filePath, { status: 'done', docs_impact: 'completed' });
  return text({ status: 'ok', record, path: found.filePath.replace(`${root}/`, '') });
}

async function bugCreate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const tplRoot = templatesRoot();
  const title = args.title as string;

  let record = await createRecord(root, config, 'bug', title);
  if (args.module) record.modules = args.module as string[];
  if (args.severity) record.severity = args.severity as BugRecord['severity'];
  if (args.source) record.source = args.source as string;
  if (args.external_id) record.external_id = args.external_id as string;
  if (args.external_url) record.external_url = args.external_url as string;

  const content = await renderTemplate(tplRoot, 'bug', {
    id: record.id,
    title: record.title,
    created_at: record.created_at,
  });

  const dir = recordDir(root, config, 'bug');
  await mkdir(dir, { recursive: true });
  const path = recordPath(root, config, record.id, 'bug');
  await writeFile(path, content, 'utf-8');
  record = (await patchRecord(
    path,
    record as unknown as Partial<Record<string, unknown>>,
  )) as BugRecord;

  return text({ status: 'ok', record, path: path.replace(`${root}/`, '') });
}

async function bugShow(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);
  const record = found.record as BugRecord;
  return text({ record, body: found.body, path: found.filePath.replace(`${root}/`, '') });
}

async function bugList(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  let records = (await listRecords(root, config, 'bug')) as BugRecord[];
  if (args.status) records = records.filter((r) => r.status === args.status);
  return text({ records });
}

async function bugUpdate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);

  const patches: Partial<Record<string, unknown>> = {};
  if (args.status) patches.status = args.status;
  if (args.severity) patches.severity = args.severity;
  if (args.module) patches.modules = args.module;
  if (args.source) patches.source = args.source;
  if (args.external_id) patches.external_id = args.external_id as string;
  if (args.external_url) patches.external_url = args.external_url as string;

  let record = found.record as BugRecord;
  if (Object.keys(patches).length > 0) {
    record = (await patchRecord(found.filePath, patches)) as BugRecord;
  }

  if (args.append) {
    const date = new Date().toISOString();
    await appendFile(found.filePath, `\n\n## Update ${date}\n\n${args.append}\n`, 'utf-8');
    record = (await patchRecord(found.filePath, {})) as BugRecord;
  }

  return text({
    status: 'ok',
    record,
    path: found.filePath.replace(`${root}/`, ''),
    message: `${(args.id as string).toUpperCase()} updated.`,
  });
}

async function bugAppend(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);

  const date = new Date().toISOString().slice(0, 10);
  const attempt = args.note
    ? `\n\n## Update ${new Date().toISOString()}\n\n${args.note}\n`
    : `\n${BUG_ATTEMPT_TEMPLATE.replace('{{date}}', date)}`;
  await appendFile(found.filePath, attempt, 'utf-8');
  const record = (await patchRecord(found.filePath, {})) as BugRecord;

  return text({
    status: 'ok',
    record,
    path: found.filePath.replace(`${root}/`, ''),
    message: `Appended to ${(args.id as string).toUpperCase()}.`,
  });
}

async function adrCreate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const tplRoot = templatesRoot();
  const title = args.title as string;

  const record = await createRecord(root, config, 'adr', title);
  const content = await renderTemplate(tplRoot, 'adr', {
    id: record.id,
    title: record.title,
    created_at: record.created_at,
  });

  const dir = recordDir(root, config, 'adr');
  await mkdir(dir, { recursive: true });
  const path = recordPath(root, config, record.id, 'adr');
  await writeFile(path, content, 'utf-8');

  return text({ status: 'ok', record, path: path.replace(`${root}/`, '') });
}

async function adrShow(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);
  const record = found.record as AdrRecord;
  return text({ record, body: found.body, path: found.filePath.replace(`${root}/`, '') });
}

async function adrList(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const records = (await listRecords(root, config, 'adr')) as AdrRecord[];
  return text({ records });
}

async function adrAccept(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const found = await findRecord(root, config, (args.id as string).toUpperCase());
  if (!found) return errorResult(`Record ${args.id} not found.`);

  const record = await patchRecord(found.filePath, { status: 'accepted' });
  return text({ status: 'ok', record, path: found.filePath.replace(`${root}/`, '') });
}

async function contextBuild(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const docsMap = await loadDocsMap(root, config);

  const opts: import('@pmem/core').ContextOptions = { root };
  if (args.task) opts.task = args.task as string;
  if (args.bug) opts.bug = args.bug as string;
  if (args.files) opts.files = args.files as string[];
  if (args.diff) opts.diff = args.diff as boolean;
  if (args.pack) opts.pack = args.pack as string;
  if (args.include_regressions) opts.includeRegressions = args.include_regressions as boolean;

  const markdown = await buildContext(root, config, docsMap, opts);

  if (args.output) {
    await writeFile(join(root, args.output as string), markdown, 'utf-8');
    return text({ status: 'ok', output: args.output });
  }

  return text({ status: 'ok', markdown });
}

async function contextListPacks(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const packs = await listContextPacks(root, config);
  return text({ packs });
}

async function briefCreate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const tplRoot = templatesRoot();

  let recordId: string | undefined;
  let type: 'task' | 'bug' | undefined;
  if (args.task) {
    recordId = args.task as string;
    type = 'task';
  } else if (args.bug) {
    recordId = args.bug as string;
    type = 'bug';
  } else return errorResult('Must specify --task or --bug');

  const found = await findRecord(root, config, recordId.toUpperCase());
  if (!found) return errorResult(`Record ${recordId} not found.`);

  const record = found.record;
  const vars = { id: record.id, title: record.title, date: new Date().toISOString().slice(0, 10) };
  const content = await renderCurrentState(tplRoot, type, vars);

  const statePath = join(dirname(found.filePath), `${record.id}-current-state.md`);
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, content, 'utf-8');

  return text({ status: 'ok', path: statePath.replace(`${root}/`, '') });
}

async function regressionCreate(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const tplRoot = templatesRoot();

  const relatedId = (args.bug ?? args.task) as string | undefined;
  const title = (args.title as string) || `Regression check${relatedId ? ` for ${relatedId}` : ''}`;
  const record = (await createRecord(root, config, 'reg', title)) as RegressionRecord;
  if (args.bug) record.related.bugs = [(args.bug as string).toUpperCase()];
  if (args.task) record.related.tasks = [(args.task as string).toUpperCase()];
  if (args.module) record.related.modules = args.module as string[];

  const content = await renderTemplate(tplRoot, 'reg', {
    id: record.id,
    title: record.title,
    created_at: record.created_at,
  });

  const dir = regressionDir(root, config);
  await mkdir(dir, { recursive: true });
  const path = regressionPath(root, config, record.id);
  await writeFile(path, content, 'utf-8');
  const saved = (await patchRecord(
    path,
    record as unknown as Partial<Record<string, unknown>>,
  )) as RegressionRecord;

  return text({ status: 'ok', record: saved, path: path.replace(`${root}/`, '') });
}

async function regressionRun(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);
  const id = (args.id as string).toUpperCase();

  const records = await resolveRegressionTargets(root, config, id);
  if (records.length === 0) {
    return errorResult(`No regression checks found for ${id}.`);
  }

  const results = [];
  for (const record of records) {
    const result = await runRegression(root, config, record);
    await saveResult(root, record.id, result);
    results.push({ record, result });
  }

  return text({ status: 'ok', results });
}

async function resolveRegressionTargets(
  root: string,
  config: ProjectMemoryConfig,
  id: string,
): Promise<RegressionRecord[]> {
  if (id.startsWith('REG-')) {
    return [(await loadRegression(root, config, id)).record];
  }
  const records = await listRegressions(root, config);
  if (id.startsWith('BUG-')) return records.filter((r) => r.related.bugs.includes(id));
  if (id.startsWith('TASK-')) return records.filter((r) => r.related.tasks.includes(id));
  return [];
}

async function regressionList(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);

  let records: RegressionRecord[];
  if (args.bug)
    records = await listRegressionsByBug(root, config, (args.bug as string).toUpperCase());
  else if (args.task) {
    const all = await listRegressions(root, config);
    records = all.filter((r) => r.related.tasks.includes((args.task as string).toUpperCase()));
  } else if (args.module) {
    records = await listRegressionsByModule(root, config, args.module as string);
  } else {
    records = await listRegressions(root, config);
  }

  return text({ records });
}

async function regressionStatus(args: ToolArgs) {
  const root = await getRoot(args);
  const config = await loadConfig(root);

  if (args.id) {
    const status = await getRegressionStatus(root, (args.id as string).toUpperCase());
    if (!status) return errorResult(`No results found for ${args.id}`);
    return text({ status });
  }

  const records = await listRegressions(root, config);
  const statuses = [];
  for (const record of records) {
    statuses.push({ record, status: await getRegressionStatus(root, record.id) });
  }
  return text({ statuses });
}

const HANDLERS: Record<
  ToolName,
  (args: ToolArgs) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
> = {
  pmem_init: initProject,
  pmem_scan: scanProject,
  pmem_check: checkProject,
  pmem_task_create: taskCreate,
  pmem_task_show: taskShow,
  pmem_task_list: taskList,
  pmem_task_update: taskUpdate,
  pmem_task_close: taskClose,
  pmem_bug_create: bugCreate,
  pmem_bug_show: bugShow,
  pmem_bug_list: bugList,
  pmem_bug_update: bugUpdate,
  pmem_bug_append: bugAppend,
  pmem_adr_create: adrCreate,
  pmem_adr_show: adrShow,
  pmem_adr_list: adrList,
  pmem_adr_accept: adrAccept,
  pmem_context_build: contextBuild,
  pmem_context_list_packs: contextListPacks,
  pmem_brief: briefCreate,
  pmem_regression_create: regressionCreate,
  pmem_regression_run: regressionRun,
  pmem_regression_list: regressionList,
  pmem_regression_status: regressionStatus,
};

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const handler = HANDLERS[name as ToolName];
  if (!handler) {
    return errorResult(`Unknown tool: ${name}`);
  }

  try {
    return await handler(args);
  } catch (err) {
    const message =
      err instanceof PmemError
        ? `[${err.code}] ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return errorResult(message);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
