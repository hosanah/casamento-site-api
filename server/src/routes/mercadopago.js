const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const crypto = require('crypto');
const router = express.Router();
const prisma = new PrismaClient();

// Função para obter as configurações do Mercado Pago
async function getMercadoPagoConfig() {
  const config = await prisma.config.findFirst();

  if (!config || !config.mercadoPagoAccessToken) {
    throw new Error('Configurações do Mercado Pago não encontradas');
  }

  return {
    accessToken: config.mercadoPagoAccessToken,
    publicKey: config.mercadoPagoPublicKey,
    webhookUrl: config.mercadoPagoWebhookUrl,
    notificationUrl: config.mercadoPagoNotificationUrl
  };
}

// Inicializar o SDK do Mercado Pago
async function initMercadoPago() {
  try {
    const { accessToken } = await getMercadoPagoConfig();
    return new MercadoPagoConfig({ accessToken });
  } catch (error) {
    console.error('Erro ao inicializar Mercado Pago:', error);
    return null;
  }
}

// Criar preferência de pagamento
router.post('/create-preference', async (req, res) => {
  try {
    const { presentId, customerName, customerEmail } = req.body;

    if (!presentId || !customerName) {
      return res.status(400).json({ message: 'ID do presente e nome do cliente são obrigatórios' });
    }

    const { accessToken, notificationUrl } = await getMercadoPagoConfig();
    const mercadoPagoClient = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(mercadoPagoClient);

    const present = await prisma.present.findUnique({
      where: { id: parseInt(presentId) }
    });

    if (!present) {
      return res.status(404).json({ message: 'Presente não encontrado' });
    }

    if (present.stock <= 0) {
      return res.status(400).json({ message: 'Este presente não está mais disponível' });
    }

    const config = await prisma.config.findFirst();
    const siteTitle = config?.siteTitle || 'Casamento';

    const order = await prisma.order.create({
      data: {
        presentId: present.id,
        customerName,
        customerEmail: customerEmail || '',
        status: 'pending'
      }
    });

    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';

    const preference = {
      items: [
        {
          id: `present-${present.id}`,
          title: present.name,
          description: present.description || `Presente para ${siteTitle}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: present.price
        }
      ],
      payer: {
        name: customerName,
        email: customerEmail || 'cliente@exemplo.com'
      },
      external_reference: `order-${order.id}`,
      back_urls: {
        success: `https://www.mariliaeiago.com.br/presentes/confirmacao?order_id=${order.id}`,
        failure: `https://www.mariliaeiago.com.br/presentes/confirmacao?order_id=${order.id}`,
        pending: `https://www.mariliaeiago.com.br/presentes/confirmacao?order_id=${order.id}`,
      },
      auto_return: 'approved',
      notification_url: notificationUrl || `https://n8n2.zapchatbr.com/webhook/89215726-a2d4-4b7d-95bb-f40cb19f24d6`,
      statement_descriptor: siteTitle
    };

    const response = await preferenceClient.create({ body: preference });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentId: response.id
      }
    });

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      orderId: order.id
    });
  } catch (error) {
    console.error('Erro ao criar preferência de pagamento:', error);
    res.status(500).json({ message: 'Erro ao processar pagamento', error: error.message });
  }
});

// Webhook com verificação de assinatura HMAC
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    if (!signature || !secret) {
      return res.status(401).send('Assinatura ausente ou chave inválida');
    }

    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('hex');

    if (computedSignature !== signature) {
      return res.status(401).send('Assinatura inválida');
    }

    const payload = JSON.parse(req.body.toString());

    const { type, data } = payload;

    if (type === 'payment') {
      const paymentId = data.id;

      const mercadoPagoClient = await initMercadoPago();
      if (!mercadoPagoClient) {
        return res.status(500).json({ message: 'Erro ao inicializar Mercado Pago' });
      }

      const paymentClient = new Payment(mercadoPagoClient);
      const payment = await paymentClient.get({ id: paymentId });

      if (payment && payment.id) {
        const { external_reference, status } = payment;
        const orderId = external_reference.replace('order-', '');

        await prisma.order.update({
          where: { id: parseInt(orderId) },
          data: {
            status: status === 'approved' ? 'paid' : status
          }
        });

        if (status === 'approved') {
          const order = await prisma.order.findUnique({
            where: { id: parseInt(orderId) },
            include: { present: true }
          });

          if (order && order.present) {
            await prisma.present.update({
              where: { id: order.present.id },
              data: {
                stock: Math.max(0, order.present.stock - 1)
              }
            });

            await prisma.sale.create({
              data: {
                presentId: order.present.id,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                amount: order.present.price,
                paymentMethod: 'mercadopago',
                paymentId: payment.id.toString(),
                status: 'paid',
                notes: `Pagamento aprovado via Mercado Pago. ID do pedido: ${orderId}`
              }
            });
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error);
    res.status(500).json({ message: 'Erro no webhook', error: error.message });
  }
});

// Verificação de pedido
router.get('/order/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: parseInt(id) },
      include: { present: true }
    });

    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    res.json(order);
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    res.status(500).json({ message: 'Erro ao buscar pedido', error: error.message });
  }
});

module.exports = router;
