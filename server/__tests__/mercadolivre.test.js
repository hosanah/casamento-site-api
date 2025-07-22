const request = require('supertest');
const nock = require('nock');
const app = require('../src/index');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

describe('Mercado Livre route', () => {
  beforeAll(async () => {
    process.env.MERCADOLIVRE_ACCESS_TOKEN = 'token';
    process.env.MERCADOLIVRE_USER_ID = '123';
  });

  afterAll(async () => {
    await prisma.sale.deleteMany();
    await prisma.$disconnect();
  });

  test('fetches orders and stores sales', async () => {
    nock('https://api.mercadolibre.com')
      .get('/orders/search')
      .query({ seller: '123' })
      .reply(200, { results: [ { id: 1, total_amount: 10, status: 'paid', order_items: [ { quantity: 1, item: { id: '1' } } ], buyer: { nickname: 'John' } } ] });

    const res = await request(app).get('/api/mercadolivre/orders');
    expect(res.statusCode).toBe(200);
    const sales = await prisma.sale.findMany({ where: { paymentId: '1' } });
    expect(sales.length).toBe(1);
    expect(sales[0].paymentMethod).toBe('mercadolivre');
  });
});
