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
    const pixCode = result.pix_code || result.qr_code || result.qrcode || result.copy_and_paste || result.brCode || '';
    const qrImage = result.qr_code_image || result.qrcode_image || result.qr_code_base64 || '';
    const resultBox = document.createElement('div');
    resultBox.className = 'transparent-checkout__result';
    resultBox.innerHTML = `<strong>PIX gerado com sucesso</strong><p>Escaneie o QR Code ou copie o PIX Copia e Cola. Você não precisa sair desta página.</p>${qrImage ? `<img src="${qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}" alt="QR Code do pagamento PIX">` : ''}${pixCode ? `<textarea readonly aria-label="PIX Copia e Cola">${pixCode}</textarea><button type="button" class="checkout-copy" data-copy-pix>Copiar PIX Copia e Cola</button>` : '<p>Pagamento criado. Aguarde a confirmação.</p>'}`;
    form.hidden = true;
    form.parentElement.appendChild(resultBox);
    const copyButton = resultBox.querySelector('[data-copy-pix]');
    const copyPix = async () => {
      await navigator.clipboard.writeText(pixCode);
      copyButton.textContent = 'PIX copiado com sucesso';
    };
    copyButton?.addEventListener('click', copyPix);
    resultBox.querySelector('textarea')?.addEventListener('click', copyPix);
  } catch (requestError) {
    setError(requestError.message || 'Não foi possível gerar o pagamento. Tente novamente.');
    button.disabled = false;
    button.classList.remove('is-loading');
  }
});
