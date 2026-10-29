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

- **Painel:** vendido hoje e no mês, lucro, valores a receber, mais vendidos e produtos para repor.
- **Pedidos:** todo pedido finalizado no site fica salvo aqui, mesmo que o cliente não envie a mensagem do WhatsApp. Um aviso aparece quando chega pedido novo. Mude o status (confirmado, pago, saiu para entrega, entregue…) e o cliente acompanha ao vivo em **Meus pedidos**. O botão "Lançar venda" transforma o pedido em venda e baixa o estoque.
- **Vendas:** registre cada venda (itens, cliente, forma de pagamento, desconto, pago ou a receber). O estoque baixa sozinho; excluir a venda devolve os produtos.
- **Produtos:** cadastro com foto, custo, preço, preço promocional, descrições, destaque e estoque, além de entrada de mercadoria. Tudo o que você salva aparece na loja na hora: foto, preço e estoque (o custo nunca é mostrado).
- **Cupons:** crie códigos de desconto em porcentagem ou valor fixo, com pedido mínimo opcional. Dá para pausar e reativar.
- **Clientes:** contato com link para o WhatsApp, total gasto e quanto cada um deve.
- **Backup:** com o login ativo, os dados ficam na nuvem e aparecem em qualquer aparelho do admin, atualizando ao vivo. Na primeira vez, se houver dados salvos no navegador, o painel oferece enviá-los para a nuvem. Mesmo assim, baixe um backup de vez em quando.

## Como editar

- **WhatsApp, PIX, endereço de retirada e frete por bairro:** `js/config.js`
- **Produtos:** pela gestão (aba Produtos). O arquivo `js/products.js` é só o catálogo inicial, usado quando a nuvem ainda está vazia.
- **Categorias:** `js/products.js` (`JM_CATEGORIES`).
- **Regras do Firestore:** sempre que `firestore.rules` mudar, cole o conteúdo de novo no console (Firestore → Regras → Publicar).

Depois de editar, faça commit e push; o GitHub Pages atualiza o site em 1 a 2 minutos.

## Testar no computador

```bash
python -m http.server 5173
```

Abra http://localhost:5173
