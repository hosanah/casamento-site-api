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

  test('fetches payments and stores sales', async () => {
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
          }
        ]
      });

    const res = await request(app).get('/api/mercadopago/payments');
    expect(res.statusCode).toBe(200);
    const sales = await prisma.sale.findMany({ where: { paymentId: '1' } });
    expect(sales.length).toBe(1);
    expect(sales[0].paymentMethod).toBe('pix');
    expect(sales[0].customerName).toBe('John');
    expect(sales[0].customerEmail).toBe('john@example.com');
  });
});
