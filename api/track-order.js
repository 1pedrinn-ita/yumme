const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const cleanCode = (value) => typeof value === 'string' ? value.trim().toUpperCase().slice(0, 40) : '';

function addBusinessDays(from, days) {
  const date = new Date(from);
  for (let added = 0; added < days;) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
  }
  return date;
}
const shortDate = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const code = cleanCode(req.query?.code);
  if (!code) return res.status(400).json({ error: 'Informe o código de rastreio' });
  try {
    const rows = await sql`SELECT reference, status, COALESCE(offer_id::text, offer->>'id') AS offer_id, offer->>'label' AS offer_label, amount, address, tracking, created_at, updated_at FROM orders WHERE tracking_code = ${code} LIMIT 1`;
    if (!rows[0]) return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    const order = rows[0];
    const status = String(order.status || 'pending').toLowerCase();
    const steps = ['Pedido confirmado', 'Pagamento aprovado', 'Em preparação', 'A caminho', 'Entregue'];
    const statusIndex = status.includes('deliver') || status.includes('entreg') ? 4 : status.includes('ship') || status.includes('transit') || status.includes('post') ? 3 : status.includes('paid') || status.includes('apro') ? 1 : 0;
    // Frete escolhido no checkout; pedidos de antes das opções de entrega eram frete grátis em 5 a 12 dias úteis.
    const shipping = order.tracking?.shipping || null;
    const shippingCents = Number(shipping?.price_cents || 0);
    const etaMin = Number(shipping?.eta_min || 5);
    const etaMax = Number(shipping?.eta_max || 12);
    const amount = Number(order.amount || 0);
    const deliveryRange = `${shortDate(addBusinessDays(order.created_at, etaMin))} e ${shortDate(addBusinessDays(order.created_at, etaMax))}`;
    return res.status(200).json({
      code,
      reference: order.reference,
      product: { id: order.offer_id, label: order.offer_label || `Yumme Kids — Oferta ${order.offer_id}`, price: (amount - shippingCents) / 100 },
      shipping: { label: shipping?.label || 'Frete grátis', price: shippingCents / 100, eta: `${etaMin} a ${etaMax} dias úteis` },
      total: amount / 100,
      destination: { city: order.address?.city || '', state: order.address?.state || '', zipcode: order.address?.zipcode || '' },
      status,
      steps: steps.map((label, index) => ({ label, done: index <= statusIndex, current: index === statusIndex })),
      estimate: `${shipping?.label || 'Entrega'}: previsão entre ${deliveryRange} (${etaMin} a ${etaMax} dias úteis)`,
      updatedAt: order.updated_at,
    });
  } catch (error) {
    // 42P01 = a tabela de pedidos ainda não existe (é criada na primeira compra).
    if (error.code === '42P01') return res.status(404).json({ error: 'Código de rastreio não encontrado' });
    console.error('[v0] tracking lookup error', error);
    return res.status(500).json({ error: 'Não foi possível consultar o rastreio' });
  }
};
