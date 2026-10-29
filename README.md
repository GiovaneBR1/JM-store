# JM Store

Loja de cosméticos importados. O cliente escolhe os produtos, informa a entrega e o pedido abre pronto no WhatsApp da loja para confirmar e pagar no PIX.

Site: https://giovanebr1.github.io/JM-store/

## Gestão da loja

Abra `admin.html` (https://giovanebr1.github.io/JM-store/admin.html) para controlar a loja:

- **Painel:** vendido hoje e no mês, lucro, valores a receber, mais vendidos e produtos para repor.
- **Vendas:** registre cada venda (itens, cliente, forma de pagamento, desconto, pago ou a receber). O estoque baixa sozinho; excluir a venda devolve os produtos.
- **Produtos:** cadastro com custo, preço, margem e estoque, além de entrada de mercadoria.
- **Clientes:** contato com link para o WhatsApp, total gasto e quanto cada um deve.
- **Backup:** os dados ficam salvos só no navegador onde foram lançados. Baixe o backup com frequência e use "Importar" para levá-los a outro aparelho.

## Como editar

- **WhatsApp, PIX, endereço de retirada e frete por bairro:** `js/config.js`
- **Produtos e categorias:** `js/products.js`. Para colocar foto, salve a imagem na pasta `img/` e preencha `image: 'img/nome-da-foto.webp'` no produto.

Depois de editar, faça commit e push; o GitHub Pages atualiza o site em 1 a 2 minutos.

## Testar no computador

```bash
python -m http.server 5173
```

Abra http://localhost:5173
