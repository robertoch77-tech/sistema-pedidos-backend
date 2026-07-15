const express  = require('express');
const router   = express.Router();
const pool     = require('../../db');
const bcrypt   = require('bcryptjs');

// ── Asegurar tabla pi_usuarios ────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pi_usuarios (
        id          BIGSERIAL PRIMARY KEY,
        email       TEXT UNIQUE NOT NULL,
        password    TEXT NOT NULL,
        nombre      TEXT,
        rol         TEXT NOT NULL DEFAULT 'operador',
        activo      BOOLEAN DEFAULT true,
        creado_en   TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Si no hay usuarios → crear admin por defecto
    const { rows } = await pool.query('SELECT COUNT(*) FROM pi_usuarios');
    if (parseInt(rows[0].count) === 0) {
      const hash = await bcrypt.hash('pi2024', 10);
      await pool.query(
        `INSERT INTO pi_usuarios (email, password, nombre, rol)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        ['admin@pi.com', hash, 'Admin', 'admin']
      );
    }
  } catch (err) {
    console.error('PI Auth: error al asegurar tablas:', err.message);
  }
}
asegurarTablas();

// ── GET /test ─────────────────────────────────────────────────
router.get('/test', (_req, res) => {
  res.json({ ok: true });
});

// ── POST /login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM pi_usuarios WHERE email = $1 AND activo = true',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    const usuario = rows[0];
    const valido  = await bcrypt.compare(password, usuario.password);

    if (!valido) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    const token = `pi_${usuario.id}_${Date.now()}`;

    res.json({
      ok: true,
      token,
      usuario: {
        id:     usuario.id,
        email:  usuario.email,
        nombre: usuario.nombre,
        rol:    usuario.rol,
      },
    });
  } catch (err) {
    console.error('PI login:', err.message);
    res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});

module.exports = router;
