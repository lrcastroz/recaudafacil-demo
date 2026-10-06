/**
 * Prueba de humo end-to-end contra el servidor en ejecución (npm run dev).
 * Simula al tótem y al "cliente físico" por Socket.IO y valida los escenarios clave.
 *   npx tsx scripts/smoke.ts
 */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, TxFinished } from '@totem/shared';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const TOTEM = 'TOT-003';

type S = Socket<ServerToClientEvents, ClientToServerEvents>;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emitAck(s: S, ev: 'cash:start' | 'cash:cancel' | 'card:start', txId: string) {
  return new Promise<void>((resolve, reject) =>
    s.emit(ev, { txId }, (r) => (r.ok ? resolve() : reject(new Error(r.error)))),
  );
}

function waitFinished(s: S, txId: string) {
  return new Promise<TxFinished>((resolve) => {
    const h = (f: TxFinished) => {
      if (f.txId === txId) {
        s.off('tx:finished', h);
        resolve(f);
      }
    };
    s.on('tx:finished', h);
  });
}

async function newTx(billerCode: string, accountIdx: number) {
  const { accounts } = await api<{ accounts: { billerCode: string; identifier: string; pending: number; note: string }[] }>('/api/demo-data');
  const acc = accounts.filter((a) => a.billerCode === billerCode && a.pending > 0 && !a.note.includes('suspend') && !a.note.includes('no responde'))[accountIdx];
  const inq = await api<{ invoices: { id: number }[] }>('/api/inquiry', { totemId: TOTEM, billerCode, identifier: acc.identifier });
  return api<{ id: string; total: number }>('/api/transactions', {
    totemId: TOTEM,
    billerCode,
    identifier: acc.identifier,
    invoiceIds: [inq.invoices[0].id],
    billing: { type: 'CONSUMIDOR_FINAL', id: '', name: '', email: '' },
  });
}

let failures = 0;
function check(cond: boolean, msg: string) {
  console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`);
  if (!cond) failures++;
}

async function main() {
  const s: S = io(BASE, { transports: ['websocket'] });
  await new Promise<void>((r) => s.on('connect', () => r()));
  await new Promise<void>((r) => s.emit('join', { totemId: TOTEM, role: 'kiosk' }, () => r()));
  s.emit('sim:fastMode', { totemId: TOTEM, enabled: true });
  s.emit('sim:faults', { totemId: TOTEM, faults: { billerDown: false, noChange: false, dispenserJam: false, printerNoPaper: false } });

  console.log('1) Efectivo con billete de $20 y vuelto');
  {
    const tx = await newTx('ETAPA_AGUA', 0);
    const done = waitFinished(s, tx.id);
    await emitAck(s, 'cash:start', tx.id);
    s.emit('physical:bill', { totemId: TOTEM, value: 2000 });
    if (tx.total > 2000) {
      await sleep(1500);
      s.emit('physical:bill', { totemId: TOTEM, value: 2000 });
    }
    const f = await done;
    const paidIn = tx.total > 2000 ? 4000 : 2000;
    check(f.outcome === 'paid', `pagada (${f.transaction.receiptNumber})`);
    check(f.changeDispensed === paidIn - tx.total, `vuelto ${f.changeDispensed} = ${paidIn} - ${tx.total}`);
    check(f.printed, 'comprobante impreso');
    s.emit('physical:takeTray', { totemId: TOTEM });
  }

  console.log('2) Cancelación con devolución de lo ingresado');
  {
    const tx = await newTx('CENTROSUR', 0);
    const done = waitFinished(s, tx.id);
    await emitAck(s, 'cash:start', tx.id);
    s.emit('physical:coin', { totemId: TOTEM, value: 25 });
    s.emit('physical:coin', { totemId: TOTEM, value: 100 });
    await sleep(800);
    await emitAck(s, 'cash:cancel', tx.id);
    const f = await done;
    check(f.outcome === 'cancelled' && f.refunded === 125, `cancelada, devuelto ${f.refunded}`);
  }

  console.log('3) Sin vuelto: billete grande rechazado en escrow');
  {
    s.emit('sim:faults', { totemId: TOTEM, faults: { noChange: true } });
    const tx = await newTx('ETAPA_TEL', 0);
    let remaining = tx.total;
    s.on('cash:update', (u) => (remaining = u.remaining));
    await emitAck(s, 'cash:start', tx.id);
    // Ingresar billetes de $1 hasta que falte menos de $20 (sin generar vuelto)
    while (remaining >= 2000) {
      s.emit('physical:bill', { totemId: TOTEM, value: 100 });
      await sleep(900);
    }
    s.off('cash:update');
    let rejected = '';
    s.once('cash:rejected', (r) => (rejected = r.reason));
    s.emit('physical:bill', { totemId: TOTEM, value: 2000 });
    await sleep(1500);
    check(rejected.includes('cambio'), `billete de $20 con faltante ${remaining} rechazado: "${rejected}"`);
    const done = waitFinished(s, tx.id);
    await emitAck(s, 'cash:cancel', tx.id);
    await done;
    s.emit('sim:faults', { totemId: TOTEM, faults: { noChange: false } });
  }

  console.log('4) Tarjeta chip aprobada con PIN');
  {
    const tx = await newTx('CENTROSUR', 1);
    const done = waitFinished(s, tx.id);
    await emitAck(s, 'card:start', tx.id);
    s.emit('physical:card', { totemId: TOTEM, cardId: 'visa-ok', entry: 'chip' });
    await sleep(600);
    for (const k of ['1', '2', '3', '4', 'enter']) s.emit('physical:pinKey', { totemId: TOTEM, key: k });
    await new Promise<void>((r) => s.on('card:update', (u) => u.state === 'removeCard' && r()));
    s.emit('physical:removeCard', { totemId: TOTEM });
    const f = await done;
    check(f.outcome === 'paid' && f.transaction.card?.authCode != null, `pagada con autorización ${f.transaction.card?.authCode}`);
    s.off('card:update');
  }

  console.log('5) Tarjeta declinada por fondos insuficientes (51) — contactless');
  {
    const tx = await newTx('CENTROSUR', 2);
    await emitAck(s, 'card:start', tx.id);
    const result = new Promise<{ code: string }>((r) => s.once('card:result', r));
    s.emit('physical:card', { totemId: TOTEM, cardId: 'visa-51', entry: 'contactless' });
    await sleep(500);
    for (const k of ['1', '2', '3', '4', 'enter']) s.emit('physical:pinKey', { totemId: TOTEM, key: k });
    const r = await result;
    check(r.code === '51', `declinada con código ${r.code}`);
    s.emit('session:reset', { txId: tx.id });
  }

  console.log('6) Empresa caída tras cobrar con tarjeta → reverso');
  {
    s.emit('sim:faults', { totemId: TOTEM, faults: { billerDown: true } });
    const tx = await newTx('ETAPA_TEL', 1);
    const done = waitFinished(s, tx.id);
    await emitAck(s, 'card:start', tx.id);
    s.emit('physical:card', { totemId: TOTEM, cardId: 'mc-ok', entry: 'contactless' });
    await sleep(500);
    for (const k of ['1', '2', '3', '4', 'enter']) s.emit('physical:pinKey', { totemId: TOTEM, key: k });
    const f = await done;
    check(f.outcome === 'reversed' && f.transaction.status === 'REVERSADA', `estado ${f.transaction.status}`);
    s.emit('sim:faults', { totemId: TOTEM, faults: { billerDown: false } });
  }

  s.emit('sim:fastMode', { totemId: TOTEM, enabled: false });
  await sleep(200);
  s.close();
  console.log(failures ? `\n${failures} verificación(es) fallida(s)` : '\nTodos los escenarios OK');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
