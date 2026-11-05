# Próximas mudanças da JM Store

Lista do que já foi combinado e do que ainda está em aberto. Nada daqui foi aplicado no site ainda: a ideia é implementar tudo de uma vez quando a lista estiver fechada.

## Decidido

### Textos da página inicial
- **Título:** "Perfumes, maquiagens e muito mais." (igual à bio do Instagram, só a primeira letra maiúscula).
- **Frase abaixo do título:** "Entregamos na sua casa ou você retira na loja. Pague no PIX ou no cartão."
- **Rodapé → Pagamento:** atualizar para falar de PIX e cartão.

### Pagamento
- Formas de pagamento no fechamento do pedido: **PIX** e **Cartão na entrega (crédito ou débito)**, porque a loja tem maquininha.

### Categorias
- As categorias deixam de ser fixas no código e passam a ser cadastradas na gestão.
- No cadastro do produto: escolher uma categoria existente ou **"+ Nova categoria"**.
- **Gestão → Categorias:** renomear, mudar a ordem e excluir. Uma categoria com produtos só pode ser excluída depois que esses produtos forem movidos.
- **Filtros na loja:** no celular, um botão "Filtrar: Todos ▾" que abre a lista; no computador, as categorias principais como botões e o resto em "Mais ▾".
- **Vitrine (opção c):** mostra as **3 categorias que a dona marcar como destaque**. Perfumes, Maquiagem e Skincare mantêm o desenho atual; uma categoria nova aparece no nicho com a **foto de um produto** dela.

### Preparar para o lançamento
- Com a nuvem ativa, a loja **nunca** volta a mostrar os produtos de exemplo. Sem produtos, mostra "Novidades chegando em breve".
- Botão na gestão **"Preparar para o lançamento"**: apaga produtos de exemplo, vendas, pedidos e clientes de teste (com opção de manter cupons e categorias).
- Bom para a apresentação e o treinamento da dona: primeiro usa com dados de exemplo, depois zera.

## Em aberto

- [ ] **Texto da seção "Nossos produtos":** a sugestão não chegou na conversa.
- [ ] **"Combinar pelo WhatsApp" como forma de pagamento:** manter ou tirar?
- [ ] **Fotos dos produtos:** como deixar com cara comercial sem dar muito trabalho (ver ideias abaixo).
- [ ] **Opções e medidas do produto** (50 ml / 100 ml, cores, g, mg…): definir o formato (ver proposta abaixo).
- [ ] **Facilidades de cadastro:** planilha, edição direto na tabela, "Salvar e cadastrar outro", "Duplicar", foto pela câmera — escolher quais entram.
- [ ] **Dados de demonstração:** botão que preenche a gestão com clientes, pedidos, vendas e cupons fictícios, para testar e treinar (e depois "Preparar para o lançamento" zera tudo).

- [ ] **Novo Painel financeiro** (protótipo: https://claude.ai/artifact/H9Pjm7ZQLC4VJCTHMRHxvF): escolha de período (este mês, mês passado, últimos 3 meses, este ano, ano passado, meses à escolha) com comparação automática; faturamento, lucro, vendas e ticket médio com variação; gráfico de faturamento e lucro no tempo (com versão em tabela); categorias com faturamento, lucro, margem e crescimento; variação de preço por categoria; mais vendidos; formas de pagamento; site x balcão.
  - Para funcionar com dados reais: gravar a **categoria** em cada item vendido (hoje só fica o produto) e o **canal** da venda (site ou balcão). O preço e o custo de cada venda já são gravados.

### Ideias para as fotos
1. **Fundo removido no próprio site:** ao enviar a foto, o fundo é retirado automaticamente e o produto é colocado num fundo padrão da loja (nude/vinho claro), com sombra suave. Todas as fotos ficam com o mesmo padrão. Existem bibliotecas gratuitas que fazem isso no navegador, sem custo por foto (conferir a licença antes de usar).
2. **App no celular antes de enviar** (Photoroom, Canva, CapCut): fazem fundo de estúdio com IA. Resultado bonito, mas é um passo a mais e as versões completas são pagas.
3. **IA generativa integrada ao site** (cria cenário, luz, reflexo): é o resultado mais "comercial", mas precisa de servidor e tem custo por imagem.
4. **Dica de foto para a dona:** luz natural de janela, fundo liso claro, produto no centro, sempre o mesmo ângulo. Ajuda qualquer uma das opções acima.

### Proposta para opções e medidas
- **Conteúdo** do produto: quantidade + unidade (ml, L, g, kg, mg, un.). Ex.: "100 ml", "30 g".
- **Opções** (quando houver): cada uma com **nome** (ex.: "50 ml", "Malva", "Tom 03"), **preço** e **estoque próprios**.
- Na loja, o cliente escolhe a opção e vê o preço e o estoque dela; a venda baixa o estoque da opção certa.
