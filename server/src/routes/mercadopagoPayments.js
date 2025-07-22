const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();
const fetch = require('node-fetch');

function mapMercadoPagoStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'approved':
    case 'accredited':
    case 'paid':
      return 'paid';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'pending';
    case 'cancelled':
    case 'rejected':
    case 'refunded':
    case 'charged_back':
      return 'cancelled';
    default:
      return 'pending';
  }
}

async function getMercadoPagoConfig() {
  const config = await prisma.config.findFirst();
  if (!config || !config.mercadoPagoAccessToken) {
    throw new Error('Configurações do Mercado Pago não encontradas');
  }
  return { accessToken: config.mercadoPagoAccessToken };
}

router.get('/', async (req, res) => {
  try {
    const { accessToken } = await getMercadoPagoConfig();

    const response = await fetch('https://api.mercadopago.com/merchant_orders/search?sort=date_created&criteria=desc&limit=50', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const data = await response.json();
    const orders = data.elements || [];

    for (const order of orders) {
      const payment = order.payments?.[0];
      if (!payment || payment.status !== 'approved') continue;

      const paymentId = payment.id.toString();
      const valor = payment.total_paid_amount || 0;
      const metodo = payment.operation_type || 'unknown';
      const status = mapMercadoPagoStatus(payment.status);
      const cliente = order.payer?.email || 'Mercado Pago';
      const presentId = parseInt(order.items?.[0]?.id?.replace('present-', '')) || 1;
      const quantity = order.items?.[0]?.quantity || 1;
      const createdAt = new Date(order.date_created);

      const existing = await prisma.sale.findFirst({ where: { paymentId } });
      if (!existing) {
        await prisma.sale.create({
          data: {
            presentId,
            customerName: cliente,
            customerEmail: cliente,
            amount: valor,
            quantity,
            paymentMethod: metodo,
            paymentId,
            status,
            createdAt // <-- salva a data do pedido
          }
        });
      } else {
        await prisma.sale.update({
          where: { id: existing.id },
          data: {
            status,
            customerName: cliente,
            customerEmail: cliente
          }
        });
      }
    }

    res.json({ message: 'Pedidos sincronizados', count: orders.length });
  } catch (error) {
    console.error('Erro ao buscar merchant orders:', error);
    res.status(500).json({ message: 'Erro ao buscar pedidos', error: error.message });
  }
});

module.exports = router;
