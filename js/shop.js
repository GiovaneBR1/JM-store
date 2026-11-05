// Regras de produto usadas pela loja e pela gestão: opções (tamanho, cor…) com preço e estoque
// próprios, e o conteúdo da embalagem (100 ml, 30 g…).
(function () {
  'use strict';

  function round(n) { return Math.round(n * 100) / 100; }
  function hasOptions(p) { return !!(p && Array.isArray(p.variants) && p.variants.length); }

  // Converte o formato antigo das opções ({ name, extra } somado ao preço do produto)
  // para o atual ({ name, price, promoPrice, stock }). O estoque antigo é dividido entre as opções.
  function normalize(p) {
    if (!hasOptions(p) || p.variants.every(function (v) { return v.price != null; })) return p;
    var n = p.variants.length, total = p.stock || 0;
    p.variants = p.variants.map(function (v, i) {
      if (v.price != null) return v;
      var extra = v.extra || 0;
      return {
        name: v.name,
        price: round(p.price + extra),
        promoPrice: p.promoPrice != null && p.promoPrice > 0 ? round(p.promoPrice + extra) : null,
        stock: Math.floor(total / n) + (i < total % n ? 1 : 0)
      };
    });
    p.stock = totalStock(p);
    return p;
  }

  function optionOf(p, v) {
    if (!hasOptions(p)) return null;
    return p.variants.find(function (x) { return x.name === v; }) || null;
  }
  function promoOrPrice(o) { return o.promoPrice != null && o.promoPrice > 0 ? o.promoPrice : o.price; }
  function unitPrice(p, v) { var o = optionOf(p, v); return round(promoOrPrice(o || p)); }
  function listPrice(p, v) { var o = optionOf(p, v); return round((o || p).price); }
  function stockOf(p, v) { var o = optionOf(p, v); return o ? (o.stock || 0) : (p.stock || 0); }
  function totalStock(p) {
    return hasOptions(p) ? p.variants.reduce(function (t, o) { return t + (o.stock || 0); }, 0) : (p.stock || 0);
  }
  // Menor preço entre as opções (para "a partir de R$ X" no card).
  function minPrice(p) {
    if (!hasOptions(p)) return unitPrice(p);
    return Math.min.apply(null, p.variants.map(function (o) { return round(promoOrPrice(o)); }));
  }
  function samePrice(p) {
    if (!hasOptions(p)) return true;
    var first = promoOrPrice(p.variants[0]);
    return p.variants.every(function (o) { return promoOrPrice(o) === first; });
  }

  var UNITS = ['ml', 'L', 'g', 'kg', 'mg', 'un.'];
  function contentLabel(p) {
    var c = p && p.content;
    if (!c || !(c.qty > 0) || !c.unit) return '';
    return String(c.qty).replace('.', ',') + ' ' + c.unit;
  }

  window.JMShop = {
    round: round, hasOptions: hasOptions, normalize: normalize, optionOf: optionOf, unitPrice: unitPrice, listPrice: listPrice,
    stockOf: stockOf, totalStock: totalStock, minPrice: minPrice, samePrice: samePrice, UNITS: UNITS, contentLabel: contentLabel
  };
})();
