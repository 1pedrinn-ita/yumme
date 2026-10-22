const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { pagpix, qrImage } = require('./_pagpix');

const sql = neon(process.env.DATABASE_URL);
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'];
const CLICK_IDS = ['fbclid', 'gclid', 'ttclid'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function onlyDigits(value) {
  return clean(value, 32).replace(/\D/g, '');
}

function generateTrackingCode(zipcode = '') {
  const zipSuffix = onlyDigits(zipcode).slice(-6).padStart(6, '0');
  const timeStamp = Date.now().toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `YM-${zipSuffix}-${timeStamp}-${randomPart.slice(0, 10)}`;
}

function campaignParams(tracking = {}) {
  const utm = {};
  UTM_KEYS.forEach((key) => { const value = clean(tracking[`utm_${key}`]); if (value) utm[key] = value; });
  CLICK_IDS.forEach((key) => { const value = clean(tracking[key], 500); if (value) utm[key] = value; });
  return utm;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!process.env.PAGPIX_API_KEY) return res.status(500).json({ error: 'Gateway não configurado' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const offer = body.offer || {};
    const customer = body.customer || {};
    const address = body.address || {};
    const amount = Math.round(Number(offer.price) * 100);
    // A PagPix só aceita cobranças a partir de R$ 5,00.
    if (!Number.isInteger(amount) || amount < 500) return res.status(400).json({ error: 'Valor inválido' });

    const reference = `YUMME-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const buyer = {
      name: clean(customer.name), email: clean(customer.email, 254),
      phone: onlyDigits(customer.phone), document: onlyDigits(customer.document),
    };
    const shippingAddress = {
      street: clean(address.street), number: clean(address.number, 20), complement: clean(address.complement),
      neighborhood: clean(address.neighborhood), city: clean(address.city), state: clean(address.state, 2).toUpperCase(),
      zipcode: onlyDigits(address.zipcode),
    };
    const tracking = body.tracking || {};

    if (!buyer.name || !buyer.email || !buyer.phone || !buyer.document) {
      return res.status(400).json({ error: 'Preencha os dados obrigatórios do cliente' });
    }

    const created = await pagpix('/transactions', {
      method: 'POST',
      idempotencyKey: reference,
      body: {
        amount_cents: amount,
        method: 'pix',
        description: clean(offer.label || 'Yumme Kids', 300),
        external_reference: reference,
        customer: { name: buyer.name, email: buyer.email, cpf: buyer.document, phone: buyer.phone },
        metadata: { offer_id: clean(String(offer.id || ''), 20), qty: String(Number(offer.qty) || 1) },
        utm: campaignParams(tracking),
      },
    });
    if (!created.ok) {
      console.error('[pagpix] create transaction failed', created.status, created.data);
      return res.status(502).json({ error: created.data.error?.message || 'Não foi possível criar o PIX' });
    }

    // HTTP 202: a cobrança existe, mas o código PIX ainda está sendo gerado. Espera um pouco aqui;
    // se não ficar pronto, o navegador continua consultando /api/pix-status.
    let transaction = created.data;
    for (let attempt = 0; attempt < 2 && transaction.pix_status === 'generating'; attempt += 1) {
      await sleep(1500);
      const check = await pagpix(`/transactions/${encodeURIComponent(transaction.id)}`);
      if (check.ok) transaction = check.data;
    }
    if (transaction.pix_status === 'failed') return res.status(502).json({ error: 'Não foi possível gerar o PIX. Tente novamente.' });
    const pixCode = transaction.pix?.copy_paste || null;

    await sql`CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY, reference TEXT UNIQUE NOT NULL, gateway_transaction_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending', amount INTEGER NOT NULL, offer JSONB NOT NULL,
      customer JSONB NOT NULL, address JSONB, tracking JSONB, pix_code TEXT, qr_code_base64 TEXT,
      tracking_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    // O banco recusa qualquer código de rastreio repetido, mesmo com pedidos simultâneos.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_code_key ON orders (tracking_code)`;

    let trackingCode;
    for (let attempt = 1; ; attempt += 1) {
      trackingCode = generateTrackingCode(address.zipcode);
      const trackingData = { ...tracking, code: trackingCode, estimate: '5 a 12 dias úteis', house_number: shippingAddress.number };
      try {
        await sql`INSERT INTO orders (reference, gateway_transaction_id, status, amount, offer, customer, address, tracking, pix_code, tracking_code)
          VALUES (${reference}, ${String(transaction.id || '')}, 'pending', ${amount}, ${JSON.stringify(offer)}, ${JSON.stringify(buyer)}, ${JSON.stringify(shippingAddress)}, ${JSON.stringify(trackingData)}, ${pixCode}, ${trackingCode})`;
        break;
      } catch (insertError) {
        // 23505 = código já existe no banco: gera outro e tenta de novo.
        const duplicateCode = insertError.code === '23505' && insertError.constraint === 'orders_tracking_code_key';
        if (!duplicateCode || attempt >= 5) throw insertError;
      }
    }

    return res.status(200).json({
      reference,
      tracking_code: trackingCode,
      status: 'pending',
      pix_status: pixCode ? 'ready' : 'generating',
      pix_code: pixCode,
      qr_code_image: await qrImage(pixCode),
      expires_at: transaction.pix?.expires_at || null,
    });
  } catch (error) {
    console.error('[v0] create transaction error', error);
    return res.status(500).json({ error: 'Erro interno ao criar o pagamento' });
  }
};
