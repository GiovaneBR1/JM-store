// Gestão da JM Store: produtos/estoque, vendas e clientes.
// Com o Firebase configurado, só contas admin entram e os dados ficam no Firestore
// (sincronizados entre aparelhos). Sem ele, os dados ficam só no navegador (localStorage).
(function () {
  'use strict';

  var KEY = 'jm-admin-v1';
  var AUTH = window.JMAuth;
  var cloud = !!(AUTH && AUTH.enabled);
  var COLS = ['products', 'customers', 'sales', 'coupons', 'catalog', 'orders'];
  // Status dos pedidos do site (os mesmos rótulos aparecem para o cliente em "Meus pedidos").
  var ORDER_STATUS = [
    ['novo', 'Novo', 'warn'], ['confirmado', 'Confirmado', 'ok'], ['pago', 'Pago', 'ok'],
    ['enviado', 'Saiu para entrega', 'ok'], ['retirar', 'Pronto para retirada', 'ok'],
    ['entregue', 'Finalizado', 'neutral'], ['cancelado', 'Cancelado', 'err']
  ];
  var CLIENT_LABEL = { novo: 'aguardando confirmação', confirmado: 'confirmado', pago: 'pago', enviado: 'saiu para entrega', retirar: 'pronto para retirada', entregue: 'finalizado', cancelado: 'cancelado' };
  var RETURN_STATUS = { solicitada: ['Devolução solicitada', 'warn'], aprovada: ['Devolução aprovada', 'ok'], recusada: ['Devolução recusada', 'err'], concluida: ['Devolvido', 'neutral'] };
  var CATS = window.JM_CATEGORIES || [];
  var PAYMENTS = ['PIX', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Fiado'];
  var app = document.getElementById('app');
  var modal = document.getElementById('modal');
  var modalForm = document.getElementById('modal-form');

  // ---------- helpers ----------
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function brl(n) { return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function round(n) { return Math.round(n * 100) / 100; }
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function fmtDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function catName(slug) { var c = CATS.find(function (c) { return c.slug === slug; }); return c ? c.name : slug || '—'; }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- dados ----------
  var SAMPLE = window.JM_PRODUCTS || [];
  function seed() {
    return {
      products: SAMPLE.map(function (p) {
        return enrich({ id: p.id, name: p.name, category: p.category, cost: 0, price: p.price, promoPrice: p.promoPrice != null ? p.promoPrice : null, stock: p.stock, minStock: 3 });
      }),
      customers: [],
      sales: [],
      coupons: []
    };
  }

  function slugify(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'produto';
  }
  function uniqueSlug(name, selfId) {
    var base = slugify(name), slug = base, n = 2;
    while (db.products.some(function (p) { return p.slug === slug && p.id !== selfId; })) slug = base + '-' + n++;
    return slug;
  }

  // Completa produtos antigos com os campos que a vitrine usa (descrição, desenho, opções…).
  function enrich(p) {
    var src = SAMPLE.find(function (x) { return x.id === p.id; }) || {};
    if (!p.slug) p.slug = src.slug || slugify(p.name);
    if (p.short == null) p.short = src.short || '';
    if (p.description == null) p.description = src.description || '';
    if (p.featured == null) p.featured = !!src.featured;
    if (p.image == null) p.image = src.image || '';
    if (p.promoPrice === undefined) p.promoPrice = null;
    if (p.specs === undefined) p.specs = src.specs || null;
    if (p.variants === undefined) p.variants = src.variants || null;
    if (!p.art) p.art = src.art || { perfumes: 'perfume', maquiagem: 'batom', skincare: 'pote' }[p.category] || 'perfume';
    if (!p.tone) p.tone = src.tone || '#BB6499';
    return p;
  }
  function sellPrice(p) { return p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : p.price; }

  // O que a vitrine pode ver de cada produto (sem custo e estoque mínimo).
  function publicProduct(p) {
    return {
      id: p.id, name: p.name, slug: p.slug, category: p.category, price: p.price, promoPrice: p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : null,
      stock: p.stock, short: p.short || '', description: p.description || '', featured: !!p.featured, image: p.image || '',
      specs: p.specs || null, variants: p.variants || null, art: p.art, tone: p.tone
    };
  }

  var db = null;
  function loadLocal() {
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data || !Array.isArray(data.products)) return null;
    data.coupons = data.coupons || [];
    return data;
  }

  // JSON com as chaves em ordem, para comparar com o que já está na nuvem.
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter(function (k) { return k !== 'id' && v[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  function fields(item) {
    var o = {};
    Object.keys(item).forEach(function (k) { if (k !== 'id' && item[k] !== undefined) o[k] = item[k]; });
    return o;
  }

  var synced = {};   // coleção → id → JSON salvo na nuvem
  var deferred = {}; // atualizações vindas de outro aparelho enquanto um formulário está aberto
  var unsubs = [];

  // Envia para o Firestore só o que mudou desde a última sincronização.
  function save() {
    if (!cloud) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); }
      catch (e) { toast('Não foi possível salvar neste navegador.'); }
      return;
    }
    var fs = AUTH.firestore(), ops = [];
    db.catalog = db.products.map(publicProduct);
    COLS.forEach(function (col) {
      var seen = {};
      db[col].forEach(function (item) {
        var json = stable(item);
        seen[item.id] = true;
        if (synced[col][item.id] !== json) { ops.push({ col: col, id: item.id, data: fields(item) }); synced[col][item.id] = json; }
      });
      Object.keys(synced[col]).forEach(function (id) {
        if (!seen[id]) { ops.push({ col: col, id: id }); delete synced[col][id]; }
      });
    });
    for (var i = 0; i < ops.length; i += 400) {
      var batch = fs.batch();
      ops.slice(i, i + 400).forEach(function (op) {
        var ref = fs.collection(op.col).doc(op.id);
        if (op.data) batch.set(ref, op.data); else batch.delete(ref);
      });
      batch.commit().catch(function (e) {
        toast(e && e.code === 'permission-denied' ? 'Sem permissão para salvar. Sua conta é admin?' : 'Não foi possível salvar na nuvem. Confira a internet.');
      });
    }
  }

  // Catálogo e pedidos do site não fazem parte do backup: são mantidos ao reiniciar ou importar.
  function keepCloud(data) { return Object.assign(data, { catalog: (db && db.catalog) || [], orders: (db && db.orders) || [] }); }

  function applySnap(col, snap) {
    db[col] = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    synced[col] = {};
    db[col].forEach(function (item) { synced[col][item.id] = stable(item); });
  }

  function stopCloud() {
    unsubs.forEach(function (u) { u(); });
    unsubs = []; deferred = {}; db = null;
  }

  function startCloud() {
    stopCloud();
    app.innerHTML = '<p class="empty">Carregando os dados da loja…</p>';
    var fs = AUTH.firestore(), loaded = {}, fresh = { products: [], customers: [], sales: [], coupons: [], catalog: [], orders: [] };
    COLS.forEach(function (col) {
      unsubs.push(fs.collection(col).onSnapshot(function (snap) {
        if (!loaded[col]) {
          loaded[col] = true;
          if (!db) db = fresh;
          applySnap(col, snap);
          if (COLS.every(function (c) { return loaded[c]; })) firstLoad();
          return;
        }
        if (col === 'orders') {
          snap.docChanges().forEach(function (ch) {
            var o = ch.doc.data();
            if (ch.type === 'added' && o.status === 'novo') toast('🛍️ Novo pedido #' + o.code + ' de ' + o.customer.name + '!');
            var before = ch.type === 'modified' && db.orders.find(function (x) { return x.id === ch.doc.id; });
            if (before && !before['return'] && o['return']) toast('↩️ ' + o.customer.name + ' pediu devolução do pedido #' + o.code + '.');
          });
        }
        if (modal.open) { deferred[col] = snap; return; }
        applySnap(col, snap);
        render();
      }, function (e) {
        stopCloud();
        gate('<h1>Não foi possível abrir</h1><p>' + (e && e.code === 'permission-denied'
          ? 'O Firestore recusou o acesso. Publique no console do Firebase a versão mais recente das regras (arquivo firestore.rules).'
          : 'Confira sua conexão com a internet e recarregue a página.') + '</p>');
      }));
    });
  }

  function firstLoad() {
    var empty = !db.products.length && !db.customers.length && !db.sales.length;
    if (empty) {
      var local = loadLocal();
      if (local && confirm('Encontramos dados da gestão salvos neste navegador (' + local.sales.length + ' venda(s), ' +
          local.customers.length + ' cliente(s)). Enviar para a nuvem?')) {
        db = keepCloud({ products: local.products, customers: local.customers, sales: local.sales, coupons: local.coupons });
      } else {
        db = keepCloud(seed());
      }
    }
    db.products.forEach(enrich);
    save(); // também mantém o catálogo público da vitrine em dia
    document.body.classList.remove('locked');
    render();
  }

  modal.addEventListener('close', function () {
    var cols = Object.keys(deferred);
    if (!cols.length || !db) return;
    cols.forEach(function (col) { applySnap(col, deferred[col]); });
    deferred = {};
    render();
  });

  function gate(html) {
    document.body.classList.add('locked');
    app.innerHTML = '<div class="gate">' + html + '</div>';
  }

  function product(id) { return db.products.find(function (p) { return p.id === id; }); }
  function customer(id) { return db.customers.find(function (c) { return c.id === id; }); }
  function saleTotal(s) {
    return round(s.items.reduce(function (t, i) { return t + i.qty * i.price; }, 0) - (s.discount || 0));
  }
  function saleCost(s) { return round(s.items.reduce(function (t, i) { return t + i.qty * (i.cost || 0); }, 0)); }
  function stockPill(p) {
    if (p.stock <= 0) return '<span class="pill pill--err">Esgotado</span>';
    if (p.stock <= p.minStock) return '<span class="pill pill--warn">' + p.stock + ' — repor</span>';
    return '<span class="pill pill--ok">' + p.stock + '</span>';
  }
  function statusPill(s) {
    return s.status === 'pendente' ? '<span class="pill pill--warn">A receber</span>' : '<span class="pill pill--ok">Pago</span>';
  }
  function sortedSales() {
    return db.sales.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt; });
  }

  // ---------- telas ----------
  function viewPainel() {
    var t = today(), month = t.slice(0, 7);
    var monthSales = db.sales.filter(function (s) { return s.date.slice(0, 7) === month; });
    var daySales = db.sales.filter(function (s) { return s.date === t; });
    var sum = function (list, fn) { return list.reduce(function (acc, s) { return acc + fn(s); }, 0); };
    var monthRevenue = sum(monthSales, saleTotal);
    var monthProfit = monthRevenue - sum(monthSales, saleCost);
    var noCost = monthSales.some(function (s) { return s.items.some(function (i) { return !i.cost; }); });
    var pending = db.sales.filter(function (s) { return s.status === 'pendente'; });
    var low = db.products.filter(function (p) { return p.stock <= p.minStock; }).sort(function (a, b) { return a.stock - b.stock; });

    var qtyBy = {};
    monthSales.forEach(function (s) { s.items.forEach(function (i) { qtyBy[i.name] = (qtyBy[i.name] || 0) + i.qty; }); });
    var top = Object.keys(qtyBy).map(function (k) { return [k, qtyBy[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    var max = top.length ? top[0][1] : 1;
    var monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long' });

    return '' +
      (newOrders().length ? '<p class="notice notice--ok">🛍️ ' + newOrders().length + ' pedido(s) novo(s) do site. <a href="#/pedidos">Ver pedidos</a></p>' : '') +
      '<div class="head"><div><h1>Painel</h1><p class="muted">Resumo de ' + monthLabel + '</p></div>' +
      '<div class="actions"><button class="btn" data-action="new-sale">+ Nova venda</button></div></div>' +
      '<section class="stats">' +
        stat('Vendido hoje', brl(sum(daySales, saleTotal)), daySales.length + ' venda(s)') +
        stat('Vendido no mês', brl(monthRevenue), monthSales.length + ' venda(s)') +
        stat('Lucro no mês', brl(monthProfit), noCost ? 'há itens sem custo cadastrado' : 'preço − custo dos produtos') +
        stat('A receber', brl(sum(pending, saleTotal)), pending.length + ' venda(s) pendente(s)') +
      '</section>' +
      '<div class="cols">' +
        '<section class="panel"><h2>Últimas vendas</h2>' + salesTable(sortedSales().slice(0, 6), true) + '</section>' +
        '<div style="display:grid;gap:1.25rem;align-content:start">' +
          '<section class="panel"><h2>Mais vendidos no mês</h2>' +
            (top.length ? '<ol class="bars">' + top.map(function (r) {
              return '<li><span>' + esc(r[0]) + '</span><b class="num">' + r[1] + ' un.</b><i style="--w:' + Math.round(r[1] / max * 100) + '%"></i></li>';
            }).join('') + '</ol>' : '<p class="muted">Nenhuma venda neste mês ainda.</p>') +
          '</section>' +
          '<section class="panel"><h2>Estoque para repor</h2>' +
            (low.length ? '<table><tbody>' + low.map(function (p) {
              return '<tr><td>' + esc(p.name) + '</td><td class="num">' + stockPill(p) + '</td>' +
                '<td class="row-actions"><button class="link" data-action="restock" data-id="' + p.id + '">+ Entrada</button></td></tr>';
            }).join('') + '</tbody></table>' : '<p class="muted">Tudo em dia. 🎉</p>') +
          '</section>' +
        '</div>' +
      '</div>';
  }
  function stat(label, value, sub) { return '<div class="stat"><span>' + label + '</span><b>' + value + '</b><small>' + sub + '</small></div>'; }

  function salesTable(list, compact) {
    if (!list.length) return '<p class="empty">Nenhuma venda registrada.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th>' +
      (compact ? '' : '<th>Itens</th><th>Pagamento</th>') + '<th>Status</th><th class="num">Total</th>' +
      (compact ? '' : '<th></th>') + '</tr></thead><tbody>' +
      list.map(function (s) {
        var c = customer(s.customerId);
        var items = s.items.map(function (i) { return i.qty + '× ' + esc(i.name); }).join('<br>');
        return '<tr><td>' + fmtDate(s.date) + '</td><td>' + (c ? esc(c.name) : '<span class="muted">Balcão</span>') + '</td>' +
          (compact ? '' : '<td>' + items + '</td><td>' + esc(s.payment) + '</td>') +
          '<td>' + statusPill(s) + '</td><td class="num"><b>' + brl(saleTotal(s)) + '</b></td>' +
          (compact ? '' : '<td class="row-actions">' +
            (s.status === 'pendente' ? '<button class="link" data-action="mark-paid" data-id="' + s.id + '">Marcar pago</button>' : '') +
            '<button class="link" data-action="edit-sale" data-id="' + s.id + '">Editar</button>' +
            '<button class="link link--danger" data-action="delete-sale" data-id="' + s.id + '">Excluir</button></td>') +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  var filters = { vendas: { month: today().slice(0, 7), status: '' }, produtos: { q: '', cat: '' }, clientes: { q: '' } };

  function viewVendas() {
    var f = filters.vendas;
    var list = sortedSales().filter(function (s) {
      return (!f.month || s.date.slice(0, 7) === f.month) && (!f.status || s.status === f.status);
    });
    var total = list.reduce(function (t, s) { return t + saleTotal(s); }, 0);
    return '' +
      '<div class="head"><div><h1>Vendas</h1><p class="muted">Cada venda dá baixa no estoque automaticamente.</p></div>' +
      '<div class="actions"><button class="btn" data-action="new-sale">+ Nova venda</button></div></div>' +
      '<div class="toolbar">' +
        '<label>Mês <input type="month" data-filter="vendas.month" value="' + f.month + '"></label>' +
        '<select data-filter="vendas.status" aria-label="Status">' +
          opt('', 'Todas', f.status) + opt('pago', 'Pagas', f.status) + opt('pendente', 'A receber', f.status) +
        '</select>' +
        '<span class="count">' + list.length + ' venda(s) · <b>' + brl(total) + '</b></span>' +
      '</div>' + salesTable(list, false);
  }

  function viewProdutos() {
    var f = filters.produtos, q = f.q.toLowerCase();
    var list = db.products.filter(function (p) {
      return (!f.cat || p.category === f.cat) && (!q || p.name.toLowerCase().indexOf(q) !== -1);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var stockValue = db.products.reduce(function (t, p) { return t + p.stock * p.cost; }, 0);
    return '' +
      '<div class="head"><div><h1>Produtos e estoque</h1><p class="muted">Valor em estoque (pelo custo): <b>' + brl(stockValue) + '</b></p></div>' +
      '<div class="actions"><button class="btn" data-action="new-product">+ Novo produto</button></div></div>' +
      '<div class="toolbar">' +
        '<input type="search" placeholder="Buscar produto…" data-filter="produtos.q" value="' + esc(f.q) + '" aria-label="Buscar produto">' +
        '<select data-filter="produtos.cat" aria-label="Categoria">' + opt('', 'Todas as categorias', f.cat) +
          CATS.map(function (c) { return opt(c.slug, c.name, f.cat); }).join('') + '</select>' +
        '<span class="count">' + list.length + ' produto(s)</span>' +
      '</div>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th></th><th>Produto</th><th class="num">Custo</th><th class="num">Preço</th>' +
        '<th class="num">Margem</th><th class="num">Estoque</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          var price = sellPrice(p);
          var margin = p.cost > 0 && price > 0 ? Math.round((price - p.cost) / price * 100) + '%' : '<span class="muted">—</span>';
          return '<tr><td class="thumb">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span aria-hidden="true">📷</span>') + '</td>' +
            '<td>' + esc(p.name) + (p.featured ? ' <span class="pill pill--neutral">Destaque</span>' : '') + '<span class="sub">' + esc(catName(p.category)) + '</span></td>' +
            '<td class="num">' + (p.cost ? brl(p.cost) : '<span class="muted">—</span>') + '</td>' +
            '<td class="num">' + (price !== p.price ? '<s class="muted">' + brl(p.price) + '</s><br>' : '') + brl(price) + '</td><td class="num">' + margin + '</td>' +
            '<td class="num">' + stockPill(p) + '</td>' +
            '<td class="row-actions"><button class="link" data-action="restock" data-id="' + p.id + '">+ Entrada</button>' +
            '<button class="link" data-action="edit-product" data-id="' + p.id + '">Editar</button>' +
            '<button class="link link--danger" data-action="delete-product" data-id="' + p.id + '">Excluir</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nenhum produto encontrado.</p>');
  }

  function viewClientes() {
    var q = filters.clientes.q.toLowerCase();
    var list = db.customers.filter(function (c) {
      return !q || (c.name + ' ' + c.phone + ' ' + c.neighborhood).toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return '' +
      '<div class="head"><div><h1>Clientes</h1></div>' +
      '<div class="actions"><button class="btn" data-action="new-customer">+ Novo cliente</button></div></div>' +
      '<div class="toolbar"><input type="search" placeholder="Buscar por nome, telefone ou bairro…" data-filter="clientes.q" value="' + esc(filters.clientes.q) + '" aria-label="Buscar cliente">' +
      '<span class="count">' + list.length + ' cliente(s)</span></div>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Nome</th><th>WhatsApp</th><th>Bairro</th>' +
        '<th class="num">Compras</th><th class="num">Total gasto</th><th>Última compra</th><th></th></tr></thead><tbody>' +
        list.map(function (c) {
          var sales = db.sales.filter(function (s) { return s.customerId === c.id; });
          var spent = sales.reduce(function (t, s) { return t + saleTotal(s); }, 0);
          var owes = sales.filter(function (s) { return s.status === 'pendente'; }).reduce(function (t, s) { return t + saleTotal(s); }, 0);
          var last = sales.map(function (s) { return s.date; }).sort().pop();
          var phone = digits(c.phone);
          return '<tr><td>' + esc(c.name) + (c.notes ? '<span class="sub">' + esc(c.notes) + '</span>' : '') + '</td>' +
            '<td>' + (phone ? '<a href="https://wa.me/' + (phone.length <= 11 ? '55' : '') + phone + '" target="_blank" rel="noopener">' + esc(c.phone) + '</a>' : '—') + '</td>' +
            '<td>' + esc(c.neighborhood || '—') + '</td><td class="num">' + sales.length + '</td>' +
            '<td class="num">' + brl(spent) + (owes ? '<span class="sub" style="color:var(--warn)">deve ' + brl(owes) + '</span>' : '') + '</td>' +
            '<td>' + (last ? fmtDate(last) : '—') + '</td>' +
            '<td class="row-actions"><button class="link" data-action="edit-customer" data-id="' + c.id + '">Editar</button>' +
            '<button class="link link--danger" data-action="delete-customer" data-id="' + c.id + '">Excluir</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nenhum cliente cadastrado ainda.</p>');
  }

  function newOrders() { return (db.orders || []).filter(function (o) { return o.status === 'novo' || (o['return'] && o['return'].status === 'solicitada'); }); }
  function orderOfSale(saleId) { return (db.orders || []).find(function (o) { return o.saleId === saleId; }); }

  // Finaliza o pedido: lança a venda (se ainda não foi), marca como paga e registra a data.
  function finishOrder(o) {
    if (!o.saleId) orderToSale(o);
    var sale = db.sales.find(function (x) { return x.id === o.saleId; });
    if (sale) sale.status = 'pago';
    o.status = 'entregue';
    o.finishedAt = firebase.firestore.Timestamp.now();
  }

  // Devolução concluída: desfaz a venda (os produtos voltam ao estoque).
  function undoSale(o) {
    var sale = o.saleId && db.sales.find(function (x) { return x.id === o.saleId; });
    if (sale) {
      sale.items.forEach(function (i) { var p = product(i.productId); if (p) p.stock += i.qty; });
      db.sales = db.sales.filter(function (x) { return x !== sale; });
    }
    delete o.saleId;
  }
  function orderMillis(o) { return o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : 0; }
  function orderWhen(o) {
    if (!o.createdAt || !o.createdAt.toDate) return '—';
    var d = o.createdAt.toDate();
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function waTo(phone, text) {
    var d = digits(phone);
    return d ? 'https://wa.me/' + (d.length <= 11 ? '55' : '') + d + '?text=' + encodeURIComponent(text) : '';
  }

  filters.pedidos = { status: 'abertos' };
  function viewPedidos() {
    var f = filters.pedidos;
    var list = (db.orders || []).filter(function (o) {
      var r = o['return'];
      if (f.status === 'abertos') return (o.status !== 'entregue' && o.status !== 'cancelado') || (r && (r.status === 'solicitada' || r.status === 'aprovada'));
      if (f.status === 'devolucoes') return !!r;
      return !f.status || o.status === f.status;
    }).sort(function (a, b) { return orderMillis(b) - orderMillis(a); });
    return '' +
      '<div class="head"><div><h1>Pedidos do site</h1><p class="muted">Pedidos feitos pela loja. Mude o status e o cliente acompanha em "Meus pedidos".</p></div></div>' +
      (!cloud ? '<p class="notice">Os pedidos do site só aparecem com o login ativado.</p>' : '') +
      '<div class="toolbar"><select data-filter="pedidos.status" aria-label="Status">' +
        opt('abertos', 'Em aberto', f.status) + opt('', 'Todos', f.status) + opt('devolucoes', 'Devoluções', f.status) +
        ORDER_STATUS.map(function (s) { return opt(s[0], s[1], f.status); }).join('') + '</select>' +
        '<span class="count">' + list.length + ' pedido(s)</span></div>' +
      (list.length ? '<div class="orders">' + list.map(function (o) {
        var st = ORDER_STATUS.find(function (s) { return s[0] === o.status; }) || ORDER_STATUS[0];
        var first = (o.customer.name || '').split(' ')[0];
        var wa = waTo(o.customer.phone, 'Olá, ' + first + '! Aqui é da JM Store. Seu pedido #' + o.code + ' está: ' + (CLIENT_LABEL[o.status] || o.status) + '.');
        return '<article class="panel order' + (o.status === 'novo' ? ' order--new' : '') + '">' +
          '<header><div><h2>#' + esc(o.code) + ' <span class="pill pill--' + st[2] + '">' + st[1] + '</span></h2>' +
            '<p class="muted">' + orderWhen(o) + ' · <b>' + esc(o.customer.name) + '</b>' +
            (wa ? ' · <a href="' + wa + '" target="_blank" rel="noopener">' + esc(o.customer.phone) + '</a>' : '') + '</p></div>' +
            '<b class="order__total">' + brl(o.total) + '</b></header>' +
          '<ul class="order__items">' + o.items.map(function (i) {
            return '<li>' + i.qty + 'x ' + esc(i.name) + (i.variant ? ' (' + esc(i.variant) + ')' : '') + ' <span class="muted">' + brl(i.price * i.qty) + '</span></li>';
          }).join('') + '</ul>' +
          '<p class="order__meta">' + (o.delivery.type === 'pickup' ? '🏬 Retirada na loja' : '🚚 ' + esc(o.delivery.address) + ' · frete ' + brl(o.delivery.fee)) +
            ' · 💳 ' + esc(o.payment) + (o.coupon ? ' · 🏷️ ' + esc(o.coupon.code) + ' (−' + brl(o.coupon.discount) + ')' : '') +
            (o.notes ? '<br>📝 ' + esc(o.notes) : '') + '</p>' +
          returnBox(o) +
          '<footer><label>Status <select data-order-status="' + o.id + '">' + ORDER_STATUS.map(function (s) { return opt(s[0], s[1], o.status); }).join('') + '</select></label>' +
            (o.saleId ? '<span class="muted">✓ Venda lançada</span>' : '<button class="btn btn--sm" data-action="order-to-sale" data-id="' + o.id + '">Lançar venda e baixar estoque</button>') +
            (wa ? '<a class="btn btn--ghost btn--sm" href="' + wa + '" target="_blank" rel="noopener">Avisar cliente no WhatsApp</a>' : '') +
          '</footer></article>';
      }).join('') + '</div>' : '<p class="empty">Nenhum pedido aqui.</p>');
  }

  function returnBox(o) {
    var r = o['return'];
    if (!r) return '';
    var st = RETURN_STATUS[r.status] || [r.status, 'warn'];
    var btn = function (act, label, cls) { return '<button class="btn btn--sm ' + (cls || '') + '" data-action="' + act + '" data-id="' + o.id + '">' + label + '</button>'; };
    return '<div class="return return--' + st[1] + '"><p><b>↩️ ' + st[0] + '</b> · motivo: ' + esc(r.reason) + (r.details ? ' — “' + esc(r.details) + '”' : '') + '</p>' +
      (r.note ? '<p class="muted">Resposta da loja: ' + esc(r.note) + '</p>' : '') +
      (r.status === 'solicitada' ? '<div class="return__btns">' + btn('return-approve', 'Aprovar devolução') + btn('return-refuse', 'Recusar', 'btn--danger') + '</div>' : '') +
      (r.status === 'aprovada' ? '<div class="return__btns">' + btn('return-done', 'Produto recebido e reembolso feito') + '</div>' : '') +
      '</div>';
  }

  // Transforma um pedido do site em venda: cadastra/acha o cliente e dá baixa no estoque.
  function orderToSale(o) {
    var phone = digits(o.customer.phone);
    var c = phone && db.customers.find(function (x) { return digits(x.phone) === phone; });
    if (!c) {
      c = { id: uid('c'), name: o.customer.name, phone: o.customer.phone, neighborhood: o.delivery.neighborhood || '', notes: o.customer.email || '' };
      db.customers.push(c);
    }
    var payMap = { 'PIX': 'PIX', 'Pagar na entrega': 'Dinheiro' };
    var sale = {
      id: uid('v'), createdAt: Date.now(), date: today(), customerId: c.id,
      payment: payMap[o.payment] || 'PIX',
      status: ['pago', 'enviado', 'retirar', 'entregue'].indexOf(o.status) !== -1 ? 'pago' : 'pendente',
      discount: o.coupon ? o.coupon.discount : 0,
      items: o.items.map(function (i) {
        var p = product(i.productId);
        return { productId: i.productId, name: i.name + (i.variant ? ' (' + i.variant + ')' : ''), qty: i.qty, price: i.price, cost: p ? p.cost : 0 };
      })
    };
    sale.items.forEach(function (i) { var p = product(i.productId); if (p) p.stock -= i.qty; });
    db.sales.push(sale);
    o.saleId = sale.id;
    if (o.status === 'novo') o.status = 'confirmado';
  }

  function couponLabel(c) { return c.type === 'percent' ? c.value + '%' : brl(c.value); }
  function viewCupons() {
    var list = db.coupons.slice().sort(function (a, b) { return a.code.localeCompare(b.code); });
    return '' +
      '<div class="head"><div><h1>Cupons de desconto</h1><p class="muted">O cliente digita o código ao finalizar o pedido na loja.</p></div>' +
      '<div class="actions"><button class="btn" data-action="new-coupon">+ Novo cupom</button></div></div>' +
      (!cloud ? '<p class="notice">Os cupons só funcionam na loja com o login ativado.</p>' : '') +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Código</th><th class="num">Desconto</th><th class="num">Pedido mínimo</th><th>Status</th><th></th></tr></thead><tbody>' +
        list.map(function (c) {
          return '<tr><td><b>' + esc(c.code) + '</b></td><td class="num">' + couponLabel(c) + '</td>' +
            '<td class="num">' + (c.minOrder ? brl(c.minOrder) : '<span class="muted">—</span>') + '</td>' +
            '<td>' + (c.active ? '<span class="pill pill--ok">Ativo</span>' : '<span class="pill pill--neutral">Pausado</span>') + '</td>' +
            '<td class="row-actions"><button class="link" data-action="toggle-coupon" data-id="' + esc(c.id) + '">' + (c.active ? 'Pausar' : 'Ativar') + '</button>' +
            '<button class="link" data-action="edit-coupon" data-id="' + esc(c.id) + '">Editar</button>' +
            '<button class="link link--danger" data-action="delete-coupon" data-id="' + esc(c.id) + '">Excluir</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nenhum cupom criado ainda.</p>');
  }

  function viewDados() {
    return '' +
      '<div class="head"><div><h1>Backup dos dados</h1><p class="muted">' + (cloud
        ? 'Os dados ficam salvos na nuvem. Mesmo assim, guarde uma cópia de vez em quando.'
        : 'Os dados ficam guardados só neste navegador. Exporte com frequência.') + '</p></div></div>' +
      '<div class="backup">' +
        '<section class="panel"><h2>Exportar</h2><p>Baixa um arquivo com todos os produtos, vendas e clientes.</p>' +
          '<button class="btn" data-action="export">Baixar backup</button></section>' +
        '<section class="panel"><h2>Importar</h2><p>Restaura um backup. Substitui todos os dados atuais.</p>' +
          '<label class="btn btn--ghost">Escolher arquivo<input type="file" accept="application/json,.json" data-action="import" hidden></label></section>' +
        '<section class="panel"><h2>Recomeçar</h2><p>Apaga tudo e volta ao catálogo de exemplo da loja.</p>' +
          '<button class="btn btn--danger" data-action="reset">Apagar dados</button></section>' +
      '</div>';
  }

  function opt(value, label, current) {
    return '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  // ---------- roteamento ----------
  var ROUTES = { '': ['painel', viewPainel], vendas: ['vendas', viewVendas], produtos: ['produtos', viewProdutos], clientes: ['clientes', viewClientes], pedidos: ['pedidos', viewPedidos], cupons: ['cupons', viewCupons], dados: ['dados', viewDados] };
  function route() { return location.hash.replace(/^#\/?/, ''); }
  function render() {
    if (!db) return;
    var r = ROUTES[route()] || ROUTES[''];
    app.innerHTML = (cloud ? '' : '<p class="notice">Login desligado: qualquer pessoa com o link abre esta página e os dados ficam só neste navegador. Veja no README como ativar o login.</p>') + r[1]();
    var badge = $('#orders-badge'), n = newOrders().length;
    if (badge) { badge.textContent = n; badge.hidden = !n; }
    $$('[data-nav]').forEach(function (a) {
      if (a.dataset.nav === r[0]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------- formulários (modal) ----------
  function openModal(html, onSubmit) {
    modalForm.innerHTML = html;
    modalForm.oninput = modalForm.onchange = modalForm.onclick = null;
    modalForm.onsubmit = function (e) {
      if (e.submitter && e.submitter.value === 'cancel') return;
      e.preventDefault();
      if (onSubmit(new FormData(modalForm)) !== false) { modal.close(); save(); render(); }
    };
    modal.showModal();
    var first = $('input, select', modalForm);
    if (first) first.focus();
  }
  function field(label, name, value, attrs, full) {
    return '<label class="field' + (full ? ' field--full' : '') + '"><span>' + label + '</span>' +
      '<input name="' + name + '" value="' + esc(value) + '" ' + (attrs || '') + '></label>';
  }
  function foot(label) {
    return '<div class="modal__foot"><button class="btn btn--ghost" value="cancel" formnovalidate>Cancelar</button><button class="btn" value="ok">' + label + '</button></div>';
  }
  var money = 'type="number" step="0.01" min="0" inputmode="decimal"';

  // Reduz a foto (no máximo 900 px) para caber no banco de dados sem pesar na vitrine.
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 900 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var q = 0.82, type = c.toDataURL('image/webp').indexOf('data:image/webp') === 0 ? 'image/webp' : 'image/jpeg';
        var data = c.toDataURL(type, q);
        while (data.length > 300000 && q > 0.4) { q -= 0.1; data = c.toDataURL(type, q); }
        resolve(data);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  function productForm(p) {
    var isNew = !p;
    p = p || { name: '', category: CATS[0] ? CATS[0].slug : '', cost: '', price: '', promoPrice: null, stock: 0, minStock: 3, short: '', description: '', featured: false, image: '' };
    openModal('<h2>' + (isNew ? 'Novo produto' : 'Editar produto') + '</h2><div class="fields">' +
      field('Nome', 'name', p.name, 'required', true) +
      '<div class="field field--full"><span>Foto</span><div class="photo">' +
        '<div class="photo__img" id="photo-prev">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span>Sem foto</span>') + '</div>' +
        '<div class="photo__btns"><label class="btn btn--ghost btn--sm">Escolher foto<input type="file" accept="image/*" id="photo-file" hidden></label>' +
        '<button type="button" class="link link--danger" id="photo-rm"' + (p.image ? '' : ' hidden') + '>Remover foto</button>' +
        '<small>Foto quadrada ou em pé fica melhor. Ela é reduzida automaticamente.</small></div></div>' +
        '<input type="hidden" name="image" value="' + esc(p.image || '') + '"></div>' +
      '<label class="field"><span>Categoria</span><select name="category">' +
        CATS.map(function (c) { return opt(c.slug, c.name, p.category); }).join('') + '</select></label>' +
      field('Estoque atual', 'stock', p.stock, 'type="number" step="1" required') +
      field('Custo (R$)', 'cost', p.cost, money + ' placeholder="Quanto você pagou"') +
      field('Avisar quando chegar em', 'minStock', p.minStock, 'type="number" step="1" min="0"') +
      field('Preço de venda (R$)', 'price', p.price, money + ' required') +
      field('Preço promocional (R$)', 'promoPrice', p.promoPrice || '', money + ' placeholder="Deixe vazio se não tiver"') +
      field('Descrição curta', 'short', p.short || '', 'maxlength="90" placeholder="Aparece no card da vitrine"', true) +
      '<label class="field field--full"><span>Descrição completa</span><textarea name="description" placeholder="Notas, como usar, volume…">' + esc(p.description || '') + '</textarea></label>' +
      '<label class="check field--full"><input type="checkbox" name="featured"' + (p.featured ? ' checked' : '') + '> Mostrar entre os destaques da vitrine</label>' +
      '</div>' + foot('Salvar'), function (fd) {
      var promo = num(fd.get('promoPrice')), price = num(fd.get('price'));
      if (promo && promo >= price) { toast('O preço promocional precisa ser menor que o preço de venda.'); return false; }
      var data = {
        name: fd.get('name').trim(), category: fd.get('category'), cost: num(fd.get('cost')),
        price: price, promoPrice: promo > 0 ? promo : null,
        stock: parseInt(fd.get('stock'), 10) || 0, minStock: parseInt(fd.get('minStock'), 10) || 0,
        short: fd.get('short').trim(), description: fd.get('description').trim(), featured: fd.get('featured') === 'on', image: fd.get('image')
      };
      if (isNew) {
        var id = uid('p');
        db.products.push(enrich(Object.assign({ id: id, slug: uniqueSlug(data.name, id) }, data)));
      } else {
        Object.assign(p, data);
      }
      toast(isNew ? 'Produto cadastrado.' : 'Produto atualizado.');
    });

    var hidden = $('[name=image]', modalForm), prev = $('#photo-prev', modalForm), rm = $('#photo-rm', modalForm);
    $('#photo-file', modalForm).addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      prev.innerHTML = '<span>Carregando…</span>';
      compressImage(file).then(function (data) {
        hidden.value = data;
        prev.innerHTML = '<img src="' + data + '" alt="">';
        rm.hidden = false;
      }, function () {
        prev.innerHTML = hidden.value ? '<img src="' + esc(hidden.value) + '" alt="">' : '<span>Sem foto</span>';
        toast('Não foi possível abrir essa imagem.');
      });
    });
    rm.addEventListener('click', function () { hidden.value = ''; prev.innerHTML = '<span>Sem foto</span>'; rm.hidden = true; });
  }

  function couponForm(c) {
    var isNew = !c;
    c = c || { code: '', type: 'percent', value: '', minOrder: '', active: true };
    openModal('<h2>' + (isNew ? 'Novo cupom' : 'Editar cupom') + '</h2><div class="fields">' +
      field('Código', 'code', c.code, 'required pattern="[A-Za-z0-9]{3,20}" maxlength="20" style="text-transform:uppercase" placeholder="Ex.: BEMVINDA10"', true) +
      '<label class="field"><span>Tipo de desconto</span><select name="type">' + opt('percent', 'Porcentagem (%)', c.type) + opt('fixed', 'Valor fixo (R$)', c.type) + '</select></label>' +
      field('Desconto', 'value', c.value, money + ' required') +
      field('Pedido mínimo (R$)', 'minOrder', c.minOrder || '', money + ' placeholder="Opcional"') +
      '<label class="check"><input type="checkbox" name="active"' + (c.active ? ' checked' : '') + '> Cupom ativo</label>' +
      '</div><p class="muted" style="font-size:.88rem">Só letras e números, de 3 a 20 caracteres. O cliente digita o código no fechamento do pedido.</p>' + foot('Salvar'), function (fd) {
      var code = fd.get('code').trim().toUpperCase(), type = fd.get('type'), value = num(fd.get('value'));
      if (!/^[A-Z0-9]{3,20}$/.test(code)) { toast('Use só letras e números no código (3 a 20).'); return false; }
      if (value <= 0 || (type === 'percent' && value > 100)) { toast('Confira o valor do desconto.'); return false; }
      if (db.coupons.some(function (x) { return x.id === code && x !== c; })) { toast('Já existe um cupom com esse código.'); return false; }
      var data = { id: code, code: code, type: type, value: value, minOrder: num(fd.get('minOrder')), active: fd.get('active') === 'on' };
      if (isNew) db.coupons.push(data); else Object.assign(c, data);
      toast(isNew ? 'Cupom ' + code + ' criado.' : 'Cupom atualizado.');
    });
  }

  function restockForm(p) {
    openModal('<h2>Entrada de estoque</h2><p>' + esc(p.name) + ' · hoje: <b>' + p.stock + '</b> un.</p><div class="fields">' +
      field('Quantidade que chegou', 'qty', '', 'type="number" step="1" min="1" required') +
      field('Custo por unidade (R$)', 'cost', p.cost || '', money + ' placeholder="Opcional"') +
      '</div>' + foot('Adicionar'), function (fd) {
      var qty = parseInt(fd.get('qty'), 10) || 0;
      p.stock += qty;
      if (num(fd.get('cost')) > 0) p.cost = num(fd.get('cost'));
      toast('+' + qty + ' un. de ' + p.name + '.');
    });
  }

  function customerForm(c, after) {
    var isNew = !c;
    c = c || { name: '', phone: '', neighborhood: '', notes: '' };
    openModal('<h2>' + (isNew ? 'Novo cliente' : 'Editar cliente') + '</h2><div class="fields">' +
      field('Nome', 'name', c.name, 'required', true) +
      field('WhatsApp', 'phone', c.phone, 'type="tel" placeholder="(00) 00000-0000"') +
      field('Bairro', 'neighborhood', c.neighborhood) +
      '<label class="field field--full"><span>Observações</span><textarea name="notes" placeholder="Ex.: prefere perfumes doces">' + esc(c.notes) + '</textarea></label>' +
      '</div>' + foot('Salvar'), function (fd) {
      var data = { name: fd.get('name').trim(), phone: fd.get('phone').trim(), neighborhood: fd.get('neighborhood').trim(), notes: fd.get('notes').trim() };
      if (isNew) { c = Object.assign({ id: uid('c') }, data); db.customers.push(c); } else Object.assign(c, data);
      toast(isNew ? 'Cliente cadastrado.' : 'Cliente atualizado.');
      if (after) { save(); setTimeout(function () { after(c); }); }
    });
  }

  function itemRow(item) {
    item = item || { productId: '', qty: 1, price: '' };
    return '<div class="items__row">' +
      '<select name="productId" aria-label="Produto" required><option value="">Escolha o produto…</option>' +
        db.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === item.productId ? ' selected' : '') + '>' + esc(p.name) + ' (' + p.stock + ' em estoque)</option>';
        }).join('') + '</select>' +
      '<input name="qty" type="number" min="1" step="1" value="' + item.qty + '" aria-label="Quantidade" required>' +
      '<input name="price" ' + money + ' value="' + item.price + '" aria-label="Preço unitário" required>' +
      '<button type="button" class="link link--danger" data-remove-item aria-label="Remover item">✕</button></div>';
  }

  function saleForm(s, draft) {
    var isNew = !s;
    var base = draft || s || { date: today(), customerId: '', payment: 'PIX', status: 'pago', discount: 0, items: [] };
    var items = base.items.length ? base.items : [null];
    openModal('<h2>' + (isNew ? 'Nova venda' : 'Editar venda') + '</h2><div class="fields">' +
      field('Data', 'date', base.date, 'type="date" required') +
      '<label class="field"><span>Cliente</span><select name="customerId">' + opt('', 'Balcão (sem cadastro)', base.customerId) +
        db.customers.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) { return opt(c.id, c.name, base.customerId); }).join('') +
        '<option value="__new">+ Cadastrar cliente…</option></select></label>' +
      '<div class="field field--full"><span>Itens <small>(produto · qtd. · preço un.)</small></span><div class="items" id="items">' +
        items.map(itemRow).join('') + '</div>' +
        '<button type="button" class="link" id="add-item" style="justify-self:start">+ Adicionar item</button></div>' +
      '<label class="field"><span>Pagamento</span><select name="payment">' + PAYMENTS.map(function (p) { return opt(p, p, base.payment); }).join('') + '</select></label>' +
      '<label class="field"><span>Status</span><select name="status">' + opt('pago', 'Pago', base.status) + opt('pendente', 'A receber', base.status) + '</select></label>' +
      field('Desconto (R$)', 'discount', base.discount || '', money) +
      '</div><div class="total-box"><span>Total</span><b id="sale-total">R$ 0,00</b></div>' + foot(isNew ? 'Registrar venda' : 'Salvar'),
    function (fd) {
      var productIds = fd.getAll('productId'), qtys = fd.getAll('qty'), prices = fd.getAll('price');
      var newItems = productIds.map(function (id, i) {
        var p = product(id);
        return { productId: id, name: p ? p.name : '', qty: parseInt(qtys[i], 10) || 0, price: num(prices[i]), cost: p ? p.cost : 0 };
      }).filter(function (i) { return i.productId && i.qty > 0; });
      if (!newItems.length) { toast('Adicione pelo menos um item.'); return false; }

      // devolve o estoque da versão antiga antes de conferir a nova
      if (!isNew) s.items.forEach(function (i) { var p = product(i.productId); if (p) p.stock += i.qty; });
      var need = {};
      newItems.forEach(function (i) { need[i.productId] = (need[i.productId] || 0) + i.qty; });
      var short = Object.keys(need).filter(function (id) { return product(id).stock < need[id]; });
      if (short.length && !confirm('Estoque insuficiente para: ' + short.map(function (id) { return product(id).name; }).join(', ') + '.\nRegistrar mesmo assim?')) {
        if (!isNew) s.items.forEach(function (i) { var p = product(i.productId); if (p) p.stock -= i.qty; });
        return false;
      }
      newItems.forEach(function (i) { product(i.productId).stock -= i.qty; });

      var cid = fd.get('customerId');
      var data = { date: fd.get('date'), customerId: cid === '__new' ? '' : cid, payment: fd.get('payment'), status: fd.get('status'), discount: num(fd.get('discount')), items: newItems };
      if (isNew) db.sales.push(Object.assign({ id: uid('v'), createdAt: Date.now() }, data)); else Object.assign(s, data);
      toast(isNew ? 'Venda registrada: ' + brl(saleTotal(data)) : 'Venda atualizada.');
    });

    var box = $('#items', modalForm);
    function updateTotal() {
      var total = $$('.items__row', box).reduce(function (t, row) {
        return t + (parseInt($('[name=qty]', row).value, 10) || 0) * num($('[name=price]', row).value);
      }, 0) - num($('[name=discount]', modalForm).value);
      $('#sale-total', modalForm).textContent = brl(round(total));
    }
    $('#add-item', modalForm).onclick = function () { box.insertAdjacentHTML('beforeend', itemRow()); };
    modalForm.oninput = updateTotal;
    modalForm.onchange = function (e) {
      if (e.target.name === 'productId') {
        var p = product(e.target.value);
        if (p) $('[name=price]', e.target.parentNode).value = sellPrice(p);
      }
      if (e.target.name === 'customerId' && e.target.value === '__new') {
        var current = readDraft();
        modal.close();
        customerForm(null, function (c) { current.customerId = c.id; saleForm(s, current); });
        return;
      }
      updateTotal();
    };
    modalForm.onclick = function (e) {
      if (e.target.hasAttribute('data-remove-item')) {
        if ($$('.items__row', box).length > 1) e.target.parentNode.remove(); else box.innerHTML = itemRow();
        updateTotal();
      }
    };
    updateTotal();

    function readDraft() {
      var fd = new FormData(modalForm);
      return {
        date: fd.get('date'), customerId: '', payment: fd.get('payment'), status: fd.get('status'), discount: num(fd.get('discount')),
        items: fd.getAll('productId').map(function (id, i) { return { productId: id, qty: parseInt(fd.getAll('qty')[i], 10) || 1, price: fd.getAll('price')[i] }; })
      };
    }
  }

  // ---------- ações ----------
  var ACTIONS = {
    'new-sale': function () { saleForm(null); },
    'edit-sale': function (id) { saleForm(db.sales.find(function (s) { return s.id === id; })); },
    'mark-paid': function (id) {
      db.sales.find(function (s) { return s.id === id; }).status = 'pago';
      // Venda que veio de um pedido do site: o cliente passa a ver a compra como paga/finalizada.
      var o = orderOfSale(id);
      if (o && o.status !== 'entregue' && o.status !== 'cancelado') {
        if (['enviado', 'retirar'].indexOf(o.status) !== -1) finishOrder(o); else o.status = 'pago';
      }
      save(); render(); toast(o ? 'Venda paga. O cliente já vê o pedido #' + o.code + ' atualizado.' : 'Venda marcada como paga.');
    },
    'delete-sale': function (id) {
      var s = db.sales.find(function (s) { return s.id === id; });
      if (!confirm('Excluir esta venda de ' + brl(saleTotal(s)) + '? Os produtos voltam para o estoque.')) return;
      s.items.forEach(function (i) { var p = product(i.productId); if (p) p.stock += i.qty; });
      db.sales = db.sales.filter(function (x) { return x !== s; });
      var o = orderOfSale(id);
      if (o) delete o.saleId;
      save(); render(); toast('Venda excluída.');
    },
    'new-product': function () { productForm(null); },
    'edit-product': function (id) { productForm(product(id)); },
    restock: function (id) { restockForm(product(id)); },
    'delete-product': function (id) {
      var p = product(id);
      if (!confirm('Excluir "' + p.name + '"? As vendas antigas continuam no histórico.')) return;
      db.products = db.products.filter(function (x) { return x !== p; });
      save(); render(); toast('Produto excluído.');
    },
    'new-customer': function () { customerForm(null); },
    'new-coupon': function () { couponForm(null); },
    'return-approve': function (id) {
      var o = db.orders.find(function (o) { return o.id === id; });
      var note = prompt('Mensagem para o cliente (opcional):', 'Devolução aprovada! Vamos combinar a retirada pelo WhatsApp.');
      if (note === null) return;
      o['return'] = Object.assign({}, o['return'], { status: 'aprovada', note: note.trim() });
      save(); render(); toast('Devolução aprovada. Combine com o cliente pelo WhatsApp.');
    },
    'return-refuse': function (id) {
      var o = db.orders.find(function (o) { return o.id === id; });
      var note = prompt('Por que a devolução foi recusada? O cliente vai ver esta mensagem.');
      if (note === null) return;
      o['return'] = Object.assign({}, o['return'], { status: 'recusada', note: note.trim() });
      save(); render(); toast('Devolução recusada.');
    },
    'return-done': function (id) {
      var o = db.orders.find(function (o) { return o.id === id; });
      if (!confirm('Confirmar que o produto voltou e o reembolso foi feito? A venda é desfeita e os produtos voltam ao estoque.')) return;
      undoSale(o);
      o['return'] = Object.assign({}, o['return'], { status: 'concluida' });
      save(); render(); toast('Devolução concluída. Estoque atualizado.');
    },
    'order-to-sale': function (id) {
      var o = db.orders.find(function (o) { return o.id === id; });
      if (!confirm('Lançar o pedido #' + o.code + ' como venda? O estoque dos produtos vai baixar.')) return;
      orderToSale(o);
      save(); render(); toast('Venda lançada e estoque atualizado.');
    },
    'edit-coupon': function (id) { couponForm(db.coupons.find(function (c) { return c.id === id; })); },
    'toggle-coupon': function (id) {
      var c = db.coupons.find(function (c) { return c.id === id; });
      c.active = !c.active;
      save(); render(); toast('Cupom ' + c.code + (c.active ? ' ativado.' : ' pausado.'));
    },
    'delete-coupon': function (id) {
      if (!confirm('Excluir o cupom ' + id + '?')) return;
      db.coupons = db.coupons.filter(function (c) { return c.id !== id; });
      save(); render(); toast('Cupom excluído.');
    },
    'edit-customer': function (id) { customerForm(customer(id)); },
    'delete-customer': function (id) {
      var c = customer(id);
      if (!confirm('Excluir o cliente ' + c.name + '? As vendas dele ficam como "Balcão".')) return;
      db.customers = db.customers.filter(function (x) { return x !== c; });
      db.sales.forEach(function (s) { if (s.customerId === id) s.customerId = ''; });
      save(); render(); toast('Cliente excluído.');
    },
    export: function () {
      var data = { products: db.products, customers: db.customers, sales: db.sales, coupons: db.coupons };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'jm-store-backup-' + today() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    },
    reset: function () {
      if (!confirm('Apagar todas as vendas, clientes e alterações de produtos?')) return;
      db = keepCloud(seed()); save(); render(); toast('Dados reiniciados.');
    }
  };

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT' || !ACTIONS[el.dataset.action]) return;
    ACTIONS[el.dataset.action](el.dataset.id);
  });

  app.addEventListener('input', function (e) {
    var key = e.target.dataset.filter;
    if (!key) return;
    var parts = key.split('.');
    filters[parts[0]][parts[1]] = e.target.value;
    var pos = e.target.selectionStart;
    render();
    var again = $('[data-filter="' + key + '"]');
    if (again && again.type === 'search') { again.focus(); again.setSelectionRange(pos, pos); }
  });

  app.addEventListener('change', function (e) {
    var oid = e.target.dataset.orderStatus;
    if (oid) {
      var o = db.orders.find(function (o) { return o.id === oid; });
      if (e.target.value === 'entregue') {
        if (!o.saleId && !confirm('Finalizar o pedido #' + o.code + '? A venda será lançada como paga e o estoque vai baixar.')) { render(); return; }
        finishOrder(o);
      } else {
        o.status = e.target.value;
      }
      save(); render(); toast('Pedido #' + o.code + ': ' + e.target.selectedOptions[0].textContent + '.');
      return;
    }
    if (e.target.dataset.action !== 'import' || !e.target.files[0]) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data.products) || !Array.isArray(data.sales) || !Array.isArray(data.customers)) throw new Error();
        if (!confirm('Substituir os dados atuais por este backup?')) return;
        data.coupons = data.coupons || [];
        data.products.forEach(enrich);
        db = keepCloud(data); save(); render(); toast('Backup importado.');
      } catch (err) { toast('Arquivo de backup inválido.'); }
    };
    reader.readAsText(e.target.files[0]);
  });

  window.addEventListener('hashchange', function () { render(); app.focus(); });
  if (!cloud) {
    db = loadLocal() || seed();
    db.orders = [];
    db.products.forEach(enrich);
    render();
  } else {
    gate('<p>Carregando…</p>');
    var asked = false;
    AUTH.onChange(function (s) {
      if (!s.user) {
        stopCloud();
        gate('<h1>Área restrita</h1><p>Entre com a conta de administrador da JM Store para abrir a gestão.</p>' +
          '<button class="btn" data-acct="login">Entrar</button><a href="./">Voltar à loja</a>');
        if (!asked) { asked = true; AUTH.login('Entre com a conta de administrador.'); }
      } else if (!s.isAdmin) {
        stopCloud();
        gate('<h1>Sem acesso</h1><p>A conta <b>' + esc(s.user.email) + '</b> não é administradora da loja.</p>' +
          '<p>Para liberar, crie no Firestore a coleção <b>admins</b> com um documento cujo ID é:</p><code>' + esc(s.user.uid) + '</code>' +
          '<button class="btn btn--ghost" data-acct="logout">Sair e entrar com outra conta</button><a href="./">Voltar à loja</a>');
      } else if (!unsubs.length) {
        startCloud();
      }
    });
  }
})();
