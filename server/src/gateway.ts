/**
 * Botón de pagos simulado ("PagoSeguro", pasarela ficticia).
 *
 * Flujo típico de una pasarela de comercio electrónico:
 *   1. El comercio (portal RecaudaFácil) crea una sesión de pago con el monto → URL de checkout.
 *   2. El cliente ingresa su tarjeta en la página de la pasarela (el comercio nunca ve el PAN).
 *   3. Según la marca, el emisor exige un desafío 3-D Secure (OTP por SMS).
 *   4. Autorización ISO 8583; si se aprueba, el comercio confirma el pago con la empresa de servicios.
 *   5. La pasarela redirige al cliente a la página de resultado del comercio.
 */
import {
  ISO_RESPONSES,
  TEST_CARDS,
  TEST_OTP,
  detectBrand,
  formatMoney,
  luhnValid,
  requires3ds,
  type BillingData,
  type CardBrand,
} from '@totem/shared';
import { BillerError, confirmPayment } from './billers';
import { get, nowIso, run } from './db';
import { WEB_CHANNEL } from './seed';
import { createTransaction, getSummary, markPaid, recordCardAuth, setMethod, setStatus } from './transactions';

const SESSION_MINUTES = 15;
const MAX_ATTEMPTS = 3;
const MAX_OTP_ATTEMPTS = 3;

export type SessionStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' | 'EXPIRADA';

interface SessionRow {
  id: string;
  tx_id: string;
  amount: number;
  description: string;
  status: SessionStatus;
  attempts: number;
  created_at: string;
  expires_at: string;
}

export interface CardInput {
  number: string;
  holder: string;
  expMonth: string;
  expYear: string;
  cvv: string;
}

/** Datos de la tarjeta pendiente de 3-D Secure. Sólo en memoria: nunca se persiste el PAN. */
interface PendingChallenge {
  brand: CardBrand;
  last4: string;
  holder: string;
  responseCode: string;
  bank: string;
  otpAttempts: number;
}

const challenges = new Map<string, PendingChallenge>();
/** Sesiones con una operación en curso (evita doble cobro por doble clic). */
const inFlight = new Set<string>();

async function exclusive<T>(id: string, fn: () => Promise<T>): Promise<T> {
  if (inFlight.has(id)) throw new BillerError(409, 'Su pago se está procesando, espere por favor');
  inFlight.add(id);
  try {
    return await fn();
  } finally {
    inFlight.delete(id);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const resultUrl = (txId: string) => `/pagos/resultado/${txId}`;

export type GatewayResult =
  | { status: 'approved'; redirectUrl: string; authCode: string }
  | { status: 'declined'; code: string; message: string; attemptsLeft: number }
  | { status: 'failed'; code: string; message: string; redirectUrl: string }
  | { status: 'challenge'; bank: string; phoneMasked: string; brand: CardBrand; error?: string; attemptsLeft?: number };

/** Paso 1: el comercio crea la transacción y la sesión de pago. */
export function createCheckout(input: { billerCode: string; identifier: string; invoiceIds: number[]; billing: BillingData }) {
  if (!input.billing?.email?.trim()) throw new BillerError(400, 'Ingrese un correo electrónico para enviarle el comprobante');
  const tx = createTransaction({ ...input, totemId: WEB_CHANNEL.id });
  setMethod(tx.id, 'TARJETA');
  const id = `PS-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MINUTES * 60_000);
  const description = `Pago ${tx.billerName} · ${tx.identifier}`;
  run(
    `INSERT INTO gateway_sessions(id, tx_id, amount, description, status, attempts, created_at, expires_at, updated_at)
     VALUES (?,?,?,?, 'PENDIENTE', 0, ?,?,?)`,
    id, tx.id, tx.total, description, now.toISOString(), expires.toISOString(), now.toISOString(),
  );
  return { sessionId: id, checkoutUrl: `/pasarela/${id}`, transaction: tx };
}

function loadSession(id: string): SessionRow {
  const s = get<SessionRow>('SELECT * FROM gateway_sessions WHERE id = ?', id);
  if (!s) throw new BillerError(404, 'Sesión de pago no encontrada');
  if (s.status === 'PENDIENTE' && new Date(s.expires_at) < new Date()) {
    updateSession(id, 'EXPIRADA');
    setStatus(s.tx_id, 'CANCELADA', 'Sesión del botón de pagos expirada');
    challenges.delete(id);
    return { ...s, status: 'EXPIRADA' };
  }
  return s;
}

function updateSession(id: string, status: SessionStatus, attempts?: number) {
  run(
    'UPDATE gateway_sessions SET status = ?, attempts = COALESCE(?, attempts), updated_at = ? WHERE id = ?',
    status, attempts ?? null, nowIso(), id,
  );
}

function requirePending(id: string): SessionRow {
  const s = loadSession(id);
  if (s.status !== 'PENDIENTE') {
    throw new BillerError(409, s.status === 'EXPIRADA' ? 'La sesión de pago expiró. Vuelva al comercio e inicie el pago nuevamente.' : 'Esta sesión de pago ya fue finalizada');
  }
  return s;
}

/** Información pública de la sesión para dibujar la página de checkout. */
export function sessionInfo(id: string) {
  const s = loadSession(id);
  const tx = getSummary(s.tx_id)!;
  return {
    id: s.id,
    status: s.status,
    merchant: 'RECAUDAFACIL S.A.',
    merchantRuc: '1792345678001',
    description: s.description,
    reference: s.tx_id,
    amount: s.amount,
    breakdown: { subtotal: tx.subtotal, creditApplied: tx.creditApplied, commission: tx.commission, iva: tx.iva },
    email: tx.billing.email,
    attempts: s.attempts,
    maxAttempts: MAX_ATTEMPTS,
    expiresAt: s.expires_at,
    pendingChallenge: challenges.has(id),
    returnUrl: resultUrl(s.tx_id),
  };
}

function validateCard(card: CardInput) {
  const number = (card.number ?? '').replace(/\D/g, '');
  const brand = detectBrand(number);
  if (!brand) throw new BillerError(400, 'Tarjeta no soportada. Aceptamos Visa, Mastercard, Diners Club, American Express y Discover.');
  if (number.length < 14 || number.length > 19 || !luhnValid(number)) throw new BillerError(400, 'Número de tarjeta inválido');
  const holder = (card.holder ?? '').trim().toUpperCase();
  if (holder.length < 3) throw new BillerError(400, 'Ingrese el nombre como aparece en la tarjeta');
  const month = Number(card.expMonth);
  const year = 2000 + Number(card.expYear);
  if (!(month >= 1 && month <= 12) || !(year >= 2000)) throw new BillerError(400, 'Fecha de expiración inválida');
  const cvvLen = brand === 'AMEX' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvvLen}}$`).test(card.cvv ?? '')) throw new BillerError(400, `El código de seguridad debe tener ${cvvLen} dígitos`);
  const now = new Date();
  const expired = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  const test = TEST_CARDS.find((c) => c.number === number);
  return {
    brand,
    last4: number.slice(-4),
    holder,
    // Tarjeta de prueba → su código; vencida → 54; cualquier otra válida → aprobada
    responseCode: expired ? '54' : (test?.responseCode ?? '00'),
    bank: test?.bank ?? 'Banco emisor',
  };
}

/** Paso 2: el cliente envía los datos de su tarjeta. */
export function pay(id: string, card: CardInput): Promise<GatewayResult> {
  return exclusive(id, async () => {
    requirePending(id);
    if (challenges.has(id)) throw new BillerError(409, 'Complete la verificación de seguridad pendiente');
    const c = validateCard(card);
    if (requires3ds(c.brand)) {
      challenges.set(id, { ...c, otpAttempts: 0 });
      await sleep(900); // consulta al directorio 3DS
      return { status: 'challenge', bank: c.bank, phoneMasked: '09•••••821', brand: c.brand };
    }
    return authorize(id, { ...c, otpAttempts: 0 });
  });
}

/** Paso 3 (opcional): el cliente ingresa el OTP del desafío 3-D Secure. */
export function verify3ds(id: string, otp: string): Promise<GatewayResult> {
  return exclusive(id, async () => {
    requirePending(id);
    const ch = challenges.get(id);
    if (!ch) throw new BillerError(409, 'No hay una verificación pendiente');
    await sleep(700);
    if (String(otp).trim() !== TEST_OTP) {
      ch.otpAttempts += 1;
      if (ch.otpAttempts >= MAX_OTP_ATTEMPTS) {
        challenges.delete(id);
        return decline(id, ch, '05', 'Autenticación 3-D Secure fallida');
      }
      return {
        status: 'challenge',
        bank: ch.bank,
        phoneMasked: '09•••••821',
        brand: ch.brand,
        error: 'Código incorrecto',
        attemptsLeft: MAX_OTP_ATTEMPTS - ch.otpAttempts,
      };
    }
    challenges.delete(id);
    return authorize(id, ch);
  });
}

async function authorize(id: string, c: PendingChallenge): Promise<GatewayResult> {
  const s = requirePending(id);
  await sleep(2200); // autorización con el emisor
  if (c.responseCode !== '00') return decline(id, c, c.responseCode, ISO_RESPONSES[c.responseCode] ?? 'Transacción declinada');

  const authCode = String(Math.floor(100000 + Math.random() * 899999));
  recordCardAuth({
    txId: s.tx_id,
    brand: c.brand,
    last4: c.last4,
    holder: c.holder,
    entry: 'ecommerce',
    amount: s.amount,
    responseCode: '00',
    authCode,
    batch: String(Math.floor(Math.random() * 999)).padStart(6, '0'),
    reference: String(Math.floor(Math.random() * 999999)).padStart(6, '0'),
    status: 'APROBADA',
  });
  const tx = getSummary(s.tx_id)!;
  const billerRef = confirmPayment(tx.billerCode, false);
  markPaid(s.tx_id, { method: 'TARJETA', billerRef, cashIn: 0, changeGiven: 0, creditGenerated: 0 });
  updateSession(id, 'APROBADA');
  onChange?.(`web:pagada ${formatMoney(s.amount)}`);
  return { status: 'approved', redirectUrl: resultUrl(s.tx_id), authCode };
}

function decline(id: string, c: PendingChallenge, code: string, message: string): GatewayResult {
  const s = requirePending(id);
  recordCardAuth({
    txId: s.tx_id,
    brand: c.brand,
    last4: c.last4,
    holder: c.holder,
    entry: 'ecommerce',
    amount: s.amount,
    responseCode: code,
    authCode: null,
    batch: null,
    reference: null,
    status: 'DECLINADA',
  });
  const attempts = s.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    updateSession(id, 'RECHAZADA', attempts);
    setStatus(s.tx_id, 'FALLIDA', `Botón de pagos: ${MAX_ATTEMPTS} intentos rechazados (último código ${code})`);
    onChange?.('web:rechazada');
    return { status: 'failed', code, message, redirectUrl: resultUrl(s.tx_id) };
  }
  updateSession(id, 'PENDIENTE', attempts);
  return { status: 'declined', code, message, attemptsLeft: MAX_ATTEMPTS - attempts };
}

/** El cliente abandona la pasarela y vuelve al comercio. */
export function cancel(id: string) {
  if (inFlight.has(id)) throw new BillerError(409, 'Su pago se está procesando, espere por favor');
  const s = requirePending(id);
  challenges.delete(id);
  updateSession(id, 'CANCELADA');
  setStatus(s.tx_id, 'CANCELADA', 'Cancelada por el usuario en el botón de pagos');
  onChange?.('web:cancelada');
  return { redirectUrl: resultUrl(s.tx_id) };
}

/** Notificación al panel administrador (se conecta desde index.ts). */
let onChange: ((reason: string) => void) | null = null;
export function onGatewayChange(fn: (reason: string) => void) {
  onChange = fn;
}
