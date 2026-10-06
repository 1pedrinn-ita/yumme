const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const PINGUPAG_API = 'https://app.pingupag.com/gateway/v1/transaction';

function clean(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function onlyDigits(value) {
  return clean(value, 32).replace(/\D/g, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!process.env.PINGUPAG_SECRET_KEY) return res.status(500).json({ error: 'Gateway não configurado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const offer = body.offer || {};
    const customer = body.customer || {};
    const address = body.address || {};
    const amount = Math.round(Number(offer.price) * 100);
    if (!Number.isInteger(amount) || amount < 100) return res.status(400).json({ error: 'Valor inválido' });

    const reference = `YUMME-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const trackingCode = `YM${onlyDigits(address.zipcode).slice(-8)}${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const payload = {
      amount,
      description: clean(offer.label || 'Yumme Kids'),
      reference,
      source: 'api_externa',
      postback_url: `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/pingupag-webhook`,
      customer: {
        name: clean(customer.name), email: clean(customer.email, 254),
        phone: onlyDigits(customer.phone), document: onlyDigits(customer.document),
      },
      address: {
        street: clean(address.street), number: clean(address.number, 20), complement: clean(address.complement),
        neighborhood: clean(address.neighborhood), city: clean(address.city), state: clean(address.state, 2).toUpperCase(),
        zipcode: onlyDigits(address.zipcode),
      },
      tracking: body.tracking || {},
    };

    if (!payload.customer.name || !payload.customer.email || !payload.customer.phone || !payload.customer.document) {
      return res.status(400).json({ error: 'Preencha os dados obrigatórios do cliente' });
    }

    const gateway = await fetch(PINGUPAG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.PINGUPAG_SECRET_KEY },
      body: JSON.stringify(payload),
    });
    const result = await gateway.json().catch(() => ({}));
    if (!gateway.ok) return res.status(gateway.status).json({ error: result.message || 'Não foi possível criar o PIX' });

    await sql`CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY, reference TEXT UNIQUE NOT NULL, gateway_transaction_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending', amount INTEGER NOT NULL, offer JSONB NOT NULL,
      customer JSONB NOT NULL, address JSONB, tracking JSONB, pix_code TEXT, qr_code_base64 TEXT,
      tracking_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    const tracking = { ...payload.tracking, code: trackingCode, estimate: '5 a 12 dias úteis', house_number: clean(address.number, 20) };
    await sql`INSERT INTO orders (reference, gateway_transaction_id, status, amount, offer, customer, address, tracking, pix_code, tracking_code)
      VALUES (${reference}, ${String(result.transaction_id || result.id || '')}, 'pending', ${amount}, ${JSON.stringify(offer)}, ${JSON.stringify(payload.customer)}, ${JSON.stringify(payload.address)}, ${JSON.stringify(tracking)}, ${result.qr_code || result.pix_code || result.copy_and_paste || null}, ${trackingCode})`;

    return res.status(200).json({ reference, tracking_code: trackingCode, ...result });
  } catch (error) {
    console.error('[v0] create transaction error', error);
    return res.status(500).json({ error: 'Erro interno ao criar o pagamento' });
  }
};
