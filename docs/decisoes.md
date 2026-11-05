# Próximas mudanças da JM Store

Lista do que já foi combinado e do que ainda está em aberto. Nada daqui foi aplicado no site ainda: a ideia é implementar tudo de uma vez quando a lista estiver fechada.

## Status

**Implementado** (branch `claude/bold-cray-h2uz39`): textos, pagamento, categorias e vitrine, opções e medidas, facilidades de cadastro, remoção de fundo opcional, painel novo com exportação em planilha e PDF, dados de demonstração e "Preparar para o lançamento".
**Avisos por e-mail e notificação:** implementados em `functions/` (e-mails testados com o Gmail simulado). Falta publicar no Cloud Shell (passo a passo no README) e gerar a chave das notificações.
**Gestão:** agora em Vinho & Âmbar, com modo claro e escuro (mesmo botão ◐ da loja).
**Antes do lançamento:** ver `docs/antes-de-lancar.md` (chave PIX, frete, endereço, produtos…).

## Decidido

### Textos da página inicial
- **Título:** "Perfumes, maquiagens e muito mais." (igual à bio do Instagram, só a primeira letra maiúscula).
- **Frase abaixo do título:** "Entregamos na sua casa ou você retira na loja. Pague no PIX ou no cartão."
- **Rodapé → Pagamento:** atualizar para falar de PIX e cartão.
- **Seção "Nossos produtos":** tirar o texto pequeno abaixo do título ("Perfumes, maquiagem e skincare."). O título fica.

### Pagamento
- Formas de pagamento no fechamento do pedido: **PIX** e **Cartão (na entrega ou retirada)**, porque a loja tem maquininha. Sai o "Combinar pelo WhatsApp".
- Cartão pago dentro do site fica para a v2 (gateway).

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

### Painel financeiro e relatórios
Protótipo: https://claude.ai/artifact/H9Pjm7ZQLC4VJCTHMRHxvF

- escolha de período (este mês, mês passado, últimos 3 meses, este ano, ano passado, meses à escolha) com comparação automática; faturamento, lucro, vendas e ticket médio com variação; gráfico de faturamento e lucro no tempo (com versão em tabela); categorias com faturamento, lucro, margem e crescimento; variação de preço por categoria; mais vendidos; formas de pagamento; site x balcão.
  - Também no protótipo: **meta do mês** (andamento, projeção e onde deveria estar hoje), **melhores clientes**, **produtos parados** (sem venda há mais de 30 dias, com o valor parado em estoque) — com a situação aparecendo também na tela de Produtos — e o botão **Exportar relatório**.
  - **Relatório exportado (.xlsx):** modelo em `docs/relatorio-modelo.xlsx` (dados simulados de outubro de 2026), com as abas Resumo, Vendas, Itens, Categorias, Produtos, Clientes e Pagamentos. Tudo por fórmula: trocar as datas, a meta ou o prazo de "parado" no Resumo recalcula a planilha.
  - **Relatório em PDF:** modelo em `docs/relatorio-modelo.pdf` (mesmos dados da planilha), em 2 páginas A4: números do mês com comparação, meta, gráfico diário de faturamento e lucro, destaques escritos automaticamente, categorias, mais vendidos, melhores clientes, pagamentos e canal, produtos parados e valores a receber. Pensado para mandar no WhatsApp ou imprimir; na gestão, sairia pelo botão Exportar (escolhendo PDF ou planilha).
  - Para funcionar com dados reais: gravar a **categoria** em cada item vendido (hoje só fica o produto) e o **canal** da venda (site ou balcão). O preço e o custo de cada venda já são gravados.

### Produtos: opções, medidas e cadastro
- **Conteúdo** do produto: quantidade + unidade (ml, L, g, kg, mg, un.). Ex.: "100 ml", "30 g".
- **Opções** (quando houver): cada uma com **nome** (ex.: "50 ml", "Malva", "Tom 03"), **preço** e **estoque próprios**. Na loja, o cliente escolhe a opção e vê o preço dela; opção esgotada aparece desabilitada; a venda baixa o estoque da opção certa.
- **Facilidades de cadastro:** "Salvar e cadastrar outro" (mantém a categoria), "Duplicar" e foto pela câmera do celular. Importação por planilha fica de fora por enquanto; uma pessoa será responsável pelo cadastro.
- **Fotos:** opção **"Remover fundo"** no cadastro, desligável (ex.: fotos oficiais da marca), que recorta o produto e coloca no fundo padrão da loja, com antes/depois para comparar. Grátis, roda no navegador. **Antes de implementar: testar com 2–3 fotos reais** (um perfume de vidro e algo opaco), porque vidro transparente é o caso mais difícil.

### Avisos de pedido (sem WhatsApp por enquanto)
- **Dona:** notificação no celular (gestão instalada como app) para pedido novo e pedido de devolução; e-mail opcional como segunda via.
- **Cliente:** e-mail de confirmação do pedido (itens, total, chave PIX, link para Meus pedidos) e a cada mudança de status; "Meus pedidos" ao vivo continua.
- **Pré-requisitos:** ativar o plano **Blaze** no Firebase (cartão de quem for dono do projeto; custo esperado R$ 0 no volume da loja, com alerta de gastos configurado) e um **e-mail da loja** para enviar as mensagens, além do e-mail em que a dona quer receber os avisos.
- WhatsApp automático fica para a v2, usando a mesma estrutura.

### Dados de demonstração
- Botão na gestão que preenche clientes, pedidos, vendas e cupons fictícios para testar e treinar; o "Preparar para o lançamento" apaga tudo depois.

## Em aberto

- [ ] **Testar a remoção de fundo com fotos reais da loja** (no teste com imagem simulada: 31 s na primeira vez, recorte bom em frasco opaco; vidro transparente deixa o fundo antigo aparecer por dentro).
- [ ] **Publicar as funções de aviso** no Cloud Shell e **gerar a chave das notificações** (VAPID).

### Ideias para as fotos
1. **Fundo removido no próprio site:** ao enviar a foto, o fundo é retirado automaticamente e o produto é colocado num fundo padrão da loja (nude/vinho claro), com sombra suave. Todas as fotos ficam com o mesmo padrão. Existem bibliotecas gratuitas que fazem isso no navegador, sem custo por foto (conferir a licença antes de usar).
2. **App no celular antes de enviar** (Photoroom, Canva, CapCut): fazem fundo de estúdio com IA. Resultado bonito, mas é um passo a mais e as versões completas são pagas.
3. **IA generativa integrada ao site** (cria cenário, luz, reflexo): é o resultado mais "comercial", mas precisa de servidor e tem custo por imagem.
4. **Dica de foto para a dona:** luz natural de janela, fundo liso claro, produto no centro, sempre o mesmo ângulo. Ajuda qualquer uma das opções acima.

## Ideias para a v2

Não entram na v1. Ficam anotadas para depois que a loja estiver vendendo pelo site por alguns meses.

- **Confirmação automática do PIX:** o site gera um QR Code de PIX para cada pedido, com o valor e o número do pedido; quando o cliente paga, o pedido vira "Pago" sozinho. Mais simples e barato que Open Finance para o mesmo objetivo. Depende de CNPJ e do banco/plataforma que a loja usar (perguntar à dona).
- **Pagamento online completo** (PIX e cartão no site) por um gateway, se as vendas online crescerem.
- **Mensagens automáticas no WhatsApp** (API oficial da Meta) a cada mudança de status do pedido. Custa centavos por mensagem de utilidade (conferir a tabela atual da Meta); precisa de número para a API, conta Meta Business verificada, modelos aprovados e autorização do cliente. Dá para testar antes com o número de teste gratuito da Meta.
- As três precisam de uma parte em servidor (Cloud Functions, plano Blaze do Firebase com cartão cadastrado). A estrutura de pedidos com status da v1 já serve de base.
- **Open Finance:** só faria sentido para conciliar várias contas ou crédito; não é prioridade.
