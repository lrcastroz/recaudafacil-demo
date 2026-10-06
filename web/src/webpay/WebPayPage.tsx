/**
 * Portal web del comercio: el cliente consulta y paga sus planillas en línea.
 * Al confirmar, se crea una sesión en el botón de pagos y se redirige a la pasarela.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  computeTotals,
  validateCedula,
  validateRuc,
  type Biller,
  type BillingData,
  type InquiryResult,
  type ServiceType,
} from '@totem/shared';
import { api } from '../lib/api';
import { formatMoney, periodName, shortDate } from '../lib/format';
import { SERVICE_STYLE, ServiceIcon } from '../kiosk/components/ui';
import type { KioskConfig } from '../kiosk/useKiosk';
import type { DemoAccount } from '../devices/Wallet';

type Step = 'service' | 'account' | 'debts' | 'billing';
const STEPS: { key: Step; label: string }[] = [
  { key: 'service', label: 'Servicio' },
  { key: 'account', label: 'Cuenta' },
  { key: 'debts', label: 'Planillas' },
  { key: 'billing', label: 'Datos y pago' },
];

export const WEB_CHANNEL_ID = 'WEB-001';

export function WebShell({ children, subtitle = 'Pagos en línea' }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="min-h-full bg-slate-100 text-slate-800">
      <header className="bg-brand-800 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/pagos" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-500 text-lg font-black">$</span>
            <span className="leading-tight">
              <span className="block font-black">
                Recauda<span className="text-accent-400">Fácil</span>
              </span>
              <span className="block text-[11px] text-white/70">{subtitle}</span>
            </span>
          </Link>
          <Link to="/" className="text-xs text-white/70 hover:text-white">
            Inicio demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-center text-[11px] text-slate-400">
        RECAUDAFACIL S.A. · RUC 1792345678001 · Demo: empresas, cuentas y pagos simulados.
      </footer>
    </div>
  );
}

export function WebPayPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [demo, setDemo] = useState<DemoAccount[]>([]);
  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<ServiceType | null>(null);
  const [biller, setBiller] = useState<Biller | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [inquiry, setInquiry] = useState<InquiryResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [billing, setBilling] = useState<BillingData>({ type: 'CONSUMIDOR_FINAL', id: '', name: '', email: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<KioskConfig>(`/config?totem=${WEB_CHANNEL_ID}`).then(setConfig).catch((e) => setError((e as Error).message));
    api.get<{ accounts: DemoAccount[] }>('/demo-data').then((d) => setDemo(d.accounts)).catch(() => undefined);
  }, []);

  if (!config) return <WebShell>{error ? <Alert>{error}</Alert> : <p className="text-slate-500">Cargando...</p>}</WebShell>;

  const goto = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const consult = async (id = identifier) => {
    if (!biller) return;
    if (!new RegExp(biller.idPattern).test(id)) {
      setError(`Verifique el ${biller.idLabel.toLowerCase()}: ${biller.idHint}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const inq = await api.post<InquiryResult>('/inquiry', { totemId: WEB_CHANNEL_ID, billerCode: biller.code, identifier: id });
      setInquiry(inq);
      setSelected(inq.invoices.length);
      setStep('debts');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const invoices = inquiry?.invoices ?? [];
  const totals = inquiry
    ? computeTotals(
        invoices.slice(0, selected).reduce((a, i) => a + i.amount, 0),
        config.settings.commission,
        config.settings.ivaRate,
        inquiry.credit,
      )
    : null;

  const idOk =
    billing.type === 'CONSUMIDOR_FINAL' || (billing.type === 'CEDULA' ? validateCedula(billing.id) : validateRuc(billing.id));
  const nameOk = billing.type === 'CONSUMIDOR_FINAL' || billing.name.trim().length >= 3;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(billing.email);

  const checkout = async () => {
    if (!inquiry || !biller) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ checkoutUrl: string }>('/web/checkout', {
        billerCode: biller.code,
        identifier: inquiry.identifier,
        invoiceIds: invoices.slice(0, selected).map((i) => i.id),
        billing,
      });
      navigate(r.checkoutUrl); // redirección a la pasarela
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <WebShell>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-brand-800">Pague sus servicios básicos en línea</h1>
        <p className="text-sm text-slate-500">Luz, agua e internet con tarjeta de crédito o débito, a través de un botón de pagos seguro.</p>
      </div>

      <ol className="mb-6 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <div className={`h-1.5 rounded-full ${i <= stepIdx ? 'bg-accent-500' : 'bg-slate-200'}`} />
            <div className={`mt-1 text-[11px] sm:text-xs ${i === stepIdx ? 'font-bold text-brand-800' : 'text-slate-400'}`}>{s.label}</div>
          </li>
        ))}
      </ol>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {step === 'service' && (
            <>
              <h2 className="mb-3 font-bold text-slate-700">¿Qué servicio desea pagar?</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['LUZ', 'AGUA', 'TELEFONO'] as ServiceType[]).map((s) => {
                  const st = SERVICE_STYLE[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setService(s);
                        setBiller(null);
                      }}
                      className={`flex items-center gap-3 rounded-xl bg-gradient-to-br ${st.bg} p-4 text-left text-white shadow transition ${service === s ? 'ring-4 ring-brand-500/40' : 'opacity-90 hover:opacity-100'}`}
                    >
                      <ServiceIcon service={s} size={36} />
                      <span>
                        <span className="block text-lg font-black leading-tight">{st.label}</span>
                        <span className="block text-[11px] text-white/85">{st.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {service && (
                <>
                  <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-600">Seleccione la empresa</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {config.billers
                      .filter((b) => b.service === service)
                      .map((b) => (
                        <button
                          key={b.code}
                          type="button"
                          onClick={() => {
                            setBiller(b);
                            setIdentifier('');
                            goto('account');
                          }}
                          className="flex items-stretch overflow-hidden rounded-xl text-left ring-1 ring-slate-200 hover:ring-brand-500"
                        >
                          <span className="w-2 shrink-0" style={{ background: b.color }} />
                          <span className="p-3">
                            <span className="block font-bold text-brand-800">{b.shortName}</span>
                            <span className="block text-xs text-slate-500">{b.name}</span>
                            <span className="block text-[11px] font-semibold" style={{ color: b.color }}>{b.region}</span>
                          </span>
                        </button>
                      ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === 'account' && biller && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void consult();
              }}
            >
              <h2 className="font-bold text-slate-700">{biller.name}</h2>
              <label className="mt-4 block text-sm font-semibold text-slate-600">{biller.idLabel}</label>
              <input
                inputMode="numeric"
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ''))}
                maxLength={13}
                placeholder={biller.idHint}
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-xl tracking-wider outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">{biller.idHint}</p>
              <TestAccounts
                accounts={demo.filter((a) => a.billerCode === biller.code)}
                onPick={(id) => {
                  setIdentifier(id);
                  void consult(id);
                }}
              />
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => goto('service')} className={btnGhost}>
                  Atrás
                </button>
                <button type="submit" disabled={busy || identifier.length < 6} className={btnPrimary}>
                  {busy ? 'Consultando...' : 'Consultar deuda'}
                </button>
              </div>
            </form>
          )}

          {step === 'debts' && inquiry && (
            <>
              <h2 className="font-bold text-slate-700">{invoices.length ? 'Planillas pendientes' : 'Cuenta al día'}</h2>
              <p className="text-sm text-slate-500">
                {inquiry.holderMasked} · {inquiry.biller.shortName} · {inquiry.identifier}
              </p>
              {invoices.length === 0 ? (
                <p className="my-8 text-center text-slate-600">Su cuenta no registra valores pendientes de pago.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {invoices.map((inv, idx) => {
                    const on = idx < selected;
                    return (
                      <label key={inv.id} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ${on ? 'bg-accent-500/5 ring-accent-500' : 'ring-slate-200'}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setSelected(idx < selected ? idx : idx + 1)}
                          className="h-5 w-5 accent-emerald-600"
                        />
                        <span className="flex-1">
                          <span className="block font-semibold text-brand-800">{periodName(inv.period)}</span>
                          <span className="block text-xs text-slate-500">{inv.detail}</span>
                          <span className={`block text-xs font-semibold ${inv.overdue ? 'text-red-600' : 'text-slate-500'}`}>
                            {inv.overdue ? 'VENCIDA · ' : 'Vence '}
                            {shortDate(inv.dueDate)}
                          </span>
                        </span>
                        <span className="font-black tabular-nums text-brand-800">{formatMoney(inv.amount)}</span>
                      </label>
                    );
                  })}
                  <p className="pt-1 text-xs text-slate-500">Las planillas se pagan en orden cronológico, comenzando por la más antigua.</p>
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => goto('account')} className={btnGhost}>
                  Atrás
                </button>
                <button type="button" disabled={selected === 0} onClick={() => goto('billing')} className={btnPrimary}>
                  Continuar
                </button>
              </div>
            </>
          )}

          {step === 'billing' && totals && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void checkout();
              }}
            >
              <h2 className="font-bold text-slate-700">Datos de facturación</h2>
              <p className="text-xs text-slate-500">La factura electrónica de la comisión y el comprobante se envían a su correo.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['CONSUMIDOR_FINAL', 'CEDULA', 'RUC'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBilling({ ...billing, type: t, id: '', name: '' })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${billing.type === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {t === 'CONSUMIDOR_FINAL' ? 'Consumidor final' : t === 'CEDULA' ? 'Cédula' : 'RUC'}
                  </button>
                ))}
              </div>
              {billing.type !== 'CONSUMIDOR_FINAL' && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label={billing.type === 'CEDULA' ? 'Número de cédula' : 'Número de RUC'} error={billing.id && !idOk ? 'Número inválido' : null}>
                    <input
                      inputMode="numeric"
                      value={billing.id}
                      maxLength={billing.type === 'CEDULA' ? 10 : 13}
                      onChange={(e) => setBilling({ ...billing, id: e.target.value.replace(/\D/g, '') })}
                      className={input}
                    />
                  </Field>
                  <Field label="Nombres / Razón social">
                    <input value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} className={input} />
                  </Field>
                </div>
              )}
              <div className="mt-3">
                <Field label="Correo electrónico" error={billing.email && !emailOk ? 'Correo inválido' : null}>
                  <input type="email" value={billing.email} onChange={(e) => setBilling({ ...billing, email: e.target.value })} placeholder="nombre@correo.com" className={input} />
                </Field>
              </div>
              <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5" />
                Acepto los términos del servicio de recaudación y autorizo el cobro de la comisión indicada.
              </label>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => goto('debts')} className={btnGhost}>
                  Atrás
                </button>
                <button type="submit" disabled={busy || !idOk || !nameOk || !emailOk || !terms} className={`${btnPrimary} flex items-center gap-2`}>
                  🔒 {busy ? 'Redirigiendo al botón de pagos...' : `Pagar ${formatMoney(totals.total)} con tarjeta`}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-slate-400">Será redirigido a la pasarela PagoSeguro. RecaudaFácil no recibe ni almacena los datos de su tarjeta.</p>
            </form>
          )}
        </section>

        <aside className="h-fit rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200">
          <h3 className="mb-3 font-bold text-slate-700">Resumen</h3>
          {!inquiry || !totals ? (
            <p className="text-slate-400">{biller ? biller.name : 'Seleccione un servicio para comenzar.'}</p>
          ) : (
            <dl className="space-y-1.5">
              <Row label="Empresa" value={inquiry.biller.shortName} />
              <Row label="Cuenta" value={inquiry.identifier} />
              <Row label={`Planillas (${selected})`} value={formatMoney(totals.subtotal)} />
              {totals.creditApplied > 0 && <Row label="Saldo a favor" value={`-${formatMoney(totals.creditApplied)}`} />}
              <Row label="Comisión" value={formatMoney(totals.commission)} />
              <Row label={`IVA ${config.settings.ivaRate}%`} value={formatMoney(totals.iva)} />
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-black text-brand-800">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(totals.total)}</span>
              </div>
            </dl>
          )}
          <div className="mt-4 flex flex-wrap gap-1 text-[10px] font-bold text-slate-500">
            {['VISA', 'Mastercard', 'Diners', 'AMEX', 'Discover'].map((b) => (
              <span key={b} className="rounded bg-slate-100 px-1.5 py-0.5">{b}</span>
            ))}
          </div>
        </aside>
      </div>
    </WebShell>
  );
}

function TestAccounts({ accounts, onPick }: { accounts: DemoAccount[]; onPick: (id: string) => void }) {
  if (!accounts.length) return null;
  return (
    <details className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
      <summary className="cursor-pointer font-semibold">Cuentas de prueba (demo)</summary>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {accounts.map((a) => (
          <button key={a.identifier} type="button" onClick={() => onPick(a.identifier)} className="rounded-lg bg-white px-2 py-1 text-left hover:bg-amber-100">
            <span className="font-mono font-bold">{a.identifier}</span> <span className="text-amber-700">· {a.note}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold tabular-nums text-slate-700">{value}</dd>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Alert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'warn' | 'ok' }) {
  const cls = tone === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : tone === 'warn' ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  return <div className={`mb-4 rounded-xl px-4 py-3 text-sm ring-1 ${cls}`}>{children}</div>;
}

const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-brand-500';
export const btnPrimary = 'rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-500 disabled:opacity-40';
export const btnGhost = 'rounded-xl bg-white px-5 py-2.5 font-semibold text-brand-700 ring-1 ring-slate-300 hover:bg-slate-50';
