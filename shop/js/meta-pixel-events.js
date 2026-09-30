(function () {
  'use strict';

  const config = window.SHOP_CONFIG || {};
  const sentEvents = new Set();

  function selectedOffer(id) {
    const offers = config.offers || [];
    const offerId = id || new URLSearchParams(window.location.search).get('oferta') || config.defaultOffer;
    return offers.find((offer) => offer.id === offerId) || offers[0];
  }

  function eventData(offer) {
    const product = config.product || {};
    const data = { content_type: 'product' };
    const currentOffer = offer || selectedOffer();

    if (product.name) data.content_name = product.name;
    if (config.currency) data.currency = config.currency;
    if (currentOffer) {
      data.content_ids = [String(currentOffer.id)];
      data.contents = [{
        id: String(currentOffer.id),
        quantity: currentOffer.qty || 1,
        item_price: Number(currentOffer.price),
      }];
      data.value = Number(currentOffer.price);
    }

    return data;
  }

  function track(eventName, offer) {
    if (sentEvents.has(eventName) || typeof window.fbq !== 'function') return;
    sentEvents.add(eventName);
    window.fbq('track', eventName, eventData(offer));
  }

  function trackViewContent() {
    track('ViewContent');
  }

  setTimeout(trackViewContent, 8000);
  window.addEventListener('scroll', () => {
    if (window.scrollY > 100) trackViewContent();
  }, { passive: true });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const checkoutTarget = target.closest('[data-action="buy"], [data-offer-card], a[href^="#checkout"]');
    if (checkoutTarget) {
      track('InitiateCheckout', selectedOffer(checkoutTarget.dataset.offerCard));
    }

    const addToCartTarget = target.closest('[data-action="add-to-cart"], [class*="add-to-cart"]');
    const text = target.closest('button, a, input[type="submit"]')?.textContent || '';
    if (addToCartTarget || /add to cart|adicionar ao carrinho/i.test(text)) {
      track('AddToCart', selectedOffer());
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target instanceof HTMLFormElement && event.target.matches('[data-form]')) {
      track('Lead', selectedOffer());
    }
  }, true);
})();