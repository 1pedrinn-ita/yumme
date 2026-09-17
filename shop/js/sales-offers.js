/**
 * Cards de oferta da página de vendas (index.html).
 * Os valores vêm de SHOP_CONFIG.offers — a mesma fonte da página de produto —
 * então alterar um preço no config.js atualiza os dois lugares.
 */
(function () {
  'use strict';

  const CONFIG = window.SHOP_CONFIG;
  if (!CONFIG) return;

  const fmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency });
  const money = (n) => fmt.format(n).replace(/ /g, ' ');
  const installments = CONFIG.installments || 12;

  /**
   * Destino dos cards: "produto" (padrão) abre a página de produto;
   * "checkout" vai direto ao checkout da Pingupag.
   * Para simular sem alterar o site, abra com ?destino=checkout (ou ?destino=produto).
   */
  const search = new URLSearchParams(window.location.search);
  const target = search.get("destino") || CONFIG.salesCardsTarget || "produto";
  const TRACKING = /^(utm_[a-z]+|fbclid|gclid|ttclid|src|sck)$/i;

  function withTracking(link) {
    const url = new URL(link, window.location.href);
    search.forEach((value, key) => { if (TRACKING.test(key)) url.searchParams.set(key, value); });
    return url.toString();
  }

  function destination(offer) {
    if (target === "checkout" && offer.checkoutUrl) return withTracking(offer.checkoutUrl);
    const produto = CONFIG.routes.produto.replace(/^[.][.][/]/, "");
    return withTracking(produto + "?oferta=" + encodeURIComponent(offer.id));
  }

  // Demais links internos para a página de produto (CTAs da página) também levam os parâmetros de campanha
  document.querySelectorAll('a[href^="produto/"]:not([data-offer-card])').forEach((link) => {
    link.setAttribute('href', withTracking(link.getAttribute('href')));
  });

  document.querySelectorAll('[data-offer-card]').forEach((card) => {
    const offer = CONFIG.offers.find((o) => o.id === card.dataset.offerCard);
    if (!offer) return;

    const qty = offer.qty || 1;
    const off = offer.oldPrice > offer.price ? Math.round((1 - offer.price / offer.oldPrice) * 100) : 0;
    const set = (key, value) => {
      const el = card.querySelector(`[data-o="${key}"]`);
      if (el) el.textContent = value;
    };

    card.setAttribute('href', destination(offer));
    card.setAttribute('aria-label', `Comprar ${qty} ${qty > 1 ? 'potes' : 'pote'} de Yumme Kids por ${money(offer.price)}`);
    card.classList.toggle('yk-offer--no-discount', !off);

    set('discount', off ? `${off}% de desconto` : 'Sem desconto');
    set('qty', `Leve ${qty} ${qty > 1 ? 'potes' : 'pote'}`);
    set('title', `${qty} Yumme Kids`);
    set('unit', `Cada pote sai por ${money(offer.price / qty)}`);
    set('old', off ? money(offer.oldPrice) : '');
    set('installments', `Por ${installments}x sem juros de`);
    set('installment', money(Math.round((offer.price / installments) * 100) / 100));
    set('cash', `ou ${money(offer.price)} à vista`);
  });
})();
