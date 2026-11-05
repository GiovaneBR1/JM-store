// Painel financeiro da gestão: período com comparação, meta do mês, faturamento e lucro no tempo,
// categorias, variação de preço, mais vendidos, melhores clientes, produtos parados, pagamentos,
// e exportação do relatório em planilha (.xlsx) ou PDF (impressão do navegador).
(function () {
  'use strict';

  var EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // ---------- datas (as vendas guardam a data como "AAAA-MM-DD") ----------
  function day(y, m, d) { return new Date(y, m, d); }
  function addDays(dt, n) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n); }
  function endOfMonth(y, m) { return new Date(y, m + 1, 0); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseIso(s) { var p = String(s).split('-'); return day(+p[0], +p[1] - 1, +p[2]); }
  function fmt(d, opt) { return d.toLocaleDateString('pt-BR', opt || { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function todayDate() { var t = new Date(); return day(t.getFullYear(), t.getMonth(), t.getDate()); }
  function daysBetween(a, b) { return Math.round((b - a) / 864e5); }

  function periods() {
    var T = todayDate(), Y = T.getFullYear(), M = T.getMonth();
    return {
      mes: { label: 'Este mês', get: function () { return [day(Y, M, 1), T, day(Y, M - 1, 1), day(Y, M - 1, Math.min(T.getDate(), endOfMonth(Y, M - 1).getDate())), 'mesmos dias do mês passado']; } },
      passado: { label: 'Mês passado', get: function () { return [day(Y, M - 1, 1), endOfMonth(Y, M - 1), day(Y, M - 2, 1), endOfMonth(Y, M - 2), 'mês anterior']; } },
      tri: { label: 'Últimos 3 meses', get: function () { var a = day(Y, M - 2, 1); return [a, T, day(Y, M - 5, 1), addDays(a, -1), '3 meses anteriores']; } },
      ano: { label: 'Este ano', get: function () { return [day(Y, 0, 1), T, day(Y - 1, 0, 1), day(Y - 1, M, T.getDate()), 'mesmo período de ' + (Y - 1)]; } },
      anoPassado: { label: String(Y - 1), get: function () { return [day(Y - 1, 0, 1), day(Y - 1, 11, 31), day(Y - 2, 0, 1), day(Y - 2, 11, 31), String(Y - 2)]; } },
      custom: { label: 'Escolher meses', get: function () {
        var f = state.from ? parseIso(state.from + '-01') : day(Y, 0, 1), t = state.to ? parseIso(state.to + '-01') : day(Y, M, 1);
        if (t < f) { var s = f; f = t; t = s; }
        var end = endOfMonth(t.getFullYear(), t.getMonth()); if (end > T) end = T;
        var span = (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1;
        return [f, end, day(f.getFullYear(), f.getMonth() - span, 1), addDays(f, -1), span === 1 ? 'mês anterior' : span + ' meses anteriores'];
      } }
    };
  }

  var state = { period: 'mes', sort: 'rev', table: false, from: '', to: '' };
  try { var sv = JSON.parse(localStorage.getItem('jm-painel') || 'null'); if (sv) Object.assign(state, sv); } catch (e) { /* padrão */ }
  function remember() { try { localStorage.setItem('jm-painel', JSON.stringify(state)); } catch (e) { /* ignora */ } }

  // ---------- contas ----------
  function payGroup(p) {
    p = String(p || '');
    if (/pix/i.test(p)) return 'PIX';
    if (/cart/i.test(p)) return 'Cartão';
    if (/dinheiro/i.test(p)) return 'Dinheiro';
    return 'Fiado / outro';
  }
  function itemCat(ctx, i) { if (i.category) return i.category; var p = ctx.product(i.productId); return p ? p.category : ''; }
  function itemGross(s) { return s.items.reduce(function (t, i) { return t + i.qty * i.price; }, 0); }

  function compute(ctx) {
    var P = periods()[state.period] || periods().mes;
    var r = P.get(), a = r[0], b = r[1], pa = r[2], pb = r[3];
    var A = iso(a), B = iso(b), PA = iso(pa), PB = iso(pb);
    var cur = ctx.sales.filter(function (s) { return s.date >= A && s.date <= B; });
    var prev = ctx.sales.filter(function (s) { return s.date >= PA && s.date <= PB; });
    function summ(list) {
      var rev = 0, cost = 0, units = 0, disc = 0;
      list.forEach(function (s) { rev += ctx.saleTotal(s); cost += ctx.saleCost(s); disc += s.discount || 0; s.items.forEach(function (i) { units += i.qty; }); });
      return { rev: rev, cost: cost, profit: rev - cost, count: list.length, ticket: list.length ? rev / list.length : 0, units: units, disc: disc };
    }
    function byCat(list) {
      var o = {};
      list.forEach(function (s) {
        var gross = itemGross(s) || 1;
        s.items.forEach(function (i) {
          var k = itemCat(ctx, i) || '—', c = o[k] || (o[k] = { rev: 0, cost: 0, units: 0, gross: 0 });
          var line = i.qty * i.price;
          c.rev += line - (s.discount || 0) * line / gross; c.cost += i.qty * (i.cost || 0); c.units += i.qty; c.gross += line;
        });
      });
      return o;
    }
    function unitPrices(list) {
      var o = {};
      list.forEach(function (s) { s.items.forEach(function (i) { var k = i.productId + '|' + (i.variant || ''), u = o[k] || (o[k] = { q: 0, v: 0, cat: itemCat(ctx, i) }); u.q += i.qty; u.v += i.qty * i.price; }); });
      return o;
    }
    var c = summ(cur), p = summ(prev);
    var cc = byCat(cur), cp = byCat(prev);
    var cats = Object.keys(cc).map(function (k) {
      var o = cc[k], q = cp[k];
      return { key: k, name: ctx.catName(k), rev: o.rev, cost: o.cost, profit: o.rev - o.cost, margin: o.rev ? (o.rev - o.cost) / o.rev : 0, units: o.units,
        share: c.rev ? o.rev / c.rev : 0, prevRev: q ? q.rev : 0, growth: q && q.rev ? (o.rev - q.rev) / q.rev : null };
    });
    var upC = unitPrices(cur), upP = unitPrices(prev), agg = {};
    Object.keys(upC).forEach(function (k) {
      if (!upP[k]) return;
      var ratio = (upC[k].v / upC[k].q) / (upP[k].v / upP[k].q) - 1, g = agg[upC[k].cat] || (agg[upC[k].cat] = { w: 0, s: 0, n: 0 });
      g.w += upC[k].q; g.s += ratio * upC[k].q; g.n++;
    });
    var prices = Object.keys(agg).map(function (k) { return { name: ctx.catName(k), v: agg[k].s / agg[k].w, n: agg[k].n }; }).sort(function (x, y) { return y.v - x.v; });

    var tops = {};
    cur.forEach(function (s) { s.items.forEach(function (i) { var k = i.productId, t = tops[k] || (tops[k] = { name: i.name, cat: itemCat(ctx, i), q: 0, rev: 0 }); t.q += i.qty; t.rev += i.qty * i.price; }); });
    var top = Object.keys(tops).map(function (k) { return tops[k]; }).sort(function (x, y) { return y.q - x.q; }).slice(0, 5);

    var cl = {};
    cur.forEach(function (s) {
      var cu = s.customerId && ctx.customer(s.customerId); if (!cu) return;
      var o = cl[cu.id] || (cl[cu.id] = { name: cu.name, phone: cu.phone || '', rev: 0, n: 0, last: s.date });
      o.rev += ctx.saleTotal(s); o.n++; if (s.date > o.last) o.last = s.date;
    });
    var clients = Object.keys(cl).map(function (k) { return cl[k]; }).sort(function (x, y) { return y.rev - x.rev; });

    var pay = {}, chan = { Site: 0, 'Balcão': 0 }, payN = {}, chanN = { Site: 0, 'Balcão': 0 };
    cur.forEach(function (s) {
      var v = ctx.saleTotal(s), g = payGroup(s.payment), ch = s.channel === 'site' ? 'Site' : 'Balcão';
      pay[g] = (pay[g] || 0) + v; payN[g] = (payN[g] || 0) + 1; chan[ch] += v; chanN[ch]++;
    });

    var stale = staleProducts(ctx, b);
    var pending = cur.filter(function (s) { return s.status === 'pendente'; });
    return { a: a, b: b, pa: pa, pb: pb, compare: r[4], cur: cur, prev: prev, c: c, p: p, cats: cats, prices: prices, top: top, clients: clients,
      pay: pay, payN: payN, chan: chan, chanN: chanN, stale: stale, pending: pending };
  }

  // Produtos com estoque e sem venda há mais de N dias (conta a partir do cadastro se nunca vendeu).
  function lastSales(ctx, untilIso) {
    var last = {};
    ctx.sales.forEach(function (s) {
      if (untilIso && s.date > untilIso) return;
      s.items.forEach(function (i) { if (!last[i.productId] || s.date > last[i.productId]) last[i.productId] = s.date; });
    });
    return last;
  }
  function productSituation(ctx, p, last, until) {
    var limit = ctx.settings.staleDays || 30, stock = ctx.totalStock(p);
    var ref = last[p.id] ? parseIso(last[p.id]) : (p.createdAt ? new Date(p.createdAt) : null);
    var days = ref ? daysBetween(day(ref.getFullYear(), ref.getMonth(), ref.getDate()), until) : 0;
    return { stopped: stock > 0 && days > limit, days: days, last: last[p.id] || null, stock: stock, never: !last[p.id] };
  }
  function staleProducts(ctx, until) {
    var last = lastSales(ctx, iso(until));
    return ctx.products.map(function (p) { return Object.assign({ p: p, value: ctx.totalStock(p) * (p.cost || 0) }, productSituation(ctx, p, last, until)); })
      .filter(function (x) { return x.stopped; }).sort(function (x, y) { return y.days - x.days; });
  }

  // ---------- formatação ----------
  var brl = function (n) { return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var brl0 = function (n) { return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };
  var pct = function (n) { return ((n || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%'; };
  function pctSigned(v) {
    if (Math.abs(v) < 0.0005) return '= 0%';
    return (v >= 0 ? '▲ +' : '▼ −') + Math.abs(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  }
  function delta(cur, prev) {
    if (!prev) return cur ? '<span class="delta">novo</span>' : '';
    var v = (cur - prev) / Math.abs(prev);
    return '<span class="delta ' + (v >= 0 ? 'up' : 'down') + '">' + pctSigned(v) + '</span>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function periodName(R) {
    var a = R.a, b = R.b;
    if (a.getDate() === 1 && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return MESES[a.getMonth()] + ' de ' + a.getFullYear();
    return fmt(a) + ' a ' + fmt(b);
  }

  // ---------- barras por dia / semana / mês ----------
  function buckets(R, ctx) {
    var a = R.a, b = R.b, days = daysBetween(a, b) + 1, out = [];
    if (days <= 31) {
      for (var d = a; d <= b; d = addDays(d, 1)) out.push({ start: d, end: d, label: String(d.getDate()), long: fmt(d) });
    } else if (days <= 120) {
      var s = a;
      while (s <= b) {
        var e = addDays(s, 6 - ((s.getDay() + 6) % 7)); if (e > b) e = b;
        out.push({ start: s, end: e, label: fmt(s, { day: '2-digit', month: '2-digit' }), long: fmt(s, { day: '2-digit', month: 'short' }) + ' a ' + fmt(e, { day: '2-digit', month: 'short' }) });
        s = addDays(e, 1);
      }
    } else {
      for (var m = day(a.getFullYear(), a.getMonth(), 1); m <= b; m = day(m.getFullYear(), m.getMonth() + 1, 1)) {
        var en = endOfMonth(m.getFullYear(), m.getMonth()); if (en > b) en = b;
        out.push({ start: m < a ? a : m, end: en, label: m.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), long: MESES[m.getMonth()] + ' de ' + m.getFullYear() });
      }
    }
    return out.map(function (k) {
      var S = iso(k.start), E = iso(k.end), rev = 0, cost = 0, n = 0;
      R.cur.forEach(function (x) { if (x.date >= S && x.date <= E) { rev += ctx.saleTotal(x); cost += ctx.saleCost(x); n++; } });
      return Object.assign(k, { rev: rev, cost: cost, profit: rev - cost, count: n });
    });
  }
  function niceTop(v) {
    if (v <= 0) return 100;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  // Barras empilhadas: custo embaixo, lucro em cima (o topo é o faturamento). Cores por variável CSS.
  function barsSvg(bs, opts) {
    opts = opts || {};
    var W = opts.w || 960, H = opts.h || 280, pl = 64, pr = 8, pt = 14, pb = 28;
    var top = niceTop(Math.max.apply(null, bs.map(function (x) { return x.rev; }).concat([1])));
    var y = function (v) { return pt + (H - pt - pb) * (1 - v / top); };
    var bw = (W - pl - pr) / Math.max(1, bs.length), barW = Math.max(3, Math.min(42, bw * 0.62)), g = '';
    for (var t = 0; t <= 4; t++) {
      var yy = y(top * t / 4);
      g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="1"/>' +
        '<text x="' + (pl - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + brl0(top * t / 4) + '</text>';
    }
    var every = Math.ceil(bs.length / 14);
    bs.forEach(function (k, i) {
      var cx = pl + bw * i + bw / 2, x0 = cx - barW / 2, base = H - pb;
      var ch = (H - pt - pb) * Math.max(0, Math.min(k.cost, k.rev)) / top, lh = (H - pt - pb) * Math.max(0, k.profit) / top;
      if (k.rev > 0) {
        g += '<rect x="' + x0 + '" y="' + (base - ch) + '" width="' + barW + '" height="' + ch + '" fill="var(--s-custo)"/>';
        var ty = base - ch - 2 - lh;
        if (lh > 1) g += '<path d="M' + x0 + ' ' + (base - ch - 2) + ' V' + (ty + 4) + ' Q' + x0 + ' ' + ty + ' ' + (x0 + 4) + ' ' + ty + ' H' + (x0 + barW - 4) + ' Q' + (x0 + barW) + ' ' + ty + ' ' + (x0 + barW) + ' ' + (ty + 4) + ' V' + (base - ch - 2) + ' Z" fill="var(--s-lucro)"/>';
      }
      if (opts.hit) g += '<rect class="hit" data-i="' + i + '" x="' + (pl + bw * i) + '" y="' + pt + '" width="' + bw + '" height="' + (H - pt - pb) + '" fill="transparent"/>';
      if (i % every === 0) g += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(k.label) + '</text>';
    });
    g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '" stroke="var(--line-c)" stroke-width="1"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Faturamento e lucro">' + g + '</svg>';
  }

  // ---------- tela ----------
  function html(ctx) {
    var R = compute(ctx), c = R.c, p = R.p, PS = periods();
    var seg = Object.keys(PS).map(function (k) { return '<button type="button" data-period="' + k + '" aria-pressed="' + (state.period === k) + '">' + PS[k].label + '</button>'; }).join('');
    var custom = state.period === 'custom'
      ? '<span class="pf-custom"><label>De <input type="month" data-pf="from" value="' + (state.from || iso(R.a).slice(0, 7)) + '"></label><label>até <input type="month" data-pf="to" value="' + (state.to || iso(R.b).slice(0, 7)) + '"></label></span>' : '';

    var oneMonth = R.a.getDate() === 1 && R.a.getMonth() === R.b.getMonth() && R.a.getFullYear() === R.b.getFullYear();
    var goal = ctx.settings.goal || 0, goalHtml;
    if (!oneMonth) goalHtml = '<p class="muted">Escolha <b>Este mês</b> ou <b>Mês passado</b> para ver o andamento da meta.</p>';
    else if (!goal) goalHtml = '<p class="muted">Defina uma meta de faturamento para acompanhar o mês.</p>';
    else {
      var dim = endOfMonth(R.a.getFullYear(), R.a.getMonth()).getDate(), el = daysBetween(R.a, R.b) + 1, finished = el >= dim;
      var proj = c.rev / el * dim, done = c.rev / goal, expected = el / dim;
      goalHtml = '<div class="goal"><div><b class="big">' + brl(c.rev) + '</b> <span class="muted">de ' + brl0(goal) + ' · ' + pct(done) + '</span></div>' +
        '<p class="goal__side">' + (finished ? (c.rev >= goal ? 'Meta batida 🎉' : 'Faltaram ' + brl0(goal - c.rev))
          : 'Projeção: <b>' + brl0(proj) + '</b>' + (proj >= goal ? ' (bate a meta)' : ' (faltariam ' + brl0(goal - proj) + ')')) + '</p>' +
        '<div class="meter" role="img" aria-label="' + pct(done) + ' da meta"><i style="width:' + Math.min(100, done * 100).toFixed(1) + '%"></i>' +
          (!finished ? '<u style="left:' + Math.min(100, expected * 100).toFixed(1) + '%" title="Onde deveria estar hoje"></u>' : '') + '</div>' +
        (!finished ? '<p class="muted goal__note">A linha fina mostra onde o faturamento deveria estar hoje (' + el + ' de ' + dim + ' dias) para bater a meta.</p>' : '') + '</div>';
    }

    var bs = buckets(R, ctx);
    var unit = bs.length && +bs[0].start === +bs[0].end ? 'dia' : (daysBetween(R.a, R.b) <= 120 ? 'semana' : 'mês');
    var sortKey = state.sort, cats = R.cats.slice().sort(function (x, y) { return (y[sortKey] == null ? -Infinity : y[sortKey]) - (x[sortKey] == null ? -Infinity : x[sortKey]); });
    var maxRev = Math.max.apply(null, cats.map(function (x) { return x.rev; }).concat([1]));
    var maxAbs = Math.max.apply(null, R.prices.map(function (x) { return Math.abs(x.v); }).concat([0.05]));
    var maxQ = R.top.length ? R.top[0].q : 1, best = R.clients.slice(0, 5), maxC = best.length ? best[0].rev : 1;
    function share(obj, n, order) {
      var total = Object.keys(obj).reduce(function (t, k) { return t + obj[k]; }, 0);
      var keys = (order || Object.keys(obj)).filter(function (k) { return obj[k]; });
      if (!keys.length) return '<li><small class="muted">Nenhuma venda no período.</small></li>';
      return keys.sort(function (x, y) { return obj[y] - obj[x]; }).map(function (k) {
        return '<li><span>' + k + ' <small>· ' + n[k] + ' venda(s)</small></span><b>' + pct(obj[k] / total) + ' <small>· ' + brl0(obj[k]) + '</small></b><span class="track"><i style="width:' + (obj[k] / total * 100) + '%"></i></span></li>';
      }).join('');
    }

    var out = '' +
      '<div class="pf" role="group" aria-label="Período"><div class="seg">' + seg + '</div>' + custom +
        '<span class="pf-compare">Comparando com: ' + R.compare + ' (' + fmt(R.pa, { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' a ' + fmt(R.pb, { day: '2-digit', month: '2-digit', year: '2-digit' }) + ')</span>' +
        '<span class="pf-export"><button type="button" class="btn btn--ghost btn--sm" data-pexport="xlsx">Exportar planilha</button><button type="button" class="btn btn--ghost btn--sm" data-pexport="pdf">Exportar PDF</button></span></div>' +
      '<p class="muted pf-label">De ' + fmt(R.a) + ' a ' + fmt(R.b) + '</p>' +
      '<section class="kpis">' +
        kpi('Faturamento', brl(c.rev), delta(c.rev, p.rev) + ' vs ' + brl0(p.rev)) +
        kpi('Lucro', brl(c.profit), delta(c.profit, p.profit) + ' · margem ' + (c.rev ? pct(c.profit / c.rev) : '—')) +
        kpi('Vendas', String(c.count), delta(c.count, p.count) + ' · ' + c.units + ' itens') +
        kpi('Ticket médio', brl(c.ticket), delta(c.ticket, p.ticket) + ' vs ' + brl(p.ticket)) +
      '</section>' +
      '<p class="muted">' + (R.pending.length ? 'A receber neste período: <b>' + brl(R.pending.reduce(function (t, s) { return t + ctx.saleTotal(s); }, 0)) + '</b> em ' + R.pending.length + ' venda(s).' : 'Nada a receber neste período.') +
        (c.count && R.cur.some(function (s) { return s.items.some(function (i) { return !i.cost; }); }) ? ' · Há itens vendidos sem custo cadastrado: o lucro aparece maior do que é.' : '') + '</p>' +
      '<section class="panel"><header class="panel__head"><h2>Meta do mês</h2><label class="goal-input">Meta de faturamento <input type="number" min="0" step="100" inputmode="numeric" data-pf="goal" value="' + (goal || '') + '" placeholder="Ex.: 20000"></label></header>' + goalHtml + '</section>' +
      '<section class="panel"><header class="panel__head"><div><h2>Faturamento e lucro</h2><p class="muted">Por ' + unit + '. Cada barra é o faturamento: a parte de cima é o lucro.</p></div>' +
        '<div class="legend"><span><i style="background:var(--s-lucro)"></i>Lucro</span><span><i style="background:var(--s-custo)"></i>Custo dos produtos</span><button class="link" type="button" data-pf="table">' + (state.table ? 'Ver gráfico' : 'Ver em tabela') + '</button></div></header>' +
        (state.table
          ? '<div class="table-wrap"><table><thead><tr><th>Período</th><th class="num">Vendas</th><th class="num">Faturamento</th><th class="num">Custo</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>' +
              bs.map(function (k) { return '<tr><td>' + esc(k.long) + '</td><td class="num">' + k.count + '</td><td class="num">' + brl(k.rev) + '</td><td class="num">' + brl(k.cost) + '</td><td class="num">' + brl(k.profit) + '</td><td class="num">' + (k.rev ? pct(k.profit / k.rev) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<div class="chart" id="pf-chart">' + barsSvg(bs, { hit: true }) + '<div class="tip" hidden></div></div>') +
      '</section>' +
      '<div class="pf-cols"><section class="panel"><header class="panel__head"><div><h2>Categorias</h2><p class="muted">Faturamento, lucro, margem e crescimento no período</p></div>' +
          '<label class="muted pf-sort">Ordenar por <select data-pf="sort">' + [['rev', 'Faturamento'], ['profit', 'Lucro'], ['margin', 'Margem'], ['growth', 'Crescimento']].map(function (o) { return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></header>' +
          (cats.length ? '<div class="cat-row cat-row--head"><span>Categoria</span><span></span><span>Faturamento</span><span>Lucro</span><span>Margem</span><span>vs anterior</span></div>' + cats.map(function (x) {
            return '<div class="cat-row"><span class="cat-name">' + esc(x.name) + (!x.prevRev ? ' <span class="pill pill--neutral">nova</span>' : '') + '</span><span class="track"><i style="width:' + (x.rev / maxRev * 100).toFixed(1) + '%"></i></span>' +
              '<span class="num">' + brl0(x.rev) + '</span><span class="num">' + brl0(x.profit) + '</span><span class="num">' + pct(x.margin) + '</span><span class="num">' + (x.growth == null ? '—' : delta(x.rev, x.prevRev)) + '</span></div>';
          }).join('') : '<p class="muted">Nenhuma venda no período.</p>') +
          '<h3 class="pf-h3">Variação de preço por categoria</h3>' +
          (R.prices.length ? R.prices.map(function (x) {
            var w = Math.abs(x.v) < 0.0005 ? 0 : Math.abs(x.v) / maxAbs * 50;
            return '<div class="price-row"><span class="cat-name">' + esc(x.name) + '</span><span class="track track--mid" title="' + x.n + ' produto(s) comparados"><i style="left:' + (x.v >= 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:' + (x.v >= 0 ? 'var(--s-lucro)' : 'var(--s-custo)') + '"></i></span><b class="num">' + pctSigned(x.v) + '</b></div>';
          }).join('') : '<p class="muted">Sem vendas dos mesmos produtos no período anterior para comparar.</p>') +
          '<p class="pf-note">Quanto os produtos de cada categoria subiram ou baixaram de preço em relação ao período anterior, pelo preço gravado em cada venda.</p>' +
        '</section>' +
        '<div class="pf-stack">' +
          '<section class="panel"><header class="panel__head"><h2>Mais vendidos</h2><p class="muted">Por unidades</p></header><ol class="plist">' +
            (R.top.map(function (t) { return '<li><span>' + esc(t.name) + ' <small>· ' + esc(ctx.catName(t.cat)) + '</small></span><b>' + t.q + ' un.</b><span class="track"><i style="width:' + (t.q / maxQ * 100) + '%"></i></span></li>'; }).join('') || '<li><small class="muted">Nenhuma venda no período.</small></li>') + '</ol></section>' +
          '<section class="panel"><header class="panel__head"><h2>Melhores clientes</h2><p class="muted">Pelo total gasto</p></header><ol class="plist">' +
            (best.map(function (x) { return '<li><span>' + esc(x.name) + ' <small>· ' + x.n + ' compra(s), última em ' + fmt(parseIso(x.last), { day: '2-digit', month: '2-digit' }) + '</small></span><b>' + brl0(x.rev) + '</b><span class="track"><i style="width:' + (x.rev / maxC * 100) + '%"></i></span></li>'; }).join('') || '<li><small class="muted">Nenhuma compra de cliente cadastrado no período. Vendas de balcão sem cadastro não entram.</small></li>') + '</ol></section>' +
          '<section class="panel"><header class="panel__head"><h2>Produtos parados</h2><p class="muted">' + (R.stale.length ? R.stale.length + ' sem venda há mais de ' + (ctx.settings.staleDays || 30) + ' dias · ' + brl0(R.stale.reduce(function (t, x) { return t + x.value; }, 0)) + ' em estoque' : 'Nenhum parado há mais de ' + (ctx.settings.staleDays || 30) + ' dias') + '</p></header><ul class="plist">' +
            R.stale.slice(0, 6).map(function (x) { return '<li><span>' + esc(x.p.name) + ' <small>· ' + x.stock + ' em estoque</small></span><b><span class="pill pill--warn">' + x.days + ' dias</span></b></li>'; }).join('') +
            (R.stale.length > 6 ? '<li><a href="#/produtos" data-only-stale>Ver todos os ' + R.stale.length + ' na tela de Produtos</a></li>' : '') + '</ul></section>' +
          '<section class="panel"><header class="panel__head"><h2>Formas de pagamento</h2></header><ul class="plist">' + share(R.pay, R.payN) + '</ul></section>' +
          '<section class="panel"><header class="panel__head"><h2>Onde vendeu</h2><p class="muted">Pedidos do site ou balcão</p></header><ul class="plist">' + share(R.chan, R.chanN) + '</ul></section>' +
        '</div></div>';
    return out;
  }
  function kpi(label, value, sub) { return '<div class="stat"><span>' + label + '</span><b>' + value + '</b><small>' + sub + '</small></div>'; }

  function bind(root, ctx, rerender) {
    root.querySelectorAll('[data-period]').forEach(function (b) {
      b.addEventListener('click', function () { state.period = b.dataset.period; remember(); rerender(); });
    });
    root.querySelectorAll('[data-pf]').forEach(function (el) {
      var k = el.dataset.pf;
      if (k === 'table') el.addEventListener('click', function () { state.table = !state.table; remember(); rerender(); });
      else if (k === 'sort') el.addEventListener('change', function () { state.sort = el.value; remember(); rerender(); });
      else if (k === 'from' || k === 'to') el.addEventListener('change', function () { state[k] = el.value; remember(); rerender(); });
      else if (k === 'goal') el.addEventListener('change', function () { ctx.onGoal(Math.max(0, Math.round(+el.value || 0))); });
    });
    root.querySelectorAll('[data-pexport]').forEach(function (b) {
      b.addEventListener('click', function () { (b.dataset.pexport === 'xlsx' ? exportXlsx : printPdf)(ctx, b); });
    });
    var box = root.querySelector('#pf-chart');
    if (box) {
      var R = compute(ctx), bs = buckets(R, ctx), tip = box.querySelector('.tip'), svg = box.querySelector('svg');
      svg.addEventListener('mousemove', function (e) {
        var r = e.target.closest('.hit'); if (!r) { tip.hidden = true; return; }
        var k = bs[+r.dataset.i];
        tip.innerHTML = '<b>' + esc(k.long) + '</b>Faturamento ' + brl(k.rev) + '<br><i style="background:var(--s-lucro)"></i>Lucro ' + brl(k.profit) + (k.rev ? ' (' + pct(k.profit / k.rev) + ')' : '') +
          '<br><i style="background:var(--s-custo)"></i>Custo ' + brl(k.cost) + '<br>' + k.count + ' venda(s)';
        var rect = box.getBoundingClientRect(), rr = r.getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = Math.max(90, Math.min(rect.width - 90, rr.left - rect.left + rr.width / 2)) + 'px';
        tip.style.top = (rr.top - rect.top + 30) + 'px';
      });
      svg.addEventListener('mouseleave', function () { tip.hidden = true; });
    }
  }

  // ---------- exportar: planilha ----------
  var exceljsPromise;
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!exceljsPromise) exceljsPromise = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = EXCELJS_URL;
      s.onload = function () { res(window.ExcelJS); }; s.onerror = function () { exceljsPromise = null; rej(new Error('ExcelJS')); };
      document.head.appendChild(s);
    });
    return exceljsPromise;
  }
  function fileBase(R) { return 'relatorio-jm-store-' + iso(R.a) + '-a-' + iso(R.b); }

  function exportXlsx(ctx, btn) {
    var R = compute(ctx);
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
    var done = function () { if (btn) { btn.disabled = false; btn.textContent = 'Exportar planilha'; } };
    loadExcelJS().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook(); wb.creator = 'JM Store';
      var VINHO = 'FF7E1F3B', BRLF = '"R$" #,##0.00;-"R$" #,##0.00;"-"', PCTF = '0.0%;-0.0%;"-"', DATEF = 'dd/mm/yyyy';
      var font = { name: 'Arial', size: 10 };
      function sheet(name, cols) {
        var ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = cols.map(function (c) { return { header: c[0], key: c[1], width: c[2], style: { font: font, numFmt: c[3] } }; });
        var h = ws.getRow(1); h.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; h.height = 22;
        h.eachCell(function (cell) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VINHO } }; cell.alignment = { vertical: 'middle' }; });
        return ws;
      }
      var c = R.c, p = R.p;
      // Resumo
      var rs = wb.addWorksheet('Resumo'); rs.columns = [{ width: 40 }, { width: 18 }, { width: 18 }, { width: 14 }];
      rs.addRow(['Relatório JM Store']).font = { name: 'Arial', size: 16, bold: true, color: { argb: VINHO } };
      rs.addRow(['Período: ' + fmt(R.a) + ' a ' + fmt(R.b) + ' · comparado com ' + R.compare + ' (' + fmt(R.pa) + ' a ' + fmt(R.pb) + ')']).font = { name: 'Arial', size: 10, italic: true };
      rs.addRow([]);
      var hdr = rs.addRow(['', 'Período', 'Anterior', 'Variação']); hdr.font = { name: 'Arial', size: 10, bold: true };
      function line(label, a, b, f) {
        var r = rs.addRow([label, a, b, b ? a / b - 1 : null]); r.font = font;
        r.getCell(2).numFmt = f; r.getCell(3).numFmt = f; r.getCell(4).numFmt = PCTF;
      }
      line('Faturamento', c.rev, p.rev, BRLF); line('Custo dos produtos', c.cost, p.cost, BRLF); line('Lucro', c.profit, p.profit, BRLF);
      line('Vendas', c.count, p.count, '0'); line('Itens vendidos', c.units, p.units, '0'); line('Descontos dados', c.disc, p.disc, BRLF);
      line('Ticket médio', c.ticket, p.ticket, BRLF);
      var m = rs.addRow(['Margem', c.rev ? c.profit / c.rev : 0, p.rev ? p.profit / p.rev : 0]); m.font = font; m.getCell(2).numFmt = PCTF; m.getCell(3).numFmt = PCTF;
      var ar = rs.addRow(['A receber', R.pending.reduce(function (t, s) { return t + ctx.saleTotal(s); }, 0)]); ar.font = font; ar.getCell(2).numFmt = BRLF;
      if (ctx.settings.goal) {
        rs.addRow([]);
        var g1 = rs.addRow(['Meta de faturamento do mês', ctx.settings.goal]); g1.font = font; g1.getCell(2).numFmt = BRLF;
        var g2 = rs.addRow(['Atingido', c.rev / ctx.settings.goal]); g2.font = font; g2.getCell(2).numFmt = PCTF;
      }
      rs.addRow([]);
      rs.addRow(['Melhores clientes']).font = { name: 'Arial', size: 11, bold: true, color: { argb: VINHO } };
      R.clients.slice(0, 5).forEach(function (x) { var r = rs.addRow([x.name, x.rev, x.n + ' compra(s)', parseIso(x.last)]); r.font = font; r.getCell(2).numFmt = BRLF; r.getCell(4).numFmt = DATEF; });
      rs.addRow([]);
      rs.addRow(['Produtos parados (sem venda há mais de ' + (ctx.settings.staleDays || 30) + ' dias)', R.stale.length]).font = { name: 'Arial', size: 10, bold: true };
      var sv = rs.addRow(['Dinheiro parado em estoque (pelo custo)', R.stale.reduce(function (t, x) { return t + x.value; }, 0)]); sv.font = font; sv.getCell(2).numFmt = BRLF;

      var V = sheet('Vendas', [['Data', 'date', 12, DATEF], ['Cliente', 'cli', 26], ['Canal', 'ch', 10], ['Pagamento', 'pay', 20], ['Status', 'st', 11], ['Itens', 'n', 8, '0'],
        ['Subtotal', 'sub', 13, BRLF], ['Desconto', 'disc', 12, BRLF], ['Total', 'tot', 13, BRLF], ['Custo', 'cost', 13, BRLF], ['Lucro', 'luc', 13, BRLF], ['Margem', 'mg', 9, PCTF]]);
      R.cur.slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; }).forEach(function (s) {
        var cu = s.customerId && ctx.customer(s.customerId), tot = ctx.saleTotal(s), cost = ctx.saleCost(s);
        V.addRow({ date: parseIso(s.date), cli: cu ? cu.name : 'Balcão (sem cadastro)', ch: s.channel === 'site' ? 'Site' : 'Balcão', pay: s.payment, st: s.status === 'pendente' ? 'A receber' : 'Pago',
          n: s.items.reduce(function (t, i) { return t + i.qty; }, 0), sub: itemGross(s), disc: s.discount || 0, tot: tot, cost: cost, luc: tot - cost, mg: tot ? (tot - cost) / tot : 0 });
      });
      var I = sheet('Itens', [['Data', 'date', 12, DATEF], ['Produto', 'prod', 34], ['Opção', 'opt', 14], ['Categoria', 'cat', 14], ['Qtd', 'q', 6, '0'], ['Preço unit.', 'pu', 12, BRLF],
        ['Total do item', 'ti', 13, BRLF], ['Custo unit.', 'cu', 12, BRLF], ['Custo total', 'ct', 13, BRLF], ['Lucro', 'l', 13, BRLF]]);
      R.cur.forEach(function (s) { s.items.forEach(function (i) {
        I.addRow({ date: parseIso(s.date), prod: i.name, opt: i.variant || '', cat: ctx.catName(itemCat(ctx, i)), q: i.qty, pu: i.price, ti: i.qty * i.price, cu: i.cost || 0, ct: i.qty * (i.cost || 0), l: i.qty * (i.price - (i.cost || 0)) });
      }); });
      var C = sheet('Categorias', [['Categoria', 'n', 18], ['Faturamento', 'r', 14, BRLF], ['Custo', 'c', 14, BRLF], ['Lucro', 'l', 14, BRLF], ['Margem', 'm', 9, PCTF], ['Unidades', 'u', 10, '0'],
        ['% do faturamento', 's', 14, PCTF], ['Faturamento anterior', 'pr', 16, BRLF], ['Crescimento', 'g', 12, PCTF]]);
      R.cats.slice().sort(function (x, y) { return y.rev - x.rev; }).forEach(function (x) { C.addRow({ n: x.name, r: x.rev, c: x.cost, l: x.profit, m: x.margin, u: x.units, s: x.share, pr: x.prevRev, g: x.growth }); });
      var last = lastSales(ctx, iso(R.b)), sold = {};
      R.cur.forEach(function (s) { s.items.forEach(function (i) { sold[i.productId] = (sold[i.productId] || 0) + i.qty; }); });
      var Pd = sheet('Produtos', [['Produto', 'n', 34], ['Categoria', 'c', 14], ['Estoque', 'e', 8, '0'], ['Custo unit.', 'cu', 12, BRLF], ['Preço', 'p', 12, BRLF], ['Valor em estoque', 'v', 14, BRLF],
        ['Vendidos no período', 'q', 12, '0'], ['Última venda', 'u', 13, DATEF], ['Dias sem vender', 'd', 10, '0'], ['Situação', 's', 12]]);
      ctx.products.slice().sort(function (x, y) { return x.name.localeCompare(y.name); }).forEach(function (pp) {
        var sit = productSituation(ctx, pp, last, R.b), st = ctx.totalStock(pp);
        Pd.addRow({ n: pp.name, c: ctx.catName(pp.category), e: st, cu: pp.cost || 0, p: ctx.minPrice(pp), v: st * (pp.cost || 0), q: sold[pp.id] || 0,
          u: sit.last ? parseIso(sit.last) : null, d: sit.last || pp.createdAt ? sit.days : null, s: st <= 0 ? 'Sem estoque' : sit.stopped ? 'Parado' : 'Vendendo' });
      });
      var K = sheet('Clientes', [['Cliente', 'n', 26], ['WhatsApp', 'w', 16], ['Compras no período', 'c', 12, '0'], ['Total gasto', 't', 14, BRLF], ['Ticket médio', 'tk', 13, BRLF], ['Última compra', 'u', 13, DATEF]]);
      R.clients.forEach(function (x) { K.addRow({ n: x.name, w: x.phone, c: x.n, t: x.rev, tk: x.rev / x.n, u: parseIso(x.last) }); });
      var G = sheet('Pagamentos', [['Forma / canal', 'n', 18], ['Faturamento', 'f', 14, BRLF], ['% do total', 'p', 11, PCTF], ['Vendas', 'v', 9, '0']]);
      Object.keys(R.pay).forEach(function (k) { G.addRow({ n: k, f: R.pay[k], p: c.rev ? R.pay[k] / c.rev : 0, v: R.payN[k] }); });
      G.addRow({});
      Object.keys(R.chan).forEach(function (k) { G.addRow({ n: k, f: R.chan[k], p: c.rev ? R.chan[k] / c.rev : 0, v: R.chanN[k] }); });
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase(R) + '.xlsx');
      done();
    }).catch(function () { done(); ctx.toast('Não foi possível gerar a planilha. Confira a internet e tente de novo.'); });
  }
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- exportar: PDF (relatório para impressão → "Salvar como PDF") ----------
  function reportHtml(ctx) {
    var R = compute(ctx), c = R.c, p = R.p, per = periodName(R);
    var bs = buckets(R, ctx);
    var lead = R.cats.slice().sort(function (x, y) { return y.rev - x.rev; })[0];
    var grow = R.cats.filter(function (x) { return x.growth != null; }).sort(function (x, y) { return y.growth - x.growth; })[0];
    var bestB = bs.slice().sort(function (x, y) { return y.rev - x.rev; })[0];
    var goal = ctx.settings.goal || 0;
    var dest = [];
    if (c.count) dest.push('O faturamento foi de <b>' + brl(c.rev) + '</b>' + (p.rev ? ', <b>' + Math.abs((c.rev / p.rev - 1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% ' + (c.rev >= p.rev ? 'acima' : 'abaixo') + '</b> do período anterior.' : '.'));
    if (lead) dest.push('<b>' + esc(lead.name) + '</b> foi a categoria que mais faturou (' + pct(lead.share) + ' do total)' + (grow && grow.key !== lead.key ? '; <b>' + esc(grow.name) + '</b> foi a que mais cresceu (' + pctSigned(grow.growth) + ').' : '.'));
    var monthOpen = R.b < endOfMonth(R.a.getFullYear(), R.a.getMonth());
    if (goal && R.a.getMonth() === R.b.getMonth()) dest.push('A meta de ' + brl0(goal) + (monthOpen ? ' está' : ' ficou') + ' <b>' + pct(c.rev / goal) + ' atingida</b>' + (c.rev >= goal ? '. Meta batida!' : (monthOpen ? '; faltam ' : '; faltaram ') + brl0(goal - c.rev) + '.'));
    if (bestB && bestB.rev) dest.push('O melhor ' + (+bestB.start === +bestB.end ? 'dia' : 'período') + ' foi <b>' + esc(bestB.long) + '</b>, com ' + brl(bestB.rev) + ' em vendas.');
    dest.push(R.stale.length ? '<b>' + R.stale.length + ' produto(s)</b> estão sem venda há mais de ' + (ctx.settings.staleDays || 30) + ' dias, com ' + brl(R.stale.reduce(function (t, x) { return t + x.value; }, 0)) + ' parados em estoque.' : 'Nenhum produto parado.');
    function table(head, rows, al) {
      if (!rows.length) return '<p class="r-muted">Nada no período.</p>';
      return '<table><thead><tr>' + head.map(function (h, i) { return '<th class="' + al[i] + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (x, i) { return '<td class="' + al[i] + '">' + x + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    var cats = R.cats.slice().sort(function (x, y) { return y.rev - x.rev; }), maxc = cats.length ? cats[0].rev || 1 : 1;
    var k = function (l, v, d) { return '<div class="r-kpi"><span>' + l + '</span><b>' + v + '</b><small>' + d + '</small></div>'; };
    var payRows = Object.keys(R.pay).map(function (x) { return [x, brl(R.pay[x]), pct(R.pay[x] / (c.rev || 1)), String(R.payN[x])]; })
      .concat(Object.keys(R.chan).filter(function (x) { return R.chanN[x]; }).map(function (x) { return [x, brl(R.chan[x]), pct(R.chan[x] / (c.rev || 1)), String(R.chanN[x])]; }));
    return '<div class="r-top"><div class="r-brand">JM Store</div><div><h1>Relatório de ' + esc(per) + '</h1><p>' + fmt(R.a) + ' a ' + fmt(R.b) + ' · comparado com ' + esc(R.compare) + ' · gerado em ' + fmt(new Date()) + '</p></div></div>' +
      '<div class="r-kpis">' + k('Faturamento', brl(c.rev), delta(c.rev, p.rev) + ' vs ' + brl0(p.rev)) + k('Lucro', brl(c.profit), delta(c.profit, p.profit) + ' · margem ' + (c.rev ? pct(c.profit / c.rev) : '—')) +
        k('Vendas', String(c.count), delta(c.count, p.count) + ' · ' + c.units + ' itens') + k('Ticket médio', brl(c.ticket), delta(c.ticket, p.ticket)) + '</div>' +
      (goal && R.a.getMonth() === R.b.getMonth() ? '<section><h2>Meta do mês</h2><div class="r-goal"><div><b>' + brl(c.rev) + '</b> de ' + brl0(goal) + ' · ' + pct(c.rev / goal) + '</div><div class="r-meter"><i style="width:' + Math.min(100, c.rev / goal * 100).toFixed(0) + '%"></i></div></div></section>' : '') +
      '<section><h2>Faturamento e lucro</h2><p class="r-muted">Cada barra é o faturamento, dividido em custo dos produtos e lucro.</p>' + barsSvg(bs, { w: 720, h: 200 }) + '</section>' +
      '<section><h2>Destaques</h2><ul class="r-dest">' + dest.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></section>' +
      '<section><h2>Categorias</h2>' + table(['Categoria', '', 'Faturamento', 'Lucro', 'Margem', 'Participação', 'vs anterior'], cats.map(function (x) {
        return [esc(x.name), '<span class="r-bar"><i style="width:' + (x.rev / maxc * 100).toFixed(0) + '%"></i></span>', brl(x.rev), brl(x.profit), pct(x.margin), pct(x.share), x.growth == null ? '—' : delta(x.rev, x.prevRev)];
      }), ['l', 'l', 'r', 'r', 'r', 'r', 'r']) + '</section>' +
      '<div class="r-page2"><div class="r-two">' +
        '<section><h2>Mais vendidos</h2>' + table(['Produto', 'Unid.', 'Faturamento'], R.top.map(function (t) { return [esc(t.name), String(t.q), brl(t.rev)]; }), ['l', 'r', 'r']) + '</section>' +
        '<section><h2>Melhores clientes</h2>' + table(['Cliente', 'Compras', 'Total gasto'], R.clients.slice(0, 5).map(function (x) { return [esc(x.name), String(x.n), brl(x.rev)]; }), ['l', 'r', 'r']) + '</section>' +
      '</div><div class="r-two">' +
        '<section><h2>Pagamentos e canal</h2>' + table(['', 'Faturamento', '%', 'Vendas'], payRows, ['l', 'r', 'r', 'r']) + '</section>' +
        '<section><h2>Produtos parados</h2>' + table(['Produto', 'Estoque', 'Dias', 'Valor parado'], R.stale.map(function (x) { return [esc(x.p.name), String(x.stock), String(x.days), brl(x.value)]; }), ['l', 'r', 'r', 'r']) + '</section>' +
      '</div>' +
      '<section><h2>A receber</h2>' + table(['Data', 'Cliente', 'Pagamento', 'Valor'], R.pending.map(function (s) { var cu = s.customerId && ctx.customer(s.customerId); return [fmt(parseIso(s.date), { day: '2-digit', month: '2-digit' }), esc(cu ? cu.name : 'Balcão'), esc(s.payment), brl(ctx.saleTotal(s))]; }), ['l', 'l', 'l', 'r']) + '</section>' +
      '<p class="r-foot">Faturamento já com os descontos de cupom. Nas categorias, o desconto da venda é dividido entre os itens. Gerado pela gestão da JM Store.</p></div>';
  }
  function printPdf(ctx) {
    var root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = reportHtml(ctx);
    var title = document.title;
    document.title = fileBase(compute(ctx));
    document.body.classList.add('printing');
    var restore = function () { document.body.classList.remove('printing'); document.title = title; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(function () { window.print(); setTimeout(restore, 500); }, 50);
  }

  window.JMPainel = { html: html, bind: bind, compute: compute, reportHtml: reportHtml, exportXlsx: exportXlsx, printPdf: printPdf, productSituation: productSituation, lastSales: lastSales, iso: iso, todayDate: todayDate };
})();
