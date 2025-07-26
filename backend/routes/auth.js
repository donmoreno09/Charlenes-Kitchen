import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Utility per generare JWT
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Registrazione nuovo utente
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    // Validazione input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e password sono obbligatori'
      });
    }

    // Controlla se l'utente esiste già
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Un utente con questa email esiste già'
      });
    }

    // Crea nuovo utente
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone?.trim(),
      address: address || {}
    });

    await user.save();

    // Genera token
    const token = generateToken(user._id);

    // Rimuovi password dalla risposta
    const userProfile = user.getPublicProfile();

    res.status(201).json({
      success: true,
      message: `Benvenuto in Charlene's Kitchen, ${user.name}!`,
      data: {
        token,
        user: userProfile
      }
    });

  } catch (error) {
    console.error('❌ Errore registrazione:', error);
    
    // Gestione errori di validazione Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Errori di validazione',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server durante la registrazione'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login utente
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validazione input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e password sono obbligatori'
      });
    }

    // Trova utente e include la password per il confronto
    const user = await User.findOne({ email: email.toLowerCase().trim() })
                           .select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide'
      });
    }

    // Verifica password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide'
      });
    }

    // Controlla se l'account è attivo
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account disattivato. Contatta il supporto.'
      });
    }

    // Aggiorna ultimo accesso
    user.lastLogin = new Date();
    await user.save();

    // Genera token
    const token = generateToken(user._id);

    // Rimuovi password dalla risposta
    const userProfile = user.getPublicProfile();

    res.json({
      success: true,
      message: `Bentornato, ${user.name}!`,
      data: {
        token,
        user: userProfile
      }
    });

  } catch (error) {
    console.error('❌ Errore login:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server durante il login'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Ottieni profilo utente corrente
// @access  Private
router.get('/me', async (req, res) => {
  try {
    // Il middleware auth avrà già verificato il token e aggiunto userId alla req
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    const userProfile = user.getPublicProfile();

    res.json({
      success: true,
      data: {
        user: userProfile
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero profilo:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Aggiorna profilo utente
// @access  Private
router.put('/profile', async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    // Aggiorna solo i campi forniti
    if (name) user.name = name.trim();
    if (phone) user.phone = phone.trim();
    if (address) {
      user.address = {
        ...user.address,
        ...address
      };
    }

    await user.save();

    const userProfile = user.getPublicProfile();

    res.json({
      success: true,
      message: 'Profilo aggiornato con successo',
      data: {
        user: userProfile
      }
    });

  } catch (error) {
    console.error('❌ Errore aggiornamento profilo:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Errori di validazione',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Cambia password utente
// @access  Private
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password attuale e nuova password sono obbligatorie'
      });
    }

    const user = await User.findById(req.userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato'
      });
    }

    // Verifica password attuale
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Password attuale non corretta'
      });
    }

    // Aggiorna password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password aggiornata con successo'
    });

  } catch (error) {
    console.error('❌ Errore cambio password:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Errori di validazione',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

export default router;