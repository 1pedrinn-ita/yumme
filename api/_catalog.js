// Preços e fretes vêm do mesmo config.js que a loja usa: o servidor nunca confia no valor enviado pelo navegador.
const SHOP = require('../shop/js/config.js');

const toCents = (reais) => Math.round(Number(reais) * 100);

const findOffer = (id) => SHOP.offers.find((offer) => offer.id === String(id || ''));

const findShipping = (id) => SHOP.shipping.options.find((option) => option.id === String(id || ''));

const etaText = (option) => `${option.etaMinDays} a ${option.etaMaxDays} dias úteis`;

module.exports = { SHOP, toCents, findOffer, findShipping, etaText };
