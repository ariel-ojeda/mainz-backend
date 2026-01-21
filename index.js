// =====================================================
// SERVIDOR PRINCIPAL - SISTEMA MAINZ MEDICAL SPA
// =====================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARES GLOBALES
// =====================================================

// CORS - Permitir peticiones desde el frontend
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

// Parser de JSON
app.use(express.json());

// Parser de URL encoded
app.use(express.urlencoded({ extended: true }));

// Logger simple de peticiones
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =====================================================
// IMPORTAR ROUTERS
// =====================================================

const clientesRouter = require('./routes/clientes');
const cotizacionesRouter = require('./routes/cotizaciones');
const reportesRouter = require('./routes/reportes');
const usuariosRouter = require('./routes/usuarios');
const productosRouter = require('./routes/productos');
const categoriasRouter = require('./routes/categorias');
const despachosRouter = require('./routes/despachos');

// =====================================================
// RUTAS DE LA API
// =====================================================

// Ruta raíz - Información del API
app.get('/', (req, res) => {
  res.json({
    mensaje: 'API Sistema de Gestión Mainz Medical Spa 🏥',
    version: '1.0.0',
    endpoints: {
      usuarios: '/usuarios',
      clientes: '/clientes',
      productos: '/productos',
      categorias: '/categorias',
      cotizaciones: '/cotizaciones',
      despachos: '/despachos',
      reportes: '/reportes'
    },
    documentacion: 'Ver README.md para más información',
    estado: 'Servidor funcionando correctamente ✅'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Montar routers
app.use('/usuarios', usuariosRouter);
app.use('/clientes', clientesRouter);
app.use('/productos', productosRouter);
app.use('/categorias', categoriasRouter);
app.use('/cotizaciones', cotizacionesRouter);
app.use('/despachos', despachosRouter);
app.use('/reportes', reportesRouter);

// =====================================================
// MANEJO DE ERRORES 404
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    metodo: req.method,
    mensaje: 'El endpoint solicitado no existe'
  });
});

// =====================================================
// MANEJO DE ERRORES GLOBALES
// =====================================================

app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: 'Error del servidor',
    mensaje: err.message || 'Ha ocurrido un error interno',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🏥 SISTEMA MAINZ MEDICAL SPA');
  console.log('='.repeat(50));
  console.log(`🔗 Base de datos: ${process.env.DB_DATABASE || 'railway'}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
  console.log('Endpoints disponibles:');
  console.log(`  - GET  /              (Info del API)`);
  console.log(`  - GET  /health        (Health check)`);
  console.log(`  - POST /usuarios/login (Login)`);
  console.log(`  - *    /clientes      (CRUD Clientes)`);
  console.log(`  - *    /productos     (CRUD Productos)`);
  console.log(`  - *    /categorias    (CRUD Categorías)`);
  console.log(`  - *    /cotizaciones  (CRUD Cotizaciones)`);
  console.log(`  - *    /despachos     (CRUD Despachos)`);
  console.log(`  - GET  /reportes      (Reportes)`);
  console.log('='.repeat(50));
});

// Manejo de cierre graceful
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM recibido, cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT recibido, cerrando servidor...');
  process.exit(0);
});