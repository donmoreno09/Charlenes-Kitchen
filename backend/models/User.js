import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Il nome è obbligatorio'],
    trim: true,
    maxlength: [50, 'Il nome non può superare i 50 caratteri']
  },
  email: {
    type: String,
    required: [true, 'L\'email è obbligatoria'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Inserisci un\'email valida'
    ]
  },
  password: {
    type: String,
    required: [true, 'La password è obbligatoria'],
    minlength: [6, 'La password deve essere di almeno 6 caratteri'],
    select: false // Non includerla di default nelle query
  },
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer'
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[0-9\s\-\(\)]+$/, 'Inserisci un numero di telefono valido']
  },
  address: {
    street: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    zipCode: {
      type: String,
      trim: true
    }
  },
  // Avatar dell'utente (Cloudinary URL)
  avatar: {
    type: String,
    default: null
  },
  // Stato dell'account
  isActive: {
    type: Boolean,
    default: true
  },
  // Token per reset password
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // Data di ultimo accesso
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Aggiunge automaticamente createdAt e updatedAt
});

// Middleware per hash della password prima del salvataggio
userSchema.pre('save', async function(next) {
  // Solo se la password è stata modificata
  if (!this.isModified('password')) return next();
  
  try {
    // Hash della password con salt 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Metodo per confrontare la password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Metodo per ottenere i dati pubblici dell'utente (senza password)
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpire;
  return userObject;
};

// Index per migliorare le performance
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });

export default mongoose.model('User', userSchema);