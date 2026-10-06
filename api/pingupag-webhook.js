const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const reference = event.external_id || event.store_reference;
    if (!reference || !event.status) return res.status(400).json({ error: 'Webhook inválido' });
    await sql`UPDATE orders SET status = ${String(event.status).slice(0, 40)}, gateway_transaction_id = COALESCE(${event.transaction_id ? String(event.transaction_id) : null}, gateway_transaction_id), updated_at = NOW() WHERE reference = ${String(reference).slice(0, 160)}`;
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[v0] webhook error', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
