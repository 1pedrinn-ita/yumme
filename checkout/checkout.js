const params = new URLSearchParams(location.search);
const offerId = params.get('oferta') || CONFIG.defaultOffer;
const offer = CONFIG.offers.find((item) => item.id === offerId) || CONFIG.offers[0];
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const form = document.querySelector('#checkout-form');
const error = document.querySelector('#checkout-error');
const summary = document.querySelector('#order-summary');

document.querySelector('#order-subtotal').textContent = money(offer.price);
document.querySelector('#order-total').textContent = money(offer.price);
summary.innerHTML = `<div class="order-product"><img src="${offer.image}" alt="${offer.label}"><div><strong>${offer.label}</strong><span>${offer.detail}</span></div><b>${money(offer.price)}</b></div>`;

const setError = (message = '') => { error.textContent = message; error.hidden = !message; };

// Consulta o pedido a cada 5 s (até 30 min) para mostrar o PIX assim que ficar pronto e a aprovação do pagamento.
async function watchPayment(initial, onChange) {
  let last = `${initial.status}|${initial.pix_code}`;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await fetch(`/api/pix-status?reference=${encodeURIComponent(initial.reference)}`);
      if (!response.ok) continue;
      const current = await response.json();
      const key = `${current.status}|${current.pix_code}`;
      if (key !== last) { last = key; onChange(current); }
      if (current.status !== 'pending') return;
    } catch (_) { /* Rede instável: tenta de novo na próxima volta. */ }
  }
}
const digits = (value) => value.replace(/\D/g, '');

form.zipcode.addEventListener('blur', async () => {
  const cep = digits(form.zipcode.value);
  if (cep.length !== 8) return;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();
    if (data.erro) return;
    form.street.value = data.logradouro || '';
    form.neighborhood.value = data.bairro || '';
    form.city.value = data.localidade || '';
    form.state.value = data.uf || '';
    form.number.focus();
  } catch (_) { /* O usuário ainda pode preencher o endereço manualmente. */ }
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
        offer: { id: offer.id, label: offer.label, price: offer.price, qty: offer.qty },
        customer: { name: data.name, email: data.email, phone: data.phone, document: data.document },
        address: { zipcode: data.zipcode, street: data.street, number: data.number, complement: data.complement, neighborhood: data.neighborhood, city: data.city, state: data.state },
        tracking: Object.fromEntries(params), payment_method: 'pix'
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível gerar o pagamento PIX.');
    const trackingCode = result.tracking_code || result.tracking?.code || '';
    if (trackingCode) {
      sessionStorage.setItem('yumme_private_tracking_code', trackingCode);
      window.__YUMME_PRIVATE_TRACKING__ = trackingCode;
      console.info('[YUMME] Código único de rastreio interno:', trackingCode);
    }

    const resultBox = document.createElement('div');
    resultBox.className = 'transparent-checkout__result';
    const postSale = trackingCode ? `<a href="../rastreio/?code=${encodeURIComponent(trackingCode)}" class="checkout-postsale" style="display:inline-block;margin-top:12px;">Abrir área de pós-venda</a>` : '';
    const showPayment = (current) => {
      const pixCode = current.pix_code || '';
      const status = current.status || 'pending';
      const waiting = status === 'pending';
      const title = status === 'paid' ? 'Pagamento aprovado!' : waiting ? 'PIX gerado com sucesso' : 'Este PIX não está mais disponível';
      const lead = status === 'paid' ? 'Recebemos seu pagamento. Seu pedido já está sendo preparado.'
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
