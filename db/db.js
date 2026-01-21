// =====================================================
// CONEXIÓN A BASE DE DATOS MYSQL
// =====================================================

const mysql = require('mysql2');
require('dotenv').config();

// Crear pool de conexiones para mejor rendimiento
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sistema_gestion',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Promisificar para usar async/await
const promisePool = pool.promise();

// Verificar conexión al iniciar
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Error al conectar a la base de datos:', err.message);
    console.error('Verifica tu archivo .env y que MySQL esté corriendo');
    process.exit(1);
  }
  
  console.log('✅ Conexión exitosa a MySQL');
  console.log(`📊 Base de datos: ${process.env.DB_NAME || 'sistema_gestion'}`);
  connection.release();
});

// Manejo de errores del pool
pool.on('error', (err) => {
  console.error('❌ Error en el pool de MySQL:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Conexión a la base de datos perdida. Reconectando...');
  } else {
    throw err;
  }
});

// Exportar ambas versiones (callback y promise)
module.exports = {
  pool,           // Para usar con callbacks
  promisePool,    // Para usar con async/await
  query: (sql, params) => promisePool.query(sql, params)  // Método directo
};
