// Configuração da loja — edite estes valores antes de divulgar o site.
window.JM_CONFIG = {
  storeName: 'JM Store',

  // Número do WhatsApp que recebe os pedidos: 55 + DDD + número, só dígitos.
  whatsapp: '5500000000000',

  // Chave PIX mostrada no fim do pedido.
  pixKey: 'sua-chave-pix@email.com',
  pixName: 'Nome do titular',

  city: 'Sua Cidade',
  pickupAddress: 'Rua Exemplo, 123 — Centro (combine o horário pelo WhatsApp)',

  // Frete fixo por região. "fee" em reais. Adicione ou remova regiões à vontade.
  shippingZones: [
    { id: 'centro', name: 'Centro', neighborhoods: ['Centro', 'Vila Nova'], fee: 8, days: '1 dia útil' },
    { id: 'norte', name: 'Zona Norte', neighborhoods: ['Jardim América', 'Santa Rita'], fee: 12, days: '1 a 2 dias úteis' },
    { id: 'sul', name: 'Zona Sul', neighborhoods: ['Jardim das Flores', 'Parque Sul'], fee: 12, days: '1 a 2 dias úteis' },
    { id: 'afastados', name: 'Bairros afastados', neighborhoods: ['Distrito Industrial', 'Chácaras'], fee: 18, days: '2 a 3 dias úteis' }
  ]
};
