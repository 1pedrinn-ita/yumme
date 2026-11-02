/**
 * Página de obrigado: aberta pelo checkout assim que o PIX é aprovado. Mostra só dados reais do pedido
 * (/api/order, protegido pelo token do comprador) e se atualiza sozinha.
 */
(function () {
  'use strict';

  const { esc, money, priceOrFree, dateTime, icon, progressHtml, timelineHtml, estimateText } = window.OrderTimeline;
  const CONFIG = window.SHOP_CONFIG;
  const root = document.querySelector('#order-root');
  const params = new URLSearchParams(location.search);
  const reference = params.get('pedido') || '';
  const token = window.__ORDER_TOKEN__ || (() => { try { return JSON.parse(localStorage.getItem('yumme_pedidos') || '{}')[reference]; } catch (_) { return null; } })();
  let timer = null;

  const offerImage = (id) => (CONFIG.offers.find((offer) => offer.id === String(id)) || {}).image || '';
  // Volta para o produto em que o checkout foi iniciado, mantendo a oferta e os parâmetros da campanha.
  function productLink(offerId) {
    const back = new URLSearchParams(location.search);
    back.delete('pedido');
    if (offerId) back.set('oferta', offerId);
    const query = back.toString();
    return `../produto/${query ? `?${query}` : ''}`;
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => (document.visibilityState === 'visible' ? load() : schedule(ms)), ms);
  }

  function noOrder(offerId) {
    root.innerHTML = `<section class="order-card order-message"><strong>Você ainda não gerou nenhum pedido.</strong>
      <p>Seu pedido aparece aqui assim que o pagamento do PIX for confirmado.</p>
      <div class="order-actions" style="justify-content:center"><a class="order-button" href="${esc(productLink(offerId))}">← Voltar para o produto e finalizar a compra</a></div></section>`;
  }

  function addressText(address) {
    if (!address) return '';
    const line1 = [address.street, address.number].filter(Boolean).join(', ');
    return [line1, address.complement, address.neighborhood, [address.city, address.state].filter(Boolean).join(' - '), address.zipcode && `CEP ${address.zipcode}`].filter(Boolean).join(' · ');
  }

  function render(order) {
    const created = dateTime(order.createdAt);
    const paid = order.paidAt ? dateTime(order.paidAt) : null;
    const support = CONFIG.store?.support || {};
    const invoice = order.invoice.status === 'emitida'
      ? `<span class="order-badge order-badge--ok">Emitida</span><strong>NF-e nº ${esc(order.invoice.number)}${order.invoice.series ? ` · série ${esc(order.invoice.series)}` : ''}</strong>${order.invoice.url ? `<small><a href="${esc(order.invoice.url)}" target="_blank" rel="noopener noreferrer">Ver nota fiscal (DANFE)</a></small>` : ''}`
      : '<span class="order-badge order-badge--wait">Em emissão</span><small>A nota fiscal é emitida pela loja antes do envio, sem nenhum custo para você. Assim que for emitida, ela aparece aqui.</small>';
    const carrier = order.carrier
      ? `<span class="order-badge order-badge--ok">${esc(order.carrier.name)}</span><div class="order-code"><code>${esc(order.carrier.code)}</code><button class="order-copy" type="button" data-copy="${esc(order.carrier.code)}">Copiar</button></div><small>Código oficial da transportadora.</small>`
      : '<span class="order-badge order-badge--wait">Aguardando postagem</span><small>O código da transportadora aparece aqui assim que a etiqueta de envio for gerada.</small>';

    root.innerHTML = `
      <section class="order-card order-hero">
        <div class="order-hero__check">${icon('check')}</div>
        <h1>${order.customer?.firstName ? `Obrigado, ${esc(order.customer.firstName)}!` : 'Obrigado!'} Seu pedido foi confirmado.</h1>
        <p>Pedido realizado em ${esc(created.date)} às ${esc(created.time)}.</p>
        <span class="order-hero__number">Pedido nº ${esc(order.reference)}</span>
      </section>
      <section class="order-card" aria-labelledby="order-status-title">
        <h2 id="order-status-title">Situação do pedido</h2>
        <div class="order-status">
          <div class="order-status__item"><span>Pagamento</span><span class="order-badge order-badge--ok">Aprovado</span><small>PIX confirmado${paid ? ` em ${esc(paid.date)} às ${esc(paid.time)}` : ''}.</small></div>
          <div class="order-status__item"><span>Nota fiscal</span>${invoice}</div>
          <div class="order-status__item"><span>Envio</span><strong>${esc(order.shipping.label)} · ${esc(priceOrFree(order.shipping.price))}</strong><small>Prazo de ${esc(order.shipping.eta)} após a confirmação do pagamento.</small></div>
          <div class="order-status__item"><span>Código de rastreio</span>${carrier}</div>
        </div>
        <div class="order-status__item" style="margin-top:12px"><span>Código de acompanhamento da loja</span><div class="order-code"><code>${esc(order.trackingCode)}</code><button class="order-copy" type="button" data-copy="${esc(order.trackingCode)}">Copiar</button></div><small>Use este código na página de rastreio da Yumme Kids.</small></div>
      </section>
      <section class="order-card" aria-labelledby="order-progress-title">
        <h2 id="order-progress-title">Acompanhamento</h2>
        ${progressHtml(order)}
        <p class="order-estimate">${estimateText(order)}</p>
      </section>
      <section class="order-card" aria-labelledby="order-events-title">
        <h2 id="order-events-title">Movimentações</h2>
        ${timelineHtml(order.events)}
      </section>
      <section class="order-card" aria-labelledby="order-summary-title">
        <h2 id="order-summary-title">Resumo da compra</h2>
        <div class="order-summary"><img src="${esc(offerImage(order.product.id))}" alt="${esc(order.product.label)}"><div><strong>${esc(order.product.label)}</strong><small>${esc(order.product.detail)}</small></div><b>${money(order.product.price)}</b></div>
        <div class="order-lines"><div><span>Produto</span><span>${money(order.product.price)}</span></div><div><span>${esc(order.shipping.label)}</span><span>${esc(priceOrFree(order.shipping.price))}</span></div><div><span>Total pago</span><span>${money(order.total)}</span></div></div>
        ${order.address ? `<p class="order-address"><strong>Entrega em:</strong> ${esc(addressText(order.address))}</p>` : ''}
      </section>
      <section class="order-card" aria-labelledby="order-help-title">
        <h2 id="order-help-title">Precisa de ajuda?</h2>
        <p class="order-help">Fale com a gente${support.email ? ` pelo e-mail <a href="mailto:${esc(support.email)}">${esc(support.email)}</a>` : ''}${support.phone ? ` ou pelo telefone ${esc(support.phone)}` : ''} e informe o número do pedido.</p>
        <div class="order-actions"><a class="order-button" href="../rastreio/?code=${encodeURIComponent(order.trackingCode)}">Acompanhar pelo rastreio</a><a class="order-button order-button--ghost" href="../">Voltar para a loja</a></div>
      </section>
      <p class="order-updated">Esta página se atualiza sozinha · última atualização às ${esc(dateTime(new Date()).time)}</p>`;

    root.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copiado'; } catch (_) { button.textContent = 'Copie manualmente'; }
    }));
  }

  async function load() {
    if (!reference || !token) return noOrder(params.get('oferta'));
    try {
      const response = await fetch(`/api/order?pedido=${encodeURIComponent(reference)}&t=${encodeURIComponent(token)}`);
      if (response.status === 400 || response.status === 404) return noOrder(params.get('oferta'));
      const order = await response.json();
      if (!response.ok) throw new Error(order.error);
      if (!order.payment.paid) {
        // Sem pagamento não há pedido; se o PIX ainda pode ser pago, continua verificando e mostra o pedido quando aprovar.
        noOrder(params.get('oferta') || order.product?.id);
        if (order.payment.status === 'pending') schedule(5000);
        return;
      }
      render(order);
      schedule(60000);
    } catch (_) {
      if (!root.querySelector('.order-hero')) root.innerHTML = '<section class="order-card order-message"><strong>Não foi possível carregar seu pedido agora.</strong><p>Vamos tentar de novo em instantes.</p></section>';
      schedule(15000);
    }
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  load();
})();
