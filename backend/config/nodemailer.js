import nodemailer from 'nodemailer';

// Validazione configurazione
if (!process.env.EMAIL_PASSWORD || !process.env.EMAIL_FROM) {
  throw new Error('Configurazione email mancante');
}

// Rate limiting semplice
const emailCache = new Map();
const canSendEmail = (email, type) => {
  const key = `${email}-${type}`;
  const lastSent = emailCache.get(key);
  const now = Date.now();
  
  if (lastSent && (now - lastSent) < 5 * 60 * 1000) {
    return false;
  }
  
  emailCache.set(key, now);
  return true;
};

// Configurazione del trasporto email con gestione SSL corretta
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true', // false per porta 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  // ✅ Configurazione TLS per SendGrid
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    minVersion: 'TLSv1.2'
  },
  // Timeout maggiore
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
  // // Debug per troubleshooting
  // debug: process.env.NODE_ENV === 'development',
  // logger: process.env.NODE_ENV === 'development'
});

// Funzione per inviare email con retry logic
const sendMail = async (mailOptions, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email inviata (tentativo ${i + 1}): %s`, info.messageId);
      return info;
    } catch (error) {
      console.error(`❌ Errore invio email (tentativo ${i + 1}):`, error.message);
      
      if (i === retries - 1) {
        // Ultimo tentativo fallito
        throw error;
      }
      
      // Attendi prima del prossimo tentativo
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Funzione di verifica della connessione con timeout
const verifyConnection = async () => {
  try {
    console.log('🔍 Verificando connessione email...');
    
    // Timeout di 5 secondi per la verifica
    const verifyPromise = transporter.verify();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout verifica connessione')), 5000);
    });
    
    await Promise.race([verifyPromise, timeoutPromise]);
    
    console.log('✅ Connessione email verificata');
    return true;
  } catch (error) {
    console.error('❌ Errore verifica connessione email:', error.message);
    return false;
  }
};

// Template email di benvenuto
const sendWelcomeEmail = async (user) => {
  try {
    // Validazione
    if (!user?.email || !user?.name) {
      throw new Error('Dati utente mancanti');
    }
    
    // Rate limiting
    if (!canSendEmail(user.email, 'welcome')) {
      console.log('⏱️ Email welcome saltata (rate limit)');
      return true;
    }
    
    const mailOptions = {
      from: `"Charlene's Kitchen" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Benvenuto in Charlene's Kitchen! 🍕`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Benvenuto in Charlene's Kitchen!</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">La tua avventura culinaria inizia qui</p>
          </div>
          
          <div style="padding: 40px 20px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Ciao ${user.name}! 👋</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              Grazie per esserti registrato! Siamo entusiasti di averti nella famiglia di Charlene's Kitchen.
            </p>
            
            <div style="background: white; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #333; margin-top: 0;">Cosa puoi fare ora:</h3>
              <ul style="color: #666; line-height: 1.8;">
                <li>🍝 Esplora il nostro menu con specialità italiane</li>
                <li>🛒 Ordina online per consegna o ritiro</li>
                <li>⭐ Lascia recensioni sui tuoi piatti preferiti</li>
                <li>🎉 Ricevi offerte esclusive e novità</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/menu" 
                 style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                Esplora il Menu
              </a>
            </div>
            
            <p style="color: #999; font-size: 14px; text-align: center; margin-top: 40px;">
              Grazie per aver scelto Charlene's Kitchen!
            </p>
          </div>
        </div>
      `,
      text: `
        Benvenuto in Charlene's Kitchen, ${user.name}!
        
        Grazie per esserti registrato! 
        
        Cosa puoi fare ora:
        - Esplora il nostro menu con specialità italiane
        - Ordina online per consegna o ritiro  
        - Lascia recensioni sui tuoi piatti preferiti
        - Ricevi offerte esclusive e novità
        
        Visita il nostro menu: ${process.env.FRONTEND_URL}/menu
        
        Grazie per aver scelto Charlene's Kitchen!
      `
    };
    
    await sendMail(mailOptions);
    console.log(`✅ Email di benvenuto inviata a ${user.email}`);
    return true;
  } catch (error) {
    console.error('❌ Errore invio email di benvenuto:', error.message);
    return false;
  }
};

// Template email conferma ordine
const sendOrderConfirmationEmail = async (order, user) => {
  try {
    const mailOptions = {
      from: `"Charlene's Kitchen" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Conferma Ordine ${order.orderNumber} - Charlene's Kitchen`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #28a745; padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Ordine Confermato! ✅</h1>
            <p style="color: white; margin: 10px 0 0 0;">Ordine #${order.orderNumber}</p>
          </div>
          
          <div style="padding: 30px 20px; background: #f8f9fa;">
            <h2 style="color: #333;">Ciao ${user.name}!</h2>
            <p style="color: #666; margin-bottom: 25px;">
              Il tuo ordine è stato ricevuto e confermato. Stiamo preparando tutto con cura!
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">📋 Dettagli Ordine</h3>
              <p><strong>Numero:</strong> ${order.orderNumber}</p>
              <p><strong>Tipo:</strong> ${order.orderType === 'delivery' ? '🚚 Consegna' : '🏃 Ritiro'}</p>
              <p><strong>Totale:</strong> €${order.totalAmount.toFixed(2)}</p>
              
              <h4>Prodotti ordinati:</h4>
              ${order.items.map(item => `
                <div style="border-bottom: 1px solid #eee; padding: 8px 0;">
                  <strong>${item.name}</strong> x${item.quantity} - €${item.subtotal.toFixed(2)}
                </div>
              `).join('')}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/orders/${order._id}" 
                 style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                Traccia il tuo Ordine
              </a>
            </div>
            
            <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
              Grazie per aver scelto Charlene's Kitchen!
            </p>
          </div>
        </div>
      `,
      text: `
        Ordine Confermato - ${order.orderNumber}
        
        Ciao ${user.name}!
        
        Il tuo ordine è stato confermato.
        Totale: €${order.totalAmount.toFixed(2)}
        
        Traccia il tuo ordine: ${process.env.FRONTEND_URL}/orders/${order._id}
        
        Grazie per aver scelto Charlene's Kitchen!
      `
    };
    
    await sendMail(mailOptions);
    console.log(`✅ Email conferma ordine inviata a ${user.email}`);
    return true;
  } catch (error) {
    console.error('❌ Errore invio email conferma ordine:', error.message);
    return false;
  }
};

// Template email aggiornamento stato ordine
const sendOrderStatusUpdateEmail = async (order, user, newStatus) => {
  // Non inviare email per pending
  if (newStatus === 'pending') return true;
  
  const statusMessages = {
    confirmed: { emoji: '✅', message: 'Il tuo ordine è stato confermato!' },
    preparing: { emoji: '👨‍🍳', message: 'Il nostro chef sta preparando il tuo ordine!' },
    ready: { emoji: '🍽️', message: 'Il tuo ordine è pronto!' },
    'out-for-delivery': { emoji: '🚚', message: 'Il tuo ordine è in consegna!' },
    delivered: { emoji: '🎉', message: 'Il tuo ordine è stato consegnato!' }
  };
  
  const statusInfo = statusMessages[newStatus] || { emoji: '📋', message: 'Aggiornamento ordine' };
  
  try {
    const mailOptions = {
      from: `"Charlene's Kitchen" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `${statusInfo.emoji} ${statusInfo.message} - Ordine ${order.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #667eea; padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">${statusInfo.emoji} ${statusInfo.message}</h1>
            <p style="color: white; margin: 10px 0 0 0;">Ordine #${order.orderNumber}</p>
          </div>
          
          <div style="padding: 30px 20px; background: #f8f9fa;">
            <h2 style="color: #333;">Ciao ${user.name}!</h2>
            <p style="color: #666; font-size: 16px; margin-bottom: 25px;">
              ${statusInfo.message}
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/orders/${order._id}" 
                 style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                Visualizza Dettagli
              </a>
            </div>
            
            <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
              Grazie per aver scelto Charlene's Kitchen!
            </p>
          </div>
        </div>
      `,
      text: `
        ${statusInfo.message}
        
        Ciao ${user.name}!
        
        Il tuo ordine ${order.orderNumber} ha cambiato stato: ${newStatus}
        
        Visualizza: ${process.env.FRONTEND_URL}/orders/${order._id}
        
        Grazie per aver scelto Charlene's Kitchen!
      `
    };
    
    await sendMail(mailOptions);
    console.log(`✅ Email aggiornamento stato inviata a ${user.email}`);
    return true;
  } catch (error) {
    console.error('❌ Errore invio email aggiornamento stato:', error.message);
    return false;
  }
};

const mailer = {
  sendMail,
  verifyConnection,
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail
};

export default mailer;