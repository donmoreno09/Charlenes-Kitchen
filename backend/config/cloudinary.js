import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configurazione Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage per prodotti
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'charlenes-kitchen/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 800, height: 600, crop: 'fill', quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Storage per avatar utenti
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'charlenes-kitchen/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { width: 300, height: 300, crop: 'fill', quality: 'auto', radius: 'max' },
      { fetch_format: 'auto' }
    ]
  }
});

// Middleware multer per upload prodotti
export const uploadProductImage = multer({
  storage: productStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // Controlla tipo file
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo file immagine sono permessi!'), false);
    }
  }
});

// Middleware multer per upload avatar
export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB max per avatar
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo file immagine sono permessi per l\'avatar!'), false);
    }
  }
});

// Funzione per eliminare immagine da Cloudinary
export const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Errore eliminazione immagine Cloudinary:', error);
    throw error;
  }
};

// Funzione per ottimizzare URL immagine
export const optimizeImageUrl = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto',
    fetch_format: 'auto',
    width: 400,
    height: 300,
    crop: 'fill'
  };
  
  const finalOptions = { ...defaultOptions, ...options };
  
  return cloudinary.url(publicId, finalOptions);
};

// Funzione per generare multiple dimensioni
export const generateImageSizes = (publicId) => {
  return {
    thumbnail: cloudinary.url(publicId, {
      width: 150,
      height: 150,
      crop: 'fill',
      quality: 'auto',
      fetch_format: 'auto'
    }),
    medium: cloudinary.url(publicId, {
      width: 400,
      height: 300,
      crop: 'fill',
      quality: 'auto',
      fetch_format: 'auto'
    }),
    large: cloudinary.url(publicId, {
      width: 800,
      height: 600,
      crop: 'fill',
      quality: 'auto',
      fetch_format: 'auto'
    }),
    original: cloudinary.url(publicId, {
      quality: 'auto',
      fetch_format: 'auto'
    })
  };
};

// Validazione configurazione
export const validateCloudinaryConfig = () => {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Configurazione Cloudinary mancante: ${missing.join(', ')}`);
  }
  
  console.log('✅ Cloudinary configurato correttamente');
  return true;
};

export default cloudinary;