/**
 * Máquina de estados del flujo del tótem.
 * Pantallas: atracción → servicio → empresa → cuenta → consulta → planillas → resumen
 * → facturación → medio de pago → efectivo|tarjeta → procesando → resultado.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type {
  Biller,
  BillingData,
  CardResult,
  CardUpdate,
  CashRejected,
  CashUpdate,
  InquiryResult,
  PublicSettings,
  ServiceType,
  TotemInfo,
  TransactionSummary,
  TxFinished,
  TxProgress,
} from '@totem/shared';
import { api, ApiError } from '../lib/api';
import { parsePlanillaBarcode } from '../lib/format';
import { emitAck, type TotemSocket } from '../lib/socket';
import { sounds } from '../lib/sounds';

export interface KioskConfig {
  totem: TotemInfo;
  settings: PublicSettings;
  billers: Biller[];
}

export type Screen =
  | 'attract'
  | 'service'
  | 'biller'
  | 'account'
  | 'inquiring'
  | 'debts'
  | 'summary'
  | 'billing'
  | 'method'
  | 'cash'
  | 'card'
  | 'processing'
  | 'result'
  | 'error';

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'error';
}

export interface KioskState {
  screen: Screen;
  service: ServiceType | null;
  biller: Biller | null;
  identifier: string;
  inquiry: InquiryResult | null;
  selectedCount: number;
  billing: BillingData;
  tx: TransactionSummary | null;
  payment: 'cash' | 'card' | null;
  cash: CashUpdate | null;
  card: CardUpdate | null;
  cardResult: CardResult | null;
  steps: TxProgress[];
  result: TxFinished | null;
  receiptText: string | null;
  notice: Notice | null;
  error: { title: string; message: string; retry: Screen | null } | null;
  busy: boolean;
}

const EMPTY_BILLING: BillingData = { type: 'CONSUMIDOR_FINAL', id: '', name: '', email: '' };

const initial: KioskState = {
  screen: 'attract',
  service: null,
  biller: null,
  identifier: '',
  inquiry: null,
  selectedCount: 0,
  billing: EMPTY_BILLING,
  tx: null,
  payment: null,
  cash: null,
  card: null,
  cardResult: null,
  steps: [],
  result: null,
  receiptText: null,
  notice: null,
  error: null,
  busy: false,
};

type Action =
  | { type: 'RESET'; screen?: Screen }
  | { type: 'GO'; screen: Screen }
  | { type: 'SERVICE'; service: ServiceType }
  | { type: 'BILLER'; biller: Biller; identifier?: string }
  | { type: 'IDENTIFIER'; value: string }
  | { type: 'INQUIRY_OK'; inquiry: InquiryResult }
  | { type: 'ERROR'; title: string; message: string; retry: Screen | null }
  | { type: 'SELECT_COUNT'; n: number }
  | { type: 'BILLING'; billing: BillingData }
  | { type: 'TX_CREATED'; tx: TransactionSummary }
  | { type: 'PAYMENT'; payment: 'cash' | 'card' }
  | { type: 'CASH_UPDATE'; u: CashUpdate }
  | { type: 'CARD_UPDATE'; u: CardUpdate }
  | { type: 'CARD_RESULT'; r: CardResult | null }
  | { type: 'PROGRESS'; p: TxProgress }
  | { type: 'FINISHED'; f: TxFinished }
  | { type: 'PRINTED'; text: string }
  | { type: 'BUSY'; busy: boolean }
  | { type: 'NOTICE'; notice: Omit<Notice, 'id'> | null };

let noticeSeq = 0;

function reducer(s: KioskState, a: Action): KioskState {
  switch (a.type) {
    case 'RESET':
      return { ...initial, screen: a.screen ?? 'attract' };
    case 'GO':
      return { ...s, screen: a.screen, notice: null, busy: false };
    case 'SERVICE':
      return { ...s, service: a.service, biller: null, identifier: '', screen: 'biller', notice: null };
    case 'BILLER':
      return { ...s, biller: a.biller, service: a.biller.service, identifier: a.identifier ?? '', screen: 'account', notice: null };
    case 'IDENTIFIER':
      return { ...s, identifier: a.value };
    case 'INQUIRY_OK':
      return {
        ...s,
        inquiry: a.inquiry,
        selectedCount: a.inquiry.invoices.length,
        screen: 'debts',
        busy: false,
      };
    case 'ERROR':
      return { ...s, error: { title: a.title, message: a.message, retry: a.retry }, screen: 'error', busy: false };
    case 'SELECT_COUNT':
      return { ...s, selectedCount: a.n };
    case 'BILLING':
      return { ...s, billing: a.billing };
    case 'TX_CREATED':
      return { ...s, tx: a.tx, screen: 'method', busy: false, cardResult: null, cash: null, card: null };
    case 'PAYMENT':
      return { ...s, payment: a.payment, screen: a.payment, busy: false, cardResult: null, notice: null };
    case 'CASH_UPDATE':
      return { ...s, cash: a.u };
    case 'CARD_UPDATE':
      return { ...s, card: a.u };
    case 'CARD_RESULT':
      return { ...s, cardResult: a.r, busy: false };
    case 'PROGRESS': {
      const steps = s.steps.filter((x) => x.step !== a.p.step).concat(a.p);
      return { ...s, steps, screen: 'processing' };
    }
    case 'FINISHED':
      return { ...s, result: a.f, tx: a.f.transaction, screen: 'result', busy: false };
    case 'PRINTED':
      return { ...s, receiptText: a.text };
    case 'BUSY':
      return { ...s, busy: a.busy };
    case 'NOTICE':
      return { ...s, notice: a.notice ? { ...a.notice, id: ++noticeSeq } : null };
  }
}

export function useKiosk(socket: TotemSocket, config: KioskConfig | null) {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state);
  ref.current = state;

  const totemId = config?.totem.id;

  const notice = useCallback((text: string, tone: Notice['tone'] = 'warn') => {
    dispatch({ type: 'NOTICE', notice: { text, tone } });
  }, []);

  const consult = useCallback(
    async (biller: Biller, identifier: string) => {
      if (!new RegExp(biller.idPattern).test(identifier)) {
        sounds.error();
        notice(`Verifique el ${biller.idLabel.toLowerCase()}: ${biller.idHint}`);
        return;
      }
      dispatch({ type: 'GO', screen: 'inquiring' });
      try {
        const inquiry = await api.post<InquiryResult>('/inquiry', { totemId, billerCode: biller.code, identifier });
        dispatch({ type: 'INQUIRY_OK', inquiry });
      } catch (e) {
        sounds.error();
        const err = e as ApiError;
        dispatch({
          type: 'ERROR',
          title: err.status === 503 ? 'Servicio no disponible' : err.status === 409 ? 'No es posible recaudar' : 'No encontramos su cuenta',
          message: err.message,
          retry: err.status === 409 ? null : 'account',
        });
      }
    },
    [totemId, notice],
  );

  /* ---------------- Eventos del hardware ---------------- */
  useEffect(() => {
    const mine = (txId: string) => ref.current.tx?.id === txId;
    const onCash = (u: CashUpdate) => {
      if (!mine(u.txId)) return;
      const prev = ref.current.cash;
      if (prev && u.items.length > prev.items.length) {
        const last = u.items[u.items.length - 1];
        if (last.kind === 'coin') sounds.coin();
        else sounds.bill();
      }
      dispatch({ type: 'CASH_UPDATE', u });
    };
    const onRejected = (r: CashRejected) => {
      if (ref.current.screen !== 'cash') return;
      sounds.error();
      notice(r.reason, 'warn');
    };
    const onCard = (u: CardUpdate) => {
      if (!mine(u.txId)) return;
      if (u.state === 'removeCard' || u.state === 'waitingPin') sounds.pinpadBeep();
      dispatch({ type: 'CARD_UPDATE', u });
    };
    const onCardResult = (r: CardResult) => {
      if (!mine(r.txId)) return;
      if (r.approved) {
        sounds.success();
        return;
      }
      sounds.error();
      dispatch({ type: 'CARD_RESULT', r });
    };
    const onProgress = (p: TxProgress) => {
      if (!mine(p.txId)) return;
      if (p.step === 'printing') sounds.printer();
      dispatch({ type: 'PROGRESS', p });
    };
    const onFinished = (f: TxFinished) => {
      if (!mine(f.txId)) return;
      if (f.outcome === 'paid') sounds.success();
      else sounds.error();
      dispatch({ type: 'FINISHED', f });
    };
    const onPrinted = (p: { txId: string; text: string }) => {
      if (mine(p.txId)) dispatch({ type: 'PRINTED', text: p.text });
    };
    const onTray = () => sounds.drop();
    const onScan = ({ code }: { code: string }) => {
      const s = ref.current;
      if (!['attract', 'service', 'biller', 'account'].includes(s.screen)) return;
      const parsed = parsePlanillaBarcode(code);
      const biller = parsed && config?.billers.find((b) => b.code === parsed.billerCode);
      sounds.pinpadBeep();
      if (!parsed || !biller) {
        notice('Código de barras no reconocido. Ingrese el código manualmente.', 'warn');
        return;
      }
      dispatch({ type: 'BILLER', biller, identifier: parsed.identifier });
      void consult(biller, parsed.identifier);
    };
    socket.on('cash:update', onCash);
    socket.on('cash:rejected', onRejected);
    socket.on('card:update', onCard);
    socket.on('card:result', onCardResult);
    socket.on('tx:progress', onProgress);
    socket.on('tx:finished', onFinished);
    socket.on('printer:output', onPrinted);
    socket.on('tray:dispense', onTray);
    socket.on('scanner:read', onScan);
    return () => {
      socket.off('cash:update', onCash);
      socket.off('cash:rejected', onRejected);
      socket.off('card:update', onCard);
      socket.off('card:result', onCardResult);
      socket.off('tx:progress', onProgress);
      socket.off('tx:finished', onFinished);
      socket.off('printer:output', onPrinted);
      socket.off('tray:dispense', onTray);
      socket.off('scanner:read', onScan);
    };
  }, [socket, config, consult, notice]);

  /* ---------------- Acciones del usuario ---------------- */
  const actions = {
    go: (screen: Screen) => dispatch({ type: 'GO', screen }),
    start: () => dispatch({ type: 'GO', screen: 'service' }),
    chooseService: (service: ServiceType) => {
      // Si el servicio tiene una sola empresa (ej. CentroSur para luz), se omite la selección de empresa.
      const billers = config?.billers.filter((b) => b.service === service) ?? [];
      if (billers.length === 1) dispatch({ type: 'BILLER', biller: billers[0] });
      else dispatch({ type: 'SERVICE', service });
    },
    chooseBiller: (biller: Biller) => dispatch({ type: 'BILLER', biller }),
    setIdentifier: (value: string) => dispatch({ type: 'IDENTIFIER', value }),
    consult: () => {
      const s = ref.current;
      if (s.biller) void consult(s.biller, s.identifier);
    },
    setSelectedCount: (n: number) => dispatch({ type: 'SELECT_COUNT', n }),
    setBilling: (billing: BillingData) => dispatch({ type: 'BILLING', billing }),
    dismissNotice: () => dispatch({ type: 'NOTICE', notice: null }),
    notice,

    createTransaction: async (billing: BillingData) => {
      const s = ref.current;
      if (!s.inquiry || !s.biller) return;
      dispatch({ type: 'BILLING', billing });
      dispatch({ type: 'BUSY', busy: true });
      try {
        const tx = await api.post<TransactionSummary>('/transactions', {
          totemId,
          billerCode: s.biller.code,
          identifier: s.identifier,
          invoiceIds: s.inquiry.invoices.slice(0, s.selectedCount).map((i) => i.id),
          billing,
        });
        dispatch({ type: 'TX_CREATED', tx });
      } catch (e) {
        dispatch({ type: 'BUSY', busy: false });
        sounds.error();
        notice((e as Error).message, 'error');
      }
    },

    payCash: async () => {
      const s = ref.current;
      if (!s.tx) return;
      dispatch({ type: 'BUSY', busy: true });
      try {
        await emitAck(socket, 'cash:start', s.tx.id);
        dispatch({ type: 'PAYMENT', payment: 'cash' });
      } catch (e) {
        dispatch({ type: 'BUSY', busy: false });
        sounds.error();
        notice((e as Error).message, 'error');
      }
    },

    payCard: async () => {
      const s = ref.current;
      if (!s.tx) return;
      dispatch({ type: 'BUSY', busy: true });
      try {
        dispatch({ type: 'CARD_RESULT', r: null });
        await emitAck(socket, 'card:start', s.tx.id);
        dispatch({ type: 'PAYMENT', payment: 'card' });
      } catch (e) {
        dispatch({ type: 'BUSY', busy: false });
        sounds.error();
        notice((e as Error).message, 'error');
      }
    },

    cancelCash: async () => {
      const s = ref.current;
      if (!s.tx) return;
      dispatch({ type: 'BUSY', busy: true });
      try {
        await emitAck(socket, 'cash:cancel', s.tx.id);
      } catch (e) {
        dispatch({ type: 'BUSY', busy: false });
        notice((e as Error).message, 'error');
      }
    },

    cancelCard: async () => {
      const s = ref.current;
      if (!s.tx) return;
      try {
        await emitAck(socket, 'card:cancel', s.tx.id);
        dispatch({ type: 'GO', screen: 'method' });
      } catch (e) {
        notice((e as Error).message, 'error');
      }
    },

    /** Volver al inicio: el servidor cancela cobros en curso y devuelve el dinero ingresado. */
    reset: (screen: Screen = 'attract') => {
      const s = ref.current;
      const pending = s.tx && s.screen !== 'result' ? s.tx.id : null;
      socket.emit('session:reset', { txId: pending });
      dispatch({ type: 'RESET', screen });
    },
  };

  return { state, actions };
}

export type KioskActions = ReturnType<typeof useKiosk>['actions'];
