const form = document.querySelector('#tracking-form');
const input = document.querySelector('#tracking-code');
const error = document.querySelector('#tracking-error');
const result = document.querySelector('#tracking-result');
const params = new URLSearchParams(location.search);
const initialCode = params.get('code');
const pendingOrder = params.get('pedido');
const UNPAID = ['pending', 'expired', 'failed'];
const { esc, money, priceOrFree, dateTime, progressHtml, timelineHtml, estimateText } = window.OrderTimeline;
const setError = (message = '') => { error.textContent = message; error.hidden = !message; };
let refreshTimer = null;

// Volta para o produto em que o checkout foi iniciado, mantendo a oferta e os parâmetros da campanha.
function productLink(offerId) {
  const back = new URLSearchParams(location.search);
  back.delete('code');
  back.delete('pedido');
  if (offerId) back.set('oferta', offerId);
  const query = back.toString();
  return `../produto/${query ? `?${query}` : ''}`;
}

// Enquanto o PIX não for pago, não existe pedido para acompanhar.
function showNoOrder(offerId) {
  result.innerHTML = `<div class="tracking-empty"><strong>Você ainda não gerou nenhum pedido.</strong><p>Seu pedido aparece aqui assim que o pagamento do PIX for confirmado.</p><a class="tracking-return" href="${esc(productLink(offerId))}">← Voltar para o produto e finalizar a compra</a></div>`;
  result.hidden = false;
}

if (initialCode) input.value = initialCode.trim().toUpperCase();

function showLocalSimulation(code) {
  const sessionCode = sessionStorage.getItem('yumme_private_tracking_code');
  const localCode = localStorage.getItem('yumme_private_tracking_code');
  if (!code.startsWith('YM-LOCAL-') || (code !== sessionCode && code !== localCode)) return false;
  result.innerHTML = `<p class="tracking-estimate"><strong>SIMULAÇÃO LOCAL</strong> — nenhum pagamento ou envio real foi realizado.</p><div class="tracking-summary"><div><span>Código de teste</span><strong>${esc(code)}</strong></div><div><span>Produto</span><strong>3 Potes Yumme Kids</strong><small>${money(97.9)}</small></div></div>`;
  result.hidden = false;
  return true;
}

function render(data) {
  const destination = [data.destination.city, data.destination.state].filter(Boolean).join(' - ');
  result.innerHTML = `
    <div class="tracking-code-box"><span>Código de acompanhamento</span><strong>${esc(data.trackingCode || data.code)}</strong>${data.carrier ? `<small>${esc(data.carrier.name)} · código oficial <b>${esc(data.carrier.code)}</b></small>` : '<small>O código oficial da transportadora aparece aqui depois da postagem.</small>'}</div>
    ${progressHtml(data)}
    <p class="tracking-estimate">${estimateText(data)}</p>
    <div class="tracking-summary">
      <div><span>Pedido</span><strong>${esc(data.reference)}</strong></div>
      <div><span>Destino</span><strong>${esc(destination)}</strong><small>CEP ${esc(data.destination.zipcode)}</small></div>
      <div><span>Produto</span><strong>${esc(data.product.label)}</strong><small>${money(data.product.price)}</small></div>
      <div><span>Entrega</span><strong>${esc(data.shipping.label)}</strong><small>${esc(priceOrFree(data.shipping.price))} · ${esc(data.shipping.eta)}</small></div>
      <div><span>Total pago</span><strong>${money(data.total)}</strong></div>
    </div>
    <h2 class="tracking-subtitle">Movimentações</h2>
    ${timelineHtml(data.events)}
    <p class="tracking-updated">Atualizado automaticamente · ${esc(dateTime(new Date()).time)}</p>`;
  result.hidden = false;
}

async function lookup(code, { quiet = false } = {}) {
  if (!quiet) { setError(''); result.hidden = true; }
  try {
    const response = await fetch(`/api/track-order?code=${encodeURIComponent(code)}`);
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Código não encontrado.');
    if (UNPAID.includes(data.payment?.status)) { showNoOrder(data.product?.id || params.get('oferta')); return; }
    render(data);
    // Status atualizado automaticamente enquanto a página estiver aberta.
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (document.visibilityState === 'visible') lookup(code, { quiet: true }); }, 60000);
  } catch (requestError) { if (!quiet) setError(requestError.message); }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = input.value.trim().toUpperCase(); if (!code) return;
  if (showLocalSimulation(code)) return;
  lookup(code);
});

if (initialCode) {
  setTimeout(() => form.requestSubmit(), 150);
} else if (pendingOrder) {
  // Link de pós-venda antigo (?pedido=): o acompanhamento do pedido agora fica na página de obrigado.
  location.replace(`../obrigado/${location.search}`);
}
