/**
 * Comprobante para impresora térmica de 80 mm (42 columnas, fuente A)
 * y su versión PDF descargable.
 */
import PDFDocument from 'pdfkit';
import { SERVICE_LABELS, formatMoneyPlain, type PublicSettings, type TransactionSummary } from '@totem/shared';
import type { TotemRow } from './transactions';

const W = 42;

const center = (s: string) => {
  const t = s.slice(0, W);
  const pad = Math.floor((W - t.length) / 2);
  return ' '.repeat(pad) + t;
};
const line = (ch = '-') => ch.repeat(W);
const lr = (left: string, right: string) => {
  const space = W - left.length - right.length;
  return space >= 1 ? left + ' '.repeat(space) + right : `${left}\n${' '.repeat(W - right.length)}${right}`;
};
const wrap = (s: string) => {
  const out: string[] = [];
  let current = '';
  for (const word of s.split(' ')) {
    if (current && (current + ' ' + word).length > W) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out.join('\n');
};

const PERIOD_MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
export const periodLabel = (p: string) => {
  const [y, m] = p.split('-');
  return `${PERIOD_MONTHS[Number(m) - 1]}/${y}`;
};

function ecDate(iso: string) {
  return new Date(iso).toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const ENTRY_LABEL = { chip: 'CHIP', contactless: 'SIN CONTACTO', swipe: 'BANDA' } as const;

export function buildReceiptText(s: TransactionSummary, totem: TotemRow, settings: PublicSettings): string {
  const L: string[] = [];
  L.push(center(settings.companyName));
  L.push(center(`RUC ${settings.companyRuc}`));
  L.push(center('Red de recaudación de servicios'));
  L.push(center(totem.name));
  L.push(center(totem.city.toUpperCase()));
  L.push(line('='));
  L.push(center('COMPROBANTE DE PAGO'));
  L.push(line('='));
  L.push(lr('Fecha:', ecDate(s.updatedAt)));
  L.push(lr('Transacción:', s.id));
  L.push(lr('Tótem:', s.totemId));
  L.push(line());
  L.push(`Servicio: ${SERVICE_LABELS[s.service]}`);
  L.push(wrap(`Empresa: ${s.billerName}`));
  L.push(lr('Cuenta/Código:', s.identifier));
  L.push(lr('Titular:', s.holderMasked));
  L.push(line());
  for (const inv of s.invoices) L.push(lr(`Planilla ${periodLabel(inv.period)}`, formatMoneyPlain(inv.amount)));
  L.push(line());
  L.push(lr('Subtotal servicios', formatMoneyPlain(s.subtotal)));
  if (s.creditApplied > 0) L.push(lr('(-) Saldo a favor aplicado', formatMoneyPlain(s.creditApplied)));
  L.push(lr('Comisión recaudación', formatMoneyPlain(s.commission)));
  L.push(lr(`IVA ${settings.ivaRate}% comisión`, formatMoneyPlain(s.iva)));
  L.push(lr('TOTAL PAGADO', formatMoneyPlain(s.total)));
  L.push(line());
  if (s.method === 'EFECTIVO') {
    L.push('Forma de pago: EFECTIVO');
    L.push(lr('Recibido', formatMoneyPlain(s.cashIn)));
    L.push(lr('Vuelto entregado', formatMoneyPlain(s.changeGiven)));
    if (s.creditGenerated > 0) {
      L.push(lr('Saldo a favor generado', formatMoneyPlain(s.creditGenerated)));
      L.push(wrap('* Vuelto no entregado por falla del dispensador; acreditado como saldo a favor para su próximo pago.'));
    }
  } else if (s.card) {
    L.push(`Forma de pago: TARJETA ${s.card.brand}`);
    L.push(lr('Tarjeta', `**** **** **** ${s.card.last4}`));
    L.push(lr('Lectura', ENTRY_LABEL[s.card.entry]));
    L.push(lr('Autorización', s.card.authCode ?? '-'));
    L.push(lr('Lote / Ref.', `${s.card.batch ?? '-'} / ${s.card.reference ?? '-'}`));
    L.push('Pago corriente');
  }
  L.push(lr('Ref. empresa:', s.billerRef ?? '-'));
  L.push(line());
  L.push(center('FACTURA ELECTRÓNICA (COMISIÓN)'));
  L.push(lr('No.', s.receiptNumber ?? '-'));
  L.push(lr('Cliente:', s.billing.name.slice(0, 30)));
  L.push(lr('CI/RUC:', s.billing.id));
  L.push('Clave de acceso:');
  L.push(s.accessKey ?? '');
  if (s.billing.email) L.push(wrap(`Enviada a: ${s.billing.email}`));
  L.push(line());
  L.push(center('Conserve este comprobante.'));
  L.push(center('Su pago se refleja en la empresa'));
  L.push(center('en un máximo de 24 horas.'));
  L.push(center('¡Gracias por su pago!'));
  return L.join('\n');
}

/** PDF de 80 mm de ancho con el mismo contenido del ticket. */
export function receiptPdf(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const width = 226; // 80 mm en puntos
    const lines = text.split('\n');
    const lineHeight = 9.6;
    const height = 40 + lines.length * lineHeight + 50;
    const doc = new PDFDocument({ size: [width, height], margins: { top: 20, left: 8, right: 8, bottom: 10 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Courier').fontSize(7.9);
    for (const l of lines) doc.text(l, { lineBreak: false }).moveDown(0.15);
    // Código de barras decorativo con la clave de acceso
    const y = doc.y + 8;
    let x = 14;
    const key = lines.find((l) => /^\d{49}$/.test(l)) ?? '0';
    for (const ch of key) {
      const w = (Number(ch) % 3) + 1;
      doc.rect(x, y, w * 0.8, 28).fill('#000');
      x += w * 0.8 + 1.6;
      if (x > width - 14) break;
    }
    doc.end();
  });
}
