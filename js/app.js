(function () {
  'use strict';

  var C = window.JM_CONFIG;
  var P = window.JM_PRODUCTS;
  var CATS = window.JM_CATEGORIES;
  var app = document.getElementById('app');
  var DARK = '#6E412A';
  var AUTH = window.JMAuth;
  var LOGIN_MSG = 'Entre na sua conta para colocar produtos na sacola e finalizar o pedido.';

  // ---------- helpers ----------
  function $(sel, el) { return (el || document).querySelector(sel); }
  function brl(n) { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function byId(id) { return P.find(function (p) { return p.id === id; }); }
  function bySlug(s) { return P.find(function (p) { return p.slug === s; }); }
  function catName(slug) { var c = CATS.find(function (c) { return c.slug === slug; }); return c ? c.name : ''; }
  function variantExtra(p, v) {
    var found = (p.variants || []).find(function (x) { return x.name === v; });
    return found ? found.extra : 0;
  }
  function unitPrice(p, v) { return round((p.promoPrice != null ? p.promoPrice : p.price) + variantExtra(p, v)); }
  function listPrice(p, v) { return round(p.price + variantExtra(p, v)); }
  function round(n) { return Math.round(n * 100) / 100; }
  function waLink(text) { return 'https://wa.me/' + C.whatsapp + (text ? '?text=' + encodeURIComponent(text) : ''); }

  function priceHtml(p, v) {
    if (p.promoPrice != null) {
      return '<s><span class="sr">de </span>' + brl(listPrice(p, v)) + '</s><span class="sr">por </span>' + brl(unitPrice(p, v));
    }
    return brl(unitPrice(p, v));
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- product art (desenho provisório até ter foto) ----------
  var SHAPES = {
    perfume: function (t) {
      return '<rect x="84" y="52" width="32" height="30" rx="5" fill="' + DARK + '"/>' +
        '<rect x="92" y="80" width="16" height="12" fill="' + DARK + '" opacity=".8"/>' +
        '<rect x="52" y="90" width="96" height="122" rx="20" fill="' + t + '"/>' +
        '<rect x="66" y="104" width="9" height="90" rx="4.5" fill="#fff" opacity=".45"/>' +
        '<rect x="82" y="140" width="50" height="30" rx="3" fill="#FFF9F9" opacity=".92"/>' +
        '<text x="107" y="160" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="15" font-weight="700" fill="' + DARK + '">JM</text>';
    },
    batom: function (t) {
      return '<rect x="76" y="132" width="48" height="80" rx="6" fill="' + DARK + '"/>' +
        '<rect x="81" y="100" width="38" height="34" rx="2" fill="#D9B98F"/>' +
        '<path d="M85 100 V62 Q85 50 97 44 L115 36 V100 Z" fill="' + t + '"/>' +
        '<rect x="89" y="58" width="5" height="38" rx="2.5" fill="#fff" opacity=".35"/>' +
        '<rect x="84" y="140" width="5" height="64" rx="2.5" fill="#fff" opacity=".15"/>';
    },
    'conta-gotas': function (t) {
      return '<rect x="88" y="34" width="24" height="44" rx="12" fill="' + DARK + '"/>' +
        '<rect x="84" y="76" width="32" height="20" rx="3" fill="#D9B98F"/>' +
        '<rect x="62" y="94" width="76" height="118" rx="14" fill="' + t + '"/>' +
        '<rect x="72" y="106" width="8" height="92" rx="4" fill="#fff" opacity=".4"/>' +
        '<rect x="86" y="140" width="42" height="40" rx="3" fill="#FFF9F9" opacity=".92"/>';
    },
    pote: function (t) {
      return '<rect x="44" y="116" width="112" height="24" rx="6" fill="' + DARK + '"/>' +
        '<rect x="50" y="138" width="100" height="74" rx="14" fill="' + t + '"/>' +
        '<rect x="60" y="148" width="8" height="52" rx="4" fill="#fff" opacity=".4"/>' +
        '<rect x="78" y="160" width="56" height="30" rx="3" fill="#FFF9F9" opacity=".92"/>';
    },
    tubo: function (t) {
      return '<path d="M64 42 H136 L126 178 H74 Z" fill="' + t + '"/>' +
        '<rect x="60" y="34" width="80" height="12" rx="2" fill="' + t + '"/>' +
        '<rect x="60" y="34" width="80" height="12" rx="2" fill="' + DARK + '" opacity=".12"/>' +
        '<rect x="74" y="176" width="52" height="36" rx="6" fill="' + DARK + '"/>' +
        '<rect x="76" y="56" width="8" height="100" rx="4" fill="#fff" opacity=".45"/>' +
        '<rect x="88" y="90" width="34" height="50" rx="3" fill="#FFF9F9" opacity=".88"/>';
    },
    compacto: function (t) {
      return '<circle cx="100" cy="150" r="60" fill="' + DARK + '"/>' +
        '<circle cx="100" cy="150" r="47" fill="' + t + '"/>' +
        '<path d="M70 132 Q100 108 130 132" stroke="#fff" stroke-width="5" fill="none" opacity=".45" stroke-linecap="round"/>';
    },
    mascara: function (t) {
      return '<rect x="88" y="30" width="24" height="80" rx="4" fill="' + DARK + '"/>' +
        '<rect x="86" y="106" width="28" height="8" fill="#D9B98F"/>' +
        '<rect x="84" y="112" width="32" height="100" rx="6" fill="' + t + '"/>' +
        '<rect x="90" y="120" width="5" height="84" rx="2.5" fill="#fff" opacity=".35"/>';
    }
  };

  function shape(kind, tone) { return (SHAPES[kind] || SHAPES.perfume)(tone); }

  function art(p) {
    if (p.image) return '<img src="' + esc(p.image) + '" alt="" loading="lazy">';
    return '<svg viewBox="0 0 200 250" aria-hidden="true" focusable="false">' +
      '<rect width="200" height="250" fill="#F9E8EF"/>' +
      '<circle cx="100" cy="132" r="80" fill="' + p.tone + '" opacity=".16"/>' +
      '<ellipse cx="100" cy="214" rx="58" ry="6" fill="' + DARK + '" opacity=".12"/>' +
      '<g class="lift">' + shape(p.art, p.tone) + '</g></svg>';
  }

  function shelf() {
    // Vitrine em arco com os produtos apoiados na prateleira.
    var items = [
      ['perfume', '#BB6499', 1.3, -12],
      ['batom', '#A55385', 1.05, 140],
      ['conta-gotas', '#D4A843', 1.15, 212],
      ['pote', '#D5A4C2', 1, 334],
      ['perfume', '#8B5A3D', 0.85, 432]
    ];
    var g = items.map(function (it) {
      var s = it[2], y = 318 - 212 * s;
      return '<g transform="translate(' + it[3] + ' ' + y.toFixed(1) + ') scale(' + s + ')">' + shape(it[0], it[1]) + '</g>';
    }).join('');
    return '<svg viewBox="0 0 560 360" role="img" aria-label="Perfume, batom, sérum e creme na vitrine da JM Store">' +
      '<path d="M70 318 V170 A210 210 0 0 1 490 170 V318 Z" fill="#F2DDE6"/>' +
      '<path d="M110 318 V182 A170 170 0 0 1 450 182 V318" fill="none" stroke="#D5A4C2" stroke-width="1.5"/>' +
      g +
      '<rect x="20" y="316" width="520" height="14" rx="3" fill="' + DARK + '"/>' +
      '<rect x="40" y="330" width="480" height="10" fill="' + DARK + '" opacity=".14"/>' +
      '</svg>';
  }

  // ---------- cart ----------
  var cart = load();
  function load() {
    try { var raw = localStorage.getItem('jm-cart'); var c = raw ? JSON.parse(raw) : []; return Array.isArray(c) ? c.filter(function (l) { return byId(l.id); }) : []; }
    catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem('jm-cart', JSON.stringify(cart)); } catch (e) { /* navegação privada: a sacola vale só nesta aba */ }
    $('#bag-count').textContent = cart.reduce(function (n, l) { return n + l.q; }, 0);
  }
  function inCart(id) { return cart.filter(function (l) { return l.id === id; }).reduce(function (n, l) { return n + l.q; }, 0); }
  function add(id, v, q) {
    var p = byId(id);
    var room = p.stock - inCart(id);
    if (room <= 0) { toast('Você já tem todo o estoque de ' + p.name + ' na sacola.'); return false; }
    q = Math.min(q, room);
    var line = cart.find(function (l) { return l.id === id && l.v === v; });
    if (line) line.q += q; else cart.push({ id: id, v: v || '', q: q });
    save();
    return true;
  }
  function setQty(i, q) {
    var l = cart[i]; if (!l) return;
    var p = byId(l.id);
    var max = p.stock - (inCart(l.id) - l.q);
    if (q <= 0) cart.splice(i, 1); else l.q = Math.min(q, max);
    save();
  }
  function subtotal() { return round(cart.reduce(function (s, l) { return s + unitPrice(byId(l.id), l.v) * l.q; }, 0)); }

  function lineHtml(l, i, editable) {
    var p = byId(l.id);
    var side = editable
      ? '<div class="qty" role="group" aria-label="Quantidade de ' + esc(p.name) + '">' +
          '<button type="button" data-dec="' + i + '" aria-label="Diminuir">−</button><output>' + l.q + '</output>' +
          '<button type="button" data-inc="' + i + '" aria-label="Aumentar">+</button></div>' +
        '<button type="button" class="link-btn" data-rm="' + i + '">Remover</button>'
      : '<small>' + l.q + ' un.</small>';
    return '<div class="line"><a class="line__art" href="#/produto/' + p.slug + '" tabindex="-1" aria-hidden="true">' + art(p) + '</a>' +
      '<div><h3>' + esc(p.name) + '</h3>' + (l.v ? '<small>' + esc(l.v) + '</small>' : '') +
      '<small>' + brl(unitPrice(p, l.v) * l.q) + '</small></div>' +
      '<div class="line__side">' + side + '</div></div>';
  }

  // ---------- drawer ----------
  var drawer = $('#drawer');
  var lastFocus = null;
  function renderDrawer() {
    var body = $('#drawer-body');
    if (!cart.length) {
      body.innerHTML = '<div class="empty"><h3>Sua sacola está vazia</h3><p>Escolha um perfume, um batom ou um cuidado para a pele.</p>' +
        '<button type="button" class="btn btn--main" data-close data-goto-catalog>Ver produtos</button></div>';
      return;
    }
    body.innerHTML = cart.map(function (l, i) { return lineHtml(l, i, true); }).join('') +
      '<div class="totals"><div><span>Subtotal</span><span>' + brl(subtotal()) + '</span></div>' +
      '<small>O frete é calculado pelo seu bairro no próximo passo. Retirada é grátis.</small>' +
      '<a class="btn btn--main btn--block" href="#/checkout">Finalizar pedido</a>' +
      '<button type="button" class="btn btn--ghost btn--block" data-close>Continuar comprando</button></div>';
  }
  function openDrawer() {
    lastFocus = document.activeElement;
    renderDrawer();
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.drawer__head .icon-btn').focus();
  }
  function closeDrawer(restore) {
    if (drawer.hidden) return;
    drawer.hidden = true;
    document.body.style.overflow = '';
    if (restore !== false && lastFocus) lastFocus.focus();
  }
  drawer.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key !== 'Tab') return;
    var f = drawer.querySelectorAll('a[href], button:not([disabled])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- catalog ----------
  var state = { cat: null, q: '', sort: 'featured', inStock: false };

  function itemHtml(p) {
    var out = p.stock <= 0;
    var tag = out ? '<span class="item__tag item__tag--out">Esgotado</span>'
      : p.promoPrice != null ? '<span class="item__tag item__tag--promo">Promoção</span>'
      : p.stock <= 3 ? '<span class="item__tag item__tag--low">Últimas unidades</span>' : '';
    var action = out
      ? '<button class="add" type="button" disabled>Esgotado</button>'
      : p.variants ? '<a class="add" href="#/produto/' + p.slug + '">Escolher opção</a>'
      : '<button class="add" type="button" data-add="' + p.id + '">Adicionar</button>';
    return '<article class="item">' +
      '<a class="item__art" href="#/produto/' + p.slug + '" tabindex="-1" aria-hidden="true">' + art(p) + '</a>' + tag +
      '<h3><a href="#/produto/' + p.slug + '">' + esc(p.name) + '</a></h3>' +
      '<p class="item__short">' + esc(p.short) + '</p>' +
      '<div class="item__foot"><span class="price">' + priceHtml(p) + '</span>' + action + '</div></article>';
  }

  function filtered() {
    var q = state.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var list = P.filter(function (p) {
      if (state.cat && p.category !== state.cat) return false;
      if (state.inStock && p.stock <= 0) return false;
      if (!q) return true;
      var hay = (p.name + ' ' + p.short + ' ' + catName(p.category)).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      return hay.indexOf(q) !== -1;
    });
    var price = function (p) { return unitPrice(p); };
    if (state.sort === 'asc') list.sort(function (a, b) { return price(a) - price(b); });
    else if (state.sort === 'desc') list.sort(function (a, b) { return price(b) - price(a); });
    else if (state.sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
    else list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (a.stock <= 0) - (b.stock <= 0); });
    return list;
  }

  function fillGrid() {
    var grid = $('#grid'); if (!grid) return;
    var list = filtered();
    $('#count').textContent = list.length === 1 ? '1 produto' : list.length + ' produtos';
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nenhum produto encontrado</h3>' +
        '<p>' + (state.q ? 'Nada com “' + esc(state.q) + '”. Tente outra palavra ou ' : 'Tente ') + 'ver todas as categorias.</p>' +
        '<button type="button" class="btn btn--main" data-reset>Ver todos os produtos</button></div>';
      return;
    }
    grid.innerHTML = list.map(itemHtml).join('');
  }

  function catalogHtml(title, sub) {
    var tabs = '<a class="tab" href="#/"' + (!state.cat ? ' aria-current="page"' : '') + '>Todos</a>' +
      CATS.map(function (c) {
        return '<a class="tab" href="#/categoria/' + c.slug + '"' + (state.cat === c.slug ? ' aria-current="page"' : '') + '>' + c.name + '</a>';
      }).join('');
    return '<section class="catalog" id="catalogo" aria-labelledby="cat-title"><div class="wrap">' +
      '<div class="catalog__head"><div><h2 id="cat-title">' + title + '</h2><p>' + sub + '</p></div>' +
      '<nav class="tabs" aria-label="Categorias">' + tabs + '</nav></div>' +
      '<div class="tools"><label>Ordenar <select id="sort">' +
        '<option value="featured">Destaques</option><option value="asc">Menor preço</option>' +
        '<option value="desc">Maior preço</option><option value="name">Nome</option></select></label>' +
      '<label><input type="checkbox" id="instock"' + (state.inStock ? ' checked' : '') + '> Só com estoque</label>' +
      '<span class="count" id="count" aria-live="polite"></span></div>' +
      '<div class="grid" id="grid"></div></div></section>';
  }

  function bindCatalog() {
    var sort = $('#sort'); sort.value = state.sort;
    sort.addEventListener('change', function () { state.sort = sort.value; fillGrid(); });
    $('#instock').addEventListener('change', function (e) { state.inStock = e.target.checked; fillGrid(); });
    fillGrid();
  }

  // ---------- views ----------
  function viewHome() {
    state.cat = null;
    document.title = 'JM Store — Cosméticos importados';
    app.innerHTML =
      '<section class="hero"><div class="wrap hero__in">' +
        '<div class="hero__text"><h1>Perfumes e maquiagem importados, entregues na sua porta.</h1>' +
        '<p class="hero__lead">A gente traz do Paraguai, confere cada produto e entrega no seu bairro. Você escolhe aqui, confirma pelo WhatsApp e paga no PIX.</p>' +
        '<div class="hero__cta"><button type="button" class="btn btn--main" data-goto-catalog>Ver produtos</button>' +
        '<a class="btn btn--ghost" href="' + waLink('Olá! Vim pelo site da JM Store.') + '" target="_blank" rel="noopener">Falar no WhatsApp</a></div></div>' +
        '<div class="shelf">' + shelf() + '</div>' +
      '</div></section>' +
      '<section class="promise" aria-label="Como a JM Store funciona"><ul>' +
        '<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>Entrega própria no seu bairro</li>' +
        '<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 12 4l8 6v10H4z"/><path d="M10 20v-6h4v6"/></svg>Retirada grátis</li>' +
        '<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12z"/><path d="M8.5 12h7"/></svg>Pagamento no PIX</li>' +
        '<li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.8z"/></svg>Produtos originais importados</li>' +
      '</ul></section>' +
      catalogHtml('Nossos produtos', 'Perfumes, maquiagem e skincare com estoque na loja.') +
      '<section class="how" aria-labelledby="how-title"><div class="wrap"><h2 id="how-title">Como comprar</h2><ol>' +
        '<li><h3>Escolha</h3><p>Coloque os produtos na sacola e escolha cor ou tamanho quando tiver opção.</p></li>' +
        '<li><h3>Informe a entrega</h3><p>Diga o seu bairro para calcular o frete, ou escolha retirar na loja sem custo.</p></li>' +
        '<li><h3>Confirme no WhatsApp</h3><p>O pedido chega pronto na nossa conversa. A gente confirma o estoque e o horário.</p></li>' +
        '<li><h3>Pague e receba</h3><p>Pague no PIX e receba em casa em até 3 dias úteis.</p></li>' +
      '</ol></div></section>';
    bindCatalog();
  }

  function viewCategory(slug) {
    if (!catName(slug)) { location.hash = '#/'; return; }
    state.cat = slug;
    document.title = catName(slug) + ' — JM Store';
    app.innerHTML = '<div class="wrap"><nav class="crumbs" aria-label="Você está em"><a href="#/">Início</a> / ' + catName(slug) + '</nav></div>' +
      catalogHtml(catName(slug), {
        perfumes: 'Eau de parfum, eau de toilette e body splash.',
        maquiagem: 'Batons, bases, sombras e tudo para o make.',
        skincare: 'Séruns, hidratantes e proteção solar.'
      }[slug] || '');
    $('.catalog').style.paddingTop = '1.5rem';
    bindCatalog();
  }

  function viewProduct(slug) {
    var p = bySlug(slug);
    if (!p) {
      app.innerHTML = '<div class="wrap done"><h1>Produto não encontrado</h1><p>Ele pode ter saído do catálogo.</p>' +
        '<div class="btns" style="margin-top:1.5rem"><a class="btn btn--main" href="#/">Ver todos os produtos</a></div></div>';
      return;
    }
    document.title = p.name + ' — JM Store';
    var out = p.stock <= 0;
    var v = p.variants ? p.variants[0].name : '';
    var stock = out ? '<p class="stock stock--out">Esgotado no momento</p>'
      : p.stock <= 3 ? '<p class="stock stock--low">Últimas ' + p.stock + ' unidades</p>'
      : '<p class="stock stock--ok">Em estoque, pronto para entrega</p>';
    var variants = p.variants
      ? '<fieldset class="field" style="border:0;padding:0;margin:0"><legend>Opção</legend><div class="chips">' +
        p.variants.map(function (x, i) {
          return '<label class="chip"><input type="radio" name="variant" value="' + esc(x.name) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(x.name) + '</span></label>';
        }).join('') + '</div></fieldset>' : '';
    var buy = out
      ? '<div class="buy__row"><a class="btn btn--wa" href="' + waLink('Olá! Quero ser avisada quando chegar: ' + p.name) + '" target="_blank" rel="noopener">Avisar quando chegar</a></div>'
      : variants +
        '<div class="field"><span id="qty-l">Quantidade</span><div class="qty" role="group" aria-labelledby="qty-l">' +
          '<button type="button" id="q-dec" aria-label="Diminuir">−</button><output id="q-val">1</output>' +
          '<button type="button" id="q-inc" aria-label="Aumentar">+</button></div></div>' +
        '<div class="buy__row"><button class="btn btn--main" type="submit">Adicionar à sacola</button>' +
        '<a class="btn btn--ghost" href="' + waLink('Olá! Tenho uma dúvida sobre: ' + p.name) + '" target="_blank" rel="noopener">Tirar dúvida</a></div>';
    var specs = Object.keys(p.specs || {}).map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(p.specs[k]) + '</dd>'; }).join('');
    var related = P.filter(function (x) { return x.category === p.category && x.id !== p.id; }).slice(0, 4);

    app.innerHTML = '<div class="wrap">' +
      '<nav class="crumbs" aria-label="Você está em"><a href="#/">Início</a> / <a href="#/categoria/' + p.category + '">' + catName(p.category) + '</a> / ' + esc(p.name) + '</nav>' +
      '<div class="pdp"><div class="pdp__art">' + art(p) + '</div><div>' +
        '<h1>' + esc(p.name) + '</h1><p class="pdp__short">' + esc(p.short) + '</p>' +
        '<span class="price" id="pdp-price">' + priceHtml(p, v) + '</span>' + stock +
        '<form class="buy" id="buy">' + buy + '</form>' +
        '<div class="pdp__desc"><h2>Sobre o produto</h2><p>' + esc(p.description) + '</p>' +
        (specs ? '<dl class="specs">' + specs + '</dl>' : '') + '</div>' +
      '</div></div></div>' +
      (related.length ? '<section class="catalog" style="padding-top:0" aria-labelledby="rel-title"><div class="wrap">' +
        '<div class="catalog__head"><h2 id="rel-title">Mais em ' + catName(p.category) + '</h2></div>' +
        '<div class="grid">' + related.map(itemHtml).join('') + '</div></div></section>' : '');

    if (out) return;
    var qty = 1;
    var setQ = function (n) { qty = Math.max(1, Math.min(n, p.stock)); $('#q-val').textContent = qty; };
    $('#q-dec').addEventListener('click', function () { setQ(qty - 1); });
    $('#q-inc').addEventListener('click', function () { setQ(qty + 1); });
    $('#buy').addEventListener('change', function (e) {
      if (e.target.name === 'variant') { v = e.target.value; $('#pdp-price').innerHTML = priceHtml(p, v); }
    });
    $('#buy').addEventListener('submit', function (e) {
      e.preventDefault();
      AUTH.require(LOGIN_MSG, function () { if (add(p.id, v, qty)) openDrawer(); });
    });
  }

  // ---------- checkout ----------
  function field(id, label, input, hint) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' + input +
      (hint ? '<small class="note">' + hint + '</small>' : '') + '<span class="err" id="' + id + '-err"></span></div>';
  }

  function viewCheckout() {
    document.title = 'Finalizar pedido — JM Store';
    if (!cart.length) {
      app.innerHTML = '<div class="wrap done"><h1>Sua sacola está vazia</h1><p>Adicione produtos para finalizar um pedido.</p>' +
        '<div class="btns" style="margin-top:1.5rem"><a class="btn btn--main" href="#/">Ver produtos</a></div></div>';
      return;
    }
    if (AUTH.enabled && !AUTH.user) {
      app.innerHTML = '<div class="wrap done"><h1>Entre para finalizar</h1><p>Seus produtos continuam na sacola. Entre ou crie sua conta para enviar o pedido.</p>' +
        '<div class="btns" style="margin-top:1.5rem"><button type="button" class="btn btn--main" data-acct="login">Entrar ou criar conta</button>' +
        '<a class="btn btn--ghost" href="#/">Continuar comprando</a></div></div>';
      return;
    }
    var zones = C.shippingZones.map(function (z) {
      return '<option value="' + z.id + '">' + esc(z.name) + ' — ' + brl(z.fee) + ' (' + esc(z.days) + ')</option>';
    }).join('');
    var chip = function (name, value, text, checked) {
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '><span>' + text + '</span></label>';
    };

    app.innerHTML = '<div class="wrap"><div class="checkout"><form id="co" novalidate>' +
      '<h1>Finalizar pedido</h1><p class="checkout__intro">Preencha os dados e o pedido abre pronto no nosso WhatsApp para confirmar.</p>' +
      '<fieldset class="block"><legend>Seus dados</legend><div class="cols">' +
        field('f-name', 'Nome completo', '<input id="f-name" name="fullname" autocomplete="name" required>') +
        field('f-phone', 'WhatsApp', '<input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" required>') +
      '</div></fieldset>' +
      '<fieldset class="block"><legend>Entrega</legend><div class="chips" style="margin-bottom:1.25rem">' +
        chip('delivery', 'delivery', 'Entregar no meu endereço', true) + chip('delivery', 'pickup', 'Retirar na loja (grátis)') + '</div>' +
        '<div id="addr" class="cols">' +
          '<div class="wide">' + field('f-zone', 'Região', '<select id="f-zone" name="zone" required><option value="">Escolha sua região</option>' + zones + '</select>', 'Não achou sua região? Fale com a gente no WhatsApp.') + '</div>' +
          field('f-hood', 'Bairro', '<input id="f-hood" name="hood" required>') +
          field('f-cep', 'CEP (opcional)', '<input id="f-cep" name="cep" inputmode="numeric" autocomplete="postal-code">') +
          '<div class="wide">' + field('f-street', 'Rua', '<input id="f-street" name="street" autocomplete="address-line1" required>') + '</div>' +
          field('f-num', 'Número', '<input id="f-num" name="num" required>') +
          field('f-comp', 'Complemento (opcional)', '<input id="f-comp" name="comp" autocomplete="address-line2">') +
        '</div>' +
        '<p id="pickup" class="note" hidden>Retire em: ' + esc(C.pickupAddress) + '</p>' +
      '</fieldset>' +
      '<fieldset class="block"><legend>Pagamento</legend><div class="chips">' +
        chip('pay', 'pix', 'PIX', true) + chip('pay', 'whatsapp', 'Combinar pelo WhatsApp') + chip('pay', 'cash_on_delivery', 'Pagar na entrega') +
      '</div><p class="note" style="margin-top:.75rem">No PIX, a chave aparece depois que você enviar o pedido.</p></fieldset>' +
      '<fieldset class="block"><legend>Observações</legend>' +
        field('f-notes', 'Algo que a gente precisa saber? (opcional)', '<textarea id="f-notes" name="notes" placeholder="Ex.: é presente, horário para entregar…"></textarea>') +
      '</fieldset>' +
      '<button class="btn btn--wa btn--block" type="submit">Enviar pedido pelo WhatsApp</button>' +
      '</form>' +
      '<aside class="summary" aria-labelledby="sum-title"><h2 id="sum-title">Resumo</h2>' +
        cart.map(function (l, i) { return lineHtml(l, i, false); }).join('') +
        '<div class="totals"><div><span>Subtotal</span><span>' + brl(subtotal()) + '</span></div>' +
        '<div><span>Frete</span><span id="t-ship">Escolha a região</span></div>' +
        '<div class="grand"><span>Total</span><span id="t-total">' + brl(subtotal()) + '</span></div></div>' +
        '<p class="note" style="margin-top:1rem"><a href="#" data-open-bag>Alterar itens</a></p>' +
      '</aside></div></div>';

    var form = $('#co');
    if (AUTH.user && AUTH.user.name) form.fullname.value = AUTH.user.name;
    var zoneOf = function () { return C.shippingZones.find(function (z) { return z.id === form.zone.value; }); };
    var isPickup = function () { return form.delivery.value === 'pickup'; };
    var fee = function () { if (isPickup()) return 0; var z = zoneOf(); return z ? z.fee : null; };
    var refresh = function () {
      var pick = isPickup();
      $('#addr').hidden = pick;
      $('#pickup').hidden = !pick;
      var f = fee();
      $('#t-ship').textContent = pick ? 'Grátis (retirada)' : f == null ? 'Escolha a região' : brl(f);
      $('#t-total').textContent = brl(subtotal() + (f || 0));
    };
    form.addEventListener('change', refresh);
    refresh();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errs = [];
      var check = function (name, ok, msg) {
        var el = form[name], err = $('#' + el.id + '-err');
        el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (ok) { el.removeAttribute('aria-describedby'); err.textContent = ''; }
        else { el.setAttribute('aria-describedby', err.id); err.textContent = msg; errs.push(el); }
      };
      check('fullname', form.fullname.value.trim().length >= 3, 'Digite seu nome completo.');
      check('phone', form.phone.value.replace(/\D/g, '').length >= 10, 'Digite o WhatsApp com DDD.');
      if (!isPickup()) {
        check('zone', !!zoneOf(), 'Escolha a região para calcular o frete.');
        check('hood', !!form.hood.value.trim(), 'Digite o bairro.');
        check('street', !!form.street.value.trim(), 'Digite a rua.');
        check('num', !!form.num.value.trim(), 'Digite o número (ou “s/n”).');
      }
      if (errs.length) { errs[0].focus(); toast('Confira os campos marcados.'); return; }

      var id = 'JM' + Date.now().toString(36).toUpperCase().slice(-6);
      var ship = fee() || 0;
      var total = subtotal() + ship;
      var pay = form.pay.value;
      var payText = { pix: 'PIX', whatsapp: 'Combinar pelo WhatsApp', cash_on_delivery: 'Pagar na entrega' }[pay];
      var where = isPickup()
        ? 'Retirar na loja'
        : form.street.value.trim() + ', ' + form.num.value.trim() + (form.comp.value.trim() ? ' — ' + form.comp.value.trim() : '') +
          ' — ' + form.hood.value.trim() + ' (' + zoneOf().name + ')' + (form.cep.value.trim() ? ' — CEP ' + form.cep.value.trim() : '');
      var msg = 'Olá! Gostaria de confirmar meu pedido #' + id + ':\n' +
        cart.map(function (l) {
          var p = byId(l.id);
          return '- ' + p.name + (l.v ? ' (' + l.v + ')' : '') + ' x' + l.q + ' = ' + brl(unitPrice(p, l.v) * l.q);
        }).join('\n') +
        '\nFrete: ' + (isPickup() ? 'grátis (retirada)' : brl(ship)) +
        '\nTotal: ' + brl(total) +
        '\n\nNome: ' + form.fullname.value.trim() +
        '\nWhatsApp: ' + form.phone.value.trim() +
        '\nEntrega: ' + where +
        '\nPagamento: ' + payText +
        (form.notes.value.trim() ? '\nObs.: ' + form.notes.value.trim() : '') +
        (pay === 'pix' ? '\n---\nPIX: ' + C.pixKey : '') +
        '\nObrigado! 💖';
      var link = waLink(msg);
      window.open(link, '_blank', 'noopener');

      cart = []; save();
      viewDone(id, total, pay, link);
    });
  }

  function viewDone(id, total, pay, link) {
    document.title = 'Pedido enviado — JM Store';
    app.innerHTML = '<div class="wrap done"><h1>Pedido #' + id + ' enviado</h1>' +
      '<p>Abrimos o WhatsApp com o seu pedido. Envie a mensagem por lá e a gente confirma o estoque e o horário da entrega.</p>' +
      (pay === 'pix' ? '<div class="pix"><strong>Pague ' + brl(total) + ' no PIX</strong>' +
        '<span class="note">Chave PIX (' + esc(C.pixName) + ')</span><code id="pix-key">' + esc(C.pixKey) + '</code>' +
        '<button type="button" class="btn btn--ghost" id="copy-pix">Copiar chave PIX</button>' +
        '<span class="note">Depois de pagar, mande o comprovante na mesma conversa.</span></div>' : '') +
      '<div class="btns" style="margin-top:1.5rem"><a class="btn btn--wa" href="' + link + '" target="_blank" rel="noopener">Abrir o WhatsApp de novo</a>' +
      '<a class="btn btn--ghost" href="#/">Voltar à loja</a></div></div>';
    app.focus();
    window.scrollTo(0, 0);
    var copy = $('#copy-pix');
    if (copy) copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Chave copiada'; };
      if (navigator.clipboard) navigator.clipboard.writeText(C.pixKey).then(done, function () { toast('Selecione a chave e copie manualmente.'); });
      else toast('Selecione a chave e copie manualmente.');
    });
  }

  // ---------- router ----------
  var first = true;
  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    closeDrawer(false);
    if (parts[0] === 'produto') viewProduct(decodeURIComponent(parts[1] || ''));
    else if (parts[0] === 'categoria') viewCategory(parts[1]);
    else if (parts[0] === 'checkout') viewCheckout();
    else viewHome();
    if (!first) { window.scrollTo(0, 0); app.focus({ preventScroll: true }); }
    first = false;
  }

  function gotoCatalog() {
    var go = function () { var c = $('#catalogo'); if (c) c.scrollIntoView({ block: 'start' }); };
    if ($('#catalogo') && !$('.pdp')) go();
    else { location.hash = '#/'; setTimeout(go, 0); }
  }

  // ---------- global events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.id === 'bag-open' || t.hasAttribute('data-open-bag')) { e.preventDefault(); openDrawer(); return; }
    if (t.hasAttribute('data-goto-catalog')) { closeDrawer(false); gotoCatalog(); return; }
    if (t.hasAttribute('data-close')) { closeDrawer(); return; }
    if (t.hasAttribute('data-reset')) {
      state.q = ''; state.inStock = false; $('#search').value = '';
      if (state.cat) location.hash = '#/'; else { $('#instock').checked = false; fillGrid(); }
      return;
    }
    if (t.dataset.add) {
      var p = byId(t.dataset.add);
      AUTH.require(LOGIN_MSG, function () { if (add(p.id, '', 1)) toast(p.name + ' foi para a sacola.'); });
      return;
    }
    var i;
    if (t.dataset.inc != null) { i = +t.dataset.inc; setQty(i, cart[i].q + 1); renderDrawer(); }
    else if (t.dataset.dec != null) { i = +t.dataset.dec; setQty(i, cart[i].q - 1); renderDrawer(); }
    else if (t.dataset.rm != null) { setQty(+t.dataset.rm, 0); renderDrawer(); $('.drawer__head .icon-btn').focus(); }
    if (t.closest('#drawer') && t.getAttribute('href') === '#/checkout' && location.hash === '#/checkout') { closeDrawer(false); route(); }
  });
  $('.drawer__scrim').addEventListener('click', function () { closeDrawer(); });

  var search = $('#search');
  search.addEventListener('input', function () {
    state.q = search.value;
    if ($('#grid') && !$('.pdp')) fillGrid();
    else if (state.q) { state.cat = null; gotoCatalog(); }
  });
  $('#search-form').addEventListener('submit', function (e) { e.preventDefault(); state.q = search.value; gotoCatalog(); });

  // ---------- boot ----------
  var waHello = waLink('Olá! Vim pelo site da JM Store.');
  $('#wa-float').href = waHello;
  $('#foot-wa').href = waHello;
  $('#foot-pickup').textContent = 'Retirada: ' + C.pickupAddress;
  $('#year').textContent = new Date().getFullYear();
  window.addEventListener('hashchange', route);
  save();
  route();

  var wasLogged = !!AUTH.user;
  AUTH.onChange(function (s) {
    // Ao sair da conta, a sacola é esvaziada (útil em aparelho compartilhado).
    if (wasLogged && !s.user) { cart = []; save(); }
    wasLogged = !!s.user;
    if (location.hash === '#/checkout') route();
  });
})();
