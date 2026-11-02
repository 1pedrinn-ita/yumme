const { pagpix, qrImage } = require('./_pagpix');
const { toCents, findOffer, findShipping, etaText } = require('./_catalog');
const { sql, ensureSchema, logIntegrationError } = require('./_db');
const { newAccessToken, hashToken, addEvent } = require('./_orders');

const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'];
const CLICK_IDS = ['fbclid', 'gclid', 'ttclid'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function onlyDigits(value) {
  return clean(value, 32).replace(/\D/g, '');
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
    const customer = body.customer || {};
    const address = body.address || {};
    // Kit e frete são buscados no catálogo pelo id; o preço enviado pelo navegador é ignorado.
    const catalogOffer = findOffer(body.offer?.id);
    const shippingOption = findShipping(body.shipping);
    if (!catalogOffer || !shippingOption) return res.status(400).json({ error: 'Oferta ou entrega inválida' });
    const shippingCents = toCents(shippingOption.price);
    const amount = toCents(catalogOffer.price) + shippingCents;
    // A PagPix só aceita cobranças a partir de R$ 5,00.
    if (!Number.isInteger(amount) || amount < 500) return res.status(400).json({ error: 'Valor inválido' });
    const orderBump = body.order_bump === true;
    const offer = {
      id: catalogOffer.id, label: catalogOffer.label, detail: catalogOffer.detail, qty: catalogOffer.qty, price: catalogOffer.price,
      order_bump: orderBump, bump_from: orderBump ? clean(String(body.bump_from || ''), 20) : null,
    };

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
        description: clean(`${offer.label} + ${shippingOption.label}`, 300),
        external_reference: reference,
        customer: { name: buyer.name, email: buyer.email, cpf: buyer.document, phone: buyer.phone },
        metadata: { offer_id: offer.id, qty: String(offer.qty), shipping: shippingOption.id, order_bump: orderBump ? 'sim' : 'nao' },
        utm: campaignParams(tracking),
      },
    });
    if (!created.ok) {
      await ensureSchema().then(() => logIntegrationError('pagpix', `Criação do PIX recusada (HTTP ${created.status})`, { reference, details: created.data })).catch(() => {});
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
    if (transaction.pix_status === 'failed') {
      await ensureSchema().then(() => logIntegrationError('pagpix', 'A PagPix não conseguiu gerar o código PIX', { reference, details: { transaction_id: transaction.id } })).catch(() => {});
      return res.status(502).json({ error: 'Não foi possível gerar o PIX. Tente novamente.' });
    }
    const pixCode = transaction.pix?.copy_paste || null;

    await ensureSchema();
    const trackingData = {
      ...tracking, estimate: etaText(shippingOption), house_number: shippingAddress.number,
      // Frete escolhido: define o prazo e o valor mostrados no pós-venda.
      shipping: { id: shippingOption.id, label: shippingOption.label, price_cents: shippingCents, eta_min: shippingOption.etaMinDays, eta_max: shippingOption.etaMaxDays },
    };
    // Abre a página de obrigado deste pedido (o banco guarda só o hash).
    const accessToken = newAccessToken();
    // O código de acompanhamento só é gerado quando o pagamento é confirmado (api/_orders.js → markPaid).
    // offer_id e transaction_id vêm do formato original da tabela (criada pelo v0); offer_id é obrigatória.
    await sql`INSERT INTO orders (reference, gateway_transaction_id, transaction_id, status, amount, offer_id, offer, customer, address, tracking, pix_code, access_token_hash)
      VALUES (${reference}, ${String(transaction.id || '')}, ${String(transaction.id || '')}, 'pending', ${amount}, ${String(offer.id || '')}, ${JSON.stringify(offer)}, ${JSON.stringify(buyer)}, ${JSON.stringify(shippingAddress)}, ${JSON.stringify(trackingData)}, ${pixCode}, ${hashToken(accessToken)})`;
    await addEvent(reference, { code: 'pedido_realizado', description: `${offer.label} · ${shippingOption.label}`, source: 'sistema', externalId: 'criado' });

    return res.status(200).json({
      reference,
      access_token: accessToken,
      // O código de acompanhamento só existe depois do pagamento; antes disso a tela mostra só "YM" e o resto desfocado.
      tracking_preview: 'YM',
      amount_cents: amount,
      shipping: { id: shippingOption.id, label: shippingOption.label, eta: etaText(shippingOption) },
      status: 'pending',
      pix_status: pixCode ? 'ready' : 'generating',
      pix_code: pixCode,
      qr_code_image: await qrImage(pixCode),
      expires_at: transaction.pix?.expires_at || null,
    });
  } catch (error) {
    await logIntegrationError('checkout', `Erro ao criar o pedido: ${error.message}`, { details: { code: error.code || null, column: error.column || null } });
    return res.status(500).json({ error: 'Erro interno ao criar o pagamento' });
  }
};
