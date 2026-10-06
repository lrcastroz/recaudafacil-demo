import { Router } from 'express';
import { cancel, createCheckout, pay, sessionInfo, verify3ds } from '../gateway';

/** Portal web del comercio (checkout) y API de la pasarela simulada. */
export function webRoutes() {
  const r = Router();

  // Comercio: crea transacción + sesión de pago y devuelve la URL de la pasarela
  r.post('/web/checkout', (req, res) => {
    const { billerCode, identifier, invoiceIds, billing } = req.body ?? {};
    const out = createCheckout({
      billerCode: String(billerCode),
      identifier: String(identifier),
      invoiceIds: Array.isArray(invoiceIds) ? invoiceIds.map(Number) : [],
      billing,
    });
    res.status(201).json({ sessionId: out.sessionId, checkoutUrl: out.checkoutUrl, txId: out.transaction.id });
  });

  // Pasarela
  r.get('/gateway/sessions/:id', (req, res) => res.json(sessionInfo(req.params.id)));
  r.post('/gateway/sessions/:id/pay', async (req, res) => res.json(await pay(req.params.id, req.body ?? {})));
  r.post('/gateway/sessions/:id/3ds', async (req, res) => res.json(await verify3ds(req.params.id, String(req.body?.otp ?? ''))));
  r.post('/gateway/sessions/:id/cancel', (req, res) => res.json(cancel(req.params.id)));

  return r;
}
