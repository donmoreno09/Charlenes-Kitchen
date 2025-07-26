import express from 'express';
import Product from '../models/Product.js';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/products
// @desc    Ottieni tutti i prodotti con filtri opzionali
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      category, 
      available, 
      search, 
      sort = 'name',
      order = 'asc',
      page = 1,
      limit = 20,
      dietaryOptions
    } = req.query;

    // Costruisci il filtro
    let filter = { status: 'published' };

    // Filtro per categoria
    if (category) {
      filter.category = category;
    }

    // Filtro per disponibilità
    if (available !== undefined) {
      filter.available = available === 'true';
    }

    // Filtro per opzioni dietetiche
    if (dietaryOptions) {
      const options = dietaryOptions.split(',');
      filter.dietaryOptions = { $in: options };
    }

    // Ricerca testuale
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ingredients: { $regex: search, $options: 'i' } }
      ];
    }

    // Costruisci l'ordinamento
    const sortOrder = order === 'desc' ? -1 : 1;
    let sortObj = {};
    
    switch (sort) {
      case 'price':
        sortObj.price = sortOrder;
        break;
      case 'rating':
        sortObj['rating.average'] = sortOrder;
        break;
      case 'popular':
        sortObj.orderCount = -1; // Sempre decrescente per popolarità
        break;
      case 'newest':
        sortObj.createdAt = -1;
        break;
      default:
        sortObj.name = sortOrder;
    }

    // Paginazione
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Query principale
    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Conta totale per paginazione
    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    // Aggiungi info se l'utente è autenticato
    let responseData = {
      success: true,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalProducts: total,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        },
        filters: {
          category,
          available,
          search,
          dietaryOptions,
          sort,
          order
        }
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Errore recupero prodotti:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server durante il recupero dei prodotti'
    });
  }
});

// @route   GET /api/products/categories
// @desc    Ottieni tutte le categorie disponibili
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { 
      status: 'published',
      available: true 
    });

    res.json({
      success: true,
      data: {
        categories: categories.sort()
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero categorie:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   GET /api/products/featured
// @desc    Ottieni prodotti in evidenza (più ordinati)
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const featuredProducts = await Product.find({
      status: 'published',
      available: true
    })
    .sort({ orderCount: -1, 'rating.average': -1 })
    .limit(limit)
    .lean();

    res.json({
      success: true,
      data: {
        products: featuredProducts
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero prodotti in evidenza:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   GET /api/products/:id
// @desc    Ottieni singolo prodotto per ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findOne({
      _id: id,
      status: 'published'
    }).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Prodotto non trovato'
      });
    }

    res.json({
      success: true,
      data: {
        product
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero prodotto:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID prodotto non valido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// ============= ADMIN ROUTES =============

// @route   POST /api/products
// @desc    Crea nuovo prodotto (solo admin)
// @access  Private/Admin
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category,
      image,
      cloudinaryId,
      ingredients,
      allergens,
      dietaryOptions,
      nutrition,
      preparationTime,
      difficulty,
      servings
    } = req.body;

    // Validazione base
    if (!name || !description || !price || !category || !image) {
      return res.status(400).json({
        success: false,
        message: 'Nome, descrizione, prezzo, categoria e immagine sono obbligatori'
      });
    }

    // Controlla se esiste già un prodotto con lo stesso nome
    const existingProduct = await Product.findOne({ 
      name: name.trim(),
      status: { $ne: 'archived' }
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Un prodotto con questo nome esiste già'
      });
    }

    // Crea il prodotto
    const product = new Product({
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      category,
      image,
      cloudinaryId: cloudinaryId || '',
      ingredients: ingredients || [],
      allergens: allergens || [],
      dietaryOptions: dietaryOptions || [],
      nutrition: nutrition || {},
      preparationTime: preparationTime || 30,
      difficulty: difficulty || 'medio',
      servings: servings || 1,
      status: 'published'
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Prodotto creato con successo',
      data: {
        product
      }
    });

  } catch (error) {
    console.error('❌ Errore creazione prodotto:', error);
    
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
      message: 'Errore interno del server durante la creazione del prodotto'
    });
  }
});

// @route   PUT /api/products/:id
// @desc    Aggiorna prodotto (solo admin)
// @access  Private/Admin
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Rimuovi campi che non devono essere aggiornati direttamente
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.orderCount;
    delete updateData.rating;

    const product = await Product.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Prodotto non trovato'
      });
    }

    res.json({
      success: true,
      message: 'Prodotto aggiornato con successo',
      data: {
        product
      }
    });

  } catch (error) {
    console.error('❌ Errore aggiornamento prodotto:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Errori di validazione',
        errors: messages
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID prodotto non valido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   DELETE /api/products/:id
// @desc    Elimina prodotto (soft delete - solo admin)
// @access  Private/Admin
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndUpdate(
      id,
      { 
        status: 'archived',
        available: false 
      },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Prodotto non trovato'
      });
    }

    res.json({
      success: true,
      message: 'Prodotto archiviato con successo',
      data: {
        product
      }
    });

  } catch (error) {
    console.error('❌ Errore eliminazione prodotto:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID prodotto non valido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   PATCH /api/products/:id/availability
// @desc    Cambia disponibilità prodotto (solo admin)
// @access  Private/Admin
router.patch('/:id/availability', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { available } = req.body;

    if (typeof available !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Il campo available deve essere true o false'
      });
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { available },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Prodotto non trovato'
      });
    }

    res.json({
      success: true,
      message: `Prodotto ${available ? 'reso disponibile' : 'reso non disponibile'}`,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          available: product.available
        }
      }
    });

  } catch (error) {
    console.error('❌ Errore cambio disponibilità:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

export default router;