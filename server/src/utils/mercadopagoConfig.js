async function getMercadoPagoConfig(prisma) {
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

module.exports = { getMercadoPagoConfig };
