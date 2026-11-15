// A coding tool starts this command as an MCP server over standard input and
// output. Its key works only on the owner's separate, local sharing session.
import { request } from 'node:https';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { clientProof } from './service-channel.mjs';
import { shareAddress } from './share-odd.mjs';
import { offer, requestId } from './coding-handoffs.mjs';

async function shared(path, selection) {
  try {
    const { key, port } = shareAddress();
    const body = selection === undefined ? undefined : Buffer.from(JSON.stringify(selection));
    const response = await new Promise((resolve, reject) => {
      const req = request(
        {
          ...clientProof(key, 'coding tool'),
          hostname: '127.0.0.1',
          port,
          agent: false,
          path,
          signal: AbortSignal.timeout(5000),
          method: body ? 'POST' : 'GET',
          headers: body ? { 'content-type': 'application/json', 'content-length': body.length } : {}
        },
        resolve
      );
      req.once('error', reject);
      req.end(body);
    });
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    return {
      isError: response.statusCode !== 200,
      content: [{ type: 'text', text: Buffer.concat(chunks).toString() }]
    };
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

export async function codingTool() {
  const server = new McpServer({ name: 'oddboro', version: '1' });
  server.registerTool(
    'office_context',
    {
      description: 'Read the snapshot the owner chose to share from Oddboro.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    () => shared('/context')
  );
  server.registerTool(
    'offer_work',
    {
      description:
        'Offer selected text and named text files to the shared Odd. Use a new short requestId for each selection and keep it when retrying. The owner reviews exactly what will go to the Odd and whether to share its reply.',
      inputSchema: offer.shape,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    (input) => shared('/offers', input)
  );
  server.registerTool(
    'work_result',
    {
      description:
        'Check whether the owner approved your request and read the Odd’s finished reply.',
      inputSchema: { requestId },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    (input) => shared('/offers/' + input.requestId)
  );
  await server.connect(new StdioServerTransport());
}
