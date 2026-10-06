import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CardEntry } from '@totem/shared';
import { api } from '../lib/api';
import { useTotemSocket } from '../lib/socket';
import { sounds } from '../lib/sounds';
import { FaultPanel } from '../devices/FaultPanel';
import { BillSlot, ChangeTray, CoinSlot, DeviceLog, PrinterSlot, ReceiptModal, ScannerWindow } from '../devices/Peripherals';
import { PinPad } from '../devices/PinPad';
import { Wallet } from '../devices/Wallet';
import { physical } from '../devices/physical';
import { KioskScreen } from './KioskScreen';
import { useKiosk, type KioskConfig } from './useKiosk';

const W = 1080;
const H = 1920;

/**
 * /kiosk?mode=frame  → tótem dibujado con periféricos interactivos (presentación en laptop/proyector)
 * /kiosk?mode=kiosk  → pantalla completa para monitor táctil; periféricos desde /simulator
 */
export function KioskPage() {
  const [params] = useSearchParams();
  const totemId = params.get('totem') ?? 'TOT-001';
  const mode = params.get('mode') === 'kiosk' ? 'kiosk' : 'frame';
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { socket, connected, status } = useTotemSocket('kiosk', totemId);
  const { state, actions } = useKiosk(socket, config);

  useEffect(() => {
    api
      .get<KioskConfig>(`/config?totem=${totemId}`)
      .then(setConfig)
      .catch((e) => setLoadError((e as Error).message));
  }, [totemId]);

  // Recargar configuración (comisión, empresas activas...) cada vez que vuelve a la pantalla de inicio.
  useEffect(() => {
    if (state.screen === 'attract') {
      api.get<KioskConfig>(`/config?totem=${totemId}`).then(setConfig).catch(() => undefined);
    }
  }, [state.screen, totemId]);

  if (loadError) return <div className="grid h-full place-items-center p-8 text-center text-white">{loadError}</div>;
  if (!config) return <div className="grid h-full place-items-center text-white">Iniciando tótem...</div>;

  const screen = <KioskScreen state={state} actions={actions} config={config} device={status} connected={connected} />;

  if (mode === 'kiosk') {
    return (
      <div className="h-full w-full bg-black">
        <Scaled>{screen}</Scaled>
      </div>
    );
  }
  return <FrameLayout totemId={totemId} config={config} screen={screen} socket={socket} status={status} />;
}

/** Escala el lienzo de 1080x1920 al contenedor manteniendo proporción. */
function Scaled({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(el.clientWidth / W, el.clientHeight / H));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center' }}
      >
        {children}
      </div>
    </div>
  );
}

function FrameLayout({
  totemId,
  config,
  screen,
  socket,
  status,
}: {
  totemId: string;
  config: KioskConfig;
  screen: React.ReactNode;
  socket: ReturnType<typeof useTotemSocket>['socket'];
  status: ReturnType<typeof useTotemSocket>['status'];
}) {
  const [lastCard, setLastCard] = useState<string | null>(null);
  const [panel, setPanel] = useState<'faults' | 'log' | null>('log');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [muted, setMuted] = useState(sounds.isMuted());

  // Tamaño de la pantalla (9:16) a partir del alto disponible para el tótem.
  const sectionRef = useRef<HTMLElement>(null);
  const [screenSize, setScreenSize] = useState({ w: 360, h: 620 });
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const CHROME = 14 + 24 + 56 + 24; // base + padding del cuerpo + copete + rótulo inferior
    const BEZEL = 20;
    const ro = new ResizeObserver(() => {
      const h = Math.max(300, el.clientHeight - CHROME);
      setScreenSize({ w: Math.round(((h - BEZEL) * W) / H + BEZEL), h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Recordamos la última tarjeta usada para dibujarla dentro del lector de chip.
  const phys = useMemo(() => {
    const p = physical(socket, totemId);
    return {
      ...p,
      card: (id: string, entry: CardEntry) => {
        setLastCard(id);
        p.card(id, entry);
      },
    };
  }, [socket, totemId]);

  return (
    <div className="flex h-full w-full gap-4 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-slate-200">
      {/* Billetera del cliente */}
      <aside className="flex w-[270px] shrink-0 flex-col rounded-2xl bg-slate-900/80 p-3 ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-white">👛 Billetera del cliente</h2>
          <Link to="/" className="text-[11px] text-slate-400 hover:text-white">
            Inicio demo
          </Link>
        </div>
        <Wallet phys={phys} />
      </aside>

      {/* Tótem */}
      <section ref={sectionRef} className="flex min-w-0 flex-1 items-stretch justify-center">
        <div className="flex h-full flex-col items-center">
          <div className="flex flex-1 flex-col rounded-t-[28px] rounded-b-lg bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500 p-3 shadow-[0_30px_80px_rgba(0,0,0,.6)]">
            {/* Copete iluminado */}
            <div className="mb-3 flex h-[44px] items-center justify-center gap-3 rounded-t-[20px] bg-brand-800 text-white shadow-inner">
              <span className="grid h-[28px] w-[28px] place-items-center rounded-md bg-accent-500 font-black">$</span>
              <span className="text-[18px] font-black tracking-tight">
                Recauda<span className="text-accent-400">Fácil</span>
              </span>
              <span className="text-[11px] text-white/70">· Luz · Agua · Internet</span>
            </div>
            <div className="flex min-h-0 flex-1 gap-3">
              {/* Pantalla táctil */}
              <div className="shrink-0 rounded-xl bg-black p-[10px] shadow-[inset_0_0_10px_#000]" style={{ width: screenSize.w, height: screenSize.h }}>
                <div className="h-full w-full overflow-hidden rounded-md">
                  <Scaled>{screen}</Scaled>
                </div>
              </div>
              {/* Columna de periféricos */}
              <div className="flex w-[200px] flex-col gap-3 rounded-xl bg-slate-800 p-3 shadow-inner ring-1 ring-black/40">
                <ScannerWindow phys={phys} />
                <CoinSlot status={status} phys={phys} />
                <BillSlot status={status} phys={phys} />
                <div className="mt-2">
                  <PrinterSlot status={status} onOpen={() => setReceiptOpen(true)} />
                </div>
                <div className="mt-auto">
                  <ChangeTray status={status} phys={phys} />
                </div>
              </div>
              {/* PIN pad en repisa lateral */}
              <div className="flex flex-col justify-center">
                <div className="rounded-xl bg-slate-500/60 p-2 shadow-inner">
                  <PinPad status={status} phys={phys} lastCardId={lastCard} />
                </div>
              </div>
            </div>
            <div className="mt-2 text-center text-[10px] font-semibold tracking-widest text-slate-700">
              {config.totem.id} · {config.totem.location.toUpperCase()}
            </div>
          </div>
          <div className="h-[14px] w-[80%] rounded-b-xl bg-slate-600" />
        </div>
      </section>

      {/* Panel del presentador */}
      <aside className={`flex shrink-0 flex-col rounded-2xl bg-slate-900/80 p-3 ring-1 ring-white/10 transition-all ${panel ? 'w-[300px]' : 'w-[52px]'}`}>
        <div className={`mb-3 flex gap-1 ${panel ? '' : 'flex-col'}`}>
          <PanelTab active={panel === 'log'} onClick={() => setPanel(panel === 'log' ? null : 'log')} icon="📋" label="Eventos" open={!!panel} />
          <PanelTab active={panel === 'faults'} onClick={() => setPanel(panel === 'faults' ? null : 'faults')} icon="⚙" label="Fallas" open={!!panel} />
          <button
            type="button"
            title={muted ? 'Activar sonido' : 'Silenciar'}
            onClick={() => {
              sounds.setMuted(!muted);
              setMuted(!muted);
            }}
            className="rounded-lg bg-slate-800 px-2 py-1.5 text-[14px] hover:bg-slate-700"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
        {panel === 'log' && (
          <div className="min-h-0 flex-1">
            <DeviceLog socket={socket} />
          </div>
        )}
        {panel === 'faults' && (
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <FaultPanel socket={socket} status={status} />
          </div>
        )}
      </aside>

      {receiptOpen && status?.lastReceipt && (
        <ReceiptModal text={status.lastReceipt.text} txId={status.lastReceipt.txId} onClose={() => setReceiptOpen(false)} />
      )}
    </div>
  );
}

function PanelTab({ active, onClick, icon, label, open }: { active: boolean; onClick: () => void; icon: string; label: string; open: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-1.5 text-[13px] font-semibold ${open ? 'flex-1' : ''} ${active ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
    >
      {icon} {open && label}
    </button>
  );
}
