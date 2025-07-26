import express from 'express';
import mailer from '../config/nodemailer.js';

const router = express.Router();

// @route   POST /api/test/email/connection
// @desc    Test connessione email
// @access  Public (per sviluppo)
router.post('/connection', async (req, res) => {
  try {
    console.log('🔍 Testing email connection...');
    const isConnected = await mailer.verifyConnection();
    
    res.json({ 
      success: isConnected, 
      message: isConnected ? 'Connessione email OK!' : 'Errore connessione email'
    });
  } catch (error) {
    console.error('❌ Errore test connessione:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// @route   POST /api/test/email/send
// @desc    Test invio email semplice
// @access  Public (per sviluppo)
router.post('/send', async (req, res) => {
  try {
    const { to, subject = 'Test da Charlene\'s Kitchen' } = req.body;
    
    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Email destinatario richiesta'
      });
    }

    await mailer.sendMail({
      from: `"Charlene's Kitchen" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html: `
        <h2>🧪 Test Email - Charlene's Kitchen</h2>
        <p>Questa è una email di test.</p>
        <p><strong>✅ Configurazione funzionante!</strong></p>
        <p><small>Timestamp: ${new Date().toLocaleString('it-IT')}</small></p>
      `,
      text: `Test Email - Charlene's Kitchen\n\nConfigurazione funzionante!\nTimestamp: ${new Date().toLocaleString('it-IT')}`
    });

    res.json({
      success: true,
      message: `Email di test inviata a ${to}`
    });

  } catch (error) {
    console.error('❌ Errore invio email:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/test/email/welcome
// @desc    Test email di benvenuto
// @access  Public (per sviluppo)
router.post('/welcome', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email e nome sono richiesti'
      });
    }

    const success = await mailer.sendWelcomeEmail({ email, name });
    
    res.json({
      success,
      message: success ? `Email di benvenuto inviata a ${email}` : 'Errore invio email'
    });
  } catch (error) {
    console.error('❌ Errore test email benvenuto:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;