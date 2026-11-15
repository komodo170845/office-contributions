import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';

// The desktop executable holds the supervisor's lease for this entire call.
export function backUpOffice(home, folder, environment = process.env) {
  const settings = environment.ODDBORO_ENV ?? join(home, '.env');
  const saved = existsSync(settings) ? parseEnv(readFileSync(settings, 'utf8')) : {};
  const value = (key) => environment[key] ?? saved[key];
  if (value('ODDBORO_SERVER_URL') || (value('DATABASE_URL') && value('ODDBORO_LOCAL_DB') !== '1'))
    throw Error('Back up the remote office or external Postgres database at its host.');
  if (!existsSync(join(home, 'db', 'PG_VERSION')))
    throw Error('No built-in office database found.');

  // Resolve the parent first, including any link to a directory within the office.
  const destination = join(realpathSync(dirname(resolve(folder))), basename(resolve(folder)));
  const inside = relative(realpathSync(home), destination);
  if (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + sep))
    throw Error('Choose a new folder outside the office.');
  mkdirSync(destination, { mode: 0o700 });
  const copying = join(destination, '.copying');
  const complete = join(destination, 'office');
  try {
    mkdirSync(copying, { mode: 0o700 });
    for (const name of [
      'db',
      'staff',
      'threads',
      'office',
      'data',
      'project-sessions',
      'seeds.md',
      'version'
    ]) {
      const source = join(home, name);
      const stat = lstatSync(source, { throwIfNoEntry: false });
      if (!stat) continue;
      if (stat.isSymbolicLink()) throw Error('Back up the linked ' + name + ' separately.');
      cpSync(source, join(copying, name), { recursive: true, verbatimSymlinks: true });
    }
    renameSync(copying, complete);
  } catch (error) {
    rmSync(copying, { recursive: true, force: true });
    rmdirSync(destination);
    throw error;
  }
  return complete;
}
