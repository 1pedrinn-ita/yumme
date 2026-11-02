/**
 * Etapas do pedido, na ordem em que acontecem. Lidas pelo servidor (api/_orders.js) e pelas páginas
 * de obrigado, rastreio e admin. Cada etapa só aparece para o cliente quando um evento real a registra:
 * pagamento confirmado pela PagPix, lançamento feito pela operação no painel ou evento da transportadora.
 * `optional`: não conta para a barra de progresso (só aparece se acontecer).
 */
(function (steps) {
  if (typeof window !== 'undefined') window.ORDER_STEPS = steps;
  if (typeof module !== 'undefined' && module.exports) module.exports = steps;
})([
  { code: 'pedido_realizado', label: 'Pedido realizado', icon: 'cart', milestone: 'Pedido' },
  { code: 'pagamento_aprovado', label: 'Pagamento aprovado', icon: 'card', milestone: 'Pago' },
  { code: 'em_preparacao', label: 'Pedido em preparação', icon: 'box', milestone: 'Preparo' },
  { code: 'nota_fiscal_emitida', label: 'Nota fiscal emitida', icon: 'doc' },
  { code: 'etiqueta_gerada', label: 'Etiqueta de envio gerada', icon: 'tag' },
  { code: 'objeto_postado', label: 'Objeto postado', icon: 'post', milestone: 'Postado' },
  { code: 'unidade_tratamento', label: 'Objeto recebido na unidade de tratamento', icon: 'building' },
  { code: 'em_transito', label: 'Objeto em trânsito', icon: 'truck', milestone: 'Em trânsito' },
  { code: 'encaminhado', label: 'Objeto encaminhado para outra unidade', icon: 'route' },
  { code: 'unidade_distribuicao', label: 'Objeto chegou à unidade de distribuição', icon: 'building' },
  { code: 'saiu_para_entrega', label: 'Objeto saiu para entrega ao destinatário', icon: 'truck' },
  { code: 'tentativa_nao_realizada', label: 'Tentativa de entrega não realizada', icon: 'alert', optional: true },
  { code: 'entregue', label: 'Objeto entregue ao destinatário', icon: 'check', milestone: 'Entregue' },
  // Evento da transportadora sem etapa equivalente (ex.: aguardando retirada): aparece com a descrição dela.
  { code: 'atualizacao', label: 'Atualização da transportadora', icon: 'info', optional: true },
]);
