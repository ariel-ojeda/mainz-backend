// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Usar la clave secreta del archivo .env
const SECRET_KEY = process.env.JWT_SECRET || 'mainz_medical_spa_secret_key_2024';

function verificarToken(req, res, next) {
  // El token se envía en el header "Authorization" con formato "Bearer TOKEN"
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(403).json({ mensaje: 'Token requerido' });
  }

  // Extraer el token (formato: "Bearer TOKEN")
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  if (!token) {
    return res.status(403).json({ mensaje: 'Token requerido' });
  }

  try {
    // Verifica el token con la clave secreta
    const verificado = jwt.verify(token, SECRET_KEY);
    // Guarda los datos del usuario (id, rol, etc.) en la request
    req.usuario = verificado;
    next(); // continúa hacia la ruta protegida
  } catch (err) {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
}

module.exports = verificarToken;
