// Gestão da JM Store: produtos/estoque, vendas e clientes.
// Com o Firebase configurado, só contas admin entram e os dados ficam no Firestore
// (sincronizados entre aparelhos). Sem ele, os dados ficam só no navegador (localStorage).
(function () {
  'use strict';

  var KEY = 'jm-admin-v1';
  var AUTH = window.JMAuth;
  var cloud = !!(AUTH && AUTH.enabled);
  var COLS = ['products', 'customers', 'sales', 'coupons', 'catalog', 'orders', 'categories', 'settings'];
  var SHOP = window.JMShop;
  // Status dos pedidos do site (os mesmos rótulos aparecem para o cliente em "Meus pedidos").
  var ORDER_STATUS = [
    ['novo', 'Novo', 'warn'], ['confirmado', 'Confirmado', 'ok'], ['pago', 'Pago', 'ok'],
    ['enviado', 'Saiu para entrega', 'ok'], ['retirar', 'Pronto para retirada', 'ok'],
    ['entregue', 'Finalizado', 'neutral'], ['cancelado', 'Cancelado', 'err']
  ];
  var CLIENT_LABEL = { novo: 'aguardando confirmação', confirmado: 'confirmado', pago: 'pago', enviado: 'saiu para entrega', retirar: 'pronto para retirada', entregue: 'finalizado', cancelado: 'cancelado' };
  var RETURN_STATUS = { solicitada: ['Devolução solicitada', 'warn'], aprovada: ['Devolução aprovada', 'ok'], recusada: ['Devolução recusada', 'err'], concluida: ['Devolvido', 'neutral'] };
  // Categorias iniciais (as três primeiras aparecem na vitrine); depois a loja cria as suas na gestão.
  var DEFAULT_CATS = (window.JM_CATEGORIES || []).map(function (c, i) { return { id: c.slug, name: c.name, order: i, featured: i < 3 }; });
  var PAYMENTS = ['PIX', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Fiado'];
  var DEFAULT_SETTINGS = { id: 'loja', goal: 0, staleDays: 30 };
  // Automações do servidor (functions/index.js); padrões iguais aos de lá.
  var AUTO_DEFAULTS = { autoConfirm: false, lembretePix: true, autoCancelDays: 3, alertaEstoque: true, resumoDiario: true };
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
  function cats() {
    var list = db && db.categories && db.categories.length ? db.categories : DEFAULT_CATS;
    return list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name); });
  }
  function catName(slug) { var c = cats().find(function (c) { return c.id === slug; }); return c ? c.name : slug ? slug : 'Sem categoria'; }
  function settings() { return (db && db.settings && db.settings[0]) || DEFAULT_SETTINGS; }
  function totalStock(p) { return SHOP.totalStock(p); }
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
      coupons: [],
      categories: DEFAULT_CATS.map(function (c) { return Object.assign({}, c); }),
      settings: [Object.assign({}, DEFAULT_SETTINGS)]
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
    if (p.variants === undefined) p.variants = src.variants ? JSON.parse(JSON.stringify(src.variants)) : null;
    if (p.content === undefined) p.content = null;
    if (!p.createdAt) p.createdAt = Date.now();
    SHOP.normalize(p);
    if (SHOP.hasOptions(p)) p.stock = SHOP.totalStock(p);
    if (!p.art) p.art = src.art || { perfumes: 'perfume', maquiagem: 'batom', skincare: 'pote' }[p.category] || 'perfume';
    if (!p.tone) p.tone = src.tone || '#BB6499';
    return p;
  }
  function sellPrice(p, v) { return SHOP.unitPrice(p, v); }

  // O que a vitrine pode ver de cada produto (sem custo e estoque mínimo).
  function publicProduct(p) {
    return {
      id: p.id, name: p.name, slug: p.slug, category: p.category, price: p.price, promoPrice: p.promoPrice != null && p.promoPrice > 0 ? p.promoPrice : null,
      stock: totalStock(p), short: p.short || '', description: p.description || '', featured: !!p.featured, image: p.image || '',
      specs: p.specs || null, art: p.art, tone: p.tone, content: p.content || null,
      variants: SHOP.hasOptions(p) ? p.variants.map(function (o) { return { name: o.name, price: o.price, promoPrice: o.promoPrice != null && o.promoPrice > 0 ? o.promoPrice : null, stock: o.stock || 0 }; }) : null
    };
  }

  var db = null;
  function loadLocal() {
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data || !Array.isArray(data.products)) return null;
    data.coupons = data.coupons || [];
    data.categories = data.categories || [];
    data.settings = data.settings || [];
    return data;
  }

  // Garante categorias (incluindo as que os produtos já usam) e as configurações da loja.
  function ensureBasics() {
    if (!db.categories) db.categories = [];
    var launched = db.settings && db.settings[0] && db.settings[0].launched;
    if (!db.categories.length && !launched) db.categories = DEFAULT_CATS.map(function (c) { return Object.assign({}, c); });
    db.products.forEach(function (p) {
      if (p.category && !db.categories.some(function (c) { return c.id === p.category; })) {
        db.categories.push({ id: p.category, name: p.category.charAt(0).toUpperCase() + p.category.slice(1), order: db.categories.length, featured: false });
      }
    });
    if (!db.settings || !db.settings.length) db.settings = [Object.assign({}, DEFAULT_SETTINGS)];
    db.products.forEach(enrich);
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
  function keepCloud(data) {
    return Object.assign({ categories: (db && db.categories) || [], settings: (db && db.settings) || [] }, data, { catalog: (db && db.catalog) || [], orders: (db && db.orders) || [] });
  }

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
    var fs = AUTH.firestore(), loaded = {}, fresh = { products: [], customers: [], sales: [], coupons: [], catalog: [], orders: [], categories: [], settings: [] };
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
    // Primeira vez da loja: sem configurações e sem dados. Depois do "Preparar para o lançamento",
    // as configurações existem e a gestão não volta a criar os produtos de exemplo.
    var empty = !db.settings.length && !db.products.length && !db.customers.length && !db.sales.length;
    if (empty) {
      var local = loadLocal();
      if (local && confirm('Encontramos dados da gestão salvos neste navegador (' + local.sales.length + ' venda(s), ' +
          local.customers.length + ' cliente(s)). Enviar para a nuvem?')) {
        db = keepCloud({ products: local.products, customers: local.customers, sales: local.sales, coupons: local.coupons, categories: local.categories, settings: local.settings });
      } else {
        db = keepCloud(seed());
      }
    }
    ensureBasics();
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
  // Mexe no estoque do produto ou, se ele tem opções, no da opção vendida.
  function adjustStock(productId, variant, delta) {
    var p = product(productId);
    if (!p) return;
    var o = SHOP.optionOf(p, variant);
    if (o) { o.stock = (o.stock || 0) + delta; p.stock = SHOP.totalStock(p); }
    else p.stock = (p.stock || 0) + delta;
  }
  function stockOf(productId, variant) { var p = product(productId); return p ? SHOP.stockOf(p, variant) : 0; }
  function itemLabel(i) { return i.name + (i.variant ? ' (' + i.variant + ')' : ''); }
  function customer(id) { return db.customers.find(function (c) { return c.id === id; }); }
  function saleTotal(s) {
    return round(s.items.reduce(function (t, i) { return t + i.qty * i.price; }, 0) - (s.discount || 0));
  }
  function saleCost(s) { return round(s.items.reduce(function (t, i) { return t + i.qty * (i.cost || 0); }, 0)); }
  function stockPill(p) {
    var st = totalStock(p);
    if (st <= 0) return '<span class="pill pill--err">Esgotado</span>';
    if (st <= p.minStock) return '<span class="pill pill--warn">' + st + ' — repor</span>';
    return '<span class="pill pill--ok">' + st + '</span>';
  }
  function statusPill(s) {
    return s.status === 'pendente' ? '<span class="pill pill--warn">A receber</span>' : '<span class="pill pill--ok">Pago</span>';
  }
  function sortedSales() {
    return db.sales.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt; });
  }

  // ---------- telas ----------
  function painelCtx() {
    return {
      sales: db.sales, products: db.products, customers: db.customers, settings: settings(),
      product: product, customer: customer, catName: catName, saleTotal: saleTotal, saleCost: saleCost,
      totalStock: totalStock, minPrice: SHOP.minPrice, toast: toast,
      onGoal: function (v) { settings().goal = v; save(); render(); toast(v ? 'Meta do mês: ' + brl(v) + '.' : 'Meta removida.'); }
    };
  }
  function viewPainel() {
    var low = db.products.filter(function (p) { return totalStock(p) <= p.minStock; }).sort(function (a, b) { return totalStock(a) - totalStock(b); });
    return '' +
      (newOrders().length ? '<p class="notice notice--ok">🛍️ ' + newOrders().length + ' pedido(s) do site esperando você. <a href="#/pedidos">Ver pedidos</a></p>' : '') +
      '<div class="head"><div><h1>Painel</h1></div>' +
      '<div class="actions"><button class="btn" data-action="new-sale">+ Nova venda</button></div></div>' +
      window.JMPainel.html(painelCtx()) +
      (low.length ? '<section class="panel" style="margin-top:1.25rem"><h2>Estoque para repor</h2><table><tbody>' + low.map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td class="num">' + stockPill(p) + '</td>' +
          '<td class="row-actions"><button class="link" data-action="restock" data-id="' + p.id + '">+ Entrada</button></td></tr>';
      }).join('') + '</tbody></table></section>' : '');
  }
  function bindPainel() { window.JMPainel.bind(app, painelCtx(), render); }
  function stat(label, value, sub) { return '<div class="stat"><span>' + label + '</span><b>' + value + '</b><small>' + sub + '</small></div>'; }

  function salesTable(list, compact) {
    if (!list.length) return '<p class="empty">Nenhuma venda registrada.</p>';
    return '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th>' +
      (compact ? '' : '<th>Itens</th><th>Pagamento</th>') + '<th>Status</th><th class="num">Total</th>' +
      (compact ? '' : '<th></th>') + '</tr></thead><tbody>' +
      list.map(function (s) {
        var c = customer(s.customerId);
        var items = s.items.map(function (i) { return i.qty + '× ' + esc(itemLabel(i)); }).join('<br>');
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

  var filters = { vendas: { month: today().slice(0, 7), status: '' }, produtos: { q: '', cat: '', sit: '' }, clientes: { q: '' } };

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
    var last = window.JMPainel.lastSales(painelCtx()), now = window.JMPainel.todayDate(), sit = {};
    db.products.forEach(function (p) { sit[p.id] = window.JMPainel.productSituation(painelCtx(), p, last, now); });
    var list = db.products.filter(function (p) {
      return (!f.cat || p.category === f.cat) && (!q || p.name.toLowerCase().indexOf(q) !== -1) && (!f.sit || (f.sit === 'parados' ? sit[p.id].stopped : totalStock(p) <= 0));
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var stockValue = db.products.reduce(function (t, p) { return t + totalStock(p) * (p.cost || 0); }, 0);
    var stoppedN = db.products.filter(function (p) { return sit[p.id].stopped; }).length;
    return '' +
      '<div class="head"><div><h1>Produtos e estoque</h1><p class="muted">Valor em estoque (pelo custo): <b>' + brl(stockValue) + '</b></p></div>' +
      '<div class="actions"><button class="btn" data-action="new-product">+ Novo produto</button></div></div>' +
      '<div class="toolbar">' +
        '<input type="search" placeholder="Buscar produto…" data-filter="produtos.q" value="' + esc(f.q) + '" aria-label="Buscar produto">' +
        '<select data-filter="produtos.cat" aria-label="Categoria">' + opt('', 'Todas as categorias', f.cat) +
          cats().map(function (c) { return opt(c.id, c.name, f.cat); }).join('') + '</select>' +
        '<select data-filter="produtos.sit" aria-label="Situação">' + opt('', 'Todas as situações', f.sit) + opt('parados', 'Só parados (' + stoppedN + ')', f.sit) + opt('esgotados', 'Só esgotados', f.sit) + '</select>' +
        '<span class="count">' + list.length + ' produto(s)</span>' +
      '</div>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th></th><th>Produto</th><th class="num">Custo</th><th class="num">Preço</th>' +
        '<th class="num">Margem</th><th class="num">Estoque</th><th>Situação</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          var opts = SHOP.hasOptions(p), price = opts ? SHOP.minPrice(p) : sellPrice(p), st = sit[p.id];
          var margin = p.cost > 0 && price > 0 ? Math.round((price - p.cost) / price * 100) + '%' : '<span class="muted">—</span>';
          var situation = totalStock(p) <= 0 ? '<span class="muted">Sem estoque</span>'
            : st.stopped ? '<span class="pill pill--warn" title="' + (st.never ? 'Nunca vendeu desde o cadastro' : 'Última venda em ' + fmtDate(st.last)) + '">Parado há ' + st.days + ' dias</span>'
            : '<span class="pill pill--neutral">' + (st.last ? 'Vendeu em ' + fmtDate(st.last).slice(0, 5) : 'Novo') + '</span>';
          return '<tr><td class="thumb">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span aria-hidden="true">📷</span>') + '</td>' +
            '<td>' + esc(p.name) + (p.featured ? ' <span class="pill pill--neutral">Destaque</span>' : '') +
              '<span class="sub">' + esc(catName(p.category)) + (SHOP.contentLabel(p) ? ' · ' + esc(SHOP.contentLabel(p)) : '') + (opts ? ' · ' + p.variants.length + ' opções: ' + esc(p.variants.map(function (o) { return o.name + ' (' + (o.stock || 0) + ')'; }).join(', ')) : '') + '</span></td>' +
            '<td class="num">' + (p.cost ? brl(p.cost) : '<span class="muted">—</span>') + '</td>' +
            '<td class="num">' + (opts ? (SHOP.samePrice(p) ? '' : '<small class="muted">a partir de</small><br>') : price !== p.price ? '<s class="muted">' + brl(p.price) + '</s><br>' : '') + brl(price) + '</td><td class="num">' + margin + '</td>' +
            '<td class="num">' + stockPill(p) + '</td><td>' + situation + '</td>' +
            '<td class="row-actions"><button class="link" data-action="restock" data-id="' + p.id + '">+ Entrada</button>' +
            '<button class="link" data-action="edit-product" data-id="' + p.id + '">Editar</button>' +
            '<button class="link" data-action="duplicate-product" data-id="' + p.id + '">Duplicar</button>' +
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
      sale.items.forEach(function (i) { adjustStock(i.productId, i.variant, i.qty); });
      db.sales = db.sales.filter(function (x) { return x !== sale; });
    }
    delete o.saleId;
    o.reserved = false;
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
      (!cloud ? '<p class="notice">Os pedidos do site só aparecem com o login ativado.</p>' : '<div class="push-card" id="push-card"><b>Avisos de pedido neste aparelho</b><span class="muted">Verificando…</span></div>' + autoPanel()) +
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
          (o.reserved && !o.saleId ? '<p class="order__flags"><span class="pill pill--ok">Estoque reservado</span>' + (o.autoConfirmed ? ' <span class="pill pill--neutral">Confirmado automaticamente</span>' : '') + '</p>' : '') +
          (o.status === 'cancelado' && o.autoCancelled ? '<p class="order__flags"><span class="pill pill--warn">Cancelado automaticamente: PIX não pago</span></p>' : '') +
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

  function autoPanel() {
    var a = Object.assign({}, AUTO_DEFAULTS, settings());
    var box = function (k, label, hint) {
      return '<label class="auto-item"><input type="checkbox" data-auto="' + k + '"' + (a[k] ? ' checked' : '') + '><span><b>' + label + '</b><small>' + hint + '</small></span></label>';
    };
    return '<details class="auto"' + (filters.pedidos.autoOpen ? ' open' : '') + '><summary><b>Automações</b> <span class="muted">' +
        [a.autoConfirm ? 'confirmação automática' : '', a.lembretePix ? 'lembrete de PIX' : '', a.autoCancelDays > 0 ? 'cancelamento em ' + a.autoCancelDays + ' dia(s)' : '', a.alertaEstoque ? 'estoque baixo' : '', a.resumoDiario ? 'resumo às 8h' : ''].filter(Boolean).join(' · ') + '</span></summary>' +
      '<div class="auto-grid">' +
        box('autoConfirm', 'Confirmar pedidos automaticamente', 'Se todos os itens tiverem estoque, o pedido vira "Confirmado" e o estoque fica reservado. Se faltar algo, você recebe um aviso.') +
        box('lembretePix', 'Lembrar o PIX', 'Pedido confirmado e não pago: lembrete ao cliente em 24 h e aviso para você em 48 h.') +
        '<label class="auto-item"><input type="checkbox" data-auto="cancelOn"' + (a.autoCancelDays > 0 ? ' checked' : '') + '><span><b>Cancelar PIX não pago</b><small>Pedido confirmado e sem PIX depois de <input type="number" min="1" max="30" step="1" data-auto="autoCancelDays" value="' + (a.autoCancelDays > 0 ? a.autoCancelDays : 3) + '" aria-label="Dias"> dia(s) é cancelado, o estoque volta e o cliente é avisado. Cartão na entrega não entra.</small></span></label>' +
        box('alertaEstoque', 'Avisar estoque baixo', 'E-mail e notificação quando um produto chega no mínimo ou esgota.') +
        box('resumoDiario', 'Resumo diário às 8h', 'E-mail com pedidos para confirmar e entregar, vendas de ontem, fiado e estoque baixo.') +
      '</div><p class="muted" style="font-size:.82rem;margin:.4rem 0 0">Os e-mails saem de ' + 'jmstore403@gmail.com' + '. Pedidos de demonstração não disparam nada.</p></details>';
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

  // Pedido confirmado segura o estoque (reserva); cancelar sem venda lançada devolve.
  function reserveOrder(o) {
    if (o.reserved || o.saleId) return true;
    var need = {};
    o.items.forEach(function (i) { var k = i.productId + '|' + (i.variant || ''); need[k] = (need[k] || 0) + i.qty; });
    var short = Object.keys(need).filter(function (k) { var p = k.split('|'); return stockOf(p[0], p[1]) < need[k]; });
    if (short.length && !confirm('Falta estoque para: ' + short.map(function (k) { var p = k.split('|'), pr = product(p[0]); return (pr ? pr.name : 'produto excluído') + (p[1] ? ' (' + p[1] + ')' : ''); }).join(', ') + '.\nConfirmar mesmo assim?')) return false;
    o.items.forEach(function (i) { adjustStock(i.productId, i.variant, -i.qty); });
    o.reserved = true;
    return true;
  }
  function releaseOrder(o) {
    if (!o.reserved || o.saleId) return;
    o.items.forEach(function (i) { adjustStock(i.productId, i.variant, i.qty); });
    o.reserved = false;
  }

  // Transforma um pedido do site em venda: cadastra/acha o cliente e dá baixa no estoque.
  function orderToSale(o) {
    var phone = digits(o.customer.phone);
    var c = phone && db.customers.find(function (x) { return digits(x.phone) === phone; });
    if (!c) {
      c = { id: uid('c'), name: o.customer.name, phone: o.customer.phone, neighborhood: o.delivery.neighborhood || '', notes: o.customer.email || '' };
      db.customers.push(c);
    }
    var sale = {
      id: uid('v'), createdAt: Date.now(), date: today(), customerId: c.id, channel: 'site', orderId: o.id,
      payment: /cart/i.test(o.payment) ? 'Cartão (na entrega)' : /dinheiro|entrega/i.test(o.payment) ? 'Dinheiro' : 'PIX',
      status: ['pago', 'enviado', 'retirar', 'entregue'].indexOf(o.status) !== -1 ? 'pago' : 'pendente',
      discount: o.coupon ? o.coupon.discount : 0,
      items: o.items.map(function (i) {
        var p = product(i.productId);
        return { productId: i.productId, name: p ? p.name : i.name, variant: i.variant || '', category: i.category || (p ? p.category : ''), qty: i.qty, price: i.price, cost: p ? p.cost || 0 : 0 };
      })
    };
    // Se o pedido já reservou o estoque, a venda não baixa de novo.
    if (!o.reserved) sale.items.forEach(function (i) { adjustStock(i.productId, i.variant, -i.qty); });
    db.sales.push(sale);
    o.saleId = sale.id;
    if (o.status === 'novo') o.status = 'confirmado';
  }

  function viewCategorias() {
    var list = cats(), featuredN = list.filter(function (c) { return c.featured; }).length;
    return '' +
      '<div class="head"><div><h1>Categorias</h1><p class="muted">Viram os filtros da loja. Marque até 3 para aparecer na vitrine da página inicial.</p></div>' +
      '<div class="actions"><button class="btn" data-action="new-category">+ Nova categoria</button></div></div>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Ordem</th><th>Categoria</th><th class="num">Produtos</th><th>Na vitrine</th><th></th></tr></thead><tbody>' +
        list.map(function (c, i) {
          var n = db.products.filter(function (p) { return p.category === c.id; }).length;
          return '<tr><td class="row-actions" style="text-align:left">' +
              '<button class="link" data-action="cat-up" data-id="' + esc(c.id) + '" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
              '<button class="link" data-action="cat-down" data-id="' + esc(c.id) + '" aria-label="Descer"' + (i === list.length - 1 ? ' disabled' : '') + '>↓</button></td>' +
            '<td><b>' + esc(c.name) + '</b></td><td class="num">' + n + '</td>' +
            '<td><label class="check"><input type="checkbox" data-cat-featured="' + esc(c.id) + '"' + (c.featured ? ' checked' : '') + (!c.featured && featuredN >= 3 ? ' disabled title="Já há 3 na vitrine"' : '') + '> Vitrine</label></td>' +
            '<td class="row-actions"><button class="link" data-action="rename-category" data-id="' + esc(c.id) + '">Renomear</button>' +
              '<button class="link link--danger" data-action="delete-category" data-id="' + esc(c.id) + '">Excluir</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nenhuma categoria ainda.</p>') +
      '<p class="muted" style="margin-top:1rem;font-size:.9rem">Na loja, só aparecem as categorias que têm produtos. Na vitrine, Perfumes, Maquiagem e Skincare usam os desenhos da loja; as outras mostram a foto de um produto da categoria.</p>';
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
      '</div>' +
      '<div class="head" style="margin-top:2rem"><div><h2 style="font-size:1.8rem">Treino e lançamento</h2><p class="muted">Para conhecer a gestão com dados de mentira e, depois, deixar tudo pronto para as vendas de verdade.</p></div></div>' +
      '<div class="backup">' +
        '<section class="panel"><h2>Dados de demonstração</h2><p>Preenche clientes, vendas dos últimos meses, pedidos do site (com uma devolução) e um cupom, todos fictícios e marcados como demonstração. O estoque não muda.</p>' +
          (db.sales.some(function (x) { return x.demo; }) ? '<p class="notice">Há dados de demonstração carregados.</p>' : '') +
          '<div class="actions"><button class="btn btn--ghost" data-action="demo-load">Carregar demonstração</button>' +
          (db.sales.some(function (x) { return x.demo; }) || db.customers.some(function (x) { return x.demo; }) ? '<button class="btn btn--danger" data-action="demo-clear">Tirar demonstração</button>' : '') + '</div></section>' +
        '<section class="panel"><h2>Preparar para o lançamento</h2><p>Apaga os dados de teste para começar as vendas de verdade. Você escolhe o que apagar.</p>' +
          '<button class="btn btn--danger" data-action="launch">Preparar para o lançamento</button></section>' +
      '</div>';
  }

  function opt(value, label, current) {
    return '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  // ---------- roteamento ----------
  // Cartão de notificações: mostra a situação deste aparelho e o botão para ativar.
  var PUSH_TEXT = {
    config: 'As notificações ainda não foram configuradas: falta a chave pública do Firebase (veja o README).',
    'ios-install': 'No iPhone, primeiro instale a gestão: toque em Compartilhar → Adicionar à Tela de Início, abra pelo ícone novo e volte aqui.',
    unsupported: 'Este navegador não recebe notificações. Use o Chrome no Android ou no computador.',
    denied: 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e recarregue a página.',
    off: 'Receba um aviso no celular quando chegar pedido novo ou pedido de devolução.',
    on: '✓ Ativados. Este aparelho recebe os avisos de pedido novo e de devolução.'
  };
  function bindPedidos() {
    var card = $('#push-card');
    if (!card || !window.JMPush) return;
    window.JMPush.status().then(function (st) {
      if (!$('#push-card')) return;
      card.innerHTML = '<b>Avisos de pedido neste aparelho</b><span class="muted">' + PUSH_TEXT[st] + '</span>' +
        (st === 'off' ? '<button class="btn btn--sm" type="button" id="push-on">Ativar avisos neste aparelho</button>' : '') +
        (st === 'on' ? '<button class="link" type="button" id="push-off">Desativar neste aparelho</button>' : '');
      var on = $('#push-on'), off = $('#push-off');
      if (on) on.addEventListener('click', function () {
        on.disabled = true; on.textContent = 'Ativando…';
        window.JMPush.enable(AUTH.user.uid).then(function () { toast('Avisos ativados neste aparelho.'); bindPedidos(); },
          function (e) { toast(e && e.message === 'denied' ? 'Você não permitiu as notificações.' : 'Não foi possível ativar os avisos. Tente de novo.'); bindPedidos(); });
      });
      if (off) off.addEventListener('click', function () { window.JMPush.disable().then(function () { toast('Avisos desativados neste aparelho.'); bindPedidos(); }); });
    });
  }

  var ROUTES = { '': ['painel', viewPainel, bindPainel], vendas: ['vendas', viewVendas], produtos: ['produtos', viewProdutos], categorias: ['categorias', viewCategorias], clientes: ['clientes', viewClientes], pedidos: ['pedidos', viewPedidos, bindPedidos], cupons: ['cupons', viewCupons], dados: ['dados', viewDados] };
  function route() { return location.hash.replace(/^#\/?/, ''); }
  function render() {
    if (!db) return;
    var r = ROUTES[route()] || ROUTES[''];
    app.innerHTML = (cloud ? '' : '<p class="notice">Login desligado: qualquer pessoa com o link abre esta página e os dados ficam só neste navegador. Veja no README como ativar o login.</p>') + r[1]();
    if (r[2]) r[2]();
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
      var r = onSubmit(new FormData(modalForm), e.submitter);
      if (r !== false) { modal.close(); save(); render(); if (typeof r === 'function') setTimeout(r); }
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

  // ---------- remoção de fundo (opcional, roda no navegador, sem custo) ----------
  // Biblioteca @imgly/background-removal (licença AGPL; o código do site é aberto no GitHub).
  var BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm';
  var BG_COLOR = '#F3E6E1';
  var bgLib = null;
  function loadBgLib() {
    if (window.JM_BG_REMOVE) return Promise.resolve(window.JM_BG_REMOVE); // usado nos testes
    if (!bgLib) bgLib = import(BG_LIB).then(function (m) { return m.removeBackground || m.default; }, function (e) { bgLib = null; throw e; });
    return bgLib;
  }
  function blobToImage(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), img = new Image();
      img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 0); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('imagem')); };
      img.src = url;
    });
  }
  // Recorta o produto, centraliza num quadro 4:5 com o fundo da loja e uma sombra suave.
  function cutoutToStudio(cutBlob) {
    return blobToImage(cutBlob).then(function (img) {
      var w = img.width, h = img.height, tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      var tc = tmp.getContext('2d'); tc.drawImage(img, 0, 0);
      var px = tc.getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) {
        if (px[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < 0) throw new Error('vazio');
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1, W = 900, H = 1125;
      var scale = Math.min(W * 0.72 / bw, H * 0.72 / bh), dw = bw * scale, dh = bh * scale;
      var dx = (W - dw) / 2, dy = H * 0.86 - dh;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d');
      ctx.fillStyle = BG_COLOR; ctx.fillRect(0, 0, W, H);
      var glow = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, W * 0.75);
      glow.addColorStop(0, 'rgba(255,255,255,.55)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.filter = 'blur(14px)'; ctx.fillStyle = 'rgba(59,20,36,.22)';
      ctx.beginPath(); ctx.ellipse(W / 2, dy + dh + 6, dw * 0.42, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.drawImage(tmp, x0, y0, bw, bh, dx, dy, dw, dh);
      var q = 0.85, type = c.toDataURL('image/webp').indexOf('data:image/webp') === 0 ? 'image/webp' : 'image/jpeg', data = c.toDataURL(type, q);
      while (data.length > 300000 && q > 0.4) { q -= 0.1; data = c.toDataURL(type, q); }
      return data;
    });
  }
  function removeBackgroundToStudio(file) {
    return loadBgLib().then(function (removeBackground) { return removeBackground(file, { output: { format: 'image/png' } }); }).then(cutoutToStudio);
  }

  function optionRow(o) {
    o = o || { name: '', price: '', promoPrice: '', stock: 0 };
    return '<div class="opt-row">' +
      '<input name="optName" value="' + esc(o.name) + '" placeholder="Ex.: 50 ml, Malva, Tom 03" aria-label="Nome da opção">' +
      '<input name="optPrice" ' + money + ' value="' + esc(o.price) + '" placeholder="Preço" aria-label="Preço da opção">' +
      '<input name="optPromo" ' + money + ' value="' + esc(o.promoPrice || '') + '" placeholder="Promo" aria-label="Preço promocional da opção">' +
      '<input name="optStock" type="number" step="1" value="' + esc(o.stock || 0) + '" aria-label="Estoque da opção">' +
      '<button type="button" class="link link--danger" data-remove-opt aria-label="Remover opção">✕</button></div>';
  }

  function productForm(p, preset) {
    var isNew = !p;
    var firstCat = cats()[0];
    p = p || Object.assign({ name: '', category: firstCat ? firstCat.id : '', cost: '', price: '', promoPrice: null, stock: 0, minStock: 3, short: '', description: '', featured: false, image: '', variants: null, content: null }, preset || {});
    var hasOpts = SHOP.hasOptions(p), content = p.content || {};
    openModal('<h2>' + (isNew ? 'Novo produto' : 'Editar produto') + '</h2><div class="fields">' +
      field('Nome', 'name', p.name, 'required', true) +
      '<div class="field field--full"><span>Foto</span><div class="photo">' +
        '<div class="photo__img" id="photo-prev">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '<span>Sem foto</span>') + '</div>' +
        '<div class="photo__btns"><div class="photo__row"><label class="btn btn--ghost btn--sm">Escolher foto<input type="file" accept="image/*" id="photo-file" hidden></label>' +
        '<label class="btn btn--ghost btn--sm">Tirar foto<input type="file" accept="image/*" capture="environment" id="photo-cam" hidden></label></div>' +
        '<label class="check" id="bg-wrap" hidden><input type="checkbox" id="bg-remove"> Remover fundo e usar o fundo da loja</label>' +
        '<small id="bg-status">Foto quadrada ou em pé fica melhor. Ela é reduzida automaticamente.</small>' +
        '<button type="button" class="link link--danger" id="photo-rm"' + (p.image ? '' : ' hidden') + '>Remover foto</button></div></div>' +
        '<input type="hidden" name="image" value="' + esc(p.image || '') + '"></div>' +
      '<label class="field"><span>Categoria</span><select name="category" id="cat-select">' +
        cats().map(function (c) { return opt(c.id, c.name, p.category); }).join('') + '<option value="__new">+ Nova categoria…</option></select></label>' +
      '<label class="field" id="new-cat" hidden><span>Nome da nova categoria</span><input name="newCategory" placeholder="Ex.: Cabelos"></label>' +
      '<div class="field"><span>Conteúdo da embalagem</span><div class="content-row"><input name="contentQty" ' + money + ' value="' + esc(content.qty || '') + '" placeholder="Ex.: 100" aria-label="Quantidade">' +
        '<select name="contentUnit" aria-label="Unidade">' + SHOP.UNITS.map(function (u) { return opt(u, u, content.unit || 'ml'); }).join('') + '</select></div></div>' +
      field('Custo (R$)', 'cost', p.cost, money + ' placeholder="Quanto você pagou"') +
      field('Avisar quando chegar em', 'minStock', p.minStock, 'type="number" step="1" min="0"') +
      '<label class="check field--full"><input type="checkbox" id="has-opts"' + (hasOpts ? ' checked' : '') + '> Este produto tem opções (tamanho, cor, tom…), cada uma com preço e estoque</label>' +
      '<div class="field field--full" id="opts-box"' + (hasOpts ? '' : ' hidden') + '><span>Opções <small>(nome · preço · promo · estoque)</small></span><div class="opts" id="opts">' +
        (hasOpts ? p.variants.map(optionRow).join('') : optionRow() + optionRow()) + '</div>' +
        '<button type="button" class="link" id="add-opt" style="justify-self:start">+ Adicionar opção</button></div>' +
      '<div class="fields fields--sub field--full" id="single-box"' + (hasOpts ? ' hidden' : '') + '>' +
        field('Preço de venda (R$)', 'price', hasOpts ? '' : p.price, money) +
        field('Preço promocional (R$)', 'promoPrice', hasOpts ? '' : p.promoPrice || '', money + ' placeholder="Deixe vazio se não tiver"') +
        field('Estoque atual', 'stock', hasOpts ? 0 : p.stock, 'type="number" step="1"') + '</div>' +
      field('Descrição curta', 'short', p.short || '', 'maxlength="90" placeholder="Aparece no card da vitrine"', true) +
      '<label class="field field--full"><span>Descrição completa</span><textarea name="description" placeholder="Notas, como usar…">' + esc(p.description || '') + '</textarea></label>' +
      '<label class="check field--full"><input type="checkbox" name="featured"' + (p.featured ? ' checked' : '') + '> Mostrar entre os destaques da vitrine</label>' +
      '</div>' +
      '<div class="modal__foot"><button class="btn btn--ghost" value="cancel" formnovalidate>Cancelar</button>' +
        (isNew ? '<button class="btn btn--ghost" value="again">Salvar e cadastrar outro</button>' : '') +
        '<button class="btn" value="ok">Salvar</button></div>', function (fd, submitter) {
      var name = fd.get('name').trim();
      if (!name) { toast('Digite o nome do produto.'); return false; }
      // categoria (nova, se escolhida)
      var cat = fd.get('category');
      if (cat === '__new') {
        var cname = String(fd.get('newCategory') || '').trim();
        if (!cname) { toast('Digite o nome da nova categoria.'); return false; }
        var existing = db.categories.find(function (c) { return c.name.toLowerCase() === cname.toLowerCase(); });
        cat = existing ? existing.id : addCategory(cname).id;
      }
      var opts = $('#has-opts', modalForm).checked, variants = null, price, promo, stock;
      if (opts) {
        var names = fd.getAll('optName'), prices = fd.getAll('optPrice'), promos = fd.getAll('optPromo'), stocks = fd.getAll('optStock');
        variants = names.map(function (n, i) {
          return { name: n.trim(), price: num(prices[i]), promoPrice: num(promos[i]) > 0 ? num(promos[i]) : null, stock: parseInt(stocks[i], 10) || 0 };
        }).filter(function (o) { return o.name || o.price; });
        if (!variants.length) { toast('Cadastre pelo menos uma opção.'); return false; }
        if (variants.some(function (o) { return !o.name || !(o.price > 0); })) { toast('Cada opção precisa de nome e preço.'); return false; }
        var seen = {};
        if (variants.some(function (o) { var k = o.name.toLowerCase(); if (seen[k]) return true; seen[k] = 1; })) { toast('Há duas opções com o mesmo nome.'); return false; }
        if (variants.some(function (o) { return o.promoPrice && o.promoPrice >= o.price; })) { toast('O preço promocional de cada opção precisa ser menor que o preço dela.'); return false; }
        price = Math.min.apply(null, variants.map(function (o) { return o.price; })); promo = null;
        stock = variants.reduce(function (t, o) { return t + o.stock; }, 0);
      } else {
        price = num(fd.get('price')); promo = num(fd.get('promoPrice')); stock = parseInt(fd.get('stock'), 10) || 0;
        if (!(price > 0)) { toast('Digite o preço de venda.'); return false; }
        if (promo && promo >= price) { toast('O preço promocional precisa ser menor que o preço de venda.'); return false; }
      }
      var cq = num(fd.get('contentQty'));
      var data = {
        name: name, category: cat, cost: num(fd.get('cost')), price: price, promoPrice: promo > 0 ? promo : null, stock: stock, variants: variants,
        content: cq > 0 ? { qty: cq, unit: fd.get('contentUnit') } : null,
        minStock: parseInt(fd.get('minStock'), 10) || 0,
        short: fd.get('short').trim(), description: fd.get('description').trim(), featured: fd.get('featured') === 'on', image: fd.get('image')
      };
      if (isNew) {
        var id = uid('p');
        db.products.push(enrich(Object.assign({ id: id, slug: uniqueSlug(data.name, id), createdAt: Date.now() }, data)));
      } else {
        Object.assign(p, data);
      }
      toast(isNew ? 'Produto cadastrado.' : 'Produto atualizado.');
      if (isNew && submitter && submitter.value === 'again') return function () { productForm(null, { category: cat }); };
    });

    // categoria nova
    var catSel = $('#cat-select', modalForm), newCat = $('#new-cat', modalForm);
    catSel.addEventListener('change', function () { newCat.hidden = catSel.value !== '__new'; if (!newCat.hidden) $('input', newCat).focus(); });
    // opções
    var optsBox = $('#opts', modalForm);
    $('#has-opts', modalForm).addEventListener('change', function (e) {
      $('#opts-box', modalForm).hidden = !e.target.checked;
      $('#single-box', modalForm).hidden = e.target.checked;
    });
    $('#add-opt', modalForm).addEventListener('click', function () { optsBox.insertAdjacentHTML('beforeend', optionRow()); });
    optsBox.addEventListener('click', function (e) {
      if (!e.target.hasAttribute('data-remove-opt')) return;
      if ($$('.opt-row', optsBox).length > 1) e.target.parentNode.remove(); else optsBox.innerHTML = optionRow();
    });
    // foto
    var hidden = $('[name=image]', modalForm), prev = $('#photo-prev', modalForm), rm = $('#photo-rm', modalForm);
    var bgWrap = $('#bg-wrap', modalForm), bgBox = $('#bg-remove', modalForm), bgStatus = $('#bg-status', modalForm);
    var original = null, plain = '', studio = '';
    function show(data) { hidden.value = data; prev.innerHTML = data ? '<img src="' + esc(data) + '" alt="">' : '<span>Sem foto</span>'; rm.hidden = !data; }
    function pick(e) {
      var file = e.target.files[0];
      if (!file) return;
      original = file; studio = ''; bgBox.checked = false;
      prev.innerHTML = '<span>Carregando…</span>';
      compressImage(file).then(function (data) {
        plain = data; show(data); bgWrap.hidden = false;
        bgStatus.textContent = 'Foto oficial da marca ou já recortada? Deixe "Remover fundo" desligado.';
      }, function () { show(hidden.value); toast('Não foi possível abrir essa imagem.'); });
      e.target.value = '';
    }
    $('#photo-file', modalForm).addEventListener('change', pick);
    $('#photo-cam', modalForm).addEventListener('change', pick);
    bgBox.addEventListener('change', function () {
      if (!bgBox.checked) { show(plain); bgStatus.textContent = 'Usando a foto original.'; return; }
      if (studio) { show(studio); bgStatus.textContent = 'Fundo removido. Desmarque para voltar à foto original.'; return; }
      bgBox.disabled = true; prev.classList.add('is-busy');
      bgStatus.textContent = 'Removendo o fundo… Na primeira vez pode levar até 1 minuto.';
      removeBackgroundToStudio(original).then(function (data) {
        studio = data;
        if (bgBox.checked) { show(data); bgStatus.textContent = 'Fundo removido. Compare com a original desmarcando a opção.'; }
      }, function () {
        bgBox.checked = false; show(plain);
        bgStatus.textContent = 'Não foi possível remover o fundo desta foto. Confira a internet ou use a foto original.';
      }).then(function () { bgBox.disabled = false; prev.classList.remove('is-busy'); });
    });
    rm.addEventListener('click', function () { show(''); bgWrap.hidden = true; original = null; });
  }

  function addCategory(name) {
    var base = slugify(name), id = base, n = 2;
    while (db.categories.some(function (c) { return c.id === id; })) id = base + '-' + n++;
    var c = { id: id, name: name, order: db.categories.reduce(function (m, c) { return Math.max(m, c.order || 0); }, -1) + 1, featured: false };
    db.categories.push(c);
    return c;
  }

  function categoryForm(c) {
    var isNew = !c;
    openModal('<h2>' + (isNew ? 'Nova categoria' : 'Renomear categoria') + '</h2><div class="fields">' +
      field('Nome', 'name', c ? c.name : '', 'required maxlength="30" placeholder="Ex.: Cabelos"', true) + '</div>' + foot('Salvar'), function (fd) {
      var name = fd.get('name').trim();
      if (!name) return false;
      if (db.categories.some(function (x) { return x !== c && x.name.toLowerCase() === name.toLowerCase(); })) { toast('Já existe uma categoria com esse nome.'); return false; }
      if (isNew) addCategory(name); else c.name = name;
      toast(isNew ? 'Categoria ' + name + ' criada.' : 'Categoria renomeada.');
    });
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
    var opts = SHOP.hasOptions(p);
    openModal('<h2>Entrada de estoque</h2><p>' + esc(p.name) + ' · hoje: <b>' + totalStock(p) + '</b> un.</p><div class="fields">' +
      (opts ? '<label class="field field--full"><span>Opção</span><select name="variant" required>' + p.variants.map(function (o) {
        return '<option value="' + esc(o.name) + '">' + esc(o.name) + ' (' + (o.stock || 0) + ' em estoque)</option>'; }).join('') + '</select></label>' : '') +
      field('Quantidade que chegou', 'qty', '', 'type="number" step="1" min="1" required') +
      field('Custo por unidade (R$)', 'cost', p.cost || '', money + ' placeholder="Opcional"') +
      '</div>' + foot('Adicionar'), function (fd) {
      var qty = parseInt(fd.get('qty'), 10) || 0, v = opts ? fd.get('variant') : '';
      adjustStock(p.id, v, qty);
      if (num(fd.get('cost')) > 0) p.cost = num(fd.get('cost'));
      toast('+' + qty + ' un. de ' + p.name + (v ? ' (' + v + ')' : '') + '.');
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

  function variantOptions(p, current) {
    if (!p || !SHOP.hasOptions(p)) return '<option value=""></option>';
    return p.variants.map(function (o) { return '<option value="' + esc(o.name) + '"' + (o.name === current ? ' selected' : '') + '>' + esc(o.name) + ' (' + (o.stock || 0) + ')</option>'; }).join('');
  }
  function itemRow(item) {
    item = item || { productId: '', variant: '', qty: 1, price: '' };
    var p = item.productId && product(item.productId), opts = p && SHOP.hasOptions(p);
    return '<div class="items__row">' +
      '<select name="productId" aria-label="Produto" required><option value="">Escolha o produto…</option>' +
        db.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === item.productId ? ' selected' : '') + '>' + esc(p.name) + ' (' + totalStock(p) + ' em estoque)</option>';
        }).join('') + '</select>' +
      '<select name="variant" aria-label="Opção"' + (opts ? '' : ' class="is-hidden"') + '>' + variantOptions(p, item.variant) + '</select>' +
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
      '<label class="field"><span>Pagamento</span><select name="payment">' + (PAYMENTS.indexOf(base.payment) === -1 ? [base.payment] : []).concat(PAYMENTS).map(function (p) { return opt(p, p, base.payment); }).join('') + '</select></label>' +
      '<label class="field"><span>Status</span><select name="status">' + opt('pago', 'Pago', base.status) + opt('pendente', 'A receber', base.status) + '</select></label>' +
      field('Desconto (R$)', 'discount', base.discount || '', money) +
      '</div><div class="total-box"><span>Total</span><b id="sale-total">R$ 0,00</b></div>' + foot(isNew ? 'Registrar venda' : 'Salvar'),
    function (fd) {
      var productIds = fd.getAll('productId'), variants = fd.getAll('variant'), qtys = fd.getAll('qty'), prices = fd.getAll('price');
      var newItems = productIds.map(function (id, i) {
        var p = product(id), v = p && SHOP.hasOptions(p) ? variants[i] || p.variants[0].name : '';
        return { productId: id, name: p ? p.name : '', variant: v, category: p ? p.category : '', qty: parseInt(qtys[i], 10) || 0, price: num(prices[i]), cost: p ? p.cost || 0 : 0 };
      }).filter(function (i) { return i.productId && i.qty > 0; });
      if (!newItems.length) { toast('Adicione pelo menos um item.'); return false; }

      // devolve o estoque da versão antiga antes de conferir a nova
      if (!isNew) s.items.forEach(function (i) { adjustStock(i.productId, i.variant, i.qty); });
      var need = {};
      newItems.forEach(function (i) { var k = i.productId + '|' + i.variant; need[k] = (need[k] || 0) + i.qty; });
      var short = Object.keys(need).filter(function (k) { var p = k.split('|'); return stockOf(p[0], p[1]) < need[k]; });
      if (short.length && !confirm('Estoque insuficiente para: ' + short.map(function (k) { var p = k.split('|'); return product(p[0]).name + (p[1] ? ' (' + p[1] + ')' : ''); }).join(', ') + '.\nRegistrar mesmo assim?')) {
        if (!isNew) s.items.forEach(function (i) { adjustStock(i.productId, i.variant, -i.qty); });
        return false;
      }
      newItems.forEach(function (i) { adjustStock(i.productId, i.variant, -i.qty); });

      var cid = fd.get('customerId');
      var data = { date: fd.get('date'), customerId: cid === '__new' ? '' : cid, payment: fd.get('payment'), status: fd.get('status'), discount: num(fd.get('discount')), items: newItems,
        channel: s && s.channel ? s.channel : 'balcao' };
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
        var p = product(e.target.value), row = e.target.parentNode, vs = $('[name=variant]', row);
        vs.innerHTML = variantOptions(p, '');
        vs.classList.toggle('is-hidden', !(p && SHOP.hasOptions(p)));
        if (p) $('[name=price]', row).value = sellPrice(p, vs.value);
      }
      if (e.target.name === 'variant') {
        var pv = product($('[name=productId]', e.target.parentNode).value);
        if (pv) $('[name=price]', e.target.parentNode).value = sellPrice(pv, e.target.value);
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
        items: fd.getAll('productId').map(function (id, i) { return { productId: id, variant: fd.getAll('variant')[i] || '', qty: parseInt(fd.getAll('qty')[i], 10) || 1, price: fd.getAll('price')[i] }; })
      };
    }
  }

  // ---------- demonstração ----------
  var DEMO_NAMES = ['Ana Paula Souza', 'Beatriz Lima', 'Camila Rocha', 'Daniela Martins', 'Eduarda Alves', 'Fernanda Costa',
    'Gabriela Nunes', 'Helena Ribeiro', 'Isabela Freitas', 'Juliana Mendes', 'Karina Duarte', 'Larissa Gomes'];
  function clearDemo() {
    ['customers', 'sales', 'orders', 'coupons'].forEach(function (col) { db[col] = (db[col] || []).filter(function (x) { return !x.demo; }); });
  }
  function loadDemo() {
    clearDemo();
    var prods = db.products.filter(function (p) { return totalStock(p) > 0 || SHOP.hasOptions(p); });
    if (!prods.length) prods = db.products;
    var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var pick = function (list) { return list[Math.floor(rnd() * list.length)]; };
    var customers = DEMO_NAMES.map(function (n, i) {
      return { id: 'demo-c' + i, demo: true, name: n, phone: '(42) 9' + (8800 + i * 37) + '-' + (1000 + i * 413), neighborhood: pick(['Centro', 'Vila Nova', 'Jardim América', 'Santa Rita']), notes: 'Cliente de demonstração' };
    });
    db.customers = db.customers.concat(customers);
    function line(p) {
      var v = SHOP.hasOptions(p) ? pick(p.variants).name : '', price = sellPrice(p, v);
      return { productId: p.id, name: p.name, variant: v, category: p.category, qty: rnd() < 0.85 ? 1 : 2, price: price, cost: p.cost || round(price * 0.5) };
    }
    var t = window.JMPainel.todayDate(), sales = [];
    for (var d = 150; d >= 0; d--) {
      var dt = new Date(t.getFullYear(), t.getMonth(), t.getDate() - d), w = [0.5, 0.9, 1, 1, 1.1, 1.3, 1.5][dt.getDay()];
      var n = Math.floor(rnd() * 3.2 * w + rnd());
      for (var k = 0; k < n; k++) {
        var items = [line(pick(prods))]; if (rnd() < 0.3) items.push(line(pick(prods)));
        var site = rnd() < 0.35, gross = items.reduce(function (a, i) { return a + i.qty * i.price; }, 0);
        sales.push({ id: 'demo-v' + d + '-' + k, demo: true, createdAt: dt.getTime() + k, date: window.JMPainel.iso(dt),
          customerId: rnd() < 0.65 ? pick(customers).id : '', channel: site ? 'site' : 'balcao',
          payment: pick(['PIX', 'PIX', 'PIX', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro']),
          status: d < 20 && rnd() < 0.15 ? 'pendente' : 'pago', discount: site && rnd() < 0.15 ? round(gross * 0.1) : 0, items: items });
      }
    }
    db.sales = db.sales.concat(sales);
    db.coupons = db.coupons.concat([{ id: 'DEMO10', demo: true, code: 'DEMO10', type: 'percent', value: 10, minOrder: 0, active: true }]);
    if (cloud) {
      var steps = [['novo', 0], ['novo', 0], ['confirmado', 1], ['enviado', 1], ['retirar', 2], ['entregue', 3], ['entregue', 4]];
      steps.forEach(function (st, i) {
        var c = customers[i], when = new Date(Date.now() - st[1] * 864e5 - i * 3600e3), items = [line(pick(prods))];
        var pickup = i % 2 === 0, total = items.reduce(function (a, x) { return a + x.qty * x.price; }, 0) + (pickup ? 0 : 8);
        var o = { id: 'demo-o' + i, demo: true, code: 'JM-DEMO' + (i + 1), uid: 'demo', status: st[0], createdAt: firebase.firestore.Timestamp.fromDate(when),
          customer: { name: c.name, phone: c.phone, email: '' }, items: items.map(function (x) { return { productId: x.productId, name: x.name, variant: x.variant, category: x.category, qty: x.qty, price: x.price }; }),
          subtotal: total - (pickup ? 0 : 8), coupon: null, payment: i % 3 === 0 ? 'Cartão (na entrega ou retirada)' : 'PIX', notes: i === 1 ? 'É presente, pode embrulhar?' : '', total: total, channel: 'site',
          delivery: pickup ? { type: 'pickup', fee: 0, address: 'Retirada na loja' } : { type: 'delivery', fee: 8, zone: 'Centro', neighborhood: c.neighborhood, address: 'Rua das Flores, ' + (100 + i) + ' — ' + c.neighborhood } };
        if (st[0] === 'entregue') o.finishedAt = firebase.firestore.Timestamp.fromDate(new Date(when.getTime() + 864e5));
        if (i === 6) o['return'] = { status: 'solicitada', reason: 'Produto com defeito', details: 'A tampa veio quebrada', requestedAt: firebase.firestore.Timestamp.now() };
        db.orders.push(o);
      });
    }
    if (!settings().goal) settings().goal = 15000;
    return sales.length;
  }

  function launchForm() {
    var counts = { products: db.products.length, sales: db.sales.length, orders: (db.orders || []).length, customers: db.customers.length, coupons: db.coupons.length, categories: db.categories.length };
    var box = function (k, label, on) { return '<label class="check field--full"><input type="checkbox" name="wipe" value="' + k + '"' + (on ? ' checked' : '') + '> ' + label + ' <span class="muted">(' + counts[k] + ')</span></label>'; };
    openModal('<h2>Preparar para o lançamento</h2><p>Escolha o que apagar. Isso não pode ser desfeito, então baixe um backup antes se quiser guardar alguma coisa.</p><div class="fields">' +
      box('products', 'Produtos (inclusive os de exemplo)', true) + box('sales', 'Vendas', true) + box('orders', 'Pedidos do site', true) + box('customers', 'Clientes', true) +
      box('coupons', 'Cupons', false) + box('categories', 'Categorias', false) +
      field('Para confirmar, digite LANÇAR', 'confirm', '', 'autocomplete="off" required', true) + '</div>' +
      '<div class="modal__foot"><button class="btn btn--ghost" value="cancel" formnovalidate>Cancelar</button><button class="btn btn--danger" value="ok">Apagar e preparar</button></div>', function (fd) {
      if (String(fd.get('confirm')).trim().toUpperCase() !== 'LANÇAR' && String(fd.get('confirm')).trim().toUpperCase() !== 'LANCAR') { toast('Digite LANÇAR para confirmar.'); return false; }
      var wipe = fd.getAll('wipe');
      wipe.forEach(function (k) { db[k] = []; });
      settings().launched = Date.now();
      toast('Pronto! A loja está limpa para começar as vendas.');
    });
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
      s.items.forEach(function (i) { adjustStock(i.productId, i.variant, i.qty); });
      db.sales = db.sales.filter(function (x) { return x !== s; });
      var o = orderOfSale(id);
      if (o) { delete o.saleId; o.reserved = false; }
      save(); render(); toast('Venda excluída.');
    },
    'new-product': function () { productForm(null); },
    'duplicate-product': function (id) {
      var src = product(id), copy = JSON.parse(JSON.stringify(src));
      copy.id = uid('p'); copy.name = src.name + ' (cópia)'; copy.slug = uniqueSlug(copy.name, copy.id); copy.createdAt = Date.now(); copy.featured = false; copy.stock = 0;
      if (SHOP.hasOptions(copy)) copy.variants.forEach(function (o) { o.stock = 0; });
      db.products.push(copy); save(); render();
      productForm(copy);
      toast('Cópia criada. Ajuste o nome, as opções e o estoque.');
    },
    'new-category': function () { categoryForm(null); },
    'rename-category': function (id) { categoryForm(db.categories.find(function (c) { return c.id === id; })); },
    'delete-category': function (id) {
      var c = db.categories.find(function (c) { return c.id === id; }), n = db.products.filter(function (p) { return p.category === id; }).length;
      if (n) { toast('Mova os ' + n + ' produto(s) de "' + c.name + '" para outra categoria antes de excluir.'); return; }
      if (!confirm('Excluir a categoria ' + c.name + '?')) return;
      db.categories = db.categories.filter(function (x) { return x !== c; });
      save(); render(); toast('Categoria excluída.');
    },
    'cat-up': function (id) { moveCategory(id, -1); },
    'cat-down': function (id) { moveCategory(id, 1); },
    'demo-load': function () {
      if (!db.products.length) { toast('Cadastre pelo menos um produto antes de carregar a demonstração.'); return; }
      if (!confirm('Carregar dados de demonstração? Eles ficam marcados e podem ser tirados depois. O estoque não muda.')) return;
      var n = loadDemo(); save(); render(); toast('Demonstração carregada: ' + n + ' vendas fictícias.');
    },
    'demo-clear': function () {
      if (!confirm('Tirar todos os dados de demonstração?')) return;
      clearDemo(); save(); render(); toast('Dados de demonstração removidos.');
    },
    launch: function () { launchForm(); },
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
      var data = { products: db.products, customers: db.customers, sales: db.sales, coupons: db.coupons, categories: db.categories, settings: db.settings };
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

  function moveCategory(id, dir) {
    var list = cats();
    list.forEach(function (c, i) { c.order = i; });
    var i = list.findIndex(function (c) { return c.id === id; }), j = i + dir;
    if (j < 0 || j >= list.length) return;
    var a = list[i].order; list[i].order = list[j].order; list[j].order = a;
    save(); render();
  }

  app.addEventListener('click', function (e) {
    if (e.target.closest('[data-only-stale]')) { filters.produtos.sit = 'parados'; }
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
    var ak = e.target.dataset.auto;
    if (ak) {
      var st = settings(), label = '';
      if (ak === 'cancelOn') { st.autoCancelDays = e.target.checked ? Math.max(1, parseInt($('[data-auto=autoCancelDays]').value, 10) || 3) : 0; label = e.target.checked ? 'Cancelamento automático ligado.' : 'Cancelamento automático desligado.'; }
      else if (ak === 'autoCancelDays') {
        var dd = Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 3));
        var atual = st.autoCancelDays === undefined ? AUTO_DEFAULTS.autoCancelDays : st.autoCancelDays;
        if (atual > 0) st.autoCancelDays = dd;
        label = 'Cancelar PIX não pago depois de ' + dd + ' dia(s).';
      }
      else { st[ak] = e.target.checked; label = e.target.checked ? 'Automação ligada.' : 'Automação desligada.'; }
      filters.pedidos.autoOpen = true;
      save(); render(); toast(label);
      return;
    }
    var cf = e.target.dataset.catFeatured;
    if (cf) {
      var cat = db.categories.find(function (c) { return c.id === cf; });
      if (e.target.checked && db.categories.filter(function (c) { return c.featured; }).length >= 3) { e.target.checked = false; toast('A vitrine mostra no máximo 3 categorias.'); return; }
      cat.featured = e.target.checked; save(); render();
      toast(cat.featured ? cat.name + ' aparece na vitrine.' : cat.name + ' saiu da vitrine.');
      return;
    }
    var oid = e.target.dataset.orderStatus;
    if (oid) {
      var o = db.orders.find(function (o) { return o.id === oid; });
      var v = e.target.value;
      if (v === 'entregue') {
        if (!o.saleId && !o.reserved && !confirm('Finalizar o pedido #' + o.code + '? A venda será lançada como paga e o estoque vai baixar.')) { render(); return; }
        finishOrder(o);
      } else if (v === 'cancelado' || v === 'novo') {
        releaseOrder(o); o.status = v;
      } else {
        if (!reserveOrder(o)) { render(); return; }
        o.status = v;
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
        db = keepCloud(data); ensureBasics(); save(); render(); toast('Backup importado.');
      } catch (err) { toast('Arquivo de backup inválido.'); }
    };
    reader.readAsText(e.target.files[0]);
  });

  window.addEventListener('hashchange', function () { render(); app.focus(); });
  if (!cloud) {
    db = loadLocal() || seed();
    db.orders = []; db.catalog = [];
    ensureBasics();
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
