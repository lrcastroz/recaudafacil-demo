import type { BillingIdType } from './identity';
import type { CardBrand, CardEntry } from './cards';
import type { CashItem } from './money';

export type ServiceType = 'LUZ' | 'AGUA' | 'TELEFONO';

export const SERVICE_LABELS: Record<ServiceType, string> = {
  LUZ: 'Luz eléctrica',
  AGUA: 'Agua potable',
  TELEFONO: 'Internet y telefonía',
};

export interface Biller {
  code: string;
  name: string;
  shortName: string;
  service: ServiceType;
  region: string;
  idLabel: string;
  idHint: string;
  idPattern: string;
  color: string;
  active: boolean;
}

export interface InvoiceInfo {
  id: number;
  period: string; // AAAA-MM
  issueDate: string;
  dueDate: string;
  amount: number;
  detail: string;
  overdue: boolean;
}

export interface InquiryResult {
  biller: Biller;
  identifier: string;
  holderMasked: string;
  address: string;
  credit: number;
  invoices: InvoiceInfo[];
}

export interface BillingData {
  type: BillingIdType;
  id: string;
  name: string;
  email: string;
}

export type TxStatus = 'INICIADA' | 'PAGADA' | 'CANCELADA' | 'FALLIDA' | 'REVERSADA';
export type PaymentMethod = 'EFECTIVO' | 'TARJETA';

export interface TransactionSummary {
  id: string;
  totemId: string;
  billerCode: string;
  billerName: string;
  service: ServiceType;
  identifier: string;
  holderMasked: string;
  invoices: { id: number; period: string; amount: number }[];
  subtotal: number;
  creditApplied: number;
  commission: number;
  iva: number;
  total: number;
  method: PaymentMethod | null;
  status: TxStatus;
  billing: BillingData;
  cashIn: number;
  changeGiven: number;
  creditGenerated: number;
  billerRef: string | null;
  receiptNumber: string | null;
  accessKey: string | null;
  card: CardAuthInfo | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardAuthInfo {
  brand: CardBrand;
  last4: string;
  holder: string;
  entry: CardEntry;
  responseCode: string;
  authCode: string | null;
  batch: string | null;
  reference: string | null;
  status: 'APROBADA' | 'DECLINADA' | 'REVERSADA';
}

export interface PublicSettings {
  commission: number;
  ivaRate: number;
  acceptedCoins: number[];
  acceptedBills: number[];
  maxCashTotal: number;
  maxCardTotal: number;
  contactlessCvmLimit: number;
  inactivitySeconds: number;
  fastMode: boolean;
  companyName: string;
  companyRuc: string;
}

export interface TotemInfo {
  id: string;
  name: string;
  city: string;
  location: string;
  establishment: string;
  emissionPoint: string;
}

/* ---------- Estado de dispositivos ---------- */

export type BillValidatorState =
  | 'disabled'
  | 'idle'
  | 'validating'
  | 'escrow'
  | 'stacking'
  | 'returning'
  | 'jammed';

export type CardTerminalState =
  | 'idle'
  | 'waitingCard'
  | 'reading'
  | 'waitingPin'
  | 'authorizing'
  | 'removeCard'
  | 'approved'
  | 'declined';

export interface Faults {
  /** La empresa de servicios no responde al confirmar el pago */
  billerDown: boolean;
  /** Hopper y reciclador sin monedas/billetes para vuelto */
  noChange: boolean;
  printerNoPaper: boolean;
  /** El dispensador se atasca a mitad de entregar el vuelto */
  dispenserJam: boolean;
  /** El autorizador de tarjetas no responde (timeout) */
  cardTimeout: boolean;
  /** Resultado forzado del próximo billete ingresado */
  nextBill: 'ok' | 'fake' | 'jam';
  /** Resultado forzado de la próxima moneda ingresada */
  nextCoin: 'ok' | 'unknown';
}

export const DEFAULT_FAULTS: Faults = {
  billerDown: false,
  noChange: false,
  printerNoPaper: false,
  dispenserJam: false,
  cardTimeout: false,
  nextBill: 'ok',
  nextCoin: 'ok',
};

export interface DeviceStatus {
  totemId: string;
  kioskConnected: boolean;
  coinAcceptor: { enabled: boolean; busy: boolean };
  billValidator: { state: BillValidatorState; current: number | null };
  cardTerminal: {
    state: CardTerminalState;
    lcd: [string, string];
    pinLength: number;
    cardInside: boolean;
  };
  printer: { state: 'idle' | 'printing' | 'paperOut'; paperLevel: number };
  dispenser: { state: 'idle' | 'dispensing' | 'jammed' };
  /** Monedas/billetes en la bandeja de devolución esperando que el usuario los retire */
  tray: CashItem[];
  /** Última salida de la impresora (texto del ticket) */
  lastReceipt: { txId: string; text: string } | null;
  faults: Faults;
  fastMode: boolean;
}

export interface InventoryRow {
  kind: 'coin' | 'bill';
  value: number;
  location: 'hopper' | 'recycler' | 'cashbox';
  count: number;
  capacity: number;
}
