/**
 * Página de produto (/produto)
 * Renderiza os blocos a partir de SHOP_CONFIG e controla as interações.
 */
(function () {
  'use strict';

  const { CONFIG, $, $$, esc, money, compact, discount, deliveryWindow, params, getOffer, clampQty,
    store, icon, stars, media, hydrateMedia, footer, toast, sheet, reveal, navigate, goBack, setLoading } = window.Shop;

  const { product, shipping } = CONFIG;

  const state = {
    offer: getOffer(params().get('oferta')),
    qty: clampQty(params().get('qtd')),
    reviewFilter: 'all',
    reviewPage: 1,
  };

  const mount = (name, html) => {
    const el = $(`[data-mount="${name}"]`);
    if (el) el.innerHTML = html;
    return el;
  };

  /* ---------- Blocos reutilizáveis ---------- */
  const cardHead = (title, aside = '') =>
    `<header class="card__head"><h2 class="card__title">${esc(title)}</h2>${aside}</header>`;

  const priceBlock = (offer) => {
    const off = discount(offer.price, offer.oldPrice);
    return `<div class="price-row">
      <span class="price" data-bind="price">${esc(money(offer.price))}</span>
      ${offer.oldPrice > offer.price ? `<s class="price-old" data-bind="old-price">${esc(money(offer.oldPrice))}</s>` : ''}
      ${off ? `<span class="badge-off" data-bind="discount">-${off}%</span>` : ''}
    </div>`;
  };

  const buyButton = (extraClass = '') =>
    `<button class="btn btn--primary btn--shine ${extraClass}" type="button" data-action="buy">
      <span class="btn__stack">
        <span class="btn__label">Comprar agora</span>
        <span class="btn__sub" data-bind="total">${esc(money(state.offer.price * state.qty))}</span>
      </span>
    </button>`;

  /* ---------- Galeria ---------- */
  function renderGallery() {
    const imgs = product.images;
    const el = mount('gallery', `
      <div class="gallery" aria-roledescription="carrossel" aria-label="Galeria de imagens">
        <div class="gallery__track" tabindex="0">
          ${imgs.map((img, i) => `<div class="gallery__slide" role="group" aria-label="${i + 1} de ${imgs.length}">
            ${media(img, { eager: i === 0, label: `Imagem ${i + 1}` })}
          </div>`).join('')}
        </div>
        <button class="gallery__nav gallery__nav--prev" type="button" aria-label="Imagem anterior">${icon('left')}</button>
        <button class="gallery__nav gallery__nav--next" type="button" aria-label="Próxima imagem">${icon('right')}</button>
        <span class="gallery__count" aria-live="polite"><span data-bind="slide">1</span>/${imgs.length}</span>
      </div>
      <div class="gallery__thumbs">
        ${imgs.map((img, i) => `<button class="gallery__thumb" type="button" data-slide="${i}" aria-label="Ver imagem ${i + 1}" aria-current="${i === 0}">
          ${media(img)}
        </button>`).join('')}
      </div>`);

    const track = $('.gallery__track', el);
    const prev = $('.gallery__nav--prev', el);
    const next = $('.gallery__nav--next', el);
    const thumbs = $$('.gallery__thumb', el);
    const counter = $('[data-bind="slide"]', el);
    let current = 0;

    const goTo = (i) => track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });

    const sync = () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i === current) return;
      current = i;
      counter.textContent = i + 1;
      thumbs.forEach((t, n) => t.setAttribute('aria-current', String(n === i)));
      thumbs[i] && thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      prev.disabled = i === 0;
      next.disabled = i === imgs.length - 1;
    };

    let ticking = false;
    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { sync(); ticking = false; });
    }, { passive: true });

    prev.disabled = true;
    prev.addEventListener('click', () => goTo(current - 1));
    next.addEventListener('click', () => goTo(current + 1));
    thumbs.forEach((t) => t.addEventListener('click', () => goTo(+t.dataset.slide)));
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min(current + 1, imgs.length - 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.max(current - 1, 0)); }
    });
  }

  /* ---------- Oferta relâmpago ---------- */
  function renderFlash() {
    const { flashSale } = CONFIG;
    if (!flashSale.enabled) return;

    const KEY = 'shop:flash-end';
    let end = store.get(KEY, 'sessionStorage');
    if (!end || end < Date.now()) {
      end = Date.now() + flashSale.minutes * 60000;
      store.set(KEY, end, 'sessionStorage');
    }

    const el = mount('flash', `
      <div class="flash" role="timer" aria-label="Tempo restante da oferta">
        <span class="flash__label">${icon('zap', 'i--sm')}${esc(flashSale.label)}</span>
        <span class="flash__timer">Termina em <b data-t="h">00</b>:<b data-t="m">00</b>:<b data-t="s">00</b></span>
      </div>`);

    const slots = { h: $('[data-t="h"]', el), m: $('[data-t="m"]', el), s: $('[data-t="s"]', el) };
    const pad = (n) => String(n).padStart(2, '0');

    const tick = () => {
      let left = end - Date.now();
      if (left <= 0) {
        end = Date.now() + flashSale.minutes * 60000;
        store.set(KEY, end, 'sessionStorage');
        left = end - Date.now();
      }
      const t = Math.floor(left / 1000);
      const values = { h: pad(Math.floor(t / 3600)), m: pad(Math.floor((t % 3600) / 60)), s: pad(t % 60) };
      Object.keys(slots).forEach((k) => {
        if (slots[k].textContent === values[k]) return;
        slots[k].innerHTML = `<span class="tick">${values[k]}</span>`;
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- Resumo ---------- */
  function renderSummary() {
    const stockPct = Math.max(8, Math.min(100, 100 - product.stock));
    mount('summary', `
      <div class="summary">
        <div data-bind="price-block">${priceBlock(state.offer)}</div>
        <div class="coupons">
          ${product.coupons.map((c, i) => `<span class="chip ${i === 1 ? 'chip--ship' : 'chip--dashed'}">${icon(i === 1 ? 'truck' : 'ticket', 'i--sm')}${esc(c)}</span>`).join('')}
        </div>
        <h1 class="summary__title">${esc(product.name)}</h1>
        <div class="summary__meta">
          ${reviewStats()
    ? `${stars(reviewStats().avg)}<strong>${reviewStats().avg.toFixed(1)}</strong>
          <a class="link-btn" href="#avaliacoes">(${reviewStats().count} avaliações)</a>`
    : `<a class="link-btn" href="#avaliacoes">${icon('play', 'i--sm')} Ver depoimentos</a>`}
          <span class="dot" aria-hidden="true"></span>
          <span><strong>${esc(compact(product.sold))}</strong> vendidos</span>
        </div>
        <div class="stock">
          <div class="stock__bar"><span style="width:${stockPct}%"></span></div>
          <div class="stock__text"><span>Restam apenas ${product.stock} unidades</span><span>${stockPct}% vendido</span></div>
        </div>
      </div>
      <div class="cta-inline">${buyButton('btn--block btn--xl')}</div>`);
    $$('[data-bind="product-name"]').forEach((el) => { el.textContent = product.name; });
  }

  /* ---------- Opções + quantidade ---------- */
  function renderOffers() {
    const el = mount('offers', `
      ${cardHead('Escolha sua opção', `<span class="chip">${CONFIG.offers.length} opções</span>`)}
      <div class="card__body">
        <div class="offers" role="radiogroup" aria-label="Opções do produto">
          ${CONFIG.offers.map((o) => `
            <button class="offer" type="button" role="radio" data-offer="${esc(o.id)}" aria-checked="${o.id === state.offer.id}">
              <span class="offer__radio">${icon('check')}</span>
              ${media({ src: o.image, alt: o.label })}
              <span>
                <span class="offer__name">${esc(o.label)}</span>
                <span class="offer__detail">${esc(o.detail)}</span>
              </span>
              <span class="offer__price">
                <strong>${esc(money(o.price))}</strong>
                ${o.oldPrice > o.price ? `<s>${esc(money(o.oldPrice))}</s>` : ''}
              </span>
              ${o.badge ? `<span class="offer__badge">${esc(o.badge)}</span>` : ''}
            </button>`).join('')}
        </div>
        <div class="qty-row">
          <span>Quantidade</span>
          <div class="qty" data-qty>
            <button type="button" data-step="-1" aria-label="Diminuir quantidade">${icon('minus', 'i--sm')}</button>
            <output aria-live="polite">${state.qty}</output>
            <button type="button" data-step="1" aria-label="Aumentar quantidade">${icon('plus', 'i--sm')}</button>
          </div>
        </div>
      </div>`);

    el.addEventListener('click', (e) => {
      const offerBtn = e.target.closest('[data-offer]');
      if (offerBtn) {
        state.offer = getOffer(offerBtn.dataset.offer);
        $$('[data-offer]', el).forEach((b) => b.setAttribute('aria-checked', String(b === offerBtn)));
        updatePrice();
        return;
      }
      const stepBtn = e.target.closest('[data-step]');
      if (stepBtn) {
        state.qty = clampQty(state.qty + Number(stepBtn.dataset.step));
        updatePrice();
      }
    });

    // Navegação por setas dentro do radiogroup
    $('.offers', el).addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const items = $$('[data-offer]', el);
      const i = items.indexOf(document.activeElement);
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const nextItem = items[(i + dir + items.length) % items.length];
      nextItem.focus();
      nextItem.click();
    });
  }

  function updatePrice() {
    const bump = (node) => {
      if (!node) return;
      node.classList.remove('tick');
      void node.offsetWidth;
      node.classList.add('tick');
    };
    const block = $('[data-bind="price-block"]');
    if (block) { block.innerHTML = priceBlock(state.offer); bump($('.price', block)); }

    const total = money(state.offer.price * state.qty);
    $$('[data-bind="total"]').forEach((n) => { n.textContent = total; bump(n); });

    const qty = $('[data-qty]');
    if (qty) {
      $('output', qty).textContent = state.qty;
      $('[data-step="-1"]', qty).disabled = state.qty <= 1;
      $('[data-step="1"]', qty).disabled = state.qty >= CONFIG.maxQty;
    }
    history.replaceState(null, '', `?oferta=${encodeURIComponent(state.offer.id)}&qtd=${state.qty}`);
  }

  /* ---------- Frete e garantia ---------- */
  function renderShipping() {
    const eta = deliveryWindow();
    const shipLabel = shipping.free ? 'Frete grátis' : `Frete ${money(shipping.price)}`;

    const el = mount('shipping', `
      <ul class="info-rows">
        <li>
          <button class="info-row info-row--ship" type="button" data-sheet="shipping">
            ${icon('truck')}
            <span>
              <span class="info-row__title">${esc(shipLabel)} ${shipping.free ? '<span class="chip chip--ship">Grátis</span>' : ''}</span>
              <span class="info-row__text">Receba entre <strong>${esc(eta.from)}</strong> e <strong>${esc(eta.to)}</strong></span>
            </span>
            ${icon('right')}
          </button>
        </li>
        <li>
          <button class="info-row" type="button" data-sheet="guarantees">
            ${icon('shield')}
            <span>
              <span class="info-row__title">Garantia e proteção</span>
              <span class="guarantee-tags info-row__text">
                ${CONFIG.guarantees.map((g) => `<span>${icon('check')}${esc(g.title)}</span>`).join('')}
              </span>
            </span>
            ${icon('right')}
          </button>
        </li>
      </ul>`);

    const featureList = (items) => `<ul class="feature-list">${items.map((it) => `
      <li><span class="feature-list__icon">${icon(it.icon)}</span><div><strong>${esc(it.title)}</strong><p>${esc(it.text)}</p></div></li>`).join('')}</ul>`;

    const sheets = {
      shipping: () => sheet({
        title: 'Frete e entrega',
        body: featureList([
          { icon: 'truck', title: shipLabel, text: `Enviado por ${shipping.carrier}.` },
          { icon: 'clock', title: 'Prazo estimado', text: `Entre ${eta.from} e ${eta.to} (${shipping.etaMinDays} a ${shipping.etaMaxDays} dias úteis).` },
          { icon: 'package', title: 'Rastreamento', text: 'Código de rastreio enviado após a postagem.' },
        ]),
      }),
      guarantees: () => sheet({ title: 'Garantia e proteção', body: featureList(CONFIG.guarantees) }),
    };

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sheet]');
      if (btn) sheets[btn.dataset.sheet]();
    });
  }

  /* ---------- Loja ---------- */
  function renderStore() {
    const s = CONFIG.store;
    mount('store', `
      <div class="shop-card" id="loja">
        ${media({ src: s.logo, alt: s.name }, { cls: 'shop-card__logo' })}
        <div>
          <div class="shop-card__name">${esc(s.name)} ${icon('badge')}</div>
          <div class="shop-card__stats">
            <span><b>${s.rating.toFixed(1)}</b> nota</span>
            <span><b>${esc(compact(s.followers))}</b> seguidores</span>
            <span><b>${esc(s.responseRate)}</b> resposta</span>
          </div>
        </div>
      </div>`);
  }

  /* ---------- Tabs com scrollspy ---------- */
  function renderTabs() {
    const sections = [
      ['beneficios', 'Destaques'],
      ['avaliacoes', 'Avaliações'],
      ['duvidas', 'Dúvidas'],
    ];
    const nav = mount('tabs', sections.map(([id, label], i) =>
      `<a href="#${id}" aria-current="${i === 0}">${label}</a>`).join(''));

    if (!('IntersectionObserver' in window)) return;
    const links = $$('a', nav);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.setAttribute('aria-current', String(a.hash === `#${entry.target.id}`)));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(([id]) => { const s = document.getElementById(id); s && io.observe(s); });
  }

  /* ---------- Benefícios ---------- */
  function renderBenefits() {
    mount('benefits', `
      ${cardHead('Destaques')}
      <div class="card__body">
        <div class="benefits">
          ${CONFIG.benefits.map((b) => `
            <article class="benefit">
              <span class="benefit__icon">${icon(b.icon)}</span>
              <strong>${esc(b.title)}</strong>
              <p>${esc(b.text)}</p>
            </article>`).join('')}
        </div>
      </div>`);
  }

  /* ---------- Avaliações ---------- */
  const REVIEW_FILTERS = [
    ['all', 'Todas', () => true],
    ['photos', 'Com fotos', (r) => r.photos && r.photos.length > 0],
    ['5', '5 estrelas', (r) => r.rating === 5],
    ['4', '4 estrelas', (r) => r.rating === 4],
  ];

  const reviewItems = () => CONFIG.reviews.items || [];

  /** Média e distribuição calculadas somente a partir das avaliações cadastradas. */
  function reviewStats() {
    const items = reviewItems();
    if (!items.length) return null;
    const avg = items.reduce((sum, r) => sum + r.rating, 0) / items.length;
    const dist = {};
    [5, 4, 3, 2, 1].forEach((n) => {
      dist[n] = Math.round((items.filter((r) => Math.round(r.rating) === n).length / items.length) * 100);
    });
    return { avg, count: items.length, dist };
  }

  const filteredReviews = () => {
    const [, , test] = REVIEW_FILTERS.find(([key]) => key === state.reviewFilter);
    return reviewItems().filter(test);
  };

  const reviewItem = (r) => {
    const initials = r.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    return `<article class="review">
      <div class="review__head">
        <span class="review__avatar" aria-hidden="true">${esc(initials)}</span>
        <div>
          <div class="review__name">${esc(r.name)}</div>
          ${stars(r.rating)}
        </div>
        <time class="review__date" datetime="${esc(r.date)}">${esc(window.Shop.longDate(r.date))}</time>
      </div>
      ${r.variant ? `<p class="review__variant">Opção: ${esc(r.variant)}</p>` : ''}
      <p class="review__text">${esc(r.text)}</p>
      ${r.photos && r.photos.length ? `<div class="review__photos">${r.photos.map((src, i) => media({ src, alt: `Foto ${i + 1} enviada pelo cliente` })).join('')}</div>` : ''}
      <div class="review__foot">
        <button class="helpful" type="button" aria-pressed="false" data-count="${r.helpful || 0}">
          ${icon('thumb')}<span>Útil (${r.helpful || 0})</span>
        </button>
      </div>
    </article>`;
  };

  const reviewSkeleton = () => `<div class="review-skeleton" aria-hidden="true">
    <div class="review-skeleton__head"><span class="skeleton skeleton--circle" style="width:34px;height:34px"></span><span class="skeleton skeleton--text" style="width:120px"></span></div>
    <span class="skeleton skeleton--text" style="width:90%;margin-top:14px"></span>
    <span class="skeleton skeleton--text" style="width:70%"></span>
  </div>`;

  const videoThumb = (v) => `
    <div class="video-card">
      <button type="button" data-video="${esc(v.id)}" aria-label="Assistir ${esc(v.title)}">
        <img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async">
        <span class="video-card__play">${icon('play')}</span>
        <span class="video-card__label">${esc(v.title)}</span>
      </button>
    </div>`;

  function renderReviews() {
    const stats = reviewStats();
    const videos = CONFIG.reviews.videos || [];

    const written = stats ? `
      <div class="reviews-grid">
        <div class="rating-summary">
          <div class="rating-summary__score">
            <strong>${stats.avg.toFixed(1)}</strong>
            ${stars(stats.avg, 'stars--lg')}
            <small>${stats.count} avaliações</small>
          </div>
          <div class="bars">
            ${[5, 4, 3, 2, 1].map((n) => `
              <div class="bars__row">
                <span>${n}★</span>
                <span class="bars__track"><span style="width:${stats.dist[n]}%"></span></span>
                <span>${stats.dist[n]}%</span>
              </div>`).join('')}
          </div>
        </div>
        <div>
          <div class="review-filters" role="toolbar" aria-label="Filtrar avaliações">
            ${REVIEW_FILTERS.map(([key, label]) => `<button class="pill-toggle" type="button" data-filter="${key}" aria-pressed="${key === state.reviewFilter}">${label}</button>`).join('')}
          </div>
          <div class="reviews" data-list aria-live="polite"></div>
          <div class="reviews__more" data-more></div>
        </div>
      </div>` : '';

    const el = mount('reviews', `
      ${cardHead('Avaliações dos clientes', stats ? `<span class="link-btn">${stats.count} avaliações</span>` : '')}
      <div class="card__body">
        ${videos.length ? `
          <div class="testimonials">
            <h3 class="testimonials__title">${icon('play', 'i--sm')}Depoimentos em vídeo</h3>
            <div class="testimonials__track">${videos.map(videoThumb).join('')}</div>
          </div>` : ''}
        ${written}
        <div class="review-invite review-invite--row">
          <span class="review-invite__icon">${icon('camera')}</span>
          <div>
            <strong>${stats ? 'Já recebeu seu Yumme Kids?' : 'Seja o primeiro a avaliar'}</strong>
            <p>Conte como foi e envie uma foto do produto.</p>
          </div>
          <a class="btn btn--ghost" href="${esc(CONFIG.routes.avaliar)}?oferta=${encodeURIComponent(state.offer.id)}">${icon('star', 'i--sm')}Avaliar</a>
        </div>
      </div>`);

    const list = $('[data-list]', el);
    const more = $('[data-more]', el);
    const size = CONFIG.reviews.pageSize;

    const paint = () => {
      if (!list) return;
      const items = filteredReviews();
      const visible = items.slice(0, state.reviewPage * size);
      list.innerHTML = visible.length ? visible.map(reviewItem).join('') : '<p class="empty">Nenhuma avaliação neste filtro.</p>';
      more.innerHTML = items.length > visible.length
        ? `<button class="btn btn--ghost btn--block" type="button" data-action="more-reviews"><span class="btn__label">Ver mais avaliações ${icon('down', 'i--sm')}</span></button>`
        : '';
      hydrateMedia(list);
    };

    el.addEventListener('click', (e) => {
      const video = e.target.closest('[data-video]');
      if (video) {
        // Carrega o player do YouTube só ao clicar (página mais leve).
        const id = encodeURIComponent(video.dataset.video);
        video.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1"
          title="Depoimento em vídeo" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        return;
      }

      const filter = e.target.closest('[data-filter]');
      if (filter) {
        state.reviewFilter = filter.dataset.filter;
        state.reviewPage = 1;
        $$('[data-filter]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === filter)));
        paint();
        return;
      }

      const helpful = e.target.closest('.helpful');
      if (helpful) {
        const pressed = helpful.getAttribute('aria-pressed') !== 'true';
        const count = Number(helpful.dataset.count) + (pressed ? 1 : 0);
        helpful.setAttribute('aria-pressed', String(pressed));
        $('span', helpful).textContent = `Útil (${count})`;
        return;
      }

      if (e.target.closest('[data-action="more-reviews"]')) {
        more.innerHTML = '';
        list.insertAdjacentHTML('beforeend', reviewSkeleton() + reviewSkeleton());
        setTimeout(() => { state.reviewPage += 1; paint(); }, 500);
      }
    });

    paint();
  }

  /* ---------- FAQ ---------- */
  function renderFaq() {
    const el = mount('faq', `
      ${cardHead('Perguntas frequentes')}
      <div class="card__body">
        <div class="accordion">
          ${CONFIG.faq.map((item, i) => `
            <div class="accordion__item">
              <h3 style="margin:0">
                <button class="accordion__trigger" type="button" id="faq-t-${i}" aria-controls="faq-p-${i}" aria-expanded="false">
                  <span>${esc(item.q)}</span>${icon('down')}
                </button>
              </h3>
              <div class="accordion__panel" id="faq-p-${i}" role="region" aria-labelledby="faq-t-${i}">
                <div><div class="faq-answer">${item.image ? media({ src: item.image, alt: item.q }, { cls: 'faq-answer__media' }) : ''}<p>${esc(item.a)}</p></div></div>
              </div>
            </div>`).join('')}
        </div>
      </div>`);

    el.addEventListener('click', (e) => {
      const trigger = e.target.closest('.accordion__trigger');
      if (!trigger) return;
      const open = trigger.getAttribute('aria-expanded') !== 'true';
      $$('.accordion__trigger', el).forEach((t) => {
        const active = t === trigger && open;
        t.setAttribute('aria-expanded', String(active));
        t.closest('.accordion__item').classList.toggle('is-open', active);
      });
    });
  }

  /* ---------- Barra de compra ---------- */
  function renderBuybar() {
    mount('buybar', `
      <div class="buybar__inner">
        <button class="buybar__action" type="button" data-action="store">${icon('store')}<span>Loja</span></button>
        <button class="buybar__action" type="button" data-action="help">${icon('chat')}<span>Dúvidas</span></button>
        ${buyButton()}
      </div>`);
  }

  /* ---------- Comportamentos globais ---------- */
  function bindActions() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.dataset.action) {
        case 'buy':
          setLoading(btn, true);
          navigate(`${CONFIG.routes.solicitar}?oferta=${encodeURIComponent(state.offer.id)}&qtd=${state.qty}`);
          break;
        case 'back':
          goBack(CONFIG.routes.home);
          break;
        case 'store':
          document.getElementById('loja').scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        case 'help':
          document.getElementById('duvidas').scrollIntoView({ behavior: 'smooth' });
          break;
        case 'share':
          try {
            if (navigator.share) await navigator.share({ title: product.name, url: location.href });
            else { await navigator.clipboard.writeText(location.href); toast('Link copiado'); }
          } catch (err) {
            if (err && err.name !== 'AbortError') toast('Não foi possível compartilhar', 'error');
          }
          break;
      }
    });
  }

  function bindScrollChrome() {
    const topbar = $('[data-topbar]');
    const buybar = $('[data-buybar]');
    const cta = $('.cta-inline');

    let ticking = false;
    const onScroll = () => {
      topbar.classList.toggle('is-solid', window.scrollY > 160);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    // No desktop a barra fixa só aparece quando o CTA inline sai da tela.
    if (cta && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        buybar.classList.toggle('is-visible', !entry.isIntersecting);
      }).observe(cta);
    }
  }

  /* ---------- Init ---------- */
  renderGallery();
  renderFlash();
  renderSummary();
  renderOffers();
  renderShipping();
  renderStore();
  renderTabs();
  renderBenefits();
  renderReviews();
  renderFaq();
  renderBuybar();
  mount('footer', footer());

  updatePrice();
  bindActions();
  bindScrollChrome();
  hydrateMedia();
  reveal();
})();
