import { useEffect, useState } from 'react';
import { denominationLabel, type DeviceStatus, type InventoryRow } from '@totem/shared';
import { api } from '../lib/api';
import { ecDateTime, ecTime, formatMoney } from '../lib/format';
import { LevelBar } from './charts';
import { Card, PageTitle, btnCls, btnGhostCls, inputCls, useLive } from './AdminApp';
import { ClosureReport, type Closure } from './Closures';

interface TotemRow {
  id: string;
  name: string;
  city: string;
  location: string;
  status: DeviceStatus;
  inventory: InventoryRow[];
  today: { total: number; count: number };
  lastClosure: string | null;
}

const BV_STATE: Record<string, string> = {
  disabled: 'Inhibido', idle: 'Listo', validating: 'Validando', escrow: 'Escrow', stacking: 'Apilando', returning: 'Devolviendo', jammed: 'ATASCO',
};
const CT_STATE: Record<string, string> = {
  idle: 'En espera', waitingCard: 'Esperando tarjeta', reading: 'Leyendo', waitingPin: 'Esperando PIN', authorizing: 'Autorizando',
  removeCard: 'Retirar tarjeta', approved: 'Aprobada', declined: 'Declinada',
};

const sumInv =(rows: InventoryRow[]) => rows.reduce((a, r) => a + r.value * r.count, 0);

export function Totems() {
  const { version, devices } = useLive();
  const [rows, setRows] = useState<TotemRow[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [events, setEvents] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<TotemRow[]>('/admin/totems').then(setRows).catch((e) => setError((e as Error).message));
  useEffect(() => {
    void load();
  }, [version]);

  const doClosure = async (id: string) => {
    if (!confirm(`¿Realizar cierre de caja del ${id}? Se retirará el contenido de la caja fuerte.`)) return;
    setError(null);
    try {
      setClosure(await api.post<Closure>(`/admin/totems/${id}/closure`));
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageTitle title="Tótems y efectivo" subtitle="Estado de dispositivos e inventario de efectivo en tiempo real" />
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 xl:grid-cols-3 lg:grid-cols-2">
        {rows.map((t) => {
          const st = devices[t.id] ?? t.status;
          const hopper = t.inventory.filter((i) => i.location === 'hopper');
          const recycler = t.inventory.filter((i) => i.location === 'recycler');
          const cashbox = t.inventory.filter((i) => i.location === 'cashbox' && i.count > 0);
          return (
            <Card
              key={t.id}
              title={
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${st.kioskConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {t.id} · {t.city}
                </span>
              }
              actions={<span className="text-xs text-slate-500">{st.kioskConnected ? 'En línea' : 'Pantalla desconectada'}</span>}
            >
              <div className="mb-3 text-xs text-slate-500">{t.location}</div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Mini label="Recaudado hoy" value={formatMoney(t.today.total)} sub={`${t.today.count} pagos`} />
                <Mini label="Último cierre" value={t.lastClosure ? ecDateTime(t.lastClosure) : 'Sin cierres'} />
              </div>

              <div className="mb-3 grid grid-cols-2 gap-1.5 text-xs">
                <Device name="Monedero" ok={!st.faults.nextCoin || st.faults.nextCoin === 'ok'} text={st.coinAcceptor.enabled ? 'Habilitado' : 'Inhibido'} />
                <Device name="Billetero" ok={st.billValidator.state !== 'jammed'} text={BV_STATE[st.billValidator.state] ?? st.billValidator.state} />
                <Device name="Impresora" ok={st.printer.state !== 'paperOut' && !st.faults.printerNoPaper} text={st.printer.state === 'paperOut' || st.faults.printerNoPaper ? 'Sin papel' : `Papel ${st.printer.paperLevel}%`} />
                <Device name="Dispensador" ok={st.dispenser.state !== 'jammed' && !st.faults.noChange} text={st.dispenser.state === 'jammed' ? 'ATASCO' : st.faults.noChange ? 'Sin vuelto' : 'Operativo'} />
                <Device name="PIN pad" ok={!st.faults.cardTimeout} text={st.faults.cardTimeout ? 'Autorizador sin respuesta' : CT_STATE[st.cardTerminal.state] ?? st.cardTerminal.state} />
                <Device name="Switch empresas" ok={!st.faults.billerDown} text={st.faults.billerDown ? 'Sin respuesta' : 'En línea'} />
              </div>

              <InvTable title={`Hopper de monedas · ${formatMoney(sumInv(hopper))}`} rows={hopper} />
              <InvTable title={`Reciclador de billetes · ${formatMoney(sumInv(recycler))}`} rows={recycler} />
              <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs">
                <div className="mb-1 font-semibold text-slate-600">Caja fuerte · {formatMoney(sumInv(cashbox))}</div>
                <div className="text-slate-500">
                  {cashbox.length ? cashbox.map((r) => `${r.count}× ${denominationLabel(r)}`).join(' · ') : 'Vacía'}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btnGhostCls} onClick={() => setLoading(t.id)}>Cargar cambio</button>
                <button type="button" className={btnGhostCls} onClick={() => void api.post(`/admin/totems/${t.id}/paper`).then(load)}>Reponer papel</button>
                <button type="button" className={btnGhostCls} onClick={() => setEvents(t.id)}>Eventos</button>
                <button type="button" className={btnCls} onClick={() => void doClosure(t.id)}>Cierre de caja</button>
              </div>
            </Card>
          );
        })}
      </div>

      {loading && (
        <LoadChangeModal
          totem={rows.find((r) => r.id === loading)!}
          onClose={() => setLoading(null)}
          onDone={() => {
            setLoading(null);
            void load();
          }}
        />
      )}
      {closure && <ClosureReport closure={closure} onClose={() => setClosure(null)} />}
      {events && <EventsModal totemId={events} onClose={() => setEvents(null)} />}
    </>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-bold tabular-nums text-brand-800">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Device({ name, ok, text }: { name: string; ok: boolean; text: string }) {
  return (
    <div className={`flex items-center justify-between rounded-md px-2 py-1 ${ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>
      <span className="font-medium">{ok ? '●' : '▲'} {name}</span>
      <span className="truncate pl-2 text-[11px] opacity-80">{text}</span>
    </div>
  );
}

function InvTable({ title, rows }: { title: string; rows: InventoryRow[] }) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-xs font-semibold text-slate-600">{title}</div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
        {rows.map((r) => (
          <div key={`${r.kind}${r.value}`} title={`${r.count} de ${r.capacity}`}>
            <div className="flex justify-between text-[11px]">
              <span className="font-medium">{denominationLabel(r)}</span>
              <span className={`tabular-nums ${r.count / r.capacity <= 0.15 ? 'font-bold text-red-600' : 'text-slate-500'}`}>{r.count}</span>
            </div>
            <LevelBar value={r.count} capacity={r.capacity} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadChangeModal({ totem, onClose, onDone }: { totem: TotemRow; onClose: () => void; onDone: () => void }) {
  const slots = totem.inventory.filter((i) => i.location !== 'cashbox');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const total = slots.reduce((a, s) => a + (counts[`${s.kind}${s.value}`] ?? 0) * s.value, 0);
  const submit = async () => {
    try {
      await api.post(`/admin/totems/${totem.id}/load`, {
        items: slots.map((s) => ({ kind: s.kind, value: s.value, count: counts[`${s.kind}${s.value}`] ?? 0 })),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title={`Carga de fondo de cambio · ${totem.id}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">Registre las unidades cargadas por la transportadora de valores. Se respeta la capacidad de cada contenedor.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map((s) => {
          const k = `${s.kind}${s.value}`;
          return (
            <label key={k} className="rounded-lg bg-slate-50 p-2 text-xs">
              <span className="font-semibold">{s.kind === 'coin' ? 'Moneda' : 'Billete'} {denominationLabel(s)}</span>
              <span className="block text-slate-400">{s.count}/{s.capacity}</span>
              <input type="number" min={0} max={s.capacity - s.count} value={counts[k] ?? ''} onChange={(e) => setCounts({ ...counts, [k]: Number(e.target.value) })} className={`${inputCls} mt-1 w-full`} />
            </label>
          );
        })}
      </div>
      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm">Total a cargar: <b>{formatMoney(total)}</b></span>
        <button type="button" className={btnCls} onClick={() => void submit()} disabled={total === 0}>Registrar carga</button>
      </div>
    </Modal>
  );
}

function EventsModal({ totemId, onClose }: { totemId: string; onClose: () => void }) {
  const [events, setEvents] = useState<{ device: string; level: string; message: string; createdAt: string }[]>([]);
  useEffect(() => {
    api.get<typeof events>(`/admin/totems/${totemId}/events`).then(setEvents).catch(() => setEvents([]));
  }, [totemId]);
  return (
    <Modal title={`Eventos de dispositivos · ${totemId}`} onClose={onClose}>
      <div className="max-h-[60vh] overflow-y-auto font-mono text-[11px]">
        {events.map((e, i) => (
          <div key={i} className={`border-b border-slate-100 py-1 ${e.level === 'error' ? 'text-red-700' : e.level === 'warn' ? 'text-amber-700' : 'text-slate-700'}`}>
            <span className="text-slate-400">{ecTime(e.createdAt)}</span> <b>[{e.device}]</b> {e.message}
          </div>
        ))}
        {events.length === 0 && <div className="py-6 text-center text-slate-400">Sin eventos registrados</div>}
      </div>
    </Modal>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-800">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
