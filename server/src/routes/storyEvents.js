const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(process.cwd(), 'public/uploads/story');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'story-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado. Apenas imagens são permitidas.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Rota para upload de imagem
router.post('/upload', authenticateJWT, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma imagem enviada' });
    }
    
    const imageUrl = `/uploads/story/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Erro ao fazer upload da imagem:', error);
    res.status(500).json({ message: 'Erro ao fazer upload da imagem' });
  }
});

// Obter todos os eventos da história (público)
router.get('/', async (req, res) => {
  try {
    const events = await prisma.storyEvent.findMany({
      orderBy: [
        { order: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    
    res.json(events);
  } catch (error) {
    console.error('Erro ao buscar eventos da história:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Obter um evento específico (público)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await prisma.storyEvent.findUnique({
      where: { id: Number(id) }
    });
    
    if (!event) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Erro ao buscar evento:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar novo evento (protegido)
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { date, title, text, image, order } = req.body;
    
    // Validações básicas
    if (!date || !title || !text) {
      return res.status(400).json({ message: 'Data, título e texto são obrigatórios' });
    }
    
    const event = await prisma.storyEvent.create({
      data: {
        date,
        title,
        text,
        image,
        order: parseInt(order) || 0
      }
    });
    
    res.status(201).json(event);
  } catch (error) {
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar evento (protegido)
router.put('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, title, text, image, order } = req.body;
    
    // Validações básicas
    if (!date || !title || !text) {
      return res.status(400).json({ message: 'Data, título e texto são obrigatórios' });
    }
    
    // Verificar se o evento existe
    const existingEvent = await prisma.storyEvent.findUnique({
      where: { id: Number(id) }
    });
    
    if (!existingEvent) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    
    const updatedEvent = await prisma.storyEvent.update({
      where: { id: Number(id) },
      data: {
        date,
        title,
        text,
        image,
        order: parseInt(order) !== undefined ? parseInt(order) : existingEvent.order
      }
    });
    
    res.json(updatedEvent);
  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Excluir evento (protegido)
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se o evento existe
    const existingEvent = await prisma.storyEvent.findUnique({
      where: { id: Number(id) }
    });
    
    if (!existingEvent) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    
    // Se houver imagem, remover o arquivo (opcional)
    if (existingEvent.image && existingEvent.image.startsWith('/uploads/story/')) {
      const imagePath = path.resolve(process.cwd(), 'public', existingEvent.image.substring(1));
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await prisma.storyEvent.delete({
      where: { id: Number(id) }
    });
    
    res.json({ message: 'Evento excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir evento:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router;
