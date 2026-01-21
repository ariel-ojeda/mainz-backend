// =====================================================
// RUTAS: CLIENTES
// Gestión de clientes (hospitales, clínicas, organismos públicos)
// =====================================================

const express = require('express');
const router = express.Router();
const { promisePool } = require('../db/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'clave_secreta_super_segura';

// =====================================================
// MIDDLEWARE: Verificar Token
// =====================================================
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ mensaje: 'Token requerido' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(403).json({ mensaje: 'Token requerido' });

  try {
    const verificado = jwt.verify(token, SECRET_KEY);
    req.usuario = verificado;
    next();
  } catch (err) {
    res.status(401).json({ mensaje: 'Token inválido' });
  }
}

// =====================================================
// MIDDLEWARE: Solo Admin
// =====================================================
function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ mensaje: 'Acceso denegado: se requiere rol administrador' });
  }
  next();
}

// =====================================================
// FUNCIÓN: Validar RUT Chileno
// =====================================================
function validarRUT(rut) {
  // Eliminar puntos y guión
  const rutLimpio = rut.replace(/\./g, '').replace(/-/g, '');
  
  if (rutLimpio.length < 2) return false;
  
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1).toUpperCase();
  
  // Validar que el cuerpo sean números
  if (!/^\d+$/.test(cuerpo)) return false;
  
  // Calcular dígito verificador
  let suma = 0;
  let multiplicador = 2;
  
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i)) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  
  const dvEsperado = 11 - (suma % 11);
  const dvCalculado = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'K' : dvEsperado.toString();
  
  return dv === dvCalculado;
}

// =====================================================
// FUNCIÓN: Formatear RUT (12345678-9)
// =====================================================
function formatearRUT(rut) {
  const rutLimpio = rut.replace(/\./g, '').replace(/-/g, '');
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1);
  return `${cuerpo}-${dv}`;
}

// =====================================================
// GET /clientes - Listar clientes con paginación y filtros
// =====================================================
router.get('/', verificarToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const nombreFiltro = req.query.nombre || null;
    const rutFiltro = req.query.rut || null;
    const correoFiltro = req.query.correo || null;

    const offset = (page - 1) * limit;

    let sql = 'SELECT * FROM clientes WHERE 1=1';
    let params = [];

    // Filtros opcionales
    if (nombreFiltro) {
      sql += ' AND nombre LIKE ?';
      params.push(`%${nombreFiltro}%`);
    }

    if (rutFiltro) {
      sql += ' AND rut LIKE ?';
      params.push(`%${rutFiltro}%`);
    }

    if (correoFiltro) {
      sql += ' AND correo LIKE ?';
      params.push(`%${correoFiltro}%`);
    }

    sql += ' ORDER BY nombre LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [clientes] = await promisePool.query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(*) AS total FROM clientes WHERE 1=1';
    let countParams = [];

    if (nombreFiltro) {
      countSql += ' AND nombre LIKE ?';
      countParams.push(`%${nombreFiltro}%`);
    }

    if (rutFiltro) {
      countSql += ' AND rut LIKE ?';
      countParams.push(`%${rutFiltro}%`);
    }

    if (correoFiltro) {
      countSql += ' AND correo LIKE ?';
      countParams.push(`%${correoFiltro}%`);
    }

    const [countResult] = await promisePool.query(countSql, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      page,
      limit,
      total,
      totalPages,
      data: clientes
    });
  } catch (err) {
    console.error('Error al listar clientes:', err);
    res.status(500).json({ mensaje: 'Error al listar clientes', error: err.message });
  }
});

// =====================================================
// GET /clientes/:id - Obtener cliente por ID
// =====================================================
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const [clientes] = await promisePool.query(
      'SELECT * FROM clientes WHERE id_cliente = ?',
      [req.params.id]
    );

    if (clientes.length === 0) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    res.json(clientes[0]);
  } catch (err) {
    console.error('Error al obtener cliente:', err);
    res.status(500).json({ mensaje: 'Error al obtener cliente', error: err.message });
  }
});

// =====================================================
// POST /clientes - Crear nuevo cliente (solo admin)
// =====================================================
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { rut, nombre, correo, telefono, direccion } = req.body;

    // Validaciones
    if (!rut || !nombre) {
      return res.status(400).json({ mensaje: 'RUT y nombre son obligatorios' });
    }

    // Validar formato de RUT chileno
    if (!validarRUT(rut)) {
      return res.status(400).json({ mensaje: 'RUT inválido. Formato esperado: 12345678-9' });
    }

    // Formatear RUT
    const rutFormateado = formatearRUT(rut);

    // Validar correo si se proporciona
    if (correo) {
      const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!regexCorreo.test(correo)) {
        return res.status(400).json({ mensaje: 'Formato de correo inválido' });
      }
    }

    // Verificar que el RUT no exista
    const [clientesExistentes] = await promisePool.query(
      'SELECT id_cliente FROM clientes WHERE rut = ?',
      [rutFormateado]
    );

    if (clientesExistentes.length > 0) {
      return res.status(400).json({ mensaje: 'Ya existe un cliente con ese RUT' });
    }

    // Verificar que el correo no exista (si se proporciona)
    if (correo) {
      const [correosExistentes] = await promisePool.query(
        'SELECT id_cliente FROM clientes WHERE correo = ?',
        [correo]
      );

      if (correosExistentes.length > 0) {
        return res.status(400).json({ mensaje: 'Ya existe un cliente con ese correo' });
      }
    }

    // Insertar cliente
    const [result] = await promisePool.query(
      'INSERT INTO clientes (rut, nombre, correo, telefono, direccion) VALUES (?, ?, ?, ?, ?)',
      [rutFormateado, nombre, correo, telefono, direccion]
    );

    res.status(201).json({ 
      mensaje: 'Cliente creado exitosamente',
      id_cliente: result.insertId, 
      rut: rutFormateado,
      nombre,
      correo
    });
  } catch (err) {
    console.error('Error al crear cliente:', err);
    res.status(500).json({ mensaje: 'Error al crear cliente', error: err.message });
  }
});

// =====================================================
// PUT /clientes/:id - Actualizar cliente (solo admin)
// =====================================================
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { rut, nombre, correo, telefono, direccion } = req.body;
    const id = req.params.id;

    // Verificar que el cliente existe
    const [clientesExistentes] = await promisePool.query(
      'SELECT id_cliente FROM clientes WHERE id_cliente = ?',
      [id]
    );

    if (clientesExistentes.length === 0) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    let sql = 'UPDATE clientes SET';
    let params = [];
    let updates = [];

    if (rut) {
      // Validar RUT
      if (!validarRUT(rut)) {
        return res.status(400).json({ mensaje: 'RUT inválido' });
      }

      const rutFormateado = formatearRUT(rut);

      // Verificar que el RUT no esté en uso por otro cliente
      const [rutExistente] = await promisePool.query(
        'SELECT id_cliente FROM clientes WHERE rut = ? AND id_cliente != ?',
        [rutFormateado, id]
      );

      if (rutExistente.length > 0) {
        return res.status(400).json({ mensaje: 'El RUT ya está en uso por otro cliente' });
      }

      updates.push(' rut = ?');
      params.push(rutFormateado);
    }

    if (nombre) {
      updates.push(' nombre = ?');
      params.push(nombre);
    }

    if (correo !== undefined) {
      if (correo) {
        const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regexCorreo.test(correo)) {
          return res.status(400).json({ mensaje: 'Formato de correo inválido' });
        }

        // Verificar que el correo no esté en uso
        const [correoExistente] = await promisePool.query(
          'SELECT id_cliente FROM clientes WHERE correo = ? AND id_cliente != ?',
          [correo, id]
        );

        if (correoExistente.length > 0) {
          return res.status(400).json({ mensaje: 'El correo ya está en uso por otro cliente' });
        }
      }
      updates.push(' correo = ?');
      params.push(correo);
    }

    if (telefono !== undefined) {
      updates.push(' telefono = ?');
      params.push(telefono);
    }

    if (direccion !== undefined) {
      updates.push(' direccion = ?');
      params.push(direccion);
    }

    if (updates.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    sql += updates.join(',') + ' WHERE id_cliente = ?';
    params.push(id);

    await promisePool.query(sql, params);

    res.json({ mensaje: 'Cliente actualizado exitosamente', id_cliente: id });
  } catch (err) {
    console.error('Error al actualizar cliente:', err);
    res.status(500).json({ mensaje: 'Error al actualizar cliente', error: err.message });
  }
});

// =====================================================
// DELETE /clientes/:id - Eliminar cliente (solo admin)
// =====================================================
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // Verificar si el cliente tiene cotizaciones asociadas
    const [cotizaciones] = await promisePool.query(
      'SELECT COUNT(*) as total FROM cotizaciones WHERE id_cliente = ?',
      [id]
    );

    if (cotizaciones[0].total > 0) {
      return res.status(400).json({ 
        mensaje: 'No se puede eliminar el cliente porque tiene cotizaciones asociadas',
        cotizaciones_asociadas: cotizaciones[0].total
      });
    }

    const [result] = await promisePool.query(
      'DELETE FROM clientes WHERE id_cliente = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    res.json({ mensaje: 'Cliente eliminado exitosamente', id_cliente: id });
  } catch (err) {
    console.error('Error al eliminar cliente:', err);
    res.status(500).json({ mensaje: 'Error al eliminar cliente', error: err.message });
  }
});

// =====================================================
// POST /clientes/validar-rut - Validar RUT chileno
// =====================================================
router.post('/validar-rut', (req, res) => {
  try {
    const { rut } = req.body;

    if (!rut) {
      return res.status(400).json({ mensaje: 'RUT es obligatorio' });
    }

    const esValido = validarRUT(rut);
    const rutFormateado = esValido ? formatearRUT(rut) : null;

    res.json({
      valido: esValido,
      rut_formateado: rutFormateado,
      mensaje: esValido ? 'RUT válido' : 'RUT inválido'
    });
  } catch (err) {
    console.error('Error al validar RUT:', err);
    res.status(500).json({ mensaje: 'Error al validar RUT', error: err.message });
  }
});

module.exports = router;
