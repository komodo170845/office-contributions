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
