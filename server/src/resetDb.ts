/** Borra la base de datos del demo; se regenera con datos semilla al iniciar el servidor. */
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbPath = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../data/totems.db');
for (const suffix of ['', '-wal', '-shm']) {
  const p = dbPath + suffix;
  if (existsSync(p)) rmSync(p);
}
console.log('Base de datos eliminada. Se regenerará al iniciar el servidor (npm run dev).');
