export { formatMoney } from '@totem/shared';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function periodName(period: string): string {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function ecDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ecTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Código de barras de la planilla: "EMPRESA|identificador" */
export function parsePlanillaBarcode(code: string): { billerCode: string; identifier: string } | null {
  // El código de empresa puede incluir dígitos (ej. YIGA5)
  const m = /^([A-Z][A-Z0-9_]*)\|(\d+)$/.exec(code.trim());
  return m ? { billerCode: m[1], identifier: m[2] } : null;
}
