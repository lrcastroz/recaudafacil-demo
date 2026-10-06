import type { PublicSettings } from '@totem/shared';
import { all, run } from './db';

export const DEFAULT_SETTINGS: PublicSettings = {
  commission: 40, // $0,40 por transacción
  ivaRate: 15,
  acceptedCoins: [1, 5, 10, 25, 50, 100],
  acceptedBills: [100, 500, 1000, 2000],
  maxCashTotal: 30000, // $300
  maxCardTotal: 150000, // $1.500
  contactlessCvmLimit: 5000, // contactless sin PIN hasta $50
  inactivitySeconds: 60,
  fastMode: false,
  companyName: 'RECAUDAFACIL S.A.',
  companyRuc: '1792345678001',
};

/** Denominaciones de billete que el reciclador puede reutilizar como vuelto */
export const RECYCLABLE_BILLS = [100, 500, 1000];

export function getSettings(): PublicSettings {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  return s as unknown as PublicSettings;
}

export function updateSettings(patch: Partial<PublicSettings>): PublicSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    run(
      'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value),
    );
  }
  return getSettings();
}
