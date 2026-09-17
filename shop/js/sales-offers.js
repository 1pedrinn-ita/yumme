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
  // Comparativo: anima os itens quando a seção entra na tela
  const vs = document.querySelector('.yk-vs');
  if (vs) {
    if (!('IntersectionObserver' in window)) vs.classList.add('is-visible');
    else {
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        vs.classList.add('is-visible');
        io.disconnect();
      }, { rootMargin: '0px 0px -15% 0px' });
      io.observe(vs);
    }
  }
  /* ---------- Rolagem suave até as ofertas ----------
     Os CTAs (#checkout) descem a página com animação, em vez de saltar.
     Antes de animar, as imagens pendentes acima do destino são carregadas:
     sem isso a página ainda é curta e o navegador trava a rolagem no fim do documento. */
  const SCROLL_MS = 1100;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function loadImagesAbove(limitY) {
    document.querySelectorAll('img[data-src], img[data-srcset], img[loading="lazy"]').forEach((img) => {
      if (img.getBoundingClientRect().top + window.pageYOffset > limitY + 600) return;
      if (img.dataset.srcset) { img.srcset = img.dataset.srcset; delete img.dataset.srcset; }
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
      img.loading = 'eager';
    });
  }

  // O tema define html { scroll-behavior: smooth }, o que transformaria cada passo
  // da animação em outra rolagem animada. Durante o efeito, voltamos para 'auto'.
  function scrollToTarget(el) {
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    const restore = () => { root.style.scrollBehavior = previousBehavior; };
    const from = window.pageYOffset;
    const targetY = () => el.getBoundingClientRect().top + window.pageYOffset - 12;
    loadImagesAbove(targetY());

    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / SCROLL_MS);
      const to = targetY();
      window.scrollTo(0, from + (to - from) * easeInOut(t));
      if (t < 1) { requestAnimationFrame(step); return; }
      // A altura da página pode ter crescido durante a animação: completa o trecho que faltou.
      if (Math.abs(window.pageYOffset - targetY()) > 4) catchUp(); else restore();
    };

    function catchUp() {
      const t1 = performance.now();
      const loop = (now) => {
        const to = targetY();
        const diff = to - window.pageYOffset;
        if (Math.abs(diff) < 2 || now - t1 > 900) { window.scrollTo(0, to); restore(); return; }
        window.scrollTo(0, window.pageYOffset + diff * 0.18);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    if (window.jQuery) window.jQuery('html, body').stop(true);
    requestAnimationFrame(step);
  }

  // Captura antes do Elementor: ele tem a própria animação de âncora, e as duas
  // ao mesmo tempo faziam a rolagem travar no começo.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (window.jQuery) window.jQuery('html, body').stop(true);
    history.replaceState(null, '', '#' + id);
    scrollToTarget(target);
  }, true);

})();
