import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
/**
 * MCP Server Integration Test — mirrors QUICKSTART.md scenarios via MCP tools.
 *
 * This script spawns a real MCP server (pmem mcp) as a child process,
 * connects via stdio, and calls every tool to verify the MCP interface
 * works identically to the CLI.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const exec = promisify(execFile);
const CLI_BIN = join(import.meta.dirname, '..', '..', 'src', 'index.ts');
const TSX = join(import.meta.dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'tsx');

let tmpDir: string;
let client: Client;
let transport: StdioClientTransport;

function getText(result: unknown): string {
  const r = result as Record<string, unknown>;
  const content = (r.content ?? r.toolResult) as Array<{ type: string; text: string }>;
  return content?.[0]?.text ?? '';
}

function getJson(result: unknown) {
  return JSON.parse(getText(result));
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

async function callTool(name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args });
}

async function git(...args: string[]) {
  await exec('git', args, { cwd: tmpDir });
}

// ── Setup ──────────────────────────────────────────────────────────────────

async function setup() {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-mcp-quickstart-'));

  await git('init');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test');

  await mkdir(join(tmpDir, 'src', 'auth'), { recursive: true });
  await writeFile(
    join(tmpDir, 'src', 'auth', 'index.ts'),
    'export function login() { return "auth"; }\n',
    'utf-8',
  );
  await writeFile(
    join(tmpDir, 'src', 'auth', 'logout.ts'),
    'export function logout() { return "logout"; }\n',
    'utf-8',
  );
  await git('add', '-A');
  await git('commit', '-m', 'Initial commit');

  transport = new StdioClientTransport({
    command: TSX,
    args: [CLI_BIN, 'mcp'],
    env: { ...process.env, HOME: tmpDir },
    cwd: tmpDir,
  });

  client = new Client({ name: 'quickstart-test', version: '1.0.0' });
  await client.connect(transport);
  console.log('\n📡 MCP client connected to pmem mcp server\n');
}

async function teardown() {
  await client.close();
  await transport.close();
  await rm(tmpDir, { recursive: true, force: true });
}

// ── Step 0: Verify tools/list ──────────────────────────────────────────────

async function testToolsList() {
  console.log('\n🔍 Step 0: Verify tools/list (auto-discovery)');

  const result = await client.listTools();
  const toolNames = result.tools.map((t) => t.name);

  assert(toolNames.length === 24, `Expected 24 tools, got ${toolNames.length}`);

  const required = [
    'pmem_init',
    'pmem_scan',
    'pmem_check',
    'pmem_task_create',
    'pmem_task_show',
    'pmem_task_list',
    'pmem_task_update',
    'pmem_task_close',
    'pmem_bug_create',
    'pmem_bug_show',
    'pmem_bug_list',
    'pmem_bug_update',
    'pmem_bug_append',
    'pmem_adr_create',
    'pmem_adr_show',
    'pmem_adr_list',
    'pmem_adr_accept',
    'pmem_context_build',
    'pmem_context_list_packs',
    'pmem_brief',
    'pmem_regression_create',
    'pmem_regression_run',
    'pmem_regression_list',
    'pmem_regression_status',
  ];
  for (const name of required) {
    assert(toolNames.includes(name), `Tool ${name} present in tools/list`);
  }

  const taskCreate = result.tools.find((t) => t.name === 'pmem_task_create');
  const schema = taskCreate?.inputSchema as
    | { properties: Record<string, unknown>; required: string[] }
    | undefined;
  assert(
    schema?.properties?.title !== undefined,
    'pmem_task_create has "title" property in schema',
  );
  assert(
    Boolean(schema?.required?.includes('title')),
    'pmem_task_create has "title" in required fields',
  );

  console.log(
    `  📋 Schema descriptions present: ${result.tools.every((t) => typeof t.description === 'string' && t.description.length > 0) ? 'yes' : 'no'}`,
  );
}

// ── Step 2: pmem_init ──────────────────────────────────────────────────────

async function testInit() {
  console.log('\n🏗️  Step 2: pmem_init (Initialize PMM)');

  const result = getJson(await callTool('pmem_init', { name: 'my-test', root: tmpDir }));
  assert(result.status === 'ok', `pmem_init returned status: ${result.status}`);

  const configExists = await fileExists(join(tmpDir, '.project-memory.yml'));
  assert(configExists, '.project-memory.yml created');

  const docsMapExists = await fileExists(join(tmpDir, 'docs-map.yml'));
  assert(docsMapExists, 'docs-map.yml created');

  const agentsExists = await fileExists(join(tmpDir, 'AGENTS.md'));
  assert(agentsExists, 'AGENTS.md created (with MCP setup instructions)');
}

// ── Step 3: pmem_scan ──────────────────────────────────────────────────────

async function testScan() {
  console.log('\n🔎 Step 3: pmem_scan (Detect modules)');

  const result = getJson(await callTool('pmem_scan', { write: true, root: tmpDir }));
  assert(result.status === 'ok', `pmem_scan returned status: ${result.status}`);
  assert(result.detected.length >= 1, `Detected ${result.detected.length} module(s)`);
  assert(result.message === 'docs-map.yml updated.', 'docs-map.yml was updated');

  await git('add', '-A');
  await git('commit', '-m', 'PMM init + scan');
}

// ── Step 4: pmem_check ─────────────────────────────────────────────────────

async function testCheck() {
  console.log('\n🚨 Step 4: pmem_check (Docs drift detection)');

  await writeFile(
    join(tmpDir, 'src', 'auth', 'index.ts'),
    'export function login() { return "auth"; }\nexport function reset() { return "reset"; }\n',
    'utf-8',
  );

  const result = getJson(await callTool('pmem_check', { root: tmpDir }));
  assert(result.status === 'warning', `Check status: ${result.status}`);
  assert(result.affected.length >= 1, `Affected modules: ${result.affected.length}`);

  const withRecords = getJson(await callTool('pmem_check', { records: true, root: tmpDir }));
  assert(Array.isArray(withRecords.changedFiles), 'check with --records has changedFiles');

  const strictResult = await callTool('pmem_check', { strict: true, root: tmpDir });
  assert(Boolean(strictResult.isError), '--strict returns isError when drift found');
}

// ── Step 5: pmem_task_create / show / list / close ─────────────────────────

async function testTaskWorkflow() {
  console.log('\n📋 Step 5: Task workflow via MCP');

  const created = getJson(
    await callTool('pmem_task_create', {
      title: 'Add password reset feature',
      module: ['auth'],
      root: tmpDir,
    }),
  );
  assert(created.status === 'ok', `Task create status: ${created.status}`);
  assert(created.record.id === 'TASK-001', `Task ID: ${created.record.id}`);
  assert(
    created.record.title === 'Add password reset feature',
    `Task title: ${created.record.title}`,
  );
  assert(created.record.modules.includes('auth'), `Task modules: ${created.record.modules}`);

  const shown = getJson(await callTool('pmem_task_show', { id: 'TASK-001', root: tmpDir }));
  assert(shown.record.id === 'TASK-001', `Task show ID: ${shown.record.id}`);
  assert(
    shown.record.title === 'Add password reset feature',
    `Task show title: ${shown.record.title}`,
  );
  assert(typeof shown.body === 'string', 'Task show has body');

  const listed = getJson(await callTool('pmem_task_list', { root: tmpDir }));
  assert(listed.records.length >= 1, `Task list: ${listed.records.length} record(s)`);
  assert(listed.records[0].id === 'TASK-001', `Task list first: ${listed.records[0].id}`);

  const updated = getJson(
    await callTool('pmem_task_update', {
      id: 'TASK-001',
      status: 'in_progress',
      append: 'Working on the reset feature',
      root: tmpDir,
    }),
  );
  assert(updated.record.status === 'in_progress', `Task update status: ${updated.record.status}`);
  assert(updated.status === 'ok', 'Task update returned ok');

  const closed = getJson(await callTool('pmem_task_close', { id: 'TASK-001', root: tmpDir }));
  assert(closed.record.status === 'done', `Task close status: ${closed.record.status}`);
  assert(
    closed.record.docs_impact === 'completed',
    `Task close docs_impact: ${closed.record.docs_impact}`,
  );

  const filtered = getJson(await callTool('pmem_task_list', { status: 'done', root: tmpDir }));
  assert(
    filtered.records.length >= 1,
    `Task list --status done: ${filtered.records.length} record(s)`,
  );
}

// ── Step 6: pmem_bug_create / show / list / append / update ────────────────

async function testBugWorkflow() {
  console.log('\n🐛 Step 6: Bug workflow via MCP');

  const created = getJson(
    await callTool('pmem_bug_create', {
      title: 'Login fails with empty password',
      severity: 'high',
      module: ['auth'],
      root: tmpDir,
    }),
  );
  assert(created.status === 'ok', `Bug create status: ${created.status}`);
  assert(created.record.id === 'BUG-001', `Bug ID: ${created.record.id}`);
  assert(created.record.severity === 'high', `Bug severity: ${created.record.severity}`);

  const shown = getJson(await callTool('pmem_bug_show', { id: 'BUG-001', root: tmpDir }));
  assert(shown.record.id === 'BUG-001', `Bug show ID: ${shown.record.id}`);
  assert(typeof shown.body === 'string', 'Bug show has body');

  const listed = getJson(await callTool('pmem_bug_list', { root: tmpDir }));
  assert(listed.records.length >= 1, `Bug list: ${listed.records.length} record(s)`);

  const appended = getJson(
    await callTool('pmem_bug_append', {
      id: 'BUG-001',
      note: 'Root cause: missing validation',
      root: tmpDir,
    }),
  );
  assert(appended.status === 'ok', `Bug append status: ${appended.status}`);

  const updated = getJson(
    await callTool('pmem_bug_update', { id: 'BUG-001', status: 'fixed', root: tmpDir }),
  );
  assert(updated.record.status === 'fixed', `Bug update status: ${updated.record.status}`);
}

// ── Step 7: pmem_adr_create / list / accept ────────────────────────────────

async function testAdrWorkflow() {
  console.log('\n📑 Step 7: ADR workflow via MCP');

  const created = getJson(
    await callTool('pmem_adr_create', { title: 'Use bcrypt for password hashing', root: tmpDir }),
  );
  assert(created.status === 'ok', `ADR create status: ${created.status}`);
  assert(created.record.id === 'ADR-001', `ADR ID: ${created.record.id}`);

  const shown = getJson(await callTool('pmem_adr_show', { id: 'ADR-001', root: tmpDir }));
  assert(shown.record.id === 'ADR-001', `ADR show ID: ${shown.record.id}`);
  assert(shown.record.status === 'proposed', `ADR show status: ${shown.record.status}`);

  const listed = getJson(await callTool('pmem_adr_list', { root: tmpDir }));
  assert(listed.records.length >= 1, `ADR list: ${listed.records.length} record(s)`);
  assert(listed.records[0].id === 'ADR-001', `ADR list first: ${listed.records[0].id}`);

  const accepted = getJson(await callTool('pmem_adr_accept', { id: 'ADR-001', root: tmpDir }));
  assert(accepted.record.status === 'accepted', `ADR accept status: ${accepted.record.status}`);
}

// ── Step 8: pmem_context_build / list_packs ─────────────────────────────────

async function testContextWorkflow() {
  console.log('\n🧠 Step 8: Context packs via MCP');

  const packs = getJson(await callTool('pmem_context_list_packs', { root: tmpDir }));
  assert(packs.packs.length >= 4, `Context packs: ${packs.packs.length}`);
  assert(packs.packs.includes('bugfix'), 'bugfix pack available');
  assert(packs.packs.includes('feature'), 'feature pack available');
  assert(packs.packs.includes('refactor'), 'refactor pack available');
  assert(packs.packs.includes('architecture'), 'architecture pack available');

  const built = getJson(await callTool('pmem_context_build', { diff: true, root: tmpDir }));
  assert(built.status === 'ok', `Context build status: ${built.status}`);
  assert(typeof built.markdown === 'string', 'Context build returns markdown');

  const bugCtx = getJson(
    await callTool('pmem_context_build', {
      bug: 'BUG-001',
      pack: 'bugfix',
      include_regressions: true,
      root: tmpDir,
    }),
  );
  assert(bugCtx.status === 'ok', `Context build --bug status: ${bugCtx.status}`);

  const featCtx = getJson(await callTool('pmem_context_build', { pack: 'feature', root: tmpDir }));
  assert(featCtx.status === 'ok', `Context build --pack feature status: ${featCtx.status}`);
}

// ── Step 9: pmem_regression_create / run / list / status ────────────────────

async function testRegressionWorkflow() {
  console.log('\n🔁 Step 9: Regression workflow via MCP');

  const created = getJson(
    await callTool('pmem_regression_create', {
      bug: 'BUG-001',
      title: 'Login validation',
      module: ['auth'],
      root: tmpDir,
    }),
  );
  assert(created.status === 'ok', `Regression create status: ${created.status}`);
  assert(created.record.id === 'REG-001', `Regression ID: ${created.record.id}`);
  assert(created.record.related.bugs.includes('BUG-001'), 'Regression linked to BUG-001');

  const regPath = join(tmpDir, 'docs', 'regressions', 'REG-001.md');
  const content = await readFile(regPath, 'utf-8');
  const updated = content
    .replace('type: manual', 'type: command')
    .replace(
      /check:\n(\s+)type: command/,
      'check:\n$1type: command\n$1command: "echo \'test passed\'"',
    );
  await writeFile(regPath, updated, 'utf-8');

  const run = getJson(await callTool('pmem_regression_run', { id: 'REG-001', root: tmpDir }));
  assert(run.status === 'ok', `Regression run status: ${run.status}`);
  assert(run.results.length >= 1, `Regression run results: ${run.results.length}`);
  assert(
    run.results[0].result.status === 'pass',
    `Regression result: ${run.results[0].result.status}`,
  );

  const status = getJson(await callTool('pmem_regression_status', { id: 'REG-001', root: tmpDir }));
  assert(status.status !== null, 'Regression status returned');
  assert(status.status.runCount >= 1, `Regression run count: ${status.status.runCount}`);
  assert(
    status.status.lastRun.status === 'pass',
    `Regression last run: ${status.status.lastRun.status}`,
  );

  const listed = getJson(await callTool('pmem_regression_list', { root: tmpDir }));
  assert(listed.records.length >= 1, `Regression list: ${listed.records.length} record(s)`);
  assert(listed.records[0].id === 'REG-001', `Regression list first: ${listed.records[0].id}`);

  const byBug = getJson(await callTool('pmem_regression_list', { bug: 'BUG-001', root: tmpDir }));
  assert(byBug.records.length >= 1, `Regression list --bug: ${byBug.records.length} record(s)`);
}

// ── Step 10: pmem_brief ────────────────────────────────────────────────────

async function testBrief() {
  console.log('\n📝 Step 10: Brief (current-state snapshot) via MCP');

  const created = getJson(
    await callTool('pmem_task_create', { title: 'Test brief feature', root: tmpDir }),
  );
  assert(created.record.id === 'TASK-002', 'Created TASK-002 for brief test');

  const briefResult = getJson(
    await callTool('pmem_brief', { file: 'dummy.md', task: 'TASK-002', root: tmpDir }),
  );
  assert(briefResult.status === 'ok', `Brief status: ${briefResult.status}`);
  assert(briefResult.path.includes('current-state'), `Brief path: ${briefResult.path}`);

  const briefExists = await fileExists(join(tmpDir, briefResult.path));
  assert(briefExists, 'current-state.md file exists');
}

// ── Error handling ─────────────────────────────────────────────────────────

async function testErrorHandling() {
  console.log('\n🔒 Error handling via MCP');

  const missing = await callTool('pmem_task_show', { id: 'TASK-999', root: tmpDir });
  assert(Boolean(missing.isError), 'Missing record returns isError');

  const missingBug = await callTool('pmem_bug_show', { id: 'BUG-999', root: tmpDir });
  assert(Boolean(missingBug.isError), 'Missing bug returns isError');
}

// ── Agent scenario A: New feature from user prompt ──────────────────────────

async function testAgentScenarioA() {
  console.log('\n🤖 Agent Scenario A: New feature from user prompt');

  const task = getJson(
    await callTool('pmem_task_create', {
      title: 'Add SSO support',
      module: ['auth'],
      source: 'jira',
      external_id: 'PROJ-456',
      external_url: 'https://jira.example/PROJ-456',
      root: tmpDir,
    }),
  );
  assert(task.record.id === 'TASK-003', 'Created TASK-003');
  assert(task.record.source === 'jira', `Source: ${task.record.source}`);
  assert(task.record.external_id === 'PROJ-456', `External ID: ${task.record.external_id}`);

  const ctx = getJson(
    await callTool('pmem_context_build', { task: 'TASK-003', pack: 'feature', root: tmpDir }),
  );
  assert(ctx.status === 'ok', 'Context built for task');

  const check = getJson(await callTool('pmem_check', { records: true, root: tmpDir }));
  assert(check.changedFiles !== undefined, 'Check returned results');

  const reg = getJson(
    await callTool('pmem_regression_create', {
      task: 'TASK-003',
      title: 'SSO integration test',
      root: tmpDir,
    }),
  );
  assert(reg.record.id === 'REG-002', 'Regression REG-002 created');

  const update = getJson(
    await callTool('pmem_task_update', {
      id: 'TASK-003',
      status: 'in_progress',
      append: 'Started SSO implementation',
      root: tmpDir,
    }),
  );
  assert(update.record.status === 'in_progress', 'Task status: in_progress');

  const close = getJson(await callTool('pmem_task_close', { id: 'TASK-003', root: tmpDir }));
  assert(close.record.status === 'done', 'Task closed: done');
}

// ── Utility ────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PMEM MCP Server — Full QUICKSTART Integration Test');
  console.log('═══════════════════════════════════════════════════════════');

  await setup();

  await testToolsList();
  await testInit();
  await testScan();
  await testCheck();
  await testTaskWorkflow();
  await testBugWorkflow();
  await testAdrWorkflow();
  await testContextWorkflow();
  await testRegressionWorkflow();
  await testBrief();
  await testErrorHandling();
  await testAgentScenarioA();

  await teardown();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ✅ ${passed} passed, ❌ ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
