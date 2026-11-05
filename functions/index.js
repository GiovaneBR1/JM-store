// Avisos de pedidos da JM Store (rodam nos servidores do Google, plano Blaze do Firebase).
// - Pedido novo: e-mail para a loja, notificação no celular da gestão e e-mail "Recebemos seu pedido" para o cliente.
// - Mudança de status: e-mail para o cliente.
// - Pedido de devolução: e-mail e notificação para a loja; resposta da loja: e-mail para o cliente.
// Pedidos de demonstração (demo: true) não disparam nada.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
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

function emailLojaPedidoNovo(o) {
  const c = o.customer || {};
  return layout(`Novo pedido #${esc(o.code)}`,
    `<p style="margin:0 0 8px;font-size:14px"><b>${esc(c.name)}</b> · ${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</p>` +
    itensHtml(o) + entregaHtml(o) +
    `<p style="margin:0 0 8px;font-size:14px"><b>Pagamento:</b> ${esc(o.payment)}</p>` +
    (o.notes ? `<p style="margin:0 0 8px;font-size:14px"><b>Observações:</b> ${esc(o.notes)}</p>` : ''),
    { texto: 'Abrir o pedido na gestão', url: LOJA.site + 'admin.html#/pedidos' });
}
function emailClientePedidoRecebido(o) {
  const pix = /pix/i.test(o.payment || '');
  return layout(`Recebemos seu pedido #${esc(o.code)}`,
    `<p style="margin:0 0 10px;font-size:15px">Olá, ${esc(primeiroNome(o.customer && o.customer.name))}! Obrigada por comprar na ${esc(LOJA.nome)}. Vamos conferir o estoque e confirmar seu pedido em breve.</p>` +
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
  const c = o.customer || {};
  await Promise.all([
    enviarEmail(LOJA.emailLoja, `🛍️ Novo pedido #${o.code} — ${c.name || 'cliente'} — ${brl(o.total)}`, emailLojaPedidoNovo(o)),
    enviarEmail(c.email, `Recebemos seu pedido #${o.code} — ${LOJA.nome}`, emailClientePedidoRecebido(o)),
    notificarLoja(`🛍️ Novo pedido #${o.code}`, `${c.name || 'Cliente'} · ${brl(o.total)} · ${o.payment || ''}`, '#/pedidos')
  ]);
});

exports.pedidoAtualizado = onDocumentUpdated({ document: 'orders/{id}', ...OPCOES }, async (event) => {
  const antes = event.data.before.data(), o = event.data.after.data();
  if (!o || o.demo) return;
  const email = o.customer && o.customer.email, tarefas = [];
  if (antes.status !== o.status && STATUS[o.status]) {
    const [assunto, texto] = STATUS[o.status];
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
