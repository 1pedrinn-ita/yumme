/**
 * Integração logística. Hoje: API oficial dos Correios (rastro SRO), que exige contrato com os Correios.
 * Variáveis de ambiente: CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO (gerado no portal CWS) e CORREIOS_CARTAO_POSTAGEM.
 * Sem elas a integração fica desligada: nenhum evento é criado, e o painel mostra "integração não configurada".
 * O formato da resposta segue a documentação pública do SRO Rastro; confirme no portal do contrato antes de ativar.
 */
const { sql, logIntegrationError } = require('./_db');
const { addEvent } = require('./_orders');

const CORREIOS_API = 'https://api.correios.com.br';
const correiosConfigured = () => Boolean(process.env.CORREIOS_USUARIO && process.env.CORREIOS_CODIGO_ACESSO && process.env.CORREIOS_CARTAO_POSTAGEM);
const isCorreios = (carrier) => /correios|sedex|pac/i.test(String(carrier || ''));

let cachedToken = null;
async function correiosToken() {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.value;
  const basic = Buffer.from(`${process.env.CORREIOS_USUARIO}:${process.env.CORREIOS_CODIGO_ACESSO}`).toString('base64');
  const response = await fetch(`${CORREIOS_API}/token/v1/autentica/cartaopostagem`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero: process.env.CORREIOS_CARTAO_POSTAGEM }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) throw Object.assign(new Error(`Autenticação nos Correios falhou (HTTP ${response.status})`), { details: data });
  cachedToken = { value: data.token, expiresAt: data.expiraEm ? new Date(data.expiraEm).getTime() : Date.now() + 30 * 60_000 };
  return cachedToken.value;
}

// Converte um evento do SRO Rastro na etapa correspondente. Códigos: PO postado; RO/DO em trânsito ou encaminhado;
// OEC saiu para entrega; BDE/BDI/BDR baixa (tipo 01 = entregue, outros tipos = entrega não realizada ou retirada).
function mapCorreiosEvent(event) {
  const code = String(event.codigo || '').toUpperCase();
  const type = String(event.tipo || '').padStart(2, '0');
  const text = `${event.descricao || ''} ${event.detalhe || ''}`.toLowerCase();
  const unitType = String(event.unidade?.tipo || '').toLowerCase();
  let step = 'atualizacao';
  if (code === 'PO') step = 'objeto_postado';
  else if (code === 'OEC') step = 'saiu_para_entrega';
  else if (['BDE', 'BDI', 'BDR'].includes(code)) step = type === '01' ? 'entregue' : /n[aã]o|ausente|recusad|endere[cç]o/.test(text) ? 'tentativa_nao_realizada' : 'atualizacao';
  else if (['RO', 'DO'].includes(code)) {
    if (/encaminhado/.test(text)) step = 'encaminhado';
    else if (/tratamento/.test(unitType)) step = 'unidade_tratamento';
    else if (/distribui/.test(unitType)) step = 'unidade_distribuicao';
    else step = 'em_transito';
  }
  const address = event.unidade?.endereco || {};
  // O SRO devolve a data sem fuso, no horário de Brasília (sem horário de verão desde 2019).
  const raw = String(event.dtHrCriado || '');
  const occurredAt = raw && !/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? `${raw}-03:00` : raw;
  const location = [event.unidade?.tipo, [address.cidade, address.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ') || null;
  return {
    code: step,
    description: [event.descricao, event.detalhe].filter(Boolean).join(' — ') || null,
    location,
    occurredAt: occurredAt || null,
    externalId: `${code}-${type}-${event.dtHrCriado}`,
  };
}

async function fetchCorreiosEvents(trackingCode) {
  const token = await correiosToken();
  const response = await fetch(`${CORREIOS_API}/srorastro/v1/objetos/${encodeURIComponent(trackingCode)}?resultado=T`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Consulta de rastreio nos Correios falhou (HTTP ${response.status})`), { details: data });
  const object = data.objetos?.[0] || {};
  // Objeto ainda sem movimentação (ex.: etiqueta gerada mas não postada) vem com "mensagem" e sem eventos.
  return { events: (object.eventos || []).map(mapCorreiosEvent), estimate: object.dtPrevista || null, message: object.mensagem || null };
}

/**
 * Busca as movimentações de um pedido na transportadora e grava as novas. Retorna um resumo para o painel.
 */
async function syncOrder(order) {
  const reference = order.reference;
  if (!order.carrier_tracking_code) return { ok: false, reason: 'Pedido ainda sem código oficial de rastreio.' };
  if (!isCorreios(order.carrier)) return { ok: false, reason: `Sem integração automática para "${order.carrier || 'transportadora'}". Lance as movimentações pelo painel.` };
  if (!correiosConfigured()) return { ok: false, reason: 'Integração com os Correios não configurada (faltam as credenciais do contrato).' };
  try {
    const result = await fetchCorreiosEvents(order.carrier_tracking_code);
    let added = 0;
    for (const event of result.events.filter((e) => e.occurredAt)) {
      if (await addEvent(reference, { ...event, source: 'correios' })) added += 1;
    }
    await sql`UPDATE orders SET logistics_synced_at = NOW(), delivery_estimate = COALESCE(${result.estimate ? String(result.estimate).slice(0, 10) : null}::date, delivery_estimate) WHERE reference = ${reference}`;
    return { ok: true, added, total: result.events.length, message: result.message };
  } catch (error) {
    await logIntegrationError('correios', error.message, { reference, details: error.details || null });
    await sql`UPDATE orders SET logistics_synced_at = NOW() WHERE reference = ${reference}`;
    return { ok: false, reason: error.message };
  }
}

module.exports = { syncOrder, mapCorreiosEvent, correiosConfigured, isCorreios };
