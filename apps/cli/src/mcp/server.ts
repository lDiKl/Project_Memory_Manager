import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { handleToolCall } from './handlers.js';
import { TOOL_DEFINITIONS } from './tools.js';

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: 'pmem', version: '0.1.0' }, { capabilities: { tools: {} } });

  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    server.registerTool(
      name,
      { description: def.description, inputSchema: def.inputSchema },
      async (args: Record<string, unknown>) => {
        const result = await handleToolCall(name, args as Record<string, unknown>);
        return result;
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
