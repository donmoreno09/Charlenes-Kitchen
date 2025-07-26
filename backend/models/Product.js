import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Il nome del prodotto è obbligatorio'],
    trim: true,
    maxlength: [100, 'Il nome non può superare i 100 caratteri']
  },
  description: {
    type: String,
    required: [true, 'La descrizione è obbligatoria'],
    trim: true,
    maxlength: [500, 'La descrizione non può superare i 500 caratteri']
  },
  price: {
    type: Number,
    required: [true, 'Il prezzo è obbligatorio'],
    min: [0, 'Il prezzo non può essere negativo'],
    validate: {
      validator: function(v) {
        return /^\d+(\.\d{1,2})?$/.test(v.toString());
      },
      message: 'Il prezzo deve avere massimo 2 decimali'
    }
  },
  category: {
    type: String,
    required: [true, 'La categoria è obbligatoria'],
    enum: {
      values: ['antipasti', 'primi', 'secondi', 'contorni', 'dolci', 'bevande', 'vini'],
      message: 'Categoria non valida'
    }
  },
  // URL dell'immagine da Cloudinary
  image: {
    type: String,
    required: [true, 'L\'immagine è obbligatoria']
  },
  // ID pubblico Cloudinary per gestione immagini
  cloudinaryId: {
    type: String,
    required: true
  },
  // Disponibilità del prodotto
  available: {
    type: Boolean,
    default: true
  },
  // Ingredienti principali
  ingredients: [{
    type: String,
    trim: true
  }],
  // Allergeni
  allergens: [{
    type: String,
    enum: ['glutine', 'uova', 'latte', 'noci', 'arachidi', 'soia', 'pesce', 'molluschi', 'sedano', 'senape', 'sesamo', 'solfiti', 'lupini'],
    message: 'Allergene non riconosciuto'
  }],
  // Opzioni dietetiche
  dietaryOptions: [{
    type: String,
    enum: ['vegetariano', 'vegano', 'senza glutine', 'senza lattosio'],
    message: 'Opzione dietetica non riconosciuta'
  }],
  // Informazioni nutrizionali (opzionali)
  nutrition: {
    calories: {
      type: Number,
      min: 0
    },
    protein: {
      type: Number,
      min: 0
    },
    carbs: {
      type: Number,
      min: 0
    },
    fat: {
      type: Number,
      min: 0
    }
  },
  // Tempo di preparazione in minuti
  preparationTime: {
    type: Number,
    min: [1, 'Il tempo di preparazione deve essere almeno 1 minuto'],
    max: [180, 'Il tempo di preparazione non può superare 3 ore']
  },
  // Difficoltà di preparazione
  difficulty: {
    type: String,
    enum: ['facile', 'medio', 'difficile'],
    default: 'medio'
  },
  // Porzioni per piatto
  servings: {
    type: Number,
    min: 1,
    default: 1
  },
  // Stato del prodotto
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },
  // Rating medio del prodotto
  rating: {
    average: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  // Contatore ordini per statistiche
  orderCount: {
    type: Number,
    default: 0
  },
  // Chef che ha creato il piatto (per future implementazioni)
  chef: {
    type: String,
    trim: true,
    default: 'Charlene'
  }
}, {
  timestamps: true
});

// Index per migliorare le performance
productSchema.index({ category: 1, available: 1 });
productSchema.index({ price: 1 });
productSchema.index({ name: 'text', description: 'text' }); // Per ricerca testuale
productSchema.index({ 'rating.average': -1 });
productSchema.index({ orderCount: -1 });

// Metodo per ottenere prodotti per categoria
productSchema.statics.getByCategory = function(category) {
  return this.find({ 
    category: category, 
    available: true,
    status: 'published' 
  }).sort({ orderCount: -1, createdAt: -1 });
};

// Metodo per ricerca prodotti
productSchema.statics.searchProducts = function(searchTerm) {
  return this.find({
    $and: [
      { available: true, status: 'published' },
      {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { description: { $regex: searchTerm, $options: 'i' } },
          { ingredients: { $regex: searchTerm, $options: 'i' } }
        ]
      }
    ]
  });
};

// Middleware per aggiornare il rating
productSchema.methods.updateRating = function(newRating) {
  const currentTotal = this.rating.average * this.rating.count;
  this.rating.count += 1;
  this.rating.average = (currentTotal + newRating) / this.rating.count;
  return this.save();
};

export default mongoose.model('Product', productSchema);