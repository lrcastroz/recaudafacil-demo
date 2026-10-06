/**
 * Contrato de eventos Socket.IO.
 * - El tótem (UI) envía comandos de alto nivel (iniciar cobro, cancelar...).
 * - El simulador / marco envía "acciones físicas" (insertar moneda, acercar tarjeta...).
 * - El servidor (DeviceHub) emite eventos de dispositivos como lo harían los drivers reales.
 */
import type { CardEntry } from './cards';
import type { CashItem } from './money';
import type { DeviceStatus, Faults, TransactionSummary } from './types';

export type ClientRole = 'kiosk' | 'simulator' | 'admin';

export type TxStep = 'paying' | 'dispensing' | 'printing' | 'refunding' | 'reversing';

export type TxOutcome = 'paid' | 'cancelled' | 'failed' | 'reversed';

export interface CashUpdate {
  txId: string;
  total: number;
  inserted: number;
  remaining: number;
  items: CashItem[];
  accepting: boolean;
  billValidatorAvailable: boolean;
  changeAvailable: boolean;
}

export interface CashRejected {
  item: CashItem;
  reason: string;
}

export interface CardUpdate {
  txId: string;
  state: DeviceStatus['cardTerminal']['state'];
  message: string;
  pinLength: number;
  entry: CardEntry | null;
  brand: string | null;
}

export interface CardResult {
  txId: string;
  approved: boolean;
  code: string;
  message: string;
  canRetry: boolean;
}

export interface TxProgress {
  txId: string;
  step: TxStep;
  message: string;
}

export interface TxFinished {
  txId: string;
  outcome: TxOutcome;
  message: string;
  transaction: TransactionSummary;
  changeDispensed: number;
  refunded: number;
  creditGenerated: number;
  printed: boolean;
}

export interface DeviceLogEntry {
  ts: string;
  totemId: string;
  device: string;
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface ServerToClientEvents {
  'device:status': (s: DeviceStatus) => void;
  'device:log': (e: DeviceLogEntry) => void;
  'cash:update': (u: CashUpdate) => void;
  'cash:rejected': (r: CashRejected) => void;
  'card:update': (u: CardUpdate) => void;
  'card:result': (r: CardResult) => void;
  'tx:progress': (p: TxProgress) => void;
  'tx:finished': (f: TxFinished) => void;
  'tray:dispense': (p: { items: CashItem[]; reason: 'change' | 'refund' | 'reject' }) => void;
  'printer:output': (p: { txId: string; text: string }) => void;
  'scanner:read': (p: { code: string }) => void;
  'admin:changed': (p: { totemId: string; reason: string }) => void;
}

export type Ack = (res: { ok: boolean; error?: string }) => void;

export interface ClientToServerEvents {
  join: (p: { totemId?: string; role: ClientRole }, ack?: Ack) => void;
  'cash:start': (p: { txId: string }, ack: Ack) => void;
  'cash:cancel': (p: { txId: string }, ack: Ack) => void;
  'card:start': (p: { txId: string }, ack: Ack) => void;
  'card:cancel': (p: { txId: string }, ack: Ack) => void;
  /** El tótem vuelve a la pantalla inicial: cancela cobros en curso y devuelve dinero ingresado */
  'session:reset': (p: { txId?: string | null }) => void;
  'physical:coin': (p: { totemId: string; value: number }) => void;
  'physical:bill': (p: { totemId: string; value: number }) => void;
  'physical:card': (p: { totemId: string; cardId: string; entry: CardEntry }) => void;
  'physical:removeCard': (p: { totemId: string }) => void;
  'physical:pinKey': (p: { totemId: string; key: string }) => void;
  'physical:scan': (p: { totemId: string; code: string }) => void;
  'physical:takeTray': (p: { totemId: string }) => void;
  'sim:faults': (p: { totemId: string; faults: Partial<Faults> }) => void;
  'sim:fastMode': (p: { totemId: string; enabled: boolean }) => void;
  'sim:clearJam': (p: { totemId: string }) => void;
}
