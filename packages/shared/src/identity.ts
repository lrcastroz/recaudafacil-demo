/** Validaciones de identificación ecuatoriana (cédula y RUC) y utilidades afines. */

function provinceOk(code: number): boolean {
  return (code >= 1 && code <= 24) || code === 30;
}

export function cedulaCheckDigit(first9: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    sum += p;
  }
  return (10 - (sum % 10)) % 10;
}

/** Cédula: 10 dígitos, provincia 01-24 o 30, tercer dígito < 6, verificador módulo 10. */
export function validateCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  if (!provinceOk(Number(value.slice(0, 2)))) return false;
  if (Number(value[2]) >= 6) return false;
  return cedulaCheckDigit(value.slice(0, 9)) === Number(value[9]);
}

/** RUC: 13 dígitos. Persona natural = cédula válida + establecimiento distinto de 000. */
export function validateRuc(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  if (value.endsWith('000')) return false;
  if (!provinceOk(Number(value.slice(0, 2)))) return false;
  const third = Number(value[2]);
  if (third < 6) return validateCedula(value.slice(0, 10));
  return third === 6 || third === 9;
}

export type BillingIdType = 'CONSUMIDOR_FINAL' | 'CEDULA' | 'RUC';

export function validateBillingId(type: BillingIdType, value: string): boolean {
  if (type === 'CONSUMIDOR_FINAL') return true;
  if (type === 'CEDULA') return validateCedula(value);
  return validateRuc(value);
}

/** "JUAN CARLOS PEREZ" -> "JUAN C***** P****" */
export function maskName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p, i) => (i === 0 ? p : p[0] + '*'.repeat(Math.max(p.length - 1, 2))))
    .join(' ');
}

export function luhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function luhnComplete(partial: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValid(partial + d)) return partial + d;
  }
  throw new Error('unreachable');
}
