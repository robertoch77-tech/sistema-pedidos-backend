const pool = require('../../db');

const verificarCualquierToken = (req, res, next) => {
  const token = req.headers['x-superadmin-token']
             || req.headers['x-roberto-token'];

  if (!token) return res.status(401).json({ error: 'Token requerido' });

  pool.query(
    'SELECT usuario_id, expira_en FROM sesiones_superadmin WHERE token = $1',
    [token]
  ).then(sa => {
    if (sa.rows.length > 0) {
      if (Number(sa.rows[0].expira_en) < Date.now()) {
        pool.query('DELETE FROM sesiones_superadmin WHERE token=$1', [token]).catch(() => {});
        return res.status(401).json({ error: 'Sesión expirada' });
      }
      req.esSuperadmin = true;
      return next();
    }
    pool.query(
      'SELECT cliente_id, expira_en FROM sesiones_portal WHERE token = $1',
      [token]
    ).then(portal => {
      if (portal.rows.length === 0)
        return res.status(401).json({ error: 'Sesión inválida' });
      if (Number(portal.rows[0].expira_en) < Date.now()) {
        pool.query('DELETE FROM sesiones_portal WHERE token=$1', [token]).catch(() => {});
        return res.status(401).json({ error: 'Sesión expirada' });
      }
      req.esSuperadmin = false;
      req.clienteId = Number(portal.rows[0].cliente_id);
      next();
    }).catch(() => res.status(500).json({ error: 'Error de autenticación' }));
  }).catch(() => res.status(500).json({ error: 'Error de autenticación' }));
};

// El portal sólo puede operar sobre el cliente asociado a su propia sesión.
// El superadmin conserva acceso a cualquier cliente.
const verificarClienteId = (req, res, next) => {
  if (req.esSuperadmin) return next();

  const clienteIdUrl = Number(req.params.cliente_id ?? req.params.clienteId ?? req.params.cid);
  if (!Number.isInteger(clienteIdUrl) || clienteIdUrl !== req.clienteId) {
    return res.status(403).json({ error: 'No tenés acceso a este cliente' });
  }

  next();
};

const verificarClienteIdBody = (req, res, next) => {
  if (req.esSuperadmin) return next();

  const clienteIdBody = Number(req.body?.cliente_id ?? req.body?.clienteId ?? req.body?.cid);
  if (!Number.isInteger(clienteIdBody) || clienteIdBody !== req.clienteId) {
    return res.status(403).json({ error: 'No tenés acceso a este cliente' });
  }

  next();
};

// Las operaciones de administración de claves no pertenecen al portal cliente.
const verificarSoloSuperadmin = (req, res, next) => {
  if (!req.esSuperadmin) {
    return res.status(403).json({ error: 'Acceso exclusivo de superadmin' });
  }

  next();
};

module.exports = { verificarCualquierToken, verificarClienteId, verificarClienteIdBody, verificarSoloSuperadmin };
