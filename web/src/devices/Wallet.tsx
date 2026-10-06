import { useEffect, useState } from 'react';
import { BILL_VALUES, COIN_VALUES, TEST_CARDS, type CardEntry, type ServiceType } from '@totem/shared';
import { api } from '../lib/api';
import { BillArt, CoinArt } from './CashArt';
import { dragProps, type Physical } from './physical';

export interface DemoAccount {
  billerCode: string;
  service: ServiceType;
  identifier: string;
  holder: string;
  pending: number;
  note: string;
}

export function useDemoData() {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  useEffect(() => {
    api
      .get<{ accounts: DemoAccount[] }>('/demo-data')
      .then((d) => setAccounts(d.accounts))
      .catch(() => setAccounts([]));
  }, []);
  return accounts;
}

const SERVICE_ICON: Record<ServiceType, string> = { LUZ: '⚡', AGUA: '💧', TELEFONO: '🌐' };
const BILLER_LABEL: Record<string, string> = {
  CENTROSUR: 'CentroSur · Luz',
  ETAPA_AGUA: 'ETAPA EP · Agua',
  EPMAPA_SD: 'EPMAPA-SD · Agua',
  ETAPA_TEL: 'ETAPA EP · Internet',
  YIGA5: 'Yiga5 · Internet',
};

/**
 * Billetera del cliente: monedas, billetes, tarjetas y planillas.
 * Clic = acción directa; arrastrar = soltar sobre la ranura correspondiente del tótem.
 */
export function Wallet({
  phys,
  onCardUsed,
  compact = false,
}: {
  phys: Physical;
  onCardUsed?: (cardId: string) => void;
  compact?: boolean;
}) {
  const accounts = useDemoData();
  const [tab, setTab] = useState<'cash' | 'cards' | 'bills'>('cash');
  const planillas = accounts.filter((a) => a.pending > 0 && !a.note.startsWith('Cuenta') && !a.note.startsWith('Empresa'));
  const specials = accounts.filter((a) => a.pending === 0 || a.note.startsWith('Cuenta') || a.note.startsWith('Empresa'));

  const useCard = (id: string, entry: CardEntry) => {
    onCardUsed?.(id);
    phys.card(id, entry);
  };

  const tabCls = (t: string) =>
    `flex-1 rounded-lg py-1.5 text-[13px] font-semibold ${tab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-1 rounded-xl bg-slate-800 p-1">
        <button type="button" className={tabCls('cash')} onClick={() => setTab('cash')}>
          Efectivo
        </button>
        <button type="button" className={tabCls('cards')} onClick={() => setTab('cards')}>
          Tarjetas
        </button>
        <button type="button" className={tabCls('bills')} onClick={() => setTab('bills')}>
          Planillas
        </button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === 'cash' && (
          <div className="space-y-4">
            <p className="text-[12px] leading-snug text-slate-400">Clic para insertar, o arrastre hasta la ranura del tótem.</p>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-400">Monedas</h4>
              <div className="flex flex-wrap items-center gap-2">
                {COIN_VALUES.map((v) => (
                  <button key={v} type="button" {...dragProps({ type: 'coin', value: v })} onClick={() => phys.coin(v)} className="cursor-grab transition hover:-translate-y-1 active:cursor-grabbing" title={`Insertar moneda`}>
                    <CoinArt value={v} size={compact ? 40 : 46} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-slate-400">Billetes</h4>
              <div className="grid grid-cols-2 gap-2">
                {BILL_VALUES.map((v) => (
                  <button key={v} type="button" {...dragProps({ type: 'bill', value: v })} onClick={() => phys.bill(v)} className="cursor-grab transition hover:-translate-y-1 active:cursor-grabbing" title="Insertar billete">
                    <BillArt value={v} width={compact ? 100 : 118} />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Los billetes de $2, $50 y $100 no son aceptados por defecto (prueba de rechazo).</p>
            </div>
          </div>
        )}

        {tab === 'cards' && (
          <div className="space-y-3">
            <p className="text-[12px] leading-snug text-slate-400">
              Arrastre la tarjeta al PIN pad (ranura de chip, antena superior o banda lateral) o use los botones. PIN correcto: <b className="text-white">1234</b>
            </p>
            {TEST_CARDS.map((c) => (
              <div key={c.id} className="rounded-xl bg-slate-800 p-2">
                <div {...dragProps({ type: 'card', cardId: c.id })} className="relative h-[74px] cursor-grab rounded-lg p-2 text-white shadow active:cursor-grabbing" style={{ background: c.color }}>
                  <div className="flex items-start justify-between">
                    <div className="h-[16px] w-[22px] rounded-sm bg-amber-300/90" />
                    <span className="text-[11px] font-black italic">{c.brand}</span>
                  </div>
                  <div className="mt-2 font-mono text-[12px] tracking-wider">•••• {c.number.slice(-4)}</div>
                  <div className="truncate text-[9px] opacity-80">{c.holder}</div>
                  {c.contactless && <span className="absolute bottom-1.5 right-2 text-[11px]">)))</span>}
                </div>
                <div className="mt-1.5 text-[11px] font-semibold text-slate-300">{c.label}</div>
                <div className="mt-1.5 flex gap-1">
                  <button type="button" onClick={() => useCard(c.id, 'chip')} className="flex-1 rounded bg-slate-700 py-1 text-[11px] text-white hover:bg-slate-600">
                    Insertar
                  </button>
                  <button type="button" disabled={!c.contactless} onClick={() => useCard(c.id, 'contactless')} className="flex-1 rounded bg-slate-700 py-1 text-[11px] text-white hover:bg-slate-600 disabled:opacity-30">
                    Acercar
                  </button>
                  <button type="button" onClick={() => useCard(c.id, 'swipe')} className="flex-1 rounded bg-slate-700 py-1 text-[11px] text-white hover:bg-slate-600">
                    Deslizar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'bills' && (
          <div className="space-y-2">
            <p className="text-[12px] leading-snug text-slate-400">Planillas impresas: clic en "Escanear" o arrastre hasta el lector de códigos del tótem.</p>
            {planillas.map((a) => (
              <PlanillaCard key={a.billerCode + a.identifier} a={a} phys={phys} />
            ))}
            <h4 className="pt-3 text-[12px] font-bold uppercase tracking-wider text-slate-400">Cuentas para escenarios especiales</h4>
            {specials.map((a) => (
              <PlanillaCard key={a.billerCode + a.identifier} a={a} phys={phys} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanillaCard({ a, phys }: { a: DemoAccount; phys: Physical }) {
  const code = `${a.billerCode}|${a.identifier}`;
  return (
    <div {...dragProps({ type: 'planilla', code })} className="flex cursor-grab items-center gap-2 rounded-lg bg-white p-2 text-slate-800 active:cursor-grabbing">
      <span className="text-[18px]">{SERVICE_ICON[a.service]}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[12px] font-bold">{BILLER_LABEL[a.billerCode] ?? a.billerCode.replace('_', ' ')}</div>
        <div className="font-mono text-[12px]">{a.identifier}</div>
        <div className="truncate text-[10px] text-slate-500">{a.note}</div>
      </div>
      <button type="button" onClick={() => phys.scan(code)} className="rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700">
        Escanear
      </button>
    </div>
  );
}
