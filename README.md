# Casamento Site API

API para o site de casamento. Execute `npm install` dentro da pasta `server` para instalar as dependências.

## Rota Mercado Pago

A API possui uma rota para sincronizar pagamentos registrados no Mercado Pago. O token de acesso é obtido na tabela `Config` do banco de dados.

```
GET /api/mercadopago/payments
```

Essa chamada busca os pagamentos usando o token configurado e registra cada um na tabela `Sale` com o método informado pelo Mercado Pago.

Para rodar os testes utilize:

```
cd server && npm test
```

