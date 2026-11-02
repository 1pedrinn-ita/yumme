/**
 * Componentes do acompanhamento do pedido (obrigado, rastreio e painel): barra de progresso,
 * linha do tempo com ícones e formatação de datas no horário de Brasília. Depende de order-steps.js.
 */
(function () {
  'use strict';

  const STEPS = window.ORDER_STEPS || [];
  const STEP = Object.fromEntries(STEPS.map((step, index) => [step.code, { ...step, index }]));
  const TZ = 'America/Sao_Paulo';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  const priceOrFree = (value) => (Number(value) ? money(value) : 'Grátis');
  const dateTime = (iso) => {
    const date = new Date(iso);
    return { date: date.toLocaleDateString('pt-BR', { timeZone: TZ }), time: date.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) };
  };
  // "AAAA-MM-DD" (data sem hora) ou ISO completo → "dd/mm/aaaa" sem deslocar o dia pelo fuso.
  const shortDate = (value) => {
    const only = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null;
    return only ? only.split('-').reverse().join('/') : new Date(value).toLocaleDateString('pt-BR', { timeZone: TZ });
  };

  const ICONS = {
    cart: '<path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    post: '<path d="M4 10h16v10H4z"/><path d="M2 10 12 4l10 6M9 14h6"/>',
    building: '<path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01"/>',
    truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8z"/><circle cx="6.5" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="ot-icon">${ICONS[name] || ICONS.info}</svg>`;

  // Barra de progresso pelos marcos principais (Pedido, Pagamento, Preparação, Postado, Em trânsito, Entregue).
  function progressHtml(summary) {
    const reached = summary.fulfillment?.reachedIndex ?? -1;
    const milestones = STEPS.filter((step) => step.milestone).map((step) => ({ ...step, index: STEP[step.code].index }));
    const doneCount = milestones.filter((m) => m.index <= reached).length;
    const percent = milestones.length > 1 ? Math.max(0, Math.min(100, ((doneCount - 1) / (milestones.length - 1)) * 100)) : 0;
    return `<div class="ot-progress" role="img" aria-label="Andamento: ${doneCount} de ${milestones.length} etapas">
      <div class="ot-progress__track"><span style="width:${percent}%"></span></div>
      <ol class="ot-progress__steps">${milestones.map((m) => `<li class="${m.index <= reached ? 'is-done' : ''} ${m.index === Math.max(...milestones.filter((x) => x.index <= reached).map((x) => x.index), -1) ? 'is-current' : ''}"><i></i><span>${esc(m.milestone)}</span></li>`).join('')}</ol>
    </div>`;
  }

  // Linha do tempo, do evento mais recente para o mais antigo (como nos rastreios de transportadora).
  function timelineHtml(events, { showSource = false } = {}) {
    if (!events?.length) return '<p class="ot-empty">Ainda não há movimentações registradas.</p>';
    const sourceLabel = { pagpix: 'PagPix', sistema: 'Sistema', admin: 'Operação', correios: 'Correios' };
    return `<ol class="ot-timeline">${events.map((event, i) => {
      const step = STEP[event.code] || STEP.atualizacao;
      const when = dateTime(event.occurredAt || event.occurred_at);
      const title = event.code === 'atualizacao' && event.description ? event.description : step.label;
      const detail = event.code === 'atualizacao' ? '' : event.description;
      return `<li class="ot-event ${i === 0 ? 'is-latest' : ''} ${event.code === 'entregue' ? 'is-delivered' : ''} ${event.code === 'tentativa_nao_realizada' ? 'is-alert' : ''}">
        <span class="ot-event__icon">${icon(step.icon)}</span>
        <div class="ot-event__body">
          <strong>${esc(title)}</strong>
          ${detail ? `<p>${esc(detail)}</p>` : ''}
          ${event.location ? `<p class="ot-event__place">${esc(event.location)}</p>` : ''}
          <time datetime="${esc(event.occurredAt || event.occurred_at)}">${esc(when.date)} às ${esc(when.time)}</time>
          ${showSource && event.source ? `<em class="ot-source">${esc(sourceLabel[event.source] || event.source)}</em>` : ''}
        </div>
      </li>`;
    }).join('')}</ol>`;
  }

  function estimateText(summary) {
    const estimate = summary.estimate || {};
    if (summary.fulfillment?.delivered) return 'Pedido entregue.';
    if (estimate.source === 'transportadora' && estimate.date) return `Previsão da transportadora: até ${shortDate(estimate.date)}`;
    if (estimate.from && estimate.to) return `Estimativa da loja: entre ${shortDate(estimate.from)} e ${shortDate(estimate.to)} (${esc(estimate.eta)})`;
    return '';
  }

  window.OrderTimeline = { STEP, esc, money, priceOrFree, dateTime, shortDate, icon, progressHtml, timelineHtml, estimateText };
})();
