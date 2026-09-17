/**
 * Shop UI — helpers e componentes compartilhados entre /produto e /solicitar.
 * Expostos em window.Shop. Scripts clássicos (sem ES modules) para funcionar
 * também via file:// e em qualquer hospedagem estática.
 */
(function () {
  'use strict';

  const CONFIG = window.SHOP_CONFIG;

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Formatação ---------- */
  const moneyFmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency });
  const money = (n) => moneyFmt.format(n);

  const compact = (n) =>
    new Intl.NumberFormat(CONFIG.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

  const discount = (price, oldPrice) => (oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0);

  const shortDate = (date) =>
    new Intl.DateTimeFormat(CONFIG.locale, { day: '2-digit', month: 'short' }).format(date).replace('.', '');

  const longDate = (iso) =>
    new Intl.DateTimeFormat(CONFIG.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso + 'T12:00:00'));

  function addBusinessDays(from, days) {
    const d = new Date(from);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) added++;
    }
    return d;
  }

  function deliveryWindow() {
    const { etaMinDays, etaMaxDays } = CONFIG.shipping;
    const now = new Date();
    return { from: shortDate(addBusinessDays(now, etaMinDays)), to: shortDate(addBusinessDays(now, etaMaxDays)) };
  }

  /* ---------- Dados ---------- */
  const params = () => new URLSearchParams(window.location.search);

  const getOffer = (id) =>
    CONFIG.offers.find((o) => o.id === String(id)) ||
    CONFIG.offers.find((o) => o.id === CONFIG.defaultOffer) ||
    CONFIG.offers[0];

  const clampQty = (q) => Math.min(Math.max(parseInt(q, 10) || 1, 1), CONFIG.maxQty);

  /* ---------- Storage seguro ---------- */
  const store = {
    get(key, area = 'localStorage') {
      try { return JSON.parse(window[area].getItem(key)); } catch { return null; }
    },
    set(key, value, area = 'localStorage') {
      try { window[area].setItem(key, JSON.stringify(value)); } catch { /* indisponível */ }
    },
    remove(key, area = 'localStorage') {
      try { window[area].removeItem(key); } catch { /* indisponível */ }
    },
  };

  /* ---------- Ícones (traço 24px) ---------- */
  const ICONS = {
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    badge: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    thumb: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    support: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.52.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/>',
    star: '<path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.49l-5.87 3.09 1.12-6.54L2.5 9.41l6.56-.95z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  };

  const icon = (name, cls = '') =>
    `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const STAR = '<path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.49l-5.87 3.09 1.12-6.54L2.5 9.41l6.56-.95z"/>';

  /** Estrelas com preenchimento fracionado (ex.: 4.6). */
  function stars(rating, cls = '') {
    const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
    const row = Array.from({ length: 5 }, () => `<svg viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg>`).join('');
    return `<span class="stars ${cls}" role="img" aria-label="${rating} de 5 estrelas">
      <span class="stars__base">${row}</span>
      <span class="stars__fill" style="width:${pct}%">${row}</span>
    </span>`;
  }

  /** Mídia com skeleton até carregar; sem `src` vira placeholder. */
  function media({ src, alt = '' } = {}, { cls = '', eager = false, label = '' } = {}) {
    if (!src) {
      return `<div class="media media--placeholder ${cls}" role="img" aria-label="${esc(alt || 'Imagem placeholder')}">
        ${icon('image')}${label ? `<span>${esc(label)}</span>` : ''}
      </div>`;
    }
    return `<div class="media ${cls}">
      <img src="${esc(src)}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" ${eager ? 'fetchpriority="high"' : ''}>
    </div>`;
  }

  /** Ativa o fade-in das imagens reais quando terminarem de carregar. */
  function hydrateMedia(root = document) {
    $$('.media img', root).forEach((img) => {
      const done = () => img.parentElement.classList.add('is-loaded');
      if (img.complete && img.naturalWidth) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', () => img.parentElement.classList.add('media--placeholder', 'is-loaded'), { once: true });
      }
    });
  }

  /* ---------- Campos de formulário ---------- */
  /** Campo com label flutuante. type: text (padrão) | tel | select | textarea. */
  function field(f) {
    const id = `f-${f.name}`;
    const attrs = `class="field__control" id="${id}" name="${f.name}" autocomplete="${f.autocomplete || 'off'}"
      aria-describedby="e-${f.name}" ${f.validate ? 'required aria-required="true"' : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}`;
    const value = f.value == null ? '' : String(f.value);

    let control;
    if (f.type === 'select') {
      const opts = f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
      control = `<select ${attrs}><option value=""></option>${opts.map((o) =>
        `<option value="${esc(o.value)}"${String(o.value) === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea ${attrs} placeholder=" " rows="${f.rows || 5}">${esc(value)}</textarea>`;
    } else {
      control = `<input ${attrs} type="${f.type || 'text'}" placeholder=" " value="${esc(value)}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''}>`;
    }

    const mod = f.type === 'select' ? 'field--select' : f.type === 'textarea' ? 'field--textarea' : '';
    return `<div class="field ${mod} ${f.cls || ''}" data-field="${f.name}">
      ${control}
      <label class="field__label" for="${id}">${esc(f.label)}${f.optional ? ' <em>(opcional)</em>' : ''}</label>
      <span class="field__status">${icon('check', 'i--check')}<span class="field__spinner"></span></span>
      <p class="field__error" id="e-${f.name}" role="alert">${icon('alert')}<span></span></p>
      ${f.hint ? `<small class="field__hint">${esc(f.hint)}</small>` : ''}
    </div>`;
  }

  /** Aplica estado visual de validação a um campo (.field). */
  function fieldState(wrap, error, show) {
    const control = wrap.querySelector('.field__control');
    wrap.classList.toggle('is-valid', !error && control.value.trim() !== '');
    if (!show) return;
    wrap.classList.toggle('is-invalid', Boolean(error));
    wrap.querySelector('.field__error span').textContent = error || '';
    control.setAttribute('aria-invalid', String(Boolean(error)));
  }

  function shake(el) {
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
    setTimeout(() => el.classList.remove('is-shaking'), 400);
  }

  /* ---------- Checkout ---------- */
  const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|ttclid|src|sck)$/i;
  function checkoutUrl(offer) {
    if (!offer || !offer.checkoutUrl) return '';
    const url = new URL(offer.checkoutUrl);
    params().forEach((value, key) => { if (TRACKING_PARAMS.test(key)) url.searchParams.set(key, value); });
    return url.toString();
  }

  /* ---------- Rodapé ---------- */
  const footer = () => `<div class="container">
      ${CONFIG.store.logo ? `<img class="site-foot__logo" src="${esc(CONFIG.store.logo)}" alt="${esc(CONFIG.store.name)}" width="96" height="96" loading="lazy" decoding="async">` : ''}
      <div class="site-foot__trust">
        <span>${icon('lock')}Compra segura</span>
        <span>${icon('shield')}Dados protegidos</span>
        <span>${icon('support')}Suporte dedicado</span>
      </div>
      <p>© ${new Date().getFullYear()} ${esc(CONFIG.store.name)}</p>
      ${CONFIG.store.seller ? `<p class="site-foot__seller">Vendido por ${esc(CONFIG.store.seller.name)} – ${esc(CONFIG.store.seller.document)}</p>` : ''}
      ${CONFIG.store.support ? `<p class="site-foot__seller">Atendimento: ${esc(CONFIG.store.support.email)} · ${esc(CONFIG.store.support.phone)}</p>` : ''}
    </div>`;

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(message, type = 'default') {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.dataset.type = type;
    el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  /* ---------- Bottom sheet / modal ---------- */
  function sheet({ title, body }) {
    const lastFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'sheet';
    wrap.innerHTML = `
      <div class="sheet__backdrop" data-close></div>
      <div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet__grip" aria-hidden="true"></div>
        <header class="sheet__head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('x')}</button>
        </header>
        <div class="sheet__body">${body}</div>
      </div>`;
    document.body.appendChild(wrap);
    document.documentElement.classList.add('is-locked');

    const close = () => {
      wrap.classList.remove('is-open');
      document.documentElement.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey);
      const remove = () => wrap.remove();
      prefersReducedMotion() ? remove() : setTimeout(remove, 320);
      lastFocus && lastFocus.focus && lastFocus.focus();
    };
    const onKey = (e) => e.key === 'Escape' && close();

    wrap.addEventListener('click', (e) => e.target.closest('[data-close]') && close());
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => {
      wrap.classList.add('is-open');
      $('.sheet__panel [data-close]', wrap).focus({ preventScroll: true });
    });
    return close;
  }

  /* ---------- Reveal on scroll ---------- */
  function reveal(root = document) {
    const items = $$('[data-reveal]:not(.is-revealed)', root);
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      items.forEach((el) => el.classList.add('is-revealed'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- Navegação com transição ---------- */
  function navigate(url) {
    document.documentElement.classList.add('is-leaving');
    const go = () => { window.location.href = url; };
    prefersReducedMotion() ? go() : setTimeout(go, 260);
  }

  function goBack(fallback) {
    const sameOrigin = document.referrer && new URL(document.referrer).origin === window.location.origin;
    if (sameOrigin && window.history.length > 1) window.history.back();
    else navigate(fallback);
  }

  /** Estado de loading em botões. */
  function setLoading(btn, loading) {
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
    btn.setAttribute('aria-busy', String(loading));
  }

  // Restaura a página ao voltar pelo histórico (bfcache).
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.documentElement.classList.remove('is-leaving');
    $$('.is-loading').forEach((btn) => setLoading(btn, false));
  });

  document.documentElement.classList.add('js');

  window.Shop = {
    CONFIG, $, $$, esc, money, compact, discount, longDate, deliveryWindow,
    params, getOffer, clampQty, store, icon, stars, media, hydrateMedia, footer, field, fieldState, shake, checkoutUrl,
    toast, sheet, reveal, navigate, goBack, setLoading, prefersReducedMotion,
  };
})();
