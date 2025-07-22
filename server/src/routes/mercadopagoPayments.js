const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Converte status do Mercado Pago para os status permitidos em Sale
function mapMercadoPagoStatus(status) {
  switch ((status || '').toLowerCase()) {
    case 'approved':
    case 'accredited':
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

// Obtém as credenciais do Mercado Pago salvas na tabela Config
async function getMercadoPagoConfig() {
  const config = await prisma.config.findFirst();
  if (!config || !config.mercadoPagoAccessToken) {
    throw new Error('Configurações do Mercado Pago não encontradas');
  }
  return { accessToken: config.mercadoPagoAccessToken };
}
const { getMercadoPagoConfig } = require('../utils/mercadopagoConfig');

// Sincroniza pagamentos do Mercado Pago armazenando na tabela Sale
router.get('/', async (req, res) => {
  try {
    const { accessToken } = await getMercadoPagoConfig(prisma);
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
      const status = mapMercadoPagoStatus(pay.status);
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
      } else {
        const updateData = { status };
        // Sempre atualiza o nome e email do cliente para refletir o pagamento mais recente
        updateData.customerName = cliente;
        updateData.customerEmail = pay.payer?.email || '';
        await prisma.sale.update({ where: { id: existing.id }, data: updateData });
      }
    }

    res.json({ message: 'Pagamentos sincronizados', count: payments.length });
  } catch (error) {
    console.error('Erro ao buscar pagamentos do Mercado Pago:', error);
    res.status(500).json({ message: 'Erro ao buscar pagamentos', error: error.message });
  }
});

module.exports = router;
