const pool = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

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
      next();
    }).catch(() => res.status(500).json({ error: 'Error de autenticación' }));
  }).catch(() => res.status(500).json({ error: 'Error de autenticación' }));
};

module.exports = { verificarCualquierToken };
