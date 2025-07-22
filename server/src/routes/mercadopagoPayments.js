const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Obtém as credenciais do Mercado Pago salvas na tabela Config
async function getMercadoPagoConfig() {
  const config = await prisma.config.findFirst();
  if (!config || !config.mercadoPagoAccessToken) {
    throw new Error('Configurações do Mercado Pago não encontradas');
  }
  return { accessToken: config.mercadoPagoAccessToken };
}

// Sincroniza pagamentos do Mercado Pago armazenando na tabela Sale
router.get('/', async (req, res) => {
  try {
    const { accessToken } = await getMercadoPagoConfig();
    const response = await fetch('https://api.mercadopago.com/v1/payments/search', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const data = await response.json();
    const payments = data.results || [];

    for (const pay of payments) {
      const paymentId = pay.id.toString();
      const valor = pay.transaction_amount || 0;
      const metodo = pay.payment_method_id || pay.payment_type_id || 'unknown';
      const status = pay.status || 'pending';
      const cliente = pay.payer?.first_name || pay.payer?.email || 'Mercado Pago';
      const presentId = parseInt(
        pay.metadata?.presentId ||
        pay.metadata?.present_id ||
        pay.additional_info?.items?.[0]?.id
      ) || 1;
      const quantity = parseInt(pay.metadata?.quantity) || 1;

      const existing = await prisma.sale.findFirst({ where: { paymentId } });
      if (!existing) {
        await prisma.sale.create({
          data: {
            presentId,
            customerName: cliente,
            customerEmail: pay.payer?.email || '',
            amount: valor,
            quantity,
            paymentMethod: metodo,
            paymentId,
            status
          }
        });
      } else if (existing.status !== status) {
        await prisma.sale.update({ where: { id: existing.id }, data: { status } });
      }
    }

    res.json({ message: 'Pagamentos sincronizados', count: payments.length });
  } catch (error) {
    console.error('Erro ao buscar pagamentos do Mercado Pago:', error);
    res.status(500).json({ message: 'Erro ao buscar pagamentos', error: error.message });
  }
});

module.exports = router;
