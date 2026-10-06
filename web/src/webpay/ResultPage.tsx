/** Página de retorno del comercio después del botón de pagos. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { TransactionSummary } from '@totem/shared';
import { api } from '../lib/api';
import { ecDateTime, formatMoney, periodName } from '../lib/format';
import { Alert, WebShell, btnGhost, btnPrimary } from './WebPayPage';

const STATUS_VIEW: Record<string, { icon: string; title: string; cls: string }> = {
  PAGADA: { icon: '✓', title: '¡Pago exitoso!', cls: 'bg-emerald-100 text-emerald-600' },
  CANCELADA: { icon: '↩', title: 'Pago cancelado', cls: 'bg-slate-200 text-slate-600' },
  FALLIDA: { icon: '✕', title: 'Pago no realizado', cls: 'bg-red-100 text-red-600' },
  REVERSADA: { icon: '⟲', title: 'Pago reversado', cls: 'bg-amber-100 text-amber-600' },
  INICIADA: { icon: '…', title: 'Pago pendiente', cls: 'bg-sky-100 text-sky-600' },
};

export function ResultPage() {
  const { txId = '' } = useParams();
  const [tx, setTx] = useState<TransactionSummary | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TransactionSummary>(`/transactions/${txId}`)
      .then((t) => {
        setTx(t);
        if (t.status === 'PAGADA') api.get<{ text: string }>(`/receipts/${txId}`).then((r) => setReceipt(r.text)).catch(() => undefined);
      })
      .catch((e) => setError((e as Error).message));
  }, [txId]);

  if (error) return <WebShell><Alert>{error}</Alert></WebShell>;
  if (!tx) return <WebShell><p className="text-slate-500">Cargando...</p></WebShell>;

  const v = STATUS_VIEW[tx.status] ?? STATUS_VIEW.INICIADA;
  const paid = tx.status === 'PAGADA';

  return (
    <WebShell>
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-4xl font-black ${v.cls}`}>{v.icon}</div>
          <h1 className="mt-3 text-2xl font-black text-brand-800">{v.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {paid
              ? `Su pago a ${tx.billerName} fue registrado. Enviamos el comprobante y la factura electrónica a ${tx.billing.email}.`
              : tx.message ?? 'No se realizó ningún cobro a su tarjeta.'}
          </p>
          {!paid && <p className="mt-1 text-xs text-slate-400">No se realizó ningún débito a su tarjeta.</p>}
        </div>

        <div className="mt-4 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200">
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5">
            <dt className="text-slate-500">Empresa</dt>
            <dd>{tx.billerName}</dd>
            <dt className="text-slate-500">Cuenta</dt>
            <dd className="font-mono">{tx.identifier} · {tx.holderMasked}</dd>
            <dt className="text-slate-500">Planillas</dt>
            <dd>{tx.invoices.map((i) => periodName(i.period)).join(', ')}</dd>
            <dt className="text-slate-500">Total</dt>
            <dd className="font-black text-brand-800">{formatMoney(tx.total)}</dd>
            {tx.card && (
              <>
                <dt className="text-slate-500">Tarjeta</dt>
                <dd>{tx.card.brand} •••• {tx.card.last4}{tx.card.authCode ? ` · Aut. ${tx.card.authCode}` : ''}</dd>
              </>
            )}
            {paid && (
              <>
                <dt className="text-slate-500">Comprobante</dt>
                <dd className="font-mono">{tx.receiptNumber}</dd>
                <dt className="text-slate-500">Ref. empresa</dt>
                <dd className="font-mono">{tx.billerRef}</dd>
              </>
            )}
            <dt className="text-slate-500">Fecha</dt>
            <dd>{ecDateTime(tx.updatedAt)}</dd>
            <dt className="text-slate-500">Transacción</dt>
            <dd className="font-mono">{tx.id}</dd>
          </dl>
          {receipt && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">Ver comprobante</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-[14px]">{receipt}</pre>
            </details>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {paid && (
            <a href={`/api/receipts/${tx.id}.pdf`} target="_blank" rel="noreferrer" className={btnGhost}>
              Descargar PDF
            </a>
          )}
          <Link to="/pagos" className={btnPrimary}>
            {paid ? 'Pagar otro servicio' : 'Intentar nuevamente'}
          </Link>
        </div>
      </div>
    </WebShell>
  );
}
