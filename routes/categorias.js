// =====================================================
// RUTAS: CATEGORÍAS DE PRODUCTOS
// Gestión de categorías de productos médicos
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
// GET /categorias - Listar todas las categorías
// =====================================================
router.get('/', verificarToken, async (req, res) => {
  try {
    const [categorias] = await promisePool.query(`
      SELECT 
        c.*,
        COUNT(p.id_producto) as total_productos
      FROM categoriaproducto c
      LEFT JOIN productos p ON c.id_categoria = p.id_categoria
      GROUP BY c.id_categoria
      ORDER BY c.nombre_categoria
    `);

    res.json(categorias);
  } catch (err) {
    console.error('Error al listar categorías:', err);
    res.status(500).json({ mensaje: 'Error al listar categorías', error: err.message });
  }
});

// =====================================================
// GET /categorias/:id - Obtener categoría por ID
// =====================================================
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const [categorias] = await promisePool.query(
      'SELECT * FROM categoriaproducto WHERE id_categoria = ?',
      [req.params.id]
    );

    if (categorias.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada' });
    }

    // Obtener productos de esta categoría
    const [productos] = await promisePool.query(
      'SELECT * FROM productos WHERE id_categoria = ? ORDER BY nombre',
      [req.params.id]
    );

    res.json({
      ...categorias[0],
      productos
    });
  } catch (err) {
    console.error('Error al obtener categoría:', err);
    res.status(500).json({ mensaje: 'Error al obtener categoría', error: err.message });
  }
});

// =====================================================
// POST /categorias - Crear nueva categoría (solo admin)
// =====================================================
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre_categoria, descripcion } = req.body;

    if (!nombre_categoria) {
      return res.status(400).json({ mensaje: 'El nombre de la categoría es obligatorio' });
    }

    // Verificar que no exista
    const [existentes] = await promisePool.query(
      'SELECT id_categoria FROM categoriaproducto WHERE nombre_categoria = ?',
      [nombre_categoria]
    );

    if (existentes.length > 0) {
      return res.status(400).json({ mensaje: 'Ya existe una categoría con ese nombre' });
    }

    const [result] = await promisePool.query(
      'INSERT INTO categoriaproducto (nombre_categoria, descripcion) VALUES (?, ?)',
      [nombre_categoria, descripcion || null]
    );

    res.status(201).json({
      mensaje: 'Categoría creada exitosamente',
      id_categoria: result.insertId,
      nombre_categoria
    });
  } catch (err) {
    console.error('Error al crear categoría:', err);
    res.status(500).json({ mensaje: 'Error al crear categoría', error: err.message });
  }
});

// =====================================================
// PUT /categorias/:id - Actualizar categoría (solo admin)
// =====================================================
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { nombre_categoria, descripcion } = req.body;
    const id = req.params.id;

    if (!nombre_categoria) {
      return res.status(400).json({ mensaje: 'El nombre de la categoría es obligatorio' });
    }

    // Verificar que existe
    const [existentes] = await promisePool.query(
      'SELECT id_categoria FROM categoriaproducto WHERE id_categoria = ?',
      [id]
    );

    if (existentes.length === 0) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada' });
    }

    // Verificar que el nombre no esté en uso
    const [nombreExistente] = await promisePool.query(
      'SELECT id_categoria FROM categoriaproducto WHERE nombre_categoria = ? AND id_categoria != ?',
      [nombre_categoria, id]
    );

    if (nombreExistente.length > 0) {
      return res.status(400).json({ mensaje: 'El nombre ya está en uso por otra categoría' });
    }

    await promisePool.query(
      'UPDATE categoriaproducto SET nombre_categoria = ?, descripcion = ? WHERE id_categoria = ?',
      [nombre_categoria, descripcion, id]
    );

    res.json({ mensaje: 'Categoría actualizada exitosamente', id_categoria: id });
  } catch (err) {
    console.error('Error al actualizar categoría:', err);
    res.status(500).json({ mensaje: 'Error al actualizar categoría', error: err.message });
  }
});

// =====================================================
// DELETE /categorias/:id - Eliminar categoría (solo admin)
// =====================================================
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // Verificar si tiene productos asociados
    const [productos] = await promisePool.query(
      'SELECT COUNT(*) as total FROM productos WHERE id_categoria = ?',
      [id]
    );

    if (productos[0].total > 0) {
      return res.status(400).json({
        mensaje: 'No se puede eliminar la categoría porque tiene productos asociados',
        productos_asociados: productos[0].total,
        sugerencia: 'Reasigne los productos a otra categoría antes de eliminar'
      });
    }

    const [result] = await promisePool.query(
      'DELETE FROM categoriaproducto WHERE id_categoria = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Categoría no encontrada' });
    }

    res.json({ mensaje: 'Categoría eliminada exitosamente', id_categoria: id });
  } catch (err) {
    console.error('Error al eliminar categoría:', err);
    res.status(500).json({ mensaje: 'Error al eliminar categoría', error: err.message });
  }
});

module.exports = router;
