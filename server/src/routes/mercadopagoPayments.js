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

    let totalProcessed = 0;

    for (const order of orders) {
      const basePayment = order.payments?.[0];
      if (!basePayment?.id) continue;

      const paymentDetailRes = await fetch(`https://api.mercadopago.com/v1/payments/${basePayment.id}?access_token=${accessToken}`);
      if (!paymentDetailRes.ok) {
        console.warn(`Erro ao buscar detalhes do pagamento ${basePayment.id}`);
        continue;
      }

      const payment = await paymentDetailRes.json();
      if (payment.status !== 'approved') continue;

      const paymentId = payment.id.toString();
      const valor = payment.transaction_amount || 0;
      const metodo = payment.payment_method_id || payment.payment_type_id || 'unknown';
      const status = mapMercadoPagoStatus(payment.status);
      const createdAt = new Date(payment.date_created);

      // 🔍 Buscar presente pelo description
      const description = payment.additional_info?.items?.[0]?.description?.trim() || '';
      
      const present = await prisma.present.findFirst({
          where: {
            description: {
              contains: description.toLowerCase()
          }
        }
      });

      const presentId = present?.id ?? 1;

      const quantity = parseInt(payment.additional_info?.items?.[0]?.quantity || 1);

      // 👤 Cliente
      const cliente = payment.payer?.first_name || payment.payer?.email || 'Mercado Pago';
      const clienteEmail = payment.payer?.email || '';

      const existing = await prisma.sale.findFirst({ where: { paymentId } });
      if (!existing) {
        await prisma.sale.create({
          data: {
            presentId,
            customerName: cliente,
            customerEmail: clienteEmail,
            amount: valor,
            quantity,
            paymentMethod: metodo,
            paymentId,
            status,
            createdAt
          }
        });
      } else {
        await prisma.sale.update({
          where: { id: existing.id },
          data: {
            presentId,
            status,
            customerName: cliente,
            customerEmail: clienteEmail
          }
        });
      }

      totalProcessed++;
    }

    res.json({ message: 'Pagamentos sincronizados com sucesso', count: totalProcessed });
  } catch (error) {
    console.error('Erro ao buscar merchant orders:', error);
    res.status(500).json({ message: 'Erro ao buscar pedidos', error: error.message });
  }
});

module.exports = router;
