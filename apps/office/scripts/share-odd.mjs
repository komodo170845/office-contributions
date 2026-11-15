// The owner starts this session in their terminal. Only this process holds the
// office pairing code. The coding tool gets a different key and one snapshot.
import { createServer } from 'node:https';
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

export async function shareOdd(id, flags, read) {
  const { key, port } = shareAddress();
  const context = await selectedContext(id, flags, read);
  const server = createServer(serverProof(key, 'coding tool'), (req, res) => {
    if (req.method !== 'GET' || req.url !== '/context') return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(context));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  process.stderr.write('Sharing this snapshot until you stop this command with Ctrl+C.\n');
  process.stderr.write(JSON.stringify(context, null, 2) + '\n');
}
