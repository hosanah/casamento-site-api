const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateJWT } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../public/uploads/pix');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'qrcode-' + uniqueSuffix + ext);
  }
});

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado. Use apenas JPG, PNG, GIF ou WebP.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Função auxiliar para garantir que exista apenas um registro de configuração
async function ensureSingleConfig() {
  // Contar quantos registros existem
  const count = await prisma.config.count();
  
  // Se não existir nenhum, criar um padrão
  if (count === 0) {
    return await prisma.config.create({
      data: {
        siteTitle: 'Marília & Iago',
        weddingDate: '',
        pixKey: '',
        pixDescription: '',
        mercadoPagoPublicKey: '',
        mercadoPagoAccessToken: '',
        mercadoPagoWebhookUrl: '',
        mercadoPagoNotificationUrl: '',
        pixQrCodeImage: ''
      }
    });
  }
  
  // Se existir mais de um, manter apenas o primeiro e excluir os demais
  if (count > 1) {
    // Buscar todos os registros ordenados por ID
    const configs = await prisma.config.findMany({
      orderBy: { id: 'asc' }
    });
    
    // Manter o primeiro e excluir os demais
    const primaryConfig = configs[0];
    const idsToDelete = configs.slice(1).map(c => c.id);
    
    if (idsToDelete.length > 0) {
      await prisma.config.deleteMany({
        where: { id: { in: idsToDelete } }
      });
      
      console.log(`Removidos ${idsToDelete.length} registros de configuração duplicados.`);
    }
    
    return primaryConfig;
  }
  
  // Se existir exatamente um, retorná-lo
  return await prisma.config.findFirst();
}

// Função para remover arquivo antigo
async function removeOldFile(filePath) {
  if (!filePath) return;
  
  try {
    // Converter caminho relativo para absoluto
    const absolutePath = path.join(__dirname, '../../public', filePath);
    
    // Verificar se o arquivo existe
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log(`Arquivo removido: ${absolutePath}`);
    }
  } catch (error) {
    console.error(`Erro ao remover arquivo antigo: ${error.message}`);
  }
}

// Obter configurações (público)
router.get('/', async (req, res) => {
  try {
    // Garantir que exista apenas um registro de configuração
    const config = await ensureSingleConfig();
    
    // Remover tokens sensíveis para requisições públicas
    if (!req.user) {
      config.mercadoPagoAccessToken = undefined;
    }
    
    res.json(config);
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Upload de QR Code PIX (protegido)
router.post('/upload-qrcode', authenticateJWT, upload.single('qrcode'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }
    
    // Caminho relativo para o arquivo (para salvar no banco)
    const relativePath = `/uploads/pix/${req.file.filename}`;
    
    // Buscar configuração atual
    const config = await ensureSingleConfig();
    
    // Salvar caminho antigo para remoção posterior
    const oldImagePath = config.pixQrCodeImage;
    
    // Atualizar o registro com o novo caminho da imagem
    await prisma.config.update({
      where: { id: config.id },
      data: {
        pixQrCodeImage: relativePath
      }
    });
    
    // Remover arquivo antigo se existir
    if (oldImagePath) {
      await removeOldFile(oldImagePath);
    }
    
    res.json({
      message: 'Upload realizado com sucesso',
      imagePath: relativePath
    });
  } catch (error) {
    console.error('Erro ao fazer upload do QR Code:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar configurações (protegido)
router.put('/', authenticateJWT, async (req, res) => {
  try {
    const { 
      siteTitle, 
      weddingDate, 
      pixKey, 
      pixDescription, 
      mercadoPagoPublicKey,
      mercadoPagoAccessToken,
      mercadoPagoWebhookUrl,
      mercadoPagoNotificationUrl,
      pixQrCodeImage
    } = req.body;
    
    // Garantir que exista apenas um registro de configuração
    const existingConfig = await ensureSingleConfig();
    
    // Se houver uma nova imagem e for diferente da atual, remover a antiga
    if (pixQrCodeImage && pixQrCodeImage !== existingConfig.pixQrCodeImage) {
      await removeOldFile(existingConfig.pixQrCodeImage);
    }
    
    // Atualizar o registro existente
    const config = await prisma.config.update({
      where: { id: existingConfig.id },
      data: {
        siteTitle: siteTitle || existingConfig.siteTitle,
        weddingDate: weddingDate || existingConfig.weddingDate,
        pixKey: pixKey || existingConfig.pixKey,
        pixDescription: pixDescription || existingConfig.pixDescription,
        mercadoPagoPublicKey: mercadoPagoPublicKey || existingConfig.mercadoPagoPublicKey,
        mercadoPagoAccessToken: mercadoPagoAccessToken || existingConfig.mercadoPagoAccessToken,
        mercadoPagoWebhookUrl: mercadoPagoWebhookUrl || existingConfig.mercadoPagoWebhookUrl,
        mercadoPagoNotificationUrl: mercadoPagoNotificationUrl || existingConfig.mercadoPagoNotificationUrl,
        pixQrCodeImage: pixQrCodeImage || existingConfig.pixQrCodeImage
      }
    });

    // Remover tokens sensíveis da resposta
    const safeConfig = { ...config };
    safeConfig.mercadoPagoAccessToken = undefined;
    
    res.json(safeConfig);
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Obter chave pública do Mercado Pago (público)
router.get('/mercadopago-public-key', async (req, res) => {
  try {
    const config = await ensureSingleConfig();
    
    if (!config.mercadoPagoPublicKey) {
      return res.status(404).json({ message: 'Chave pública do Mercado Pago não configurada' });
    }
    
    res.json({ publicKey: config.mercadoPagoPublicKey });
  } catch (error) {
    console.error('Erro ao buscar chave pública do Mercado Pago:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router;
