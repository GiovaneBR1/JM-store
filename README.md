# JM Store

Loja de cosméticos importados. O cliente escolhe os produtos, informa a entrega e o pedido abre pronto no WhatsApp da loja para confirmar e pagar no PIX.

Site: https://jmstoresite.netlify.app/ (hospedado no Netlify; veja "Hospedagem")

## Hospedagem (Netlify)

O site é estático e fica no Netlify, em https://jmstoresite.netlify.app (configuração em `netlify.toml`). Cada merge no `main` publica sozinho.

**Conectar (uma vez):**
1. Em https://app.netlify.com, entre com o GitHub → **Add new site → Import an existing project → GitHub** → repositório `JM-store`, branch `main`. Build command e Publish directory já vêm do `netlify.toml` (deixe como estão) → **Deploy**.
2. **Site configuration → Change site name** → `jmstoresite` (o endereço vira `jmstoresite.netlify.app`).
3. Firebase → Authentication → Configurações → **Domínios autorizados** → adicionar `jmstoresite.netlify.app` (sem isso, o login não funciona).
4. Google Cloud → Segurança → reCAPTCHA (Fraud Defense) → a chave do site → adicionar o domínio `jmstoresite.netlify.app`.
5. Se restringiu a chave do Firebase (APIs e serviços → Credenciais), adicionar `https://jmstoresite.netlify.app/*`.
6. Cloud Shell: `cd JM-store && git pull` e o comando de `deploy` (os links dos e-mails passam para o endereço novo).

O endereço antigo (`giovanebr1.github.io/JM-store`) leva sozinho para o novo assim que o Netlify estiver no ar. Depois de um tempo, dá para desligar o GitHub Pages (Settings → Pages).

**Domínio próprio, se um dia comprar:** Netlify → Domain management → Add a domain, e seguir as instruções de DNS no registro.br. Depois, adicionar o domínio nos mesmos lugares dos passos 3 a 5.

## Login (clientes e admin)

Qualquer pessoa pode ver os produtos. Para **colocar na sacola e finalizar o pedido** é preciso entrar na conta, com e-mail e senha ou com o Google.
A **gestão** (`admin.html`) só abre para as contas marcadas como admin.

O login usa o **Firebase**, que é gratuito para este uso. Enquanto ele não estiver configurado, o site funciona como antes: sem login, e a gestão aberta, com os dados só no navegador.

### Como ativar (uma vez só, uns 15 minutos)

1. Entre em https://console.firebase.google.com com a conta Google da loja e clique em **Criar projeto** (pode desligar o Google Analytics).
2. **Authentication** → **Vamos começar** → em *Método de login*, ative **E-mail/senha** e **Google**.
3. Ainda em Authentication → **Configurações** → **Domínios autorizados** → **Adicionar domínio**: `jmstoresite.netlify.app` (e o domínio próprio, quando houver).
4. **Firestore Database** → **Criar banco de dados** → escolha a região `southamerica-east1 (São Paulo)` → modo de **produção**.
5. No Firestore, aba **Regras**: apague o que estiver lá, cole o conteúdo do arquivo `firestore.rules` deste repositório e clique em **Publicar**.
6. Engrenagem ⚙ → **Configurações do projeto** → em *Seus apps*, clique no ícone **</>** (Web), dê um nome e registre. Copie `apiKey`, `authDomain`, `projectId` e `appId` para `js/firebase-config.js`, depois faça commit e push.
7. **Tornar-se admin:** abra `admin.html` no site e crie sua conta. Vai aparecer "Sem acesso" com um código (o seu UID). No Firestore, clique em **Iniciar coleção**, use o nome `admins` e, como **ID do documento**, cole esse código. Adicione qualquer campo, por exemplo `nome` = `Dona da loja`, e salve. Depois é só recarregar a página.

Para dar acesso a outra pessoa, repita o passo 7 com a conta dela. Para tirar o acesso, apague o documento dela em `admins`.

> Os valores de `firebase-config.js` não são secretos: eles aparecem para qualquer visitante do site. Quem protege os dados são as regras do passo 5, conferidas nos servidores do Google. Um cliente não consegue ler a gestão nem se tornar admin.

## Avisos de pedido (e-mail e notificação)

O que é enviado (pedidos de demonstração não enviam nada):
- **Pedido novo:** e-mail para a loja (jmstore403@gmail.com), notificação nos aparelhos da gestão que ativaram os avisos e e-mail "Recebemos seu pedido" para o cliente (com a chave PIX quando ele escolhe PIX).
- **Mudança de status** (confirmado, pago, saiu para entrega, pronto para retirada, finalizado, cancelado): e-mail para o cliente.
- **Pedido de devolução:** e-mail e notificação para a loja; quando a loja aprova, recusa ou conclui, e-mail para o cliente.

Funciona com as funções da pasta `functions/` (precisam do plano Blaze do Firebase). WhatsApp, chave PIX e endereço de retirada dos e-mails vêm de Gestão → Ajustes → Dados da loja (os valores de `functions/loja.js` são só o padrão).

### Publicar as funções e as regras (Cloud Shell, no navegador)
1. Abra https://shell.cloud.google.com com a conta Google dona do projeto Firebase.
2. Cole um comando por vez:
   ```bash
   git clone https://github.com/GiovaneBR1/JM-store.git && cd JM-store
   ```
   ```bash
   npm ci --prefix functions
   ```
   ```bash
   npx firebase-tools@15.34.1 login --no-localhost
   ```
   ```bash
   npx firebase-tools@15.34.1 functions:secrets:set GMAIL_APP_PASSWORD
   ```
   (cole a senha de app do Gmail da loja, sem espaços; ela não aparece na tela)
   ```bash
   npx firebase-tools@15.34.1 deploy --only functions,firestore:rules
   ```
3. Se perguntar sobre "cleanup policy", responda **Y** e **1** dia (evita custo de armazenamento).
4. Na primeira publicação o Google ativa alguns serviços; se aparecer um erro de permissão do "Eventarc", espere 5 minutos e rode o último comando de novo.

Para atualizar depois (mudou `functions/` ou `firestore.rules`): no Cloud Shell, `cd JM-store && git pull` e rode de novo o comando de `deploy`.

### Automações (Pedidos → Automações)
- **Confirmar pedidos sozinho** (começa desligado): com tudo em estoque, o pedido vira "Confirmado", reserva o estoque e o cliente recebe o e-mail. Se faltar algo, fica "Novo" e o e-mail da dona avisa.
- **Lembrete do PIX:** 24 h depois de confirmado sem pagamento, o cliente recebe a chave de novo; em 48 h a dona é avisada.
- **Cancelar PIX não pago** depois de X dias (padrão 3): o estoque volta e todos são avisados. Cartão e pedidos "Novo" não são cancelados.
- **Alerta de estoque baixo** e **resumo diário às 8h** por e-mail.
- Confirmar um pedido (à mão ou sozinho) reserva o estoque; cancelar devolve; lançar a venda de um pedido reservado não baixa de novo.

### Notificações no celular da gestão
1. No console do Firebase: ⚙ Configurações do projeto → **Cloud Messaging** → Configuração da Web → **Certificados push da Web** → Gerar par de chaves. Copie a chave e coloque em `vapidKey` no `js/firebase-config.js` (é pública).
2. No celular da dona: abra a gestão, **adicione à tela inicial** (no iPhone é obrigatório; no Android é opcional), abra por lá, vá em **Pedidos** e toque em **Ativar avisos neste aparelho**.

## Segurança

**Já está ativo:**
- **Regras do banco** (`firestore.rules`): cliente só vê os próprios pedidos; custo, vendas, clientes e ajustes são só do admin. Na criação de um pedido, só são aceitos os campos que o site envia: um pedido não pode chegar como "reservado", "pago", "venda lançada" ou "demonstração".
- **Conferência dos pedidos no servidor** (`functions/conferir.js`): cada pedido novo é recalculado com os preços do cadastro, o cupom de verdade e o frete da região. Se algo não bater (ex.: preço de R$ 0,01 ou cupom inventado), o pedido **não é confirmado sozinho**, aparece com um alerta vermelho em Pedidos e a loja recebe e-mail e notificação com o motivo e o total certo.

### Proteção contra robôs (App Check), ativar antes de divulgar
Faz o banco aceitar só acessos vindos do site de verdade. Usa o **reCAPTCHA Enterprise**, que no Google Cloud aparece como **Fraud Defense** (o reCAPTCHA v3 "clássico" não é mais aceito pelo Firebase). Grátis até 10 mil verificações por mês.
1. No Google Cloud (mesmo projeto do Firebase): menu → **Segurança → reCAPTCHA** (ou "Fraud Defense") → ative a API se pedir → **Criar chave**: plataforma **Site**, domínios `jmstoresite.netlify.app` (e o domínio próprio, quando houver), **sem** o desafio de caixa de seleção (pontuação). Copie o **ID da chave**.
2. Console do Firebase → **App Check** → aba **Apps** → no app da Web, **reCAPTCHA Enterprise** → cole o ID da chave → em "Vida útil do token", use **1 dia** → Salvar. Não há chave secreta.
3. Coloque o ID da chave em `appCheckKey` no `js/firebase-config.js` (é público), faça o merge e espere o site atualizar.
4. Use o site normalmente por 1 ou 2 dias e veja em **App Check → APIs → Cloud Firestore** se quase todos os acessos aparecem como **verificados**.
5. Só então clique em **Aplicar (Enforce)** no Cloud Firestore (e, se quiser, no Authentication). A partir daí, acessos de fora do site são recusados.

Se trocar o domínio do site, adicione o domínio novo na chave (passo 1) antes de trocar.

### Cuidados com as contas (o maior risco é alguém entrar numa conta)
- **Verificação em duas etapas** na conta Google da dona (admin), no Gmail da loja e na conta dona do projeto Firebase.
- Colocar a dona como **proprietária** do projeto no Firebase (Configurações do projeto → Usuários e permissões) e a **cobrança** no cartão dela.
- **Alerta de orçamento** no Google Cloud (Faturamento → Orçamentos e alertas), por exemplo R$ 10 por mês.
- **Backup** em Gestão → Ajustes → Baixar backup, pelo menos uma vez por mês.

## Gestão da loja

Abra `admin.html` (https://jmstoresite.netlify.app/admin.html) ou use o menu da conta → **Painel de gestão**.

- **Painel:** escolha o período (este mês, mês passado, últimos 3 meses, este ano, ano passado ou meses à escolha) e compare com o período anterior. Mostra faturamento, lucro, vendas, ticket médio, meta do mês, gráfico de faturamento e lucro, categorias, variação de preço, mais vendidos, melhores clientes, produtos parados, formas de pagamento e site x balcão.
- **Exportar relatório:** no Painel, **Exportar planilha** baixa um .xlsx do período (Resumo, Vendas, Itens, Categorias, Produtos, Clientes, Pagamentos) e **Exportar PDF** abre o relatório para salvar como PDF ou imprimir.
- **Pedidos:** todo pedido finalizado no site fica salvo aqui, mesmo que o cliente não envie a mensagem do WhatsApp. Um aviso aparece quando chega pedido novo. Mude o status (confirmado, pago, saiu para entrega, entregue…) e o cliente acompanha ao vivo em **Meus pedidos**. O botão "Lançar venda" transforma o pedido em venda e baixa o estoque. Ao marcar o pedido como **Finalizado**, a venda é lançada como paga (se ainda não foi) e o cliente vê "Compra finalizada". Marcar a venda como paga na aba Vendas também atualiza o pedido.
- **Pedidos personalizados:** na loja, "Não achou o que procura?" (página inicial, busca sem resultado e rodapé) abre um formulário: o cliente descreve o produto e informa pelo menos um entre marca e modelo/código, link ou foto de referência. O pedido abre pronto no WhatsApp e fica salvo com a foto. Na gestão, em Pedidos → filtro "Personalizados": veja a foto, responda com preço e prazo (o cliente vê em Meus pedidos e recebe por e-mail) e acompanhe o status (orçamento enviado, encomendado, chegou, finalizado ou não encontrado). A loja recebe e-mail com a foto e notificação no celular.
- **Devoluções:** até 7 dias depois de finalizada a compra, o cliente pode pedir devolução em Meus pedidos (motivo e detalhes). O pedido aparece com destaque em Pedidos → filtro "Devoluções": aprove ou recuse com uma mensagem. Quando o produto voltar e o reembolso for feito, clique em "Produto recebido e reembolso feito" para desfazer a venda e devolver o estoque.
- **Vendas:** registre cada venda (itens, cliente, forma de pagamento, desconto, pago ou a receber). O estoque baixa sozinho; excluir a venda devolve os produtos.
- **Produtos:** cadastro com foto (da galeria ou da câmera), conteúdo da embalagem (ml, g…), custo, preço, preço promocional, descrições, destaque e estoque, além de entrada de mercadoria. Produtos com **opções** (tamanho, cor, tom) têm preço e estoque por opção. "Salvar e cadastrar outro" e "Duplicar" agilizam o cadastro. A lista mostra quais produtos estão **parados** (sem venda há mais de 30 dias). Tudo o que você salva aparece na loja na hora (o custo nunca é mostrado).
- **Remover fundo da foto (opcional):** no cadastro, marque "Remover fundo e usar o fundo da loja". Roda no próprio navegador, sem custo; na primeira vez baixa o modelo de IA e pode levar até 1 minuto. Funciona melhor em produtos opacos; em vidro transparente, o fundo antigo pode aparecer através do frasco. Usa a biblioteca @imgly/background-removal (licença AGPL, por isso o código do site é aberto).
- **Categorias:** crie, renomeie, ordene e exclua (só sem produtos). Elas viram os filtros da loja. Marque até 3 para a vitrine da página inicial.
- **Cupons:** crie códigos de desconto em porcentagem ou valor fixo, com pedido mínimo opcional. Dá para pausar e reativar.
- **Clientes:** contato com link para o WhatsApp, total gasto e quanto cada um deve.
- **Excluir vários de uma vez:** em Produtos, Categorias, Clientes, Vendas, Cupons e Pedidos (inclusive os personalizados), marque as caixinhas (ou "selecionar todos") e use **Excluir selecionados**. Vale a mesma regra da exclusão de um item só: venda excluída devolve o estoque, cliente excluído deixa as vendas como "Balcão", categoria com produtos não é apagada e pedido com estoque reservado devolve a reserva.
- **Ajustes → Dados da loja:** a dona preenche WhatsApp, cidade, chave PIX e titular, endereço e horário de retirada, Instagram e as regiões de entrega (bairros, frete e prazo). Tudo aparece na hora na loja, no fechamento do pedido, nos e-mails e na política de privacidade. Sem nenhuma região, a loja oferece só retirada. Enquanto faltar algo, o Painel avisa.
- **Backup:** com o login ativo, os dados ficam na nuvem e aparecem em qualquer aparelho do admin, atualizando ao vivo. Mesmo assim, baixe um backup de vez em quando.
- **Treino e lançamento** (aba Ajustes): **Carregar demonstração** preenche clientes, vendas, pedidos e um cupom fictícios para conhecer a gestão (o estoque não muda); **Tirar demonstração** apaga só esses dados. **Preparar para o lançamento** apaga produtos, vendas, pedidos e clientes de teste (você escolhe) para começar as vendas de verdade; depois disso a loja nunca mais mostra os produtos de exemplo.

## Como editar

- **WhatsApp, PIX, endereço de retirada e frete por bairro:** na gestão, em **Ajustes → Dados da loja** (o `js/config.js` guarda só os valores padrão)
- **Política de privacidade:** página `#/privacidade` da loja (texto em `js/app.js`, função `viewPrivacy`), com link no rodapé e na tela de login. É um modelo baseado na LGPD; vale uma revisão de um advogado se a loja crescer.
- **Prévia do link** (WhatsApp, Instagram, Facebook): tags `og:` no `index.html` e a imagem `img/og.png`. Se o endereço do site mudar, troque as URLs dessas tags.
- **WhatsApp Business:** textos prontos de saudação, ausência, respostas rápidas e etiquetas em `docs/whatsapp-business.md`.
- **Produtos e categorias:** pela gestão. O arquivo `js/products.js` é só o catálogo inicial da primeira abertura da gestão (e da loja sem login configurado).
- **Regras do Firestore:** sempre que `firestore.rules` mudar, cole o conteúdo de novo no console (Firestore → Regras → Publicar).

Depois de editar, faça commit e push; o GitHub Pages atualiza o site em 1 a 2 minutos. Se mudar algum arquivo de `css/` ou `js/`, troque também o `?v=...` nos links de `index.html` e `admin.html` (por exemplo, para a data do dia), para que os navegadores baixem a versão nova na hora.

## Testar no computador

```bash
python -m http.server 5173
```

Abra http://localhost:5173
