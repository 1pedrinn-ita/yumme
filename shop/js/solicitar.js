/**
 * Página de solicitação (/solicitar)
 * Resumo do pedido + formulário com máscaras, validação, busca de CEP,
 * rascunho automático e tela de confirmação.
 */
(function () {
  'use strict';

  const { CONFIG, $, $$, esc, money, deliveryWindow, params, getOffer, clampQty,
    store, icon, media, hydrateMedia, footer, field, fieldState, toast, navigate, goBack, setLoading } = window.Shop;

  const DRAFT_KEY = 'shop:order-draft';

  const state = {
    offer: getOffer(params().get('oferta')),
    qty: clampQty(params().get('qtd')),
    lastCep: '',
  };

  const mount = (name, html) => {
    const el = $(`[data-mount="${name}"]`);
    if (el) el.innerHTML = html;
    return el;
  };

  const digits = (v) => String(v).replace(/\D/g, '');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Máscaras ---------- */
  const MASKS = {
    phone(v) {
      const d = digits(v).slice(0, 11);
      if (d.length <= 2) return d.length ? `(${d}` : '';
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    cep(v) {
      const d = digits(v).slice(0, 8);
      return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    },
  };

  /* ---------- Schema do formulário ---------- */
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

  const required = (msg) => (v) => (v.trim() ? '' : msg);

  const SECTIONS = [
    {
      title: 'Dados pessoais',
      icon: 'user',
      fields: [
        {
          name: 'nome', label: 'Nome completo', autocomplete: 'name',
          validate: (v) => {
            if (!v.trim()) return 'Informe seu nome completo';
            return v.trim().split(/\s+/).filter((p) => p.length >= 2).length >= 2 ? '' : 'Digite nome e sobrenome';
          },
        },
        {
          name: 'telefone', label: 'Telefone / WhatsApp', type: 'tel', inputmode: 'tel', autocomplete: 'tel-national', mask: 'phone',
          validate: (v) => {
            const d = digits(v);
            if (!d.length) return 'Informe seu telefone';
            return d.length >= 10 && d.length <= 11 ? '' : 'Telefone incompleto';
          },
        },
      ],
    },
    {
      title: 'Endereço de entrega',
      icon: 'pin',
      fields: [
        {
          name: 'cep', label: 'CEP', inputmode: 'numeric', autocomplete: 'postal-code', mask: 'cep',
          hint: CONFIG.form.cepLookup ? 'Preenchemos o endereço automaticamente' : '',
          validate: (v) => (digits(v).length === 8 ? '' : 'CEP deve ter 8 dígitos'),
        },
        { name: 'endereco', label: 'Endereço', autocomplete: 'address-line1', validate: required('Informe o endereço') },
        { name: 'numero', label: 'Número', autocomplete: 'address-line2', cls: 'col-2', validate: required('Obrigatório') },
        { name: 'complemento', label: 'Complemento', optional: true, cls: 'col-4' },
        { name: 'bairro', label: 'Bairro', autocomplete: 'address-level3', validate: required('Informe o bairro') },
        { name: 'cidade', label: 'Cidade', autocomplete: 'address-level2', cls: 'col-4', validate: required('Informe a cidade') },
        { name: 'estado', label: 'Estado', type: 'select', options: UFS, autocomplete: 'address-level1', cls: 'col-2', validate: required('UF') },
      ],
    },
  ];

  const FIELDS = SECTIONS.flatMap((s) => s.fields);
  const REQUIRED = FIELDS.filter((f) => f.validate);
  const fieldDef = (name) => FIELDS.find((f) => f.name === name);

  /* ---------- Componentes ---------- */
  function renderSteps(current) {
    const steps = ['Produto', 'Entrega', 'Confirmação'];
    mount('steps', steps.map((label, i) => {
      const n = i + 1;
      const status = n < current ? 'is-done' : n === current ? 'is-current' : '';
      const line = i < steps.length - 1 ? `<li class="steps__line ${n < current ? 'is-done' : ''}" aria-hidden="true"><span></span></li>` : '';
      return `<li class="step ${status}" ${n === current ? 'aria-current="step"' : ''}>
        <span class="step__dot">${n < current ? icon('check') : n}</span>${label}
      </li>${line}`;
    }).join(''));
  }

  /* ---------- Resumo do pedido ---------- */
  function totals() {
    const subtotal = (state.offer.oldPrice || state.offer.price) * state.qty;
    const total = state.offer.price * state.qty;
    const shippingCost = CONFIG.shipping.free ? 0 : CONFIG.shipping.price;
    return { subtotal, discount: subtotal - total, shipping: shippingCost, total: total + shippingCost };
  }

  function renderOrder() {
    const eta = deliveryWindow();
    const el = mount('order', `
      <button class="order__toggle" type="button" aria-expanded="false" aria-controls="order-panel">
        <span class="order__toggle-label">${icon('package')}Resumo do pedido</span>
        <span class="order__toggle-total"><span data-bind="total"></span>${icon('down')}</span>
      </button>
      <div class="order__panel" id="order-panel">
        <div>
          <div class="order__content">
            <div class="order__item">
              ${media({ src: state.offer.image || (CONFIG.product.images[0] || {}).src, alt: CONFIG.product.name })}
              <div>
                <p class="order__name">${esc(CONFIG.product.name)}</p>
                <p class="order__variant">${esc(state.offer.label)}</p>
                <div class="order__line">
                  <div class="qty" data-qty>
                    <button type="button" data-step="-1" aria-label="Diminuir quantidade">${icon('minus', 'i--sm')}</button>
                    <output aria-live="polite"></output>
                    <button type="button" data-step="1" aria-label="Aumentar quantidade">${icon('plus', 'i--sm')}</button>
                  </div>
                  <span class="order__price" data-bind="line"></span>
                </div>
              </div>
            </div>
            <div class="totals" data-bind="totals"></div>
            <div class="order__eta">${icon('truck')}<span>Entrega estimada entre <strong>${esc(eta.from)}</strong> e <strong>${esc(eta.to)}</strong></span></div>
            <div class="order__guarantees">
              ${CONFIG.guarantees.map((g) => `<div>${icon(g.icon)}${esc(g.title)}</div>`).join('')}
            </div>
          </div>
        </div>
      </div>`);

    el.addEventListener('click', (e) => {
      const toggle = e.target.closest('.order__toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
        return;
      }
      const step = e.target.closest('[data-step]');
      if (step) {
        state.qty = clampQty(state.qty + Number(step.dataset.step));
        updateOrder();
      }
    });
    hydrateMedia(el);
    updateOrder();
  }

  function updateOrder() {
    const t = totals();
    const off = t.discount > 0;
    $$('[data-bind="total"]').forEach((n) => { n.textContent = money(t.total); });
    $('[data-bind="line"]').textContent = money(state.offer.price * state.qty);
    $('[data-bind="totals"]').innerHTML = `
      <div><span>Subtotal</span><span>${esc(money(t.subtotal))}</span></div>
      ${off ? `<div class="is-discount"><span>Desconto</span><span>- ${esc(money(t.discount))}</span></div>` : ''}
      <div><span>Frete</span><span class="${t.shipping ? '' : 'is-free'}">${t.shipping ? esc(money(t.shipping)) : 'Grátis'}</span></div>
      <div class="totals__grand"><span>Total</span><span>${esc(money(t.total))}</span></div>`;

    const qty = $('[data-qty]');
    $('output', qty).textContent = state.qty;
    $('[data-step="-1"]', qty).disabled = state.qty <= 1;
    $('[data-step="1"]', qty).disabled = state.qty >= CONFIG.maxQty;

    history.replaceState(null, '', `?oferta=${encodeURIComponent(state.offer.id)}&qtd=${state.qty}`);
  }

  /* ---------- Formulário ---------- */
  function renderForm() {
    const circumference = 2 * Math.PI * 19;
    const el = mount('form', `
      <form class="form-card" novalidate data-form>
        <div class="form-card__head">
          <div>
            <h1>Para onde enviamos?</h1>
            <p>Preencha seus dados para solicitar o produto.</p>
          </div>
          <div class="progress-ring" aria-label="Progresso do formulário">
            <svg viewBox="0 0 46 46" aria-hidden="true">
              <circle class="track" cx="23" cy="23" r="19"/>
              <circle class="bar" cx="23" cy="23" r="19" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"/>
            </svg>
            <span data-bind="progress">0%</span>
          </div>
        </div>

        ${SECTIONS.map((s) => `
          <fieldset class="fieldset">
            <legend class="fieldset__legend"><span>${icon(s.icon)}</span>${esc(s.title)}</legend>
            <div class="fields">${s.fields.map(field).join('')}</div>
          </fieldset>`).join('')}

        <div class="form-trust">
          <div>${icon('lock')}Dados criptografados</div>
          <div>${icon('shield')}Compra garantida</div>
          <div>${icon('support')}Suporte dedicado</div>
        </div>

        <button class="btn btn--primary btn--shine btn--block btn--xl form-submit" type="submit">
          <span class="btn__stack">
            <span class="btn__label">${icon('check', 'i--sm')}Confirmar solicitação</span>
            <span class="btn__sub">Total <span data-bind="total"></span></span>
          </span>
        </button>
        <p class="form-legal">${icon('lock')} Seus dados são usados apenas para a entrega do pedido.</p>
      </form>`);

    const form = $('[data-form]', el);
    bindForm(form, circumference);
    return form;
  }

  function getControl(form, name) { return form.elements.namedItem(name); }

  function setFieldState(form, name, error, show) {
    fieldState($(`[data-field="${name}"]`, form), error, show);
  }

  function validateField(form, name, show) {
    const def = fieldDef(name);
    const error = def.validate ? def.validate(getControl(form, name).value) : '';
    setFieldState(form, name, error, show);
    return !error;
  }

  function updateProgress(form, circumference) {
    const ok = REQUIRED.filter((f) => !f.validate(getControl(form, f.name).value)).length;
    const pct = Math.round((ok / REQUIRED.length) * 100);
    $('.progress-ring .bar', form).style.strokeDashoffset = circumference * (1 - pct / 100);
    $('[data-bind="progress"]', form).textContent = `${pct}%`;
  }

  function bindForm(form, circumference) {
    let draftTimer;

    const saveDraft = () => {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        if (!form.isConnected) return; // pedido já enviado
        const data = Object.fromEntries(FIELDS.map((f) => [f.name, getControl(form, f.name).value]));
        store.set(DRAFT_KEY, data);
      }, 300);
    };

    const onInput = (e) => {
      const control = e.target;
      const def = fieldDef(control.name);
      if (!def) return;

      if (def.mask) control.value = MASKS[def.mask](control.value);

      const wrap = control.closest('.field');
      const live = wrap.classList.contains('is-invalid');
      validateField(form, def.name, live);

      if (def.name === 'cep') maybeLookupCep(form, circumference);
      updateProgress(form, circumference);
      saveDraft();
    };

    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('focusout', (e) => {
      const def = fieldDef(e.target.name);
      if (def && (e.target.value.trim() || e.target.closest('.field').classList.contains('is-invalid'))) {
        validateField(form, def.name, true);
      }
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });

    // Restaura rascunho
    const draft = store.get(DRAFT_KEY);
    if (draft) {
      FIELDS.forEach((f) => {
        if (!draft[f.name]) return;
        getControl(form, f.name).value = draft[f.name];
        validateField(form, f.name, false);
      });
      state.lastCep = digits(draft.cep || '');
    }
    updateProgress(form, circumference);
  }

  /* ---------- CEP ---------- */
  const CEP_TARGETS = { endereco: 'logradouro', bairro: 'bairro', cidade: 'localidade', estado: 'uf' };
  let cepController;

  async function maybeLookupCep(form, circumference) {
    const cep = digits(getControl(form, 'cep').value);
    if (!CONFIG.form.cepLookup || cep.length !== 8 || cep === state.lastCep) return;
    state.lastCep = cep;

    cepController && cepController.abort();
    cepController = new AbortController();

    const cepWrap = $('[data-field="cep"]', form);
    const targets = Object.keys(CEP_TARGETS).map((name) => $(`[data-field="${name}"]`, form));
    cepWrap.classList.add('is-busy');
    targets.forEach((t) => t.classList.add('is-filling'));

    const finish = () => {
      cepWrap.classList.remove('is-busy');
      targets.forEach((t) => t.classList.remove('is-filling'));
    };

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: cepController.signal });
      const data = await res.json();
      finish();

      if (data.erro) {
        setFieldState(form, 'cep', 'CEP não encontrado', true);
        cepWrap.classList.add('is-shaking');
        setTimeout(() => cepWrap.classList.remove('is-shaking'), 400);
        return;
      }

      Object.entries(CEP_TARGETS).forEach(([name, key]) => {
        if (!data[key]) return;
        getControl(form, name).value = data[key];
        const wrap = $(`[data-field="${name}"]`, form);
        wrap.classList.remove('is-autofilled');
        void wrap.offsetWidth;
        wrap.classList.add('is-autofilled');
        validateField(form, name, true);
      });

      getControl(form, data.logradouro ? 'numero' : 'endereco').focus();
      updateProgress(form, circumference);
      getControl(form, 'endereco').dispatchEvent(new Event('input', { bubbles: true }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      finish();
      state.lastCep = '';
      toast('Não foi possível buscar o CEP. Preencha manualmente.', 'error');
    }
  }

  /* ---------- Envio ---------- */
  async function submit(form) {
    const invalid = REQUIRED.filter((f) => !validateField(form, f.name, true));
    if (invalid.length) {
      const first = $(`[data-field="${invalid[0].name}"]`, form);
      first.classList.add('is-shaking');
      setTimeout(() => first.classList.remove('is-shaking'), 400);
      getControl(form, invalid[0].name).focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Revise os campos destacados', 'error');
      return;
    }

    const button = $('button[type="submit"]', form);
    setLoading(button, true);

    const value = (n) => getControl(form, n).value.trim();
    const t = totals();
    const payload = {
      orderId: orderCode(),
      createdAt: new Date().toISOString(),
      offer: { id: state.offer.id, label: state.offer.label, unitPrice: state.offer.price },
      quantity: state.qty,
      totals: t,
      customer: { name: value('nome'), phone: digits(value('telefone')) },
      address: {
        cep: digits(value('cep')), street: value('endereco'), number: value('numero'),
        complement: value('complemento'), district: value('bairro'), city: value('cidade'), state: value('estado'),
      },
    };

    try {
      if (CONFIG.form.endpoint) {
        const res = await fetch(CONFIG.form.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        await wait(1400);
      }
      store.remove(DRAFT_KEY);
      renderSuccess(payload);
    } catch (err) {
      setLoading(button, false);
      toast('Não foi possível enviar. Tente novamente.', 'error');
    }
  }

  function orderCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  function renderSuccess(order) {
    const eta = deliveryWindow();
    const a = order.address;
    renderSteps(4);
    mount('form', `
      <div class="success" role="status">
        <svg class="success__icon" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r="40"/>
          <path d="M28 45l11 11 21-23"/>
        </svg>
        <h1>Solicitação recebida!</h1>
        <p>Recebemos seu pedido. Em breve você receberá a confirmação no telefone informado.</p>
        <div class="success__code"><small>Número do pedido</small><strong>#${esc(order.orderId)}</strong></div>
        <div class="success__rows">
          <div>${icon('user')}<p><strong>${esc(order.customer.name)}</strong><span>${esc(MASKS.phone(order.customer.phone))}</span></p></div>
          <div>${icon('pin')}<p><strong>${esc(`${a.street}, ${a.number}${a.complement ? ` – ${a.complement}` : ''}`)}</strong><span>${esc(`${a.district}, ${a.city} – ${a.state} · ${MASKS.cep(a.cep)}`)}</span></p></div>
          <div>${icon('truck')}<p><strong>Entrega estimada</strong><span>Entre ${esc(eta.from)} e ${esc(eta.to)}</span></p></div>
        </div>
        <div class="review-invite">
          <span class="review-invite__icon">${icon('camera')}</span>
          <div><strong>Quando o pedido chegar, conte pra gente!</strong><p>Sua avaliação com foto ajuda outras famílias a conhecer o Yumme Kids.</p></div>
        </div>
        <a class="btn btn--primary btn--block" href="${esc(`${CONFIG.routes.avaliar}?pedido=${order.orderId}&oferta=${order.offer.id}`)}">${icon('star', 'i--sm')}Avaliar quando chegar</a>
        <a class="btn btn--ghost btn--block" href="${esc(CONFIG.routes.home)}">${icon('home', 'i--sm')}Voltar ao início</a>
      </div>`);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (CONFIG.form.successRedirect) setTimeout(() => navigate(CONFIG.form.successRedirect), 3500);
  }

  /* ---------- Ações ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="back"]')) {
      goBack(`${CONFIG.routes.produto}?oferta=${encodeURIComponent(state.offer.id)}&qtd=${state.qty}`);
    }
  });

  /* ---------- Init ---------- */
  renderSteps(2);
  renderOrder();
  renderForm();
  mount('footer', footer());
  updateOrder();
})();
