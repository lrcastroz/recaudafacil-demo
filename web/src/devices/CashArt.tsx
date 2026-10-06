/** Ilustraciones de monedas y billetes en circulación en Ecuador (USD + centavos ecuatorianos). */

const COIN_STYLE: Record<number, { bg: string; ring: string; text: string; label: string; scale: number }> = {
  1: { bg: '#c87533', ring: '#9a5420', text: '#fff7ed', label: '1¢', scale: 0.82 },
  5: { bg: '#cbd5e1', ring: '#94a3b8', text: '#334155', label: '5¢', scale: 0.9 },
  10: { bg: '#d4d4d8', ring: '#a1a1aa', text: '#3f3f46', label: '10¢', scale: 0.78 },
  25: { bg: '#e2e8f0', ring: '#94a3b8', text: '#1e293b', label: '25¢', scale: 0.98 },
  50: { bg: '#e5e7eb', ring: '#9ca3af', text: '#1f2937', label: '50¢', scale: 1.08 },
  100: { bg: '#e8c25a', ring: '#b8902b', text: '#422006', label: '$1', scale: 1.05 },
};

export function CoinArt({ value, size = 56 }: { value: number; size?: number }) {
  const s = COIN_STYLE[value] ?? COIN_STYLE[25];
  const d = Math.round(size * s.scale);
  return (
    <div
      className="no-select grid shrink-0 place-items-center rounded-full font-black"
      style={{
        width: d,
        height: d,
        background: `radial-gradient(circle at 35% 30%, #ffffffaa, transparent 45%), ${s.bg}`,
        border: `${Math.max(2, d / 14)}px solid ${s.ring}`,
        color: s.text,
        fontSize: d * 0.32,
        boxShadow: '0 2px 4px rgba(0,0,0,.35), inset 0 0 0 2px rgba(255,255,255,.35)',
      }}
    >
      {s.label}
    </div>
  );
}

const BILL_COLORS: Record<number, string> = {
  100: '#6b8f71',
  200: '#7a9a6a',
  500: '#7d7aa8',
  1000: '#c08f5e',
  2000: '#5f9a8a',
  5000: '#c27a8e',
  10000: '#5e8fb0',
};

export function BillArt({ value, width = 120 }: { value: number; width?: number }) {
  const h = Math.round(width * 0.43);
  const c = BILL_COLORS[value] ?? '#6b8f71';
  return (
    <div
      className="no-select relative shrink-0 overflow-hidden rounded-[4px] font-black text-white"
      style={{
        width,
        height: h,
        background: `linear-gradient(135deg, ${c}, #d9e4d0 55%, ${c})`,
        border: `2px solid ${c}`,
        boxShadow: '0 2px 4px rgba(0,0,0,.3)',
      }}
    >
      <div
        className="absolute rounded-full"
        style={{ left: '36%', top: '12%', width: h * 0.76, height: h * 0.76, background: `${c}cc`, border: '2px solid #ffffff66' }}
      />
      <span className="absolute left-[6%] top-[4%]" style={{ fontSize: h * 0.3, textShadow: '0 1px 2px #0006' }}>
        {value / 100}
      </span>
      <span className="absolute bottom-[4%] right-[6%]" style={{ fontSize: h * 0.3, textShadow: '0 1px 2px #0006' }}>
        {value / 100}
      </span>
    </div>
  );
}
