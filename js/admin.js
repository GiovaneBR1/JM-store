// Gestão da JM Store: produtos/estoque, vendas e clientes.
// Com o Firebase configurado, só contas admin entram e os dados ficam no Firestore
// (sincronizados entre aparelhos). Sem ele, os dados ficam só no navegador (localStorage).
(function () {
  'use strict';

  var KEY = 'jm-admin-v1';
  var AUTH = window.JMAuth;
  var cloud = !!(AUTH && AUTH.enabled);
  var COLS = ['products', 'customers', 'sales'];
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
  function seed() {
    return {
      products: (window.JM_PRODUCTS || []).map(function (p) {
        var price = p.promoPrice != null ? p.promoPrice : p.price;
        return { id: p.id, name: p.name, category: p.category, cost: 0, price: price, stock: p.stock, minStock: 3 };
      }),
      customers: [],
      sales: []
    };
  }

  var db = null;
  function loadLocal() {
    var data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    return data && Array.isArray(data.products) ? data : null;
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
  function fields(item) { var o = Object.assign({}, item); delete o.id; return o; }

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
    var fs = AUTH.firestore(), loaded = {}, fresh = { products: [], customers: [], sales: [] };
    COLS.forEach(function (col) {
      unsubs.push(fs.collection(col).onSnapshot(function (snap) {
        if (!loaded[col]) {
          loaded[col] = true;
          if (!db) db = fresh;
          applySnap(col, snap);
          if (COLS.every(function (c) { return loaded[c]; })) firstLoad();
          return;
        }
        if (modal.open) { deferred[col] = snap; return; }
        applySnap(col, snap);
        render();
      }, function (e) {
        stopCloud();
        gate('<h1>Não foi possível abrir</h1><p>' + (e && e.code === 'permission-denied'
          ? 'O Firestore recusou o acesso. Confira se as regras de firestore.rules foram publicadas.'
          : 'Confira sua conexão com a internet e recarregue a página.') + '</p>');
      }));
    });
  }

  function firstLoad() {
    var empty = COLS.every(function (c) { return !db[c].length; });
    if (empty) {
      var local = loadLocal();
      if (local && confirm('Encontramos dados da gestão salvos neste navegador (' + local.sales.length + ' venda(s), ' +
          local.customers.length + ' cliente(s)). Enviar para a nuvem?')) {
        db = { products: local.products, customers: local.customers, sales: local.sales };
      } else {
        db = seed();
      }
      save();
    }
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
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Custo</th><th class="num">Preço</th>' +
        '<th class="num">Margem</th><th class="num">Estoque</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          var margin = p.cost > 0 && p.price > 0 ? Math.round((p.price - p.cost) / p.price * 100) + '%' : '<span class="muted">—</span>';
          return '<tr><td>' + esc(p.name) + '<span class="sub">' + esc(catName(p.category)) + '</span></td>' +
            '<td class="num">' + (p.cost ? brl(p.cost) : '<span class="muted">—</span>') + '</td>' +
            '<td class="num">' + brl(p.price) + '</td><td class="num">' + margin + '</td>' +
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
  var ROUTES = { '': ['painel', viewPainel], vendas: ['vendas', viewVendas], produtos: ['produtos', viewProdutos], clientes: ['clientes', viewClientes], dados: ['dados', viewDados] };
  function route() { return location.hash.replace(/^#\/?/, ''); }
  function render() {
    if (!db) return;
    var r = ROUTES[route()] || ROUTES[''];
    app.innerHTML = (cloud ? '' : '<p class="notice">Login desligado: qualquer pessoa com o link abre esta página e os dados ficam só neste navegador. Veja no README como ativar o login.</p>') + r[1]();
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

  function productForm(p) {
    var isNew = !p;
    p = p || { name: '', category: CATS[0] ? CATS[0].slug : '', cost: '', price: '', stock: 0, minStock: 3 };
    openModal('<h2>' + (isNew ? 'Novo produto' : 'Editar produto') + '</h2><div class="fields">' +
      field('Nome', 'name', p.name, 'required', true) +
      '<label class="field"><span>Categoria</span><select name="category">' +
        CATS.map(function (c) { return opt(c.slug, c.name, p.category); }).join('') + '</select></label>' +
      field('Estoque atual', 'stock', p.stock, 'type="number" step="1" required') +
      field('Custo (R$)', 'cost', p.cost, money + ' placeholder="Quanto você pagou"') +
      field('Preço de venda (R$)', 'price', p.price, money + ' required') +
      field('Avisar quando chegar em', 'minStock', p.minStock, 'type="number" step="1" min="0"') +
      '</div>' + foot('Salvar'), function (fd) {
      var data = {
        name: fd.get('name').trim(), category: fd.get('category'), cost: num(fd.get('cost')),
        price: num(fd.get('price')), stock: parseInt(fd.get('stock'), 10) || 0, minStock: parseInt(fd.get('minStock'), 10) || 0
      };
      if (isNew) db.products.push(Object.assign({ id: uid('p') }, data)); else Object.assign(p, data);
      toast(isNew ? 'Produto cadastrado.' : 'Produto atualizado.');
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
        if (p) $('[name=price]', e.target.parentNode).value = p.price;
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
      save(); render(); toast('Venda marcada como paga.');
    },
    'delete-sale': function (id) {
      var s = db.sales.find(function (s) { return s.id === id; });
      if (!confirm('Excluir esta venda de ' + brl(saleTotal(s)) + '? Os produtos voltam para o estoque.')) return;
      s.items.forEach(function (i) { var p = product(i.productId); if (p) p.stock += i.qty; });
      db.sales = db.sales.filter(function (x) { return x !== s; });
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
    'edit-customer': function (id) { customerForm(customer(id)); },
    'delete-customer': function (id) {
      var c = customer(id);
      if (!confirm('Excluir o cliente ' + c.name + '? As vendas dele ficam como "Balcão".')) return;
      db.customers = db.customers.filter(function (x) { return x !== c; });
      db.sales.forEach(function (s) { if (s.customerId === id) s.customerId = ''; });
      save(); render(); toast('Cliente excluído.');
    },
    export: function () {
      var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'jm-store-backup-' + today() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    },
    reset: function () {
      if (!confirm('Apagar todas as vendas, clientes e alterações de produtos?')) return;
      db = seed(); save(); render(); toast('Dados reiniciados.');
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
    if (e.target.dataset.action !== 'import' || !e.target.files[0]) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data.products) || !Array.isArray(data.sales) || !Array.isArray(data.customers)) throw new Error();
        if (!confirm('Substituir os dados atuais por este backup?')) return;
        db = data; save(); render(); toast('Backup importado.');
      } catch (err) { toast('Arquivo de backup inválido.'); }
    };
    reader.readAsText(e.target.files[0]);
  });

  window.addEventListener('hashchange', function () { render(); app.focus(); });
  if (!cloud) {
    db = loadLocal() || seed();
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
