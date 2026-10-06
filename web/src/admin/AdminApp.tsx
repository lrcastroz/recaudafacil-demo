import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { DeviceStatus } from '@totem/shared';
import { api } from '../lib/api';
import { useTotemSocket } from '../lib/socket';
import { Dashboard } from './Dashboard';
import { Transactions } from './Transactions';
import { Totems } from './Totems';
import { Closures } from './Closures';
import { SettingsPage } from './SettingsPage';

interface Live {
  /** Se incrementa con cada cambio relevante (transacción, carga, cierre...) para refrescar vistas */
  version: number;
  devices: Record<string, DeviceStatus>;
}

const LiveContext = createContext<Live>({ version: 0, devices: {} });
export const useLive = () => useContext(LiveContext);

const SESSION_KEY = 'totem-admin-session';

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function AdminApp() {
  const [user, setUser] = useState<string | null>(readSession);
  if (!user) return <Login onLogin={setUser} />;
  return <AdminShell user={user} onLogout={() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* sin almacenamiento */ }
    setUser(null);
  }} />;
}

function AdminShell({ user, onLogout }: { user: string; onLogout: () => void }) {
  const { socket, connected } = useTotemSocket('admin');
  const [version, setVersion] = useState(0);
  const [devices, setDevices] = useState<Record<string, DeviceStatus>>({});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      // Agrupa ráfagas de eventos en un solo refresco
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setVersion((v) => v + 1);
      }, 400);
    };
    const onStatus = (s: DeviceStatus) => setDevices((d) => ({ ...d, [s.totemId]: s }));
    socket.on('admin:changed', bump);
    socket.on('device:status', onStatus);
    return () => {
      socket.off('admin:changed', bump);
      socket.off('device:status', onStatus);
      if (timer) clearTimeout(timer);
    };
  }, [socket]);

  const live = useMemo(() => ({ version, devices }), [version, devices]);
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`;

  return (
    <LiveContext.Provider value={live}>
      <div className="flex h-full bg-slate-100 text-slate-800">
        <nav className="hidden w-[220px] shrink-0 flex-col bg-brand-800 p-4 md:flex">
          <div className="mb-8 flex items-center gap-2 px-1 text-white">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-500 text-lg font-black">$</div>
            <div className="leading-tight">
              <div className="font-black">
                Recauda<span className="text-accent-400">Fácil</span>
              </div>
              <div className="text-[11px] text-white/60">Consola de recaudación</div>
            </div>
          </div>
          <div className="space-y-1">
            <NavLink to="/admin" end className={link}>📊 Dashboard</NavLink>
            <NavLink to="/admin/transacciones" className={link}>🧾 Transacciones</NavLink>
            <NavLink to="/admin/totems" className={link}>🏧 Tótems y efectivo</NavLink>
            <NavLink to="/admin/cierres" className={link}>🔐 Cierres de caja</NavLink>
            <NavLink to="/admin/configuracion" className={link}>⚙ Configuración</NavLink>
          </div>
          <div className="mt-auto space-y-2 text-[12px] text-white/70">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {connected ? 'Tiempo real activo' : 'Sin conexión'}
            </div>
            <div>{user}</div>
            <button type="button" onClick={onLogout} className="text-white/60 underline hover:text-white">
              Cerrar sesión
            </button>
          </div>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Navegación compacta para pantallas angostas */}
          <div className="flex gap-1 overflow-x-auto bg-brand-800 p-2 md:hidden">
            {[['/admin', 'Dashboard'], ['/admin/transacciones', 'Transacciones'], ['/admin/totems', 'Tótems'], ['/admin/cierres', 'Cierres'], ['/admin/configuracion', 'Config.']].map(([to, l]) => (
              <NavLink key={to} to={to} end={to === '/admin'} className={link}>{l}</NavLink>
            ))}
          </div>
          <div className="mx-auto max-w-7xl p-4 md:p-6">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="transacciones" element={<Transactions />} />
              <Route path="totems" element={<Totems />} />
              <Route path="cierres" element={<Closures />} />
              <Route path="configuracion" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </LiveContext.Provider>
  );
}

function Login({ onLogin }: { onLogin: (name: string) => void }) {
  const [user, setUser] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ name: string }>('/admin/login', { user, password });
      try { sessionStorage.setItem(SESSION_KEY, r.name); } catch { /* sin almacenamiento */ }
      onLogin(r.name);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="grid h-full place-items-center bg-gradient-to-br from-brand-900 to-brand-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-500 text-xl font-black text-white">$</div>
          <div>
            <div className="text-lg font-black text-brand-800">Consola de recaudación</div>
            <div className="text-xs text-slate-500">Acceso de supervisores</div>
          </div>
        </div>
        <label className="mb-1 block text-xs font-semibold text-slate-600">Usuario</label>
        <input value={user} onChange={(e) => setUser(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500" />
        <label className="mb-1 block text-xs font-semibold text-slate-600">Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500" placeholder="admin123" autoFocus />
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button type="submit" className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-500">
          Ingresar
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">Demo: admin / admin123</p>
      </form>
    </div>
  );
}

/* ---------- Componentes compartidos del panel ---------- */

export function Card({ title, children, actions, className = '' }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-brand-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export const STATUS_BADGE: Record<string, string> = {
  PAGADA: 'bg-emerald-100 text-emerald-800',
  INICIADA: 'bg-sky-100 text-sky-800',
  CANCELADA: 'bg-slate-200 text-slate-700',
  FALLIDA: 'bg-red-100 text-red-800',
  REVERSADA: 'bg-amber-100 text-amber-800',
};

export const STATUS_ICON: Record<string, string> = {
  PAGADA: '✓',
  INICIADA: '…',
  CANCELADA: '↩',
  FALLIDA: '✕',
  REVERSADA: '⟲',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[status] ?? 'bg-slate-100'}`}>
      {STATUS_ICON[status]} {status}
    </span>
  );
}

export const inputCls = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500';
export const btnCls = 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50';
export const btnGhostCls = 'rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50';
