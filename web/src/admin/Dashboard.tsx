import { useEffect, useState } from 'react';
import { SERVICE_LABELS, type ServiceType } from '@totem/shared';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { BarList, ColumnChart } from './charts';
import { Card, PageTitle, StatusBadge, inputCls, useLive } from './AdminApp';

interface DashboardData {
  day: string;
  today: { total: number; count: number; commission: number; cash: number; card: number };
  statusCounts: { status: string; n: number }[];
  byService: { service: ServiceType; total: number; count: number }[];
  byBiller: { code: string; name: string; total: number; count: number }[];
  byHour: { hour: string; total: number; count: number }[];
  last7: { day: string; total: number; count: number }[];
  byTotem: { totem_id: string; total: number; count: number }[];
}

const ecToday = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function Dashboard() {
  const { version } = useLive();
  const [day, setDay] = useState(ecToday());
  const [totem, setTotem] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>(`/admin/dashboard?date=${day}${totem ? `&totem=${totem}` : ''}`)
      .then(setData)
      .catch(() => setData(null));
  }, [day, totem, version]);

  const t = data?.today;
  const hours = Array.from({ length: 15 }, (_, i) => String(i + 7).padStart(2, '0'));
  const byHour = hours.map((h) => {
    const r = data?.byHour.find((x) => x.hour === h);
    return { label: `${h}h`, value: r?.total ?? 0, count: r?.count ?? 0 };
  });
  const last7 = (data?.last7 ?? []).map((d) => ({
    label: `${DAYS[new Date(d.day + 'T12:00:00').getDay()]} ${d.day.slice(8)}`,
    value: d.total,
    count: d.count,
  }));

  return (
    <>
      <PageTitle title="Recaudación" subtitle="Valores pagados (estado PAGADA) en hora de Ecuador continental">
        <select value={totem} onChange={(e) => setTotem(e.target.value)} className={inputCls}>
          <option value="">Todos los tótems</option>
          <option value="TOT-001">TOT-001 · C.C. Río Tomebamba</option>
          <option value="TOT-002">TOT-002 · Centro Histórico</option>
          <option value="TOT-003">TOT-003 · El Arenal</option>
        </select>
        <input type="date" value={day} max={ecToday()} onChange={(e) => setDay(e.target.value)} className={inputCls} />
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total recaudado" value={t ? formatMoney(t.total) : '—'} />
        <Kpi label="Transacciones pagadas" value={t ? String(t.count) : '—'} />
        <Kpi label="Ticket promedio" value={t && t.count ? formatMoney(Math.round(t.total / t.count)) : '—'} />
        <Kpi label="Comisiones + IVA" value={t ? formatMoney(t.commission) : '—'} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Recaudación por hora" className="lg:col-span-2">
          <ColumnChart data={byHour} emptyText="Sin pagos en la fecha seleccionada" />
        </Card>
        <Card title="Medio de pago">
          <BarList
            data={[
              { label: '💵 Efectivo', value: t?.cash ?? 0 },
              { label: '💳 Tarjeta', value: t?.card ?? 0 },
            ]}
          />
          <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-slate-500">Estados del día</h4>
          <div className="flex flex-wrap gap-2">
            {data?.statusCounts.map((s) => (
              <span key={s.status} className="flex items-center gap-1 text-sm">
                <StatusBadge status={s.status} /> <b className="tabular-nums">{s.n}</b>
              </span>
            ))}
            {!data?.statusCounts.length && <span className="text-sm text-slate-400">Sin transacciones</span>}
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card title="Por servicio">
          <BarList data={(data?.byService ?? []).map((s) => ({ label: SERVICE_LABELS[s.service], value: s.total, count: s.count }))} />
        </Card>
        <Card title="Por empresa">
          <BarList data={(data?.byBiller ?? []).map((b) => ({ label: b.name, value: b.total, count: b.count }))} />
        </Card>
        <Card title="Por tótem">
          <BarList data={(data?.byTotem ?? []).map((b) => ({ label: b.totem_id, value: b.total, count: b.count }))} />
        </Card>
      </div>

      <Card title="Últimos 7 días" className="mt-3">
        <ColumnChart data={last7} height={150} />
      </Card>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-brand-800">{value}</div>
    </div>
  );
}
