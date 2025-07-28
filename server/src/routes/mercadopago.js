const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const router = express.Router();
const crypto = require('crypto');
const prisma = new PrismaClient();
const dotenv = require('dotenv');
dotenv.config();

const { getMercadoPagoConfig } = require('../utils/mercadopagoConfig');


// Inicializar o SDK do Mercado Pago com o token de acesso
async function initMercadoPago() {
  try {
    const { accessToken } = await getMercadoPagoConfig(prisma);
    return new MercadoPagoConfig({ accessToken });
  } catch (error) {
    console.error('Erro ao inicializar Mercado Pago:', error);
    return null;
  }
}

// Criar preferência de pagamento para um presente
router.post('/create-preference', async (req, res) => {
  try {
    const { presentId, customerName, customerEmail } = req.body;

    if (!presentId || !customerName) {
      return res.status(400).json({ message: 'ID do presente e nome do cliente são obrigatórios' });
    }

    // Obter configurações do Mercado Pago
    const { accessToken, notificationUrl } = await getMercadoPagoConfig(prisma);

    // Inicializar SDK com novo formato
    const mercadoPagoClient = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(mercadoPagoClient);

    // Buscar o presente
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

    // Criar pedido
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
    const baseUrl = `${protocol}://${host}`;

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
      payment_methods: {
        installments: 12 // Permitir parcelamento em até 12x
      },
      auto_return: 'approved',
      statement_descriptor: siteTitle
    };

    const response = await preferenceClient.create({ body: preference });

    // Atualizar pedido
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

// Nova rota para criar preferência de pagamento para múltiplos presentes (carrinho)
router.post('/create-cart-preference', async (req, res) => {
  try {
    const { items, customerName, customerEmail } = req.body;

    if (!items || !items.length || !customerName) {
      return res.status(400).json({ 
        message: 'Lista de presentes e nome do cliente são obrigatórios' 
      });
    }

    // Obter configurações do Mercado Pago
    const { accessToken } = await getMercadoPagoConfig(prisma);

    // Inicializar SDK com novo formato
    const mercadoPagoClient = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(mercadoPagoClient);

    const config = await prisma.config.findFirst();
    const siteTitle = config?.siteTitle || 'Casamento';

    // Criar um grupo de pedidos (cart)
    const cart = await prisma.cart.create({
      data: {
        customerName,
        customerEmail: customerEmail || '',
        status: 'pending'
      }
    });

    // Array para armazenar os itens do Mercado Pago
    const preferenceItems = [];
    
    // Processar cada item do carrinho
    for (const item of items) {
      const presentId = parseInt(item.presentId);
      const quantity = item.quantity || 1;
      
      // Buscar o presente
      const present = await prisma.present.findUnique({
        where: { id: presentId }
      });

      if (!present) {
        continue; // Pular presentes não encontrados
      }

      if (present.stock < quantity) {
        return res.status(400).json({ 
          message: `O presente "${present.name}" não tem estoque suficiente` 
        });
      }

      // Criar item de pedido vinculado ao carrinho
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          presentId: present.id,
          quantity,
          price: present.price
        }
      });

      // Adicionar item à preferência do Mercado Pago
      preferenceItems.push({
        id: `present-${present.id}`,
        title: present.name,
        description: present.description || `Presente para ${siteTitle}`,
        quantity,
        currency_id: 'BRL',
        unit_price: present.price
      });
    }

    if (preferenceItems.length === 0) {
      return res.status(400).json({ message: 'Nenhum presente válido no carrinho' });
    }

    const preference = {
      items: preferenceItems,
      payer: {
        name: customerName,
        email: customerEmail || 'cliente@exemplo.com'
      },
      external_reference: `cart-${cart.id}`,
      back_urls: {
        success: `https://www.mariliaeiago.com.br/presentes/confirmacao?cart_id=${cart.id}`,
        failure: `https://www.mariliaeiago.com.br/presentes/confirmacao?cart_id=${cart.id}`,
        pending: `https://www.mariliaeiago.com.br/presentes/confirmacao?cart_id=${cart.id}`,
      },
      payment_methods: {
        installments: 12 // Permitir parcelamento em até 12x
      },
      auto_return: 'approved',
      statement_descriptor: siteTitle
    };

    const response = await preferenceClient.create({ body: preference });

    // Atualizar carrinho
    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        paymentId: response.id
      }
    });

    res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
      cartId: cart.id
    });
  } catch (error) {
    console.error('Erro ao criar preferência de pagamento para carrinho:', error);
    res.status(500).json({ 
      message: 'Erro ao processar pagamento do carrinho', 
      error: error.message 
    });
  }
});

// Webhook para receber notificações do Mercado Pago
router.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;

    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    const dataId = req.query['data.id']; // obtido da URL (query param)
    const secret = process.env.WEBHOOK_SECRET;

    if (!signatureHeader || !requestId || !dataId || !secret) {
    return res.status(400).send('Dados obrigatórios ausentes');
    }

    const parts = signatureHeader.split(',');
    const ts = parts.find(p => p.trim().startsWith('ts='))?.split('=')[1];
    const receivedSignature = parts.find(p => p.trim().startsWith('v1='))?.split('=')[1];

    // Monta o "manifest"
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`

    const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

    console.log('Assinatura recebida:', receivedSignature);
    console.log('Assinatura calculada:', computedSignature);

    // Validação segura
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const computedBuffer = Buffer.from(computedSignature, 'hex');

    if (
    receivedBuffer.length !== computedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, computedBuffer)
    ) {
      return res.status(401).send('Assinatura inválida');
    }
    
    // Verificar se é uma notificação de pagamento
    if (type === 'payment') {
      const paymentId = data.id;
      
      // Inicializar o SDK do Mercado Pago
      const mercadoPagoClient = await initMercadoPago();
      if (!mercadoPagoClient) {
        return res.status(500).json({ message: 'Erro ao inicializar Mercado Pago' });
      }
      
      // Inicializar o cliente de pagamento
      const paymentClient = new Payment(mercadoPagoClient);
      
      // Buscar informações do pagamento usando o novo formato do SDK
      const payment = await paymentClient.get({ id: paymentId });
      
      if (payment && payment.id) {
        const { external_reference, status } = payment;
        
        // Verificar se é um pedido individual ou um carrinho
        if (external_reference.startsWith('order-')) {
          // Pedido individual
          const orderId = external_reference.replace('order-', '');
          
          // Atualizar o status do pedido
          await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: {
              status: status === 'approved' ? 'paid' : status
            }
          });
          
          // Se o pagamento foi aprovado, reduzir o estoque do presente e registrar a venda
          if (status === 'approved') {
            const order = await prisma.order.findUnique({
              where: { id: parseInt(orderId) },
              include: { present: true }
            });
            
            if (order && order.present) {
              // Reduzir o estoque do presente
              await prisma.present.update({
                where: { id: order.present.id },
                data: {
                  stock: Math.max(0, order.present.stock - 1)
                }
              });
              
              // Registrar a venda na nova tabela Sale
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
        } else if (external_reference.startsWith('cart-')) {
          // Carrinho de compras
          const cartId = external_reference.replace('cart-', '');
          
          // Atualizar o status do carrinho
          await prisma.cart.update({
            where: { id: parseInt(cartId) },
            data: {
              status: status === 'approved' ? 'paid' : status
            }
          });
          
          // Se o pagamento foi aprovado, processar todos os itens do carrinho
          if (status === 'approved') {
            const cart = await prisma.cart.findUnique({
              where: { id: parseInt(cartId) },
              include: { 
                items: {
                  include: { present: true }
                }
              }
            });
            
            if (cart && cart.items.length > 0) {
              // Processar cada item do carrinho
              for (const item of cart.items) {
                // Reduzir o estoque do presente
                await prisma.present.update({
                  where: { id: item.present.id },
                  data: {
                    stock: Math.max(0, item.present.stock - item.quantity)
                  }
                });
                
                // Registrar a venda na tabela Sale
                await prisma.sale.create({
                  data: {
                    presentId: item.present.id,
                    customerName: cart.customerName,
                    customerEmail: cart.customerEmail,
                    quantity: item.quantity,
                    amount: item.price * item.quantity,
                    paymentMethod: 'mercadopago',
                    paymentId: payment.id.toString(),
                    status: 'paid',
                    notes: `Pagamento aprovado via Mercado Pago. ID do carrinho: ${cartId}`
                  }
                });
              }
            }
          }
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro ao processar webhook do Mercado Pago:', error);
    res.status(500).json({ message: 'Erro ao processar notificação', error: error.message });
  }
});

// Verificar status de um pedido
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

// Verificar status de um carrinho
router.get('/cart/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const cart = await prisma.cart.findUnique({
      where: { id: parseInt(id) },
      include: { 
        items: {
          include: { present: true }
        }
      }
    });
    
    if (!cart) {
      return res.status(404).json({ message: 'Carrinho não encontrado' });
    }
    
    res.json(cart);
  } catch (error) {
    console.error('Erro ao buscar carrinho:', error);
    res.status(500).json({ message: 'Erro ao buscar carrinho', error: error.message });
  }
});

module.exports = router;
