const { neon } = require('@neondatabase/serverless');
const { pagpix, qrImage } = require('./_pagpix');

const sql = neon(process.env.DATABASE_URL);

// Consultado pelo checkout enquanto o cliente espera: entrega o código PIX quando ficar pronto
// e confirma o pagamento direto na PagPix, mesmo que o webhook atrase.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const reference = typeof req.query?.reference === 'string' ? req.query.reference.trim().slice(0, 160) : '';
  if (!reference) return res.status(400).json({ error: 'Informe o pedido' });

  try {
    const rows = await sql`SELECT status, gateway_transaction_id, pix_code FROM orders WHERE reference = ${reference} LIMIT 1`;
    if (!rows[0]) return res.status(404).json({ error: 'Pedido não encontrado' });
    let { status, pix_code: pixCode } = rows[0];
    const transactionId = rows[0].gateway_transaction_id;

    if (status === 'pending' && transactionId && process.env.PAGPIX_API_KEY) {
      const check = await pagpix(`/transactions/${encodeURIComponent(transactionId)}`);
      if (check.ok) {
        const gatewayStatus = String(check.data.status || '').toLowerCase().slice(0, 40) || status;
        const gatewayPix = check.data.pix?.copy_paste || pixCode;
        if (gatewayStatus !== status || gatewayPix !== pixCode) {
          await sql`UPDATE orders SET status = ${gatewayStatus}, pix_code = ${gatewayPix}, updated_at = NOW() WHERE reference = ${reference} AND status = 'pending'`;
          status = gatewayStatus;
          pixCode = gatewayPix;
        }
      }
    }

    return res.status(200).json({ status, pix_code: pixCode, qr_code_image: await qrImage(pixCode) });
  } catch (error) {
    // 42P01 = a tabela de pedidos ainda não existe (é criada na primeira compra).
    if (error.code === '42P01') return res.status(404).json({ error: 'Pedido não encontrado' });
    console.error('[pagpix] pix status error', error);
    return res.status(500).json({ error: 'Não foi possível consultar o pagamento' });
  }
};
