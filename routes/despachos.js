// =====================================================
// RUTAS: DESPACHOS
// Gestión de despachos de cotizaciones aprobadas
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
// GET /despachos - Listar despachos con paginación
// =====================================================
router.get('/', verificarToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const estadoFiltro = req.query.estado || null;
    const fechaDesde = req.query.fecha_desde || null;
    const fechaHasta = req.query.fecha_hasta || null;

    const offset = (page - 1) * limit;

    let sql = `SELECT 
                 d.*,
                 c.id_cotizacion,
                 c.fecha_emision as cotizacion_fecha,
                 c.total as cotizacion_total,
                 cl.nombre as cliente_nombre,
                 cl.rut as cliente_rut
               FROM despacho d
               INNER JOIN cotizaciones c ON d.id_cotizacion = c.id_cotizacion
               INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
               WHERE 1=1`;
    let params = [];

    if (estadoFiltro) {
      sql += ' AND d.estado = ?';
      params.push(estadoFiltro);
    }

    if (fechaDesde) {
      sql += ' AND d.fecha_envio >= ?';
      params.push(fechaDesde);
    }

    if (fechaHasta) {
      sql += ' AND d.fecha_envio <= ?';
      params.push(fechaHasta);
    }

    sql += ' ORDER BY d.fecha_envio DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [despachos] = await promisePool.query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(*) AS total FROM despacho d WHERE 1=1';
    let countParams = [];

    if (estadoFiltro) {
      countSql += ' AND d.estado = ?';
      countParams.push(estadoFiltro);
    }

    if (fechaDesde) {
      countSql += ' AND d.fecha_envio >= ?';
      countParams.push(fechaDesde);
    }

    if (fechaHasta) {
      countSql += ' AND d.fecha_envio <= ?';
      countParams.push(fechaHasta);
    }

    const [countResult] = await promisePool.query(countSql, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      page,
      limit,
      total,
      totalPages,
      data: despachos
    });
  } catch (err) {
    console.error('Error al listar despachos:', err);
    res.status(500).json({ mensaje: 'Error al listar despachos', error: err.message });
  }
});

// =====================================================
// GET /despachos/:id - Obtener despacho por ID
// =====================================================
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const [despachos] = await promisePool.query(
      `SELECT 
         d.*,
         c.id_cotizacion,
         c.fecha_emision,
         c.total,
         cl.nombre as cliente_nombre,
         cl.rut as cliente_rut,
         cl.correo as cliente_correo,
         cl.telefono as cliente_telefono
       FROM despacho d
       INNER JOIN cotizaciones c ON d.id_cotizacion = c.id_cotizacion
       INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
       WHERE d.id_despacho = ?`,
      [req.params.id]
    );

    if (despachos.length === 0) {
      return res.status(404).json({ mensaje: 'Despacho no encontrado' });
    }

    res.json(despachos[0]);
  } catch (err) {
    console.error('Error al obtener despacho:', err);
    res.status(500).json({ mensaje: 'Error al obtener despacho', error: err.message });
  }
});

// =====================================================
// GET /despachos/cotizacion/:id_cotizacion - Obtener despacho por cotización
// =====================================================
router.get('/cotizacion/:id_cotizacion', verificarToken, async (req, res) => {
  try {
    const [despachos] = await promisePool.query(
      'SELECT * FROM despacho WHERE id_cotizacion = ?',
      [req.params.id_cotizacion]
    );

    if (despachos.length === 0) {
      return res.status(404).json({ mensaje: 'No hay despacho para esta cotización' });
    }

    res.json(despachos[0]);
  } catch (err) {
    console.error('Error al obtener despacho:', err);
    res.status(500).json({ mensaje: 'Error al obtener despacho', error: err.message });
  }
});

// =====================================================
// POST /despachos - Crear nuevo despacho (solo admin)
// =====================================================
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { 
      id_cotizacion, 
      fecha_envio, 
      fecha_entrega_estimada,
      direccion_envio,
      tracking_number,
      observaciones 
    } = req.body;

    // Validaciones
    if (!id_cotizacion || !fecha_envio || !direccion_envio) {
      return res.status(400).json({ 
        mensaje: 'id_cotizacion, fecha_envio y direccion_envio son obligatorios' 
      });
    }

    // Verificar que la cotización existe y está aprobada
    const [cotizaciones] = await promisePool.query(
      'SELECT estado FROM cotizaciones WHERE id_cotizacion = ?',
      [id_cotizacion]
    );

    if (cotizaciones.length === 0) {
      return res.status(404).json({ mensaje: 'Cotización no encontrada' });
    }

    if (cotizaciones[0].estado !== 'aprobada' && cotizaciones[0].estado !== 'enviada') {
      return res.status(400).json({ 
        mensaje: 'Solo se pueden crear despachos para cotizaciones aprobadas',
        estado_actual: cotizaciones[0].estado
      });
    }

    // Verificar que no exista ya un despacho para esta cotización
    const [despachosExistentes] = await promisePool.query(
      'SELECT id_despacho FROM despacho WHERE id_cotizacion = ?',
      [id_cotizacion]
    );

    if (despachosExistentes.length > 0) {
      return res.status(400).json({ 
        mensaje: 'Ya existe un despacho para esta cotización',
        id_despacho: despachosExistentes[0].id_despacho
      });
    }

    // Insertar despacho
    const [result] = await promisePool.query(
      `INSERT INTO despacho 
       (id_cotizacion, fecha_envio, fecha_entrega_estimada, direccion_envio, tracking_number, observaciones, estado) 
       VALUES (?, ?, ?, ?, ?, ?, 'preparando')`,
      [id_cotizacion, fecha_envio, fecha_entrega_estimada, direccion_envio, tracking_number, observaciones]
    );

    // Actualizar estado de la cotización a 'enviada'
    await promisePool.query(
      'UPDATE cotizaciones SET estado = "enviada" WHERE id_cotizacion = ?',
      [id_cotizacion]
    );

    res.status(201).json({
      mensaje: 'Despacho creado exitosamente',
      id_despacho: result.insertId,
      id_cotizacion
    });
  } catch (err) {
    console.error('Error al crear despacho:', err);
    res.status(500).json({ mensaje: 'Error al crear despacho', error: err.message });
  }
});

// =====================================================
// PUT /despachos/:id - Actualizar despacho (solo admin)
// =====================================================
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { 
      fecha_envio,
      fecha_entrega_estimada,
      fecha_entrega_real,
      direccion_envio,
      estado,
      tracking_number,
      observaciones 
    } = req.body;
    const id = req.params.id;

    // Verificar que existe
    const [existentes] = await promisePool.query(
      'SELECT id_despacho FROM despacho WHERE id_despacho = ?',
      [id]
    );

    if (existentes.length === 0) {
      return res.status(404).json({ mensaje: 'Despacho no encontrado' });
    }

    let sql = 'UPDATE despacho SET';
    let params = [];
    let updates = [];

    if (fecha_envio) {
      updates.push(' fecha_envio = ?');
      params.push(fecha_envio);
    }

    if (fecha_entrega_estimada !== undefined) {
      updates.push(' fecha_entrega_estimada = ?');
      params.push(fecha_entrega_estimada);
    }

    if (fecha_entrega_real !== undefined) {
      updates.push(' fecha_entrega_real = ?');
      params.push(fecha_entrega_real);
    }

    if (direccion_envio) {
      updates.push(' direccion_envio = ?');
      params.push(direccion_envio);
    }

    if (estado) {
      const estadosValidos = ['preparando', 'enviado', 'en_transito', 'entregado', 'cancelado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ 
          mensaje: 'Estado inválido', 
          estados_validos: estadosValidos 
        });
      }
      updates.push(' estado = ?');
      params.push(estado);
    }

    if (tracking_number !== undefined) {
      updates.push(' tracking_number = ?');
      params.push(tracking_number);
    }

    if (observaciones !== undefined) {
      updates.push(' observaciones = ?');
      params.push(observaciones);
    }

    if (updates.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    sql += updates.join(',') + ' WHERE id_despacho = ?';
    params.push(id);

    await promisePool.query(sql, params);

    res.json({ mensaje: 'Despacho actualizado exitosamente', id_despacho: id });
  } catch (err) {
    console.error('Error al actualizar despacho:', err);
    res.status(500).json({ mensaje: 'Error al actualizar despacho', error: err.message });
  }
});

// =====================================================
// DELETE /despachos/:id - Eliminar despacho (solo admin)
// =====================================================
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // Obtener id_cotizacion antes de eliminar
    const [despachos] = await promisePool.query(
      'SELECT id_cotizacion FROM despacho WHERE id_despacho = ?',
      [id]
    );

    if (despachos.length === 0) {
      return res.status(404).json({ mensaje: 'Despacho no encontrado' });
    }

    const id_cotizacion = despachos[0].id_cotizacion;

    // Eliminar despacho
    await promisePool.query('DELETE FROM despacho WHERE id_despacho = ?', [id]);

    // Revertir estado de cotización a 'aprobada'
    await promisePool.query(
      'UPDATE cotizaciones SET estado = "aprobada" WHERE id_cotizacion = ?',
      [id_cotizacion]
    );

    res.json({ mensaje: 'Despacho eliminado exitosamente', id_despacho: id });
  } catch (err) {
    console.error('Error al eliminar despacho:', err);
    res.status(500).json({ mensaje: 'Error al eliminar despacho', error: err.message });
  }
});

// =====================================================
// GET /despachos/estadisticas/resumen - Estadísticas de despachos
// =====================================================
router.get('/estadisticas/resumen', verificarToken, async (req, res) => {
  try {
    const [estadisticas] = await promisePool.query(`
      SELECT 
        COUNT(*) as total_despachos,
        SUM(CASE WHEN estado = 'preparando' THEN 1 ELSE 0 END) as preparando,
        SUM(CASE WHEN estado = 'enviado' THEN 1 ELSE 0 END) as enviado,
        SUM(CASE WHEN estado = 'en_transito' THEN 1 ELSE 0 END) as en_transito,
        SUM(CASE WHEN estado = 'entregado' THEN 1 ELSE 0 END) as entregado,
        SUM(CASE WHEN estado = 'cancelado' THEN 1 ELSE 0 END) as cancelado
      FROM despacho
    `);

    res.json(estadisticas[0]);
  } catch (err) {
    console.error('Error al obtener estadísticas:', err);
    res.status(500).json({ mensaje: 'Error al obtener estadísticas', error: err.message });
  }
});

module.exports = router;
