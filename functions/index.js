// Avisos de pedidos da JM Store (rodam nos servidores do Google, plano Blaze do Firebase).
// - Pedido novo: e-mail para a loja, notificação no celular da gestão e e-mail "Recebemos seu pedido" para o cliente.
// - Mudança de status: e-mail para o cliente.
// - Pedido de devolução: e-mail e notificação para a loja; resposta da loja: e-mail para o cliente.
// - Automações (ajustes na gestão → Pedidos → Automações): confirmação automática com reserva de estoque,
//   lembrete de PIX, cancelamento de PIX não pago, alerta de estoque baixo e resumo diário.
// Pedidos de demonstração (demo: true) não disparam nada.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { reservar, devolver, totalStock } = require('./estoque');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const fs = require('fs');
const LOJA = require('./loja');

admin.initializeApp();
const SENHA_GMAIL = defineSecret('GMAIL_APP_PASSWORD'); // senha de app do Gmail da loja
const OPCOES = { region: 'southamerica-east1', secrets: [SENHA_GMAIL] };
const EMULADOR = process.env.FUNCTIONS_EMULATOR === 'true';
const FUSO = 'America/Sao_Paulo';
const HORA = 3600e3, DIA = 864e5;

// Ajustes das automações (documento settings/loja, editado na gestão).
const PADRAO = { autoConfirm: false, lembretePix: true, autoCancelDays: 3, alertaEstoque: true, resumoDiario: true };
async function ajustes() {
  const d = await admin.firestore().collection('settings').doc('loja').get();
  return Object.assign({}, PADRAO, d.exists ? d.data() : {});
}
const ms = (t) => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : 0);
const diaLocal = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(d); // AAAA-MM-DD
const dataBR = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d);

// ---------- envio ----------
let transporte;
function enviarEmail(para, assunto, html) {
  if (!para) return Promise.resolve();
  const msg = { from: `"${LOJA.nome}" <${LOJA.emailLoja}>`, to: para, subject: assunto, html };
  if (EMULADOR && process.env.MAIL_LOG) { fs.appendFileSync(process.env.MAIL_LOG, JSON.stringify({ tipo: 'email', ...msg }) + '\n'); return Promise.resolve(); }
  transporte = transporte || nodemailer.createTransport({ service: 'gmail', auth: { user: LOJA.emailLoja, pass: SENHA_GMAIL.value() } });
  return transporte.sendMail(msg).catch((e) => logger.error('Falha ao enviar e-mail', { para, assunto, erro: e.message }));
}

// Notificação para todos os aparelhos em que a gestão ativou os avisos.
async function notificarLoja(titulo, texto, caminho) {
  const snap = await admin.firestore().collection('adminTokens').get();
  const tokens = snap.docs.map((d) => d.id);
  if (!tokens.length) return;
  const data = { title: titulo, body: texto, url: LOJA.site + 'admin.html' + (caminho || '#/pedidos') };
  if (EMULADOR && process.env.MAIL_LOG) { fs.appendFileSync(process.env.MAIL_LOG, JSON.stringify({ tipo: 'push', tokens, ...data }) + '\n'); return; }
  const res = await admin.messaging().sendEachForMulticast({ tokens, data, webpush: { headers: { Urgency: 'high' } } });
  // Remove aparelhos que desativaram os avisos ou trocaram de navegador.
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') return snap.docs[i].ref.delete();
    return null;
  }));
}

// ---------- e-mails ----------
const brl = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'cliente';

function layout(titulo, corpo, botao) {
  return `<!doctype html><html><body style="margin:0;background:#FBF6F3;font-family:Arial,Helvetica,sans-serif;color:#3B1424">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6F3;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #EADBD5;border-radius:10px">
    <tr><td style="padding:20px 24px;border-bottom:2px solid #7E1F3B;font:700 22px Georgia,serif;color:#3B1424">${esc(LOJA.nome)}</td></tr>
    <tr><td style="padding:22px 24px 8px"><h1 style="margin:0 0 12px;font:700 20px Georgia,serif;color:#3B1424">${titulo}</h1>${corpo}</td></tr>
    ${botao ? `<tr><td style="padding:8px 24px 24px"><a href="${botao.url}" style="display:inline-block;background:#7E1F3B;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">${esc(botao.texto)}</a></td></tr>` : ''}
    <tr><td style="padding:14px 24px;border-top:1px solid #EADBD5;font-size:12px;color:#7A4A57">${esc(LOJA.nome)} · <a href="${LOJA.site}" style="color:#7E1F3B">${LOJA.site.replace(/^https:\/\//, '')}</a> · WhatsApp <a href="https://wa.me/${LOJA.whatsapp}" style="color:#7E1F3B">fale com a gente</a></td></tr>
  </table></td></tr></table></body></html>`;
}

function itensHtml(o) {
  const linhas = (o.items || []).map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #F1E6E2">${i.qty}× ${esc(i.name)}${i.variant ? ' (' + esc(i.variant) + ')' : ''}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #F1E6E2;white-space:nowrap">${brl(i.price * i.qty)}</td></tr>`).join('');
  const frete = o.delivery && o.delivery.type === 'pickup' ? 'Retirada na loja' : 'Frete';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 12px">${linhas}
    ${o.coupon ? `<tr><td style="padding:6px 0;color:#3F6B45">Cupom ${esc(o.coupon.code)}</td><td align="right" style="color:#3F6B45">− ${brl(o.coupon.discount)}</td></tr>` : ''}
    <tr><td style="padding:6px 0">${frete}</td><td align="right">${o.delivery && o.delivery.fee ? brl(o.delivery.fee) : 'grátis'}</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #D8B9B3">Total</td><td align="right" style="font-weight:bold;border-top:1px solid #D8B9B3">${brl(o.total)}</td></tr></table>`;
}
function entregaHtml(o) {
  if (!o.delivery) return '';
  return o.delivery.type === 'pickup'
    ? `<p style="margin:0 0 8px;font-size:14px"><b>Retirada:</b> ${esc(LOJA.retirada)}</p>`
    : `<p style="margin:0 0 8px;font-size:14px"><b>Entrega:</b> ${esc(o.delivery.address || '')}</p>`;
}

function emailLojaPedidoNovo(o, faltam) {
  const c = o.customer || {};
  const aviso = o.status === 'confirmado'
    ? `<p style="margin:0 0 10px;padding:10px 12px;background:#E7F0E5;border-radius:6px;font-size:14px;color:#3F6B45"><b>Confirmado automaticamente.</b> O estoque já foi reservado.</p>`
    : faltam && faltam.length ? `<p style="margin:0 0 10px;padding:10px 12px;background:#F6EEDB;border-radius:6px;font-size:14px;color:#7A5A10"><b>⚠️ Precisa da sua atenção:</b> falta estoque de ${esc(faltam.join(', '))}. Confira e confirme o pedido na gestão.</p>` : '';
  return layout(`Novo pedido #${esc(o.code)}`, aviso +
    `<p style="margin:0 0 8px;font-size:14px"><b>${esc(c.name)}</b> · ${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</p>` +
    itensHtml(o) + entregaHtml(o) +
    `<p style="margin:0 0 8px;font-size:14px"><b>Pagamento:</b> ${esc(o.payment)}</p>` +
    (o.notes ? `<p style="margin:0 0 8px;font-size:14px"><b>Observações:</b> ${esc(o.notes)}</p>` : ''),
    { texto: 'Abrir o pedido na gestão', url: LOJA.site + 'admin.html#/pedidos' });
}
function emailClientePedidoRecebido(o) {
  const pix = /pix/i.test(o.payment || '');
  const ok = o.status === 'confirmado';
  return layout(ok ? `Seu pedido #${esc(o.code)} está confirmado` : `Recebemos seu pedido #${esc(o.code)}`,
    `<p style="margin:0 0 10px;font-size:15px">Olá, ${esc(primeiroNome(o.customer && o.customer.name))}! Obrigada por comprar na ${esc(LOJA.nome)}. ` +
      (ok ? 'Seu pedido está confirmado e já separamos seus produtos.' : 'Vamos conferir o estoque e confirmar seu pedido em breve.') + `</p>` +
    itensHtml(o) + entregaHtml(o) +
    `<p style="margin:0 0 8px;font-size:14px"><b>Pagamento:</b> ${esc(o.payment)}</p>` +
    (pix ? `<p style="margin:8px 0;padding:10px 12px;background:#FBF6F3;border-radius:6px;font-size:14px"><b>Chave PIX (${esc(LOJA.pixNome)}):</b> ${esc(LOJA.pixChave)}<br>Depois de pagar, mande o comprovante no nosso WhatsApp.</p>` : ''),
    { texto: 'Acompanhar em Meus pedidos', url: LOJA.site + '#/pedidos' });
}

const STATUS = {
  confirmado: ['Seu pedido #{c} foi confirmado', 'Separamos seus produtos. Avisamos quando ele sair para entrega ou estiver pronto para retirada.'],
  pago: ['Pagamento do pedido #{c} confirmado', 'Recebemos seu pagamento. Obrigada!'],
  enviado: ['Seu pedido #{c} saiu para entrega', 'Ele está a caminho do endereço que você informou.'],
  retirar: ['Seu pedido #{c} está pronto para retirada', 'Você já pode retirar na loja: ' + LOJA.retirada + '.'],
  entregue: ['Compra #{c} finalizada', 'Obrigada pela compra! Se algo não estiver certo, você pode pedir a devolução em até 7 dias em Meus pedidos.'],
  cancelado: ['Pedido #{c} cancelado', 'Seu pedido foi cancelado. Se tiver alguma dúvida, fale com a gente pelo WhatsApp.']
};
const DEVOLUCAO = {
  aprovada: ['Devolução do pedido #{c} aprovada', 'Vamos combinar a entrega do produto pelo WhatsApp.'],
  recusada: ['Sobre a devolução do pedido #{c}', 'Não foi possível aceitar a devolução deste pedido.'],
  concluida: ['Devolução do pedido #{c} concluída', 'Recebemos o produto e o reembolso foi feito.']
};
function emailCliente(o, assunto, texto, nota) {
  return layout(esc(assunto),
    `<p style="margin:0 0 10px;font-size:15px">Olá, ${esc(primeiroNome(o.customer && o.customer.name))}! ${esc(texto)}</p>` +
    (nota ? `<p style="margin:0 0 10px;padding:10px 12px;background:#FBF6F3;border-radius:6px;font-size:14px"><b>Mensagem da loja:</b> ${esc(nota)}</p>` : '') +
    itensHtml(o),
    { texto: 'Ver em Meus pedidos', url: LOJA.site + '#/pedidos' });
}

// ---------- gatilhos ----------
exports.pedidoCriado = onDocumentCreated({ document: 'orders/{id}', ...OPCOES }, async (event) => {
  const o = event.data && event.data.data();
  if (!o || o.demo) return;
  const c = o.customer || {}, cfg = await ajustes();
  let faltam = [];
  // Confirmação automática: só quando todos os itens têm estoque; o estoque fica reservado.
  if (cfg.autoConfirm && o.status === 'novo') {
    try {
      const r = await reservar(event.data.ref);
      if (r.ok) o.status = 'confirmado'; else faltam = r.faltam || [];
    } catch (e) { logger.error('Falha na confirmação automática', { pedido: o.code, erro: e.message }); }
  }
  const ok = o.status === 'confirmado';
  await Promise.all([
    enviarEmail(LOJA.emailLoja, `🛍️ Novo pedido #${o.code} — ${c.name || 'cliente'} — ${brl(o.total)}${faltam.length ? ' — falta estoque' : ''}`, emailLojaPedidoNovo(o, faltam)),
    enviarEmail(c.email, ok ? `Seu pedido #${o.code} está confirmado — ${LOJA.nome}` : `Recebemos seu pedido #${o.code} — ${LOJA.nome}`, emailClientePedidoRecebido(o)),
    notificarLoja(`🛍️ Novo pedido #${o.code}`, `${c.name || 'Cliente'} · ${brl(o.total)} · ${o.payment || ''}${ok ? ' · confirmado' : faltam.length ? ' · falta estoque' : ''}`, '#/pedidos')
  ]);
});

exports.pedidoAtualizado = onDocumentUpdated({ document: 'orders/{id}', ...OPCOES }, async (event) => {
  const antes = event.data.before.data(), o = event.data.after.data();
  if (!o || o.demo) return;
  const email = o.customer && o.customer.email, tarefas = [];
  // Confirmado pelo servidor: o cliente já recebeu "Seu pedido está confirmado" no e-mail do pedido novo.
  const jaAvisado = o.status === 'confirmado' && o.autoConfirmed && !antes.autoConfirmed;
  if (antes.status !== o.status && STATUS[o.status] && !jaAvisado) {
    let [assunto, texto] = STATUS[o.status];
    if (o.status === 'cancelado' && o.autoCancelled) texto = 'Cancelamos seu pedido porque não recebemos o pagamento a tempo. Se ainda quiser os produtos, é só fazer um novo pedido ou falar com a gente pelo WhatsApp.';
    tarefas.push(enviarEmail(email, assunto.replace('{c}', o.code), emailCliente(o, assunto.replace('{c}', o.code), texto)));
  }
  const ra = antes['return'], rd = o['return'];
  if (!ra && rd && rd.status === 'solicitada') {
    const c = o.customer || {};
    tarefas.push(enviarEmail(LOJA.emailLoja, `↩️ Pedido de devolução #${o.code} — ${c.name || 'cliente'}`,
      layout(`Pedido de devolução #${esc(o.code)}`,
        `<p style="margin:0 0 8px;font-size:14px"><b>${esc(c.name)}</b> · ${esc(c.phone)}</p><p style="margin:0 0 8px;font-size:14px"><b>Motivo:</b> ${esc(rd.reason)}${rd.details ? ' — “' + esc(rd.details) + '”' : ''}</p>` + itensHtml(o),
        { texto: 'Responder na gestão', url: LOJA.site + 'admin.html#/pedidos' })));
    tarefas.push(notificarLoja(`↩️ Devolução pedida #${o.code}`, `${c.name || 'Cliente'}: ${rd.reason}`, '#/pedidos'));
  } else if (ra && rd && ra.status !== rd.status && DEVOLUCAO[rd.status]) {
    const [assunto, texto] = DEVOLUCAO[rd.status];
    tarefas.push(enviarEmail(email, assunto.replace('{c}', o.code), emailCliente(o, assunto.replace('{c}', o.code), texto, rd.note)));
  }
  await Promise.all(tarefas);
});

// ---------- alerta de estoque baixo ----------
// Avisa só quando o produto cruza o mínimo (ou esgota), para não repetir o aviso a cada venda.
exports.estoqueAtualizado = onDocumentUpdated({ document: 'products/{id}', ...OPCOES }, async (event) => {
  const antes = event.data.before.data(), p = event.data.after.data();
  if (!p) return;
  const a = totalStock(antes), d = totalStock(p), min = p.minStock || 0;
  const esgotou = a > 0 && d <= 0, baixo = a > min && d <= min && d > 0;
  if (!esgotou && !baixo) return;
  if ((await ajustes()).alertaEstoque === false) return;
  const titulo = esgotou ? `Esgotou: ${p.name}` : `Estoque baixo: ${p.name}`;
  const texto = esgotou ? 'O produto acabou e aparece como esgotado na loja.' : `Restam ${d} unidade(s) (o aviso é em ${min}).`;
  const opcoes = Array.isArray(p.variants) && p.variants.length ? `<p style="margin:0 0 8px;font-size:14px">${p.variants.map((o) => esc(o.name) + ': <b>' + (o.stock || 0) + '</b>').join(' · ')}</p>` : '';
  await Promise.all([
    enviarEmail(LOJA.emailLoja, (esgotou ? '📦 ' : '⚠️ ') + titulo, layout(esc(titulo), `<p style="margin:0 0 8px;font-size:14px">${esc(texto)}</p>` + opcoes,
      { texto: 'Dar entrada no estoque', url: LOJA.site + 'admin.html#/produtos' })),
    notificarLoja((esgotou ? '📦 ' : '⚠️ ') + titulo, texto, '#/produtos')
  ]);
});

// ---------- rotina de hora em hora: lembretes e cancelamentos ----------
async function rotina(agora) {
  const cfg = await ajustes(), db = admin.firestore();
  const snap = await db.collection('orders').where('status', 'in', ['novo', 'confirmado']).get();
  for (const doc of snap.docs) {
    const o = doc.data();
    if (o.demo || o.saleId) continue;
    const lemb = o.lembretes || {}, criado = ms(o.createdAt), c = o.customer || {};
    const pix = /pix/i.test(o.payment || '');
    // Cancela PIX não pago X dias depois de a loja confirmar (cartão é pago na entrega, então não entra;
    // pedido ainda "Novo" depende da loja, então só gera lembrete).
    const confirmado = ms(o.confirmedAt) || criado;
    if (pix && o.status === 'confirmado' && cfg.autoCancelDays > 0 && confirmado && agora - confirmado >= cfg.autoCancelDays * DIA) {
      await devolver(doc.ref, { status: 'cancelado', autoCancelled: true, cancelledAt: admin.firestore.Timestamp.fromMillis(agora) });
      await enviarEmail(LOJA.emailLoja, `Pedido #${o.code} cancelado automaticamente`, layout(`Pedido #${esc(o.code)} cancelado`,
        `<p style="margin:0 0 8px;font-size:14px">O pagamento de <b>${esc(c.name)}</b> não chegou em ${cfg.autoCancelDays} dia(s). O pedido foi cancelado${o.reserved ? ' e o estoque voltou para a loja' : ''}.</p>` + itensHtml(o),
        { texto: 'Ver na gestão', url: LOJA.site + 'admin.html#/pedidos' }));
      continue;
    }
    // Pedido esperando a loja confirmar há 24 h.
    if (o.status === 'novo' && criado && agora - criado >= 24 * HORA && !lemb.lojaNovo) {
      await enviarEmail(LOJA.emailLoja, `⏰ Pedido #${o.code} esperando confirmação`, layout(`Pedido #${esc(o.code)} esperando você`,
        `<p style="margin:0 0 8px;font-size:14px">O pedido de <b>${esc(c.name)}</b> está como "Novo" há mais de 24 horas.</p>` + itensHtml(o),
        { texto: 'Confirmar na gestão', url: LOJA.site + 'admin.html#/pedidos' }));
      await notificarLoja(`⏰ Pedido #${o.code} esperando confirmação`, `${c.name || 'Cliente'} · há mais de 24 h`, '#/pedidos');
      await doc.ref.update({ 'lembretes.lojaNovo': agora });
    }
    // Lembrete de PIX: cliente em 24 h, loja em 48 h (contando da confirmação).
    const base = ms(o.confirmedAt) || criado;
    if (pix && cfg.lembretePix && o.status === 'confirmado' && base) {
      if (agora - base >= 24 * HORA && !lemb.cliente24) {
        await enviarEmail(c.email, `Lembrete: pagamento do pedido #${o.code}`, layout(`Falta só o pagamento do pedido #${esc(o.code)}`,
          `<p style="margin:0 0 10px;font-size:15px">Olá, ${esc(primeiroNome(c.name))}! Seu pedido está separado esperando o PIX.</p>` + itensHtml(o) +
          `<p style="margin:8px 0;padding:10px 12px;background:#FBF6F3;border-radius:6px;font-size:14px"><b>Chave PIX (${esc(LOJA.pixNome)}):</b> ${esc(LOJA.pixChave)}<br>Depois de pagar, mande o comprovante no nosso WhatsApp.</p>` +
          (cfg.autoCancelDays > 0 ? `<p style="margin:0;font-size:13px;color:#7A4A57">Pedidos sem pagamento são cancelados depois de ${cfg.autoCancelDays} dia(s).</p>` : ''),
          { texto: 'Falar com a loja no WhatsApp', url: 'https://wa.me/' + LOJA.whatsapp + '?text=' + encodeURIComponent('Olá! Sobre o pagamento do pedido #' + o.code + '.') }));
        await doc.ref.update({ 'lembretes.cliente24': agora });
      }
      if (agora - base >= 48 * HORA && !lemb.loja48) {
        await enviarEmail(LOJA.emailLoja, `💸 PIX do pedido #${o.code} não chegou`, layout(`PIX do pedido #${esc(o.code)} não chegou`,
          `<p style="margin:0 0 8px;font-size:14px"><b>${esc(c.name)}</b> · ${esc(c.phone)} confirmou há 2 dias e ainda não pagou. Vale uma mensagem no WhatsApp.</p>` + itensHtml(o),
          { texto: 'Ver na gestão', url: LOJA.site + 'admin.html#/pedidos' }));
        await notificarLoja(`💸 PIX do pedido #${o.code} não chegou`, `${c.name || 'Cliente'} · há 2 dias`, '#/pedidos');
        await doc.ref.update({ 'lembretes.loja48': agora });
      }
    }
  }
}
exports.rotinaHoraria = onSchedule({ schedule: 'every 60 minutes', timeZone: FUSO, ...OPCOES }, () => rotina(Date.now()));

// ---------- resumo diário para a dona (8h) ----------
async function resumo(agora) {
  const cfg = await ajustes();
  if (cfg.resumoDiario === false) return null;
  const db = admin.firestore(), ontem = diaLocal(new Date(agora - DIA));
  const [abertos, devol, vendasOntem, receber, prods] = await Promise.all([
    db.collection('orders').where('status', 'in', ['novo', 'confirmado', 'pago', 'enviado', 'retirar']).get(),
    db.collection('orders').where('return.status', '==', 'solicitada').get(),
    db.collection('sales').where('date', '==', ontem).get(),
    db.collection('sales').where('status', '==', 'pendente').get(),
    db.collection('products').get()
  ]);
  const ped = abertos.docs.map((d) => d.data()).filter((o) => !o.demo);
  const grupo = (st) => ped.filter((o) => o.status === st);
  const total = (list) => list.reduce((t, s) => t + (s.items || []).reduce((a, i) => a + i.qty * i.price, 0) - (s.discount || 0), 0);
  const vOntem = vendasOntem.docs.map((d) => d.data()).filter((s) => !s.demo), aReceber = receber.docs.map((d) => d.data()).filter((s) => !s.demo);
  const baixos = prods.docs.map((d) => d.data()).filter((p) => totalStock(p) <= (p.minStock || 0)).sort((a, b) => totalStock(a) - totalStock(b));
  const devs = devol.docs.map((d) => d.data()).filter((o) => !o.demo);
  const lista = (titulo, list, linha) => list.length ? `<h2 style="margin:16px 0 6px;font:700 16px Georgia,serif">${titulo} (${list.length})</h2><ul style="margin:0;padding-left:18px;font-size:14px">${list.slice(0, 12).map((x) => '<li style="margin:2px 0">' + linha(x) + '</li>').join('')}</ul>` : '';
  const pedLinha = (o) => `#${esc(o.code)} · ${esc((o.customer || {}).name)} · ${brl(o.total)} · ${o.delivery && o.delivery.type === 'pickup' ? 'retirada' : 'entrega'}`;
  const corpo =
    `<p style="margin:0 0 8px;font-size:15px">Ontem (${dataBR(new Date(agora - DIA))}): <b>${vOntem.length} venda(s)</b>, <b>${brl(total(vOntem))}</b>.</p>` +
    (aReceber.length ? `<p style="margin:0 0 8px;font-size:14px">A receber (fiado): <b>${brl(total(aReceber))}</b> em ${aReceber.length} venda(s).</p>` : '') +
    lista('Para confirmar', grupo('novo'), pedLinha) +
    lista('Para separar e entregar', grupo('confirmado').concat(grupo('pago')), (o) => pedLinha(o) + (o.status === 'pago' ? ' · <b>pago</b>' : /pix/i.test(o.payment || '') ? ' · aguardando PIX' : '')) +
    lista('Prontos para retirada', grupo('retirar'), pedLinha) +
    lista('Saíram para entrega', grupo('enviado'), pedLinha) +
    lista('Devoluções para responder', devs, (o) => `#${esc(o.code)} · ${esc((o.customer || {}).name)} · ${esc(o['return'].reason)}`) +
    lista('Estoque baixo', baixos, (p) => `${esc(p.name)}: <b>${totalStock(p)}</b>`) +
    (!ped.length && !devs.length ? '<p style="margin:12px 0 0;font-size:14px">Nenhum pedido em aberto. ☕</p>' : '');
  const html = layout(`Bom dia! Resumo de ${dataBR(new Date(agora))}`, corpo, { texto: 'Abrir a gestão', url: LOJA.site + 'admin.html' });
  await enviarEmail(LOJA.emailLoja, `☀️ Resumo da ${LOJA.nome} — ${dataBR(new Date(agora))}`, html);
  return html;
}
exports.resumoDiario = onSchedule({ schedule: '0 8 * * *', timeZone: FUSO, ...OPCOES }, () => resumo(Date.now()));

// Usado só pelos testes.
if (process.env.JM_TEST) exports._test = { rotina, resumo };
