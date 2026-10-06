/**
 * Adaptador mock de las empresas de servicios (billers).
 * En producción cada empresa se integra vía web service / switch transaccional;
 * aquí se simulan la consulta de deuda, la confirmación del pago y el reverso.
 */
import type { Biller, InquiryResult, InvoiceInfo } from '@totem/shared';
import { maskName } from '@totem/shared';
import { all, get } from './db';

export class BillerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface BillerRow {
  code: string;
  name: string;
  short_name: string;
  service: Biller['service'];
  region: string;
  id_label: string;
  id_hint: string;
  id_pattern: string;
  color: string;
  active: number;
}

function toBiller(r: BillerRow): Biller {
  return {
    code: r.code,
    name: r.name,
    shortName: r.short_name,
    service: r.service,
    region: r.region,
    idLabel: r.id_label,
    idHint: r.id_hint,
    idPattern: r.id_pattern,
    color: r.color,
    active: !!r.active,
  };
}

export function listBillers(includeInactive = false): Biller[] {
  return all<BillerRow>(
    `SELECT * FROM billers ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY service, name`,
  ).map(toBiller);
}

export function getBiller(code: string): Biller | undefined {
  const r = get<BillerRow>('SELECT * FROM billers WHERE code = ?', code);
  return r ? toBiller(r) : undefined;
}

export interface AccountRow {
  id: number;
  biller_code: string;
  identifier: string;
  holder: string;
  holder_id: string;
  address: string;
  status: string;
  credit: number;
}

export function findAccount(billerCode: string, identifier: string): AccountRow | undefined {
  return get<AccountRow>('SELECT * FROM accounts WHERE biller_code = ? AND identifier = ?', billerCode, identifier);
}

export function pendingInvoices(accountId: number): InvoiceInfo[] {
  const today = new Date().toISOString().slice(0, 10);
  return all<{ id: number; period: string; issue_date: string; due_date: string; amount: number; detail: string }>(
    `SELECT id, period, issue_date, due_date, amount, detail FROM invoices
     WHERE account_id = ? AND status = 'PENDIENTE' ORDER BY period ASC`,
    accountId,
  ).map((i) => ({
    id: i.id,
    period: i.period,
    issueDate: i.issue_date,
    dueDate: i.due_date,
    amount: i.amount,
    detail: i.detail,
    overdue: i.due_date < today,
  }));
}

/** Consulta de deuda (equivalente a la transacción "consulta" del switch). */
export function inquiry(billerCode: string, identifier: string): InquiryResult {
  const biller = getBiller(billerCode);
  if (!biller || !biller.active) throw new BillerError(404, 'Empresa no disponible');
  if (!new RegExp(biller.idPattern).test(identifier)) {
    throw new BillerError(400, `El ${biller.idLabel.toLowerCase()} ingresado no es válido (${biller.idHint}).`);
  }
  const account = findAccount(billerCode, identifier);
  if (!account) {
    throw new BillerError(404, `No se encontró el ${biller.idLabel.toLowerCase()} ${identifier} en ${biller.shortName}.`);
  }
  if (account.status === 'ERROR_CONSULTA') {
    throw new BillerError(503, `${biller.shortName} no responde en este momento. Intente nuevamente en unos minutos.`);
  }
  if (account.status === 'SUSPENDIDA') {
    throw new BillerError(
      409,
      'La cuenta se encuentra suspendida. Para regularizarla acérquese a una agencia de atención al cliente de la empresa.',
    );
  }
  return {
    biller,
    identifier,
    holderMasked: maskName(account.holder),
    address: account.address,
    credit: account.credit,
    invoices: pendingInvoices(account.id),
  };
}

/** Confirmación del pago ante la empresa: devuelve la referencia de la empresa. */
export function confirmPayment(billerCode: string, billerDown: boolean): string {
  if (billerDown) {
    throw new BillerError(504, 'La empresa no confirmó el pago (tiempo de espera agotado).');
  }
  return `${billerCode}-${Math.floor(1000000 + Math.random() * 8999999)}`;
}
