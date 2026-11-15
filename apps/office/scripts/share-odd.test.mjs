import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectedContext } from './share-odd.mjs';

test('sharing names the chosen Odd and includes only the context the owner selected', async () => {
  const answers = {
    '/api/workspace': {
      staff: [{ id: 'kit', name: 'Kit', role: 'Clerk', desk: 'Private instructions' }],
      inProgress: {
        kit: [{ label: 'Count crates', detail: 'Private notes' }],
        jo: [{ label: 'Separate job' }]
      }
    },
    '/api/goals': {
      goals: [
        { title: 'Pack orders', status: 'active' },
        { title: 'Closed', status: 'met' }
      ]
    },
    '/api/lessons': [
      { staffId: null, status: 'live', text: 'Use counts', quote: 'Private source' },
      { staffId: 'kit', status: 'live', text: 'One Odd only' },
      { staffId: null, status: 'guess', text: 'Unconfirmed' }
    ]
  };
  const calls = [];
  const read = async (path) => {
    calls.push(path);
    return answers[path];
  };
  const odd = { id: 'kit', name: 'Kit', role: 'Clerk' };
  assert.deepEqual(await selectedContext('kit', [], read), { odd });
  assert.deepEqual(calls, ['/api/workspace']);
  assert.deepEqual(await selectedContext('kit', ['--goals', '--lessons', '--work'], read), {
    odd,
    goals: ['Pack orders'],
    lessons: ['Use counts'],
    work: ['Count crates']
  });
  await assert.rejects(selectedContext('missing', [], read), /Choose an Odd/);
  await assert.rejects(selectedContext('kit', ['--all'], read), /Choose --goals/);
});

test('a tool can offer text, but only the owner sends it and shares the reply', async () => {
  const { handoffs } = await import('./coding-handoffs.mjs');
  const turns = [];
  const notices = [];
  const answer = Promise.withResolvers();
  const inbox = handoffs(
    'a'.repeat(64),
    'kit',
    async (turn) => {
      turns.push(turn);
      return answer.promise;
    },
    (line) => notices.push(line)
  );
  const selected = {
    requestId: 'beans',
    message: 'Count the sacks.',
    files: [{ name: 'slips.csv', text: 'sacks\n17' }]
  };
  assert.equal(inbox.propose(selected).status, 'waiting for owner');
  assert.deepEqual(inbox.propose(selected), inbox.result('beans'));
  assert.throws(() => inbox.propose({ ...selected, message: 'Changed' }), /different work/);
  assert.equal(notices.length, 1);
  assert.ok(notices[0].includes('slips.csv') && notices[0].includes('17'));
  await inbox.decide('send 2');
  assert.deepEqual(turns, []);
  const run = inbox.decide('send 1');
  await inbox.decide('send 1');
  assert.equal(inbox.result('beans').status, 'running');
  assert.equal(turns.length, 1);
  assert.equal(Buffer.from(turns[0].files[0].data, 'base64').toString(), selected.files[0].text);
  answer.resolve('17 sacks.');
  await run;
  assert.equal(inbox.result('beans').answer, '17 sacks.');
  assert.equal(inbox.propose(selected).answer, '17 sacks.');
  assert.equal(
    inbox.propose({ requestId: 'second', message: 'Wait.' }).status,
    'waiting for owner'
  );
  await inbox.decide('decline 2');
  assert.equal(inbox.result('second').status, 'declined');
  assert.equal(turns.length, 1);
});
