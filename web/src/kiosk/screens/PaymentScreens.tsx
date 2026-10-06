import { denominationLabel, type TxStep } from '@totem/shared';
import { formatMoney } from '../../lib/format';
import { CoinArt, BillArt } from '../../devices/CashArt';
import { KButton, Screen, Spinner } from '../components/ui';
import type { ScreenProps } from './types';

export function MethodScreen({ state, actions, config, device }: ScreenProps) {
  const tx = state.tx!;
  const s = config.settings;
  const cashAllowed = tx.total <= s.maxCashTotal;
  const cardAllowed = tx.total <= s.maxCardTotal;
  const noChange = device?.faults.noChange;
  const billJammed = device?.billValidator.state === 'jammed';
  return (
    <Screen
      step={3}
      location={config.totem.name}
      title="¿Cómo desea pagar?"
      subtitle={
        <>
          Total a pagar: <b className="text-[44px] text-brand-800">{formatMoney(tx.total)}</b>
        </>
      }
      footer={
        <KButton variant="danger" onClick={() => actions.reset()} className="flex-1">
          Cancelar
        </KButton>
      }
    >
      <div className="flex h-full flex-col gap-10">
        <button
          type="button"
          disabled={!cashAllowed || state.busy}
          onClick={() => void actions.payCash()}
          className="no-select flex flex-1 flex-col justify-center gap-6 rounded-[44px] bg-white px-14 text-left shadow-xl ring-4 ring-emerald-500 active:scale-[0.98] disabled:opacity-40"
        >
          <div className="flex items-center gap-8">
            <span className="text-[110px]">💵</span>
            <div>
              <div className="text-[70px] font-black text-brand-800">Efectivo</div>
              <div className="text-[34px] text-slate-600">Monedas y billetes · entregamos vuelto</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {s.acceptedCoins.map((v) => (
              <CoinArt key={`c${v}`} value={v} size={62} />
            ))}
            <span className="mx-3 h-[50px] w-[3px] bg-slate-200" />
            {s.acceptedBills.map((v) => (
              <BillArt key={`b${v}`} value={v} width={110} />
            ))}
          </div>
          {!cashAllowed && <div className="text-[30px] font-semibold text-red-600">Pagos en efectivo hasta {formatMoney(s.maxCashTotal)}</div>}
          {cashAllowed && (noChange || billJammed) && (
            <div className="rounded-2xl bg-amber-100 px-6 py-3 text-[30px] font-semibold text-amber-800">
              ⚠ {noChange ? 'Tótem sin vuelto disponible: ingrese el valor exacto.' : 'Billetero fuera de servicio: sólo monedas.'}
            </div>
          )}
        </button>
        <button
          type="button"
          disabled={!cardAllowed || state.busy}
          onClick={() => void actions.payCard()}
          className="no-select flex flex-1 flex-col justify-center gap-6 rounded-[44px] bg-white px-14 text-left shadow-xl ring-4 ring-brand-500 active:scale-[0.98] disabled:opacity-40"
        >
          <div className="flex items-center gap-8">
            <span className="text-[110px]">💳</span>
            <div>
              <div className="text-[70px] font-black text-brand-800">Tarjeta</div>
              <div className="text-[34px] text-slate-600">Crédito o débito · chip, sin contacto · pago corriente</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-[30px] font-black">
            <span className="rounded-xl bg-[#1a1f71] px-5 py-2 italic text-white">VISA</span>
            <span className="rounded-xl bg-slate-900 px-5 py-2 text-white">
              <span className="text-red-500">●</span>
              <span className="-ml-2 text-amber-400">●</span> mastercard
            </span>
            <span className="rounded-xl bg-slate-200 px-5 py-2 text-slate-700">Diners Club</span>
            <span className="rounded-xl bg-sky-600 px-5 py-2 text-white">AMEX</span>
            <span className="rounded-xl bg-orange-500 px-5 py-2 text-white">Discover</span>
          </div>
        </button>
      </div>
    </Screen>
  );
}

export function CashScreen({ state, actions, config, device }: ScreenProps) {
  const tx = state.tx!;
  const cash = state.cash;
  const inserted = cash?.inserted ?? 0;
  const remaining = cash ? cash.remaining : tx.total;
  const accepting = cash?.accepting ?? true;
  const bv = device?.billValidator.state;
  return (
    <Screen
      step={3}
      location={config.totem.name}
      title="Pago en efectivo"
      subtitle="Inserte monedas y billetes en las ranuras del tótem"
      footer={
        <KButton variant="danger" onClick={() => void actions.cancelCash()} disabled={!accepting || state.busy} className="flex-1">
          {inserted > 0 ? `Cancelar y devolver ${formatMoney(inserted)}` : 'Cancelar'}
        </KButton>
      }
    >
      <div className="flex h-full flex-col gap-8">
        <div className="grid grid-cols-2 gap-6">
          <Amount label="Total a pagar" value={tx.total} />
          <Amount label="Ingresado" value={inserted} tone="accent" />
        </div>
        <div className={`rounded-[40px] p-10 text-center text-white shadow-xl transition-colors ${remaining === 0 ? 'bg-emerald-600' : 'bg-brand-800'}`}>
          <div className="text-[38px] text-white/80">{remaining === 0 ? 'Monto completo' : 'Falta por ingresar'}</div>
          <div className="text-[150px] font-black leading-none tracking-tight">{formatMoney(remaining)}</div>
          {remaining === 0 && inserted > tx.total && <div className="mt-3 text-[36px]">Su vuelto: {formatMoney(inserted - tx.total)}</div>}
        </div>

        {accepting ? (
          <div className="flex items-center gap-8 rounded-[32px] bg-white p-8 shadow">
            <div className="flex-1 text-[34px] leading-snug text-slate-700">
              {bv === 'validating' || bv === 'escrow' || bv === 'stacking' ? (
                <b className="text-brand-600">Validando billete, espere por favor...</b>
              ) : (
                <>
                  Las ranuras se iluminan en <b className="text-emerald-600">verde</b> cuando están listas para recibir dinero.
                </>
              )}
            </div>
            <div className="slide-arrow text-[110px] text-emerald-500">➜</div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-6 rounded-[32px] bg-white p-8 text-[38px] font-semibold text-brand-800 shadow">
            <Spinner size={60} /> Procesando su pago...
          </div>
        )}

        {cash && (!cash.billValidatorAvailable || !cash.changeAvailable) && accepting && (
          <div className="rounded-[28px] bg-amber-100 px-8 py-6 text-[32px] font-semibold text-amber-900">
            ⚠ {!cash.billValidatorAvailable ? 'El billetero está fuera de servicio. Puede continuar con monedas o cancelar.' : 'Este tótem no tiene vuelto disponible. Ingrese el valor exacto.'}
          </div>
        )}

        <div className="min-h-0 flex-1 rounded-[32px] bg-white/60 p-6">
          <div className="mb-4 text-[28px] font-semibold text-slate-500">Dinero recibido</div>
          <div className="flex flex-wrap gap-4">
            {cash?.items.map((it, i) =>
              it.kind === 'coin' ? (
                <div key={i} className="drop-in">
                  <CoinArt value={it.value} size={84} />
                </div>
              ) : (
                <div key={i} className="drop-in">
                  <BillArt value={it.value} width={160} />
                </div>
              ),
            )}
            {!cash?.items.length && <div className="text-[30px] text-slate-400">Aún no ha ingresado dinero</div>}
          </div>
          <div className="mt-6 text-[26px] text-slate-500">
            Se aceptan: {config.settings.acceptedCoins.map((v) => denominationLabel({ kind: 'coin', value: v })).join(' · ')} en monedas y{' '}
            {config.settings.acceptedBills.map((v) => `$${v / 100}`).join(' · ')} en billetes
          </div>
        </div>
      </div>
    </Screen>
  );
}

function Amount({ label, value, tone }: { label: string; value: number; tone?: 'accent' }) {
  return (
    <div className="rounded-[32px] bg-white p-8 shadow">
      <div className="text-[30px] text-slate-500">{label}</div>
      <div className={`text-[72px] font-black ${tone ? 'text-accent-500' : 'text-brand-800'}`}>{formatMoney(value)}</div>
    </div>
  );
}

export function CardScreen({ state, actions, config }: ScreenProps) {
  const tx = state.tx!;
  const card = state.card;
  const result = state.cardResult;
  const st = card?.state ?? 'waitingCard';

  if (result && !result.approved) {
    return (
      <Screen step={3} location={config.totem.name}>
        <div className="flex h-full flex-col items-center justify-center gap-10 text-center">
          <div className="grid h-[240px] w-[240px] place-items-center rounded-full bg-red-100 text-[140px] text-red-600">✕</div>
          <div className="text-[64px] font-black text-brand-800">{result.code === 'CANCELADA' ? 'Operación cancelada' : 'Transacción declinada'}</div>
          <div className="max-w-[860px] text-[40px] text-slate-600">{result.message}</div>
          {result.code !== 'CANCELADA' && <div className="text-[28px] text-slate-400">Código de respuesta {result.code}. No se realizó ningún cobro.</div>}
          <div className="mt-8 flex w-full flex-col gap-6">
            <KButton onClick={() => void actions.payCard()} className="w-full">
              Intentar con otra tarjeta
            </KButton>
            <KButton variant="success" onClick={() => void actions.payCash()} className="w-full" disabled={tx.total > config.settings.maxCashTotal}>
              Pagar en efectivo
            </KButton>
            <KButton variant="danger" onClick={() => actions.reset()} className="w-full">
              Cancelar
            </KButton>
          </div>
        </div>
      </Screen>
    );
  }

  const canCancel = st === 'waitingCard' || st === 'waitingPin';
  return (
    <Screen
      step={3}
      location={config.totem.name}
      title="Pago con tarjeta"
      subtitle={
        <>
          Total: <b className="text-brand-800">{formatMoney(tx.total)}</b> · pago corriente
        </>
      }
      footer={
        <KButton variant="danger" onClick={() => void actions.cancelCard()} disabled={!canCancel} className="flex-1">
          Cancelar
        </KButton>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-12 text-center">
        <CardIllustration state={st} />
        <div className="max-w-[900px] text-[56px] font-black leading-tight text-brand-800">{titleFor(st)}</div>
        <div className="max-w-[880px] text-[36px] leading-snug text-slate-600">{card?.message || 'Use el PIN pad ubicado a la derecha de la pantalla'}</div>
        {st === 'waitingPin' && (
          <div className="flex gap-6">
            {Array.from({ length: Math.max(4, card?.pinLength ?? 0) }, (_, i) => (
              <div key={i} className={`h-[54px] w-[54px] rounded-full border-4 border-brand-600 ${i < (card?.pinLength ?? 0) ? 'bg-brand-600' : 'bg-white'}`} />
            ))}
          </div>
        )}
        {st === 'waitingPin' && (
          <div className="rounded-[24px] bg-amber-50 px-8 py-5 text-[28px] text-amber-900">
            🔒 Por su seguridad, cubra el teclado al digitar su PIN. El tótem nunca le pedirá su clave en la pantalla.
          </div>
        )}
      </div>
    </Screen>
  );
}

function titleFor(st: string) {
  switch (st) {
    case 'waitingCard':
      return 'Inserte, acerque o deslice su tarjeta';
    case 'reading':
      return 'Leyendo su tarjeta...';
    case 'waitingPin':
      return 'Ingrese su PIN en el PIN pad';
    case 'authorizing':
      return 'Autorizando con su banco...';
    case 'approved':
      return '¡Transacción aprobada!';
    case 'removeCard':
      return 'Retire su tarjeta';
    default:
      return 'Procesando...';
  }
}

function CardIllustration({ state }: { state: string }) {
  if (state === 'authorizing' || state === 'reading') return <Spinner size={240} />;
  if (state === 'approved') return <div className="grid h-[240px] w-[240px] place-items-center rounded-full bg-emerald-100 text-[140px] text-emerald-600">✓</div>;
  if (state === 'waitingPin')
    return (
      <div className="grid grid-cols-3 gap-3 rounded-[36px] bg-slate-800 p-8 shadow-2xl">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''].map((k, i) => (
          <div key={i} className={`grid h-[70px] w-[90px] place-items-center rounded-xl text-[36px] font-bold ${k ? 'bg-slate-200 text-slate-800' : ''}`}>
            {k}
          </div>
        ))}
      </div>
    );
  return (
    <div className="relative h-[320px] w-[480px]">
      <div className="absolute bottom-0 left-1/2 h-[120px] w-[360px] -translate-x-1/2 rounded-[24px] bg-slate-800 shadow-xl">
        <div className="mx-auto mt-6 h-[14px] w-[260px] rounded-full bg-black" />
      </div>
      <div className={`${state === 'removeCard' ? '' : 'float-card'} absolute left-1/2 top-0 h-[190px] w-[300px] -translate-x-1/2 rounded-[22px] bg-gradient-to-br from-brand-600 to-accent-500 p-6 shadow-2xl`}>
        <div className="h-[46px] w-[64px] rounded-lg bg-amber-300" />
        <div className="mt-8 font-mono text-[26px] text-white/90">•••• 4242</div>
      </div>
    </div>
  );
}

const STEP_LABEL: Record<TxStep, string> = {
  paying: 'Confirmando pago con la empresa',
  dispensing: 'Entregando vuelto',
  printing: 'Imprimiendo comprobante',
  refunding: 'Devolviendo su dinero',
  reversing: 'Reversando cobro de tarjeta',
};

export function ProcessingScreen({ state, config }: ScreenProps) {
  return (
    <Screen step={4} location={config.totem.name} title="Procesando su pago" subtitle="No se retire del tótem">
      <div className="flex h-full flex-col items-center justify-center gap-16">
        <Spinner size={220} />
        <div className="flex w-full max-w-[860px] flex-col gap-6">
          {state.steps.map((s, i) => {
            const done = i < state.steps.length - 1;
            return (
              <div key={s.step} className="fade-up flex items-center gap-8 rounded-[28px] bg-white p-8 shadow">
                <div className={`grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full text-[42px] font-black text-white ${done ? 'bg-emerald-500' : 'bg-brand-600'}`}>
                  {done ? '✓' : i + 1}
                </div>
                <div>
                  <div className="text-[38px] font-bold text-brand-800">{STEP_LABEL[s.step]}</div>
                  <div className="text-[28px] text-slate-500">{s.message}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
