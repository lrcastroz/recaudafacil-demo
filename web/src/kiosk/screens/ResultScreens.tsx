import { useEffect, useState } from 'react';
import { formatMoney } from '../../lib/format';
import { KButton, Screen } from '../components/ui';
import type { ScreenProps } from './types';

const AUTO_RETURN_S = 40;

export function ResultScreen({ state, actions, config }: ScreenProps) {
  const r = state.result!;
  const tx = r.transaction;
  const [left, setLeft] = useState(AUTO_RETURN_S);
  useEffect(() => {
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) actions.reset();
  }, [left, actions]);

  const ok = r.outcome === 'paid';
  const icon = ok ? '✓' : r.outcome === 'cancelled' ? '↩' : '!';
  const iconCls = ok ? 'bg-emerald-100 text-emerald-600' : r.outcome === 'cancelled' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-600';
  const title = ok ? '¡Pago exitoso!' : r.outcome === 'cancelled' ? 'Operación cancelada' : r.outcome === 'reversed' ? 'Pago no completado' : 'No pudimos completar su pago';

  return (
    <Screen
      step={ok ? 4 : undefined}
      location={config.totem.name}
      footer={
        <>
          <KButton variant="secondary" onClick={() => actions.reset()} className="flex-1">
            Finalizar ({left})
          </KButton>
          <KButton variant="success" onClick={() => actions.reset('service')} className="flex-[1.4]">
            Realizar otro pago
          </KButton>
        </>
      }
    >
      <div className="flex h-full flex-col items-center gap-10 pt-14 text-center">
        <div className={`fade-up grid h-[260px] w-[260px] place-items-center rounded-full text-[160px] font-black ${iconCls}`}>{icon}</div>
        <div className="text-[76px] font-black text-brand-800">{title}</div>
        <div className="max-w-[900px] text-[38px] leading-snug text-slate-600">{r.message}</div>

        {ok && (
          <div className="w-full rounded-[40px] bg-white p-10 text-left shadow-lg">
            <Line label="Empresa" value={tx.billerName} />
            <Line label="Cuenta" value={`${tx.identifier} · ${tx.holderMasked}`} />
            <Line label="Total pagado" value={formatMoney(tx.total)} strong />
            <Line label="Forma de pago" value={tx.method === 'EFECTIVO' ? `Efectivo (recibido ${formatMoney(tx.cashIn)})` : `Tarjeta ${tx.card?.brand} •••• ${tx.card?.last4}`} />
            {tx.card?.authCode && <Line label="Autorización" value={tx.card.authCode} />}
            <Line label="Comprobante" value={tx.receiptNumber ?? '-'} />
            <Line label="Referencia empresa" value={tx.billerRef ?? '-'} />
          </div>
        )}

        <div className="flex w-full flex-col gap-5">
          {(r.changeDispensed > 0 || r.refunded > 0) && (
            <Callout tone="green" icon="⬇">
              Retire {r.refunded > 0 ? 'su dinero' : 'su vuelto'} de <b>{formatMoney(r.refunded || r.changeDispensed)}</b> de la bandeja inferior
            </Callout>
          )}
          {r.creditGenerated > 0 && (
            <Callout tone="amber" icon="⚠">
              {formatMoney(r.creditGenerated)} quedaron como <b>saldo a favor</b> en su cuenta y se descontarán en su próximo pago
            </Callout>
          )}
          {ok && r.printed && (
            <Callout tone="blue" icon="🧾">
              Retire su comprobante impreso
            </Callout>
          )}
          {ok && !r.printed && (
            <Callout tone="amber" icon="🧾">
              La impresora no tiene papel. Anote su número de comprobante <b>{tx.receiptNumber}</b>
              {tx.billing.email ? <> — su factura se enviará a <b>{tx.billing.email}</b></> : null}
            </Callout>
          )}
        </div>
      </div>
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-8 border-b border-slate-100 py-3 last:border-0">
      <span className="text-[30px] text-slate-500">{label}</span>
      <span className={`text-right ${strong ? 'text-[44px] font-black text-brand-800' : 'text-[32px] font-semibold text-slate-800'}`}>{value}</span>
    </div>
  );
}

function Callout({ tone, icon, children }: { tone: 'green' | 'amber' | 'blue'; icon: string; children: React.ReactNode }) {
  const cls = tone === 'green' ? 'bg-emerald-600 text-white' : tone === 'amber' ? 'bg-amber-100 text-amber-900' : 'bg-brand-600 text-white';
  return (
    <div className={`fade-up flex items-center gap-6 rounded-[28px] px-10 py-7 text-left text-[36px] ${cls}`}>
      <span className="text-[56px]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

export function ErrorScreen({ state, actions, config }: ScreenProps) {
  const e = state.error!;
  return (
    <Screen
      location={config.totem.name}
      footer={
        <>
          <KButton variant="secondary" onClick={() => actions.reset()} className="flex-1">
            Inicio
          </KButton>
          {e.retry && (
            <KButton onClick={() => actions.go(e.retry!)} className="flex-[1.4]">
              Intentar de nuevo
            </KButton>
          )}
        </>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-12 text-center">
        <div className="grid h-[260px] w-[260px] place-items-center rounded-full bg-amber-100 text-[160px] font-black text-amber-600">!</div>
        <div className="text-[68px] font-black text-brand-800">{e.title}</div>
        <div className="max-w-[880px] text-[40px] leading-snug text-slate-600">{e.message}</div>
      </div>
    </Screen>
  );
}
