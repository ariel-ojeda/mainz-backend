// =====================================================
// RUTAS: REPORTES
// Generación de reportes y estadísticas del sistema
// =====================================================

const express = require('express');
const router = express.Router();
const { promisePool } = require('../db/db');
const verificarToken = require('../middleware/auth');
const verificarRol = require('../middleware/roles');

// =====================================================
// GET /reportes - Información general de reportes
// =====================================================
router.get('/', verificarToken, verificarRol('admin'), (req, res) => {
  res.json({
    mensaje: 'Módulo de Reportes 📊',
    reportes_disponibles: [
      { endpoint: '/reportes/ventas', descripcion: 'Reporte de ventas por período' },
      { endpoint: '/reportes/productos-mas-vendidos', descripcion: 'Productos más vendidos' },
      { endpoint: '/reportes/clientes-top', descripcion: 'Clientes con más cotizaciones' },
      { endpoint: '/reportes/cotizaciones-por-estado', descripcion: 'Cotizaciones agrupadas por estado' },
      { endpoint: '/reportes/despachos-pendientes', descripcion: 'Despachos pendientes de entrega' },
      { endpoint: '/reportes/dashboard', descripcion: 'Dashboard general del sistema' }
    ]
  });
});

// =====================================================
// GET /reportes/ventas - Reporte de ventas
// =====================================================
router.get('/ventas', verificarToken, verificarRol('admin'), async (req, res) => {
  try {
    const fechaDesde = req.query.fecha_desde || null;
    const fechaHasta = req.query.fecha_hasta || null;

    let sql = `
      SELECT 
        DATE_FORMAT(c.fecha_emision, '%Y-%m') as periodo,
        COUNT(c.id_cotizacion) as total_cotizaciones,
        SUM(c.total) as monto_total,
        AVG(c.total) as monto_promedio,
        SUM(CASE WHEN c.estado = 'aprobada' THEN 1 ELSE 0 END) as aprobadas,
        SUM(CASE WHEN c.estado = 'rechazada' THEN 1 ELSE 0 END) as rechazadas
      FROM cotizaciones c
      WHERE 1=1
    `;
    let params = [];

    if (fechaDesde) {
      sql += ' AND c.fecha_emision >= ?';
      params.push(fechaDesde);
    }

    if (fechaHasta) {
      sql += ' AND c.fecha_emision <= ?';
      params.push(fechaHasta);
    }

    sql += ' GROUP BY periodo ORDER BY periodo DESC';

    const [ventas] = await promisePool.query(sql, params);

    res.json({
      periodo: { desde: fechaDesde, hasta: fechaHasta },
      data: ventas
    });
  } catch (err) {
    console.error('Error en reporte de ventas:', err);
    res.status(500).json({ mensaje: 'Error al generar reporte', error: err.message });
  }
});

// =====================================================
// GET /reportes/productos-mas-vendidos - Top productos
// =====================================================
router.get('/productos-mas-vendidos', verificarToken, verificarRol('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const [productos] = await promisePool.query(`
      SELECT 
        p.id_producto,
        p.codigo,
        p.nombre,
        cat.nombre_categoria,
        SUM(dc.cantidad) as cantidad_vendida,
        COUNT(DISTINCT dc.id_cotizacion) as veces_cotizado,
        SUM(dc.subtotal) as monto_total
      FROM detallecotizacion dc
      INNER JOIN productos p ON dc.id_producto = p.id_producto
      LEFT JOIN categoriaproducto cat ON p.id_categoria = cat.id_categoria
      INNER JOIN cotizaciones c ON dc.id_cotizacion = c.id_cotizacion
      WHERE c.estado IN ('aprobada', 'enviada')
      GROUP BY p.id_producto
      ORDER BY cantidad_vendida DESC
      LIMIT ?
    `, [limit]);

    res.json({
      top: limit,
      data: productos
    });
  } catch (err) {
    console.error('Error en reporte de productos:', err);
    res.status(500).json({ mensaje: 'Error al generar reporte', error: err.message });
  }
});

// =====================================================
// GET /reportes/clientes-top - Clientes con más cotizaciones
// =====================================================
router.get('/clientes-top', verificarToken, verificarRol('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const [clientes] = await promisePool.query(`
      SELECT 
        cl.id_cliente,
        cl.rut,
        cl.nombre,
        cl.correo,
        COUNT(c.id_cotizacion) as total_cotizaciones,
        SUM(c.total) as monto_total,
        AVG(c.total) as monto_promedio,
        MAX(c.fecha_emision) as ultima_cotizacion
      FROM clientes cl
      INNER JOIN cotizaciones c ON cl.id_cliente = c.id_cliente
      WHERE c.estado IN ('aprobada', 'enviada')
      GROUP BY cl.id_cliente
      ORDER BY monto_total DESC
      LIMIT ?
    `, [limit]);

    res.json({
      top: limit,
      data: clientes
    });
  } catch (err) {
    console.error('Error en reporte de clientes:', err);
    res.status(500).json({ mensaje: 'Error al generar reporte', error: err.message });
  }
});

// =====================================================
// GET /reportes/cotizaciones-por-estado - Cotizaciones por estado
// =====================================================
router.get('/cotizaciones-por-estado', verificarToken, verificarRol('admin'), async (req, res) => {
  try {
    const [estadisticas] = await promisePool.query(`
      SELECT 
        estado,
        COUNT(*) as cantidad,
        SUM(total) as monto_total,
        AVG(total) as monto_promedio
      FROM cotizaciones
      GROUP BY estado
      ORDER BY cantidad DESC
    `);

    res.json({
      data: estadisticas
    });
  } catch (err) {
    console.error('Error en reporte de estados:', err);
    res.status(500).json({ mensaje: 'Error al generar reporte', error: err.message });
  }
});

// =====================================================
// GET /reportes/despachos-pendientes - Despachos pendientes
// =====================================================
router.get('/despachos-pendientes', verificarToken, verificarRol('admin'), async (req, res) => {
  try {
    const [despachos] = await promisePool.query(`
      SELECT 
        d.*,
        c.id_cotizacion,
        c.total,
        cl.nombre as cliente_nombre,
        cl.rut as cliente_rut,
        DATEDIFF(CURDATE(), d.fecha_envio) as dias_desde_envio
      FROM despacho d
      INNER JOIN cotizaciones c ON d.id_cotizacion = c.id_cotizacion
      INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
      WHERE d.estado NOT IN ('entregado', 'cancelado')
      ORDER BY d.fecha_envio ASC
    `);

    res.json({
      total_pendientes: despachos.length,
      data: despachos
    });
  } catch (err) {
    console.error('Error en reporte de despachos:', err);
    res.status(500).json({ mensaje: 'Error al generar reporte', error: err.message });
  }
});

// =====================================================
// GET /reportes/dashboard - Dashboard general
// =====================================================
router.get('/dashboard', verificarToken, verificarRol('admin'), async (req, res) => {
  try {
    // Estadísticas generales
    const [stats] = await promisePool.query(`
      SELECT 
        (SELECT COUNT(*) FROM clientes) as total_clientes,
        (SELECT COUNT(*) FROM productos WHERE activo = 1) as productos_activos,
        (SELECT COUNT(*) FROM cotizaciones) as total_cotizaciones,
        (SELECT COUNT(*) FROM cotizaciones WHERE estado = 'pendiente') as cotizaciones_pendientes,
        (SELECT COUNT(*) FROM despacho WHERE estado NOT IN ('entregado', 'cancelado')) as despachos_pendientes,
        (SELECT SUM(total) FROM cotizaciones WHERE estado IN ('aprobada', 'enviada')) as ventas_totales,
        (SELECT COUNT(*) FROM usuarios WHERE activo = 1) as usuarios_activos
    `);

    // Ventas del mes actual
    const [ventasMes] = await promisePool.query(`
      SELECT 
        COUNT(*) as cotizaciones_mes,
        SUM(total) as monto_mes
      FROM cotizaciones
      WHERE YEAR(fecha_emision) = YEAR(CURDATE())
      AND MONTH(fecha_emision) = MONTH(CURDATE())
    `);

    // Últimas cotizaciones
    const [ultimasCotizaciones] = await promisePool.query(`
      SELECT 
        c.id_cotizacion,
        c.fecha_emision,
        c.estado,
        c.total,
        cl.nombre as cliente_nombre
      FROM cotizaciones c
      INNER JOIN clientes cl ON c.id_cliente = cl.id_cliente
      ORDER BY c.fecha_emision DESC
      LIMIT 5
    `);

    res.json({
      estadisticas_generales: stats[0],
      mes_actual: ventasMes[0],
      ultimas_cotizaciones: ultimasCotizaciones
    });
  } catch (err) {
    console.error('Error en dashboard:', err);
    res.status(500).json({ mensaje: 'Error al generar dashboard', error: err.message });
  }
});

module.exports = router;
