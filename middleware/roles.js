// backend/middleware/roles.js

function verificarRol(rolPermitido) {
  return (req, res, next) => {
    // Verifica que el usuario exista y tenga el rol correcto
    if (req.usuario && req.usuario.rol === rolPermitido) {
      next(); // acceso permitido
    } else {
      return res.status(403).json({ mensaje: "Acceso denegado: rol insuficiente" });
    }
  };
}

module.exports = verificarRol;