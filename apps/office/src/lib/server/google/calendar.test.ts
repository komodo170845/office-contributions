// Exercise the same MCP tools a run receives. Only Google's HTTP reply is a fixture.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readsOnly } from '@oddboro/ledger';
import { calendarServer } from './calendar.ts';

const [ours, theirs] = InMemoryTransport.createLinkedPair();
const server = calendarServer(async () => 'test-token', 'reader@example.com');
await server.connect(ours);
const client = new Client({ name: 'calendar-test', version: '1' });
await client.connect(theirs);
after(async () => {
  await client.close();
  await server.close();
});

const calendar_id = 'room#1@group.calendar.google.com';
const period = { time_min: '2026-11-15T00:00:00-08:00', time_max: '2026-11-16T00:00:00-08:00' };

test('a read grant gets four calendar tools and each names its own account', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools
      .filter(readsOnly)
      .map((t) => t.name)
      .sort(),
    ['check_availability', 'get_event', 'list_calendars', 'list_events']
  );
  assert.ok(tools.every((t) => t.description?.includes('reader@example.com')));
});

test('calendar and event lists keep continuation tokens and the bounds on recurring events', async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-token');
    urls.push(new URL(input));
    return Response.json({ nextPageToken: 'following', items: [{ summary: 'A <meeting>' }] });
  });
  await client.callTool({ name: 'list_calendars', arguments: { page_token: 'second page' } });
  assert.equal(urls[0].pathname, '/calendar/v3/users/me/calendarList');
  assert.equal(urls[0].searchParams.get('pageToken'), 'second page');
  const r = await client.callTool({
    name: 'list_events',
    arguments: { calendar_id, ...period, page_token: 'next' }
  });
  assert.equal(
    urls[1].pathname,
    '/calendar/v3/calendars/room%231%40group.calendar.google.com/events'
  );
  const params = urls[1].searchParams;
  assert.equal(params.get('timeMin'), period.time_min);
  assert.equal(params.get('timeMax'), period.time_max);
  assert.equal(params.get('singleEvents'), 'true');
  assert.equal(params.get('orderBy'), 'startTime');
  assert.equal(params.get('pageToken'), 'next');
  assert.match(JSON.stringify(r.content), /following/);
  assert.match(JSON.stringify(r.content), /untrusted/);
});

test('get_event reads the selected occurrence and a busy check keeps errors by calendar', async (t) => {
  const sent: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    sent.push(new Request(url, init));
    return Response.json({ calendars: { secondary: { errors: [{ reason: 'notFound' }] } } });
  });
  await client.callTool({
    name: 'get_event',
    arguments: { calendar_id: 'primary', event_id: 'abc_20261115T140000Z' }
  });
  assert.equal(
    new URL(sent[0].url).pathname,
    '/calendar/v3/calendars/primary/events/abc_20261115T140000Z'
  );
  const r = await client.callTool({
    name: 'check_availability',
    arguments: { calendar_ids: ['primary', 'secondary'], ...period }
  });
  assert.equal(sent[1].method, 'POST');
  assert.equal(new URL(sent[1].url).pathname, '/calendar/v3/freeBusy');
  assert.deepEqual(await sent[1].json(), {
    timeMin: period.time_min,
    timeMax: period.time_max,
    items: [{ id: 'primary' }, { id: 'secondary' }]
  });
  assert.match(JSON.stringify(r.content), /notFound/);
  const bad = await client.callTool({
    name: 'list_events',
    arguments: { calendar_id, ...period, time_max: period.time_min }
  });
  assert.equal(bad.isError, true);
  assert.equal(sent.length, 2);
});

test('a retried booking keeps the same event ID and all-day end date', async (t) => {
  const requests: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push(new Request(url, init));
    return requests.length === 1
      ? Response.json({ id: 'abc123' })
      : Response.json({ error: { message: 'Event already exists' } }, { status: 409 });
  });
  const booking = {
    name: 'create_event',
    arguments: {
      calendar_id: 'primary',
      event_id: 'abc123',
      title: 'Delivery',
      start: '2026-11-18',
      end: '2026-11-19',
      guests: ['receiver@example.com']
    }
  };
  assert.ok(!(await client.callTool(booking)).isError);
  assert.equal((await client.callTool(booking)).isError, true);
  for (const req of requests) {
    assert.equal(req.method, 'POST');
    assert.equal(new URL(req.url).searchParams.get('sendUpdates'), 'all');
    assert.deepEqual(await req.json(), {
      id: 'abc123',
      summary: 'Delivery',
      start: { date: '2026-11-18' },
      end: { date: '2026-11-19' },
      attendees: [{ email: 'receiver@example.com' }]
    });
  }
});

test('rescheduling changes only the occurrence reviewed and keeps a later edit', async (t) => {
  const patches: Request[] = [];
  let series = false;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const req = new Request(url, init);
    if (req.method === 'GET')
      return Response.json(series ? { recurrence: ['RRULE:FREQ=WEEKLY'] } : {});
    patches.push(req);
    return patches.length === 1
      ? Response.json({ id: 'meeting_1', etag: '"2"' })
      : Response.json({ error: { message: 'Condition not met' } }, { status: 412 });
  });
  const move = {
    name: 'reschedule_event',
    arguments: {
      calendar_id: 'primary',
      event_id: 'meeting_1',
      etag: '"1"',
      start: period.time_min,
      end: period.time_max
    }
  };
  assert.ok(!(await client.callTool(move)).isError);
  assert.equal(patches[0].headers.get('If-Match'), '"1"');
  assert.deepEqual(await patches[0].json(), {
    start: { dateTime: period.time_min },
    end: { dateTime: period.time_max }
  });
  const stale = await client.callTool(move);
  assert.equal(stale.isError, true);
  assert.match(JSON.stringify(stale.content), /This event changed/);
  series = true;
  assert.equal((await client.callTool(move)).isError, true);
  assert.equal(patches.length, 2);
});

test('answering updates only the connected invitee and keeps the other guests', async (t) => {
  let email = 'reader@example.com';
  const patches: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const req = new Request(url, init);
    if (req.method === 'GET')
      return Response.json({ attendees: [{ email: 'guest@example.com' }, { self: true, email }] });
    patches.push(req);
    return Response.json({ id: 'delivery' });
  });
  const answer = {
    name: 'answer_invitation',
    arguments: { calendar_id: 'primary', event_id: 'delivery', etag: '"1"', response: 'tentative' }
  };
  assert.ok(!(await client.callTool(answer)).isError);
  assert.equal(patches[0].headers.get('If-Match'), '"1"');
  assert.deepEqual(await patches[0].json(), {
    attendeesOmitted: true,
    attendees: [{ email: 'reader@example.com', responseStatus: 'tentative' }]
  });
  email = 'different@example.com';
  assert.equal((await client.callTool(answer)).isError, true);
  assert.equal(patches.length, 1);
});
