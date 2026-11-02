const { sql, ensureSchema, audit } = require('./_db');
const { requireAdmin } = require('./_admin-auth');
const { json } = require('./_orders');
const { syncOrder } = require('./_logistics');

const FILTERS = ['todos', 'pagos', 'pendentes', 'sem_nf', 'sem_etiqueta', 'sem_rastreio'];
const PAGE_SIZE = 50;

// Lista e busca de pedidos (CPF, e-mail, nome, número do pedido ou código de rastreio) + contadores do painel.
module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureSchema();
    if (req.method === 'POST') {
      // Reprocessa as consultas logísticas de todos os pedidos pagos com código oficial e ainda não entregues.
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (body.action !== 'sync_all') return res.status(400).json({ error: 'Ação inválida' });
      const pending = await sql`SELECT * FROM orders WHERE status = 'paid' AND carrier_tracking_code IS NOT NULL AND COALESCE(fulfillment_status, '') <> 'entregue' ORDER BY logistics_synced_at NULLS FIRST LIMIT 40`;
      const results = [];
      for (const order of pending) results.push({ reference: order.reference, ...(await syncOrder(order)) });
      await audit('admin', 'logistica_reprocessada', { details: { pedidos: results.length }, req });
      return res.status(200).json({ results });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

    const q = String(req.query?.q || '').trim().slice(0, 80);
    const filter = FILTERS.includes(req.query?.filter) ? req.query.filter : 'todos';
    const page = Math.max(0, parseInt(req.query?.page, 10) || 0);
    const digits = q.replace(/\D/g, '');
    const rows = await sql`SELECT o.reference, o.status, o.amount, o.created_at, o.paid_at, o.customer, o.offer, o.offer_id, o.tracking, o.tracking_code,
        o.carrier, o.carrier_tracking_code, o.fulfillment_status, o.invoice,
        EXISTS (SELECT 1 FROM order_events e WHERE e.order_reference = o.reference AND e.code = 'etiqueta_gerada') AS has_label
      FROM orders o
      WHERE (${q} = '' OR o.reference ILIKE ${`%${q}%`} OR o.customer::text ILIKE ${`%${q}%`}
        OR (${digits.length >= 6} AND o.customer::text LIKE ${`%${digits}%`})
        OR o.tracking_code = ${q.toUpperCase()} OR o.carrier_tracking_code = ${q.toUpperCase()})
      AND (${filter} = 'todos'
        OR (${filter} = 'pagos' AND o.status = 'paid')
        OR (${filter} = 'pendentes' AND o.status = 'pending')
        OR (${filter} = 'sem_nf' AND o.status = 'paid' AND o.invoice IS NULL)
        OR (${filter} = 'sem_etiqueta' AND o.status = 'paid' AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_reference = o.reference AND e.code = 'etiqueta_gerada'))
        OR (${filter} = 'sem_rastreio' AND o.status = 'paid' AND o.carrier_tracking_code IS NULL))
      ORDER BY o.created_at DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`;
    const [counts] = await sql`SELECT
        COUNT(*) FILTER (WHERE status = 'paid')::int AS pagos,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pendentes,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::bigint AS total_pago,
        COUNT(*) FILTER (WHERE status = 'paid' AND invoice IS NULL)::int AS sem_nf,
        COUNT(*) FILTER (WHERE status = 'paid' AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_reference = orders.reference AND e.code = 'etiqueta_gerada'))::int AS sem_etiqueta,
        COUNT(*) FILTER (WHERE status = 'paid' AND carrier_tracking_code IS NULL)::int AS sem_rastreio,
        (SELECT COUNT(*) FROM integration_errors WHERE NOT resolved)::int AS erros
      FROM orders`;
    const orders = rows.slice(0, PAGE_SIZE).map((row) => {
      const customer = json(row.customer) || {};
      const offer = json(row.offer) || {};
      const shipping = json(row.tracking)?.shipping || null;
      return {
        reference: row.reference, status: row.status, amount: Number(row.amount) / 100, createdAt: row.created_at, paidAt: row.paid_at,
        customer: { name: customer.name || '', email: customer.email || '', document: customer.document || '', phone: customer.phone || '' },
        product: offer.label || `Oferta ${row.offer_id || ''}`, shipping: shipping?.label || '',
        trackingCode: row.tracking_code, carrier: row.carrier, carrierTrackingCode: row.carrier_tracking_code,
        fulfillment: row.fulfillment_status, hasInvoice: Boolean(row.invoice), hasLabel: row.has_label,
      };
    });
    return res.status(200).json({ orders, hasMore: rows.length > PAGE_SIZE, page, counts: { ...counts, total_pago: Number(counts.total_pago) / 100 } });
  } catch (error) {
    console.error('[admin] orders error', error);
    return res.status(500).json({ error: 'Não foi possível carregar os pedidos.' });
  }
};
