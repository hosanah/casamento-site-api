const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protectNonGetRoutes } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();

// Configuração do multer para upload de imagens
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../public/uploads/presentes');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'presente-' + uniqueSuffix + ext);
  }
});

// Filtro para aceitar apenas imagens
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado. Apenas imagens são permitidas.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Obter todos os presentes (público)
router.get('/', async (req, res) => {
  try {
    const presentes = await prisma.present.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(presentes);
  } catch (error) {
    console.error('Erro ao buscar presentes:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Obter um presente específico (público)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const presente = await prisma.present.findUnique({
      where: { id: Number(id) }
    });
    
    if (!presente) {
      return res.status(404).json({ message: 'Presente não encontrado' });
    }
    
    res.json(presente);
  } catch (error) {
    console.error('Erro ao buscar presente:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Upload de imagem (protegido)
router.post('/upload', protectNonGetRoutes, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhuma imagem enviada' });
    }
    
    // Criar URL relativa para a imagem
    const imageUrl = `/uploads/presentes/${req.file.filename}`;
    
    res.json({ 
      url: imageUrl,
      message: 'Imagem enviada com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao fazer upload da imagem:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Criar um novo presente (protegido)
router.post('/', protectNonGetRoutes, async (req, res) => {
  try {
    const { name, description, price, image, stock } = req.body;
    
    const newPresente = await prisma.present.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        image,
        stock: stock || 1
      }
    });
    
    res.status(201).json(newPresente);
  } catch (error) {
    console.error('Erro ao criar presente:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Atualizar um presente (protegido)
router.put('/:id', protectNonGetRoutes, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, image, stock } = req.body;
    
    const updatedPresente = await prisma.present.update({
      where: { id: Number(id) },
      data: {
        name,
        description,
        price: parseFloat(price),
        image,
        stock: parseInt(stock, 10)
      }
    });
    
    res.json(updatedPresente);
  } catch (error) {
    console.error('Erro ao atualizar presente:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Excluir um presente (protegido)
router.delete('/:id', protectNonGetRoutes, async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.present.delete({
      where: { id: Number(id) }
    });
    
    res.json({ message: 'Presente excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir presente:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

module.exports = router;
