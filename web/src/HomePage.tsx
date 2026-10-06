import { Link } from 'react-router-dom';

const ENTRIES = [
  {
    to: '/kiosk?mode=frame&totem=TOT-001',
    icon: '🏧',
    title: 'Tótem interactivo',
    desc: 'Tótem completo con pantalla, monedero, billetero, PIN pad, impresora y bandeja de vuelto. Ideal para presentar desde una laptop o proyector.',
    cta: 'Abrir modo presentación',
  },
  {
    to: '/kiosk?mode=kiosk&totem=TOT-001',
    icon: '🖥',
    title: 'Pantalla de kiosko',
    desc: 'Sólo la pantalla táctil a pantalla completa (F11), para un monitor táctil vertical. Los periféricos se operan desde el simulador.',
    cta: 'Abrir pantalla completa',
  },
  {
    to: '/simulator?totem=TOT-001',
    icon: '🎛',
    title: 'Simulador de periféricos',
    desc: 'Panel del presentador: insertar monedas y billetes, presentar tarjetas, escanear planillas e inyectar fallas desde otro dispositivo.',
    cta: 'Abrir simulador',
  },
  {
    to: '/pagos',
    icon: '🌐',
    title: 'Pagos en línea (botón de pagos)',
    desc: 'Portal web para pagar los mismos servicios desde el celular o la computadora, con redirección a una pasarela simulada: tarjeta, 3-D Secure y retorno al comercio.',
    cta: 'Abrir portal de pagos',
  },
  {
    to: '/admin',
    icon: '📊',
    title: 'Panel administrador',
    desc: 'Recaudación en tiempo real, transacciones, estado de tótems y efectivo, cierre de caja y configuración. Usuario admin / admin123.',
    cta: 'Ingresar',
  },
];

export function HomePage() {
  return (
    <div className="min-h-full bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-500 text-3xl font-black">$</div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              Recauda<span className="text-accent-400">Fácil</span> · Demo de tótems de recaudación
            </h1>
            <p className="text-white/70">Pago de servicios básicos (luz CentroSur, agua ETAPA EP y EPMAPA-SD, internet ETAPA EP y Yiga5) con monedas, billetes y tarjeta.</p>
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {ENTRIES.map((e) => (
            <Link key={e.to} to={e.to} className="group flex flex-col rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 transition hover:bg-white/10 hover:ring-accent-400">
              <div className="text-4xl">{e.icon}</div>
              <h2 className="mt-3 text-xl font-bold">{e.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-white/70">{e.desc}</p>
              <span className="mt-4 font-semibold text-accent-400 group-hover:underline">{e.cta} →</span>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-white/5 p-6 text-sm leading-relaxed text-white/80 ring-1 ring-white/10">
          <h3 className="mb-2 text-base font-bold text-white">Guion rápido</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra el tótem interactivo y toque la pantalla. Elija <b>Luz</b> (CentroSur).</li>
            <li>Digite el CUEN <b>0195063866</b>, o en la billetera, pestaña <b>Planillas</b>, pulse <b>Escanear</b> en una cuenta de CentroSur.</li>
            <li>Continúe hasta el medio de pago. En <b>Efectivo</b>, inserte un billete de $20 y observe el vuelto en la bandeja.</li>
            <li>En <b>Tarjeta</b>, use <b>Insertar</b> y digite el PIN <b>1234</b> en el PIN pad; luego retire la tarjeta.</li>
            <li>Active fallas (empresa caída, sin vuelto, sin papel...) en el panel derecho para mostrar el manejo de errores.</li>
            <li>Revise la transacción en el panel administrador y realice un cierre de caja.</li>
          </ol>
          <p className="mt-3 text-white/60">Tótems en Cuenca: TOT-001 (C.C. Río Tomebamba), TOT-002 (Centro Histórico), TOT-003 (El Arenal) — cambie el parámetro <code>totem</code> en la URL.</p>
        </div>
      </div>
    </div>
  );
}
