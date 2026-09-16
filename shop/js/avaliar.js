/**
 * Página de avaliação (/avaliar)
 * Coleta nota, comentário e fotos reais enviadas pelo cliente.
 * Envio: POST multipart/form-data para SHOP_CONFIG.reviews.submitEndpoint.
 */
(function () {
  'use strict';

  const { CONFIG, $, $$, esc, icon, media, hydrateMedia, footer, field, fieldState, shake,
    params, getOffer, toast, setLoading, goBack } = window.Shop;

  const MAX_PHOTOS = 3;
  const MAX_MB = 8;
  const MIN_TEXT = 20;
  const MAX_TEXT = 600;
  const RATING_LABELS = ['Toque nas estrelas para avaliar', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.49l-5.87 3.09 1.12-6.54L2.5 9.41l6.56-.95z"/></svg>';

  const state = {
    rating: 0,
    photos: [], // { file, url }
    offer: getOffer(params().get('oferta')),
    order: (params().get('pedido') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase(),
  };

  const mount = (name, html) => {
    const el = $(`[data-mount="${name}"]`);
    if (el) el.innerHTML = html;
    return el;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const FIELDS = [
    { name: 'nome', label: 'Seu nome', autocomplete: 'given-name', hint: 'Exibiremos apenas o primeiro nome e a inicial do sobrenome.',
      validate: (v) => (v.trim().length >= 2 ? '' : 'Informe seu nome') },
    { name: 'pedido', label: 'Número do pedido', optional: true, value: state.order },
    { name: 'oferta', label: 'Qual opção você comprou?', type: 'select', value: state.offer.id,
      options: CONFIG.offers.map((o) => ({ value: o.id, label: o.label })),
      validate: (v) => (v ? '' : 'Selecione a opção') },
    { name: 'comentario', label: 'Conte como foi sua experiência', type: 'textarea', rows: 5, maxlength: MAX_TEXT,
      validate: (v) => (v.trim().length >= MIN_TEXT ? '' : `Escreva pelo menos ${MIN_TEXT} caracteres`) },
  ];
  const fieldDef = (name) => FIELDS.find((f) => f.name === name);

  /* ---------- Render ---------- */
  function render() {
    const img = (CONFIG.product.images[0] || {}).src;
    const el = mount('review-form', `
      <form class="form-card" novalidate data-form>
        <div class="form-card__head">
          <div>
            <h1>Como foi com o Yumme Kids?</h1>
            <p>Sua opinião sincera ajuda outras famílias a decidir.</p>
          </div>
        </div>

        <div class="review-product">
          ${media({ src: img, alt: CONFIG.product.name })}
          <div>
            <strong>${esc(CONFIG.product.name)}</strong>
            ${state.order ? `<small>Pedido #${esc(state.order)}</small>` : ''}
          </div>
        </div>

        <fieldset class="rate" data-rate>
          <legend>Sua nota</legend>
          <div class="rate__stars" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
            ${[1, 2, 3, 4, 5].map((n) => `<button class="rate__star" type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} ${n > 1 ? 'estrelas' : 'estrela'}">${STAR}</button>`).join('')}
          </div>
          <span class="rate__label" data-rate-label aria-live="polite">${RATING_LABELS[0]}</span>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset__legend"><span>${icon('user')}</span>Seus dados</legend>
          <div class="fields">${FIELDS.slice(0, 3).map(field).join('')}</div>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset__legend"><span>${icon('chat')}</span>Sua avaliação</legend>
          <div class="fields">${field(FIELDS[3])}</div>
          <small class="char-count" data-count>0/${MAX_TEXT}</small>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset__legend"><span>${icon('camera')}</span>Fotos do produto <em style="font-style:normal;font-weight:500;color:var(--ink-3)">(opcional)</em></legend>
          <div class="uploader" data-uploader>
            <input class="uploader__input" id="fotos" type="file" accept="image/*" multiple>
            <label class="uploader__drop" for="fotos">
              ${icon('upload')}
              <strong>Adicionar fotos</strong>
              <small>Até ${MAX_PHOTOS} fotos · JPG ou PNG · máx. ${MAX_MB} MB cada</small>
            </label>
            <div class="uploader__previews" data-previews></div>
          </div>
        </fieldset>

        <label class="consent" data-consent>
          <input type="checkbox" name="autorizacao">
          <span>Autorizo a publicação da minha avaliação e das fotos enviadas no site da ${esc(CONFIG.store.name)}.</span>
        </label>

        <button class="btn btn--primary btn--shine btn--block btn--xl form-submit" type="submit">
          <span class="btn__label">${icon('check', 'i--sm')}Enviar avaliação</span>
        </button>
        <p class="form-legal">${icon('shield')} As avaliações passam por moderação antes de aparecer no site.</p>
      </form>`);

    hydrateMedia(el);
    bind($('[data-form]', el));
  }

  /* ---------- Nota ---------- */
  function paintStars(root, n) {
    $$('[data-star]', root).forEach((b) => b.classList.toggle('is-on', Number(b.dataset.star) <= n));
  }

  function setRating(form, n) {
    state.rating = n;
    const rate = $('[data-rate]', form);
    paintStars(rate, n);
    $$('[data-star]', rate).forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.star) === n)));
    $('[data-rate-label]', rate).textContent = RATING_LABELS[n];
    rate.classList.remove('is-invalid');
  }

  /* ---------- Fotos ---------- */
  function addPhotos(form, files) {
    const room = MAX_PHOTOS - state.photos.length;
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const tooBig = images.filter((f) => f.size > MAX_MB * 1024 * 1024);
    const accepted = images.filter((f) => f.size <= MAX_MB * 1024 * 1024).slice(0, room);

    if (tooBig.length) toast(`Fotos acima de ${MAX_MB} MB foram ignoradas`, 'error');
    else if (images.length > room) toast(`Máximo de ${MAX_PHOTOS} fotos`, 'error');

    accepted.forEach((file) => state.photos.push({ file, url: URL.createObjectURL(file) }));
    paintPhotos(form);
  }

  function paintPhotos(form) {
    const uploader = $('[data-uploader]', form);
    $('[data-previews]', uploader).innerHTML = state.photos.map((p, i) => `
      <div class="uploader__thumb">
        <img src="${p.url}" alt="Foto ${i + 1} selecionada">
        <button class="uploader__remove" type="button" data-remove="${i}" aria-label="Remover foto ${i + 1}">${icon('x')}</button>
      </div>`).join('');
    uploader.classList.toggle('is-full', state.photos.length >= MAX_PHOTOS);
  }

  /* ---------- Formulário ---------- */
  function validateField(form, name, show) {
    const def = fieldDef(name);
    const control = form.elements.namedItem(name);
    const error = def.validate ? def.validate(control.value) : '';
    fieldState($(`[data-field="${name}"]`, form), error, show);
    return !error;
  }

  function bind(form) {
    const rate = $('[data-rate]', form);
    const uploader = $('[data-uploader]', form);
    const input = $('#fotos', form);
    const counter = $('[data-count]', form);

    // Nota
    rate.addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) setRating(form, Number(star.dataset.star));
    });
    rate.addEventListener('mouseover', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) paintStars(rate, Number(star.dataset.star));
    });
    rate.addEventListener('mouseleave', () => paintStars(rate, state.rating));
    rate.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const n = Math.min(5, Math.max(1, (state.rating || 0) + dir));
      setRating(form, n);
      $(`[data-star="${n}"]`, rate).focus();
    });

    // Campos
    form.addEventListener('input', (e) => {
      const def = fieldDef(e.target.name);
      if (def) validateField(form, def.name, e.target.closest('.field').classList.contains('is-invalid'));
      if (e.target.name === 'comentario') counter.textContent = `${e.target.value.length}/${MAX_TEXT}`;
    });
    form.addEventListener('change', (e) => {
      if (e.target.name === 'autorizacao') $('[data-consent]', form).classList.remove('is-invalid');
      if (e.target.name === 'oferta') validateField(form, 'oferta', true);
    });
    form.addEventListener('focusout', (e) => {
      const def = fieldDef(e.target.name);
      if (def && e.target.value.trim()) validateField(form, def.name, true);
    });

    // Fotos
    input.addEventListener('change', () => { addPhotos(form, input.files); input.value = ''; });
    uploader.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (!remove) return;
      const [removed] = state.photos.splice(Number(remove.dataset.remove), 1);
      URL.revokeObjectURL(removed.url);
      paintPhotos(form);
    });
    const drop = $('.uploader__drop', uploader);
    ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('is-dragover')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); addPhotos(form, e.dataTransfer.files); });

    form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
  }

  async function submit(form) {
    const problems = [];

    if (!state.rating) {
      const rate = $('[data-rate]', form);
      rate.classList.add('is-invalid');
      $('[data-rate-label]', rate).textContent = 'Escolha uma nota de 1 a 5 estrelas';
      problems.push(rate);
    }
    FIELDS.filter((f) => f.validate && !validateField(form, f.name, true))
      .forEach((f) => problems.push($(`[data-field="${f.name}"]`, form)));
    const consent = $('[data-consent]', form);
    if (!form.elements.namedItem('autorizacao').checked) {
      consent.classList.add('is-invalid');
      problems.push(consent);
    }

    if (problems.length) {
      shake(problems[0]);
      problems[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Revise os campos destacados', 'error');
      return;
    }

    const button = $('button[type="submit"]', form);
    setLoading(button, true);

    const offer = CONFIG.offers.find((o) => o.id === form.elements.namedItem('oferta').value);
    const data = new FormData();
    data.append('nota', String(state.rating));
    data.append('nome', form.elements.namedItem('nome').value.trim());
    data.append('pedido', form.elements.namedItem('pedido').value.trim());
    data.append('opcao', offer ? offer.label : '');
    data.append('comentario', form.elements.namedItem('comentario').value.trim());
    data.append('autorizacao', 'sim');
    data.append('enviadoEm', new Date().toISOString());
    state.photos.forEach((p) => data.append('fotos', p.file, p.file.name));

    try {
      if (CONFIG.reviews.submitEndpoint) {
        const res = await fetch(CONFIG.reviews.submitEndpoint, { method: 'POST', body: data });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        await wait(1200);
      }
      state.photos.forEach((p) => URL.revokeObjectURL(p.url));
      renderSuccess();
    } catch (err) {
      setLoading(button, false);
      toast('Não foi possível enviar. Tente novamente.', 'error');
    }
  }

  function renderSuccess() {
    mount('review-form', `
      <div class="success" role="status">
        <svg class="success__icon" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r="40"/>
          <path d="M28 45l11 11 21-23"/>
        </svg>
        <h1>Obrigado pela avaliação!</h1>
        <p>Recebemos seu depoimento. Ele será revisado e publicado em breve.</p>
        <div style="height:20px"></div>
        <a class="btn btn--primary btn--block" href="${esc(CONFIG.routes.produto)}">${icon('store', 'i--sm')}Voltar ao produto</a>
      </div>`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="back"]')) goBack(CONFIG.routes.produto);
  });

  render();
  mount('footer', footer());
})();
