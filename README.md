# JM Store

Loja de cosméticos importados. O cliente escolhe os produtos, informa a entrega e o pedido abre pronto no WhatsApp da loja para confirmar e pagar no PIX.

Site: https://giovanebr1.github.io/JM-store/

## Login (clientes e admin)

Qualquer pessoa pode ver os produtos. Para **colocar na sacola e finalizar o pedido** é preciso entrar na conta, com e-mail e senha ou com o Google.
A **gestão** (`admin.html`) só abre para as contas marcadas como admin.

O login usa o **Firebase**, que é gratuito para este uso. Enquanto ele não estiver configurado, o site funciona como antes: sem login, e a gestão aberta, com os dados só no navegador.

### Como ativar (uma vez só, uns 15 minutos)

1. Entre em https://console.firebase.google.com com a conta Google da loja e clique em **Criar projeto** (pode desligar o Google Analytics).
2. **Authentication** → **Vamos começar** → em *Método de login*, ative **E-mail/senha** e **Google**.
3. Ainda em Authentication → **Configurações** → **Domínios autorizados** → **Adicionar domínio**: `giovanebr1.github.io`.
4. **Firestore Database** → **Criar banco de dados** → escolha a região `southamerica-east1 (São Paulo)` → modo de **produção**.
5. No Firestore, aba **Regras**: apague o que estiver lá, cole o conteúdo do arquivo `firestore.rules` deste repositório e clique em **Publicar**.
6. Engrenagem ⚙ → **Configurações do projeto** → em *Seus apps*, clique no ícone **</>** (Web), dê um nome e registre. Copie `apiKey`, `authDomain`, `projectId` e `appId` para `js/firebase-config.js`, depois faça commit e push.
7. **Tornar-se admin:** abra `admin.html` no site e crie sua conta. Vai aparecer "Sem acesso" com um código (o seu UID). No Firestore, clique em **Iniciar coleção**, use o nome `admins` e, como **ID do documento**, cole esse código. Adicione qualquer campo, por exemplo `nome` = `Dona da loja`, e salve. Depois é só recarregar a página.

Para dar acesso a outra pessoa, repita o passo 7 com a conta dela. Para tirar o acesso, apague o documento dela em `admins`.

> Os valores de `firebase-config.js` não são secretos: eles aparecem para qualquer visitante do site. Quem protege os dados são as regras do passo 5, conferidas nos servidores do Google. Um cliente não consegue ler a gestão nem se tornar admin.

## Gestão da loja

Abra `admin.html` (https://giovanebr1.github.io/JM-store/admin.html) ou use o menu da conta → **Painel de gestão**.

- **Painel:** escolha o período (este mês, mês passado, últimos 3 meses, este ano, ano passado ou meses à escolha) e compare com o período anterior. Mostra faturamento, lucro, vendas, ticket médio, meta do mês, gráfico de faturamento e lucro, categorias, variação de preço, mais vendidos, melhores clientes, produtos parados, formas de pagamento e site x balcão.
- **Exportar relatório:** no Painel, **Exportar planilha** baixa um .xlsx do período (Resumo, Vendas, Itens, Categorias, Produtos, Clientes, Pagamentos) e **Exportar PDF** abre o relatório para salvar como PDF ou imprimir.
- **Pedidos:** todo pedido finalizado no site fica salvo aqui, mesmo que o cliente não envie a mensagem do WhatsApp. Um aviso aparece quando chega pedido novo. Mude o status (confirmado, pago, saiu para entrega, entregue…) e o cliente acompanha ao vivo em **Meus pedidos**. O botão "Lançar venda" transforma o pedido em venda e baixa o estoque. Ao marcar o pedido como **Finalizado**, a venda é lançada como paga (se ainda não foi) e o cliente vê "Compra finalizada". Marcar a venda como paga na aba Vendas também atualiza o pedido.
- **Devoluções:** até 7 dias depois de finalizada a compra, o cliente pode pedir devolução em Meus pedidos (motivo e detalhes). O pedido aparece com destaque em Pedidos → filtro "Devoluções": aprove ou recuse com uma mensagem. Quando o produto voltar e o reembolso for feito, clique em "Produto recebido e reembolso feito" para desfazer a venda e devolver o estoque.
- **Vendas:** registre cada venda (itens, cliente, forma de pagamento, desconto, pago ou a receber). O estoque baixa sozinho; excluir a venda devolve os produtos.
- **Produtos:** cadastro com foto (da galeria ou da câmera), conteúdo da embalagem (ml, g…), custo, preço, preço promocional, descrições, destaque e estoque, além de entrada de mercadoria. Produtos com **opções** (tamanho, cor, tom) têm preço e estoque por opção. "Salvar e cadastrar outro" e "Duplicar" agilizam o cadastro. A lista mostra quais produtos estão **parados** (sem venda há mais de 30 dias). Tudo o que você salva aparece na loja na hora (o custo nunca é mostrado).
- **Remover fundo da foto (opcional):** no cadastro, marque "Remover fundo e usar o fundo da loja". Roda no próprio navegador, sem custo; na primeira vez baixa o modelo de IA e pode levar até 1 minuto. Funciona melhor em produtos opacos; em vidro transparente, o fundo antigo pode aparecer através do frasco. Usa a biblioteca @imgly/background-removal (licença AGPL, por isso o código do site é aberto).
- **Categorias:** crie, renomeie, ordene e exclua (só sem produtos). Elas viram os filtros da loja. Marque até 3 para a vitrine da página inicial.
- **Cupons:** crie códigos de desconto em porcentagem ou valor fixo, com pedido mínimo opcional. Dá para pausar e reativar.
- **Clientes:** contato com link para o WhatsApp, total gasto e quanto cada um deve.
- **Backup:** com o login ativo, os dados ficam na nuvem e aparecem em qualquer aparelho do admin, atualizando ao vivo. Mesmo assim, baixe um backup de vez em quando.
- **Treino e lançamento** (aba Backup): **Carregar demonstração** preenche clientes, vendas, pedidos e um cupom fictícios para conhecer a gestão (o estoque não muda); **Tirar demonstração** apaga só esses dados. **Preparar para o lançamento** apaga produtos, vendas, pedidos e clientes de teste (você escolhe) para começar as vendas de verdade; depois disso a loja nunca mais mostra os produtos de exemplo.

## Como editar

- **WhatsApp, PIX, endereço de retirada e frete por bairro:** `js/config.js`
- **Produtos e categorias:** pela gestão. O arquivo `js/products.js` é só o catálogo inicial da primeira abertura da gestão (e da loja sem login configurado).
- **Regras do Firestore:** sempre que `firestore.rules` mudar, cole o conteúdo de novo no console (Firestore → Regras → Publicar).

Depois de editar, faça commit e push; o GitHub Pages atualiza o site em 1 a 2 minutos. Se mudar algum arquivo de `css/` ou `js/`, troque também o `?v=...` nos links de `index.html` e `admin.html` (por exemplo, para a data do dia), para que os navegadores baixem a versão nova na hora.

## Testar no computador

```bash
python -m http.server 5173
```

Abra http://localhost:5173
