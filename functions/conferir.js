// Confere um pedido feito pelo site com os dados de verdade da loja: preço de cada item (com a opção
// escolhida e a promoção), cupom, frete da região e total. Protege contra pedidos montados fora do site
// (ex.: preço de R$ 0,01). Um pedido que não confere não é confirmado sozinho e a loja recebe um alerta.
const admin = require('firebase-admin');

const round = (n) => Math.round(n * 100) / 100;
const temOpcoes = (p) => Array.isArray(p.variants) && p.variants.length > 0;
const promoOuPreco = (o) => (o.promoPrice != null && o.promoPrice > 0 ? o.promoPrice : o.price);
const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Preço unitário igual ao da loja (js/shop.js), inclusive para o formato antigo das opções ({ name, extra }).
function precoUnitario(p, variante) {
  if (!temOpcoes(p)) return round(promoOuPreco(p));
  const o = p.variants.find((x) => x.name === variante);
  if (!o) return null;
  if (o.price != null) return round(promoOuPreco(o));
  const extra = o.extra || 0;
  return round((p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : p.price) + extra);
}

async function conferirPedido(o) {
  const db = admin.firestore(), problemas = [];
  const itens = Array.isArray(o.items) ? o.items : [];
  if (!itens.length) problemas.push('pedido sem itens');
  const ids = [...new Set(itens.map((i) => String(i.productId || '')).filter(Boolean))];
  const snaps = await Promise.all(ids.map((id) => db.collection('products').doc(id).get()));
  const prods = {};
  snaps.forEach((s) => { if (s.exists) prods[s.id] = s.data(); });

  let subtotal = 0;
  itens.forEach((i) => {
    const nome = (i.name || 'item') + (i.variant ? ' (' + i.variant + ')' : '');
    const qty = i.qty;
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) { problemas.push(`${nome}: quantidade inválida`); return; }
    const p = prods[i.productId];
    if (!p) { problemas.push(`${nome}: produto não existe no cadastro`); return; }
    const certo = precoUnitario(p, i.variant || '');
    if (certo == null) { problemas.push(`${nome}: opção não existe`); return; }
    if (typeof i.price !== 'number' || Math.abs(i.price - certo) > 0.005) problemas.push(`${nome}: preço ${brl(i.price)}, o certo é ${brl(certo)}`);
    subtotal += certo * qty;
  });
  subtotal = round(subtotal);

  // Cupom: precisa existir, estar ativo e respeitar o pedido mínimo.
  let desconto = 0;
  if (o.coupon) {
    const code = String(o.coupon.code || '');
    const c = code ? await db.collection('coupons').doc(code).get() : null;
    const cup = c && c.exists ? c.data() : null;
    if (!cup || !cup.active) problemas.push(`cupom ${code || '(vazio)'} não existe ou está pausado`);
    else if (cup.minOrder && subtotal < cup.minOrder) problemas.push(`cupom ${code} exige pedido a partir de ${brl(cup.minOrder)}`);
    else desconto = round(Math.min(subtotal, cup.type === 'percent' ? subtotal * cup.value / 100 : cup.value));
    if (Math.abs((o.coupon.discount || 0) - desconto) > 0.01) problemas.push(`desconto ${brl(o.coupon.discount)}, o certo é ${brl(desconto)}`);
  }

  // Frete: retirada é grátis; entrega usa o valor da região salvo em Ajustes → Dados da loja.
  let frete = 0;
  const d = o.delivery || {};
  if (d.type === 'delivery') {
    const site = await db.collection('site').doc('loja').get();
    const zonas = site.exists && Array.isArray(site.data().shippingZones) ? site.data().shippingZones : null;
    if (zonas) {
      const z = zonas.find((x) => x.name === d.zone);
      if (!z) problemas.push(`região de entrega "${d.zone || ''}" não existe`);
      else frete = round(z.fee || 0);
    } else {
      frete = typeof d.fee === 'number' && d.fee >= 0 ? round(d.fee) : 0; // sem regiões salvas ainda: aceita o frete do site
    }
    if (Math.abs((d.fee || 0) - frete) > 0.01) problemas.push(`frete ${brl(d.fee)}, o certo é ${brl(frete)}`);
  } else if (d.type === 'pickup') {
    if (d.fee) problemas.push('retirada com frete cobrado');
  } else {
    problemas.push('forma de entrega inválida');
  }

  const total = round(subtotal - desconto + frete);
  if (typeof o.total !== 'number' || Math.abs(o.total - total) > 0.01) problemas.push(`total ${brl(o.total)}, o certo é ${brl(total)}`);
  return { ok: !problemas.length, problemas, esperado: { subtotal, desconto, frete, total } };
}

module.exports = { conferirPedido, precoUnitario };
