const crypto = require('crypto');
const { sql, ensureSchema, audit } = require('./_db');
const { requireAdmin } = require('./_admin-auth');
const { STEPS, json, dateOnly, isPaid, addEvent, loadEvents, backfillLegacy, buildSummary } = require('./_orders');
const { syncOrder, isCorreios, correiosConfigured } = require('./_logistics');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
// Etapas lançadas pela operação. Pedido realizado e pagamento aprovado vêm só do sistema/PagPix.
const MANUAL_STEPS = STEPS.map((step) => step.code).filter((code) => !['pedido_realizado', 'pagamento_aprovado', 'atualizacao'].includes(code));
const fail = (res, status, error) => res.status(status).json({ error });

function realDate(value, order) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return { error: 'Data inválida.' };
  // Só eventos que já aconteceram: nada de data futura ou anterior ao pedido.
  if (date.getTime() > Date.now() + 5 * 60_000) return { error: 'A data não pode estar no futuro.' };
  if (date.getTime() < new Date(order.created_at).getTime() - 60_000) return { error: 'A data não pode ser anterior ao pedido.' };
  return { date };
}

async function detail(reference) {
  const [order] = await sql`SELECT * FROM orders WHERE reference = ${reference} LIMIT 1`;
  if (!order) return null;
  await backfillLegacy(order, await loadEvents(reference));
  const events = await sql`SELECT code, description, location, source, occurred_at, created_at FROM order_events WHERE order_reference = ${reference} ORDER BY occurred_at DESC, id DESC`;
  const customer = json(order.customer) || {};
  const document = String(customer.document || '').replace(/\D/g, '');
  const email = String(customer.email || '').toLowerCase();
  // Histórico do cliente: outros pedidos com o mesmo CPF ou e-mail.
  const history = (document.length >= 11 || email) ? await sql`SELECT reference, status, amount, created_at FROM orders
    WHERE reference <> ${reference} AND ((${document.length >= 11} AND customer::text LIKE ${`%${document}%`}) OR (${email !== ''} AND customer::text ILIKE ${`%${email}%`}))
    ORDER BY created_at DESC LIMIT 20` : [];
  const auditTrail = await sql`SELECT actor, action, details, created_at FROM audit_log WHERE order_reference = ${reference} ORDER BY created_at DESC LIMIT 50`;
  return {
    summary: buildSummary(order, events, { full: true }),
    customer, address: json(order.address), offer: json(order.offer), invoice: json(order.invoice),
    status: order.status, trackingCode: order.tracking_code, carrier: order.carrier, carrierTrackingCode: order.carrier_tracking_code,
    deliveryEstimate: dateOnly(order.delivery_estimate), logisticsSyncedAt: order.logistics_synced_at, gatewayTransactionId: order.gateway_transaction_id,
    events: events.map((event) => ({ ...event, occurredAt: event.occurred_at })),
    history: history.map((row) => ({ reference: row.reference, status: row.status, amount: Number(row.amount) / 100, createdAt: row.created_at })),
    audit: auditTrail,
    manualSteps: STEPS.filter((step) => MANUAL_STEPS.includes(step.code)).map((step) => ({ code: step.code, label: step.label })),
    integration: { correios: correiosConfigured() },
  };
}

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const data = await detail(clean(req.query?.ref, 160));
      return data ? res.status(200).json(data) : fail(res, 404, 'Pedido não encontrado.');
    }
    if (req.method !== 'POST') return fail(res, 405, 'Método não permitido');

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const reference = clean(body.ref, 160);
    const data = body.data || {};
    const [order] = await sql`SELECT * FROM orders WHERE reference = ${reference} LIMIT 1`;
    if (!order) return fail(res, 404, 'Pedido não encontrado.');
    if (!isPaid(order.status)) return fail(res, 409, 'Só pedidos com pagamento aprovado podem ser atualizados.');
    let result = null;

    if (body.action === 'invoice') {
      // Nota fiscal emitida no sistema fiscal da operação: aqui só se registra o que já foi emitido.
      const number = clean(data.number, 12).replace(/\D/g, '');
      const key = clean(data.key, 60).replace(/\D/g, '');
      const url = clean(data.url, 500);
      if (!number) return fail(res, 400, 'Informe o número da nota fiscal.');
      if (key && key.length !== 44) return fail(res, 400, 'A chave de acesso da NF-e tem 44 dígitos.');
      if (url && !/^https:\/\//i.test(url)) return fail(res, 400, 'O link da nota precisa começar com https://');
      const when = realDate(data.issued_at, order);
      if (when.error) return fail(res, 400, when.error);
      const invoice = { number, series: clean(data.series, 5) || null, key: key || null, url: url || null, issued_at: when.date.toISOString() };
      await sql`UPDATE orders SET invoice = ${JSON.stringify(invoice)}, updated_at = NOW() WHERE reference = ${reference}`;
      await addEvent(reference, { code: 'nota_fiscal_emitida', description: `NF-e nº ${number}${invoice.series ? ` série ${invoice.series}` : ''}`, source: 'admin', externalId: `nf-${number}`, occurredAt: when.date });
    } else if (body.action === 'label') {
      // Etiqueta gerada na transportadora: guarda o código oficial que ela forneceu.
      const carrier = clean(data.carrier, 60);
      const code = clean(data.code, 40).toUpperCase().replace(/\s/g, '');
      if (!carrier || !code) return fail(res, 400, 'Informe a transportadora e o código de rastreio dela.');
      if (/^YM-/.test(code)) return fail(res, 400, 'Esse é o código interno da loja. Informe o código fornecido pela transportadora.');
      if (isCorreios(carrier) && !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code)) return fail(res, 400, 'Código dos Correios inválido (formato: 2 letras, 9 números e 2 letras, ex.: AB123456789BR).');
      const when = realDate(data.created_at, order);
      if (when.error) return fail(res, 400, when.error);
      try {
        await sql`UPDATE orders SET carrier = ${carrier}, carrier_tracking_code = ${code}, updated_at = NOW() WHERE reference = ${reference}`;
      } catch (error) {
        if (error.code === '23505') return fail(res, 409, 'Esse código de rastreio já está em outro pedido.');
        throw error;
      }
      await addEvent(reference, { code: 'etiqueta_gerada', description: `${carrier} · ${code}`, source: 'admin', externalId: `etiqueta-${code}`, occurredAt: when.date });
    } else if (body.action === 'event') {
      // Movimentação real informada pela operação (ex.: transportadora sem integração automática).
      const code = clean(data.code, 40);
      if (!MANUAL_STEPS.includes(code)) return fail(res, 400, 'Etapa inválida.');
      const when = realDate(data.occurred_at, order);
      if (when.error) return fail(res, 400, when.error);
      await addEvent(reference, { code, description: clean(data.description, 300) || null, location: clean(data.location, 120) || null, source: 'admin', externalId: crypto.randomUUID(), occurredAt: when.date });
    } else if (body.action === 'estimate') {
      // Previsão de entrega informada pela transportadora.
      const value = clean(data.date, 10);
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(res, 400, 'Data inválida.');
      await sql`UPDATE orders SET delivery_estimate = ${value || null}::date, updated_at = NOW() WHERE reference = ${reference}`;
    } else if (body.action === 'sync') {
      result = await syncOrder(order);
    } else {
      return fail(res, 400, 'Ação inválida.');
    }

    await audit('admin', `pedido_${body.action}`, { reference, details: { data, result }, req });
    return res.status(200).json({ ok: true, result, order: await detail(reference) });
  } catch (error) {
    console.error('[admin] order error', error);
    return fail(res, 500, 'Não foi possível concluir a operação.');
  }
};
