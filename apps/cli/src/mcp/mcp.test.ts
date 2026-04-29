import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI_BIN = join(import.meta.dirname, '../..', 'src', 'index.ts');
const TSX = join(import.meta.dirname, '../../../../node_modules/.bin/tsx');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pmem-mcp-'));
  await mkdir(join(tmpDir, 'docs', 'tasks'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'bugs'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'decisions'), { recursive: true });
  await mkdir(join(tmpDir, 'docs', 'regressions'), { recursive: true });
  await writeFile(
    join(tmpDir, '.project-memory.yml'),
    'version: 1\nproject:\n  name: test\n  docs_root: docs\n',
    'utf-8',
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function createMcpClient(): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: TSX,
    args: [CLI_BIN, 'mcp'],
    env: { ...process.env, HOME: tmpDir },
    cwd: tmpDir,
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);

  return { client, transport };
}

function getText(result: unknown): string {
  const r = result as Record<string, unknown>;
  const content = (r.content ?? r.toolResult) as Array<{ type: string; text: string }>;
  return content?.[0]?.text ?? '';
}

describe('MCP server tools/list', () => {
  it('exposes all pmem tools with schemas', async () => {
    const { client, transport } = await createMcpClient();

    try {
      const result = await client.listTools();

      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('pmem_task_create');
      expect(toolNames).toContain('pmem_task_show');
      expect(toolNames).toContain('pmem_task_list');
      expect(toolNames).toContain('pmem_task_update');
      expect(toolNames).toContain('pmem_task_close');
      expect(toolNames).toContain('pmem_bug_create');
      expect(toolNames).toContain('pmem_bug_show');
      expect(toolNames).toContain('pmem_bug_list');
      expect(toolNames).toContain('pmem_bug_update');
      expect(toolNames).toContain('pmem_bug_append');
      expect(toolNames).toContain('pmem_adr_create');
      expect(toolNames).toContain('pmem_adr_show');
      expect(toolNames).toContain('pmem_adr_list');
      expect(toolNames).toContain('pmem_adr_accept');
      expect(toolNames).toContain('pmem_check');
      expect(toolNames).toContain('pmem_scan');
      expect(toolNames).toContain('pmem_init');
      expect(toolNames).toContain('pmem_context_build');
      expect(toolNames).toContain('pmem_context_list_packs');
      expect(toolNames).toContain('pmem_brief');
      expect(toolNames).toContain('pmem_regression_create');
      expect(toolNames).toContain('pmem_regression_run');
      expect(toolNames).toContain('pmem_regression_list');
      expect(toolNames).toContain('pmem_regression_status');

      const taskCreate = result.tools.find((t) => t.name === 'pmem_task_create');
      expect(taskCreate).toBeDefined();
      expect(taskCreate?.description).toContain('task');
      expect(taskCreate?.inputSchema).toBeDefined();
      const schema = taskCreate?.inputSchema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties).toHaveProperty('title');
      expect(schema.required).toContain('title');
    } finally {
      await client.close();
      await transport.close();
    }
  }, 30_000);
});

describe('MCP server tools/call', () => {
  it('creates and shows a task via MCP', async () => {
    const { client, transport } = await createMcpClient();

    try {
      const createResult = await client.callTool({
        name: 'pmem_task_create',
        arguments: { title: 'Test task via MCP', root: tmpDir },
      });

      expect(createResult.isError).toBeFalsy();
      const createData = JSON.parse(getText(createResult));
      expect(createData.status).toBe('ok');
      expect(createData.record.id).toBe('TASK-001');
      expect(createData.record.title).toBe('Test task via MCP');

      const showResult = await client.callTool({
        name: 'pmem_task_show',
        arguments: { id: 'TASK-001', root: tmpDir },
      });

      expect(showResult.isError).toBeFalsy();
      const showData = JSON.parse(getText(showResult));
      expect(showData.record.id).toBe('TASK-001');
      expect(showData.record.title).toBe('Test task via MCP');
    } finally {
      await client.close();
      await transport.close();
    }
  }, 30_000);

  it('creates and lists bugs via MCP', async () => {
    const { client, transport } = await createMcpClient();

    try {
      await client.callTool({
        name: 'pmem_bug_create',
        arguments: { title: 'Test bug via MCP', severity: 'high', root: tmpDir },
      });

      const listResult = await client.callTool({
        name: 'pmem_bug_list',
        arguments: { root: tmpDir },
      });

      expect(listResult.isError).toBeFalsy();
      const listData = JSON.parse(getText(listResult));
      expect(listData.records.length).toBe(1);
      expect(listData.records[0].id).toBe('BUG-001');
      expect(listData.records[0].severity).toBe('high');
    } finally {
      await client.close();
      await transport.close();
    }
  }, 30_000);

  it('returns error for unknown tool', async () => {
    const { client, transport } = await createMcpClient();

    try {
      const result = await client.callTool({ name: 'nonexistent_tool', arguments: {} });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await transport.close();
    }
  }, 30_000);

  it('returns error for missing record', async () => {
    const { client, transport } = await createMcpClient();

    try {
      const result = await client.callTool({
        name: 'pmem_task_show',
        arguments: { id: 'TASK-999', root: tmpDir },
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(getText(result));
      expect(data.error).toContain('not found');
    } finally {
      await client.close();
      await transport.close();
    }
  }, 30_000);
});
