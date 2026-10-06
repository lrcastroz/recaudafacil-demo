import { useEffect, useState, type ReactNode } from 'react';
import type { ServiceType } from '@totem/shared';
import { sounds } from '../../lib/sounds';

/* Lienzo del tótem: 1080 x 1920 px de diseño (pantalla vertical de 32"). */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-[0_8px_0_#0b2545] active:shadow-[0_2px_0_#0b2545] active:translate-y-[6px]',
  success: 'bg-accent-500 text-white shadow-[0_8px_0_#0b7a6e] active:shadow-[0_2px_0_#0b7a6e] active:translate-y-[6px]',
  secondary: 'bg-white text-brand-800 border-4 border-brand-600 shadow-[0_8px_0_#cbd5e1] active:shadow-none active:translate-y-[6px]',
  danger: 'bg-white text-red-700 border-4 border-red-500 shadow-[0_8px_0_#fecaca] active:shadow-none active:translate-y-[6px]',
  ghost: 'bg-white/10 text-white border-2 border-white/30',
};

export function KButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  size = 'lg',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  size?: 'md' | 'lg' | 'xl';
}) {
  const sz = size === 'xl' ? 'h-[150px] text-[52px] px-14' : size === 'lg' ? 'h-[124px] text-[44px] px-12' : 'h-[96px] text-[36px] px-9';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        sounds.tap();
        onClick?.();
      }}
      className={`no-select rounded-[32px] font-bold transition-transform duration-75 disabled:opacity-40 disabled:pointer-events-none ${sz} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <span>
      {now.toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', weekday: 'short', day: '2-digit', month: 'short' })}
      {' · '}
      {now.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false })}
    </span>
  );
}

const STEPS = ['Servicio', 'Cuenta', 'Planillas', 'Pago', 'Comprobante'];

export function Screen({
  title,
  subtitle,
  step,
  children,
  footer,
  location,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  step?: number;
  children: ReactNode;
  footer?: ReactNode;
  location?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-slate-100">
      <header className="flex h-[150px] shrink-0 items-center justify-between bg-brand-800 px-14 text-white">
        <Logo />
        <div className="text-right text-[28px] leading-tight text-white/80">
          <div className="font-semibold text-white">{location}</div>
          <Clock />
        </div>
      </header>
      {step !== undefined && (
        <div className="flex shrink-0 gap-3 bg-white px-14 py-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-[12px] rounded-full ${i <= step ? 'bg-accent-500' : 'bg-slate-200'}`} />
              <div className={`mt-2 text-center text-[24px] ${i === step ? 'font-bold text-brand-800' : 'text-slate-400'}`}>{label}</div>
            </div>
          ))}
        </div>
      )}
      {(title || subtitle) && (
        <div className="shrink-0 px-14 pt-12 pb-6">
          {title && <h1 className="text-[64px] font-extrabold leading-[1.1] text-brand-800">{title}</h1>}
          {subtitle && <p className="mt-4 text-[34px] leading-snug text-slate-600">{subtitle}</p>}
        </div>
      )}
      <main className="relative min-h-0 flex-1 px-14 pb-8">{children}</main>
      {footer && <footer className="flex shrink-0 gap-8 border-t-2 border-slate-200 bg-white px-14 py-10">{footer}</footer>}
    </div>
  );
}

export function Logo({ light = true, big = false }: { light?: boolean; big?: boolean }) {
  return (
    <div className={`flex items-center gap-5 ${light ? 'text-white' : 'text-brand-800'}`}>
      <div
        className={`grid place-items-center rounded-[22px] bg-accent-500 font-black text-white ${big ? 'h-[150px] w-[150px] text-[90px]' : 'h-[90px] w-[90px] text-[54px]'}`}
      >
        $
      </div>
      <div className="leading-none">
        <div className={`font-black tracking-tight ${big ? 'text-[96px]' : 'text-[50px]'}`}>
          Recauda<span className="text-accent-400">Fácil</span>
        </div>
        <div className={`${big ? 'mt-3 text-[34px]' : 'mt-1 text-[22px]'} opacity-80`}>Pague sus servicios básicos aquí</div>
      </div>
    </div>
  );
}

export const SERVICE_STYLE: Record<ServiceType, { color: string; bg: string; label: string; desc: string }> = {
  LUZ: { color: '#f59e0b', bg: 'from-amber-400 to-orange-500', label: 'Luz', desc: 'Planillas de energía eléctrica' },
  AGUA: { color: '#0ea5e9', bg: 'from-sky-400 to-cyan-600', label: 'Agua', desc: 'Agua potable y alcantarillado' },
  TELEFONO: { color: '#7c3aed', bg: 'from-violet-500 to-indigo-600', label: 'Internet', desc: 'Internet y telefonía fija' },
};

export function ServiceIcon({ service, size = 120 }: { service: ServiceType; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 64 64', fill: 'none', stroke: 'currentColor', strokeWidth: 3.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (service === 'LUZ')
    return (
      <svg {...common}>
        <path d="M36 4 14 36h16l-4 24 24-34H34l2-22z" fill="currentColor" fillOpacity={0.15} />
      </svg>
    );
  if (service === 'AGUA')
    return (
      <svg {...common}>
        <path d="M32 6C24 18 14 28 14 40a18 18 0 0 0 36 0C50 28 40 18 32 6z" fill="currentColor" fillOpacity={0.15} />
        <path d="M24 42a8 8 0 0 0 8 8" />
      </svg>
    );
  // Internet: ondas de wifi
  return (
    <svg {...common}>
      <path d="M6 24a38 38 0 0 1 52 0" />
      <path d="M15 34a25 25 0 0 1 34 0" />
      <path d="M24 44a12 12 0 0 1 16 0" />
      <circle cx="32" cy="53" r="4" fill="currentColor" />
    </svg>
  );
}

/* ---------------- Teclado numérico en pantalla ---------------- */

export function NumericKeypad({
  value,
  onChange,
  maxLength = 13,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  onEnter?: () => void;
}) {
  const press = (k: string) => {
    sounds.key();
    if (k === '⌫') onChange(value.slice(0, -1));
    else if (k === 'C') onChange('');
    else if (k === 'OK') onEnter?.();
    else if (value.length < maxLength) onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  return (
    <div className="grid grid-cols-3 gap-5">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          className={`no-select h-[132px] rounded-[28px] text-[60px] font-bold shadow-[0_6px_0_#cbd5e1] active:translate-y-[5px] active:shadow-none ${
            k === 'C' ? 'bg-amber-100 text-amber-800' : k === '⌫' ? 'bg-slate-200 text-slate-700' : 'bg-white text-brand-800'
          }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Teclado alfanumérico en pantalla ---------------- */

const ROWS_TEXT = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM.-'];
const ROWS_EMAIL = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm._-'];

export function TextKeyboard({
  value,
  onChange,
  mode = 'text',
  maxLength = 60,
}: {
  value: string;
  onChange: (v: string) => void;
  mode?: 'text' | 'email';
  maxLength?: number;
}) {
  const rows = mode === 'email' ? ROWS_EMAIL : ROWS_TEXT;
  const add = (s: string) => {
    sounds.key();
    if ((value + s).length <= maxLength) onChange(value + s);
  };
  const keyCls =
    'no-select h-[92px] flex-1 rounded-[18px] bg-white text-[38px] font-semibold text-brand-800 shadow-[0_5px_0_#cbd5e1] active:translate-y-[4px] active:shadow-none';
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-slate-200 p-4">
      {rows.map((row) => (
        <div key={row} className="flex gap-3">
          {row.split('').map((k) => (
            <button key={k} type="button" className={keyCls} onClick={() => add(k)}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div className="flex gap-3">
        {mode === 'email' ? (
          <>
            <button type="button" className={keyCls} onClick={() => add('@')}>@</button>
            <button type="button" className={`${keyCls} flex-[2]`} onClick={() => add('gmail.com')}>gmail.com</button>
            <button type="button" className={`${keyCls} flex-[2]`} onClick={() => add('hotmail.com')}>hotmail.com</button>
            <button type="button" className={`${keyCls} flex-[1.5]`} onClick={() => add('.com')}>.com</button>
            <button type="button" className={`${keyCls} flex-[1.5]`} onClick={() => add('.ec')}>.ec</button>
          </>
        ) : (
          <button type="button" className={`${keyCls} flex-[6]`} onClick={() => add(' ')}>
            espacio
          </button>
        )}
        <button
          type="button"
          className={`${keyCls} flex-[1.5] bg-slate-300`}
          onClick={() => {
            sounds.key();
            onChange(value.slice(0, -1));
          }}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

export function Spinner({ size = 160, color = '#10b5a3' }: { size?: number; color?: string }) {
  return (
    <div
      className="spin-slow rounded-full"
      style={{ width: size, height: size, border: `${size / 10}px solid #e2e8f0`, borderTopColor: color }}
    />
  );
}

export function Toast({ text, tone, onClose }: { text: string; tone: 'info' | 'warn' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [text, onClose]);
  const cls = tone === 'error' ? 'bg-red-600' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand-600';
  return (
    <div className={`fade-up shake absolute inset-x-14 bottom-[40px] z-50 rounded-[28px] px-10 py-8 text-[36px] font-semibold text-white shadow-2xl ${cls}`}>
      {text}
    </div>
  );
}
