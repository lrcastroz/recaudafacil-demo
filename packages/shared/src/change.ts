/**
 * Cálculo de vuelto con inventario limitado.
 * Primero intenta greedy (lo que hacen los equipos); si falla, búsqueda con
 * memoización para encontrar cualquier combinación posible.
 */
export type Inventory = Record<number, number>; // denominación (centavos) -> unidades disponibles
export type Breakdown = Record<number, number>;

export function computeChange(amount: number, inventory: Inventory): Breakdown | null {
  if (amount === 0) return {};
  if (amount < 0) return null;
  const denoms = Object.keys(inventory)
    .map(Number)
    .filter((d) => d > 0 && inventory[d] > 0)
    .sort((a, b) => b - a);

  const greedy = greedyChange(amount, denoms, inventory);
  if (greedy) return greedy;

  const failed = new Set<string>();
  const result: Breakdown = {};
  const search = (idx: number, remaining: number): boolean => {
    if (remaining === 0) return true;
    if (idx >= denoms.length) return false;
    const key = `${idx}:${remaining}`;
    if (failed.has(key)) return false;
    const d = denoms[idx];
    const max = Math.min(inventory[d], Math.floor(remaining / d));
    for (let n = max; n >= 0; n--) {
      if (search(idx + 1, remaining - n * d)) {
        if (n > 0) result[d] = n;
        return true;
      }
    }
    failed.add(key);
    return false;
  };
  return search(0, amount) ? result : null;
}

function greedyChange(amount: number, denoms: number[], inventory: Inventory): Breakdown | null {
  let remaining = amount;
  const out: Breakdown = {};
  for (const d of denoms) {
    const n = Math.min(inventory[d], Math.floor(remaining / d));
    if (n > 0) {
      out[d] = n;
      remaining -= n * d;
    }
  }
  return remaining === 0 ? out : null;
}

export function breakdownTotal(b: Breakdown): number {
  return Object.entries(b).reduce((acc, [d, n]) => acc + Number(d) * n, 0);
}
