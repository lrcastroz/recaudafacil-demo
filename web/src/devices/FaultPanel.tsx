import type { DeviceStatus, Faults } from '@totem/shared';
import { api } from '../lib/api';
import type { TotemSocket } from '../lib/socket';

const TOGGLES: { key: keyof Faults; label: string; help: string }[] = [
  { key: 'billerDown', label: 'Empresa sin respuesta', help: 'Falla al confirmar el pago → devolución / reverso' },
  { key: 'noChange', label: 'Sin vuelto', help: 'Hopper y reciclador vacíos → sólo valor exacto' },
  { key: 'dispenserJam', label: 'Atasco del dispensador', help: 'Vuelto parcial → saldo a favor' },
  { key: 'printerNoPaper', label: 'Impresora sin papel', help: 'Pago OK pero sin ticket impreso' },
  { key: 'cardTimeout', label: 'Autorizador sin respuesta', help: 'Timeout del banco → código 91' },
];

/** Inyección de fallas de hardware y servicios para el presentador. */
export function FaultPanel({ socket, status }: { socket: TotemSocket; status: DeviceStatus | null }) {
  if (!status) return <div className="text-sm text-slate-400">Conectando con el tótem...</div>;
  const totemId = status.totemId;
  const f = status.faults;
  const set = (faults: Partial<Faults>) => socket.emit('sim:faults', { totemId, faults });

  return (
    <div className="space-y-3 text-[13px]">
      <label className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-800 px-3 py-2">
        <span>
          <b className="text-white">Modo rápido</b>
          <span className="block text-[11px] text-slate-400">Acelera tiempos de validación e impresión</span>
        </span>
        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={status.fastMode} onChange={(e) => socket.emit('sim:fastMode', { totemId, enabled: e.target.checked })} />
      </label>

      {TOGGLES.map((t) => (
        <label key={t.key} className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 ${f[t.key] ? 'bg-red-900/60 ring-1 ring-red-500' : 'bg-slate-800'}`}>
          <span>
            <b className="text-white">{t.label}</b>
            <span className="block text-[11px] text-slate-400">{t.help}</span>
          </span>
          <input type="checkbox" className="h-4 w-4 accent-red-500" checked={f[t.key] as boolean} onChange={(e) => set({ [t.key]: e.target.checked })} />
        </label>
      ))}

      <div className="rounded-lg bg-slate-800 px-3 py-2">
        <b className="text-white">Próximo billete</b>
        <div className="mt-1 flex gap-1">
          {(['ok', 'fake', 'jam'] as const).map((v) => (
            <button key={v} type="button" onClick={() => set({ nextBill: v })} className={`flex-1 rounded py-1 text-[11px] font-semibold ${f.nextBill === v ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-white'}`}>
              {v === 'ok' ? 'Normal' : v === 'fake' ? 'No reconocido' : 'Atasco'}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg bg-slate-800 px-3 py-2">
        <b className="text-white">Próxima moneda</b>
        <div className="mt-1 flex gap-1">
          {(['ok', 'unknown'] as const).map((v) => (
            <button key={v} type="button" onClick={() => set({ nextCoin: v })} className={`flex-1 rounded py-1 text-[11px] font-semibold ${f.nextCoin === v ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-white'}`}>
              {v === 'ok' ? 'Normal' : 'No reconocida'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={status.billValidator.state !== 'jammed'}
          onClick={() => socket.emit('sim:clearJam', { totemId })}
          className="rounded-lg bg-slate-700 py-2 text-[12px] font-semibold text-white hover:bg-slate-600 disabled:opacity-40"
        >
          Despejar atasco
        </button>
        <button type="button" onClick={() => void api.post(`/admin/totems/${totemId}/paper`)} className="rounded-lg bg-slate-700 py-2 text-[12px] font-semibold text-white hover:bg-slate-600">
          Reponer papel ({status.printer.paperLevel}%)
        </button>
      </div>
    </div>
  );
}
