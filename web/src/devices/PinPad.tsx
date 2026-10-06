import { useState } from 'react';
import { findTestCard, type DeviceStatus } from '@totem/shared';
import { sounds } from '../lib/sounds';
import { dropProps, type Physical } from './physical';

/** PIN pad EMV (estilo Verifone/Ingenico) con lector de chip, banda y antena sin contacto. */
export function PinPad({ status, phys, lastCardId }: { status: DeviceStatus | null; phys: Physical; lastCardId: string | null }) {
  const ct = status?.cardTerminal;
  const [overChip, setOverChip] = useState(false);
  const [overTap, setOverTap] = useState(false);
  const [overSwipe, setOverSwipe] = useState(false);
  const active = ct && ct.state !== 'idle';
  const card = lastCardId ? findTestCard(lastCardId) : null;

  const key = (k: string) => {
    sounds.key();
    phys.pinKey(k);
  };

  const baseKey = 'no-select h-[34px] rounded-md text-[15px] font-bold shadow-[0_2px_0_#64748b] active:translate-y-[2px] active:shadow-none';
  const keyCls = `${baseKey} bg-slate-200 text-slate-800`;

  return (
    <div className="relative w-[196px] select-none">
      {/* Antena sin contacto en la parte superior */}
      <div
        {...dropProps(['card'], (p) => p.type === 'card' && phys.card(p.cardId, 'contactless'), setOverTap)}
        className={`mx-auto mb-1 flex h-[30px] w-[150px] items-center justify-center gap-1 rounded-t-xl text-[11px] font-semibold ${
          overTap ? 'bg-sky-400 text-white' : 'bg-slate-700 text-slate-300'
        }`}
        title="Arrastre una tarjeta aquí para pagar sin contacto"
      >
        <span className={active && ct?.state === 'waitingCard' ? 'text-sky-300' : ''}>)))</span> Sin contacto
      </div>
      <div className="rounded-[22px] bg-gradient-to-b from-slate-800 to-slate-900 p-3 shadow-[0_10px_30px_rgba(0,0,0,.5)] ring-1 ring-black">
        {/* Lector de banda lateral */}
        <div
          {...dropProps(['card'], (p) => p.type === 'card' && phys.card(p.cardId, 'swipe'), setOverSwipe)}
          className={`absolute -right-[10px] top-[60px] h-[120px] w-[12px] rounded-r-md ${overSwipe ? 'bg-sky-400' : 'bg-slate-600'}`}
          title="Banda magnética"
        />
        <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-bold tracking-widest text-slate-400">
          <span>PINPAD EMV</span>
          <span className={`h-[7px] w-[7px] rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        </div>
        <div className="mb-3 rounded-md bg-[#9fbf8f] px-2 py-1 font-mono text-[12px] font-bold leading-[17px] text-[#1e2b17] shadow-inner">
          <div className="truncate">{ct?.lcd[0] ?? 'SIN CONEXION'}</div>
          <div className="truncate">{ct?.lcd[1] ?? ''}</div>
        </div>
        <div className="grid grid-cols-4 gap-[6px]">
          {['1', '2', '3'].map((k) => (
            <button key={k} type="button" className={keyCls} onClick={() => key(k)}>
              {k}
            </button>
          ))}
          <button type="button" className={`${baseKey} bg-red-500 text-white`} onClick={() => key('cancel')} title="Cancelar">
            ✕
          </button>
          {['4', '5', '6'].map((k) => (
            <button key={k} type="button" className={keyCls} onClick={() => key(k)}>
              {k}
            </button>
          ))}
          <button type="button" className={`${baseKey} bg-amber-400 text-slate-900`} onClick={() => key('clear')} title="Borrar">
            ‹
          </button>
          {['7', '8', '9'].map((k) => (
            <button key={k} type="button" className={keyCls} onClick={() => key(k)}>
              {k}
            </button>
          ))}
          <button type="button" className={`${baseKey} row-span-2 h-auto bg-emerald-500 text-white`} onClick={() => key('enter')} title="Aceptar">
            O
          </button>
          <span />
          <button type="button" className={keyCls} onClick={() => key('0')}>
            0
          </button>
          <span />
        </div>
        {/* Ranura de chip frontal */}
        <div
          {...dropProps(['card'], (p) => p.type === 'card' && phys.card(p.cardId, 'chip'), setOverChip)}
          className={`relative mt-3 h-[22px] rounded-b-lg border-t-4 ${overChip ? 'border-sky-400 bg-sky-900' : 'border-black bg-slate-700'}`}
          title="Lector de chip"
        >
          {ct?.cardInside && (
            <button
              type="button"
              onClick={() => phys.removeCard()}
              className={`absolute left-1/2 top-[6px] h-[58px] w-[96px] -translate-x-1/2 rounded-b-lg text-[10px] font-bold text-white shadow-lg ${ct.state === 'removeCard' ? 'animate-bounce ring-2 ring-amber-300' : ''}`}
              style={{ background: card?.color ?? '#1d4b8f' }}
              title="Retirar tarjeta"
            >
              <span className="mt-6 block">RETIRAR</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
