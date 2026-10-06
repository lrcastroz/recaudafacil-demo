/** Todos los montos se manejan en centavos enteros (USD). */

export const COIN_VALUES = [1, 5, 10, 25, 50, 100] as const;
export const BILL_VALUES = [100, 200, 500, 1000, 2000, 5000, 10000] as const;

export type CashKind = 'coin' | 'bill';

export interface CashItem {
  kind: CashKind;
  value: number;
}

const formatter = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

export function formatMoney(cents: number): string {
  return formatter.format(cents / 100).replace(/ /g, ' ');
}

/** Formato fijo para comprobantes térmicos: "$ 1.234,56" */
export function formatMoneyPlain(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const c = (abs % 100).toString().padStart(2, '0');
  return `${sign}$ ${dollars},${c}`;
}

export function denominationLabel(item: CashItem): string {
  if (item.kind === 'coin' && item.value < 100) return `${item.value}¢`;
  return `$${item.value / 100}`;
}

export function sumItems(items: CashItem[]): number {
  return items.reduce((acc, i) => acc + i.value, 0);
}

export interface Totals {
  /** Suma de planillas seleccionadas */
  subtotal: number;
  /** Saldo a favor de la cuenta aplicado a esta transacción */
  creditApplied: number;
  commission: number;
  iva: number;
  total: number;
}

/**
 * El valor de las planillas no grava IVA; sólo la comisión de recaudación
 * (servicio del tótem) grava IVA (15 % en Ecuador desde abril 2024).
 */
export function computeTotals(
  invoicesSum: number,
  commission: number,
  ivaRatePercent: number,
  availableCredit = 0,
): Totals {
  const creditApplied = Math.min(Math.max(availableCredit, 0), invoicesSum);
  const iva = Math.round((commission * ivaRatePercent) / 100);
  return {
    subtotal: invoicesSum,
    creditApplied,
    commission,
    iva,
    total: invoicesSum - creditApplied + commission + iva,
  };
}
