// Catálogo da loja. Para adicionar um produto, copie um bloco e mude os campos.
// price e promoPrice em reais. stock 0 = esgotado.
// art: desenho provisório até ter foto ('perfume', 'batom', 'conta-gotas', 'pote', 'tubo', 'compacto', 'mascara').
// image: caminho de uma foto real (ex.: 'img/rosa-noturna.webp') — quando preenchido, substitui o desenho.
window.JM_CATEGORIES = [
  { slug: 'perfumes', name: 'Perfumes' },
  { slug: 'maquiagem', name: 'Maquiagem' },
  { slug: 'skincare', name: 'Skincare' }
];

window.JM_PRODUCTS = [
  {
    id: 'p1', slug: 'eau-de-parfum-rosa-noturna', category: 'perfumes', art: 'perfume', tone: '#BB6499',
    name: 'Eau de Parfum Rosa Noturna', price: 249.9, promoPrice: 219.9, stock: 8, featured: true,
    short: 'Floral intenso com fundo amadeirado, para a noite.',
    description: 'Abre com pimenta rosa e bergamota, assenta em rosa e jasmim e termina em sândalo e baunilha. Fixação longa, ideal para jantares e ocasiões especiais.',
    specs: { 'Concentração': 'Eau de Parfum', 'Família olfativa': 'Floral amadeirado', 'Origem': 'Importado' },
    variants: [{ name: '50 ml', extra: -60 }, { name: '100 ml', extra: 0 }]
  },
  {
    id: 'p2', slug: 'eau-de-toilette-brisa-citrica', category: 'perfumes', art: 'perfume', tone: '#D4A843',
    name: 'Eau de Toilette Brisa Cítrica', price: 179.9, stock: 12, featured: true,
    short: 'Fresco e leve, para usar todo dia.',
    description: 'Limão siciliano, laranja e um toque de chá verde. Um perfume limpo, que combina com trabalho, academia e dias quentes.',
    specs: { 'Concentração': 'Eau de Toilette', 'Família olfativa': 'Cítrico', 'Volume': '100 ml' }
  },
  {
    id: 'p3', slug: 'eau-de-parfum-ambar-baunilha', category: 'perfumes', art: 'perfume', tone: '#8B5A3D',
    name: 'Eau de Parfum Âmbar & Baunilha', price: 199.9, stock: 5,
    short: 'Quente, adocicado e marcante.',
    description: 'Âmbar, fava tonka e baunilha bourbon. Um perfume gourmand que deixa rastro, perfeito para o frio.',
    specs: { 'Concentração': 'Eau de Parfum', 'Família olfativa': 'Oriental gourmand', 'Volume': '100 ml' }
  },
  {
    id: 'p4', slug: 'body-splash-flor-de-algodao', category: 'perfumes', art: 'tubo', tone: '#D5A4C2',
    name: 'Body Splash Flor de Algodão', price: 69.9, stock: 20,
    short: 'Perfume suave para o corpo, pós-banho.',
    description: 'Fragrância delicada de algodão e almíscar branco. Pode ser reaplicado ao longo do dia.',
    specs: { 'Tipo': 'Body splash', 'Volume': '250 ml' }
  },
  {
    id: 'm1', slug: 'batom-matte-longa-duracao', category: 'maquiagem', art: 'batom', tone: '#A55385',
    name: 'Batom Matte Longa Duração', price: 39.9, stock: 30, featured: true,
    short: 'Cor intensa que não sai no copo.',
    description: 'Textura cremosa na aplicação que seca matte em poucos segundos. Não resseca e dura até 8 horas.',
    specs: { 'Acabamento': 'Matte', 'Duração': 'Até 8 horas' },
    variants: [{ name: 'Nude Rosado', extra: 0 }, { name: 'Malva', extra: 0 }, { name: 'Vermelho Clássico', extra: 0 }]
  },
  {
    id: 'm2', slug: 'base-liquida-cobertura-media', category: 'maquiagem', art: 'conta-gotas', tone: '#C9967A',
    name: 'Base Líquida Cobertura Média', price: 89.9, stock: 10,
    short: 'Pele uniforme com aspecto natural.',
    description: 'Cobertura média construível, acabamento acetinado e controle de oleosidade. Com FPS 15.',
    specs: { 'Cobertura': 'Média', 'Acabamento': 'Acetinado', 'Volume': '30 ml' },
    variants: [{ name: 'Tom 01 Claro', extra: 0 }, { name: 'Tom 03 Médio', extra: 0 }, { name: 'Tom 05 Escuro', extra: 0 }]
  },
  {
    id: 'm3', slug: 'paleta-de-sombras-12-cores', category: 'maquiagem', art: 'compacto', tone: '#BD829F',
    name: 'Paleta de Sombras 12 Cores', price: 119.9, stock: 0,
    short: 'Tons neutros e rosados, matte e cintilantes.',
    description: 'Doze cores pigmentadas que vão do nude ao vinho, com espelho e pincel duplo.',
    specs: { 'Cores': '12', 'Acabamentos': 'Matte e cintilante' }
  },
  {
    id: 'm4', slug: 'mascara-de-cilios-volume', category: 'maquiagem', art: 'mascara', tone: '#A55385',
    name: 'Máscara de Cílios Volume', price: 54.9, stock: 15,
    short: 'Volume sem empelotar.',
    description: 'Escova de silicone que separa e alonga os fios. Fórmula à prova d’água.',
    specs: { 'Efeito': 'Volume e alongamento', 'À prova d’água': 'Sim' }
  },
  {
    id: 'm5', slug: 'iluminador-compacto', category: 'maquiagem', art: 'compacto', tone: '#E8C9A0',
    name: 'Iluminador Compacto', price: 64.9, promoPrice: 54.9, stock: 3,
    short: 'Brilho dourado e luminoso.',
    description: 'Pó ultrafino que reflete a luz sem marcar textura. Use nas maçãs do rosto, nariz e arco do cupido.',
    specs: { 'Tom': 'Dourado champagne', 'Peso': '8 g' }
  },
  {
    id: 's1', slug: 'serum-vitamina-c-10', category: 'skincare', art: 'conta-gotas', tone: '#D4A843',
    name: 'Sérum Vitamina C 10%', price: 99.9, stock: 9, featured: true,
    short: 'Clareia manchas e dá viço à pele.',
    description: 'Vitamina C estabilizada com ácido ferúlico. Use pela manhã, antes do protetor solar.',
    specs: { 'Ativo': 'Vitamina C 10%', 'Volume': '30 ml', 'Uso': 'Manhã' }
  },
  {
    id: 's2', slug: 'hidratante-facial-acido-hialuronico', category: 'skincare', art: 'pote', tone: '#D5A4C2',
    name: 'Hidratante Facial Ácido Hialurônico', price: 84.9, stock: 11,
    short: 'Hidratação profunda, toque leve.',
    description: 'Gel-creme que hidrata por 48 horas sem pesar. Bom para todos os tipos de pele.',
    specs: { 'Ativo': 'Ácido hialurônico', 'Volume': '50 ml', 'Textura': 'Gel-creme' }
  },
  {
    id: 's3', slug: 'protetor-solar-fps-50-toque-seco', category: 'skincare', art: 'tubo', tone: '#F2DDE6',
    name: 'Protetor Solar FPS 50 Toque Seco', price: 74.9, stock: 14,
    short: 'Proteção alta que não deixa a pele oleosa.',
    description: 'FPS 50 e PPD 20, acabamento seco e invisível. Pode ser usado como base para a maquiagem.',
    specs: { 'Proteção': 'FPS 50 / PPD 20', 'Peso': '50 g' }
  },
  {
    id: 's4', slug: 'agua-micelar-400ml', category: 'skincare', art: 'tubo', tone: '#BD829F',
    name: 'Água Micelar 400 ml', price: 49.9, stock: 18,
    short: 'Remove maquiagem e limpa sem esfregar.',
    description: 'Limpa, demaquila e acalma em um passo. Sem álcool e sem perfume.',
    specs: { 'Volume': '400 ml', 'Sem álcool': 'Sim' }
  }
];
