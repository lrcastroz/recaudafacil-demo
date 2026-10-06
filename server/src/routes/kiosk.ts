import { Router } from 'express';
import { TEST_CARDS, TEST_PIN } from '@totem/shared';
import { BillerError, inquiry, listBillers } from '../billers';
import { receiptPdf } from '../receipt';
import { demoAccounts } from '../seed';
import { getSettings } from '../settings';
import type { TotemHub } from '../totem/hub';
import { createTransaction, getReceiptText, getSummary, getTotem } from '../transactions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function kioskRoutes(hub: TotemHub) {
  const r = Router();

  r.get('/config', (req, res) => {
    const totemId = String(req.query.totem ?? 'TOT-001');
    const totem = getTotem(totemId);
    if (!totem) throw new BillerError(404, `Tótem ${totemId} no registrado`);
    res.json({
      totem: {
        id: totem.id,
        name: totem.name,
        city: totem.city,
        location: totem.location,
        establishment: totem.establishment,
        emissionPoint: totem.emission_point,
      },
      settings: getSettings(),
      billers: listBillers(),
    });
  });

  r.get('/demo-data', (_req, res) => {
    res.json({ accounts: demoAccounts(), cards: TEST_CARDS, pin: TEST_PIN });
  });

  r.post('/inquiry', async (req, res) => {
    const { totemId, billerCode, identifier } = req.body ?? {};
    const fast = hub.get(totemId)?.status.fastMode;
    await sleep(fast ? 350 : 1300); // latencia típica del switch de recaudación
    hub.get(totemId)?.log('switch', `Consulta ${billerCode} ${identifier}`);
    res.json(inquiry(String(billerCode), String(identifier ?? '').trim()));
  });

  r.post('/transactions', (req, res) => {
    const { totemId, billerCode, identifier, invoiceIds, billing } = req.body ?? {};
    const tx = createTransaction({
      totemId: String(totemId),
      billerCode: String(billerCode),
      identifier: String(identifier),
      invoiceIds: Array.isArray(invoiceIds) ? invoiceIds.map(Number) : [],
      billing,
    });
    hub.get(tx.totemId)?.log('sistema', `Transacción ${tx.id} creada por ${tx.total / 100} USD`);
    res.status(201).json(tx);
  });

  r.get('/transactions/:id', (req, res) => {
    const tx = getSummary(req.params.id);
    if (!tx) throw new BillerError(404, 'Transacción no encontrada');
    res.json(tx);
  });

  r.get('/receipts/:id.pdf', async (req, res) => {
    const text = getReceiptText(req.params.id);
    if (!text) throw new BillerError(404, 'Comprobante no disponible');
    const pdf = await receiptPdf(text);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comprobante-${req.params.id}.pdf"`);
    res.send(pdf);
  });

  r.get('/receipts/:id', (req, res) => {
    const text = getReceiptText(req.params.id);
    if (!text) throw new BillerError(404, 'Comprobante no disponible');
    res.json({ txId: req.params.id, text });
  });

  return r;
}
