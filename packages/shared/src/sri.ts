/**
 * Clave de acceso SRI (49 dígitos) para comprobantes electrónicos:
 * fecha(8) tipo(2) ruc(13) ambiente(1) serie(6) secuencial(9) código(8) tipoEmisión(1) verificador(1)
 */
export function mod11CheckDigit(digits: string): number {
  let factor = 2;
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (sum % 11);
  if (r === 11) return 0;
  if (r === 10) return 1;
  return r;
}

export function buildAccessKey(opts: {
  date: Date;
  ruc: string;
  environment: '1' | '2';
  establishment: string;
  emissionPoint: string;
  sequential: number;
  numericCode: string;
}): string {
  const d = opts.date;
  const base =
    String(d.getDate()).padStart(2, '0') +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getFullYear()) +
    '01' +
    opts.ruc +
    opts.environment +
    opts.establishment +
    opts.emissionPoint +
    String(opts.sequential).padStart(9, '0') +
    opts.numericCode.padStart(8, '0') +
    '1';
  return base + mod11CheckDigit(base);
}
