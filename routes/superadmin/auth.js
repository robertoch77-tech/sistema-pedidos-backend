const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../../db');

async function asegurarUsuarioPorDefecto() {
  try {
    const resultado = await pool.query(
      "SELECT id FROM superadmin_usuarios WHERE cuit = '000000' LIMIT 1"
    );

    // IMPORTANTE: Setear SUPERADMIN_PASSWORD=roberto9221
    // en variables de entorno de Render
    // No usar el fallback 'roberto2024' en producción
    const hash = bcrypt.hashSync(
      process.env.SUPERADMIN_PASSWORD || 'roberto2024', 10
    );

    if (resultado.rows.length === 0) {
      await pool.query(
        `INSERT INTO superadmin_usuarios (nombre, email, cuit, password_hash, rol, activo)
         VALUES ($1, $2, $3, $4, $5, true)`,
        ['Roberto', 'roberto@rch.com', '000000', hash, 'superadmin']
      );
      console.log('SuperAdmin: usuario por defecto creado');
    } else {
      await pool.query(
        'UPDATE superadmin_usuarios SET password_hash = $1 WHERE cuit = $2',
        [hash, '000000']
      );
      console.log('SuperAdmin: password_hash actualizado');
    }
  } catch (err) {
    console.error('SuperAdmin: error al asegurar usuario:', err.message);
  }
}

asegurarUsuarioPorDefecto();

router.get('/auth/test', (req, res) => {
  res.json({ ok: true });
});

router.post('/auth/login', async (req, res) => {
  try {
    const { cuit, clave } = req.body;
    if (!cuit || !clave) {
      return res.status(400).json({ mensaje: 'CUIT y clave son requeridos' });
    }

    const resultado = await pool.query(
      `SELECT * FROM superadmin_usuarios
       WHERE (cuit = $1 OR email = $1) AND activo = true`,
      [cuit.trim()]
    );

    if (!resultado.rows[0]) {
      return res.status(401).json({ mensaje: 'CUIT o clave incorrectos' });
    }

    const usuario = resultado.rows[0];
    const claveOk = bcrypt.compareSync(clave, usuario.password_hash);

    if (!claveOk) {
      return res.status(401).json({ mensaje: 'CUIT o clave incorrectos' });
    }

    pool.query(
      'UPDATE superadmin_usuarios SET ultimo_acceso = now() WHERE id = $1',
      [usuario.id]
    ).catch(() => {});

    res.json({
      ok: true,
      usuario: {
        id: usuario.id,
        cuit: usuario.cuit,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        permisos: usuario.permisos || {},
      },
      token: `sa_${usuario.id}_${Date.now()}`,
    });
  } catch (error) {
    console.error('SuperAdmin login error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Middleware: verifica x-superadmin-token en cada request
async function verificarTokenSuperAdmin(req, res, next) {
  const token = req.headers['x-superadmin-token'];
  if (!token) return res.status(401).json({ mensaje: 'Token requerido' });
  const match = token.match(/^sa_(\d+)_\d+$/);
  if (!match) return res.status(401).json({ mensaje: 'Token inválido' });
  try {
    const resultado = await pool.query(
      'SELECT id FROM superadmin_usuarios WHERE id=$1 AND activo=true',
      [match[1]]
    );
    if (!resultado.rows[0]) return res.status(401).json({ mensaje: 'Token inválido' });
    next();
  } catch (err) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
}

module.exports = router;
module.exports.verificarTokenSuperAdmin = verificarTokenSuperAdmin;
