const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const cleanCode = (value) => typeof value === 'string' ? value.trim().toUpperCase().slice(0, 40) : '';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const code = cleanCode(req.query?.code);
  if (!code) return res.status(400).json({ error: 'Informe o código de rastreio' });
  try {
    const rows = await sql`SELECT reference, status, offer_id, amount, address, tracking, created_at, updated_at FROM orders WHERE tracking->>'code' = ${code} LIMIT 1`;
    if (!rows[0]) return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    const order = rows[0];
    const status = String(order.status || 'pending').toLowerCase();
    const steps = ['Pedido confirmado', 'Pagamento aprovado', 'Em preparação', 'A caminho', 'Entregue'];
    const statusIndex = status.includes('deliver') || status.includes('entreg') ? 4 : status.includes('ship') || status.includes('transit') || status.includes('post') ? 3 : status.includes('paid') || status.includes('apro') ? 1 : 0;
    return res.status(200).json({
      code,
      reference: order.reference,
      product: { id: order.offer_id, label: `Yumme Kids — Oferta ${order.offer_id}`, price: Number(order.amount || 0) / 100 },
      destination: { city: order.address?.city || '', state: order.address?.state || '', zipcode: order.address?.zipcode || '' },
      status,
      steps: steps.map((label, index) => ({ label, done: index <= statusIndex, current: index === statusIndex })),
      estimate: 'Entrega estimada entre 5 e 12 dias úteis',
      updatedAt: order.updated_at,
    });
  } catch (error) {
    console.error('[v0] tracking lookup error', error);
    return res.status(500).json({ error: 'Não foi possível consultar o rastreio' });
  }
};
