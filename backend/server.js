import 'dotenv/config';  // Aggiungi questa riga come PRIMA IMPORTAZIONE
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

// Import routes
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import testEmailRoutes from './routes/test-email.js';
import { authenticate } from './middleware/auth.js';

// Inizializza Express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connessione MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
  console.log('🍕 Connesso a MongoDB Atlas - Charlene\'s Kitchen Database');
})
.catch((error) => {
  console.error('❌ Errore connessione MongoDB:', error);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/test/email', testEmailRoutes);

// Routes di test base
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Benvenuto da Charlene\'s Kitchen API!',
    status: 'Server attivo',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    environment: process.env.NODE_ENV
  });
});

// Test route protetta
app.get('/api/protected', authenticate, (req, res) => {
  res.json({
    message: 'Questa è una route protetta!',
    user: req.user.name,
    userId: req.userId
  });
});

// Gestione errori per route non trovate
app.use(/.*/, (req, res) => {
  res.status(404).json({ 
    message: 'Route non trovata',
    path: req.originalUrl 
  });
});

// Gestione errori globale
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  res.status(500).json({ 
    message: 'Errore interno del server',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Qualcosa è andato storto'
  });
});

// Avvio server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Charlene's Kitchen Server in esecuzione sulla porta ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Test API: http://localhost:${PORT}/api/test`);
});