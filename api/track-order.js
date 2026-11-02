const { sql, ensureSchema } = require('./_db');
const { loadEvents, backfillLegacy, buildSummary } = require('./_orders');

const cleanCode = (value) => typeof value === 'string' ? value.trim().toUpperCase().slice(0, 40) : '';

// Rastreio público pelo código de acompanhamento da loja (YM-...) ou pelo código oficial da transportadora.
// Mostra só cidade/UF do destino: nome e endereço completo ficam na página de obrigado, que exige o token do pedido.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const code = cleanCode(req.query?.code);
  if (!code) return res.status(400).json({ error: 'Informe o código de rastreio' });
  try {
    await ensureSchema();
    const rows = await sql`SELECT * FROM orders WHERE tracking_code = ${code} OR carrier_tracking_code = ${code} LIMIT 1`;
    if (!rows[0]) return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    const summary = buildSummary(rows[0], await backfillLegacy(rows[0], await loadEvents(rows[0].reference)));
    return res.status(200).json({ code, ...summary });
  } catch (error) {
    // 42P01 = a tabela de pedidos ainda não existe (é criada na primeira compra).
    if (error.code === '42P01') return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    console.error('[v0] tracking lookup error', error);
    return res.status(500).json({ error: 'Não foi possível consultar o rastreio' });
  }
};
