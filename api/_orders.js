const crypto = require('crypto');
const { sql } = require('./_db');
const STEPS = require('../shop/js/order-steps.js');

const STEP_INDEX = Object.fromEntries(STEPS.map((step, index) => [step.code, index]));
const UNPAID = ['pending', 'expired', 'failed'];
const isPaid = (status) => !UNPAID.includes(String(status || 'pending').toLowerCase());
// As colunas de dados da tabela original podem ser JSONB ou TEXT: aceita os dois.
const json = (value) => { if (typeof value !== 'string') return value || null; try { return JSON.parse(value); } catch (_) { return null; } };
// Coluna DATE: devolve "AAAA-MM-DD" (sem fuso), venha como texto ou como Date.
const dateOnly = (value) => (!value ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

// Código de acompanhamento da loja ("YM-..."): formato próprio, que não imita código de transportadora.
function generateTrackingCode(zipcode = '') {
  const zipSuffix = String(zipcode || '').replace(/\D/g, '').slice(-6).padStart(6, '0');
  const timeStamp = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `YM-${zipSuffix}-${timeStamp}-${randomPart.slice(0, 10)}`;
}

// Token que abre a página de obrigado. No banco fica só o hash.
const newAccessToken = () => crypto.randomBytes(24).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(String(storedHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Grava um evento real do pedido. Repetições (mesma origem + mesmo id externo) são ignoradas.
async function addEvent(reference, { code, description = null, location = null, source, externalId, occurredAt = new Date() }) {
  if (!(code in STEP_INDEX)) throw new Error(`Etapa desconhecida: ${code}`);
  const inserted = await sql`INSERT INTO order_events (order_reference, code, description, location, source, external_id, occurred_at)
    VALUES (${reference}, ${code}, ${description}, ${location}, ${source}, ${String(externalId)}, ${new Date(occurredAt).toISOString()})
    ON CONFLICT (order_reference, source, external_id) DO NOTHING RETURNING id`;
  if (inserted.length && !STEPS[STEP_INDEX[code]].optional) {
    // fulfillment_status guarda a etapa mais avançada já alcançada.
    const [order] = await sql`SELECT fulfillment_status FROM orders WHERE reference = ${reference}`;
    if (order && (STEP_INDEX[order.fulfillment_status] ?? -1) < STEP_INDEX[code]) {
      await sql`UPDATE orders SET fulfillment_status = ${code}, updated_at = NOW() WHERE reference = ${reference}`;
    }
  }
  return inserted.length > 0;
}

/**
 * Confirmação de pagamento (webhook da PagPix ou consulta direta). Idempotente: pode ser chamada várias vezes.
 * Marca como pago, gera o código de acompanhamento exclusivo e registra "pagamento aprovado" e "em preparação".
 */
async function markPaid(reference, paidAt = new Date()) {
  const paidIso = new Date(paidAt).toISOString();
  const [order] = await sql`UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ${paidIso}), updated_at = NOW()
    WHERE reference = ${reference} AND status NOT IN ('refunded', 'chargeback') RETURNING tracking_code, address, paid_at`;
  if (!order) return null;
  let trackingCode = order.tracking_code;
  for (let attempt = 1; !trackingCode; attempt += 1) {
    const candidate = generateTrackingCode(json(order.address)?.zipcode);
    try {
      const [updated] = await sql`UPDATE orders SET tracking_code = ${candidate} WHERE reference = ${reference} AND tracking_code IS NULL RETURNING tracking_code`;
      trackingCode = updated ? updated.tracking_code : (await sql`SELECT tracking_code FROM orders WHERE reference = ${reference}`)[0].tracking_code;
    } catch (error) {
      // 23505 = código já usado por outro pedido: sorteia outro.
      if (error.code !== '23505' || attempt >= 5) throw error;
    }
  }
  const confirmedAt = new Date(order.paid_at || paidIso);
  await addEvent(reference, { code: 'pagamento_aprovado', description: 'Pagamento via PIX confirmado.', source: 'pagpix', externalId: 'pagamento', occurredAt: confirmedAt });
  await addEvent(reference, { code: 'em_preparacao', description: 'Seu pedido entrou na fila de separação.', source: 'sistema', externalId: 'em_preparacao', occurredAt: new Date(confirmedAt.getTime() + 1000) });
  return trackingCode;
}

const loadEvents = (reference) => sql`SELECT code, description, location, source, occurred_at FROM order_events WHERE order_reference = ${reference} ORDER BY occurred_at DESC, id DESC`;

// Pedidos pagos antes da tabela de eventos: na primeira consulta, registra o que de fato aconteceu
// (pedido criado em created_at; pagamento confirmado quando o status virou "paid", guardado em updated_at).
async function backfillLegacy(order, events) {
  if (events.length || !isPaid(order.status)) return events;
  await addEvent(order.reference, { code: 'pedido_realizado', source: 'sistema', externalId: 'criado', occurredAt: order.created_at });
  if (order.status === 'paid') await markPaid(order.reference, order.paid_at || order.updated_at || order.created_at);
  return loadEvents(order.reference);
}

function addBusinessDays(from, days) {
  const date = new Date(from);
  for (let added = 0; added < days;) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
  }
  return date;
}

/**
 * Dados do pedido para as páginas do cliente. `full` (página de obrigado, com token) inclui nome e endereço;
 * o rastreio por código mostra só cidade e estado.
 */
function buildSummary(row, events, { full = false } = {}) {
  const order = { ...row, offer: json(row.offer), customer: json(row.customer), address: json(row.address), tracking: json(row.tracking), invoice: json(row.invoice) };
  const shipping = order.tracking?.shipping || null;
  const shippingCents = Number(shipping?.price_cents || 0);
  const amount = Number(order.amount || 0);
  const etaMin = Number(shipping?.eta_min || 5);
  const etaMax = Number(shipping?.eta_max || 12);
  const base = order.paid_at || order.created_at;
  const reached = events.filter((event) => !STEPS[STEP_INDEX[event.code]]?.optional).map((event) => STEP_INDEX[event.code]);
  const invoice = order.invoice || null;
  return {
    reference: order.reference,
    createdAt: order.created_at,
    paidAt: order.paid_at || null,
    payment: { status: String(order.status || 'pending').toLowerCase(), paid: isPaid(order.status) },
    product: { id: order.offer_id || order.offer?.id, label: order.offer?.label || `Yumme Kids — Oferta ${order.offer_id}`, detail: order.offer?.detail || '', qty: order.offer?.qty || null, price: (amount - shippingCents) / 100 },
    shipping: { label: shipping?.label || 'Frete grátis', price: shippingCents / 100, eta: `${etaMin} a ${etaMax} dias úteis` },
    total: amount / 100,
    trackingCode: isPaid(order.status) ? order.tracking_code : null,
    carrier: order.carrier_tracking_code ? { name: order.carrier || 'Transportadora', code: order.carrier_tracking_code } : null,
    invoice: invoice ? { status: 'emitida', number: invoice.number || null, series: invoice.series || null, key: invoice.key || null, url: invoice.url || null, issuedAt: invoice.issued_at || null } : { status: 'pendente' },
    estimate: order.delivery_estimate
      ? { source: 'transportadora', date: dateOnly(order.delivery_estimate) }
      : { source: 'loja', from: addBusinessDays(base, etaMin), to: addBusinessDays(base, etaMax), eta: `${etaMin} a ${etaMax} dias úteis` },
    // Etapa atual calculada pelos próprios eventos (sempre igual ao que a linha do tempo mostra).
    fulfillment: (() => { const index = reached.length ? Math.max(...reached) : -1; const current = index >= 0 ? STEPS[index].code : null; return { current, reachedIndex: index, delivered: current === 'entregue' }; })(),
    events: events.map((event) => ({ code: event.code, description: event.description, location: event.location, occurredAt: event.occurred_at })),
    destination: { city: order.address?.city || '', state: order.address?.state || '', zipcode: order.address?.zipcode || '' },
    ...(full ? {
      customer: { firstName: String(order.customer?.name || '').trim().split(/\s+/)[0] || '' },
      address: order.address || null,
    } : {}),
  };
}

module.exports = { STEPS, STEP_INDEX, UNPAID, isPaid, json, dateOnly, generateTrackingCode, newAccessToken, hashToken, tokenMatches, addEvent, markPaid, loadEvents, backfillLegacy, buildSummary };
