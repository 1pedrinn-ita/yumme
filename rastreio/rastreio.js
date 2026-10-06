const form = document.querySelector('#tracking-form');
const input = document.querySelector('#tracking-code');
const error = document.querySelector('#tracking-error');
const result = document.querySelector('#tracking-result');
const setError = (message = '') => { error.textContent = message; error.hidden = !message; };
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
form.addEventListener('submit', async (event) => {
  event.preventDefault(); setError(''); result.hidden = true;
  const code = input.value.trim().toUpperCase(); if (!code) return;
  try {
    const response = await fetch(`/api/track-order?code=${encodeURIComponent(code)}`);
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Código não encontrado.');
    result.innerHTML = `<div class="tracking-summary"><div><span>Pedido</span><strong>${data.reference}</strong></div><div><span>Destino</span><strong>${data.destination.city} - ${data.destination.state}</strong><small>CEP ${data.destination.zipcode}</small></div><div><span>Produto</span><strong>${data.product.label}</strong><small>${money(data.product.price)}</small></div></div><p class="tracking-estimate">${data.estimate}</p><ol class="tracking-steps">${data.steps.map((step) => `<li class="${step.done ? 'is-done' : ''} ${step.current ? 'is-current' : ''}"><i></i><span>${step.label}</span></li>`).join('')}</ol><p class="tracking-updated">Última atualização: ${new Date(data.updatedAt).toLocaleString('pt-BR')}</p>`;
    result.hidden = false;
  } catch (requestError) { setError(requestError.message); }
});
