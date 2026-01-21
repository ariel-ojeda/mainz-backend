// =====================================================
// RUTAS: USUARIOS
// Gestión de usuarios del sistema
// =====================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { promisePool } = require('../db/db');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'clave_secreta_super_segura';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

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
    res.status(401).json({ mensaje: 'Token inválido o expirado' });
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
// POST /usuarios/login - Login de usuario
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    // Validaciones
    if (!usuario || !password) {
      return res.status(400).json({ mensaje: 'Usuario y contraseña son obligatorios' });
    }

    // Buscar usuario con su rol
    const [usuarios] = await promisePool.query(
      `SELECT u.id_usuario, u.usuario, u.password, u.activo, r.nombre_rol as rol
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id_rol
       WHERE u.usuario = ?`,
      [usuario]
    );

    if (usuarios.length === 0) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    const usuarioEncontrado = usuarios[0];

    // Verificar si el usuario está activo
    if (!usuarioEncontrado.activo) {
      return res.status(403).json({ mensaje: 'Usuario inactivo. Contacte al administrador' });
    }

    // Comparar contraseña
    const esValida = await bcrypt.compare(password, usuarioEncontrado.password);
    if (!esValida) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: usuarioEncontrado.id_usuario, 
        usuario: usuarioEncontrado.usuario, 
        rol: usuarioEncontrado.rol 
      },
      SECRET_KEY,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ 
      mensaje: 'Login exitoso', 
      token,
      usuario: {
        id: usuarioEncontrado.id_usuario,
        usuario: usuarioEncontrado.usuario,
        rol: usuarioEncontrado.rol
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ mensaje: 'Error al procesar login', error: err.message });
  }
});

// =====================================================
// GET /usuarios/perfil - Ver perfil del usuario autenticado
// =====================================================
router.get('/perfil', verificarToken, async (req, res) => {
  try {
    const [usuarios] = await promisePool.query(
      `SELECT u.id_usuario, u.usuario, u.activo, r.nombre_rol as rol, r.descripcion as rol_descripcion
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = ?`,
      [req.usuario.id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    res.json(usuarios[0]);
  } catch (err) {
    console.error('Error al obtener perfil:', err);
    res.status(500).json({ mensaje: 'Error al obtener perfil', error: err.message });
  }
});

// =====================================================
// GET /usuarios - Listar usuarios con paginación
// =====================================================
router.get('/', verificarToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const activo = req.query.activo; // filtro opcional: true/false
    const rol = req.query.rol; // filtro opcional: admin, vendedor, usuario

    const offset = (page - 1) * limit;

    let sql = `SELECT u.id_usuario, u.usuario, u.activo, r.nombre_rol as rol, u.created_at
               FROM usuarios u
               INNER JOIN roles r ON u.id_rol = r.id_rol
               WHERE 1=1`;
    let params = [];

    // Filtros opcionales
    if (activo !== undefined) {
      sql += ' AND u.activo = ?';
      params.push(activo === 'true' ? 1 : 0);
    }

    if (rol) {
      sql += ' AND r.nombre_rol = ?';
      params.push(rol);
    }

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [usuarios] = await promisePool.query(sql, params);

    // Contar total
    let countSql = 'SELECT COUNT(*) AS total FROM usuarios u INNER JOIN roles r ON u.id_rol = r.id_rol WHERE 1=1';
    let countParams = [];

    if (activo !== undefined) {
      countSql += ' AND u.activo = ?';
      countParams.push(activo === 'true' ? 1 : 0);
    }

    if (rol) {
      countSql += ' AND r.nombre_rol = ?';
      countParams.push(rol);
    }

    const [countResult] = await promisePool.query(countSql, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      page,
      limit,
      total,
      totalPages,
      data: usuarios
    });
  } catch (err) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ mensaje: 'Error al listar usuarios', error: err.message });
  }
});

// =====================================================
// GET /usuarios/:id - Obtener usuario por ID
// =====================================================
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const [usuarios] = await promisePool.query(
      `SELECT u.id_usuario, u.usuario, u.activo, r.nombre_rol as rol, r.descripcion as rol_descripcion, u.created_at, u.updated_at
       FROM usuarios u
       INNER JOIN roles r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = ?`,
      [req.params.id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    res.json(usuarios[0]);
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ mensaje: 'Error al obtener usuario', error: err.message });
  }
});

// =====================================================
// POST /usuarios - Crear nuevo usuario (solo admin)
// =====================================================
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { usuario, password, id_rol, activo } = req.body;

    // Validaciones
    if (!usuario || !password || !id_rol) {
      return res.status(400).json({ mensaje: 'Usuario, contraseña y rol son obligatorios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Verificar que el rol existe
    const [roles] = await promisePool.query('SELECT id_rol FROM roles WHERE id_rol = ?', [id_rol]);
    if (roles.length === 0) {
      return res.status(400).json({ mensaje: 'El rol especificado no existe' });
    }

    // Verificar que el usuario no exista
    const [usuariosExistentes] = await promisePool.query('SELECT id_usuario FROM usuarios WHERE usuario = ?', [usuario]);
    if (usuariosExistentes.length > 0) {
      return res.status(400).json({ mensaje: 'El usuario ya existe' });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Insertar usuario
    const [result] = await promisePool.query(
      'INSERT INTO usuarios (usuario, password, id_rol, activo) VALUES (?, ?, ?, ?)',
      [usuario, hashedPassword, id_rol, activo !== undefined ? activo : true]
    );

    res.status(201).json({ 
      mensaje: 'Usuario creado exitosamente',
      id_usuario: result.insertId, 
      usuario,
      id_rol
    });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ mensaje: 'Error al crear usuario', error: err.message });
  }
});

// =====================================================
// PUT /usuarios/:id - Actualizar usuario (solo admin)
// =====================================================
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const { usuario, password, id_rol, activo } = req.body;
    const id = req.params.id;

    // Verificar que el usuario existe
    const [usuariosExistentes] = await promisePool.query('SELECT id_usuario FROM usuarios WHERE id_usuario = ?', [id]);
    if (usuariosExistentes.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    let sql = 'UPDATE usuarios SET';
    let params = [];
    let updates = [];

    if (usuario) {
      // Verificar que el nuevo nombre de usuario no esté en uso
      const [usuariosConMismoNombre] = await promisePool.query(
        'SELECT id_usuario FROM usuarios WHERE usuario = ? AND id_usuario != ?',
        [usuario, id]
      );
      if (usuariosConMismoNombre.length > 0) {
        return res.status(400).json({ mensaje: 'El nombre de usuario ya está en uso' });
      }
      updates.push(' usuario = ?');
      params.push(usuario);
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres' });
      }
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      updates.push(' password = ?');
      params.push(hashedPassword);
    }

    if (id_rol) {
      // Verificar que el rol existe
      const [roles] = await promisePool.query('SELECT id_rol FROM roles WHERE id_rol = ?', [id_rol]);
      if (roles.length === 0) {
        return res.status(400).json({ mensaje: 'El rol especificado no existe' });
      }
      updates.push(' id_rol = ?');
      params.push(id_rol);
    }

    if (activo !== undefined) {
      updates.push(' activo = ?');
      params.push(activo);
    }

    if (updates.length === 0) {
      return res.status(400).json({ mensaje: 'No hay campos para actualizar' });
    }

    sql += updates.join(',') + ' WHERE id_usuario = ?';
    params.push(id);

    await promisePool.query(sql, params);

    res.json({ mensaje: 'Usuario actualizado exitosamente', id_usuario: id });
  } catch (err) {
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ mensaje: 'Error al actualizar usuario', error: err.message });
  }
});

// =====================================================
// DELETE /usuarios/:id - Eliminar usuario (solo admin)
// =====================================================
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  try {
    const id = req.params.id;

    // No permitir eliminar el propio usuario
    if (req.usuario.id == id) {
      return res.status(400).json({ mensaje: 'No puedes eliminar tu propio usuario' });
    }

    const [result] = await promisePool.query('DELETE FROM usuarios WHERE id_usuario = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    res.json({ mensaje: 'Usuario eliminado exitosamente', id_usuario: id });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ mensaje: 'Error al eliminar usuario', error: err.message });
  }
});

// =====================================================
// GET /usuarios/roles/listar - Listar roles disponibles
// =====================================================
router.get('/roles/listar', verificarToken, async (req, res) => {
  try {
    const [roles] = await promisePool.query('SELECT * FROM roles ORDER BY nombre_rol');
    res.json(roles);
  } catch (err) {
    console.error('Error al listar roles:', err);
    res.status(500).json({ mensaje: 'Error al listar roles', error: err.message });
  }
});

module.exports = router;
