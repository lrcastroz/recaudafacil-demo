# RecaudaFácil · Demo de tótems de recaudación (Ecuador)

Demo funcional de un sistema de recaudación para tótems de autoservicio que reciben **monedas, billetes y tarjetas de crédito/débito** para el pago de servicios básicos en Ecuador: luz (**CentroSur**, Cuenca), agua potable (**ETAPA EP**, Cuenca, y **EPMAPA-SD**, Santo Domingo) e internet (**ETAPA EP**, Cuenca, y **Yiga5**, Guayas y Santa Elena). El hardware se simula, pero el comportamiento imita al de un equipo real: validación de billetes con escrow, vuelto con inventario limitado, PIN pad EMV, impresora térmica y fallas típicas.

> Las empresas, cuentas, tarjetas y montos son ficticios. "RecaudaFácil" es una marca inventada para el demo.

## Requisitos

- Node.js 22.13 o superior; recomendado 24 (se usa el módulo integrado `node:sqlite`, sin dependencias nativas)
- npm 10 o superior

## Puesta en marcha

```bash
npm install
npm run dev
```

Abra http://localhost:5173. La base SQLite (`server/data/totems.db`) se crea con datos de demo la primera vez.

| URL | Uso |
|---|---|
| `/kiosk?mode=frame&totem=TOT-001` | Tótem completo con periféricos interactivos (presentación en laptop o proyector) |
| `/kiosk?mode=kiosk&totem=TOT-001` | Sólo la pantalla táctil, a pantalla completa (monitor táctil vertical, F11) |
| `/simulator?totem=TOT-001` | Panel del presentador: periféricos físicos e inyección de fallas desde otro dispositivo |
| `/pagos` | Portal web de pagos en línea con **botón de pagos** simulado (pasarela ficticia "PagoSeguro" con 3-D Secure) |
| `/admin` | Consola de recaudación (usuario `admin`, contraseña `admin123`) |

Tótems disponibles, todos en Cuenca: `TOT-001` (C.C. Río Tomebamba), `TOT-002` (Centro Histórico), `TOT-003` (El Arenal). Para agregar otra empresa o ciudad, edite `BILLERS` y `ACCOUNTS` en `server/src/seed.ts` y ejecute `npm run reset-db`; si un servicio tiene más de una empresa, el tótem muestra automáticamente la pantalla de selección. Vite escucha en la red local, así que el simulador se puede abrir desde una tablet con la IP del equipo.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor (puerto 4000) y frontend (puerto 5173) |
| `npm test` | Pruebas unitarias (dinero, cédula/RUC, vuelto, clave de acceso SRI) |
| `npm run smoke -w server` | Prueba end-to-end contra el servidor en ejecución: 6 escenarios del tótem y 3 del botón de pagos |
| `npm run typecheck` | Chequeo de tipos de servidor y frontend |
| `npm run reset-db` | Borra la base de datos; se regenera al iniciar |

## Despliegue (un solo servicio)

En producción, el servidor Express entrega también el frontend compilado (`web/dist`), así que el demo queda en una sola URL.

```bash
npm ci --include=dev
npm run build      # compila el frontend
npm start          # API + Socket.IO + frontend en $PORT (por defecto 4000)
```

Se necesita un host con **servidor persistente y WebSockets**. Vercel/Netlify Functions no sirven, porque el tótem mantiene estado en memoria y conexiones Socket.IO abiertas.

- **Render** (recomendado, plan gratuito): suba el repositorio a GitHub y en Render elija *New → Blueprint*. El archivo `render.yaml` configura el build, el arranque y el health check. En el plan gratuito el servicio se duerme tras unos 15 minutos sin uso (la primera carga tarda 30 a 50 s) y la base se regenera con datos de demo en cada reinicio.
- **Railway / Fly.io / cualquier host de contenedores**: use el `Dockerfile` incluido (escucha en el puerto 8080).
- **Base persistente** (opcional): monte un disco y defina `DB_PATH`, por ejemplo `/var/data/totems.db`.

> El acceso al panel administrador es sólo de demostración (admin / admin123). La API de administración no exige autenticación, así que cualquiera con la URL puede cambiar la configuración del demo.

## Arquitectura

```
packages/shared   Tipos, contrato de eventos, dinero, cédula/RUC, algoritmo de vuelto, clave SRI, tarjetas de prueba
server            Express + Socket.IO + SQLite (node:sqlite)
  src/totem/TotemController.ts   "DeviceHub": drivers virtuales y orquestación del cobro
  src/billers.ts                 Empresas mock: consulta de deuda y confirmación de pago
  src/transactions.ts            Transacciones, comprobante, factura electrónica (clave de acceso)
  src/routes/                    API del tótem y de administración
web               React + Vite + Tailwind
  src/kiosk/      Pantallas del tótem (lienzo 1080×1920) y máquina de estados (useKiosk)
  src/devices/    Periféricos simulados: billetera, PIN pad, ranuras, impresora, bandeja
  src/simulator/  Panel del presentador
  src/admin/      Consola de recaudación
```

La pantalla del tótem **no simula hardware**: envía comandos (`cash:start`, `card:start`...) y escucha eventos (`cash:update`, `card:update`, `tx:finished`...) igual que con drivers reales. Las acciones físicas (`physical:coin`, `physical:card`, `physical:pinKey`...) llegan desde el marco interactivo o desde el simulador. Para pasar a hardware real basta con reemplazar los drivers virtuales del `TotemController` (ccTalk para monedero/hopper, SSP o ID003 para billetero, SDK del PIN pad del adquirente) sin tocar la UI.

## Reglas de negocio implementadas

- Montos en centavos enteros (USD). Comisión configurable (por defecto $0,40) + IVA 15 % sólo sobre la comisión.
- Planillas pagadas en orden cronológico; saldo a favor aplicado automáticamente.
- Factura: consumidor final o cédula/RUC validados (módulo 10), con clave de acceso SRI de 49 dígitos (módulo 11).
- Efectivo: antes de apilar un billete o aceptar una moneda se verifica que exista vuelto; si no, se devuelve ("ingrese un billete de menor denominación"). Billetes de $2, $50 y $100 rechazados por defecto.
- Vuelto con inventario real del hopper y del reciclador (greedy y búsqueda de respaldo). Si el dispensador se atasca, lo no entregado queda como saldo a favor.
- Tarjeta: chip con PIN, contactless sin PIN hasta $50, banda rechazada para tarjetas con chip (regla EMV), 3 intentos de PIN, códigos ISO 8583 y reverso automático si la empresa no confirma.
- Cancelación o abandono (timeout, reinicio de la pantalla) devuelve el dinero ingresado.
- Botón de pagos (portal web, canal `WEB-001`):
  - El comercio crea una sesión de pago que expira en 15 minutos y redirige a la pasarela. La pasarela valida la tarjeta (Luhn, marca por BIN, vencimiento, CVV de 3 o 4 dígitos).
  - Mastercard y Amex exigen desafío 3-D Secure (OTP `123456`).
  - Se permiten 3 intentos antes de rechazar la sesión. El cliente puede cancelar y volver al comercio, y hay protección contra doble cobro.
  - El comprobante y la factura se registran igual que en el tótem.
- Consola: dashboard, transacciones con detalle y reverso manual, inventario por denominación, carga de cambio, reposición de papel, cierre de caja y configuración.

Guion paso a paso y cuentas de prueba: [docs/guion-demo.md](docs/guion-demo.md).
