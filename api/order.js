const { sql, ensureSchema } = require('./_db');
const { loadEvents, buildSummary, tokenMatches } = require('./_orders');

// Página de obrigado: dados completos do pedido, só para quem tem o token entregue no checkout.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const reference = typeof req.query?.pedido === 'string' ? req.query.pedido.trim().slice(0, 160) : '';
  if (!reference || !req.query?.t) return res.status(400).json({ error: 'Link do pedido incompleto' });
  try {
    await ensureSchema();
    const [order] = await sql`SELECT * FROM orders WHERE reference = ${reference} LIMIT 1`;
    // Mesmo erro para pedido inexistente e token errado: não revela se o número existe.
    if (!order || !tokenMatches(req.query.t, order.access_token_hash)) return res.status(404).json({ error: 'Pedido não encontrado' });
    return res.status(200).json(buildSummary(order, await loadEvents(reference), { full: true }));
  } catch (error) {
    if (error.code === '42P01') return res.status(404).json({ error: 'Pedido não encontrado' });
    console.error('[order] lookup error', error);
    return res.status(500).json({ error: 'Não foi possível carregar o pedido' });
  }
};
