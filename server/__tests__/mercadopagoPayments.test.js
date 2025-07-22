const request = require('supertest');
const nock = require('nock');
const app = require('../src/index');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

describe('Mercado Pago payments route', () => {
  beforeAll(async () => {
    await prisma.config.upsert({
      where: { id: 1 },
      update: { mercadoPagoAccessToken: 'token' },
      create: { mercadoPagoAccessToken: 'token' }
    });
  });

  afterAll(async () => {
    await prisma.sale.deleteMany();
    await prisma.config.deleteMany();
    await prisma.$disconnect();
  });

  test('fetches payments and stores sales with normalized status', async () => {
    nock('https://api.mercadopago.com')
      .get('/v1/payments/search')
      .reply(200, {
        results: [
          {
            id: 1,
            transaction_amount: 10,
            status: 'approved',
            payment_method_id: 'pix',
            payer: { first_name: 'John', email: 'john@example.com' },
            metadata: { presentId: '1', quantity: 1 }
          },
          {
            id: 2,
            transaction_amount: 20,
            status: 'pending',
            payment_method_id: 'credit_card',
            payer: { first_name: 'Jane', email: 'jane@example.com' },
            metadata: { presentId: '2', quantity: 1 }
          },
          {
            id: 3,
            transaction_amount: 15,
            status: 'rejected',
            payment_method_id: 'pix',
            payer: { first_name: 'Bob', email: 'bob@example.com' },
            metadata: { presentId: '3', quantity: 1 }
          }
        ]
      });

    const res = await request(app).get('/api/mercadopago/payments');
    expect(res.statusCode).toBe(200);
    const sales = await prisma.sale.findMany({ orderBy: { paymentId: 'asc' } });
    expect(sales.length).toBe(3);
    expect(sales[0].paymentMethod).toBe('pix');
    expect(sales[0].status).toBe('paid');
    expect(sales[1].status).toBe('pending');
    expect(sales[2].status).toBe('cancelled');
  });
});
