const form = document.querySelector('#tracking-form');
const input = document.querySelector('#tracking-code');
const error = document.querySelector('#tracking-error');
const result = document.querySelector('#tracking-result');
const params = new URLSearchParams(location.search);
const initialCode = params.get('code');
const pendingOrder = params.get('pedido');
const UNPAID = ['pending', 'expired', 'failed'];
const setError = (message = '') => { error.textContent = message; error.hidden = !message; };

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
  result.innerHTML = `<div class="tracking-empty"><strong>Você ainda não gerou nenhum pedido.</strong><p>Seu pedido aparece aqui assim que o pagamento do PIX for confirmado.</p><a class="tracking-return" href="${productLink(offerId)}">← Voltar para o produto e finalizar a compra</a></div>`;
  result.hidden = false;
}
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
if (initialCode) input.value = initialCode.trim().toUpperCase();

function showLocalSimulation(code) {
  const sessionCode = sessionStorage.getItem('yumme_private_tracking_code');
  const localCode = localStorage.getItem('yumme_private_tracking_code');
  if (!code.startsWith('YM-LOCAL-') || (code !== sessionCode && code !== localCode)) return false;

  const steps = ['Pedido simulado', 'Pagamento simulado', 'Em preparação', 'A caminho', 'Entregue'];
  result.innerHTML = `<p class="tracking-estimate"><strong>SIMULAÇÃO LOCAL</strong> — nenhum pagamento ou envio real foi realizado.</p><div class="tracking-summary"><div><span>Código de teste</span><strong>${code}</strong></div><div><span>Destino</span><strong>São Paulo - SP</strong><small>Dados fictícios</small></div><div><span>Produto</span><strong>3 Potes Yumme Kids</strong><small>${money(97.9)}</small></div></div><p class="tracking-estimate">Status simulado: pagamento aguardando confirmação</p><ol class="tracking-steps">${steps.map((label, index) => `<li class="${index === 0 ? 'is-done' : ''} ${index === 1 ? 'is-current' : ''}"><i></i><span>${label}</span></li>`).join('')}</ol><p class="tracking-updated">Demonstração local · ${new Date().toLocaleString('pt-BR')}</p>`;
  result.hidden = false;
  return true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); setError(''); result.hidden = true;
  const code = input.value.trim().toUpperCase(); if (!code) return;
  if (showLocalSimulation(code)) return;
  try {
    const response = await fetch(`/api/track-order?code=${encodeURIComponent(code)}`);
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Código não encontrado.');
    if (UNPAID.includes(data.status)) { showNoOrder(data.product?.id || params.get('oferta')); return; }
    result.innerHTML = `<div class="tracking-summary"><div><span>Pedido</span><strong>${data.reference}</strong></div><div><span>Destino</span><strong>${data.destination.city} - ${data.destination.state}</strong><small>CEP ${data.destination.zipcode}</small></div><div><span>Produto</span><strong>${data.product.label}</strong><small>${money(data.product.price)}</small></div></div><p class="tracking-estimate">${data.estimate}</p><ol class="tracking-steps">${data.steps.map((step) => `<li class="${step.done ? 'is-done' : ''} ${step.current ? 'is-current' : ''}"><i></i><span>${step.label}</span></li>`).join('')}</ol><p class="tracking-updated">Última atualização: ${new Date(data.updatedAt).toLocaleString('pt-BR')}</p>`;
    result.hidden = false;
  } catch (requestError) { setError(requestError.message); }
});

if (initialCode) {
  setTimeout(() => form.requestSubmit(), 150);
} else if (pendingOrder) {
  // Vindo do checkout antes do pagamento: o código de rastreio só é liberado depois que o PIX é pago.
  (async () => {
    try {
      const response = await fetch(`/api/pix-status?reference=${encodeURIComponent(pendingOrder)}`);
      const data = await response.json();
      if (response.ok && data.tracking_code) { input.value = data.tracking_code; form.requestSubmit(); return; }
    } catch (_) { /* Sem resposta: trata como pedido ainda não pago. */ }
    showNoOrder(params.get('oferta'));
  })();
}
