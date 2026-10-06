import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@totem/shared';
import { BillerError } from './billers';
import { adminRoutes } from './routes/admin';
import { kioskRoutes } from './routes/kiosk';
import { ensureWebChannel, seedIfEmpty } from './seed';
import { onGatewayChange } from './gateway';
import { webRoutes } from './routes/web';
import { TotemHub } from './totem/hub';

const PORT = Number(process.env.PORT ?? 4000);

if (seedIfEmpty()) console.log('[db] Base de datos inicializada con datos de demo');
ensureWebChannel();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, { cors: { origin: '*' } });
const hub = new TotemHub(io);

// Express 4 no captura rechazos de handlers async: envolvemos cada router.
const asyncSafe = (router: express.Router) => {
  for (const layer of router.stack) {
    for (const l of layer.route?.stack ?? []) {
      const fn = l.handle;
      l.handle = (req: Request, res: Response, next: NextFunction) => {
        try {
          const r = fn(req, res, next);
          if (r && typeof r.catch === 'function') r.catch(next);
        } catch (e) {
          next(e);
        }
      };
    }
  }
  return router;
};

app.use('/api', asyncSafe(kioskRoutes(hub)));
app.use('/api', asyncSafe(webRoutes()));
onGatewayChange((reason) => io.to('admin').emit('admin:changed', { totemId: 'WEB-001', reason }));
app.use('/api/admin', asyncSafe(adminRoutes(hub)));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// En producción el mismo servidor entrega el frontend compilado (web/dist): una sola URL.
const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
  // Rutas del SPA (/kiosk, /simulator, /admin/...) devuelven index.html
  app.get(/^\/(?!api\/|socket\.io\/|assets\/).*/, (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
  console.log(`[server] Sirviendo frontend desde ${WEB_DIST}`);
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof BillerError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del sistema' });
});

const safeAck = async (ack: Ack | undefined, fn: () => unknown) => {
  try {
    await fn();
    ack?.({ ok: true });
  } catch (e) {
    ack?.({ ok: false, error: (e as Error).message });
  }
};

io.on('connection', (socket) => {
  let totemId: string | undefined;

  socket.on('join', ({ totemId: t, role }, ack) => {
    if (role === 'admin') {
      socket.join('admin');
      ack?.({ ok: true });
      return;
    }
    const c = hub.get(t);
    if (!c) {
      ack?.({ ok: false, error: `Tótem ${t} no registrado` });
      return;
    }
    totemId = t;
    socket.join(`totem:${t}`);
    if (role === 'kiosk') c.kioskJoined(socket.id);
    socket.emit('device:status', c.status);
    ack?.({ ok: true });
  });

  const ctrl = () => {
    const c = hub.get(totemId);
    if (!c) throw new Error('Socket no asociado a un tótem');
    return c;
  };

  // Comandos del tótem
  socket.on('cash:start', ({ txId }, ack) => safeAck(ack, () => ctrl().startCash(txId)));
  socket.on('cash:cancel', ({ txId }, ack) => safeAck(ack, () => ctrl().cancelCash(txId)));
  socket.on('card:start', ({ txId }, ack) => safeAck(ack, () => ctrl().startCard(txId)));
  socket.on('card:cancel', ({ txId }, ack) => safeAck(ack, () => ctrl().cancelCard(txId)));
  socket.on('session:reset', ({ txId }) => void safeAck(undefined, () => ctrl().resetSession(txId)));

  // Acciones físicas (simulador o marco interactivo)
  socket.on('physical:coin', ({ totemId: t, value }) => hub.get(t)?.insertCoin(value));
  socket.on('physical:bill', ({ totemId: t, value }) => hub.get(t)?.insertBill(value));
  socket.on('physical:card', ({ totemId: t, cardId, entry }) => void hub.get(t)?.presentCard(cardId, entry));
  socket.on('physical:removeCard', ({ totemId: t }) => hub.get(t)?.removeCard());
  socket.on('physical:pinKey', ({ totemId: t, key }) => void hub.get(t)?.pinKey(key));
  socket.on('physical:scan', ({ totemId: t, code }) => hub.get(t)?.scan(code));
  socket.on('physical:takeTray', ({ totemId: t }) => hub.get(t)?.takeTray());

  // Inyección de fallas
  socket.on('sim:faults', ({ totemId: t, faults }) => hub.get(t)?.setFaults(faults));
  socket.on('sim:fastMode', ({ totemId: t, enabled }) => hub.get(t)?.setFastMode(enabled));
  socket.on('sim:clearJam', ({ totemId: t }) => hub.get(t)?.clearJam());

  socket.on('disconnect', () => {
    if (totemId) hub.get(totemId)?.socketLeft(socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] API y Socket.IO escuchando en http://localhost:${PORT}`);
});
