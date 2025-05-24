const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Rotas
const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const presentesRoutes = require('./routes/presentes');
const rsvpRoutes = require('./routes/rsvp');
const mercadoPagoRoutes = require('./routes/mercadopago');
const albumRoutes = require('./routes/album');
const contentRoutes = require('./routes/content');
const storyRoutes = require('./routes/storyEvents');
const backgroundImagesRoutes = require('./routes/backgroundImages');
const salesRoutes = require('./routes/sales');

// Middlewares
const { authenticateJWT } = require('./middleware/auth');

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middlewares
const corsOptions = {
  origin: [
    'https://mariliaeiago.com.br', 
    'https://www.mercadopago.com.br/',
    'https://www.mariliaeiago.com.br'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Servir arquivos estáticos da pasta uploads
const uploadsPath = path.resolve(process.cwd(), 'public/uploads');
app.use('/uploads', express.static(uploadsPath));
// Também servir a pasta public diretamente
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Rotas públicas
app.use('/api/auth', authRoutes);
app.use('/api/rsvp', rsvpRoutes);
app.use('/api/mercadopago', mercadoPagoRoutes);
app.use('/api/config', configRoutes); // Agora totalmente pública, proteção será feita internamente
app.use('/api/background-images', backgroundImagesRoutes); // Parcialmente protegida (GET público)

// Rotas protegidas
app.use('/api/presentes', presentesRoutes); // Parcialmente protegida (GET público)
app.use('/api/album', albumRoutes); // Parcialmente protegida (GET público)
app.use('/api/content', contentRoutes); // Parcialmente protegida (GET público)
app.use('/api/story-events', storyRoutes); // Parcialmente protegida (GET público)
app.use('/api/sales', salesRoutes); // Totalmente protegida (apenas admin)

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'API do Site de Casamento Marília & Iago' });
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Exportando para testes
module.exports = app;
