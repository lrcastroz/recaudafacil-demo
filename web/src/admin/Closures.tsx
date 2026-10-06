import { useEffect, useState } from 'react';
import { denominationLabel } from '@totem/shared';
import { api } from '../lib/api';
import { ecDateTime, formatMoney } from '../lib/format';
import { Card, PageTitle, useLive } from './AdminApp';
import { Modal } from './Totems';

export interface Closure {
  id: number;
  totemId: string;
  createdAt: string;
  periodFrom: string;
  cashCollected: number;
  cardCollected: number;
  withdrawn: number;
  txCount: number;
  detail: {
    withdrawn: { kind: 'coin' | 'bill'; value: number; count: number }[];
    byBiller: { name: string; count: number; total: number }[];
  };
}

export function Closures() {
  const { version } = useLive();
  const [rows, setRows] = useState<Closure[]>([]);
  const [open, setOpen] = useState<Closure | null>(null);
  useEffect(() => {
    api.get<Closure[]>('/admin/closures').then(setRows).catch(() => setRows([]));
  }, [version]);
  return (
    <>
      <PageTitle title="Cierres de caja" subtitle="Arqueos realizados desde la sección Tótems y efectivo" />
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2">#</th>
              <th>Tótem</th>
              <th>Fecha</th>
              <th className="text-right">Pagos</th>
              <th className="text-right">Efectivo</th>
              <th className="text-right">Tarjeta</th>
              <th className="text-right">Retirado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => setOpen(c)} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50">
                <td className="py-2">{c.id}</td>
                <td>{c.totemId}</td>
                <td>{ecDateTime(c.createdAt)}</td>
                <td className="text-right tabular-nums">{c.txCount}</td>
                <td className="text-right tabular-nums">{formatMoney(c.cashCollected)}</td>
                <td className="text-right tabular-nums">{formatMoney(c.cardCollected)}</td>
                <td className="text-right font-semibold tabular-nums">{formatMoney(c.withdrawn)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-400">Aún no se han realizado cierres de caja</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {open && <ClosureReport closure={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function ClosureReport({ closure: c, onClose }: { closure: Closure; onClose: () => void }) {
  return (
    <Modal title={`Cierre de caja #${c.id} · ${c.totemId}`} onClose={onClose}>
      <div className="text-sm text-slate-500">
        Período: {c.periodFrom.startsWith('1970') ? 'desde el inicio de operación' : `desde ${ecDateTime(c.periodFrom)}`} hasta {ecDateTime(c.createdAt)}
      </div>
      <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Pagos" value={String(c.txCount)} />
        <Stat label="Efectivo recaudado" value={formatMoney(c.cashCollected)} />
        <Stat label="Tarjeta recaudado" value={formatMoney(c.cardCollected)} />
        <Stat label="Retirado de caja fuerte" value={formatMoney(c.withdrawn)} />
      </div>
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Retiro por denominación</h4>
      <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
        {c.detail.withdrawn.map((w) => (
          <span key={`${w.kind}${w.value}`} className="rounded bg-slate-100 px-2 py-0.5">
            {w.count}× {denominationLabel(w)} {w.kind === 'coin' ? 'moneda' : 'billete'}
          </span>
        ))}
        {c.detail.withdrawn.length === 0 && <span className="text-slate-400">Caja fuerte vacía</span>}
      </div>
      <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Recaudación por empresa</h4>
      <table className="w-full text-sm">
        <tbody>
          {c.detail.byBiller.map((b) => (
            <tr key={b.name} className="border-t border-slate-100">
              <td className="py-1">{b.name}</td>
              <td className="text-right tabular-nums text-slate-500">{b.count}</td>
              <td className="text-right font-semibold tabular-nums">{formatMoney(b.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-slate-400">
        Nota: el efectivo del reciclador y del hopper permanece como fondo de cambio; la diferencia entre lo recaudado en efectivo y lo retirado corresponde a dinero reutilizado como vuelto.
      </p>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="font-bold tabular-nums text-brand-800">{value}</div>
    </div>
  );
}
