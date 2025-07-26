import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  // Riferimento all'utente che ha fatto l'ordine
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'utente è obbligatorio']
  },
  
  // Numero ordine unico e leggibile
  orderNumber: {
    type: String,
    unique: true
    // Rimuoviamo required: true perché lo generiamo nel pre-save
  },
  
  // Lista dei prodotti ordinati
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: true // Salviamo il nome per sicurezza
    },
    price: {
      type: Number,
      required: true // Prezzo al momento dell'ordine
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'La quantità deve essere almeno 1']
    },
    subtotal: {
      type: Number,
      required: true
    },
    // Note specifiche per il singolo piatto
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Le note non possono superare i 200 caratteri']
    }
  }],
  
  // Totali dell'ordine
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Tassa (es. IVA)
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Costo di consegna
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Totale finale
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Stato dell'ordine
  status: {
    type: String,
    enum: {
      values: ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled'],
      message: 'Stato ordine non valido'
    },
    default: 'pending'
  },
  
  // Stato del pagamento
  paymentStatus: {
    type: String,
    enum: {
      values: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      message: 'Stato pagamento non valido'
    },
    default: 'pending'
  },
  
  // Metodo di pagamento
  paymentMethod: {
    type: String,
    enum: ['card', 'cash', 'paypal'],
    default: 'card'
  },
  
  // ID del pagamento Stripe
  stripePaymentId: {
    type: String,
    sparse: true // Permette valori nulli ma mantiene unicità
  },
  
  // Tipo di ordine
  orderType: {
    type: String,
    enum: ['delivery', 'pickup', 'dine-in'],
    required: true,
    default: 'delivery'
  },
  
  // Informazioni di consegna
  deliveryInfo: {
    address: {
      street: {
        type: String,
        required: function() {
          return this.orderType === 'delivery';
        }
      },
      city: {
        type: String,
        required: function() {
          return this.orderType === 'delivery';
        }
      },
      zipCode: {
        type: String,
        required: function() {
          return this.orderType === 'delivery';
        }
      }
    },
    // Istruzioni specifiche per la consegna
    instructions: {
      type: String,
      trim: true,
      maxlength: [300, 'Le istruzioni non possono superare i 300 caratteri']
    },
    // Tempo stimato di consegna
    estimatedDeliveryTime: {
      type: Date
    },
    // Tempo effettivo di consegna
    actualDeliveryTime: {
      type: Date
    }
  },
  
  // Informazioni di contatto
  contactInfo: {
    phone: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    }
  },
  
  // Note generali dell'ordine
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Le note non possono superare i 500 caratteri']
  },
  
  // Orario richiesto (per pickup o dine-in)
  requestedTime: {
    type: Date
  },
  
  // Storico degli aggiornamenti di stato
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      trim: true
    }
  }],
  
  // Email di conferma inviata
  confirmationEmailSent: {
    type: Boolean,
    default: false
  },
  
  // Valutazione dell'ordine (da 1 a 5)
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [500, 'Il commento non può superare i 500 caratteri']
    },
    ratedAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Pre-save middleware per generare il numero ordine
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    try {
      // Genera un numero ordine unico (formato: CK-YYYYMMDD-XXXX)
      const today = new Date();
      const dateStr = today.getFullYear().toString() + 
                     (today.getMonth() + 1).toString().padStart(2, '0') + 
                     today.getDate().toString().padStart(2, '0');
      
      // Conta gli ordini di oggi per il numero progressivo
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const todayCount = await this.constructor.countDocuments({
        createdAt: {
          $gte: todayStart,
          $lt: todayEnd
        }
      });
      
      this.orderNumber = `CK-${dateStr}-${(todayCount + 1).toString().padStart(4, '0')}`;
      
      // Aggiungi il primo stato alla cronologia
      if (this.statusHistory.length === 0) {
        this.statusHistory.push({
          status: this.status,
          timestamp: new Date(),
          note: 'Ordine creato'
        });
      }
    } catch (error) {
      console.error('Errore generazione orderNumber:', error);
      return next(error);
    }
  }
  
  next();
});

// Middleware per aggiornare la cronologia degli stati
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      note: `Stato aggiornato a: ${this.status}`
    });
  }
  next();
});

// Index per performance
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Metodi statici
orderSchema.statics.getOrdersByUser = function(userId, limit = 10) {
  return this.find({ userId })
             .populate('items.productId', 'name image')
             .sort({ createdAt: -1 })
             .limit(limit);
};

orderSchema.statics.getTodayOrders = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    createdAt: {
      $gte: today,
      $lt: tomorrow
    }
  }).populate('userId', 'name email phone')
    .populate('items.productId', 'name image')
    .sort({ createdAt: -1 });
};

// Metodi di istanza
orderSchema.methods.updateStatus = function(newStatus, note = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note: note
  });
  return this.save();
};

orderSchema.methods.calculateTotal = function() {
  this.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
  this.totalAmount = this.subtotal + this.tax + this.deliveryFee;
  return this.totalAmount;
};

export default mongoose.model('Order', orderSchema);