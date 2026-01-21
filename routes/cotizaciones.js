// =====================================================
// RUTAS: COTIZACIONES
// Gestión de cotizaciones con detalle de productos
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
// GET /cotizaciones - Listar cotizaciones con paginación
// =====================================================
router.get('/', verificarToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const clienteFiltro = req.query.id_cliente || null;
    const estadoFiltro = req.query.estado || null;
    const fechaDesde = req.query.fecha_desde || null;
    const fechaHasta = req.query.fecha_hasta || null;

    const offset = (page - 1) * limit;

    let sql = `SELECT 
                 c.id_cotizacion,
                 c.fecha_emision,
                 c.estado,
                 c.total,
                 c.observaciones,
                 cl.id_cliente,
                 cl.rut as cliente_rut,
                 cl.nombre as cliente_nombre,
                 u.id_usuario,
                 u.usuario as vendedor,
                 COUNT(dc.id_detalle) as cantidad_productos
               FROM cotizaciones c
               INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
               INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
               LEFT JOIN detallecotizacion dc ON c.id_cotizacion = dc.id_cotizacion
               WHERE 1=1`;
    let params = [];

    // Filtros opcionales
    if (clienteFiltro) {
      sql += ' AND c.id_cliente = ?';
      params.push(clienteFiltro);
    }

    if (estadoFiltro) {
      sql += ' AND c.estado = ?';
      params.push(estadoFiltro);
    }

    if (fechaDesde) {
      sql += ' AND c.fecha_emision >= ?';
      params.push(fechaDesde);
    }

    if (fechaHasta) {
      sql += ' AND c.fecha_emision <= ?';
      params.push(fechaHasta);
    }

    sql += ' GROUP BY c.id_cotizacion ORDER BY c.fecha_emision DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [cotizaciones] = await promisePool.query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(DISTINCT c.id_cotizacion) AS total FROM cotizaciones c WHERE 1=1';
    let countParams = [];

    if (clienteFiltro) {
      countSql += ' AND c.id_cliente = ?';
      countParams.push(clienteFiltro);
    }

    if (estadoFiltro) {
      countSql += ' AND c.estado = ?';
      countParams.push(estadoFiltro);
    }

    if (fechaDesde) {
      countSql += ' AND c.fecha_emision >= ?';
      countParams.push(fechaDesde);
    }

    if (fechaHasta) {
      countSql += ' AND c.fecha_emision <= ?';
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
      data: cotizaciones
    });
  } catch (err) {
    console.error('Error al listar cotizaciones:', err);
    res.status(500).json({ mensaje: 'Error al listar cotizaciones', error: err.message });
  }
});

// =====================================================
// GET /cotizaciones/:id - Obtener cotización completa con detalle
// =====================================================
router.get('/:id', verificarToken, async (req, res) => {
  try {
    // Obtener cotización
    const [cotizaciones] = await promisePool.query(
      `SELECT 
         c.*,
         cl.rut as cliente_rut,
         cl.nombre as cliente_nombre,
         cl.correo as cliente_correo,
         cl.telefono as cliente_telefono,
         cl.direccion as cliente_direccion,
         u.usuario as vendedor
       FROM cotizaciones c
       INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
       INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
       WHERE c.id_cotizacion = ?`,
      [req.params.id]
    );

    if (cotizaciones.length === 0) {
      return res.status(404).json({ mensaje: 'Cotización no encontrada' });
    }

    const cotizacion = cotizaciones[0];

    // Obtener detalle de productos
    const [detalles] = await promisePool.query(
      `SELECT 
         dc.*,
         p.codigo as producto_codigo,
         p.nombre as producto_nombre,
         p.descripcion as producto_descripcion,
         cat.nombre_categoria
       FROM detallecotizacion dc
       INNER JOIN productos p ON dc.id_producto = p.id_producto
       LEFT JOIN categoriaproducto cat ON p.id_categoria = cat.id_categoria
       WHERE dc.id_cotizacion = ?
       ORDER BY dc.id_detalle`,
      [req.params.id]
    );

    // Obtener información de despacho si existe
    const [despachos] = await promisePool.query(
      'SELECT * FROM despacho WHERE id_cotizacion = ?',
      [req.params.id]
    );

    res.json({
      ...cotizacion,
      productos: detalles,
      despacho: despachos.length > 0 ? despachos[0] : null
    });
  } catch (err) {
    console.error('Error al obtener cotización:', err);
    res.status(500).json({ mensaje: 'Error al obtener cotización', error: err.message });
  }
});

// =====================================================
// POST /cotizaciones - Crear nueva cotización con productos
// =====================================================
router.post('/', verificarToken, async (req, res) => {
  const connection = await promisePool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id_cliente, fecha_emision, observaciones, productos } = req.body;

    // Validaciones
    if (!id_cliente || !fecha_emision) {
      await connection.rollback();
      return res.status(400).json({ mensaje: 'id_cliente y fecha_emision son obligatorios' });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      await connection.rollback();
      return res.status(400).json({ mensaje: 'Debe incluir al menos un producto' });
    }

    // Validar formato de fecha
    const regexFecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!regexFecha.test(fecha_emision)) {
      await connection.rollback();
      return res.status(400).json({ mensaje: 'Formato de fecha inválido, use YYYY-MM-DD' });
    }

    // Verificar que el cliente existe
    const [clientes] = await connection.query(
      'SELECT id_cliente FROM clientes WHERE id_cliente = ?',
      [id_cliente]
    );

    if (clientes.length === 0) {
      await connection.rollback();
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    // Insertar cotización
    const [resultCotizacion] = await connection.query(
      `INSERT INTO cotizaciones (fecha_emision, id_cliente, id_usuario, estado, observaciones) 
       VALUES (?, ?, ?, 'pendiente', ?)`,
      [fecha_emision, id_cliente, req.usuario.id, observaciones || null]
    );

    const id_cotizacion = resultCotizacion.insertId;

    // Insertar detalles de productos
    for (const producto of productos) {
      const { id_producto, cantidad, descuento } = producto;

      if (!id_producto || !cantidad) {
        await connection.rollback();
        return res.status(400).json({ 
          mensaje: 'Cada producto debe tener id_producto y cantidad' 
        });
      }

      if (cantidad <= 0) {
        await connection.rollback();
        return res.status(400).json({ mensaje: 'La cantidad debe ser mayor a 0' });
      }

      // Obtener precio actual del producto
      const [productos] = await connection.query(
        'SELECT precio, activo FROM productos WHERE id_producto = ?',
        [id_producto]
      );

      if (productos.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          mensaje: `Producto con ID ${id_producto} no encontrado` 
        });
      }

      if (!productos[0].activo) {
        await connection.rollback();
        return res.status(400).json({ 
          mensaje: `El producto con ID ${id_producto} no está activo` 
        });
      }

      const precio_unitario = productos[0].precio;

      // Insertar detalle (el trigger calculará el subtotal automáticamente)
      await connection.query(
        `INSERT INTO detallecotizacion (id_cotizacion, id_producto, cantidad, precio_unitario, descuento) 
         VALUES (?, ?, ?, ?, ?)`,
        [id_cotizacion, id_producto, cantidad, precio_unitario, descuento || 0]
      );
    }

    await connection.commit();

    // Obtener la cotización completa creada
    const [cotizacionCreada] = await promisePool.query(
      `SELECT c.*, cl.nombre as cliente_nombre 
       FROM cotizaciones c
       INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
       WHERE c.id_cotizacion = ?`,
      [id_cotizacion]
    );

    res.status(201).json({ 
      mensaje: 'Cotización creada exitosamente',
      cotizacion: cotizacionCreada[0]
    });

  } catch (err) {
    await connection.rollback();
    console.error('Error al crear cotización:', err);
    res.status(500).json({ mensaje: 'Error al crear cotización', error: err.message });
  } finally {
    connection.release();
  }
});

// =====================================================
// PUT /cotizaciones/:id - Actualizar cotización (solo admin)
// =====================================================
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { estado, observaciones } = req.body;
    const id = req.params.id;

    // Verificar que la cotización existe
    const [cotizaciones] = await promisePool.query(
      'SELECT id_cotizacion FROM cotizaciones WHERE id_cotizacion = ?',
      [id]
    );

    if (cotizaciones.length === 0) {
      return res.status(404).json({ mensaje: 'Cotización no encontrada' });
    }

    let sql = 'UPDATE cotizaciones SET';
    let params = [];
    let updates = [];

    if (estado) {
      const estadosValidos = ['pendiente', 'aprobada', 'rechazada', 'enviada'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ 
          mensaje: 'Estado inválido', 
          estados_validos: estadosValidos 
        });
      }
      updates.push(' estado = ?');
      params.push(estado);
    }

    if (observaciones !== undefined) {
      updates.push(' observaciones = ?');
      params.push(observaciones);
    }

    if (updates.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    sql += updates.join(',') + ' WHERE id_cotizacion = ?';
    params.push(id);

    await promisePool.query(sql, params);

    res.json({ mensaje: 'Cotización actualizada exitosamente', id_cotizacion: id });
  } catch (err) {
    console.error('Error al actualizar cotización:', err);
    res.status(500).json({ mensaje: 'Error al actualizar cotización', error: err.message });
  }
});

// =====================================================
// DELETE /cotizaciones/:id - Eliminar cotización (solo admin)
// =====================================================
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // Verificar si tiene despacho asociado
    const [despachos] = await promisePool.query(
      'SELECT id_despacho FROM despacho WHERE id_cotizacion = ?',
      [id]
    );

    if (despachos.length > 0) {
      return res.status(400).json({ 
        mensaje: 'No se puede eliminar la cotización porque tiene un despacho asociado',
        sugerencia: 'Elimine primero el despacho o cambie el estado de la cotización'
      });
    }

    // El CASCADE en la FK eliminará automáticamente los detalles
    const [result] = await promisePool.query(
      'DELETE FROM cotizaciones WHERE id_cotizacion = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Cotización no encontrada' });
    }

    res.json({ mensaje: 'Cotización eliminada exitosamente', id_cotizacion: id });
  } catch (err) {
    console.error('Error al eliminar cotización:', err);
    res.status(500).json({ mensaje: 'Error al eliminar cotización', error: err.message });
  }
});

// =====================================================
// GET /cotizaciones/:id/pdf - Generar PDF de cotización (futuro)
// =====================================================
router.get('/:id/pdf', verificarToken, async (req, res) => {
  res.status(501).json({ 
    mensaje: 'Funcionalidad de generación de PDF en desarrollo',
    id_cotizacion: req.params.id
  });
});

// =====================================================
// GET /cotizaciones/estadisticas/resumen - Estadísticas generales
// =====================================================
router.get('/estadisticas/resumen', verificarToken, async (req, res) => {
  try {
    // Total de cotizaciones por estado
    const [estadisticas] = await promisePool.query(`
      SELECT 
        COUNT(*) as total_cotizaciones,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
        SUM(CASE WHEN estado = 'aprobada' THEN 1 ELSE 0 END) as aprobadas,
        SUM(CASE WHEN estado = 'rechazada' THEN 1 ELSE 0 END) as rechazadas,
        SUM(CASE WHEN estado = 'enviada' THEN 1 ELSE 0 END) as enviadas,
        SUM(total) as monto_total,
        AVG(total) as monto_promedio
      FROM cotizaciones
    `);

    res.json(estadisticas[0]);
  } catch (err) {
    console.error('Error al obtener estadísticas:', err);
    res.status(500).json({ mensaje: 'Error al obtener estadísticas', error: err.message });
  }
});

module.exports = router;
