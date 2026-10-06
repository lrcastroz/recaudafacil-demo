import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CardEntry } from '@totem/shared';
import { useTotemSocket } from '../lib/socket';
import { FaultPanel } from '../devices/FaultPanel';
import { BillSlot, ChangeTray, CoinSlot, DeviceLog, PrinterSlot, ReceiptModal, ScannerWindow } from '../devices/Peripherals';
import { PinPad } from '../devices/PinPad';
import { Wallet } from '../devices/Wallet';
import { physical } from '../devices/physical';

/**
 * Panel del presentador para el modo kiosko: opera los periféricos "físicos"
 * del tótem desde otro dispositivo (laptop o tablet) e inyecta fallas.
 */
export function SimulatorPage() {
  const [params, setParams] = useSearchParams();
  const totemId = params.get('totem') ?? 'TOT-001';
  const { socket, connected, status } = useTotemSocket('simulator', totemId);
  const [lastCard, setLastCard] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
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
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <header className="flex flex-wrap items-center gap-4 border-b border-white/10 px-4 py-3">
        <h1 className="text-lg font-black text-white">🎛 Simulador de periféricos</h1>
        <select
          value={totemId}
          onChange={(e) => setParams({ totem: e.target.value })}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white ring-1 ring-white/10"
        >
          <option value="TOT-001">TOT-001 · C.C. Río Tomebamba</option>
          <option value="TOT-002">TOT-002 · Centro Histórico</option>
          <option value="TOT-003">TOT-003 · El Arenal</option>
        </select>
        <span className={`flex items-center gap-2 text-sm ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} /> Servidor {connected ? 'conectado' : 'desconectado'}
        </span>
        <span className={`flex items-center gap-2 text-sm ${status?.kioskConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
          <span className={`h-2 w-2 rounded-full ${status?.kioskConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          Pantalla del tótem {status?.kioskConnected ? 'en línea' : 'sin conectar'}
        </span>
        <a href={`/kiosk?mode=kiosk&totem=${totemId}`} target="_blank" rel="noreferrer" className="ml-auto rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-400">
          Abrir pantalla del tótem ↗
        </a>
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          Inicio demo
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 md:grid-cols-2 xl:grid-cols-[300px_1fr_320px]">
        <section className="flex min-h-[480px] flex-col rounded-2xl bg-slate-900 p-3 ring-1 ring-white/10">
          <h2 className="mb-3 text-sm font-bold text-white">👛 Billetera del cliente</h2>
          <Wallet phys={phys} />
        </section>

        <section className="rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10">
          <h2 className="mb-3 text-sm font-bold text-white">🏧 Periféricos del tótem {totemId}</h2>
          <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4 rounded-xl bg-slate-800 p-4">
              <ScannerWindow phys={phys} />
              <CoinSlot status={status} phys={phys} />
              <BillSlot status={status} phys={phys} />
              <div className="pt-2">
                <PrinterSlot status={status} onOpen={() => setReceiptOpen(true)} />
              </div>
              <ChangeTray status={status} phys={phys} />
            </div>
            <div className="flex justify-center">
              <PinPad status={status} phys={phys} lastCardId={lastCard} />
            </div>
          </div>
        </section>

        <section className="flex min-h-[480px] flex-col gap-3 md:col-span-2 xl:col-span-1">
          <div className="rounded-2xl bg-slate-900 p-3 ring-1 ring-white/10">
            <h2 className="mb-3 text-sm font-bold text-white">⚙ Inyección de fallas</h2>
            <FaultPanel socket={socket} status={status} />
          </div>
          <div className="flex min-h-[260px] flex-1 flex-col rounded-2xl bg-slate-900 p-3 ring-1 ring-white/10">
            <h2 className="mb-2 text-sm font-bold text-white">📋 Eventos de dispositivos</h2>
            <div className="min-h-0 flex-1">
              <DeviceLog socket={socket} />
            </div>
          </div>
        </section>
      </div>

      {receiptOpen && status?.lastReceipt && (
        <ReceiptModal text={status.lastReceipt.text} txId={status.lastReceipt.txId} onClose={() => setReceiptOpen(false)} />
      )}
    </div>
  );
}
