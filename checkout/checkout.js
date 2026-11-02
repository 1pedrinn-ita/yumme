const CONFIG = window.SHOP_CONFIG;
const params = new URLSearchParams(location.search);
const offerId = params.get('oferta') || CONFIG.defaultOffer;
const offer = CONFIG.offers.find((item) => item.id === offerId) || CONFIG.offers[0];
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const shipPrice = (option) => (option.price ? money(option.price) : 'Grátis');
const form = document.querySelector('#checkout-form');
const error = document.querySelector('#checkout-error');
const summary = document.querySelector('#order-summary');
const shippingOptions = CONFIG.shipping.options;
let shippingChoice = shippingOptions.find((option) => option.id === CONFIG.shipping.defaultOption) || shippingOptions[0];

summary.innerHTML = `<div class="order-product"><img src="${offer.image}" alt="${offer.label}"><div><strong>${offer.label}</strong><span>${offer.detail}</span></div><b>${money(offer.price)}</b></div>`;
// Transportadora ao lado de cada modalidade (logo autorizado do config ou ícone genérico).
const TRUCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h11v10H2zM13 10h5l3 3v3h-8z"/><circle cx="6.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>';
document.querySelector('#shipping-options').innerHTML = shippingOptions.map((option) => `<label class="shipping-option${option.recommended ? ' is-recommended' : ''}"><input type="radio" name="shipping" value="${option.id}"${option.id === shippingChoice.id ? ' checked' : ''}><span class="shipping-option__carrier">${option.logo ? `<img src="${option.logo}" alt="">` : TRUCK}<small>${option.carrier || CONFIG.shipping.carrier}</small></span><span class="shipping-option__text"><strong>${option.label}${option.recommended ? '<em class="shipping-badge">Recomendada</em>' : ''}</strong>${option.description ? `<small>${option.description}</small>` : ''}<small>${option.etaMinDays} a ${option.etaMaxDays} dias úteis</small></span><b>${shipPrice(option)}</b></label>`).join('');
const updateTotals = () => {
  document.querySelector('#order-subtotal').textContent = money(offer.price);
  document.querySelector('#order-shipping-label').textContent = shippingChoice.label;
  document.querySelector('#order-shipping').textContent = shipPrice(shippingChoice);
  document.querySelector('#order-total').textContent = money(offer.price + shippingChoice.price);
};
updateTotals();
form.addEventListener('change', (event) => {
  if (event.target.name !== 'shipping') return;
  shippingChoice = shippingOptions.find((option) => option.id === event.target.value) || shippingChoice;
  updateTotals();
});

const setError = (message = '') => { error.textContent = message; error.hidden = !message; };

// Consulta o pedido a cada 5 s (até 30 min) para mostrar o PIX assim que ficar pronto e a aprovação do pagamento.
async function watchPayment(initial, onChange) {
  let last = `${initial.status}|${initial.pix_code}`;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await fetch(`/api/pix-status?reference=${encodeURIComponent(initial.reference)}&t=${encodeURIComponent(initial.access_token || '')}`);
      if (!response.ok) continue;
      const current = await response.json();
      const key = `${current.status}|${current.pix_code}`;
      if (key !== last) { last = key; onChange(current); }
      if (current.status !== 'pending') return;
    } catch (_) { /* Rede instável: tenta de novo na próxima volta. */ }
  }
}
const digits = (value) => value.replace(/\D/g, '');

// Busca o endereço assim que o CEP tem 8 dígitos; só leva o cursor ao Número se o cliente ainda estiver no CEP.
let lastCep = '';
const lookupCep = async () => {
  const cep = digits(form.zipcode.value);
  if (cep.length !== 8 || cep === lastCep) return;
  lastCep = cep;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (data.erro) return;
    // Só preenche campo vazio ou que a própria busca preencheu (não apaga o que o cliente digitou).
    [['street', data.logradouro], ['neighborhood', data.bairro], ['city', data.localidade], ['state', data.uf]].forEach(([name, value]) => {
      if (!form[name].value || form[name].dataset.autofill === '1') { form[name].value = value || ''; form[name].dataset.autofill = '1'; }
    });
    if (document.activeElement === form.zipcode) form.number.focus();
  } catch (_) { lastCep = ''; /* O usuário ainda pode preencher o endereço manualmente. */ }
};
form.zipcode.addEventListener('input', lookupCep);
['street', 'neighborhood', 'city', 'state'].forEach((name) => form[name].addEventListener('input', (event) => { if (event.isTrusted) delete form[name].dataset.autofill; }));
form.zipcode.addEventListener('blur', lookupCep);

// Enter/"Ir" do teclado passa para o próximo campo em vez de enviar o formulário incompleto.
// Só campos de texto: ignora os ocultos utm_* da UTMify e as opções de entrega.
form.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.target.tagName !== 'INPUT') return;
  const inputs = [...form.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])')];
  const index = inputs.indexOf(event.target);
  const next = index === -1 ? null : inputs[index + 1];
  if (next) { event.preventDefault(); next.focus(); }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const button = form.querySelector('.checkout-submit');
  button.disabled = true;
  button.classList.add('is-loading');
  const data = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch(CONFIG.form.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offer: { id: offer.id, label: offer.label, qty: offer.qty },
        shipping: shippingChoice.id,
        customer: { name: data.name, email: data.email, phone: data.phone, document: data.document },
        address: { zipcode: data.zipcode, street: data.street, number: data.number, complement: data.complement, neighborhood: data.neighborhood, city: data.city, state: data.state },
        tracking: Object.fromEntries(params), payment_method: 'pix'
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível gerar o pagamento PIX.');
    const resultBox = document.createElement('div');
    resultBox.className = 'transparent-checkout__result';
    // Página de obrigado do pedido (token depois do "#"); antes do pagamento ela mostra "nenhum pedido" e o "voltar ao produto".
    const link = new URLSearchParams(params);
    link.set('oferta', offer.id);
    link.set('pedido', result.reference || '');
    const orderPage = `../obrigado/?${link}#t=${encodeURIComponent(result.access_token || '')}`;
    try { const saved = JSON.parse(localStorage.getItem('yumme_pedidos') || '{}'); saved[result.reference] = result.access_token; localStorage.setItem('yumme_pedidos', JSON.stringify(saved)); } catch (_) { /* o token segue no link */ }
    const showPayment = (current) => {
      const postSale = result.reference ? `<a href="${orderPage}" class="checkout-postsale" style="display:inline-block;margin-top:12px;">Abrir área de pós-venda</a>` : '';
      const pixCode = current.pix_code || '';
      const status = current.status || 'pending';
      const waiting = status === 'pending';
      const title = status === 'paid' ? 'Pagamento aprovado!' : waiting ? 'PIX gerado com sucesso' : 'Este PIX não está mais disponível';
      const lead = status === 'paid' ? 'Recebemos seu pagamento. Abrindo a página do seu pedido…'
        : !waiting ? 'Recarregue a página e gere um novo pagamento.'
        : pixCode ? 'Escaneie o QR Code ou copie o PIX Copia e Cola. Você não precisa sair desta página.' : 'Estamos gerando seu código PIX. Aguarde alguns segundos nesta tela.';
      resultBox.innerHTML = `<strong>${title}</strong><p>${lead}</p>${waiting && current.qr_code_image ? `<img src="${current.qr_code_image}" alt="QR Code do pagamento PIX">` : ''}${waiting && pixCode ? `<textarea readonly aria-label="PIX Copia e Cola">${pixCode}</textarea><button type="button" class="checkout-copy" data-copy-pix>Copiar PIX Copia e Cola</button>` : ''}${postSale}`;
      const copyButton = resultBox.querySelector('[data-copy-pix]');
      const copyPix = async () => {
        await navigator.clipboard.writeText(pixCode);
        copyButton.textContent = 'PIX copiado com sucesso';
      };
      copyButton?.addEventListener('click', copyPix);
      resultBox.querySelector('textarea')?.addEventListener('click', copyPix);
      // Pagamento aprovado: leva o cliente para a página de obrigado do pedido.
      if (status === 'paid' && result.access_token) setTimeout(() => window.location.assign(orderPage), 1500);
    };
    showPayment(result);
    form.hidden = true;
    form.parentElement.appendChild(resultBox);
    if (result.reference) watchPayment(result, showPayment);
  } catch (requestError) {
    setError(requestError.message || 'Não foi possível gerar o pagamento. Tente novamente.');
    button.disabled = false;
    button.classList.remove('is-loading');
  }
});
