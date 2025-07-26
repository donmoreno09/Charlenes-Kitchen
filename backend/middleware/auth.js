import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Middleware per verificare il token JWT
export const authenticate = async (req, res, next) => {
  try {
    // Prendi il token dall'header Authorization
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Accesso negato. Nessun token fornito.'
      });
    }

    // Il token dovrebbe essere nel formato "Bearer <token>"
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accesso negato. Token non valido.'
      });
    }

    try {
      // Verifica il token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Verifica che l'utente esista ancora
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token non valido. Utente non trovato.'
        });
      }

      // Verifica che l'account sia attivo
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account disattivato.'
        });
      }

      // Aggiungi userId alla request per i middleware successivi
      req.userId = decoded.userId;
      req.user = user; // Aggiungi anche l'oggetto user completo
      
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token scaduto. Effettua nuovamente il login.'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Token non valido.'
        });
      } else {
        throw jwtError;
      }
    }

  } catch (error) {
    console.error('❌ Errore middleware autenticazione:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server durante l\'autenticazione'
    });
  }
};

// Middleware per verificare se l'utente è admin
export const requireAdmin = async (req, res, next) => {
  try {
    // Questo middleware deve essere usato dopo authenticate
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticazione richiesta.'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato. Privilegi di amministratore richiesti.'
      });
    }

    next();
  } catch (error) {
    console.error('❌ Errore middleware admin:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server durante la verifica dei privilegi'
    });
  }
};

// Middleware opzionale - aggiunge info utente se il token è presente
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      // Nessun token, continua senza autenticazione
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.userId = decoded.userId;
        req.user = user;
      }
    } catch (jwtError) {
      // Ignora errori di token in modalità opzionale
      console.log('Token opzionale non valido:', jwtError.message);
    }

    next();
  } catch (error) {
    console.error('❌ Errore middleware autenticazione opzionale:', error);
    next(); // Continua anche in caso di errore
  }
};

// Middleware per rate limiting (semplice implementazione in memoria)
const loginAttempts = new Map();

export const loginRateLimit = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minuti
  const maxAttempts = 5;

  if (!loginAttempts.has(clientIP)) {
    loginAttempts.set(clientIP, { count: 1, resetTime: now + windowMs });
    return next();
  }

  const attempts = loginAttempts.get(clientIP);

  if (now > attempts.resetTime) {
    // Reset del contatore
    attempts.count = 1;
    attempts.resetTime = now + windowMs;
    return next();
  }

  if (attempts.count >= maxAttempts) {
    const timeLeft = Math.ceil((attempts.resetTime - now) / 1000 / 60);
    return res.status(429).json({
      success: false,
      message: `Troppi tentativi di login. Riprova tra ${timeLeft} minuti.`
    });
  }

  attempts.count++;
  next();
};

export default { authenticate, requireAdmin, optionalAuth, loginRateLimit };