/**
 * Painel administrativo de pedidos. A sessão (token assinado pelo servidor) fica só nesta aba (sessionStorage).
 * Todo dado vindo do servidor passa por esc() antes de entrar no HTML.
 */
(function () {
  'use strict';

  const { esc, money, dateTime, timelineHtml, STEP } = window.OrderTimeline;
  const app = document.querySelector('#app');
  const state = { token: sessionStorage.getItem('yumme_admin') || '', tab: 'pedidos', q: '', filter: 'todos', page: 0 };
  const STATUS = { paid: ['Pago', 'ok'], pending: ['Pendente', 'wait'], expired: ['Expirado', 'muted'], failed: ['Falhou', 'muted'], refunded: ['Reembolsado', 'bad'], chargeback: ['Chargeback', 'bad'] };
  const FILTERS = [['todos', 'Todos'], ['pagos', 'Pagos'], ['pendentes', 'Pendentes'], ['sem_nf', 'Sem nota fiscal'], ['sem_etiqueta', 'Sem etiqueta'], ['sem_rastreio', 'Sem rastreio oficial']];
  const SOURCES = { pagpix: 'PagPix', sistema: 'Sistema', admin: 'Operação', correios: 'Correios' };

  const when = (iso) => { if (!iso) return '—'; const d = dateTime(iso); return `${d.date} ${d.time}`; };
  const badge = (status) => { const [label, kind] = STATUS[status] || [status || '—', 'muted']; return `<span class="adm-badge adm-badge--${kind}">${esc(label)}</span>`; };
  const stepLabel = (code) => (code ? STEP[code]?.label || code : 'Aguardando pagamento');
  const cpf = (doc) => String(doc || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  async function api(path, { method = 'GET', body } = {}) {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { logout(data.error); throw new Error(data.error); }
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
    return data;
  }

  /* ---------- Acesso ---------- */
  function loginView(message = '') {
    app.innerHTML = `<main class="adm-login"><form class="order-card" id="adm-login">
      <h1>Painel de pedidos</h1><p>Yumme Kids · acesso restrito</p>
      <label>Senha<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="order-button" type="submit">Entrar</button>
      <p class="adm-error"${message ? '' : ' hidden'}>${esc(message)}</p></form></main>`;
    const form = app.querySelector('#adm-login');
    form.password.focus();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button'); button.disabled = true;
      try {
        const response = await fetch('/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.password.value }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
        state.token = data.token; sessionStorage.setItem('yumme_admin', data.token);
        render();
      } catch (error) { loginView(error.message); }
    });
  }
  function logout(message) { sessionStorage.removeItem('yumme_admin'); state.token = ''; loginView(message || ''); }

  function shell(content) {
    app.innerHTML = `<header class="order-top adm-top"><span class="order-top__brand">Yumme Kids · Painel</span>
      <nav class="adm-tabs">${[['pedidos', 'Pedidos'], ['erros', 'Erros e auditoria']].map(([id, label]) => `<button type="button" data-tab="${id}" class="${state.tab === id ? 'is-active' : ''}">${label}</button>`).join('')}</nav>
      <button type="button" class="order-copy" data-logout>Sair</button></header>
      <main class="adm-shell">${content}</main><div class="adm-modal" hidden></div>`;
    app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
    app.querySelector('[data-logout]').addEventListener('click', () => logout());
  }

  /* ---------- Pedidos ---------- */
  async function ordersView() {
    shell('<p class="order-loading">Carregando pedidos…</p>');
    let data;
    try { data = await api(`/api/admin-orders?q=${encodeURIComponent(state.q)}&filter=${state.filter}&page=${state.page}`); } catch (error) { if (state.token) shell(`<p class="adm-error">${esc(error.message)}</p>`); return; }
    const c = data.counts;
    const tiles = [['pagos', 'Pagamentos aprovados', c.pagos], ['pendentes', 'Pagamentos pendentes', c.pendentes], ['todos', 'Total aprovado', money(c.total_pago)], ['sem_nf', 'Sem nota fiscal', c.sem_nf], ['sem_etiqueta', 'Sem etiqueta', c.sem_etiqueta], ['sem_rastreio', 'Sem rastreio oficial', c.sem_rastreio]];
    shell(`
      <section class="adm-tiles">${tiles.map(([filter, label, value]) => `<button type="button" class="adm-tile ${state.filter === filter ? 'is-active' : ''}" data-filter="${filter}"><span>${label}</span><strong>${esc(value)}</strong></button>`).join('')}
        <button type="button" class="adm-tile ${c.erros ? 'adm-tile--bad' : ''}" data-tab-errors><span>Erros de integração</span><strong>${esc(c.erros)}</strong></button></section>
      <form class="adm-toolbar" id="adm-search">
        <input type="search" name="q" value="${esc(state.q)}" placeholder="Buscar por CPF, e-mail, nome, nº do pedido ou código de rastreio" aria-label="Buscar pedidos">
        <select name="filter" aria-label="Filtro">${FILTERS.map(([id, label]) => `<option value="${id}"${state.filter === id ? ' selected' : ''}>${label}</option>`).join('')}</select>
        <button class="order-button" type="submit">Buscar</button>
        <button class="order-button order-button--ghost" type="button" data-sync-all>Reprocessar logística</button>
      </form>
      <p class="adm-feedback" hidden></p>
      <section class="adm-table" role="table" aria-label="Pedidos">
        <div class="adm-row adm-row--head" role="row"><span>Pedido</span><span>Cliente</span><span>Produto</span><span>Valor</span><span>Pagamento</span><span>Logística</span><span>NF</span><span>Rastreio oficial</span></div>
        ${data.orders.length ? data.orders.map((o) => `<button type="button" class="adm-row" role="row" data-ref="${esc(o.reference)}">
          <span><b>${esc(o.reference)}</b><small>${esc(when(o.createdAt))}</small></span>
          <span>${esc(o.customer.name)}<small>${esc(o.customer.email)}</small></span>
          <span>${esc(o.product)}<small>${esc(o.shipping)}</small></span>
          <span>${money(o.amount)}</span><span>${badge(o.status)}</span>
          <span>${esc(stepLabel(o.fulfillment))}</span>
          <span>${o.hasInvoice ? '<span class="adm-badge adm-badge--ok">Emitida</span>' : o.status === 'paid' ? '<span class="adm-badge adm-badge--wait">Pendente</span>' : '—'}</span>
          <span>${o.carrierTrackingCode ? `<code>${esc(o.carrierTrackingCode)}</code><small>${esc(o.carrier)}</small>` : o.status === 'paid' ? '<span class="adm-badge adm-badge--wait">Sem código</span>' : '—'}</span>
        </button>`).join('') : '<p class="ot-empty adm-empty">Nenhum pedido encontrado.</p>'}
      </section>
      <div class="adm-pager">${state.page > 0 ? '<button type="button" class="order-copy" data-page="-1">← Anteriores</button>' : ''}${data.hasMore ? '<button type="button" class="order-copy" data-page="1">Próximos →</button>' : ''}</div>`);
    const form = app.querySelector('#adm-search');
    form.addEventListener('submit', (event) => { event.preventDefault(); state.q = form.q.value.trim(); state.filter = form.filter.value; state.page = 0; ordersView(); });
    app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; state.page = 0; ordersView(); }));
    app.querySelector('[data-tab-errors]').addEventListener('click', () => { state.tab = 'erros'; render(); });
    app.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { state.page += Number(b.dataset.page); ordersView(); }));
    app.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.ref)));
    app.querySelector('[data-sync-all]').addEventListener('click', async (event) => {
      const feedback = app.querySelector('.adm-feedback'); event.target.disabled = true;
      try {
        const result = await api('/api/admin-orders', { method: 'POST', body: { action: 'sync_all' } });
        const added = result.results.reduce((sum, r) => sum + (r.added || 0), 0);
        const problems = result.results.filter((r) => !r.ok);
        feedback.textContent = `${result.results.length} pedido(s) consultado(s), ${added} movimentação(ões) nova(s).${problems.length ? ` ${problems.length} sem consulta: ${problems[0].reason}` : ''}`;
      } catch (error) { feedback.textContent = error.message; }
      feedback.hidden = false; event.target.disabled = false;
    });
  }

  /* ---------- Detalhe do pedido ---------- */
  async function openOrder(reference, message = '') {
    const modal = app.querySelector('.adm-modal');
    modal.hidden = false; document.body.classList.add('adm-modal-open');
    modal.innerHTML = '<div class="adm-dialog"><p class="order-loading">Carregando pedido…</p></div>';
    let o;
    try { o = await api(`/api/admin-order?ref=${encodeURIComponent(reference)}`); } catch (error) { modal.innerHTML = `<div class="adm-dialog"><p class="adm-error">${esc(error.message)}</p><button class="order-copy" data-close>Fechar</button></div>`; modal.querySelector('[data-close]').onclick = closeOrder; return; }
    const s = o.summary;
    const paid = o.status === 'paid';
    // Data/hora já preenchida; se ninguém mudar, vale o momento exato do envio (com segundos).
    const prefill = nowLocal();
    const address = o.address || {};
    modal.innerHTML = `<div class="adm-dialog" role="dialog" aria-modal="true" aria-label="Pedido ${esc(reference)}">
      <header class="adm-dialog__head"><div><h2>${esc(reference)}</h2><p>${badge(o.status)} · criado em ${esc(when(s.createdAt))}${s.paidAt ? ` · pago em ${esc(when(s.paidAt))}` : ''}</p></div><button type="button" class="order-copy" data-close aria-label="Fechar">✕</button></header>
      ${message ? `<p class="adm-feedback">${esc(message)}</p>` : ''}
      <div class="adm-grid">
        <section><h3>Cliente</h3><p><b>${esc(o.customer.name)}</b><br>CPF ${esc(cpf(o.customer.document))}<br>${esc(o.customer.email)}<br>${esc(o.customer.phone)}</p></section>
        <section><h3>Entrega</h3><p>${esc([address.street, address.number].filter(Boolean).join(', '))}${address.complement ? ` · ${esc(address.complement)}` : ''}<br>${esc(address.neighborhood)} · ${esc(address.city)}-${esc(address.state)}<br>CEP ${esc(address.zipcode)}</p></section>
        <section><h3>Pedido</h3><p>${esc(s.product.label)} · ${money(s.product.price)}<br>${esc(s.shipping.label)} · ${s.shipping.price ? money(s.shipping.price) : 'Grátis'}<br><b>Total ${money(s.total)}</b>${o.offer?.order_bump ? '<br><span class="adm-badge adm-badge--ok">Order bump</span>' : ''}</p></section>
        <section><h3>Códigos</h3><p>Acompanhamento: <code>${esc(o.trackingCode || '—')}</code><br>Transportadora: ${o.carrierTrackingCode ? `<code>${esc(o.carrierTrackingCode)}</code> (${esc(o.carrier)})` : '—'}<br>PagPix: <code>${esc(o.gatewayTransactionId || '—')}</code></p></section>
      </div>
      ${paid ? `<div class="adm-forms">
        <form data-action="invoice" class="adm-form"><h3>Nota fiscal ${o.invoice ? '<span class="adm-badge adm-badge--ok">Emitida</span>' : '<span class="adm-badge adm-badge--wait">Pendente</span>'}</h3>
          <p class="adm-hint">Registre a NF-e já emitida no seu sistema fiscal.</p>
          <label>Número<input name="number" inputmode="numeric" value="${esc(o.invoice?.number || '')}" required></label>
          <label>Série<input name="series" value="${esc(o.invoice?.series || '')}"></label>
          <label class="adm-wide">Chave de acesso (44 dígitos)<input name="key" inputmode="numeric" value="${esc(o.invoice?.key || '')}"></label>
          <label class="adm-wide">Link do DANFE (https://)<input name="url" type="url" value="${esc(o.invoice?.url || '')}"></label>
          <label>Data de emissão<input name="issued_at" type="datetime-local" value="${prefill}"></label>
          <button class="order-button" type="submit">${o.invoice ? 'Atualizar nota' : 'Registrar nota'}</button></form>
        <form data-action="label" class="adm-form"><h3>Etiqueta de envio ${o.carrierTrackingCode ? '<span class="adm-badge adm-badge--ok">Gerada</span>' : '<span class="adm-badge adm-badge--wait">Pendente</span>'}</h3>
          <p class="adm-hint">Informe o código oficial que a transportadora gerou para a etiqueta.</p>
          <label>Transportadora<input name="carrier" value="${esc(o.carrier || '')}" placeholder="Ex.: Correios" required></label>
          <label>Código de rastreio oficial<input name="code" value="${esc(o.carrierTrackingCode || '')}" placeholder="Ex.: AB123456789BR" required></label>
          <label>Data da etiqueta<input name="created_at" type="datetime-local" value="${prefill}"></label>
          <button class="order-button" type="submit">Salvar etiqueta</button></form>
        <form data-action="event" class="adm-form"><h3>Lançar movimentação</h3>
          <p class="adm-hint">Use só para registrar o que de fato aconteceu (data e hora reais).</p>
          <label class="adm-wide">Etapa<select name="code">${o.manualSteps.map((step) => `<option value="${esc(step.code)}">${esc(step.label)}</option>`).join('')}</select></label>
          <label>Data e hora<input name="occurred_at" type="datetime-local" value="${prefill}" required></label>
          <label>Local<input name="location" placeholder="Ex.: Unidade de Distribuição - Guarulhos/SP"></label>
          <label class="adm-wide">Observação<input name="description" maxlength="300"></label>
          <button class="order-button" type="submit">Lançar</button></form>
        <form data-action="estimate" class="adm-form"><h3>Previsão da transportadora</h3>
          <label>Data prevista<input name="date" type="date" value="${esc(o.deliveryEstimate || '')}"></label>
          <button class="order-button order-button--ghost" type="submit">Salvar previsão</button>
          <h3>Consulta automática</h3>
          <p class="adm-hint">${o.integration.correios ? 'Integração com os Correios ativa.' : 'Integração com os Correios não configurada.'} Última consulta: ${esc(when(o.logisticsSyncedAt))}.</p>
          <button class="order-button order-button--ghost" type="button" data-sync>Consultar transportadora agora</button></form>
      </div>` : '<p class="adm-hint">Pedido sem pagamento aprovado: não pode receber nota, etiqueta nem movimentações.</p>'}
      <div class="adm-grid adm-grid--2">
        <section><h3>Linha do tempo</h3>${timelineHtml(o.events, { showSource: true })}</section>
        <section><h3>Histórico do cliente</h3>${o.history.length ? `<ul class="adm-list">${o.history.map((h) => `<li><button type="button" class="adm-link" data-ref="${esc(h.reference)}">${esc(h.reference)}</button> ${badge(h.status)} ${money(h.amount)} · ${esc(when(h.createdAt))}</li>`).join('')}</ul>` : '<p class="ot-empty">Nenhum outro pedido deste CPF ou e-mail.</p>'}
          <h3>Auditoria</h3>${o.audit.length ? `<ul class="adm-list">${o.audit.map((a) => `<li><b>${esc(a.action)}</b> · ${esc(a.actor)} · ${esc(when(a.created_at))}</li>`).join('')}</ul>` : '<p class="ot-empty">Nenhuma alteração registrada.</p>'}</section>
      </div></div>`;

    modal.querySelector('[data-close]').onclick = closeOrder;
    modal.onclick = (event) => { if (event.target === modal) closeOrder(); };
    modal.querySelectorAll('.adm-list [data-ref]').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.ref)));
    modal.querySelectorAll('form[data-action]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      ['issued_at', 'created_at', 'occurred_at'].forEach((key) => { if (data[key] === prefill) delete data[key]; else if (data[key]) data[key] = new Date(data[key]).toISOString(); });
      await act(reference, form.dataset.action, data, form.querySelector('button[type="submit"]'));
    }));
    modal.querySelector('[data-sync]')?.addEventListener('click', (event) => act(reference, 'sync', {}, event.target));
  }

  async function act(reference, action, data, button) {
    if (button) button.disabled = true;
    try {
      const result = await api('/api/admin-order', { method: 'POST', body: { ref: reference, action, data } });
      const sync = result.result;
      const message = action === 'sync' ? (sync?.ok ? `${sync.added} movimentação(ões) nova(s).${sync.message ? ` ${sync.message}` : ''}` : sync?.reason || 'Consulta não realizada.') : 'Salvo.';
      await openOrder(reference, message);
    } catch (error) {
      if (button) button.disabled = false;
      const modal = app.querySelector('.adm-dialog');
      let feedback = modal?.querySelector('.adm-feedback');
      if (modal && !feedback) { feedback = document.createElement('p'); feedback.className = 'adm-feedback'; modal.querySelector('.adm-dialog__head').after(feedback); }
      if (feedback) { feedback.textContent = error.message; feedback.classList.add('is-error'); feedback.scrollIntoView({ block: 'center' }); }
    }
  }

  function closeOrder() {
    const modal = app.querySelector('.adm-modal');
    modal.hidden = true; modal.innerHTML = ''; document.body.classList.remove('adm-modal-open');
    ordersView();
  }

  /* ---------- Erros e auditoria ---------- */
  async function errorsView() {
    shell('<p class="order-loading">Carregando…</p>');
    let data;
    try { data = await api('/api/admin-errors'); } catch (error) { if (state.token) shell(`<p class="adm-error">${esc(error.message)}</p>`); return; }
    const sourceName = (s) => SOURCES[s] || s;
    shell(`<section class="order-card"><h2>Erros de integração</h2>
      ${data.errors.length ? `<ul class="adm-list adm-errors">${data.errors.map((e) => `<li class="${e.resolved ? 'is-resolved' : ''}"><div><b>${esc(sourceName(e.source))}</b> · ${esc(when(e.created_at))}${e.order_reference ? ` · <button type="button" class="adm-link" data-ref="${esc(e.order_reference)}">${esc(e.order_reference)}</button>` : ''}<p>${esc(e.message)}</p></div>${e.resolved ? '<span class="adm-badge adm-badge--muted">Resolvido</span>' : `<button type="button" class="order-copy" data-resolve="${esc(e.id)}">Marcar como resolvido</button>`}</li>`).join('')}</ul>` : '<p class="ot-empty">Nenhum erro registrado.</p>'}</section>
      <section class="order-card"><h2>Auditoria</h2>
      ${data.audit.length ? `<ul class="adm-list">${data.audit.map((a) => `<li><b>${esc(a.action)}</b> · ${esc(a.actor)}${a.order_reference ? ` · ${esc(a.order_reference)}` : ''} · ${esc(when(a.created_at))}${a.ip ? ` · IP ${esc(a.ip)}` : ''}</li>`).join('')}</ul>` : '<p class="ot-empty">Nada registrado ainda.</p>'}</section>`);
    app.querySelectorAll('[data-resolve]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await api('/api/admin-errors', { method: 'POST', body: { id: b.dataset.resolve } }); errorsView(); } catch (_) { b.disabled = false; } }));
    app.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => { state.tab = 'pedidos'; ordersView().then(() => openOrder(b.dataset.ref)); }));
  }

  function render() {
    if (!state.token) return loginView();
    return state.tab === 'erros' ? errorsView() : ordersView();
  }
  render();
})();
