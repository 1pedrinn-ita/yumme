const { sql, ensureSchema } = require('./_db');
const { syncOrder } = require('./_logistics');

// Rodado de hora em hora pela Netlify (netlify.toml): consulta a transportadora dos pedidos postados e ainda não entregues.
module.exports = async function runLogisticsSync() {
  await ensureSchema();
  const orders = await sql`SELECT * FROM orders
    WHERE status = 'paid' AND carrier_tracking_code IS NOT NULL AND COALESCE(fulfillment_status, '') <> 'entregue'
      AND (logistics_synced_at IS NULL OR logistics_synced_at < NOW() - INTERVAL '50 minutes')
    ORDER BY logistics_synced_at NULLS FIRST LIMIT 50`;
  const results = [];
  for (const order of orders) results.push({ reference: order.reference, ...(await syncOrder(order)) });
  return results;
};
