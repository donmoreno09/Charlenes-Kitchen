import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// ============= CUSTOMER ROUTES =============

// @route   POST /api/orders
// @desc    Crea nuovo ordine
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      items,
      orderType = 'delivery',
      deliveryInfo,
      contactInfo,
      notes,
      requestedTime
    } = req.body;

    // Validazione input base
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Almeno un prodotto è richiesto per l\'ordine'
      });
    }

    if (!contactInfo || !contactInfo.phone || !contactInfo.email) {
      return res.status(400).json({
        success: false,
        message: 'Informazioni di contatto (telefono ed email) sono obbligatorie'
      });
    }

    // Validazione delivery info per consegne
    if (orderType === 'delivery') {
      if (!deliveryInfo || !deliveryInfo.address || 
          !deliveryInfo.address.street || !deliveryInfo.address.city || !deliveryInfo.address.zipCode) {
        return res.status(400).json({
          success: false,
          message: 'Indirizzo di consegna completo richiesto per le consegne'
        });
      }
    }

    // Verifica e calcola i prodotti
    let calculatedItems = [];
    let subtotal = 0;

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'ProductId e quantity validi sono richiesti per ogni prodotto'
        });
      }

      // Trova il prodotto e verifica disponibilità
      const product = await Product.findOne({
        _id: item.productId,
        available: true,
        status: 'published'
      });

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Prodotto non disponibile: ${item.productId}`
        });
      }

      const itemSubtotal = product.price * item.quantity;
      subtotal += itemSubtotal;

      calculatedItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: itemSubtotal,
        notes: item.notes || ''
      });

      // Aggiorna contatore ordini del prodotto
      product.orderCount += item.quantity;
      await product.save();
    }

    // Calcola tasse e costi di consegna
    const taxRate = 0.10; // 10% IVA
    const tax = subtotal * taxRate;
    const deliveryFee = orderType === 'delivery' ? 3.50 : 0;
    const totalAmount = subtotal + tax + deliveryFee;

    // Stima tempo di consegna/preparazione
    const estimatedTime = new Date();
    const preparationMinutes = orderType === 'delivery' ? 45 : 30;
    estimatedTime.setMinutes(estimatedTime.getMinutes() + preparationMinutes);

    // Crea l'ordine
    const order = new Order({
      userId: req.userId,
      items: calculatedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      deliveryFee,
      totalAmount: Math.round(totalAmount * 100) / 100,
      orderType,
      deliveryInfo: orderType === 'delivery' ? {
        address: deliveryInfo.address,
        instructions: deliveryInfo.instructions || '',
        estimatedDeliveryTime: estimatedTime
      } : undefined,
      contactInfo: {
        phone: contactInfo.phone,
        email: contactInfo.email
      },
      notes: notes || '',
      requestedTime: requestedTime ? new Date(requestedTime) : undefined,
      status: 'pending',
      paymentStatus: 'pending'
    });

    await order.save();

    // Popola i dati del prodotto per la risposta
    await order.populate('items.productId', 'name image category');
    await order.populate('userId', 'name email');

    res.status(201).json({
      success: true,
      message: 'Ordine creato con successo',
      data: {
        order
      }
    });

  } catch (error) {
    console.error('❌ Errore creazione ordine:', error);
    
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
      message: 'Errore interno del server durante la creazione dell\'ordine'
    });
  }
});

// @route   GET /api/orders
// @desc    Ottieni ordini dell'utente corrente
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Costruisci filtro
    let filter = { userId: req.userId };
    if (status) {
      filter.status = status;
    }

    // Ordinamento
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortOrder };

    // Paginazione
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const orders = await Order.find(filter)
      .populate('items.productId', 'name image category')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalOrders: total,
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero ordini:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   GET /api/orders/:id
// @desc    Ottieni dettaglio ordine
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      _id: id,
      userId: req.userId
    })
    .populate('items.productId', 'name image category description')
    .populate('userId', 'name email phone')
    .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Ordine non trovato'
      });
    }

    res.json({
      success: true,
      data: {
        order
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero ordine:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID ordine non valido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   PATCH /api/orders/:id/cancel
// @desc    Cancella ordine (solo se pending)
// @access  Private
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      _id: id,
      userId: req.userId
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Ordine non trovato'
      });
    }

    // Può essere cancellato solo se pending o confirmed
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'L\'ordine non può essere cancellato in questo stato'
      });
    }

    order.status = 'cancelled';
    order.statusHistory.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: 'Cancellato dal cliente'
    });

    await order.save();

    res.json({
      success: true,
      message: 'Ordine cancellato con successo',
      data: {
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status
        }
      }
    });

  } catch (error) {
    console.error('❌ Errore cancellazione ordine:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// ============= ADMIN ROUTES =============

// @route   GET /api/orders/admin/all
// @desc    Ottieni tutti gli ordini (admin dashboard)
// @access  Private/Admin
router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { 
      status, 
      orderType,
      date,
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    // Costruisci filtro
    let filter = {};
    
    if (status) filter.status = status;
    if (orderType) filter.orderType = orderType;
    
    // Filtro per data
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      filter.createdAt = {
        $gte: startDate,
        $lt: endDate
      };
    }

    // Ordinamento
    const sortOrder = order === 'asc' ? 1 : -1;
    const sortObj = { [sortBy]: sortOrder };

    // Paginazione
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const orders = await Order.find(filter)
      .populate('userId', 'name email phone')
      .populate('items.productId', 'name category')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await Order.countDocuments(filter);

    // Statistiche veloci
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: todayStart, $lte: todayEnd }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    const stats = todayStats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      completedOrders: 0
    };

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalOrders: total,
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        },
        todayStats: {
          totalOrders: stats.totalOrders,
          totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
          pendingOrders: stats.pendingOrders,
          completedOrders: stats.completedOrders
        }
      }
    });

  } catch (error) {
    console.error('❌ Errore recupero ordini admin:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   PATCH /api/orders/:id/status
// @desc    Aggiorna stato ordine (admin)
// @access  Private/Admin
router.patch('/:id/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note = '' } = req.body;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out-for-delivery', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Stato non valido',
        validStatuses
      });
    }

    const order = await Order.findById(id)
      .populate('userId', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Ordine non trovato'
      });
    }

    // Aggiorna stato
    const oldStatus = order.status;
    order.status = status;

    // Aggiungi alla cronologia
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || `Stato aggiornato da ${oldStatus} a ${status}`
    });

    // Aggiorna timestamp specifici
    if (status === 'delivered') {
      order.deliveryInfo.actualDeliveryTime = new Date();
    }

    await order.save();

    res.json({
      success: true,
      message: `Stato ordine aggiornato a: ${status}`,
      data: {
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          statusHistory: order.statusHistory,
          customer: order.userId
        }
      }
    });

  } catch (error) {
    console.error('❌ Errore aggiornamento stato:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID ordine non valido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

// @route   GET /api/orders/admin/statistics
// @desc    Statistiche ordini (admin)
// @access  Private/Admin
router.get('/admin/statistics', authenticate, requireAdmin, async (req, res) => {
  try {
    const { period = 'week' } = req.query;

    // Calcola date di inizio e fine
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Statistiche generali
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          deliveryOrders: {
            $sum: { $cond: [{ $eq: ['$orderType', 'delivery'] }, 1, 0] }
          },
          pickupOrders: {
            $sum: { $cond: [{ $eq: ['$orderType', 'pickup'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    // Prodotti più ordinati
    const topProducts = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ]);

    const result = stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      deliveryOrders: 0,
      pickupOrders: 0,
      cancelledOrders: 0
    };

    res.json({
      success: true,
      data: {
        period,
        statistics: {
          ...result,
          totalRevenue: Math.round(result.totalRevenue * 100) / 100,
          averageOrderValue: Math.round(result.averageOrderValue * 100) / 100
        },
        topProducts
      }
    });

  } catch (error) {
    console.error('❌ Errore statistiche ordini:', error);
    res.status(500).json({
      success: false,
      message: 'Errore interno del server'
    });
  }
});

export default router;