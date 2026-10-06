/**
 * Gráficos simples de una sola serie (un tono): la identidad la dan las etiquetas,
 * no el color. Barras delgadas con extremo redondeado, rejilla discreta y tooltip.
 */
import { useState } from 'react';
import { formatMoney } from '../lib/format';

const BAR = '#1d4b8f';
const BAR_HOVER = '#2563eb';

export interface Datum {
  label: string;
  value: number;
  count?: number;
}

/** Columnas verticales (serie temporal discreta: horas o días). */
export function ColumnChart({ data, height = 180, emptyText = 'Sin datos' }: { data: Datum[]; height?: number; emptyText?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.every((d) => d.value === 0)) return <div className="grid place-items-center text-sm text-slate-400" style={{ height }}>{emptyText}</div>;
  const ticks = [0.5, 1].map((f) => max * f);
  return (
    <div className="relative" style={{ height: height + 24 }}>
      {/* rejilla */}
      {ticks.map((t) => (
        <div key={t} className="absolute inset-x-0 border-t border-dashed border-slate-200" style={{ bottom: 24 + (t / max) * height }}>
          <span className="absolute -top-2.5 right-0 bg-white pl-1 text-[10px] text-slate-400">{formatMoney(t)}</span>
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-[24px] border-t border-slate-300" />
      <div className="absolute inset-x-0 bottom-0 top-0 flex items-end gap-[2px] pr-14">
        {data.map((d, i) => (
          <div
            key={d.label}
            className="relative flex h-full flex-1 flex-col justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="mx-auto w-full max-w-[28px] rounded-t-[4px] transition-colors"
              style={{ height: Math.max(d.value > 0 ? 2 : 0, (d.value / max) * height), background: hover === i ? BAR_HOVER : BAR, marginBottom: 24 }}
            />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">{d.label}</span>
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg" style={{ bottom: 24 + (d.value / max) * height }}>
                <b>{d.label}</b> · {formatMoney(d.value)}
                {d.count !== undefined && <span className="text-slate-300"> · {d.count} tx</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales con etiqueta directa (ranking por categoría). */
export function BarList({ data, emptyText = 'Sin datos' }: { data: Datum[]; emptyText?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="py-6 text-center text-sm text-slate-400">{emptyText}</div>;
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="group" title={`${d.label}: ${formatMoney(d.value)}${d.count !== undefined ? ` · ${d.count} transacciones` : ''}`}>
          <div className="mb-1 flex justify-between text-[12px]">
            <span className="font-medium text-slate-700">{d.label}</span>
            <span className="tabular-nums text-slate-500">
              {formatMoney(d.value)}
              {d.count !== undefined && <span className="text-slate-400"> · {d.count}</span>}
            </span>
          </div>
          <div className="h-[8px] rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-colors group-hover:bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Medidor de nivel (inventario vs. capacidad) con estado textual. */
export function LevelBar({ value, capacity, low = 0.15 }: { value: number; capacity: number; low?: number }) {
  const ratio = capacity ? value / capacity : 0;
  const state = ratio <= low ? 'bg-red-500' : ratio >= 0.9 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-[6px] w-full rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${state}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}
