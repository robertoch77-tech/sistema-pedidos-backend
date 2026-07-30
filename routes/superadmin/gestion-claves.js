const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

router.use(verificarCualquierToken);

// Obtener usuario_id del superadmin a partir del token
async function getSuperadminId(req) {
  const token = req.headers['x-superadmin-token'] || req.headers['x-roberto-token'];
  const res = await pool.query(
    'SELECT usuario_id FROM sesiones_superadmin WHERE token = $1',
    [token]
  );
  return res.rows[0]?.usuario_id ?? null;
}

// Verificar clave superadmin por clave_superadmin directa (para endpoints de clientes)
async function verificarClaveSuperadmin(clave) {
  const res = await pool.query(
    'SELECT password_hash FROM superadmin_usuarios WHERE activo = true LIMIT 1'
  );
  if (!res.rows[0]) return false;
  return bcrypt.compareSync(clave, res.rows[0].password_hash);
}

// PUT /api/superadmin/gestion-claves/superadmin/cambiar-clave
router.put('/superadmin/cambiar-clave', async (req, res) => {
  const { clave_actual, clave_nueva } = req.body;
  if (!clave_actual || !clave_nueva)
    return res.status(400).json({ mensaje: 'Faltan datos requeridos' });
  if (clave_nueva.length < 6)
    return res.status(400).json({ mensaje: 'La nueva clave debe tener al menos 6 caracteres' });

  try {
    const userId = await getSuperadminId(req);
    const query = userId
      ? await pool.query('SELECT password_hash FROM superadmin_usuarios WHERE id = $1 AND activo = true', [userId])
      : await pool.query('SELECT id, password_hash FROM superadmin_usuarios WHERE activo = true LIMIT 1');

    if (!query.rows[0])
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const { password_hash, id } = query.rows[0];
    const realId = userId || id;

    if (!bcrypt.compareSync(clave_actual, password_hash))
      return res.status(403).json({ mensaje: 'Clave actual incorrecta' });

    const nuevo_hash = bcrypt.hashSync(clave_nueva, 10);
    await pool.query(
      'UPDATE superadmin_usuarios SET password_hash = $1, modificado_en = now() WHERE id = $2',
      [nuevo_hash, realId]
    );

    res.json({ ok: true, mensaje: 'Clave actualizada' });
  } catch (err) {
    console.error('Error cambiar-clave superadmin:', err.message);
    res.status(500).json({ mensaje: 'Error al cambiar la clave' });
  }
});

// PUT /api/superadmin/gestion-claves/cliente/:clienteId/asignar-clave
router.put('/cliente/:clienteId/asignar-clave', async (req, res) => {
  const { clienteId } = req.params;
  const { clave_nueva, clave_superadmin } = req.body;

  if (!clave_nueva || !clave_superadmin)
    return res.status(400).json({ mensaje: 'Faltan datos requeridos' });
  if (clave_nueva.length < 4)
    return res.status(400).json({ mensaje: 'La clave debe tener al menos 4 caracteres' });

  try {
    if (!(await verificarClaveSuperadmin(clave_superadmin)))
      return res.status(403).json({ mensaje: 'Clave de superadmin incorrecta' });

    const nuevo_hash = bcrypt.hashSync(clave_nueva, 10);
    const r = await pool.query(
      'UPDATE clientes_roberto SET password_hash = $1, modificado_en = now() WHERE id = $2 RETURNING id',
      [nuevo_hash, clienteId]
    );

    if (r.rowCount === 0)
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    res.json({ ok: true, mensaje: 'Clave asignada al cliente' });
  } catch (err) {
    console.error('Error asignar-clave cliente:', err.message);
    res.status(500).json({ mensaje: 'Error al asignar la clave' });
  }
});

// PUT /api/superadmin/gestion-claves/cliente/:clienteId/resetear-clave
router.put('/cliente/:clienteId/resetear-clave', async (req, res) => {
  const { clienteId } = req.params;
  const { clave_superadmin } = req.body;

  if (!clave_superadmin)
    return res.status(400).json({ mensaje: 'Falta la clave de superadmin' });

  try {
    if (!(await verificarClaveSuperadmin(clave_superadmin)))
      return res.status(403).json({ mensaje: 'Clave de superadmin incorrecta' });

    const clienteRes = await pool.query(
      'SELECT codigo_acceso FROM clientes_roberto WHERE id = $1',
      [clienteId]
    );

    if (!clienteRes.rows[0])
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    const clave_temporal = clienteRes.rows[0].codigo_acceso || Math.random().toString(36).slice(-8).toUpperCase();
    const nuevo_hash = bcrypt.hashSync(clave_temporal, 10);

    await pool.query(
      'UPDATE clientes_roberto SET password_hash = $1, modificado_en = now() WHERE id = $2',
      [nuevo_hash, clienteId]
    );

    res.json({ ok: true, mensaje: 'Clave reseteada', clave_temporal });
  } catch (err) {
    console.error('Error resetear-clave cliente:', err.message);
    res.status(500).json({ mensaje: 'Error al resetear la clave' });
  }
});

module.exports = router;
