import { useEffect, useState } from 'react';
import { SERVICE_LABELS, denominationLabel, type ServiceType, type TransactionSummary } from '@totem/shared';
import { api } from '../lib/api';
import { ecDateTime, formatMoney, periodName } from '../lib/format';
import { Card, PageTitle, StatusBadge, btnCls, btnGhostCls, inputCls, useLive } from './AdminApp';

interface Row {
  id: string;
  totemId: string;
  billerName: string;
  service: ServiceType;
  identifier: string;
  holderMasked: string;
  total: number;
  method: string | null;
  status: string;
  receiptNumber: string | null;
  createdAt: string;
}

interface Detail extends TransactionSummary {
  movements: { direction: string; kind: 'coin' | 'bill'; value: number; count: number; createdAt: string }[];
  cardAttempts: { brand: string; last4: string; entry: string; responseCode: string; authCode: string | null; status: string; createdAt: string }[];
  receiptText: string | null;
}

const ecToday = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const DIRECTION: Record<string, string> = { IN: 'Ingreso', CHANGE: 'Vuelto', REFUND: 'Devolución' };

export function Transactions() {
  const { version } = useLive();
  const [filters, setFilters] = useState({ from: ecToday(), to: ecToday(), totem: '', service: '', status: '', method: '', q: '' });
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
    api.get<Row[]>(`/admin/transactions?${qs}`).then(setRows).catch(() => setRows([]));
  }, [filters, version]);

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters({ ...filters, [k]: e.target.value });
  const paidTotal = rows.filter((r) => r.status === 'PAGADA').reduce((a, r) => a + r.total, 0);

  return (
    <>
      <PageTitle title="Transacciones" subtitle={`${rows.length} resultados · ${formatMoney(paidTotal)} pagados`} />
      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" value={filters.from} onChange={set('from')} className={inputCls} />
        <input type="date" value={filters.to} onChange={set('to')} className={inputCls} />
        <select value={filters.totem} onChange={set('totem')} className={inputCls}>
          <option value="">Tótem</option>
          <option>TOT-001</option>
          <option>TOT-002</option>
          <option>TOT-003</option>
        </select>
        <select value={filters.service} onChange={set('service')} className={inputCls}>
          <option value="">Servicio</option>
          {Object.entries(SERVICE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={filters.status} onChange={set('status')} className={inputCls}>
          <option value="">Estado</option>
          {['PAGADA', 'INICIADA', 'CANCELADA', 'FALLIDA', 'REVERSADA'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filters.method} onChange={set('method')} className={inputCls}>
          <option value="">Medio</option>
          <option value="EFECTIVO">Efectivo</option>
          <option value="TARJETA">Tarjeta</option>
        </select>
        <input placeholder="Buscar ID, cuenta, comprobante" value={filters.q} onChange={set('q')} className={`${inputCls} min-w-[220px] flex-1`} />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tótem</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">Cuenta</th>
              <th className="px-3 py-2">Medio</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r.id)} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{ecDateTime(r.createdAt)}</td>
                <td className="px-3 py-2">{r.totemId}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.billerName}</div>
                  <div className="text-[11px] text-slate-400">{SERVICE_LABELS[r.service]}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[12px]">{r.identifier}</td>
                <td className="px-3 py-2">{r.method === 'EFECTIVO' ? '💵 Efectivo' : r.method === 'TARJETA' ? '💳 Tarjeta' : '—'}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(r.total)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">Sin transacciones para los filtros seleccionados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <TxDetail id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function TxDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { version } = useLive();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Detail>(`/admin/transactions/${id}`).then(setD).catch((e) => setError((e as Error).message));
  }, [id, version]);

  const reverse = async () => {
    if (!confirm('¿Reversar este pago? Las planillas volverán a quedar pendientes.')) return;
    setBusy(true);
    try {
      await api.post(`/admin/transactions/${id}/reverse`, { reason: 'Reverso manual solicitado por supervisor' });
      setD(await api.get<Detail>(`/admin/transactions/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-slate-50 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-xs text-slate-500">Transacción</div>
            <h2 className="font-mono text-lg font-bold text-brand-800">{id}</h2>
          </div>
          <button type="button" onClick={onClose} className={btnGhostCls}>Cerrar</button>
        </div>
        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {d && (
          <div className="space-y-3">
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <StatusBadge status={d.status} />
                <span className="text-2xl font-black tabular-nums text-brand-800">{formatMoney(d.total)}</span>
              </div>
              <dl className="grid grid-cols-[130px_1fr] gap-y-1 text-sm">
                <dt className="text-slate-500">Empresa</dt><dd>{d.billerName}</dd>
                <dt className="text-slate-500">Cuenta</dt><dd className="font-mono">{d.identifier} · {d.holderMasked}</dd>
                <dt className="text-slate-500">Tótem</dt><dd>{d.totemId}</dd>
                <dt className="text-slate-500">Creada</dt><dd>{ecDateTime(d.createdAt)}</dd>
                <dt className="text-slate-500">Actualizada</dt><dd>{ecDateTime(d.updatedAt)}</dd>
                <dt className="text-slate-500">Planillas</dt>
                <dd>{d.invoices.map((i) => `${periodName(i.period)} (${formatMoney(i.amount)})`).join(', ') || '—'}</dd>
                <dt className="text-slate-500">Desglose</dt>
                <dd>
                  {formatMoney(d.subtotal)} {d.creditApplied > 0 && `- ${formatMoney(d.creditApplied)} saldo `}+ {formatMoney(d.commission)} comisión + {formatMoney(d.iva)} IVA
                </dd>
                <dt className="text-slate-500">Facturación</dt><dd>{d.billing.name} · {d.billing.id}</dd>
                {d.billerRef && (<><dt className="text-slate-500">Ref. empresa</dt><dd className="font-mono">{d.billerRef}</dd></>)}
                {d.receiptNumber && (<><dt className="text-slate-500">Comprobante</dt><dd className="font-mono">{d.receiptNumber}</dd></>)}
                {d.method === 'EFECTIVO' && (<><dt className="text-slate-500">Efectivo</dt><dd>Recibido {formatMoney(d.cashIn)} · Vuelto {formatMoney(d.changeGiven)}{d.creditGenerated > 0 && ` · Saldo a favor ${formatMoney(d.creditGenerated)}`}</dd></>)}
                {d.message && (<><dt className="text-slate-500">Observación</dt><dd className="text-amber-700">{d.message}</dd></>)}
              </dl>
              {d.status === 'PAGADA' && (
                <button type="button" onClick={reverse} disabled={busy} className="mt-3 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">
                  Reversar pago
                </button>
              )}
            </Card>

            {d.movements.length > 0 && (
              <Card title="Movimientos de efectivo">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {d.movements.map((m, i) => (
                    <span key={i} className={`rounded px-2 py-0.5 ${m.direction === 'IN' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                      {DIRECTION[m.direction] ?? m.direction} {m.count > 1 ? `${m.count}× ` : ''}{denominationLabel(m)} {m.kind === 'coin' ? 'moneda' : 'billete'}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {d.cardAttempts.length > 0 && (
              <Card title="Intentos con tarjeta">
                <table className="w-full text-xs">
                  <tbody>
                    {d.cardAttempts.map((c, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1">{c.brand} ••••{c.last4}</td>
                        <td>{c.entry}</td>
                        <td>Cód. {c.responseCode}</td>
                        <td>{c.authCode ?? '—'}</td>
                        <td className={`font-semibold ${c.status === 'APROBADA' ? 'text-emerald-700' : c.status === 'DECLINADA' ? 'text-red-700' : 'text-amber-700'}`}>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {d.receiptText && (
              <Card title="Comprobante" actions={<a className={btnCls} href={`/api/receipts/${id}.pdf`} target="_blank" rel="noreferrer">PDF</a>}>
                <pre className="overflow-x-auto bg-white font-mono text-[11px] leading-[14px]">{d.receiptText}</pre>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
