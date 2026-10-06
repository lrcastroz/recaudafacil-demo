import {
  buildAccessKey,
  computeTotals,
  maskName,
  validateBillingId,
  type BillingData,
  type CardAuthInfo,
  type CardBrand,
  type CardEntry,
  type PaymentMethod,
  type ServiceType,
  type TransactionSummary,
  type TxStatus,
} from '@totem/shared';
import { BillerError, findAccount, getBiller, pendingInvoices } from './billers';
import { all, get, nowIso, run, tx } from './db';
import { buildReceiptText } from './receipt';
import { getSettings } from './settings';

export interface TotemRow {
  id: string;
  name: string;
  city: string;
  location: string;
  establishment: string;
  emission_point: string;
  paper_level: number;
  receipt_seq: number;
}

export function getTotem(id: string): TotemRow | undefined {
  return get<TotemRow>('SELECT * FROM totems WHERE id = ?', id);
}

export function listTotems(): TotemRow[] {
  return all<TotemRow>('SELECT * FROM totems ORDER BY id');
}

interface TxRow {
  id: string;
  totem_id: string;
  biller_code: string;
  account_id: number | null;
  identifier: string;
  holder_masked: string;
  subtotal: number;
  credit_applied: number;
  commission: number;
  iva: number;
  total: number;
  method: PaymentMethod | null;
  status: TxStatus;
  billing_type: BillingData['type'];
  billing_id: string;
  billing_name: string;
  billing_email: string;
  cash_in: number;
  change_given: number;
  credit_generated: number;
  biller_ref: string | null;
  receipt_number: string | null;
  access_key: string | null;
  receipt_text: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
}

function newTxId() {
  return `TX${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')}`;
}

export function createTransaction(input: {
  totemId: string;
  billerCode: string;
  identifier: string;
  invoiceIds: number[];
  billing: BillingData;
}): TransactionSummary {
  const totem = getTotem(input.totemId);
  if (!totem) throw new BillerError(404, 'Tótem no registrado');
  const biller = getBiller(input.billerCode);
  if (!biller) throw new BillerError(404, 'Empresa no encontrada');
  const account = findAccount(input.billerCode, input.identifier);
  if (!account || account.status !== 'ACTIVA') throw new BillerError(404, 'Cuenta no disponible');

  const pending = pendingInvoices(account.id);
  const n = input.invoiceIds.length;
  if (n === 0) throw new BillerError(400, 'Seleccione al menos una planilla');
  // Regla de negocio: se pagan las planillas más antiguas primero (orden cronológico).
  const expected = pending.slice(0, n).map((i) => i.id);
  if (expected.length !== n || expected.some((id, idx) => id !== input.invoiceIds[idx])) {
    throw new BillerError(400, 'Las planillas deben pagarse en orden, empezando por la más antigua');
  }

  const billing = normalizeBilling(input.billing);
  const settings = getSettings();
  const selected = pending.slice(0, n);
  const totals = computeTotals(
    selected.reduce((a, i) => a + i.amount, 0),
    settings.commission,
    settings.ivaRate,
    account.credit,
  );
  const id = newTxId();
  const ts = nowIso();
  tx(() => {
    run(
      `INSERT INTO transactions(id, totem_id, biller_code, account_id, identifier, holder_masked, subtotal, credit_applied, commission, iva, total,
         method, status, billing_type, billing_id, billing_name, billing_email, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,'INICIADA',?,?,?,?,?,?)`,
      id, totem.id, biller.code, account.id, input.identifier, maskName(account.holder),
      totals.subtotal, totals.creditApplied, totals.commission, totals.iva, totals.total,
      billing.type, billing.id, billing.name, billing.email, ts, ts,
    );
    for (const inv of selected) {
      run('INSERT INTO transaction_invoices(tx_id, invoice_id, period, amount) VALUES (?,?,?,?)', id, inv.id, inv.period, inv.amount);
    }
  });
  return getSummary(id)!;
}

function normalizeBilling(b: BillingData): BillingData {
  if (!b || b.type === 'CONSUMIDOR_FINAL') {
    return { type: 'CONSUMIDOR_FINAL', id: '9999999999999', name: 'CONSUMIDOR FINAL', email: b?.email?.trim() ?? '' };
  }
  if (!validateBillingId(b.type, b.id)) {
    throw new BillerError(400, b.type === 'CEDULA' ? 'Número de cédula inválido' : 'Número de RUC inválido');
  }
  const name = (b.name ?? '').trim().toUpperCase();
  if (name.length < 3) throw new BillerError(400, 'Ingrese el nombre o razón social');
  const email = (b.email ?? '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BillerError(400, 'Correo electrónico inválido');
  return { type: b.type, id: b.id, name, email };
}

export function getSummary(id: string): TransactionSummary | undefined {
  const r = get<TxRow>('SELECT * FROM transactions WHERE id = ?', id);
  if (!r) return undefined;
  const biller = getBiller(r.biller_code)!;
  const invoices = all<{ invoice_id: number; period: string; amount: number }>(
    'SELECT invoice_id, period, amount FROM transaction_invoices WHERE tx_id = ? ORDER BY period',
    id,
  ).map((i) => ({ id: i.invoice_id, period: i.period, amount: i.amount }));
  const card = get<{
    brand: CardBrand;
    last4: string;
    holder: string;
    entry: CardEntry;
    response_code: string;
    auth_code: string | null;
    batch: string | null;
    reference: string | null;
    status: CardAuthInfo['status'];
  }>("SELECT * FROM card_authorizations WHERE tx_id = ? ORDER BY id DESC LIMIT 1", id);
  return {
    id: r.id,
    totemId: r.totem_id,
    billerCode: r.biller_code,
    billerName: biller.name,
    service: biller.service as ServiceType,
    identifier: r.identifier,
    holderMasked: r.holder_masked,
    invoices,
    subtotal: r.subtotal,
    creditApplied: r.credit_applied,
    commission: r.commission,
    iva: r.iva,
    total: r.total,
    method: r.method,
    status: r.status,
    billing: { type: r.billing_type, id: r.billing_id, name: r.billing_name, email: r.billing_email },
    cashIn: r.cash_in,
    changeGiven: r.change_given,
    creditGenerated: r.credit_generated,
    billerRef: r.biller_ref,
    receiptNumber: r.receipt_number,
    accessKey: r.access_key,
    card: card
      ? {
          brand: card.brand,
          last4: card.last4,
          holder: card.holder,
          entry: card.entry,
          responseCode: card.response_code,
          authCode: card.auth_code,
          batch: card.batch,
          reference: card.reference,
          status: card.status,
        }
      : null,
    message: r.message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getReceiptText(id: string): string | null {
  return get<{ receipt_text: string | null }>('SELECT receipt_text FROM transactions WHERE id = ?', id)?.receipt_text ?? null;
}

export function setMethod(id: string, method: PaymentMethod) {
  run("UPDATE transactions SET method = ?, updated_at = ? WHERE id = ? AND status = 'INICIADA'", method, nowIso(), id);
}

export function setStatus(id: string, status: TxStatus, message: string | null, extra: { cashIn?: number } = {}) {
  run(
    'UPDATE transactions SET status = ?, message = ?, cash_in = COALESCE(?, cash_in), updated_at = ? WHERE id = ?',
    status, message, extra.cashIn ?? null, nowIso(), id,
  );
}

/**
 * Marca la transacción como pagada: actualiza planillas, saldo a favor,
 * emite número de comprobante / clave de acceso SRI y genera el texto del ticket.
 */
export function markPaid(
  id: string,
  data: { method: PaymentMethod; billerRef: string; cashIn: number; changeGiven: number; creditGenerated: number },
): TransactionSummary {
  const summary = getSummary(id);
  if (!summary) throw new Error('Transacción no encontrada');
  const totem = getTotem(summary.totemId)!;
  const settings = getSettings();
  const now = new Date();
  tx(() => {
    const seq = totem.receipt_seq + 1;
    run('UPDATE totems SET receipt_seq = ? WHERE id = ?', seq, totem.id);
    const receiptNumber = `${totem.establishment}-${totem.emission_point}-${String(seq).padStart(9, '0')}`;
    const accessKey = buildAccessKey({
      date: now,
      ruc: settings.companyRuc,
      environment: '1',
      establishment: totem.establishment,
      emissionPoint: totem.emission_point,
      sequential: seq,
      numericCode: String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
    });
    run(
      `UPDATE transactions SET status = 'PAGADA', method = ?, biller_ref = ?, cash_in = ?, change_given = ?, credit_generated = ?,
         receipt_number = ?, access_key = ?, message = NULL, updated_at = ? WHERE id = ?`,
      data.method, data.billerRef, data.cashIn, data.changeGiven, data.creditGenerated, receiptNumber, accessKey, now.toISOString(), id,
    );
    for (const inv of summary.invoices) run("UPDATE invoices SET status = 'PAGADA' WHERE id = ?", inv.id);
    run(
      'UPDATE accounts SET credit = credit - ? + ? WHERE biller_code = ? AND identifier = ?',
      summary.creditApplied, data.creditGenerated, summary.billerCode, summary.identifier,
    );
    const updated = getSummary(id)!;
    run('UPDATE transactions SET receipt_text = ? WHERE id = ?', buildReceiptText(updated, totem, settings), id);
  });
  return getSummary(id)!;
}

/** Reverso de un pago ya confirmado (desde el panel administrador). */
export function reversePaid(id: string, reason: string): TransactionSummary {
  const s = getSummary(id);
  if (!s) throw new BillerError(404, 'Transacción no encontrada');
  if (s.status !== 'PAGADA') throw new BillerError(400, 'Sólo se pueden reversar transacciones pagadas');
  tx(() => {
    run("UPDATE transactions SET status = 'REVERSADA', message = ?, updated_at = ? WHERE id = ?", reason, nowIso(), id);
    for (const inv of s.invoices) run("UPDATE invoices SET status = 'PENDIENTE' WHERE id = ?", inv.id);
    run("UPDATE card_authorizations SET status = 'REVERSADA' WHERE tx_id = ? AND status = 'APROBADA'", id);
  });
  return getSummary(id)!;
}

export function recordCardAuth(data: {
  txId: string;
  brand: CardBrand;
  last4: string;
  holder: string;
  entry: CardEntry;
  amount: number;
  responseCode: string;
  authCode: string | null;
  batch: string | null;
  reference: string | null;
  status: CardAuthInfo['status'];
}) {
  run(
    `INSERT INTO card_authorizations(tx_id, brand, last4, holder, entry, amount, response_code, auth_code, batch, reference, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    data.txId, data.brand, data.last4, data.holder, data.entry, data.amount, data.responseCode,
    data.authCode, data.batch, data.reference, data.status, nowIso(),
  );
}

export function reverseCardAuth(txId: string) {
  run("UPDATE card_authorizations SET status = 'REVERSADA' WHERE tx_id = ? AND status = 'APROBADA'", txId);
}

export function recordCashMovement(
  totemId: string,
  txId: string | null,
  direction: 'IN' | 'CHANGE' | 'REFUND' | 'LOAD' | 'WITHDRAW',
  kind: 'coin' | 'bill',
  value: number,
  count: number,
) {
  run(
    'INSERT INTO cash_movements(totem_id, tx_id, direction, kind, value, count, created_at) VALUES (?,?,?,?,?,?,?)',
    totemId, txId, direction, kind, value, count, nowIso(),
  );
}
