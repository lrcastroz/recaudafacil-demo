/** Inventario de efectivo por tótem: hopper (monedas), reciclador (billetes de vuelto) y caja fuerte. */
import { computeChange, type CashItem, type Inventory, type InventoryRow } from '@totem/shared';
import { all, get, run } from './db';
import { RECYCLABLE_BILLS } from './settings';

export type Location = InventoryRow['location'];
export interface StoredItem extends CashItem {
  location: Location;
}

export function getInventory(totemId: string): InventoryRow[] {
  return all<InventoryRow>(
    'SELECT kind, value, location, count, capacity FROM cash_inventory WHERE totem_id = ? ORDER BY location, kind, value',
    totemId,
  );
}

function getRow(totemId: string, kind: string, value: number, location: Location) {
  return get<InventoryRow>(
    'SELECT kind, value, location, count, capacity FROM cash_inventory WHERE totem_id = ? AND kind = ? AND value = ? AND location = ?',
    totemId, kind, value, location,
  );
}

function adjust(totemId: string, kind: string, value: number, location: Location, delta: number) {
  run(
    'UPDATE cash_inventory SET count = MAX(count + ?, 0) WHERE totem_id = ? AND kind = ? AND value = ? AND location = ?',
    delta, totemId, kind, value, location,
  );
}

/** Guarda un ítem ingresado por el cliente y devuelve dónde quedó físicamente. */
export function storeItem(totemId: string, item: CashItem): Location {
  let location: Location = 'cashbox';
  if (item.kind === 'coin') {
    const hopper = getRow(totemId, 'coin', item.value, 'hopper');
    if (hopper && hopper.count < hopper.capacity) location = 'hopper';
  } else if (RECYCLABLE_BILLS.includes(item.value)) {
    const rec = getRow(totemId, 'bill', item.value, 'recycler');
    if (rec && rec.count < rec.capacity) location = 'recycler';
  }
  adjust(totemId, item.kind, item.value, location, 1);
  return location;
}

export function takeItem(totemId: string, item: StoredItem) {
  adjust(totemId, item.kind, item.value, item.location, -1);
}

/** Unidades disponibles para entregar vuelto (monedas del hopper + billetes del reciclador). */
export function dispensableInventory(totemId: string, noChange: boolean): Inventory {
  if (noChange) return {};
  const inv: Inventory = {};
  for (const r of getInventory(totemId)) {
    if (r.location === 'hopper' || r.location === 'recycler') inv[r.value] = (inv[r.value] ?? 0) + r.count;
  }
  return inv;
}

export function canGiveChange(totemId: string, amount: number, noChange: boolean): boolean {
  return computeChange(amount, dispensableInventory(totemId, noChange)) !== null;
}

/** Convierte un desglose de vuelto en ítems físicos (prefiere monedas de $1 antes que billetes de $1). */
export function planChange(totemId: string, amount: number, noChange: boolean): StoredItem[] | null {
  const breakdown = computeChange(amount, dispensableInventory(totemId, noChange));
  if (!breakdown) return null;
  const rows = getInventory(totemId);
  const items: StoredItem[] = [];
  const denoms = Object.keys(breakdown).map(Number).sort((a, b) => b - a);
  for (const d of denoms) {
    let n = breakdown[d];
    const bills = rows.find((r) => r.location === 'recycler' && r.value === d)?.count ?? 0;
    const coins = rows.find((r) => r.location === 'hopper' && r.value === d)?.count ?? 0;
    // Billetes primero para montos grandes ($5, $10); para $1 se prioriza la moneda.
    const order: [CashItem['kind'], Location, number][] =
      d === 100 ? [['coin', 'hopper', coins], ['bill', 'recycler', bills]] : [['bill', 'recycler', bills], ['coin', 'hopper', coins]];
    for (const [kind, location, available] of order) {
      const take = Math.min(n, available);
      for (let i = 0; i < take; i++) items.push({ kind, value: d, location });
      n -= take;
    }
  }
  return items;
}

/** Carga de fondo de cambio (operación de transportadora de valores / supervisor). */
export function loadChange(totemId: string, kind: 'coin' | 'bill', value: number, count: number) {
  const location: Location = kind === 'coin' ? 'hopper' : 'recycler';
  const row = getRow(totemId, kind, value, location);
  if (!row) throw new Error('Denominación no admitida para carga de cambio');
  const n = Math.max(0, Math.min(count, row.capacity - row.count));
  adjust(totemId, kind, value, location, n);
  return n;
}

/** Vacía la caja fuerte (retiro de recaudación). Devuelve lo retirado. */
export function emptyCashbox(totemId: string): { kind: string; value: number; count: number }[] {
  const rows = all<{ kind: string; value: number; count: number }>(
    "SELECT kind, value, count FROM cash_inventory WHERE totem_id = ? AND location = 'cashbox' AND count > 0",
    totemId,
  );
  run("UPDATE cash_inventory SET count = 0 WHERE totem_id = ? AND location = 'cashbox'", totemId);
  return rows;
}
