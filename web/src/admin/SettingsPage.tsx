import { useEffect, useState } from 'react';
import { BILL_VALUES, COIN_VALUES, SERVICE_LABELS, denominationLabel, type Biller, type PublicSettings } from '@totem/shared';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { Card, PageTitle, btnCls, inputCls } from './AdminApp';

export function SettingsPage() {
  const [s, setS] = useState<PublicSettings | null>(null);
  const [billers, setBillers] = useState<Biller[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ settings: PublicSettings; billers: Biller[] }>('/admin/settings')
      .then((r) => {
        setS(r.settings);
        setBillers(r.billers);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (!s) return <PageTitle title="Configuración" subtitle={error ?? 'Cargando...'} />;

  const money = (k: keyof PublicSettings) => ({
    value: ((s[k] as number) / 100).toFixed(2),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Math.round(Number(e.target.value) * 100) }),
  });
  const toggle = (k: 'acceptedCoins' | 'acceptedBills', v: number) =>
    setS({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v].sort((a, b) => a - b) });

  const save = async () => {
    setError(null);
    try {
      setS(await api.put<PublicSettings>('/admin/settings', s));
      setSaved('Configuración guardada. El tótem la aplicará al volver a la pantalla de inicio.');
      setTimeout(() => setSaved(null), 4000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleBiller = async (b: Biller) => {
    setBillers(await api.put<Biller[]>(`/admin/billers/${b.code}`, { active: !b.active }));
  };

  const iva = Math.round((s.commission * s.ivaRate) / 100);

  return (
    <>
      <PageTitle title="Configuración" subtitle="Parámetros de recaudación de la red de tótems">
        <button type="button" className={btnCls} onClick={() => void save()}>Guardar cambios</button>
      </PageTitle>
      {saved && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saved}</div>}
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tarifas">
          <Field label="Comisión por transacción (USD)">
            <input type="number" step="0.01" min="0" className={inputCls} {...money('commission')} />
          </Field>
          <Field label="IVA sobre comisión (%)">
            <input type="number" min="0" max="30" className={inputCls} value={s.ivaRate} onChange={(e) => setS({ ...s, ivaRate: Number(e.target.value) })} />
          </Field>
          <p className="text-xs text-slate-500">
            El cliente paga {formatMoney(s.commission)} + {formatMoney(iva)} de IVA = <b>{formatMoney(s.commission + iva)}</b> por transacción.
          </p>
        </Card>

        <Card title="Límites y tiempos">
          <Field label="Máximo en efectivo (USD)">
            <input type="number" step="1" className={inputCls} {...money('maxCashTotal')} />
          </Field>
          <Field label="Máximo con tarjeta (USD)">
            <input type="number" step="1" className={inputCls} {...money('maxCardTotal')} />
          </Field>
          <Field label="Límite contactless sin PIN (USD)">
            <input type="number" step="1" className={inputCls} {...money('contactlessCvmLimit')} />
          </Field>
          <Field label="Inactividad antes de aviso (s)">
            <input type="number" min="15" className={inputCls} value={s.inactivitySeconds} onChange={(e) => setS({ ...s, inactivitySeconds: Number(e.target.value) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.fastMode} onChange={(e) => setS({ ...s, fastMode: e.target.checked })} /> Modo rápido de simulación en todos los tótems
          </label>
        </Card>

        <Card title="Denominaciones aceptadas">
          <div className="mb-2 text-xs font-semibold text-slate-500">Monedas</div>
          <div className="mb-4 flex flex-wrap gap-2">
            {COIN_VALUES.map((v) => (
              <Chip key={v} on={s.acceptedCoins.includes(v)} onClick={() => toggle('acceptedCoins', v)}>{denominationLabel({ kind: 'coin', value: v })}</Chip>
            ))}
          </div>
          <div className="mb-2 text-xs font-semibold text-slate-500">Billetes</div>
          <div className="flex flex-wrap gap-2">
            {BILL_VALUES.map((v) => (
              <Chip key={v} on={s.acceptedBills.includes(v)} onClick={() => toggle('acceptedBills', v)}>${v / 100}</Chip>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Los billetes de $50 y $100 suelen deshabilitarse en tótems desatendidos por riesgo de falsificación y para preservar el vuelto.</p>
        </Card>

        <Card title="Empresas habilitadas">
          <div className="space-y-1">
            {billers.map((b) => (
              <label key={b.code} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="text-sm">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                  {b.shortName} <span className="text-xs text-slate-400">· {SERVICE_LABELS[b.service]}</span>
                </span>
                <input type="checkbox" checked={b.active} onChange={() => void toggleBiller(b)} />
              </label>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-sm font-semibold ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 line-through'}`}>
      {children}
    </button>
  );
}
