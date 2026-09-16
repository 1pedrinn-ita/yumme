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

  document.querySelectorAll('[data-offer-card]').forEach((card) => {
    const offer = CONFIG.offers.find((o) => o.id === card.dataset.offerCard);
    if (!offer) return;

    const qty = offer.qty || 1;
    const off = offer.oldPrice > offer.price ? Math.round((1 - offer.price / offer.oldPrice) * 100) : 0;
    const set = (key, value) => {
      const el = card.querySelector(`[data-o="${key}"]`);
      if (el) el.textContent = value;
    };

    card.setAttribute('href', `${CONFIG.routes.produto.replace(/^\.\.\//, '')}?oferta=${encodeURIComponent(offer.id)}`);
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
