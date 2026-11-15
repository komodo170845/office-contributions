import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backUpOffice } from './office-backup.mjs';

test('a work backup keeps the built-in database and work, and never replaces an existing copy', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'oddboro-backup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'working');
  const destination = join(root, 'Friday');
  mkdirSync(join(home, 'db'), { recursive: true });
  writeFileSync(join(home, 'db', 'PG_VERSION'), '17');
  mkdirSync(join(home, 'staff'));
  writeFileSync(join(home, 'staff', 'report.md'), 'Recovered report.');
  writeFileSync(join(home, 'service.json'), 'active session');
  writeFileSync(join(home, '.env'), 'ACCOUNT_KEY=fictional');
  const backup = (target) => backUpOffice(home, target, {});
  assert.throws(
    () => backUpOffice(home, destination, { DATABASE_URL: 'external' }),
    /external Postgres/
  );
  const copy = backup(destination);
  assert.deepEqual(readdirSync(copy).sort(), ['db', 'staff']);
  assert.equal(readFileSync(join(copy, 'staff', 'report.md'), 'utf8'), 'Recovered report.');
  assert.throws(() => backup(destination), { code: 'EEXIST' });
  assert.throws(() => backup(join(home, 'Friday')), /outside the office/);
  assert.equal(existsSync(join(home, 'Friday')), false);
  if (process.platform !== 'win32') {
    symlinkSync(home, join(root, 'alias'));
    assert.throws(() => backup(join(root, 'alias', 'Friday')), /outside the office/);
    symlinkSync(root, join(home, 'threads'));
    assert.throws(() => backup(join(root, 'Saturday')), /linked threads/);
    assert.equal(existsSync(join(root, 'Saturday')), false);
  }
});
