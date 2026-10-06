/**
 * TotemController = "DeviceHub" de un tótem.
 *
 * Emula los drivers de hardware (monedero ccTalk, validador de billetes con escrow,
 * hopper/reciclador de vuelto, PIN pad EMV, impresora térmica y lector de códigos)
 * y orquesta las sesiones de cobro. La UI del tótem sólo envía comandos de alto
 * nivel y escucha eventos, igual que lo haría con hardware real; las "acciones
 * físicas" llegan desde el simulador o desde el marco interactivo.
 */
import type { Server } from 'socket.io';
import {
  DEFAULT_FAULTS,
  ISO_RESPONSES,
  TEST_PIN,
  denominationLabel,
  findTestCard,
  formatMoney,
  type CardEntry,
  type CardTerminalState,
  type CashItem,
  type ClientToServerEvents,
  type DeviceLogEntry,
  type DeviceStatus,
  type Faults,
  type ServerToClientEvents,
  type TestCard,
  type TransactionSummary,
  type TxFinished,
  type TxStep,
} from '@totem/shared';
import { BillerError, confirmPayment } from '../billers';
import { nowIso, run } from '../db';
import { canGiveChange, planChange, storeItem, takeItem, type StoredItem } from '../inventory';
import { getSettings } from '../settings';
import {
  getReceiptText,
  getSummary,
  getTotem,
  markPaid,
  recordCardAuth,
  recordCashMovement,
  reverseCardAuth,
  setMethod,
  setStatus,
} from '../transactions';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

interface CashSession {
  kind: 'cash';
  txId: string;
  total: number;
  inserted: number;
  items: StoredItem[];
  accepting: boolean;
}

interface CardSession {
  kind: 'card';
  txId: string;
  total: number;
  card: TestCard | null;
  entry: CardEntry | null;
  pin: string;
  pinAttempts: number;
}

type Session = CashSession | CardSession;

const IDLE_LCD: [string, string] = ['BIENVENIDO', 'RECAUDAFACIL'];

export class TotemController {
  status: DeviceStatus;
  private session: Session | null = null;
  private coinQueue: Promise<void> = Promise.resolve();
  private jammedBill: number | null = null;
  private kioskSockets = new Set<string>();
  private cardRemovalWaiter: (() => void) | null = null;

  constructor(
    private io: IO,
    public readonly totemId: string,
  ) {
    const totem = getTotem(totemId);
    this.status = {
      totemId,
      kioskConnected: false,
      coinAcceptor: { enabled: false, busy: false },
      billValidator: { state: 'disabled', current: null },
      cardTerminal: { state: 'idle', lcd: IDLE_LCD, pinLength: 0, cardInside: false },
      printer: { state: 'idle', paperLevel: totem?.paper_level ?? 100 },
      dispenser: { state: 'idle' },
      tray: [],
      lastReceipt: null,
      faults: { ...DEFAULT_FAULTS },
      fastMode: getSettings().fastMode,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  private get room() {
    return this.io.to(`totem:${this.totemId}`);
  }

  private delay(ms: number) {
    return new Promise<void>((r) => setTimeout(r, this.status.fastMode ? Math.round(ms * 0.3) : ms));
  }

  pushStatus() {
    this.room.emit('device:status', this.status);
    this.io.to('admin').emit('device:status', this.status);
  }

  private notifyAdmin(reason: string) {
    this.io.to('admin').emit('admin:changed', { totemId: this.totemId, reason });
  }

  log(device: string, message: string, level: DeviceLogEntry['level'] = 'info') {
    const entry: DeviceLogEntry = { ts: nowIso(), totemId: this.totemId, device, message, level };
    this.room.emit('device:log', entry);
    this.io.to('admin').emit('device:log', entry);
    run(
      'INSERT INTO events_log(totem_id, device, level, message, created_at) VALUES (?,?,?,?,?)',
      this.totemId, device, level, message, entry.ts,
    );
  }

  private progress(txId: string, step: TxStep, message: string) {
    this.room.emit('tx:progress', { txId, step, message });
  }

  private finish(data: Omit<TxFinished, 'transaction'> & { transaction?: TransactionSummary }) {
    const transaction = data.transaction ?? getSummary(data.txId)!;
    this.room.emit('tx:finished', { ...data, transaction });
    this.notifyAdmin(`tx:${data.outcome}`);
  }

  private orphanTimer: ReturnType<typeof setTimeout> | null = null;

  kioskJoined(socketId: string) {
    if (this.orphanTimer) {
      clearTimeout(this.orphanTimer);
      this.orphanTimer = null;
    }
    // Una pantalla recién iniciada no conoce cobros previos: si quedó uno abierto
    // (la app del tótem se reinició), se cancela y se devuelve lo ingresado.
    if (this.kioskSockets.size === 0 && this.session) this.recoverOrphanSession('reinicio de la aplicación del tótem');
    this.kioskSockets.add(socketId);
    this.status.kioskConnected = true;
    this.pushStatus();
  }

  socketLeft(socketId: string) {
    if (this.kioskSockets.delete(socketId)) {
      this.status.kioskConnected = this.kioskSockets.size > 0;
      this.pushStatus();
      if (this.kioskSockets.size === 0 && this.session) {
        this.orphanTimer = setTimeout(() => this.recoverOrphanSession('pantalla del tótem desconectada'), 30000);
      }
    }
  }

  private recoverOrphanSession(reason: string) {
    this.orphanTimer = null;
    if (!this.session) return;
    this.log('sistema', `Cobro ${this.session.txId} abandonado (${reason}): se cancela`, 'warn');
    void this.resetSession(this.session.txId).catch((e) => this.log('sistema', String(e), 'error'));
  }

  private cashSession(txId?: string): CashSession | null {
    const s = this.session;
    if (!s || s.kind !== 'cash') return null;
    if (txId && s.txId !== txId) return null;
    return s;
  }

  private cardSession(txId?: string): CardSession | null {
    const s = this.session;
    if (!s || s.kind !== 'card') return null;
    if (txId && s.txId !== txId) return null;
    return s;
  }

  private loadPendingTx(txId: string) {
    const tx = getSummary(txId);
    if (!tx || tx.totemId !== this.totemId) throw new BillerError(404, 'Transacción no encontrada');
    if (tx.status !== 'INICIADA') throw new BillerError(409, 'La transacción ya fue procesada');
    if (this.session && this.session.txId !== txId) throw new BillerError(409, 'Hay otro cobro en curso en este tótem');
    return tx;
  }

  /* ------------------------------------------------------------------ */
  /* Efectivo                                                            */
  /* ------------------------------------------------------------------ */

  private emitCash(s: CashSession) {
    this.room.emit('cash:update', {
      txId: s.txId,
      total: s.total,
      inserted: s.inserted,
      remaining: Math.max(s.total - s.inserted, 0),
      items: s.items.map(({ kind, value }) => ({ kind, value })),
      accepting: s.accepting,
      billValidatorAvailable: this.status.billValidator.state !== 'jammed',
      changeAvailable: !this.status.faults.noChange,
    });
  }

  private setAcceptors(enabled: boolean) {
    this.status.coinAcceptor.enabled = enabled;
    if (this.status.billValidator.state !== 'jammed') {
      const busy = ['validating', 'escrow', 'stacking', 'returning'].includes(this.status.billValidator.state);
      if (!busy) this.status.billValidator.state = enabled ? 'idle' : 'disabled';
    }
    this.pushStatus();
  }

  startCash(txId: string) {
    const tx = this.loadPendingTx(txId);
    const settings = getSettings();
    if (tx.total > settings.maxCashTotal) {
      throw new BillerError(400, `El pago en efectivo admite hasta ${formatMoney(settings.maxCashTotal)}`);
    }
    const existing = this.cashSession(txId);
    if (existing) {
      this.emitCash(existing);
      return;
    }
    if (this.session) throw new BillerError(409, 'Hay otro medio de pago en curso');
    const s: CashSession = { kind: 'cash', txId, total: tx.total, inserted: 0, items: [], accepting: true };
    this.session = s;
    setMethod(txId, 'EFECTIVO');
    this.setAcceptors(true);
    this.log('monedero', 'Habilitado (inhibit OFF)');
    this.log('billetero', `Habilitado. Denominaciones: ${settings.acceptedBills.map((v) => `$${v / 100}`).join(', ')}`);
    this.emitCash(s);
  }

  /** Acción física: el cliente introduce una moneda por la ranura. */
  insertCoin(value: number) {
    this.coinQueue = this.coinQueue.then(() => this.processCoin(value)).catch((e) => this.log('monedero', String(e), 'error'));
  }

  private async processCoin(value: number) {
    const item: CashItem = { kind: 'coin', value };
    const s = this.cashSession();
    if (!s || !s.accepting || !this.status.coinAcceptor.enabled) {
      // Con el monedero inhibido la moneda cae directo a la bandeja de devolución.
      this.rejectToTray(item, 'El monedero no está habilitado');
      return;
    }
    this.status.coinAcceptor.busy = true;
    this.pushStatus();
    await this.delay(350);
    this.status.coinAcceptor.busy = false;
    this.pushStatus();

    if (this.status.faults.nextCoin === 'unknown') {
      this.status.faults.nextCoin = 'ok';
      this.pushStatus();
      this.rejectToTray(item, 'Moneda no reconocida, intente con otra');
      return;
    }
    if (!getSettings().acceptedCoins.includes(value)) {
      this.rejectToTray(item, `Moneda de ${denominationLabel(item)} no aceptada`);
      return;
    }
    if (this.session !== s || !s.accepting) {
      this.rejectToTray(item, 'El cobro ya no está activo');
      return;
    }
    if (!this.canAccept(s, value)) {
      this.rejectToTray(item, 'No hay cambio disponible para esa moneda. Ingrese el valor exacto.');
      return;
    }
    this.acceptItem(s, item);
  }

  /** Acción física: el cliente introduce un billete en el validador. */
  insertBill(value: number) {
    const item: CashItem = { kind: 'bill', value };
    const bv = this.status.billValidator;
    const s = this.cashSession();
    if (!s || !s.accepting || bv.state !== 'idle') {
      // El validador no "jala" el billete: el cliente se queda con él.
      const reason =
        bv.state === 'jammed'
          ? 'Billetero fuera de servicio'
          : bv.state === 'disabled' || !s?.accepting
            ? 'El billetero no está habilitado'
            : 'Espere, se está procesando el billete anterior';
      this.room.emit('cash:rejected', { item, reason });
      this.log('billetero', `Billete ${denominationLabel(item)} no ingresado: ${reason}`, 'warn');
      return;
    }
    void this.processBill(s, value).catch((e) => this.log('billetero', String(e), 'error'));
  }

  private async processBill(s: CashSession, value: number) {
    const item: CashItem = { kind: 'bill', value };
    const bv = this.status.billValidator;
    bv.state = 'validating';
    bv.current = value;
    this.pushStatus();
    this.log('billetero', `Billete detectado, validando sensores ópticos/magnéticos...`);
    await this.delay(1600);

    const fault = this.status.faults.nextBill;
    if (fault !== 'ok') {
      this.status.faults.nextBill = 'ok';
      if (fault === 'jam') {
        bv.state = 'jammed';
        this.jammedBill = value;
        this.pushStatus();
        this.log('billetero', 'ATASCO en el transporte de billetes. Requiere intervención técnica.', 'error');
        if (this.session === s) this.emitCash(s);
        this.room.emit('cash:rejected', {
          item,
          reason: 'El billetero presenta una falla. Puede continuar con monedas o cancelar.',
        });
        this.notifyAdmin('jam');
        return;
      }
      await this.returnBill(item, 'Billete no reconocido. Verifique que no esté roto o doblado.');
      return;
    }
    if (!getSettings().acceptedBills.includes(value)) {
      await this.returnBill(item, `Este tótem no acepta billetes de ${denominationLabel(item)}`);
      return;
    }

    bv.state = 'escrow';
    this.pushStatus();
    this.log('billetero', `Billete ${denominationLabel(item)} válido, en escrow`);
    await this.delay(400);

    if (this.session !== s || !s.accepting) {
      await this.returnBill(item, 'Cobro cancelado, billete devuelto');
      return;
    }
    if (!this.canAccept(s, value)) {
      await this.returnBill(item, 'No hay cambio suficiente para este billete. Ingrese un billete de menor denominación.');
      return;
    }
    // Decisión de aceptar tomada: se apila el billete.
    this.acceptItem(s, item, false);
    bv.state = 'stacking';
    this.pushStatus();
    await this.delay(700);
    bv.state = s.accepting ? 'idle' : 'disabled';
    bv.current = null;
    this.pushStatus();
    this.checkComplete(s);
  }

  private async returnBill(item: CashItem, reason: string) {
    const bv = this.status.billValidator;
    bv.state = 'returning';
    this.pushStatus();
    await this.delay(700);
    bv.current = null;
    bv.state = this.cashSession()?.accepting ? 'idle' : 'disabled';
    this.pushStatus();
    this.room.emit('cash:rejected', { item, reason });
    this.log('billetero', `Billete ${denominationLabel(item)} devuelto: ${reason}`, 'warn');
  }

  private rejectToTray(item: CashItem, reason: string) {
    this.status.tray.push(item);
    this.pushStatus();
    this.room.emit('tray:dispense', { items: [item], reason: 'reject' });
    this.room.emit('cash:rejected', { item, reason });
    this.log('monedero', `Moneda ${denominationLabel(item)} rechazada: ${reason}`, 'warn');
  }

  /** ¿Se puede aceptar este valor garantizando el vuelto? (lo hacen los tótems reales antes de apilar) */
  private canAccept(s: CashSession, value: number): boolean {
    const newInserted = s.inserted + value;
    if (newInserted <= s.total) return true;
    if (s.inserted >= s.total) return false;
    return canGiveChange(this.totemId, newInserted - s.total, this.status.faults.noChange);
  }

  private acceptItem(s: CashSession, item: CashItem, checkComplete = true) {
    const location = storeItem(this.totemId, item);
    s.items.push({ ...item, location });
    s.inserted += item.value;
    recordCashMovement(this.totemId, s.txId, 'IN', item.kind, item.value, 1);
    this.log(item.kind === 'coin' ? 'monedero' : 'billetero', `Aceptado ${denominationLabel(item)} → ${location}. Total ingresado ${formatMoney(s.inserted)}`);
    if (s.inserted >= s.total) {
      s.accepting = false;
      this.setAcceptors(false);
      this.log('monedero', 'Monto cubierto: aceptadores inhibidos');
    }
    this.emitCash(s);
    if (checkComplete) this.checkComplete(s);
  }

  private checkComplete(s: CashSession) {
    if (s.inserted >= s.total && this.session === s && !s.accepting && this.status.billValidator.state !== 'stacking') {
      void this.finishCash(s).catch((e) => this.log('sistema', `Error finalizando cobro: ${e}`, 'error'));
    }
  }

  private finishing = new Set<string>();

  private async finishCash(s: CashSession) {
    if (this.finishing.has(s.txId)) return;
    this.finishing.add(s.txId);
    try {
      const tx = getSummary(s.txId)!;
      this.progress(s.txId, 'paying', `Confirmando su pago con ${tx.billerName}...`);
      await this.delay(1800);
      let billerRef: string;
      try {
        billerRef = confirmPayment(tx.billerCode, this.status.faults.billerDown);
        this.log('switch', `Pago confirmado por ${tx.billerCode}. Ref ${billerRef}`);
      } catch (e) {
        this.log('switch', `Empresa sin respuesta: ${(e as Error).message}`, 'error');
        this.progress(s.txId, 'refunding', 'No pudimos confirmar el pago con la empresa. Estamos devolviendo su dinero...');
        await this.refund(s);
        setStatus(s.txId, 'FALLIDA', 'La empresa no confirmó el pago. Dinero devuelto al cliente.', { cashIn: s.inserted });
        this.session = null;
        this.finish({
          txId: s.txId,
          outcome: 'failed',
          message: 'La empresa no confirmó su pago. Retire su dinero de la bandeja. No se realizó ningún cobro.',
          changeDispensed: 0,
          refunded: s.inserted,
          creditGenerated: 0,
          printed: false,
        });
        return;
      }

      const change = s.inserted - s.total;
      let dispensed = 0;
      let credit = 0;
      if (change > 0) {
        this.progress(s.txId, 'dispensing', `Entregando su vuelto de ${formatMoney(change)}...`);
        const r = await this.dispenseChange(s.txId, change);
        dispensed = r.dispensed;
        credit = r.undelivered;
      }
      const summary = markPaid(s.txId, {
        method: 'EFECTIVO',
        billerRef,
        cashIn: s.inserted,
        changeGiven: dispensed,
        creditGenerated: credit,
      });
      this.session = null;
      const printed = await this.print(summary);
      this.finish({
        txId: s.txId,
        outcome: 'paid',
        message: credit > 0
          ? `Pago registrado. El dispensador no pudo entregar ${formatMoney(credit)}; se acreditó como saldo a favor en su cuenta.`
          : 'Su pago fue registrado exitosamente.',
        transaction: summary,
        changeDispensed: dispensed,
        refunded: 0,
        creditGenerated: credit,
        printed,
      });
    } finally {
      this.finishing.delete(s.txId);
    }
  }

  private async dispenseChange(txId: string, amount: number) {
    const items = planChange(this.totemId, amount, this.status.faults.noChange);
    if (!items) {
      this.log('dispensador', `Sin combinación para vuelto de ${formatMoney(amount)}`, 'error');
      return { dispensed: 0, undelivered: amount };
    }
    this.status.dispenser.state = 'dispensing';
    this.pushStatus();
    const jamAt = this.status.faults.dispenserJam ? Math.floor(items.length / 2) : Infinity;
    let dispensed = 0;
    for (let i = 0; i < items.length; i++) {
      if (i >= jamAt) {
        this.status.dispenser.state = 'jammed';
        this.pushStatus();
        this.log('dispensador', 'ATASCO en el hopper durante la entrega de vuelto', 'error');
        this.notifyAdmin('dispenser-jam');
        return { dispensed, undelivered: amount - dispensed };
      }
      const it = items[i];
      await this.delay(it.kind === 'bill' ? 600 : 280);
      takeItem(this.totemId, it);
      recordCashMovement(this.totemId, txId, 'CHANGE', it.kind, it.value, 1);
      dispensed += it.value;
      this.status.tray.push({ kind: it.kind, value: it.value });
      this.room.emit('tray:dispense', { items: [{ kind: it.kind, value: it.value }], reason: 'change' });
      this.pushStatus();
    }
    this.log('dispensador', `Vuelto entregado: ${formatMoney(dispensed)} en ${items.length} unidades`);
    this.status.dispenser.state = 'idle';
    this.pushStatus();
    return { dispensed, undelivered: 0 };
  }

  /** Devuelve exactamente lo que el cliente ingresó. */
  private async refund(s: CashSession) {
    if (s.items.length === 0) return;
    this.status.dispenser.state = 'dispensing';
    this.pushStatus();
    for (const it of s.items) {
      await this.delay(it.kind === 'bill' ? 600 : 250);
      takeItem(this.totemId, it);
      recordCashMovement(this.totemId, s.txId, 'REFUND', it.kind, it.value, 1);
      this.status.tray.push({ kind: it.kind, value: it.value });
      this.room.emit('tray:dispense', { items: [{ kind: it.kind, value: it.value }], reason: 'refund' });
      this.pushStatus();
    }
    this.status.dispenser.state = 'idle';
    this.pushStatus();
    this.log('dispensador', `Devolución de ${formatMoney(s.inserted)} completada`);
  }

  async cancelCash(txId: string) {
    const s = this.cashSession(txId);
    if (!s) return;
    if (!s.accepting) throw new BillerError(409, 'El pago ya se está procesando');
    s.accepting = false;
    this.setAcceptors(false);
    this.log('sistema', `Cobro ${txId} cancelado por el usuario`);
    if (s.inserted > 0) {
      this.progress(txId, 'refunding', `Devolviendo ${formatMoney(s.inserted)}...`);
      await this.refund(s);
    }
    setStatus(txId, 'CANCELADA', s.inserted > 0 ? 'Cancelada por el usuario; dinero devuelto' : 'Cancelada por el usuario', { cashIn: s.inserted });
    this.session = null;
    this.finish({
      txId,
      outcome: 'cancelled',
      message: s.inserted > 0 ? `Operación cancelada. Retire ${formatMoney(s.inserted)} de la bandeja.` : 'Operación cancelada.',
      changeDispensed: 0,
      refunded: s.inserted,
      creditGenerated: 0,
      printed: false,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Tarjeta (PIN pad EMV)                                               */
  /* ------------------------------------------------------------------ */

  private setTerminal(state: CardTerminalState, lcd: [string, string], message: string, s: CardSession | null) {
    const ct = this.status.cardTerminal;
    ct.state = state;
    ct.lcd = lcd;
    ct.pinLength = s?.pin.length ?? 0;
    this.pushStatus();
    if (s) {
      this.room.emit('card:update', {
        txId: s.txId,
        state,
        message,
        pinLength: s.pin.length,
        entry: s.entry,
        brand: s.card?.brand ?? null,
      });
    }
  }

  startCard(txId: string) {
    const tx = this.loadPendingTx(txId);
    const settings = getSettings();
    if (tx.total > settings.maxCardTotal) throw new BillerError(400, 'Monto excede el máximo para pago con tarjeta');
    if (this.cashSession()) throw new BillerError(409, 'Hay un cobro en efectivo en curso');
    if (this.status.cardTerminal.cardInside) throw new BillerError(409, 'Retire la tarjeta del lector');
    const s: CardSession = { kind: 'card', txId, total: tx.total, card: null, entry: null, pin: '', pinAttempts: 0 };
    this.session = s;
    setMethod(txId, 'TARJETA');
    this.log('pinpad', `Venta ${formatMoney(tx.total)} iniciada. Esperando tarjeta`);
    this.setTerminal('waitingCard', [`TOTAL ${formatMoney(tx.total)}`, 'INSERTE/ACERQUE'], 'Inserte, acerque o deslice su tarjeta en el PIN pad', s);
  }

  /** Acción física: el cliente presenta la tarjeta (chip, sin contacto o banda). */
  async presentCard(cardId: string, entry: CardEntry) {
    const s = this.cardSession();
    const card = findTestCard(cardId);
    if (!card) return;
    if (!s || this.status.cardTerminal.state !== 'waitingCard') {
      this.log('pinpad', 'Tarjeta presentada pero el PIN pad no espera una venta', 'warn');
      return;
    }
    if (entry === 'contactless' && !card.contactless) {
      this.setTerminal('waitingCard', ['NO ADMITE', 'SIN CONTACTO'], 'Esta tarjeta no admite pago sin contacto. Insértela en el lector de chip.', s);
      this.log('pinpad', `${card.brand} sin interfaz contactless`, 'warn');
      return;
    }
    s.card = card;
    s.entry = entry;
    this.status.cardTerminal.cardInside = entry === 'chip';
    this.setTerminal('reading', ['LEYENDO TARJETA', entry === 'chip' ? 'NO RETIRE TARJETA' : 'ESPERE...'], 'Leyendo tarjeta...', s);
    this.log('pinpad', `Tarjeta ${card.brand} ****${card.number.slice(-4)} por ${entry.toUpperCase()}`);
    await this.delay(entry === 'contactless' ? 700 : 1300);
    if (this.session !== s) return;

    if (entry === 'swipe') {
      // Regla EMV: si la tarjeta tiene chip, la banda no se acepta (sólo como fallback).
      s.card = null;
      s.entry = null;
      this.setTerminal('waitingCard', ['TARJETA CON CHIP', 'USE LECTOR CHIP'], 'Su tarjeta tiene chip: insértela en el lector de chip.', s);
      this.log('pinpad', 'Banda rechazada: tarjeta con chip (service code 2xx)', 'warn');
      return;
    }
    const cvmLimit = getSettings().contactlessCvmLimit;
    if (entry === 'contactless' && s.total <= cvmLimit) {
      this.log('pinpad', `Monto bajo límite CVM (${formatMoney(cvmLimit)}): sin PIN`);
      await this.authorize(s);
      return;
    }
    this.setTerminal('waitingPin', [`TOTAL ${formatMoney(s.total)}`, 'PIN:'], 'Ingrese su clave (PIN) en el PIN pad y presione la tecla verde', s);
  }

  /** Acción física: tecla del PIN pad. El PIN nunca se envía a la pantalla del tótem. */
  async pinKey(key: string) {
    const s = this.cardSession();
    const ct = this.status.cardTerminal;
    if (!s) return;
    if (key === 'cancel' && ['waitingCard', 'waitingPin'].includes(ct.state)) {
      this.log('pinpad', 'Operación cancelada con la tecla roja');
      await this.endCardSession(s, {
        approved: false,
        code: 'CANCELADA',
        message: 'Operación cancelada en el PIN pad',
      });
      return;
    }
    if (ct.state !== 'waitingPin') return;
    if (/^\d$/.test(key)) {
      if (s.pin.length < 6) s.pin += key;
    } else if (key === 'clear') {
      s.pin = s.pin.slice(0, -1);
    } else if (key === 'enter') {
      if (s.pin.length < 4) {
        this.setTerminal('waitingPin', ['PIN INCOMPLETO', 'PIN:'], 'El PIN debe tener al menos 4 dígitos', s);
        return;
      }
      await this.authorize(s);
      return;
    }
    this.setTerminal('waitingPin', [`TOTAL ${formatMoney(s.total)}`, `PIN: ${'*'.repeat(s.pin.length)}`], 'Ingrese su clave (PIN) en el PIN pad y presione la tecla verde', s);
  }

  private async authorize(s: CardSession) {
    const card = s.card!;
    this.setTerminal('authorizing', ['PROCESANDO...', s.entry === 'chip' ? 'NO RETIRE TARJETA' : 'ESPERE'], 'Procesando su pago con el banco emisor...', s);
    this.log('autorizador', `ISO 8583 MTI 0200 enviado. Monto ${formatMoney(s.total)}`);
    const timeout = this.status.faults.cardTimeout;
    await this.delay(timeout ? 7000 : 3200);
    if (this.session !== s) return;

    let code = card.responseCode;
    if (timeout) code = '91';
    else if (s.pin && s.pin !== TEST_PIN) code = '55';
    this.log('autorizador', `MTI 0210 recibido. Código ${code}: ${ISO_RESPONSES[code] ?? ''}`, code === '00' ? 'info' : 'warn');

    const base = {
      txId: s.txId,
      brand: card.brand,
      last4: card.number.slice(-4),
      holder: card.holder,
      entry: s.entry!,
      amount: s.total,
      responseCode: code,
    };

    if (code === '55') {
      s.pinAttempts += 1;
      recordCardAuth({ ...base, authCode: null, batch: null, reference: null, status: 'DECLINADA' });
      if (s.pinAttempts < 3) {
        s.pin = '';
        this.setTerminal('waitingPin', ['PIN INCORRECTO', 'PIN:'], `PIN incorrecto. Intento ${s.pinAttempts} de 3. Vuelva a ingresar su PIN.`, s);
        return;
      }
    }

    if (code !== '00') {
      if (code !== '55') recordCardAuth({ ...base, authCode: null, batch: null, reference: null, status: 'DECLINADA' });
      await this.endCardSession(s, {
        approved: false,
        code,
        message: ISO_RESPONSES[code] ?? 'Transacción declinada',
        lcd: ['DECLINADA', (ISO_RESPONSES[code] ?? '').toUpperCase().slice(0, 16)],
      });
      return;
    }

    const authCode = String(Math.floor(100000 + Math.random() * 899999));
    const batch = String(Math.floor(Math.random() * 999)).padStart(6, '0');
    const reference = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    recordCardAuth({ ...base, authCode, batch, reference, status: 'APROBADA' });
    this.setTerminal('approved', ['APROBADA', `AUT ${authCode}`], 'Transacción aprobada por el banco', s);
    await this.delay(900);
    if (this.status.cardTerminal.cardInside) await this.waitCardRemoval(s, 'Transacción aprobada. Retire su tarjeta.');
    this.room.emit('card:result', { txId: s.txId, approved: true, code, message: 'Transacción aprobada', canRetry: false });
    await this.finishCard(s);
  }

  private waitCardRemoval(s: CardSession, message: string) {
    this.setTerminal('removeCard', ['RETIRE SU', 'TARJETA'], message, s);
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.removeCard(), 20000); // el lector expulsa la tarjeta tras 20 s
      this.cardRemovalWaiter = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  /** Acción física: el cliente retira la tarjeta del lector de chip. */
  removeCard() {
    if (!this.status.cardTerminal.cardInside) return;
    this.status.cardTerminal.cardInside = false;
    this.log('pinpad', 'Tarjeta retirada');
    this.pushStatus();
    const w = this.cardRemovalWaiter;
    this.cardRemovalWaiter = null;
    w?.();
  }

  private async endCardSession(
    s: CardSession,
    r: { approved: boolean; code: string; message: string; lcd?: [string, string] },
  ) {
    this.setTerminal('declined', r.lcd ?? ['CANCELADA', ''], r.message, s);
    await this.delay(800);
    if (this.status.cardTerminal.cardInside) await this.waitCardRemoval(s, `${r.message}. Retire su tarjeta.`);
    this.room.emit('card:result', { txId: s.txId, approved: false, code: r.code, message: r.message, canRetry: true });
    if (this.session === s) this.session = null;
    this.setTerminal('idle', IDLE_LCD, '', null);
  }

  private async finishCard(s: CardSession) {
    const tx = getSummary(s.txId)!;
    this.progress(s.txId, 'paying', `Confirmando su pago con ${tx.billerName}...`);
    this.setTerminal('idle', IDLE_LCD, '', null);
    await this.delay(1800);
    try {
      const billerRef = confirmPayment(tx.billerCode, this.status.faults.billerDown);
      this.log('switch', `Pago confirmado por ${tx.billerCode}. Ref ${billerRef}`);
      const summary = markPaid(s.txId, { method: 'TARJETA', billerRef, cashIn: 0, changeGiven: 0, creditGenerated: 0 });
      this.session = null;
      const printed = await this.print(summary);
      this.finish({
        txId: s.txId,
        outcome: 'paid',
        message: 'Su pago fue registrado exitosamente.',
        transaction: summary,
        changeDispensed: 0,
        refunded: 0,
        creditGenerated: 0,
        printed,
      });
    } catch (e) {
      this.log('switch', `Empresa sin respuesta: ${(e as Error).message}`, 'error');
      this.progress(s.txId, 'reversing', 'La empresa no confirmó el pago. Reversando el cobro en su tarjeta...');
      await this.delay(2500);
      this.log('autorizador', 'MTI 0400 (reverso) enviado y aprobado');
      reverseCardAuth(s.txId);
      setStatus(s.txId, 'REVERSADA', 'La empresa no confirmó el pago; cobro de tarjeta reversado automáticamente.');
      this.session = null;
      this.finish({
        txId: s.txId,
        outcome: 'reversed',
        message: 'La empresa no confirmó su pago. El cobro en su tarjeta fue reversado; no se debitará ningún valor.',
        changeDispensed: 0,
        refunded: 0,
        creditGenerated: 0,
        printed: false,
      });
    }
  }

  cancelCard(txId: string) {
    const s = this.cardSession(txId);
    if (!s) return;
    if (!['waitingCard', 'waitingPin', 'reading'].includes(this.status.cardTerminal.state)) {
      throw new BillerError(409, 'La transacción con tarjeta ya se está procesando');
    }
    this.session = null;
    this.status.cardTerminal.cardInside = false;
    this.log('pinpad', 'Venta cancelada desde la pantalla');
    this.setTerminal('idle', IDLE_LCD, '', null);
  }

  /* ------------------------------------------------------------------ */
  /* Impresora, scanner, bandeja                                         */
  /* ------------------------------------------------------------------ */

  private async print(summary: TransactionSummary): Promise<boolean> {
    const pr = this.status.printer;
    if (this.status.faults.printerNoPaper || pr.paperLevel <= 0) {
      pr.state = 'paperOut';
      this.pushStatus();
      this.log('impresora', 'Sin papel: comprobante no impreso', 'error');
      this.notifyAdmin('paper');
      return false;
    }
    this.progress(summary.id, 'printing', 'Imprimiendo su comprobante...');
    pr.state = 'printing';
    this.pushStatus();
    await this.delay(2400);
    const text = getReceiptText(summary.id);
    pr.paperLevel = Math.max(0, pr.paperLevel - 2);
    run('UPDATE totems SET paper_level = ? WHERE id = ?', pr.paperLevel, this.totemId);
    pr.state = pr.paperLevel > 0 ? 'idle' : 'paperOut';
    this.status.lastReceipt = { txId: summary.id, text: text ?? '' };
    this.pushStatus();
    this.room.emit('printer:output', { txId: summary.id, text: text ?? '' });
    this.log('impresora', `Comprobante ${summary.receiptNumber} impreso (papel ${pr.paperLevel}%)`);
    return true;
  }

  scan(code: string) {
    this.log('scanner', `Código leído: ${code}`);
    this.room.emit('scanner:read', { code });
  }

  takeTray() {
    if (this.status.tray.length === 0) return;
    this.status.tray = [];
    this.log('bandeja', 'El cliente retiró el dinero de la bandeja');
    this.pushStatus();
  }

  /* ------------------------------------------------------------------ */
  /* Simulación / administración                                         */
  /* ------------------------------------------------------------------ */

  setFaults(f: Partial<Faults>) {
    this.status.faults = { ...this.status.faults, ...f };
    if (f.printerNoPaper === false && this.status.printer.state === 'paperOut' && this.status.printer.paperLevel > 0) {
      this.status.printer.state = 'idle';
    }
    if (f.dispenserJam === false && this.status.dispenser.state === 'jammed') this.status.dispenser.state = 'idle';
    this.log('simulador', `Fallas: ${Object.entries(f).map(([k, v]) => `${k}=${v}`).join(', ')}`, 'warn');
    const cs = this.cashSession();
    if (cs) this.emitCash(cs);
    this.pushStatus();
  }

  setFastMode(enabled: boolean) {
    this.status.fastMode = enabled;
    this.log('simulador', `Modo rápido ${enabled ? 'activado' : 'desactivado'}`);
    this.pushStatus();
  }

  clearJam() {
    if (this.status.billValidator.state !== 'jammed') return;
    const bill = this.jammedBill;
    this.jammedBill = null;
    this.status.billValidator.state = this.cashSession()?.accepting ? 'idle' : 'disabled';
    this.status.billValidator.current = null;
    if (bill) {
      this.status.tray.push({ kind: 'bill', value: bill });
      this.room.emit('tray:dispense', { items: [{ kind: 'bill', value: bill }], reason: 'reject' });
    }
    this.log('billetero', 'Atasco despejado por técnico; billete devuelto a la bandeja');
    const cs = this.cashSession();
    if (cs) this.emitCash(cs);
    this.pushStatus();
  }

  refillPaper() {
    this.status.printer.paperLevel = 100;
    this.status.printer.state = 'idle';
    run('UPDATE totems SET paper_level = 100 WHERE id = ?', this.totemId);
    this.log('impresora', 'Rollo de papel reemplazado');
    this.pushStatus();
  }

  /** El tótem volvió al inicio (timeout o botón Inicio): cancelar lo que esté en curso. */
  async resetSession(txId?: string | null) {
    const s = this.session;
    if (s?.kind === 'cash' && s.accepting) {
      await this.cancelCash(s.txId);
    } else if (s?.kind === 'card' && ['waitingCard', 'waitingPin', 'reading'].includes(this.status.cardTerminal.state)) {
      this.cancelCard(s.txId);
      setStatus(s.txId, 'CANCELADA', 'Abandonada por el usuario');
    } else if (!s && txId) {
      const tx = getSummary(txId);
      if (tx && tx.status === 'INICIADA' && tx.totemId === this.totemId) setStatus(txId, 'CANCELADA', 'Abandonada por el usuario');
    }
  }

  get busy() {
    return this.session !== null;
  }
}
