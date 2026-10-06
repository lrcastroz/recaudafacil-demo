import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// DB_PATH permite ubicar la base en un disco persistente al desplegar (ej. /var/data/totems.db)
export const DB_PATH = process.env.DB_PATH ? resolve(process.env.DB_PATH) : resolve(here, '../data/totems.db');

if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS totems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  location TEXT NOT NULL,
  establishment TEXT NOT NULL,
  emission_point TEXT NOT NULL,
  paper_level INTEGER NOT NULL DEFAULT 100,
  receipt_seq INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'TOTEM' -- TOTEM | WEB
);

CREATE TABLE IF NOT EXISTS cash_inventory (
  totem_id TEXT NOT NULL REFERENCES totems(id),
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  location TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL,
  PRIMARY KEY (totem_id, kind, value, location)
);

CREATE TABLE IF NOT EXISTS billers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  service TEXT NOT NULL,
  region TEXT NOT NULL,
  id_label TEXT NOT NULL,
  id_hint TEXT NOT NULL,
  id_pattern TEXT NOT NULL,
  color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  biller_code TEXT NOT NULL REFERENCES billers(code),
  identifier TEXT NOT NULL,
  holder TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVA',
  credit INTEGER NOT NULL DEFAULT 0,
  UNIQUE (biller_code, identifier)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  period TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDIENTE'
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  totem_id TEXT NOT NULL REFERENCES totems(id),
  biller_code TEXT NOT NULL REFERENCES billers(code),
  account_id INTEGER REFERENCES accounts(id),
  identifier TEXT NOT NULL,
  holder_masked TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  credit_applied INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL,
  iva INTEGER NOT NULL,
  total INTEGER NOT NULL,
  method TEXT,
  status TEXT NOT NULL,
  billing_type TEXT NOT NULL,
  billing_id TEXT NOT NULL,
  billing_name TEXT NOT NULL,
  billing_email TEXT NOT NULL,
  cash_in INTEGER NOT NULL DEFAULT 0,
  change_given INTEGER NOT NULL DEFAULT 0,
  credit_generated INTEGER NOT NULL DEFAULT 0,
  biller_ref TEXT,
  receipt_number TEXT,
  access_key TEXT,
  receipt_text TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

CREATE TABLE IF NOT EXISTS transaction_invoices (
  tx_id TEXT NOT NULL REFERENCES transactions(id),
  invoice_id INTEGER NOT NULL,
  period TEXT NOT NULL,
  amount INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  totem_id TEXT NOT NULL,
  tx_id TEXT,
  direction TEXT NOT NULL, -- IN | CHANGE | REFUND | LOAD | WITHDRAW
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_authorizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_id TEXT NOT NULL REFERENCES transactions(id),
  brand TEXT NOT NULL,
  last4 TEXT NOT NULL,
  holder TEXT NOT NULL,
  entry TEXT NOT NULL,
  amount INTEGER NOT NULL,
  response_code TEXT NOT NULL,
  auth_code TEXT,
  batch TEXT,
  reference TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  totem_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  period_from TEXT NOT NULL,
  cash_collected INTEGER NOT NULL,
  card_collected INTEGER NOT NULL,
  withdrawn INTEGER NOT NULL,
  tx_count INTEGER NOT NULL,
  detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway_sessions (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL REFERENCES transactions(id),
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL, -- PENDIENTE | APROBADA | RECHAZADA | CANCELADA | EXPIRADA
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  totem_id TEXT NOT NULL,
  device TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

// Migración para bases creadas antes de existir el canal web
const totemCols = db.prepare('PRAGMA table_info(totems)').all() as { name: string }[];
if (!totemCols.some((c) => c.name === 'channel')) {
  db.exec("ALTER TABLE totems ADD COLUMN channel TEXT NOT NULL DEFAULT 'TOTEM'");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T = Row>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: (string | number | null)[]) {
  return db.prepare(sql).run(...params);
}
