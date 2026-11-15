// The owner starts this session in their terminal. Only this process holds the
// office pairing code. The coding tool gets a different key and one snapshot.
import { createServer } from 'node:https';
import { createInterface } from 'node:readline';
import { handoffs, shown } from './coding-handoffs.mjs';
import { serverProof } from './service-channel.mjs';

export function shareAddress() {
  const key = process.env.ODDBORO_TOOL_KEY;
  if (!/^[a-f0-9]{64}$/.test(key ?? ''))
    throw Error('Set ODDBORO_TOOL_KEY to a key from oddboro tool-key.');
  const port = Number(process.env.ODDBORO_TOOL_PORT ?? 4512);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error('Use a local port between 1 and 65535.');
  return { key, port };
}

export async function selectedContext(id, flags, read) {
  if (flags.some((f) => !['--goals', '--lessons', '--work'].includes(f)))
    throw Error('Choose --goals, --lessons or --work.');
  const office = await read('/api/workspace');
  const odd = office.staff.find((s) => s.id === id);
  if (!odd) throw Error('Choose an Odd from oddboro odds.');
  const context = { odd: { id, name: odd.name, role: odd.role } };
  if (flags.includes('--goals')) {
    const { goals } = await read('/api/goals');
    context.goals = goals.filter((g) => g.status === 'active').map((g) => g.title);
  }
  if (flags.includes('--lessons')) {
    const lessons = await read('/api/lessons');
    context.lessons = lessons
      .filter((l) => l.staffId === null && l.status === 'live')
      .map((l) => l.text);
  }
  if (flags.includes('--work')) context.work = (office.inProgress[id] ?? []).map((w) => w.label);
  return context;
}

export async function shareOdd(id, flags, read, deliver) {
  const { key, port } = shareAddress();
  const review = flags.includes('--review');
  if (review && !process.stdin.isTTY)
    throw Error('Open your own terminal to review incoming work.');
  const context = await selectedContext(
    id,
    flags.filter((f) => f !== '--review'),
    read
  );
  const tell = (message) => process.stderr.write(message + '\n');
  const inbox = review ? handoffs(key, id, deliver, tell) : undefined;
  const server = createServer(serverProof(key, 'coding tool'), async (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    try {
      if (req.method === 'GET' && req.url === '/context') return res.end(JSON.stringify(context));
      if (!inbox) return res.writeHead(403).end('The owner is sharing context only.');
      if (req.method === 'POST' && req.url === '/offers') {
        const length = Number(req.headers['content-length']);
        if (!Number.isSafeInteger(length) || length <= 0 || length > 32768)
          return res.writeHead(413).end('Send a bounded selection of text.');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        return res.end(JSON.stringify(inbox.propose(JSON.parse(Buffer.concat(chunks).toString()))));
      }
      const match = /^\/offers\/([a-zA-Z0-9_-]{1,64})$/.exec(req.url);
      if (req.method === 'GET' && match) return res.end(JSON.stringify(inbox.result(match[1])));
      res.writeHead(404).end();
    } catch (e) {
      res.writeHead(400).end(e instanceof SyntaxError ? 'Send a valid selection.' : e.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  tell('Sharing this snapshot until you stop this command with Ctrl+C.');
  tell(shown(context));
  if (inbox) {
    tell('Ready for requests. Each selection waits for your decision in this terminal.');
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    terminal.on('line', (line) => void inbox.decide(line.trim()));
    terminal.once('close', () => {
      server.close();
      server.closeAllConnections();
    });
  }
}
