import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSpaces, SAMPLE } from '@oddboro/world/load';
import { buildMainStreet, mainStreetSpec } from './main-street.ts';
import { spriteCatalog } from './space.ts';

test('adding a station keeps the hand-built floor and custom room names in an editable copy', () => {
  const catalog = spriteCatalog();
  const spec = mainStreetSpec({ library: 'Reading room' });
  const original = loadSpaces().plans[SAMPLE];
  spec.rooms.push({ kind: 'workspace', name: 'QA room', seats: 2 });
  const copy = buildMainStreet(spec, catalog, 3);
  assert.deepEqual(copy.problems, []);
  assert.ok(copy.world?.rooms.some((r) => r.name === 'QA room'));
  assert.equal(copy.templates.library.name, 'Reading room');
  assert.deepEqual(
    copy.plan.rooms.slice(0, original.rooms.length).map((r) => r.at),
    original.rooms.map((r) => r.at)
  );
  assert.deepEqual(copy.templates.library.map, loadSpaces().rooms.library.map);
  assert.deepEqual(
    copy.templates.library.props.map((p) => p.at),
    loadSpaces().rooms.library.props.map((p) => p.at)
  );
  assert.deepEqual(original, loadSpaces().plans[SAMPLE]);
  spec.rooms[0].floor = 'tile';
  assert.equal(buildMainStreet(spec, catalog, 3).templates['owner-office'].floor, 'tile');
});

test('a table across the only entrance names the blocked path in the renamed room', () => {
  const spec = mainStreetSpec({ 'library#7': 'Map Room' });
  const library = spec.rooms.find((r) => r.starterRoom === 'library');
  assert.ok(library);
  library.edits = [{ add: 'library-table', at: [7, 9] }];
  const { problems } = buildMainStreet(spec, spriteCatalog(), 1);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^In Map Room, clear a path from the doorway to the window seat/);
});
