// A coding tool starts this command as an MCP server over standard input and
// output. Its key works only on the owner's separate, local sharing session.
import { request } from 'node:https';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { clientProof } from './service-channel.mjs';
import { shareAddress } from './share-odd.mjs';

async function readContext() {
  const { key, port } = shareAddress();
  const response = await new Promise((resolve, reject) => {
    const req = request(
      {
        ...clientProof(key, 'coding tool'),
        hostname: '127.0.0.1',
        port,
        agent: false,
        path: '/context',
        signal: AbortSignal.timeout(5000)
      },
      resolve
    );
    req.once('error', reject);
    req.end();
  });
  if (response.statusCode !== 200) {
    response.resume();
    throw Error('The office did not share a snapshot.');
  }
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

export async function codingTool() {
  const server = new McpServer({ name: 'oddboro', version: '1' });
  server.registerTool(
    'office_context',
    {
      description: 'Read the snapshot the owner chose to share from Oddboro.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      try {
        return { content: [{ type: 'text', text: await readContext() }] };
      } catch {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'No sharing session answered. Ask the owner to check oddboro share, the tool key and the local port.'
            }
          ]
        };
      }
    }
  );
  await server.connect(new StdioServerTransport());
}
