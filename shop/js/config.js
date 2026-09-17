/**
 * SHOP CONFIG
 * Fonte única de dados das páginas /produto e /avaliar.
 * Todos os valores abaixo são PLACEHOLDERS — substitua pelos dados reais.
 * Imagens: preencha `src` com o caminho do arquivo; vazio = placeholder visual.
 */
window.SHOP_CONFIG = {
  locale: 'pt-BR',
  currency: 'BRL',

  routes: {
    home: '../',
    avaliar: '../avaliar/',
    produto: '../produto/',
  },

  store: {
    name: 'Yumme Kids',
    logo: '../shop/img/logo-yumme-kids-brasil.jpg',
    rating: 4.9,
    followers: 12000,
    sold: 50000,
    responseRate: '98%',
    support: { email: 'yumme.kids@gmail.com', phone: '(44) 3112-3477' },
  },

  product: {
    name: 'Yumme Kids Nattury — Suplemento Infantil Sabor Cereja, 60 Cápsulas 750 mg',
    sold: 10000,
    stock: 37,
    images: [
      { src: '../shop/img/produto/produto-01.jpg', alt: 'Imagem 1 do produto' },
      { src: '../shop/img/produto/produto-02.jpg', alt: 'Imagem 2 do produto' },
      { src: '../shop/img/produto/produto-03.jpg', alt: 'Imagem 3 do produto' },
      { src: '../shop/img/produto/produto-04.jpg', alt: 'Imagem 4 do produto' },
      { src: '../shop/img/produto/produto-05.jpg', alt: 'Imagem 5 do produto' },
      { src: '../shop/img/produto/produto-06.jpg', alt: 'Imagem 6 do produto' },
    ],
    coupons: ['Cupom placeholder', 'Frete grátis'],
  },

  /**
   * Opções de compra. O `id` corresponde ao parâmetro ?oferta= usado
   * pelos botões da página inicial (1, 2 e 3, na ordem em que aparecem).
   */
  // checkoutUrl: link do checkout de cada opção (vazio: pendente)
  offers: [
    // oldPrice = preço do pote avulso (R$ 147,90) × quantidade; 0 = sem preço riscado.
    { id: '1', checkoutUrl: '', qty: 1, label: '1 Pote Yumme Kids', detail: '60 cápsulas · 1 mês de uso', price: 147.9, oldPrice: 0, image: '../shop/img/produto/produto-01.jpg', badge: '' },
    { id: '3', checkoutUrl: '', qty: 3, label: '3 Potes Yumme Kids', detail: '180 cápsulas · 3 meses de uso', price: 297.9, oldPrice: 443.7, image: '../shop/img/produto/produto-02.jpg', badge: '' },
    { id: '4', checkoutUrl: '', qty: 5, label: '5 Potes Yumme Kids', detail: '300 cápsulas · 5 meses de uso', price: 347.9, oldPrice: 739.5, image: '../shop/img/produto/produto-05.jpg', badge: 'Melhor custo' },
  ],
  defaultOffer: '3',
  salesCardsTarget: 'produto', // cards da página de vendas: 'produto' (padrão) ou 'checkout'
  installments: 12, // parcelas sem juros exibidas nos cards da página de vendas
  maxQty: 10,

  flashSale: {
    enabled: true,
    label: 'Oferta relâmpago',
    minutes: 15, // janela renovada por sessão
  },

  shipping: {
    free: true,
    price: 0,
    etaMinDays: 5,
    etaMaxDays: 12,
    carrier: 'Transportadora',
  },

  guarantees: [
    { icon: 'rotate', title: 'Devolução grátis', text: 'Texto placeholder sobre a política de devolução.' },
    { icon: 'shield', title: 'Garantia de 90 dias', text: 'Texto placeholder sobre a cobertura da garantia.' },
    { icon: 'lock', title: 'Compra protegida', text: 'Texto placeholder sobre a proteção dos dados.' },
  ],

  benefits: [
    { icon: 'sparkles', title: 'Benefício 1', text: 'Descrição breve do benefício em uma ou duas linhas.' },
    { icon: 'badge', title: 'Benefício 2', text: 'Descrição breve do benefício em uma ou duas linhas.' },
    { icon: 'heart', title: 'Benefício 3', text: 'Descrição breve do benefício em uma ou duas linhas.' },
    { icon: 'zap', title: 'Benefício 4', text: 'Descrição breve do benefício em uma ou duas linhas.' },
  ],

  /**
   * Perguntas frequentes. `image` aparece ao lado da resposta.
   * ATENÇÃO: respostas baseadas no rótulo das imagens enviadas — confirme com o rótulo oficial.
   */
  faq: [
    {
      q: 'Como meu filho deve tomar o Yumme Kids?',
      a: 'A sugestão de uso é de 2 cápsulas ao dia, preferencialmente junto às refeições. Não exceda a recomendação diária de consumo.',
      image: '../shop/img/produto/produto-04.jpg',
    },
    {
      q: 'Quanto tempo dura cada pote?',
      a: 'Cada pote tem 60 cápsulas. Seguindo a sugestão de 2 cápsulas por dia, rende 30 dias de uso. Com 2 ou 3 potes, você garante 2 ou 3 meses sem interrupção.',
      image: '../shop/img/produto/produto-06.jpg',
    },
    {
      q: 'Quais vitaminas e minerais o Yumme Kids tem?',
      a: 'Vitamina A, Vitamina C, Vitamina D, Vitamina E, Vitaminas B1, B6 e B12, Ácido Fólico e Zinco — cada um com 100% do valor diário de referência para crianças de 4 a 8 anos por porção (2 cápsulas).',
      image: '../shop/img/produto/produto-03.jpg',
    },
    {
      q: 'Contém açúcar, glúten ou corantes artificiais?',
      a: 'Não. O Yumme Kids não contém glúten, não tem açúcar e é livre de corantes artificiais. A cor vem do corante natural de cereja (antocianinas).',
      image: '../shop/img/produto/produto-05.jpg',
    },
    {
      q: 'Qual é o sabor?',
      a: 'Sabor cereja, com aroma natural de cereja.',
      image: '../shop/img/produto/produto-01.jpg',
    },
    {
      q: 'O Yumme Kids é um medicamento?',
      a: 'Não. É um suplemento alimentar e não substitui uma alimentação equilibrada nem a orientação do pediatra. Mantenha fora do alcance de crianças.',
      image: '../shop/img/produto/produto-02.jpg',
    },
  ],

  reviews: {
    submitEndpoint: '', // URL que recebe as avaliações (POST multipart/form-data). Vazio = simulação local.
    pageSize: 3,

    // Depoimentos em vídeo (IDs do YouTube já usados na página de vendas)
    videos: [
      { id: 'V0nJ1vAmPpU', title: 'Depoimento de cliente' },
      { id: 'IaUdXVuip2U', title: 'Depoimento de cliente' },
      { id: 'j-lpD_EoBXQ', title: 'Depoimento de cliente' },
      { id: '-VcgQuPKquU', title: 'Depoimento de cliente' },
    ],

    /**
     * Avaliações escritas REAIS (recebidas pela página /avaliar ou enviadas por clientes).
     * A nota média e a contagem da página são calculadas a partir desta lista.
     * Formato:
     * { name: 'Maria S.', date: '2026-09-20', rating: 5, variant: '3 Potes Yumme Kids',
     *   text: 'Comentário do cliente', photos: ['../shop/img/avaliacoes/foto-1.jpg'], helpful: 0 }
     */
    items: [],
  },

  form: {
    endpoint: '',          // URL que recebe o pedido (POST JSON). Vazio = simulação local.
    successRedirect: '',   // opcional: URL para redirecionar após sucesso
    cepLookup: true,       // preenche endereço automaticamente via ViaCEP
  },
};
