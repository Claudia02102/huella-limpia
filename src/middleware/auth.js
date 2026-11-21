'use strict';

const jwt = require('jsonwebtoken');

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET no configurado');
  }
  return secret || 'dev-only-secret-change-me';
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    req.user = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Control de acceso por rol: se usa después de requireAuth. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, jwtSecret };
