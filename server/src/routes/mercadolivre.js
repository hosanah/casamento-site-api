const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

function getCredentials() {
  const accessToken = process.env.MERCADOLIVRE_ACCESS_TOKEN;
  const userId = process.env.MERCADOLIVRE_USER_ID;
  if (!accessToken || !userId) {
    throw new Error('Credenciais do Mercado Livre não configuradas');
  }
  return { accessToken, userId };
}

router.get('/orders', async (req, res) => {
  try {
    const { accessToken, userId } = getCredentials();
    const response = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${userId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const data = await response.json();
    const orders = data.results || [];

    for (const order of orders) {
      const orderId = order.id.toString();
      const quantity = order.order_items?.reduce((s, i) => s + (i.quantity || 0), 0) || 1;
      const amount = order.total_amount || 0;
      const presentId = parseInt(order.order_items?.[0]?.item?.id) || 1;
      const customerName = order.buyer?.nickname || 'Mercado Livre';
      const customerEmail = order.buyer?.email || '';
      const status = order.status || 'pending';

      const existing = await prisma.sale.findFirst({ where: { paymentId: orderId } });
      if (!existing) {
        await prisma.sale.create({
          data: {
            presentId,
            customerName,
            customerEmail,
            amount,
            quantity,
            paymentMethod: 'mercadolivre',
            paymentId: orderId,
            status
          }
        });
      } else if (existing.status !== status) {
        await prisma.sale.update({
          where: { id: existing.id },
          data: { status }
        });
      }
    }

    res.json({ message: 'Pedidos sincronizados', count: orders.length });
  } catch (error) {
    console.error('Erro ao buscar pedidos do Mercado Livre:', error);
    res.status(500).json({ message: 'Erro ao buscar pedidos', error: error.message });
  }
});

module.exports = router;
