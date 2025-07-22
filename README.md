# Casamento Site API

API para o site de casamento. Execute `npm install` dentro da pasta `server` para instalar as dependências.

## Rota Mercado Livre

A API possui uma rota para sincronizar pedidos do Mercado Livre. Antes de usar defina as variáveis de ambiente `MERCADOLIVRE_ACCESS_TOKEN` e `MERCADOLIVRE_USER_ID`.

```
GET /api/mercadolivre/orders
```

Essa chamada busca os pedidos usando o token e ID do usuário cadastrados e registra cada pedido na tabela `Sale` com `paymentMethod` igual a `mercadolivre`.

Para rodar os testes utilize:

```
cd server && npm test
```

