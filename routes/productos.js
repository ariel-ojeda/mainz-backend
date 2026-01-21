// =====================================================
// RUTAS: PRODUCTOS
// Gestión de productos (instrumental quirúrgico)
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
// GET /productos - Listar productos con paginación y filtros
// =====================================================
router.get('/', verificarToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const nombreFiltro = req.query.nombre || null;
    const codigoFiltro = req.query.codigo || null;
    const categoriaFiltro = req.query.id_categoria || null;
    const activoFiltro = req.query.activo;

    const offset = (page - 1) * limit;

    let sql = `SELECT p.*, c.nombre_categoria 
               FROM productos p
               LEFT JOIN categoriaproducto c ON p.id_categoria = c.id_categoria
               WHERE 1=1`;
    let params = [];

    // Filtros opcionales
    if (nombreFiltro) {
      sql += ' AND p.nombre LIKE ?';
      params.push(`%${nombreFiltro}%`);
    }

    if (codigoFiltro) {
      sql += ' AND p.codigo LIKE ?';
      params.push(`%${codigoFiltro}%`);
    }

    if (categoriaFiltro) {
      sql += ' AND p.id_categoria = ?';
      params.push(categoriaFiltro);
    }

    if (activoFiltro !== undefined) {
      sql += ' AND p.activo = ?';
      params.push(activoFiltro === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY p.nombre LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [productos] = await promisePool.query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(*) AS total FROM productos p WHERE 1=1';
    let countParams = [];

    if (nombreFiltro) {
      countSql += ' AND p.nombre LIKE ?';
      countParams.push(`%${nombreFiltro}%`);
    }

    if (codigoFiltro) {
      countSql += ' AND p.codigo LIKE ?';
      countParams.push(`%${codigoFiltro}%`);
    }

    if (categoriaFiltro) {
      countSql += ' AND p.id_categoria = ?';
      countParams.push(categoriaFiltro);
    }

    if (activoFiltro !== undefined) {
      countSql += ' AND p.activo = ?';
      countParams.push(activoFiltro === 'true' ? 1 : 0);
    }

    const [countResult] = await promisePool.query(countSql, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      page,
      limit,
      total,
      totalPages,
      data: productos
    });
  } catch (err) {
    console.error('Error al listar productos:', err);
    res.status(500).json({ mensaje: 'Error al listar productos', error: err.message });
  }
});

// =====================================================
// GET /productos/:id - Obtener producto por ID
// =====================================================
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const [productos] = await promisePool.query(
      `SELECT p.*, c.nombre_categoria 
       FROM productos p
       LEFT JOIN categoriaproducto c ON p.id_categoria = c.id_categoria
       WHERE p.id_producto = ?`,
      [req.params.id]
    );

    if (productos.length === 0) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    res.json(productos[0]);
  } catch (err) {
    console.error('Error al obtener producto:', err);
    res.status(500).json({ mensaje: 'Error al obtener producto', error: err.message });
  }
});

// =====================================================
// GET /productos/codigo/:codigo - Buscar producto por código
// =====================================================
router.get('/codigo/:codigo', verificarToken, async (req, res) => {
  try {
    const [productos] = await promisePool.query(
      `SELECT p.*, c.nombre_categoria 
       FROM productos p
       LEFT JOIN categoriaproducto c ON p.id_categoria = c.id_categoria
       WHERE p.codigo = ?`,
      [req.params.codigo]
    );

    if (productos.length === 0) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    res.json(productos[0]);
  } catch (err) {
    console.error('Error al buscar producto:', err);
    res.status(500).json({ mensaje: 'Error al buscar producto', error: err.message });
  }
});

// =====================================================
// POST /productos - Crear nuevo producto (solo admin)
// =====================================================
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { codigo, nombre, descripcion, precio, id_categoria, stock, activo } = req.body;

    // Validaciones
    if (!codigo || !nombre || !precio) {
      return res.status(400).json({ mensaje: 'Código, nombre y precio son obligatorios' });
    }

    if (typeof precio !== 'number' || precio <= 0) {
      return res.status(400).json({ mensaje: 'El precio debe ser un número mayor a 0' });
    }

    // Verificar que el código no exista
    const [productosExistentes] = await promisePool.query(
      'SELECT id_producto FROM productos WHERE codigo = ?',
      [codigo]
    );

    if (productosExistentes.length > 0) {
      return res.status(400).json({ mensaje: 'Ya existe un producto con ese código' });
    }

    // Verificar que la categoría existe (si se proporciona)
    if (id_categoria) {
      const [categorias] = await promisePool.query(
        'SELECT id_categoria FROM categoriaproducto WHERE id_categoria = ?',
        [id_categoria]
      );

      if (categorias.length === 0) {
        return res.status(400).json({ mensaje: 'La categoría especificada no existe' });
      }
    }

    // Insertar producto
    const [result] = await promisePool.query(
      `INSERT INTO productos (codigo, nombre, descripcion, precio, id_categoria, stock, activo) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        codigo, 
        nombre, 
        descripcion || null, 
        precio, 
        id_categoria || null, 
        stock || 0, 
        activo !== undefined ? activo : true
      ]
    );

    res.status(201).json({ 
      mensaje: 'Producto creado exitosamente',
      id_producto: result.insertId, 
      codigo,
      nombre,
      precio
    });
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ mensaje: 'Error al crear producto', error: err.message });
  }
});

// =====================================================
// PUT /productos/:id - Actualizar producto (solo admin)
// =====================================================
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { codigo, nombre, descripcion, precio, id_categoria, stock, activo } = req.body;
    const id = req.params.id;

    // Verificar que el producto existe
    const [productosExistentes] = await promisePool.query(
      'SELECT id_producto FROM productos WHERE id_producto = ?',
      [id]
    );

    if (productosExistentes.length === 0) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    let sql = 'UPDATE productos SET';
    let params = [];
    let updates = [];

    if (codigo) {
      // Verificar que el código no esté en uso por otro producto
      const [codigoExistente] = await promisePool.query(
        'SELECT id_producto FROM productos WHERE codigo = ? AND id_producto != ?',
        [codigo, id]
      );

      if (codigoExistente.length > 0) {
        return res.status(400).json({ mensaje: 'El código ya está en uso por otro producto' });
      }

      updates.push(' codigo = ?');
      params.push(codigo);
    }

    if (nombre) {
      updates.push(' nombre = ?');
      params.push(nombre);
    }

    if (descripcion !== undefined) {
      updates.push(' descripcion = ?');
      params.push(descripcion);
    }

    if (precio !== undefined) {
      if (typeof precio !== 'number' || precio <= 0) {
        return res.status(400).json({ mensaje: 'El precio debe ser un número mayor a 0' });
      }
      updates.push(' precio = ?');
      params.push(precio);
    }

    if (id_categoria !== undefined) {
      if (id_categoria) {
        // Verificar que la categoría existe
        const [categorias] = await promisePool.query(
          'SELECT id_categoria FROM categoriaproducto WHERE id_categoria = ?',
          [id_categoria]
        );

        if (categorias.length === 0) {
          return res.status(400).json({ mensaje: 'La categoría especificada no existe' });
        }
      }
      updates.push(' id_categoria = ?');
      params.push(id_categoria);
    }

    if (stock !== undefined) {
      if (typeof stock !== 'number' || stock < 0) {
        return res.status(400).json({ mensaje: 'El stock debe ser un número mayor o igual a 0' });
      }
      updates.push(' stock = ?');
      params.push(stock);
    }

    if (activo !== undefined) {
      updates.push(' activo = ?');
      params.push(activo);
    }

    if (updates.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    sql += updates.join(',') + ' WHERE id_producto = ?';
    params.push(id);

    await promisePool.query(sql, params);

    res.json({ mensaje: 'Producto actualizado exitosamente', id_producto: id });
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ mensaje: 'Error al actualizar producto', error: err.message });
  }
});

// =====================================================
// DELETE /productos/:id - Eliminar producto (solo admin)
// =====================================================
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // Verificar si el producto está en cotizaciones
    const [detalles] = await promisePool.query(
      'SELECT COUNT(*) as total FROM detallecotizacion WHERE id_producto = ?',
      [id]
    );

    if (detalles[0].total > 0) {
      return res.status(400).json({ 
        mensaje: 'No se puede eliminar el producto porque está asociado a cotizaciones',
        cotizaciones_asociadas: detalles[0].total,
        sugerencia: 'Considere desactivar el producto en lugar de eliminarlo'
      });
    }

    const [result] = await promisePool.query(
      'DELETE FROM productos WHERE id_producto = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Producto eliminado exitosamente', id_producto: id });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ mensaje: 'Error al eliminar producto', error: err.message });
  }
});

// =====================================================
// PATCH /productos/:id/stock - Actualizar solo el stock
// =====================================================
router.patch('/:id/stock', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { stock } = req.body;
    const id = req.params.id;

    if (stock === undefined) {
      return res.status(400).json({ mensaje: 'El campo stock es obligatorio' });
    }

    if (typeof stock !== 'number' || stock < 0) {
      return res.status(400).json({ mensaje: 'El stock debe ser un número mayor o igual a 0' });
    }

    const [result] = await promisePool.query(
      'UPDATE productos SET stock = ? WHERE id_producto = ?',
      [stock, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    res.json({ mensaje: 'Stock actualizado exitosamente', id_producto: id, stock });
  } catch (err) {
    console.error('Error al actualizar stock:', err);
    res.status(500).json({ mensaje: 'Error al actualizar stock', error: err.message });
  }
});

// =====================================================
// PATCH /productos/:id/activar - Activar/Desactivar producto
// =====================================================
router.patch('/:id/activar', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { activo } = req.body;
    const id = req.params.id;

    if (activo === undefined) {
      return res.status(400).json({ mensaje: 'El campo activo es obligatorio' });
    }

    const [result] = await promisePool.query(
      'UPDATE productos SET activo = ? WHERE id_producto = ?',
      [activo, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    res.json({ 
      mensaje: `Producto ${activo ? 'activado' : 'desactivado'} exitosamente`, 
      id_producto: id, 
      activo 
    });
  } catch (err) {
    console.error('Error al cambiar estado del producto:', err);
    res.status(500).json({ mensaje: 'Error al cambiar estado del producto', error: err.message });
  }
});

module.exports = router;
