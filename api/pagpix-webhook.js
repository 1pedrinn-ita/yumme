const crypto = require('crypto');
const { sql, ensureSchema, audit, clientIp } = require('./_db');
const { markPaid } = require('./_orders');

// Header "t=<timestamp>,v1=<hmac>": HMAC-SHA256 em hex de `${t}.${corpo cru}` com o segredo whsec_ do webhook.
function validSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map((pair) => {
    const index = pair.indexOf('=');
    return [pair.slice(0, index).trim(), pair.slice(index + 1).trim()];
  }));
  const timestamp = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex'));
  const received = Buffer.from(parts.v1);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!process.env.PAGPIX_WEBHOOK_SECRET) return res.status(500).json({ error: 'Webhook não configurado' });

  let claimedEventId = null;
  try {
    // A assinatura é calculada sobre o corpo exatamente como chegou.
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const signature = req.headers['pagpixhub-signature'] || req.headers['x-pagpixhub-signature'];
    if (!validSignature(rawBody, signature, process.env.PAGPIX_WEBHOOK_SECRET)) {
      await ensureSchema().then(() => audit('pagpix-webhook', 'assinatura_invalida', { details: { ip: clientIp(req) }, req })).catch(() => {});
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    const event = JSON.parse(rawBody);
    const transaction = event.data || {};
    const reference = String(transaction.external_reference || '').slice(0, 160);
    const status = String(transaction.status || '').toLowerCase().slice(0, 40);
    if (!String(event.type || '').startsWith('transaction.') || !reference || !status) {
      return res.status(200).json({ received: true });
    }

    await ensureSchema();
    // A PagPix reenvia o mesmo evento (mesmo id) em caso de falha: cada evento é processado uma única vez.
    if (event.id) {
      const fresh = await sql`INSERT INTO webhook_events (id, type, order_reference) VALUES (${String(event.id).slice(0, 120)}, ${String(event.type).slice(0, 60)}, ${reference}) ON CONFLICT (id) DO NOTHING RETURNING id`;
      if (!fresh.length) return res.status(200).json({ received: true, duplicate: true });
      claimedEventId = fresh[0].id;
    }

    if (status === 'paid') {
      await markPaid(reference, transaction.paid_at || new Date());
      if (transaction.id) await sql`UPDATE orders SET gateway_transaction_id = COALESCE(gateway_transaction_id, ${String(transaction.id)}) WHERE reference = ${reference}`;
    } else {
      // Os eventos podem chegar fora de ordem: um pedido pago só sai de "paid" por reembolso ou chargeback.
      await sql`UPDATE orders SET status = ${status}, gateway_transaction_id = COALESCE(${transaction.id ? String(transaction.id) : null}, gateway_transaction_id), updated_at = NOW()
        WHERE reference = ${reference} AND (status <> 'paid' OR ${status} IN ('refunded', 'chargeback'))`;
      if (['refunded', 'chargeback'].includes(status)) await audit('pagpix-webhook', `pagamento_${status}`, { reference, details: { event: event.id || null } });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[pagpix] webhook error', error);
    // Falhou no meio: libera o evento para a nova tentativa da PagPix ser processada.
    if (claimedEventId) await sql`DELETE FROM webhook_events WHERE id = ${claimedEventId}`.catch(() => {});
    return res.status(500).json({ error: 'Erro interno' });
  }
};
