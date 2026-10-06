/**
 * Pasarela de pagos simulada "PagoSeguro" (marca ficticia).
 * Página alojada por la pasarela: el comercio nunca ve los datos de la tarjeta.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TEST_CARDS, TEST_OTP, detectBrand, type CardBrand } from '@totem/shared';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';

interface SessionInfo {
  id: string;
  status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' | 'EXPIRADA';
  merchant: string;
  merchantRuc: string;
  description: string;
  reference: string;
  amount: number;
  breakdown: { subtotal: number; creditApplied: number; commission: number; iva: number };
  email: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  returnUrl: string;
}

type Result =
  | { status: 'approved'; redirectUrl: string; authCode: string }
  | { status: 'declined'; code: string; message: string; attemptsLeft: number }
  | { status: 'failed'; code: string; message: string; redirectUrl: string }
  | { status: 'challenge'; bank: string; phoneMasked: string; brand: CardBrand; error?: string; attemptsLeft?: number };

const BRAND_BG: Record<CardBrand | 'NONE', string> = {
  VISA: 'linear-gradient(135deg,#1a3a8f,#2f6fd6)',
  MASTERCARD: 'linear-gradient(135deg,#1f1f1f,#4b4b4b)',
  AMEX: 'linear-gradient(135deg,#0e7490,#38bdf8)',
  DINERS: 'linear-gradient(135deg,#55606b,#a9b4bf)',
  DISCOVER: 'linear-gradient(135deg,#9a3412,#fb923c)',
  NONE: 'linear-gradient(135deg,#334155,#64748b)',
};

/** Agrupa el número como se imprime en la tarjeta (Amex 4-6-5, resto 4-4-4-4). */
function formatPan(raw: string) {
  const n = raw.replace(/\D/g, '').slice(0, 19);
  if (detectBrand(n) === 'AMEX') return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(' ');
  return n.replace(/(.{4})/g, '$1 ').trim();
}

export function GatewayPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [exp, setExp] = useState('');
  const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Extract<Result, { status: 'challenge' }> | null>(null);
  const [otp, setOtp] = useState('');
  const [done, setDone] = useState<{ ok: boolean; title: string; message: string; redirectUrl: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.get<SessionInfo>(`/gateway/sessions/${sessionId}`).then(setSession).catch((e) => setLoadError((e as Error).message));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sessionId]);

  // Retorno automático al comercio tras finalizar
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate(done.redirectUrl), done.ok ? 2500 : 4000);
    return () => clearTimeout(t);
  }, [done, navigate]);

  const brand = detectBrand(number);
  const digits = number.replace(/\D/g, '');
  const cvvLen = brand === 'AMEX' ? 4 : 3;
  const [mm, yy] = exp.split('/');
  const formValid = !!brand && digits.length >= 14 && holder.trim().length >= 3 && /^\d{2}\/\d{2}$/.test(exp) && Number(mm) >= 1 && Number(mm) <= 12 && cvv.length === cvvLen;

  const handle = (r: Result) => {
    setBusy(null);
    if (r.status === 'challenge') {
      setChallenge(r);
      setOtp('');
      setError(r.error ? `${r.error}. Le quedan ${r.attemptsLeft} intento(s).` : null);
      return;
    }
    setChallenge(null);
    if (r.status === 'approved') {
      setDone({ ok: true, title: 'Pago aprobado', message: `Código de autorización ${r.authCode}. Volviendo al comercio...`, redirectUrl: r.redirectUrl });
    } else if (r.status === 'failed') {
      setDone({ ok: false, title: 'Pago rechazado', message: `${r.message} (código ${r.code}). Se alcanzó el máximo de intentos. Volviendo al comercio...`, redirectUrl: r.redirectUrl });
    } else {
      setError(`${r.message} (código ${r.code}). Puede intentar con otra tarjeta: le quedan ${r.attemptsLeft} intento(s).`);
      setCvv('');
      api.get<SessionInfo>(`/gateway/sessions/${sessionId}`).then(setSession).catch(() => undefined);
    }
  };

  const submit = async () => {
    setError(null);
    setBusy('Procesando su pago con el banco emisor...');
    try {
      handle(await api.post<Result>(`/gateway/sessions/${sessionId}/pay`, { number: digits, holder, expMonth: mm, expYear: yy, cvv }));
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  };

  const submitOtp = async () => {
    setBusy('Verificando código...');
    try {
      handle(await api.post<Result>(`/gateway/sessions/${sessionId}/3ds`, { otp }));
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  };

  const cancel = async () => {
    try {
      const r = await api.post<{ redirectUrl: string }>(`/gateway/sessions/${sessionId}/cancel`, {});
      navigate(r.redirectUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const fill = (n: string, b: CardBrand, h: string) => {
    setNumber(formatPan(n));
    setHolder(h);
    setExp('12/30');
    setCvv(b === 'AMEX' ? '1234' : '123');
    setError(null);
  };

  const remaining = session ? Math.max(0, new Date(session.expiresAt).getTime() - now) : 0;
  const mmss = `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div className="min-h-full bg-[#eef1f6] text-slate-800">
      <div className="bg-amber-400 py-1 text-center text-[11px] font-bold tracking-wider text-amber-950">AMBIENTE DE PRUEBAS · NO SE REALIZAN COBROS REALES</div>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-white">🔒</span>
            <span className="text-lg font-black tracking-tight text-indigo-700">
              Pago<span className="text-slate-800">Seguro</span>
            </span>
          </div>
          <span className="text-[11px] text-slate-500">Conexión cifrada · PCI DSS · 3-D Secure</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {loadError && <Box tone="error">{loadError}</Box>}
        {session && session.status !== 'PENDIENTE' && !done && (
          <Box tone="warn">
            {session.status === 'EXPIRADA' ? 'La sesión de pago expiró.' : session.status === 'APROBADA' ? 'Este pago ya fue aprobado.' : 'Esta sesión de pago ya fue finalizada.'}{' '}
            <Link to={session.returnUrl} className="font-semibold underline">Volver al comercio</Link>
          </Box>
        )}

        {session && (
          <div className="grid gap-5 md:grid-cols-[280px_1fr]">
            <aside className="h-fit rounded-2xl bg-white p-5 text-sm shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Comercio</div>
              <div className="font-bold text-slate-800">{session.merchant}</div>
              <div className="text-xs text-slate-500">RUC {session.merchantRuc}</div>
              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Detalle</div>
              <div className="text-slate-700">{session.description}</div>
              <div className="text-xs text-slate-500">Ref. {session.reference}</div>
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs">
                <Line label="Planillas" value={formatMoney(session.breakdown.subtotal - session.breakdown.creditApplied)} />
                <Line label="Comisión + IVA" value={formatMoney(session.breakdown.commission + session.breakdown.iva)} />
              </div>
              <div className="mt-2 flex items-end justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500">Total</span>
                <span className="text-2xl font-black tabular-nums text-indigo-700">{formatMoney(session.amount)}</span>
              </div>
              {session.status === 'PENDIENTE' && (
                <div className={`mt-4 rounded-lg px-3 py-2 text-center text-xs ${remaining < 120000 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'}`}>
                  La sesión expira en <b className="tabular-nums">{mmss}</b>
                </div>
              )}
            </aside>

            <section className="rounded-2xl bg-white p-5 shadow-sm">
              {done ? (
                <div className="py-10 text-center">
                  <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-4xl ${done.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>{done.ok ? '✓' : '✕'}</div>
                  <h2 className="mt-4 text-xl font-black">{done.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{done.message}</p>
                  <Link to={done.redirectUrl} className="mt-4 inline-block text-sm font-semibold text-indigo-700 underline">Volver al comercio ahora</Link>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                  className={session.status !== 'PENDIENTE' ? 'pointer-events-none opacity-40' : ''}
                >
                  <h2 className="mb-4 font-bold text-slate-700">Pague con tarjeta de crédito o débito</h2>

                  {/* Vista previa de la tarjeta */}
                  <div className="mx-auto mb-5 h-[150px] w-[250px] rounded-2xl p-4 text-white shadow-lg transition-all" style={{ background: BRAND_BG[brand ?? 'NONE'] }}>
                    <div className="flex items-start justify-between">
                      <div className="h-6 w-9 rounded bg-amber-300/90" />
                      <span className="text-sm font-black italic">{brand ?? ''}</span>
                    </div>
                    <div className="mt-6 font-mono text-[15px] tracking-wider">{number || '•••• •••• •••• ••••'}</div>
                    <div className="mt-3 flex justify-between text-[10px] uppercase">
                      <span className="truncate pr-2">{holder || 'NOMBRE DEL TITULAR'}</span>
                      <span>{exp || 'MM/AA'}</span>
                    </div>
                  </div>

                  {error && <Box tone="error">{error}</Box>}

                  <label className="block text-xs font-semibold text-slate-600">
                    Número de tarjeta
                    <input
                      inputMode="numeric"
                      autoComplete="cc-number"
                      value={number}
                      onChange={(e) => setNumber(formatPan(e.target.value))}
                      placeholder="1234 5678 9012 3456"
                      className={inputCls}
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">
                    Nombre del titular
                    <input autoComplete="cc-name" value={holder} onChange={(e) => setHolder(e.target.value.toUpperCase())} placeholder="Como aparece en la tarjeta" className={inputCls} />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block text-xs font-semibold text-slate-600">
                      Expiración
                      <input
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        value={exp}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                        }}
                        placeholder="MM/AA"
                        className={inputCls}
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-600">
                      CVV
                      <input
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        type="password"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, cvvLen))}
                        placeholder={'•'.repeat(cvvLen)}
                        className={inputCls}
                      />
                    </label>
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">
                    Forma de pago
                    <select disabled className={`${inputCls} bg-slate-50 text-slate-500`}>
                      <option>Corriente (sin diferir)</option>
                    </select>
                  </label>

                  <button type="submit" disabled={!formValid || !!busy || session.status !== 'PENDIENTE'} className="mt-5 w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-500 disabled:opacity-40">
                    Pagar {formatMoney(session.amount)}
                  </button>
                  <button type="button" onClick={() => void cancel()} disabled={!!busy} className="mt-2 w-full py-2 text-sm text-slate-500 hover:text-slate-800">
                    Cancelar y volver al comercio
                  </button>
                  {session.attempts > 0 && (
                    <p className="text-center text-[11px] text-slate-400">
                      Intentos rechazados: {session.attempts} de {session.maxAttempts}
                    </p>
                  )}

                  <TestCardsHelp onPick={fill} />
                </form>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Desafío 3-D Secure: página del banco emisor */}
      {challenge && !done && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitOtp();
            }}
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
              <span className="font-bold">{challenge.bank}</span>
              <span className="text-[11px] text-white/70">{challenge.brand === 'AMEX' ? 'SafeKey' : 'Identity Check'}</span>
            </div>
            <div className="p-5">
              <h3 className="font-bold text-slate-800">Verificación de seguridad</h3>
              <p className="mt-1 text-sm text-slate-600">
                Enviamos un código de 6 dígitos por SMS al número {challenge.phoneMasked}. Ingréselo para autorizar el pago de{' '}
                <b>{session && formatMoney(session.amount)}</b> en {session?.merchant.replace(/\.$/, '')}.
              </p>
              {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <input
                autoFocus
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-indigo-500"
                placeholder="••••••"
              />
              <p className="mt-1 text-center text-[11px] text-amber-700">Código de prueba: {TEST_OTP}</p>
              <button type="submit" disabled={otp.length !== 6 || !!busy} className="mt-4 w-full rounded-xl bg-slate-800 py-2.5 font-semibold text-white disabled:opacity-40">
                Confirmar
              </button>
              <button type="button" onClick={() => void cancel()} disabled={!!busy} className="mt-2 w-full py-1.5 text-sm text-slate-500">
                Cancelar pago
              </button>
            </div>
          </form>
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white/80">
          <div className="text-center">
            <div className="spin-slow mx-auto h-14 w-14 rounded-full border-[6px] border-slate-200 border-t-indigo-600" />
            <p className="mt-3 font-semibold text-slate-700">{busy}</p>
            <p className="text-xs text-slate-500">No cierre ni actualice esta ventana</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TestCardsHelp({ onPick }: { onPick: (n: string, b: CardBrand, h: string) => void }) {
  return (
    <details className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
      <summary className="cursor-pointer font-semibold">Tarjetas de prueba</summary>
      <p className="mt-1 text-amber-800">
        Mastercard y Amex piden verificación 3-D Secure (código {TEST_OTP}). Cualquier otra tarjeta válida se aprueba; una fecha vencida se rechaza con código 54.
      </p>
      <div className="mt-2 grid gap-1">
        {TEST_CARDS.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c.number, c.brand, c.holder)} className="flex justify-between rounded-lg bg-white px-2 py-1 text-left hover:bg-amber-100">
            <span>
              <b>{c.brand}</b> <span className="font-mono">•••• {c.number.slice(-4)}</span>
            </span>
            <span className="text-amber-700">{c.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-500">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Box({ tone, children }: { tone: 'error' | 'warn'; children: React.ReactNode }) {
  return <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{children}</div>;
}

const inputCls = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base font-normal text-slate-800 outline-none focus:border-indigo-500';
