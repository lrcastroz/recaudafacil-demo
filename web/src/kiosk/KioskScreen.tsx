import { useEffect, useRef, useState } from 'react';
import type { DeviceStatus } from '@totem/shared';
import { KButton, Toast } from './components/ui';
import { AccountScreen, BillingScreen, DebtsScreen, InquiringScreen, SummaryScreen } from './screens/AccountScreens';
import { CardScreen, CashScreen, MethodScreen, ProcessingScreen } from './screens/PaymentScreens';
import { ErrorScreen, ResultScreen } from './screens/ResultScreens';
import { AttractScreen, BillerScreen, ServiceScreen } from './screens/StartScreens';
import type { ScreenProps } from './screens/types';
import type { KioskActions, KioskConfig, KioskState } from './useKiosk';

const SCREENS: Record<KioskState['screen'], (p: ScreenProps) => React.ReactElement> = {
  attract: AttractScreen,
  service: ServiceScreen,
  biller: BillerScreen,
  account: AccountScreen,
  inquiring: InquiringScreen,
  debts: DebtsScreen,
  summary: SummaryScreen,
  billing: BillingScreen,
  method: MethodScreen,
  cash: CashScreen,
  card: CardScreen,
  processing: ProcessingScreen,
  result: ResultScreen,
  error: ErrorScreen,
};

/** Contenido de la pantalla táctil (lienzo de 1080 x 1920). */
export function KioskScreen({
  state,
  actions,
  config,
  device,
  connected,
}: {
  state: KioskState;
  actions: KioskActions;
  config: KioskConfig;
  device: DeviceStatus | null;
  connected: boolean;
}) {
  const Comp = SCREENS[state.screen];
  const timeout = useInactivity(state, actions, config.settings.inactivitySeconds);
  return (
    <div className="relative h-[1920px] w-[1080px] overflow-hidden bg-slate-100 font-sans">
      <Comp state={state} actions={actions} config={config} device={device} />
      {state.notice && <Toast key={state.notice.id} text={state.notice.text} tone={state.notice.tone} onClose={actions.dismissNotice} />}
      {timeout !== null && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-brand-900/80 p-16">
          <div className="fade-up w-full rounded-[48px] bg-white p-16 text-center shadow-2xl">
            <div className="text-[64px] font-black text-brand-800">¿Necesita más tiempo?</div>
            <div className="mt-6 text-[38px] text-slate-600">La operación se cancelará en</div>
            <div className="my-8 text-[160px] font-black leading-none text-accent-500">{timeout}</div>
            <KButton variant="success" size="xl" className="w-full" onClick={() => window.dispatchEvent(new Event('kiosk-activity'))}>
              Sí, continuar
            </KButton>
          </div>
        </div>
      )}
      {!connected && (
        <div className="absolute inset-0 z-[60] grid place-items-center bg-slate-900/95 text-center text-white">
          <div>
            <div className="text-[90px]">⚠</div>
            <div className="text-[56px] font-black">Tótem fuera de servicio</div>
            <div className="mt-4 text-[34px] text-white/70">Reconectando con el servidor de recaudación...</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pantallas en las que aplica el timeout por inactividad (nunca con dinero ingresado o procesando). */
function timeoutApplies(s: KioskState) {
  if (['attract', 'inquiring', 'processing', 'result'].includes(s.screen)) return false;
  if (s.screen === 'cash') return (s.cash?.inserted ?? 0) === 0;
  if (s.screen === 'card') return !s.card || ['waitingCard', 'waitingPin'].includes(s.card.state) || !!s.cardResult;
  return true;
}

const WARN_S = 15;

function useInactivity(state: KioskState, actions: KioskActions, seconds: number) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const last = useRef(Date.now());
  const applies = timeoutApplies(state);
  const resetRef = useRef(actions.reset);
  resetRef.current = actions.reset;

  useEffect(() => {
    const mark = () => {
      last.current = Date.now();
      setCountdown(null);
    };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('kiosk-activity', mark);
    return () => {
      window.removeEventListener('pointerdown', mark, true);
      window.removeEventListener('kiosk-activity', mark);
    };
  }, []);

  // Cualquier cambio de pantalla o de estado del cobro cuenta como actividad.
  useEffect(() => {
    last.current = Date.now();
    setCountdown(null);
  }, [state.screen, state.cash?.inserted, state.card?.state]);

  useEffect(() => {
    if (!applies) return;
    const t = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      if (idle >= seconds + WARN_S) {
        setCountdown(null);
        resetRef.current();
      } else if (idle >= seconds) {
        setCountdown(Math.ceil(seconds + WARN_S - idle));
      }
    }, 500);
    return () => clearInterval(t);
  }, [applies, seconds]);

  return applies ? countdown : null;
}
