import { useEffect, useState } from 'react';
import type { ServiceType } from '@totem/shared';
import { KButton, Logo, SERVICE_STYLE, Screen, ServiceIcon } from '../components/ui';
import type { ScreenProps } from './types';

const SLOGANS = [
  'Pague luz, agua e internet en menos de 2 minutos',
  'CentroSur, ETAPA EP, EPMAPA-SD y Yiga5 en un solo lugar',
  'Aceptamos monedas, billetes y tarjetas de crédito o débito',
  'Entregamos vuelto y comprobante con factura electrónica',
  'Atención 24/7, sin filas',
];

export function AttractScreen({ actions }: ScreenProps) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % SLOGANS.length), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <button type="button" onClick={actions.start} className="attract-bg no-select flex h-full w-full flex-col items-center justify-between px-16 py-28 text-white">
      <Logo big />
      <div className="flex flex-col items-center gap-16">
        <div className="flex gap-14">
          {(['LUZ', 'AGUA', 'TELEFONO'] as ServiceType[]).map((s) => (
            <div key={s} className="flex flex-col items-center gap-5">
              <div className={`grid h-[220px] w-[220px] place-items-center rounded-[56px] bg-gradient-to-br ${SERVICE_STYLE[s].bg} shadow-2xl`}>
                <ServiceIcon service={s} size={130} />
              </div>
              <span className="text-[44px] font-bold">{SERVICE_STYLE[s].label}</span>
            </div>
          ))}
        </div>
        <p key={i} className="fade-up h-[130px] max-w-[880px] text-center text-[50px] font-semibold leading-tight">
          {SLOGANS[i]}
        </p>
        <PaymentBadges />
      </div>
      <div className="flex flex-col items-center gap-8">
        <div className="relative grid place-items-center">
          <span className="pulse-ring absolute h-[180px] w-[180px] rounded-full bg-accent-400/50" />
          <span className="relative grid h-[180px] w-[180px] place-items-center rounded-full bg-accent-500 text-[90px] shadow-2xl">👆</span>
        </div>
        <span className="text-[58px] font-extrabold">Toque la pantalla para comenzar</span>
        <span className="text-[32px] text-white/70">o acerque el código de barras de su planilla al lector</span>
      </div>
    </button>
  );
}

export function PaymentBadges({ dark = false }: { dark?: boolean }) {
  const cls = dark ? 'bg-slate-100 text-brand-800' : 'bg-white/15 text-white';
  return (
    <div className="flex flex-wrap justify-center gap-4 text-[30px] font-bold">
      {['🪙 Monedas', '💵 Billetes', 'VISA', 'Mastercard', 'Diners', 'AMEX'].map((b) => (
        <span key={b} className={`rounded-2xl px-6 py-3 ${cls}`}>
          {b}
        </span>
      ))}
    </div>
  );
}

export function ServiceScreen({ actions, config }: ScreenProps) {
  return (
    <Screen
      step={0}
      location={config.totem.name}
      title="¿Qué servicio desea pagar?"
      subtitle="Seleccione el tipo de servicio básico"
      footer={
        <KButton variant="secondary" onClick={() => actions.reset()} className="flex-1">
          Inicio
        </KButton>
      }
    >
      <div className="flex h-full flex-col gap-10">
        {(['LUZ', 'AGUA', 'TELEFONO'] as ServiceType[]).map((s) => {
          const st = SERVICE_STYLE[s];
          const billers = config.billers.filter((b) => b.service === s);
          if (billers.length === 0) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => actions.chooseService(s)}
              className={`no-select flex flex-1 items-center gap-12 rounded-[48px] bg-gradient-to-br ${st.bg} px-14 text-left text-white shadow-xl active:scale-[0.98]`}
            >
              <div className="grid h-[200px] w-[200px] shrink-0 place-items-center rounded-[40px] bg-white/20">
                <ServiceIcon service={s} size={130} />
              </div>
              <div className="flex-1">
                <div className="text-[76px] font-black leading-none">{st.label}</div>
                <div className="mt-4 text-[36px] text-white/90">{st.desc}</div>
                <div className="mt-3 text-[30px] font-semibold text-white/85">
                  {billers.length === 1 ? billers[0].name : `${billers.length} empresas disponibles`}
                </div>
              </div>
              <span className="text-[90px]">›</span>
            </button>
          );
        })}
        <div className="flex items-center gap-6 rounded-[32px] border-4 border-dashed border-slate-300 bg-white px-10 py-8 text-[32px] text-slate-600">
          <span className="text-[60px]">▥</span>
          <span>¿Tiene su planilla a la mano? Acerque el <b>código de barras</b> al lector para ir directo al pago.</span>
        </div>
      </div>
    </Screen>
  );
}

export function BillerScreen({ state, actions, config }: ScreenProps) {
  const service = state.service!;
  const billers = config.billers.filter((b) => b.service === service);
  return (
    <Screen
      step={0}
      location={config.totem.name}
      title={`Pago de ${SERVICE_STYLE[service].label.toLowerCase()}`}
      subtitle="Seleccione la empresa que emite su planilla"
      footer={
        <>
          <KButton variant="secondary" onClick={() => actions.go('service')} className="flex-1">
            ‹ Atrás
          </KButton>
          <KButton variant="secondary" onClick={() => actions.reset()} className="flex-1">
            Inicio
          </KButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-8">
        {billers.map((b) => (
          <button
            key={b.code}
            type="button"
            onClick={() => actions.chooseBiller(b)}
            className="no-select flex min-h-[260px] flex-col overflow-hidden rounded-[36px] bg-white text-left shadow-lg active:scale-[0.98]"
          >
            <div className="h-[22px] w-full" style={{ background: b.color }} />
            <div className="flex flex-1 flex-col justify-between p-9">
              <div>
                <div className="text-[48px] font-black leading-tight text-brand-800">{b.shortName}</div>
                <div className="mt-2 text-[27px] leading-snug text-slate-600">{b.name}</div>
              </div>
              <div className="mt-4 text-[25px] font-semibold" style={{ color: b.color }}>
                {b.region}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Screen>
  );
}
