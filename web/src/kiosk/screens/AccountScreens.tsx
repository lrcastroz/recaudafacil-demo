import { useState } from 'react';
import { computeTotals, validateCedula, validateRuc, type BillingData } from '@totem/shared';
import { formatMoney, periodName, shortDate } from '../../lib/format';
import { sounds } from '../../lib/sounds';
import { KButton, NumericKeypad, SERVICE_STYLE, Screen, ServiceIcon, Spinner, TextKeyboard } from '../components/ui';
import type { ScreenProps } from './types';

export function AccountScreen({ state, actions, config }: ScreenProps) {
  const b = state.biller!;
  // Longitud a partir del patrón: "^0[2-7]\d{7}$" -> "0" + "x" + 7 dígitos = 9
  const maxLen = b.idPattern
    .replace(/\\d\{(\d+)\}/g, (_, n: string) => 'x'.repeat(Number(n)))
    .replace(/\[[^\]]*\]/g, 'x')
    .replace(/[\^$]/g, '').length;
  return (
    <Screen
      step={1}
      location={config.totem.name}
      title={b.idLabel}
      subtitle={
        <>
          <b style={{ color: b.color }}>{b.shortName}</b> · {b.idHint}
        </>
      }
      footer={
        <>
          <KButton
            variant="secondary"
            onClick={() => actions.go(config.billers.filter((x) => x.service === b.service).length > 1 ? 'biller' : 'service')}
            className="flex-1"
          >
            ‹ Atrás
          </KButton>
          <KButton variant="success" onClick={actions.consult} disabled={state.identifier.length < 6} className="flex-[1.6]">
            Consultar deuda
          </KButton>
        </>
      }
    >
      <div className="flex h-full flex-col gap-10">
        <div className="flex h-[170px] items-center justify-center rounded-[32px] border-4 border-brand-600 bg-white font-mono text-[92px] font-bold tracking-[0.12em] text-brand-800 shadow-inner">
          {state.identifier || <span className="text-[46px] font-normal tracking-normal text-slate-300">Ingrese el código</span>}
          <span className="ml-1 h-[90px] w-[6px] animate-pulse bg-brand-600" />
        </div>
        <NumericKeypad value={state.identifier} onChange={actions.setIdentifier} maxLength={maxLen} onEnter={actions.consult} />
        <PlanillaHint color={b.color} label={b.idLabel} />
      </div>
    </Screen>
  );
}

/** Ilustración de dónde encontrar el código en la planilla */
function PlanillaHint({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-10 rounded-[32px] bg-white p-8 shadow">
      <div className="relative h-[200px] w-[160px] shrink-0 rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
        <div className="h-[14px] w-[90px] rounded bg-slate-300" />
        <div className="mt-3 rounded-md border-4 px-1 py-1 text-center font-mono text-[16px] font-bold" style={{ borderColor: color, color }}>
          0123456789
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-[8px] rounded bg-slate-200" />
          <div className="h-[8px] w-3/4 rounded bg-slate-200" />
          <div className="h-[8px] rounded bg-slate-200" />
        </div>
        <div className="absolute inset-x-3 bottom-3 flex h-[34px] gap-[3px]">
          {Array.from({ length: 22 }, (_, i) => (
            <div key={i} className="bg-slate-700" style={{ width: (i * 7) % 3 + 1 }} />
          ))}
        </div>
      </div>
      <p className="text-[32px] leading-snug text-slate-600">
        Encuentre el <b className="text-brand-800">{label.toLowerCase()}</b> en la parte superior de su planilla, o acerque el
        <b className="text-brand-800"> código de barras</b> al lector del tótem.
      </p>
    </div>
  );
}

export function InquiringScreen({ state, config }: ScreenProps) {
  return (
    <Screen step={1} location={config.totem.name}>
      <div className="flex h-full flex-col items-center justify-center gap-14 text-center">
        <Spinner size={220} color={state.biller?.color} />
        <div className="text-[56px] font-bold text-brand-800">Consultando valores pendientes</div>
        <div className="text-[38px] text-slate-500">
          {state.biller?.shortName} · {state.identifier}
        </div>
      </div>
    </Screen>
  );
}

export function DebtsScreen({ state, actions, config }: ScreenProps) {
  const inq = state.inquiry!;
  const invoices = inq.invoices;
  const selected = invoices.slice(0, state.selectedCount);
  const sum = selected.reduce((a, i) => a + i.amount, 0);

  // Las planillas se pagan en orden: seleccionar una incluye las anteriores; desmarcarla excluye las posteriores.
  const toggle = (idx: number) => {
    sounds.tap();
    actions.setSelectedCount(idx < state.selectedCount ? idx : idx + 1);
  };

  return (
    <Screen
      step={2}
      location={config.totem.name}
      title={invoices.length ? 'Planillas pendientes' : 'Cuenta al día'}
      subtitle={
        <>
          <span className="font-semibold text-brand-800">{inq.holderMasked}</span> · {inq.biller.shortName} · {inq.identifier}
        </>
      }
      footer={
        <>
          <KButton variant="secondary" onClick={() => actions.go('account')} className="flex-1">
            ‹ Atrás
          </KButton>
          {invoices.length > 0 ? (
            <KButton variant="success" onClick={() => actions.go('summary')} disabled={state.selectedCount === 0} className="flex-[1.6]">
              Pagar {formatMoney(sum)}
            </KButton>
          ) : (
            <KButton onClick={() => actions.reset('service')} className="flex-[1.6]">
              Pagar otro servicio
            </KButton>
          )}
        </>
      }
    >
      {invoices.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
          <div className="grid h-[240px] w-[240px] place-items-center rounded-full bg-emerald-100 text-[140px]">✓</div>
          <p className="max-w-[820px] text-[46px] font-semibold text-slate-700">Su cuenta no registra valores pendientes de pago.</p>
          {inq.credit > 0 && <p className="text-[36px] text-emerald-700">Saldo a favor disponible: {formatMoney(inq.credit)}</p>}
        </div>
      ) : (
        <div className="flex h-full flex-col gap-6">
          <div className="text-[30px] text-slate-500">{inq.address}</div>
          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-2">
            {invoices.map((inv, idx) => {
              const on = idx < state.selectedCount;
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => toggle(idx)}
                  className={`no-select flex items-center gap-8 rounded-[32px] border-4 bg-white p-8 text-left transition ${on ? 'border-accent-500 shadow-lg' : 'border-slate-200 opacity-70'}`}
                >
                  <div className={`grid h-[84px] w-[84px] shrink-0 place-items-center rounded-[20px] text-[56px] font-black text-white ${on ? 'bg-accent-500' : 'bg-slate-300'}`}>
                    {on ? '✓' : ''}
                  </div>
                  <div className="flex-1">
                    <div className="text-[44px] font-bold text-brand-800">{periodName(inv.period)}</div>
                    <div className="text-[27px] text-slate-500">{inv.detail}</div>
                    <div className={`mt-1 text-[27px] font-semibold ${inv.overdue ? 'text-red-600' : 'text-slate-500'}`}>
                      {inv.overdue ? 'VENCIDA · ' : 'Vence '}
                      {shortDate(inv.dueDate)}
                    </div>
                  </div>
                  <div className="text-[50px] font-black text-brand-800">{formatMoney(inv.amount)}</div>
                </button>
              );
            })}
          </div>
          <div className="rounded-[28px] bg-brand-800/5 px-8 py-6 text-[29px] text-slate-600">
            ℹ️ Las planillas se pagan en orden cronológico, comenzando por la más antigua.
            {inq.credit > 0 && (
              <span className="mt-2 block font-semibold text-emerald-700">Tiene un saldo a favor de {formatMoney(inq.credit)} que se aplicará a este pago.</span>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}

export function SummaryScreen({ state, actions, config }: ScreenProps) {
  const inq = state.inquiry!;
  const selected = inq.invoices.slice(0, state.selectedCount);
  const t = computeTotals(
    selected.reduce((a, i) => a + i.amount, 0),
    config.settings.commission,
    config.settings.ivaRate,
    inq.credit,
  );
  const st = SERVICE_STYLE[inq.biller.service];
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between py-5 ${strong ? 'text-[56px] font-black text-brand-800' : 'text-[38px] text-slate-700'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <Screen
      step={2}
      location={config.totem.name}
      title="Resumen de su pago"
      subtitle="Verifique los valores antes de continuar"
      footer={
        <>
          <KButton variant="secondary" onClick={() => actions.go('debts')} className="flex-1">
            ‹ Atrás
          </KButton>
          <KButton variant="success" onClick={() => actions.go('billing')} className="flex-[1.6]">
            Continuar
          </KButton>
        </>
      }
    >
      <div className="rounded-[40px] bg-white p-12 shadow-lg">
        <div className="mb-6 flex items-center gap-8 border-b-2 border-slate-200 pb-8">
          <div className="grid h-[120px] w-[120px] place-items-center rounded-[28px] text-white" style={{ background: st.color }}>
            <ServiceIcon service={inq.biller.service} size={80} />
          </div>
          <div>
            <div className="text-[44px] font-bold text-brand-800">{inq.biller.shortName}</div>
            <div className="text-[30px] text-slate-500">
              {inq.identifier} · {inq.holderMasked}
            </div>
          </div>
        </div>
        {selected.map((i) => (
          <Row key={i.id} label={`Planilla ${periodName(i.period)}`} value={formatMoney(i.amount)} />
        ))}
        <div className="my-3 border-t-2 border-dashed border-slate-200" />
        {t.creditApplied > 0 && <Row label="(-) Saldo a favor" value={`-${formatMoney(t.creditApplied)}`} />}
        <Row label="Comisión de recaudación" value={formatMoney(t.commission)} />
        <Row label={`IVA ${config.settings.ivaRate}% (sobre comisión)`} value={formatMoney(t.iva)} />
        <div className="my-3 border-t-4 border-brand-800" />
        <Row label="Total a pagar" value={formatMoney(t.total)} strong />
      </div>
      <p className="mt-8 px-4 text-[28px] leading-snug text-slate-500">
        La comisión de recaudación genera una factura electrónica autorizada por el SRI. El valor de las planillas es recaudado a nombre de {inq.biller.name}.
      </p>
    </Screen>
  );
}

type Field = 'id' | 'name' | 'email';

export function BillingScreen({ state, actions, config }: ScreenProps) {
  const [mode, setMode] = useState<'choose' | 'form'>('choose');
  const [data, setData] = useState<BillingData>(
    state.billing.type === 'CONSUMIDOR_FINAL' ? { type: 'CEDULA', id: '', name: '', email: '' } : state.billing,
  );
  const [field, setField] = useState<Field>('id');

  const idValid = data.type === 'CEDULA' ? validateCedula(data.id) : validateRuc(data.id);
  const emailValid = !data.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email);
  const canContinue = idValid && data.name.trim().length >= 3 && emailValid;

  if (mode === 'choose') {
    return (
      <Screen
        step={3}
        location={config.totem.name}
        title="Datos de facturación"
        subtitle="¿Cómo desea su factura electrónica por la comisión de recaudación?"
        footer={
          <KButton variant="secondary" onClick={() => actions.go('summary')} className="flex-1">
            ‹ Atrás
          </KButton>
        }
      >
        <div className="flex h-full flex-col gap-10 pt-6">
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              sounds.tap();
              void actions.createTransaction({ type: 'CONSUMIDOR_FINAL', id: '', name: '', email: '' });
            }}
            className="no-select flex flex-1 flex-col justify-center rounded-[44px] bg-brand-600 px-14 text-left text-white shadow-xl active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-[70px] font-black">Consumidor final</span>
            <span className="mt-4 text-[36px] text-white/85">Continuar sin ingresar datos personales</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sounds.tap();
              setMode('form');
            }}
            className="no-select flex flex-1 flex-col justify-center rounded-[44px] border-4 border-brand-600 bg-white px-14 text-left text-brand-800 shadow-xl active:scale-[0.98]"
          >
            <span className="text-[70px] font-black">Con mis datos</span>
            <span className="mt-4 text-[36px] text-slate-600">Factura con cédula o RUC y envío a su correo electrónico</span>
          </button>
        </div>
      </Screen>
    );
  }

  const FieldBox = ({ f, label, value, valid, placeholder }: { f: Field; label: string; value: string; valid: boolean; placeholder: string }) => (
    <button
      type="button"
      onClick={() => setField(f)}
      className={`flex w-full flex-col rounded-[24px] border-4 bg-white px-8 py-4 text-left ${field === f ? 'border-brand-600 shadow-lg' : 'border-slate-200'}`}
    >
      <span className="text-[24px] font-semibold text-slate-500">{label}</span>
      <span className={`min-h-[56px] truncate text-[44px] font-bold ${value ? (valid ? 'text-brand-800' : 'text-red-600') : 'text-slate-300'}`}>
        {value || placeholder}
        {field === f && <span className="ml-1 inline-block h-[44px] w-[4px] animate-pulse bg-brand-600 align-middle" />}
      </span>
    </button>
  );

  return (
    <Screen
      step={3}
      location={config.totem.name}
      title="Datos de facturación"
      footer={
        <>
          <KButton variant="secondary" onClick={() => setMode('choose')} className="flex-1">
            ‹ Atrás
          </KButton>
          <KButton variant="success" disabled={!canContinue || state.busy} onClick={() => void actions.createTransaction(data)} className="flex-[1.6]">
            Continuar
          </KButton>
        </>
      }
    >
      <div className="flex h-full flex-col gap-5">
        <div className="flex gap-4">
          {(['CEDULA', 'RUC'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                sounds.tap();
                setData({ ...data, type: t, id: '' });
                setField('id');
              }}
              className={`h-[84px] flex-1 rounded-[24px] text-[36px] font-bold ${data.type === t ? 'bg-brand-600 text-white' : 'bg-white text-brand-800'}`}
            >
              {t === 'CEDULA' ? 'Cédula' : 'RUC'}
            </button>
          ))}
        </div>
        <FieldBox f="id" label={data.type === 'CEDULA' ? 'Número de cédula (10 dígitos)' : 'Número de RUC (13 dígitos)'} value={data.id} valid={idValid} placeholder="Toque para ingresar" />
        <FieldBox f="name" label="Nombres y apellidos / Razón social" value={data.name} valid={data.name.trim().length >= 3} placeholder="Toque para ingresar" />
        <FieldBox f="email" label="Correo electrónico (opcional)" value={data.email} valid={emailValid} placeholder="para recibir su factura" />
        <div className="mt-auto">
          {field === 'id' ? (
            <div className="mx-auto w-[720px]">
              <NumericKeypad value={data.id} onChange={(id) => setData({ ...data, id })} maxLength={data.type === 'CEDULA' ? 10 : 13} />
            </div>
          ) : field === 'name' ? (
            <TextKeyboard value={data.name} onChange={(name) => setData({ ...data, name })} />
          ) : (
            <TextKeyboard mode="email" value={data.email} onChange={(email) => setData({ ...data, email })} />
          )}
        </div>
      </div>
    </Screen>
  );
}
