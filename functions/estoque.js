// Reserva e devolução de estoque feitas pelo servidor (confirmação e cancelamento automáticos).
// Mexe no produto da gestão (products) e na cópia pública da loja (catalog) na mesma transação.
const admin = require('firebase-admin');

function totalStock(p) {
  return Array.isArray(p.variants) && p.variants.length
    ? p.variants.reduce((t, o) => t + (o.stock || 0), 0)
    : (p.stock || 0);
}
function stockOf(p, variant) {
  if (Array.isArray(p.variants) && p.variants.length) {
    const o = p.variants.find((x) => x.name === variant);
    return o ? (o.stock || 0) : 0;
  }
  return p.stock || 0;
}
function applyDelta(p, variant, delta) {
  if (Array.isArray(p.variants) && p.variants.length) {
    const o = p.variants.find((x) => x.name === variant);
    if (o) o.stock = (o.stock || 0) + delta;
  } else {
    p.stock = (p.stock || 0) + delta;
  }
  p.stock = totalStock(p);
}
// O que a loja enxerga do estoque (igual à gestão em publicProduct).
function publicStock(p) {
  return {
    stock: totalStock(p),
    variants: Array.isArray(p.variants) && p.variants.length
      ? p.variants.map((o) => ({ name: o.name, price: o.price, promoPrice: o.promoPrice != null && o.promoPrice > 0 ? o.promoPrice : null, stock: o.stock || 0 }))
      : null
  };
}

// Soma as quantidades por produto/opção.
function needs(items) {
  const n = {};
  (items || []).forEach((i) => { const k = i.productId + '|' + (i.variant || ''); n[k] = (n[k] || 0) + (i.qty || 0); });
  return Object.keys(n).map((k) => { const [productId, variant] = k.split('|'); return { productId, variant, qty: n[k] }; });
}

// Tenta reservar o estoque do pedido. Devolve { ok: true } ou { ok: false, faltam: [...] }.
async function reservar(orderRef) {
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const os = await tx.get(orderRef), o = os.data();
    if (!o || o.reserved || o.saleId) return { ok: false, faltam: [], ja: true };
    const ns = needs(o.items);
    const refs = ns.map((n) => db.collection('products').doc(n.productId));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const prods = {};
    snaps.forEach((s) => { if (s.exists) prods[s.id] = s.data(); });
    const faltam = ns.filter((n) => !prods[n.productId] || stockOf(prods[n.productId], n.variant) < n.qty)
      .map((n) => (o.items.find((i) => i.productId === n.productId && (i.variant || '') === n.variant) || {}).name + (n.variant ? ' (' + n.variant + ')' : ''));
    if (faltam.length) return { ok: false, faltam };
    ns.forEach((n) => applyDelta(prods[n.productId], n.variant, -n.qty));
    Object.keys(prods).forEach((id) => {
      tx.update(db.collection('products').doc(id), { stock: prods[id].stock, variants: prods[id].variants || null });
      tx.set(db.collection('catalog').doc(id), publicStock(prods[id]), { merge: true });
    });
    tx.update(orderRef, { reserved: true, status: 'confirmado', autoConfirmed: true, confirmedAt: admin.firestore.Timestamp.now() });
    return { ok: true };
  });
}

// Devolve a reserva (pedido cancelado sem venda lançada) e aplica as mudanças extras no pedido.
async function devolver(orderRef, extra) {
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const os = await tx.get(orderRef), o = os.data();
    if (!o) return false;
    const update = Object.assign({}, extra || {});
    if (o.reserved && !o.saleId) {
      const ns = needs(o.items);
      const snaps = await Promise.all(ns.map((n) => tx.get(db.collection('products').doc(n.productId))));
      const prods = {};
      snaps.forEach((s) => { if (s.exists) prods[s.id] = s.data(); });
      ns.forEach((n) => { if (prods[n.productId]) applyDelta(prods[n.productId], n.variant, n.qty); });
      Object.keys(prods).forEach((id) => {
        tx.update(db.collection('products').doc(id), { stock: prods[id].stock, variants: prods[id].variants || null });
        tx.set(db.collection('catalog').doc(id), publicStock(prods[id]), { merge: true });
      });
      update.reserved = false;
    }
    tx.update(orderRef, update);
    return true;
  });
}

module.exports = { reservar, devolver, totalStock };
