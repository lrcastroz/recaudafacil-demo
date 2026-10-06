import { Router } from 'express';
import type { PublicSettings } from '@totem/shared';
import { BillerError, listBillers } from '../billers';
import { all, get, nowIso, run, tx } from '../db';
import { emptyCashbox, getInventory, loadChange } from '../inventory';
import { getSettings, updateSettings } from '../settings';
import type { TotemHub } from '../totem/hub';
import { getSummary, listTotems, recordCashMovement, reversePaid } from '../transactions';

/** Ecuador continental: UTC-5 sin horario de verano */
const EC = "'-5 hours'";

function ecToday(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function adminRoutes(hub: TotemHub) {
  const r = Router();

  r.post('/login', (req, res) => {
    const { user, password } = req.body ?? {};
    if (user === 'admin' && password === 'admin123') {
      res.json({ ok: true, name: 'Supervisor Demo', token: 'demo-token' });
      return;
    }
    throw new BillerError(401, 'Usuario o contraseña incorrectos');
  });

  r.get('/dashboard', (req, res) => {
    const totem = req.query.totem ? String(req.query.totem) : null;
    const day = req.query.date ? String(req.query.date) : ecToday();
    const tf = totem ? 'AND t.totem_id = ?' : '';
    const p = (...rest: (string | number)[]) => (totem ? [...rest, totem] : rest);

    const today = get<{ total: number; count: number; commission: number; cash: number; card: number }>(
      `SELECT COALESCE(SUM(t.total),0) total, COUNT(*) count, COALESCE(SUM(t.commission + t.iva),0) commission,
         COALESCE(SUM(CASE WHEN t.method='EFECTIVO' THEN t.total END),0) cash,
         COALESCE(SUM(CASE WHEN t.method='TARJETA' THEN t.total END),0) card
       FROM transactions t WHERE t.status = 'PAGADA' AND date(t.created_at, ${EC}) = ? ${tf}`,
      ...p(day),
    )!;
    const statusCounts = all<{ status: string; n: number }>(
      `SELECT t.status, COUNT(*) n FROM transactions t WHERE date(t.created_at, ${EC}) = ? ${tf} GROUP BY t.status`,
      ...p(day),
    );
    const byService = all<{ service: string; total: number; count: number }>(
      `SELECT b.service, SUM(t.total) total, COUNT(*) count FROM transactions t JOIN billers b ON b.code = t.biller_code
       WHERE t.status = 'PAGADA' AND date(t.created_at, ${EC}) = ? ${tf} GROUP BY b.service ORDER BY total DESC`,
      ...p(day),
    );
    const byBiller = all<{ code: string; name: string; total: number; count: number; color: string }>(
      `SELECT b.code, b.short_name name, b.color, SUM(t.total) total, COUNT(*) count FROM transactions t JOIN billers b ON b.code = t.biller_code
       WHERE t.status = 'PAGADA' AND date(t.created_at, ${EC}) = ? ${tf} GROUP BY b.code ORDER BY total DESC`,
      ...p(day),
    );
    const byHour = all<{ hour: string; total: number; count: number }>(
      `SELECT strftime('%H', t.created_at, ${EC}) hour, SUM(t.total) total, COUNT(*) count FROM transactions t
       WHERE t.status = 'PAGADA' AND date(t.created_at, ${EC}) = ? ${tf} GROUP BY hour ORDER BY hour`,
      ...p(day),
    );
    const last7 = all<{ day: string; total: number; count: number }>(
      `SELECT date(t.created_at, ${EC}) day, SUM(t.total) total, COUNT(*) count FROM transactions t
       WHERE t.status = 'PAGADA' AND date(t.created_at, ${EC}) > date(?, '-7 days') AND date(t.created_at, ${EC}) <= ? ${tf}
       GROUP BY day ORDER BY day`,
      ...p(day, day),
    );
    const byTotem = all<{ totem_id: string; total: number; count: number }>(
      `SELECT t.totem_id, SUM(t.total) total, COUNT(*) count FROM transactions t
       WHERE t.status = 'PAGADA' AND date(t.created_at, ${EC}) = ? GROUP BY t.totem_id`,
      day,
    );
    res.json({ day, today, statusCounts, byService, byBiller, byHour, last7, byTotem });
  });

  r.get('/transactions', (req, res) => {
    const where: string[] = [];
    const params: (string | number)[] = [];
    const q = req.query;
    if (q.from) { where.push(`date(t.created_at, ${EC}) >= ?`); params.push(String(q.from)); }
    if (q.to) { where.push(`date(t.created_at, ${EC}) <= ?`); params.push(String(q.to)); }
    if (q.totem) { where.push('t.totem_id = ?'); params.push(String(q.totem)); }
    if (q.service) { where.push('b.service = ?'); params.push(String(q.service)); }
    if (q.status) { where.push('t.status = ?'); params.push(String(q.status)); }
    if (q.method) { where.push('t.method = ?'); params.push(String(q.method)); }
    if (q.q) {
      where.push('(t.id LIKE ? OR t.identifier LIKE ? OR t.receipt_number LIKE ?)');
      const like = `%${String(q.q)}%`;
      params.push(like, like, like);
    }
    const rows = all(
      `SELECT t.id, t.totem_id totemId, t.biller_code billerCode, b.short_name billerName, b.service, t.identifier,
         t.holder_masked holderMasked, t.total, t.method, t.status, t.receipt_number receiptNumber, t.created_at createdAt
       FROM transactions t JOIN billers b ON b.code = t.biller_code
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY t.created_at DESC LIMIT 300`,
      ...params,
    );
    res.json(rows);
  });

  r.get('/transactions/:id', (req, res) => {
    const s = getSummary(req.params.id);
    if (!s) throw new BillerError(404, 'Transacción no encontrada');
    const movements = all(
      'SELECT direction, kind, value, count, created_at createdAt FROM cash_movements WHERE tx_id = ? ORDER BY id',
      req.params.id,
    );
    const cardAttempts = all(
      'SELECT brand, last4, entry, response_code responseCode, auth_code authCode, status, created_at createdAt FROM card_authorizations WHERE tx_id = ? ORDER BY id',
      req.params.id,
    );
    const receipt = get<{ receipt_text: string | null }>('SELECT receipt_text FROM transactions WHERE id = ?', req.params.id);
    res.json({ ...s, movements, cardAttempts, receiptText: receipt?.receipt_text ?? null });
  });

  r.post('/transactions/:id/reverse', (req, res) => {
    const s = reversePaid(req.params.id, String(req.body?.reason || 'Reverso manual desde panel administrador'));
    hub.get(s.totemId)?.log('admin', `Transacción ${s.id} reversada manualmente`, 'warn');
    res.json(s);
  });

  r.get('/totems', (_req, res) => {
    const day = ecToday();
    res.json(
      listTotems().map((t) => {
        const c = hub.get(t.id)!;
        const todayStats = get<{ total: number; count: number }>(
          `SELECT COALESCE(SUM(total),0) total, COUNT(*) count FROM transactions WHERE totem_id = ? AND status = 'PAGADA' AND date(created_at, ${EC}) = ?`,
          t.id, day,
        )!;
        const lastClosure = get<{ created_at: string }>('SELECT created_at FROM cash_closures WHERE totem_id = ? ORDER BY id DESC LIMIT 1', t.id);
        return {
          id: t.id,
          name: t.name,
          city: t.city,
          location: t.location,
          status: c.status,
          inventory: getInventory(t.id),
          today: todayStats,
          lastClosure: lastClosure?.created_at ?? null,
        };
      }),
    );
  });

  r.get('/totems/:id/events', (req, res) => {
    res.json(
      all(
        'SELECT device, level, message, created_at createdAt FROM events_log WHERE totem_id = ? ORDER BY id DESC LIMIT 100',
        req.params.id,
      ),
    );
  });

  r.post('/totems/:id/load', (req, res) => {
    const c = hub.get(req.params.id);
    if (!c) throw new BillerError(404, 'Tótem no encontrado');
    if (c.busy) throw new BillerError(409, 'El tótem tiene un cobro en curso. Intente cuando esté libre.');
    const items: { kind: 'coin' | 'bill'; value: number; count: number }[] = req.body?.items ?? [];
    tx(() => {
      for (const it of items) {
        if (it.count <= 0) continue;
        const loaded = loadChange(c.totemId, it.kind, it.value, it.count);
        if (loaded > 0) recordCashMovement(c.totemId, null, 'LOAD', it.kind, it.value, loaded);
      }
    });
    c.log('admin', 'Carga de fondo de cambio registrada');
    c.pushStatus();
    res.json({ ok: true, inventory: getInventory(c.totemId) });
  });

  r.post('/totems/:id/paper', (req, res) => {
    const c = hub.get(req.params.id);
    if (!c) throw new BillerError(404, 'Tótem no encontrado');
    c.refillPaper();
    res.json({ ok: true });
  });

  /** Cierre de caja / arqueo: resume lo recaudado desde el último cierre y vacía la caja fuerte. */
  r.post('/totems/:id/closure', (req, res) => {
    const c = hub.get(req.params.id);
    if (!c) throw new BillerError(404, 'Tótem no encontrado');
    if (c.busy) throw new BillerError(409, 'El tótem tiene un cobro en curso. Intente cuando esté libre.');
    const result = tx(() => {
      const last = get<{ created_at: string }>('SELECT created_at FROM cash_closures WHERE totem_id = ? ORDER BY id DESC LIMIT 1', c.totemId);
      const from = last?.created_at ?? '1970-01-01T00:00:00.000Z';
      const sums = get<{ cash: number; card: number; n: number }>(
        `SELECT COALESCE(SUM(CASE WHEN method='EFECTIVO' THEN total END),0) cash,
                COALESCE(SUM(CASE WHEN method='TARJETA' THEN total END),0) card, COUNT(*) n
         FROM transactions WHERE totem_id = ? AND status = 'PAGADA' AND created_at > ?`,
        c.totemId, from,
      )!;
      const byBiller = all(
        `SELECT b.short_name name, COUNT(*) count, SUM(t.total) total FROM transactions t JOIN billers b ON b.code = t.biller_code
         WHERE t.totem_id = ? AND t.status = 'PAGADA' AND t.created_at > ? GROUP BY b.code ORDER BY total DESC`,
        c.totemId, from,
      );
      const withdrawn = emptyCashbox(c.totemId);
      for (const w of withdrawn) recordCashMovement(c.totemId, null, 'WITHDRAW', w.kind as 'coin' | 'bill', w.value, w.count);
      const withdrawnTotal = withdrawn.reduce((a, w) => a + w.value * w.count, 0);
      const createdAt = nowIso();
      const detail = { withdrawn, byBiller, hopper: getInventory(c.totemId).filter((i) => i.location !== 'cashbox') };
      const ins = run(
        `INSERT INTO cash_closures(totem_id, created_at, period_from, cash_collected, card_collected, withdrawn, tx_count, detail)
         VALUES (?,?,?,?,?,?,?,?)`,
        c.totemId, createdAt, from, sums.cash, sums.card, withdrawnTotal, sums.n, JSON.stringify(detail),
      );
      return { id: Number(ins.lastInsertRowid), totemId: c.totemId, createdAt, periodFrom: from, cashCollected: sums.cash, cardCollected: sums.card, withdrawn: withdrawnTotal, txCount: sums.n, detail };
    });
    c.log('admin', `Cierre de caja #${result.id}: retirados ${(result.withdrawn / 100).toFixed(2)} USD de la caja fuerte`);
    c.pushStatus();
    res.json(result);
  });

  r.get('/closures', (_req, res) => {
    res.json(
      all<{ detail: string }>(
        `SELECT id, totem_id totemId, created_at createdAt, period_from periodFrom, cash_collected cashCollected,
           card_collected cardCollected, withdrawn, tx_count txCount, detail FROM cash_closures ORDER BY id DESC LIMIT 50`,
      ).map((c) => ({ ...c, detail: JSON.parse(c.detail) })),
    );
  });

  r.get('/settings', (_req, res) => res.json({ settings: getSettings(), billers: listBillers(true) }));

  r.put('/settings', (req, res) => {
    const patch = req.body as Partial<PublicSettings>;
    const s = updateSettings(patch);
    if (typeof patch.fastMode === 'boolean') for (const c of hub.all()) c.setFastMode(patch.fastMode);
    res.json(s);
  });

  r.put('/billers/:code', (req, res) => {
    run('UPDATE billers SET active = ? WHERE code = ?', req.body?.active ? 1 : 0, req.params.code);
    res.json(listBillers(true));
  });

  return r;
}
