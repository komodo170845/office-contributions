import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentProblem, nextStation } from '../src/station-route.ts';

const stages = [
  { name: 'Write', odd: 'writer', doneWhen: 'A draft exists.' },
  { name: 'QA', odd: 'reviewer', doneWhen: 'The sources check out.', reviseTo: 0 }
];

test('acceptance and revision select the same stations for live and sample results', () => {
  assert.deepEqual(nextStation(stages, 0, { outcome: 'done' }, null), { next: 1 });
  assert.deepEqual(
    nextStation(stages, 1, { outcome: 'failed' }, 'Missing source.\nRevision needed'),
    { next: 0 }
  );
  assert.deepEqual(nextStation(stages, 1, { outcome: 'done' }, 'Checked.'), {
    outcome: 'done',
    text: 'Checked.'
  });
  assert.match(
    assignmentProblem(stages[1], [{ id: 'writer' }], 'manager') ?? '',
    /Choose a current Odd for QA/
  );
  assert.equal(assignmentProblem(stages[1], [{ id: 'reviewer' }], 'manager'), undefined);
});

test('a direct owner answer returns to the station and a failure or wait keeps its reason', () => {
  assert.deepEqual(
    nextStation(stages, 1, { outcome: 'done', answered: true }, 'Use the new source.'),
    { next: 1 }
  );
  assert.deepEqual(nextStation(stages, 1, { outcome: 'waiting' }, 'Need a source.'), {
    outcome: 'waiting',
    text: 'Need a source.'
  });
  assert.deepEqual(nextStation(stages, 1, { outcome: 'failed' }, 'No file.'), {
    outcome: 'failed',
    text: 'No file.'
  });
  assert.deepEqual(nextStation(stages, 0, { outcome: 'failed' }, 'Revision needed'), {
    outcome: 'failed',
    text: 'Revision needed'
  });
});
