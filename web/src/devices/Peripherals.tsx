import { useEffect, useRef, useState } from 'react';
import type { DeviceLogEntry, DeviceStatus } from '@totem/shared';
import { formatMoney, ecTime } from '../lib/format';
import type { TotemSocket } from '../lib/socket';
import { BillArt, CoinArt } from './CashArt';
import { dropProps, type Physical } from './physical';

function Led({ on, color = 'emerald', blink }: { on: boolean; color?: 'emerald' | 'red' | 'amber'; blink?: boolean }) {
  const c = { emerald: 'bg-emerald-400 text-emerald-400', red: 'bg-red-500 text-red-500', amber: 'bg-amber-400 text-amber-400' }[color];
  return <span className={`inline-block h-[9px] w-[9px] rounded-full ${on ? `${c} ${blink ? 'led-blink' : ''}` : 'bg-slate-600'}`} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{children}</div>;
}

export function ScannerWindow({ phys }: { phys: Physical }) {
  const [over, setOver] = useState(false);
  return (
    <div {...dropProps(['planilla'], (p) => p.type === 'planilla' && phys.scan(p.code), setOver)}>
      <Label>Lector de códigos</Label>
      <div className={`relative h-[44px] overflow-hidden rounded-md border-2 ${over ? 'border-red-400 bg-red-950' : 'border-slate-600 bg-black'}`}>
        <div className={`absolute inset-x-2 top-1/2 h-[2px] ${over ? 'bg-red-500 shadow-[0_0_8px_2px_#ef4444]' : 'bg-red-900'}`} />
        <span className="absolute inset-0 grid place-items-center text-[10px] text-slate-500">{over ? 'Soltar para leer' : 'Arrastre la planilla'}</span>
      </div>
    </div>
  );
}

export function CoinSlot({ status, phys }: { status: DeviceStatus | null; phys: Physical }) {
  const [over, setOver] = useState(false);
  const enabled = !!status?.coinAcceptor.enabled;
  return (
    <div {...dropProps(['coin'], (p) => p.type === 'coin' && phys.coin(p.value), setOver)}>
      <Label>
        <span className="flex items-center gap-2">
          <Led on={enabled} blink={enabled} /> Monedero
        </span>
      </Label>
      <div className={`grid h-[50px] place-items-center rounded-lg border-2 ${over ? 'border-emerald-400 bg-slate-700' : enabled ? 'border-emerald-500/60 bg-slate-800' : 'border-slate-600 bg-slate-800'}`}>
        <div className="h-[30px] w-[7px] rounded-full bg-black shadow-[inset_0_0_4px_#000]" />
      </div>
      {status?.coinAcceptor.busy && <div className="mt-1 text-[10px] text-emerald-300">Validando moneda...</div>}
    </div>
  );
}

const BV_LABEL: Record<string, string> = {
  disabled: 'Inhibido',
  idle: 'Listo',
  validating: 'Validando...',
  escrow: 'Escrow',
  stacking: 'Apilando',
  returning: 'Devolviendo',
  jammed: 'ATASCO',
};

export function BillSlot({ status, phys }: { status: DeviceStatus | null; phys: Physical }) {
  const [over, setOver] = useState(false);
  const st = status?.billValidator.state ?? 'disabled';
  const ready = st === 'idle';
  const current = status?.billValidator.current;
  return (
    <div {...dropProps(['bill'], (p) => p.type === 'bill' && phys.bill(p.value), setOver)}>
      <Label>
        <span className="flex items-center gap-2">
          <Led on={st !== 'disabled'} color={st === 'jammed' ? 'red' : ready ? 'emerald' : 'amber'} blink={ready || st === 'jammed'} /> Billetero · {BV_LABEL[st]}
        </span>
      </Label>
      <div className={`relative grid h-[54px] place-items-center overflow-visible rounded-lg border-2 ${over ? 'border-emerald-400 bg-slate-700' : ready ? 'border-emerald-500/60 bg-slate-800' : st === 'jammed' ? 'border-red-500 bg-slate-800' : 'border-slate-600 bg-slate-800'}`}>
        <div className="h-[8px] w-[85%] rounded-full bg-black shadow-[inset_0_0_4px_#000]" />
        {current && ['validating', 'escrow', 'returning', 'jammed'].includes(st) && (
          <div className={`absolute left-1/2 top-[18px] -translate-x-1/2 ${st === 'returning' ? 'drop-in' : ''}`}>
            <BillArt value={current} width={110} />
          </div>
        )}
      </div>
    </div>
  );
}

export function PrinterSlot({ status, onOpen }: { status: DeviceStatus | null; onOpen: () => void }) {
  const pr = status?.printer;
  const receipt = status?.lastReceipt;
  const [taken, setTaken] = useState<string | null>(null);
  const visible = receipt && taken !== receipt.txId;
  return (
    <div>
      <Label>
        <span className="flex items-center gap-2">
          <Led on={!!pr} color={pr?.state === 'paperOut' ? 'red' : 'emerald'} blink={pr?.state === 'printing' || pr?.state === 'paperOut'} /> Impresora ·{' '}
          {pr?.state === 'paperOut' ? 'SIN PAPEL' : `papel ${pr?.paperLevel ?? 0}%`}
        </span>
      </Label>
      <div className="relative h-[16px] rounded-md bg-slate-800 ring-2 ring-slate-600">
        <div className="absolute inset-x-[15%] top-[5px] h-[4px] rounded bg-black" />
      </div>
      {visible && (
        <div className="paper-out relative mx-auto -mt-1 w-[70%]" key={receipt.txId}>
          <button
            type="button"
            onClick={onOpen}
            className="block h-[110px] w-full overflow-hidden whitespace-pre bg-white px-1 pt-1 text-left font-mono text-[4.2px] leading-[5px] text-slate-800 shadow-md [mask-image:linear-gradient(to_bottom,black_75%,transparent)]"
            title="Ver comprobante"
          >
            {receipt.text}
          </button>
          <button type="button" onClick={() => setTaken(receipt.txId)} className="mt-1 w-full rounded bg-slate-700 py-0.5 text-[10px] text-white hover:bg-slate-600">
            Retirar comprobante
          </button>
        </div>
      )}
      {pr?.state === 'printing' && <div className="mt-1 text-center text-[10px] text-emerald-300">Imprimiendo...</div>}
    </div>
  );
}

export function ChangeTray({ status, phys }: { status: DeviceStatus | null; phys: Physical }) {
  const tray = status?.tray ?? [];
  const total = tray.reduce((a, i) => a + i.value, 0);
  return (
    <div>
      <Label>
        <span className="flex items-center gap-2">
          <Led on={tray.length > 0} color="amber" blink={tray.length > 0} /> Bandeja de vuelto
          {status?.dispenser.state === 'dispensing' && <span className="text-emerald-300">· entregando</span>}
          {status?.dispenser.state === 'jammed' && <span className="text-red-400">· ATASCO</span>}
        </span>
      </Label>
      <div className="flex min-h-[70px] flex-wrap content-start items-center gap-1 rounded-b-2xl border-x-2 border-b-2 border-slate-600 bg-black/60 p-2 shadow-[inset_0_6px_10px_#000]">
        {tray.map((it, i) =>
          it.kind === 'coin' ? (
            <div key={i} className="drop-in">
              <CoinArt value={it.value} size={26} />
            </div>
          ) : (
            <div key={i} className="drop-in">
              <BillArt value={it.value} width={58} />
            </div>
          ),
        )}
      </div>
      {tray.length > 0 && (
        <button type="button" onClick={phys.takeTray} className="mt-1 w-full rounded bg-amber-500 py-1 text-[11px] font-bold text-slate-900 hover:bg-amber-400">
          Retirar {formatMoney(total)}
        </button>
      )}
    </div>
  );
}

export function ReceiptModal({ text, txId, onClose }: { text: string; txId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-full overflow-auto rounded-lg bg-slate-100 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <pre className="bg-white p-4 font-mono text-[12px] leading-[16px] text-slate-900 shadow">{text}</pre>
        <div className="mt-3 flex gap-2">
          <a href={`/api/receipts/${txId}.pdf`} target="_blank" rel="noreferrer" className="flex-1 rounded bg-slate-900 py-2 text-center text-sm font-semibold text-white hover:bg-slate-700">
            Descargar PDF
          </a>
          <button type="button" onClick={onClose} className="flex-1 rounded bg-slate-300 py-2 text-sm font-semibold hover:bg-slate-400">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const LEVEL_CLS = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-400' };

export function DeviceLog({ socket, max = 200 }: { socket: TotemSocket; max?: number }) {
  const [entries, setEntries] = useState<DeviceLogEntry[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: DeviceLogEntry) => setEntries((x) => [...x.slice(-max + 1), e]);
    socket.on('device:log', h);
    return () => {
      socket.off('device:log', h);
    };
  }, [socket, max]);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [entries]);
  return (
    <div ref={box} className="scrollbar-thin h-full overflow-y-auto rounded-lg bg-black/60 p-2 font-mono text-[11px] leading-[15px]">
      {entries.length === 0 && <div className="text-slate-500">Esperando eventos de dispositivos...</div>}
      {entries.map((e, i) => (
        <div key={i} className={LEVEL_CLS[e.level]}>
          <span className="text-slate-500">{ecTime(e.ts)}</span> <span className="font-bold text-sky-300">[{e.device}]</span> {e.message}
        </div>
      ))}
    </div>
  );
}
