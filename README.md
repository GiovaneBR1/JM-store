# JM Store

Loja de cosméticos importados. O cliente escolhe os produtos, informa a entrega e o pedido abre pronto no WhatsApp da loja para confirmar e pagar no PIX.

Site: https://giovanebr1.github.io/JM-store/

## Como editar

- **WhatsApp, PIX, endereço de retirada e frete por bairro:** `js/config.js`
- **Produtos e categorias:** `js/products.js`. Para colocar foto, salve a imagem na pasta `img/` e preencha `image: 'img/nome-da-foto.webp'` no produto.

Depois de editar, faça commit e push; o GitHub Pages atualiza o site em 1 a 2 minutos.

## Testar no computador

```bash
python -m http.server 5173
```

Abra http://localhost:5173
