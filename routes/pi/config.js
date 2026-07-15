const express = require('express');
const router  = express.Router();
const pool    = require('../../db');

function autenticar(req, res, next) {
  const token = req.headers['x-pi-token'];
  if (!token || !token.startsWith('pi_')) return res.status(401).json({ error: 'No autorizado' });
  next();
}
router.use(autenticar);

const DEFAULTS = {
  nombre_empresa:    'DISTRIBUIDORA',
  razon_social:      '',
  cuit:              '',
  direccion:         '',
  telefono:          '',
  email:             '',
  logo_url:          '',
  membrete_linea_1:  '',
  membrete_linea_2:  '',
  membrete_linea_3:  '',
  membrete_linea_4:  '',
  tamano_hoja:       'A4',
  items_por_hoja:    30,
  prefijo_pedido:    'NP',
};

async function asegurarConfigColumnas() {
  const cols = [
    ['nombre_empresa',   'TEXT DEFAULT \'DISTRIBUIDORA\''],
    ['razon_social',     'TEXT DEFAULT \'\''],
    ['cuit',             'TEXT DEFAULT \'\''],
    ['direccion',        'TEXT DEFAULT \'\''],
    ['telefono',         'TEXT DEFAULT \'\''],
    ['email',            'TEXT DEFAULT \'\''],
    ['logo_url',         'TEXT DEFAULT \'\''],
    ['membrete_linea_1', 'TEXT DEFAULT \'\''],
    ['membrete_linea_2', 'TEXT DEFAULT \'\''],
    ['membrete_linea_3', 'TEXT DEFAULT \'\''],
    ['membrete_linea_4', 'TEXT DEFAULT \'\''],
    ['tamano_hoja',      'TEXT DEFAULT \'A4\''],
    ['items_por_hoja',   'INTEGER DEFAULT 30'],
    ['prefijo_pedido',   'TEXT DEFAULT \'NP\''],
  ];
  for (const [col, def] of cols) {
    try {
      await pool.query(`ALTER TABLE pi_config ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    } catch { /* columna ya existe */ }
  }
}

// ── GET / ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    await asegurarConfigColumnas();
    let r = await pool.query(`SELECT * FROM pi_config ORDER BY id LIMIT 1`);
    if (!r.rows.length) {
      await pool.query(`
        INSERT INTO pi_config (ultimo_numero_pedido, nombre_empresa, tamano_hoja, items_por_hoja, prefijo_pedido)
        VALUES (0, $1, $2, $3, $4)`,
        [DEFAULTS.nombre_empresa, DEFAULTS.tamano_hoja, DEFAULTS.items_por_hoja, DEFAULTS.prefijo_pedido]
      );
      r = await pool.query(`SELECT * FROM pi_config ORDER BY id LIMIT 1`);
    }
    res.json({ ok: true, config: { ...DEFAULTS, ...r.rows[0] } });
  } catch (err) {
    console.error('GET /pi/config', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT / ─────────────────────────────────────────────────────
router.put('/', async (req, res) => {
  try {
    await asegurarConfigColumnas();
    const {
      nombre_empresa, razon_social, cuit, direccion, telefono, email, logo_url,
      membrete_linea_1, membrete_linea_2, membrete_linea_3, membrete_linea_4,
      tamano_hoja, items_por_hoja, prefijo_pedido,
    } = req.body;

    const r = await pool.query(`SELECT id FROM pi_config ORDER BY id LIMIT 1`);

    if (r.rows.length) {
      await pool.query(`
        UPDATE pi_config SET
          nombre_empresa   = $1,  razon_social     = $2,  cuit             = $3,
          direccion        = $4,  telefono         = $5,  email            = $6,
          logo_url         = $7,  membrete_linea_1 = $8,  membrete_linea_2 = $9,
          membrete_linea_3 = $10, membrete_linea_4 = $11, tamano_hoja      = $12,
          items_por_hoja   = $13, prefijo_pedido   = $14
        WHERE id = $15`,
        [nombre_empresa, razon_social, cuit, direccion, telefono, email, logo_url,
         membrete_linea_1, membrete_linea_2, membrete_linea_3, membrete_linea_4,
         tamano_hoja, items_por_hoja ?? 30, prefijo_pedido, r.rows[0].id]
      );
    } else {
      await pool.query(`
        INSERT INTO pi_config
          (ultimo_numero_pedido, nombre_empresa, razon_social, cuit, direccion, telefono, email, logo_url,
           membrete_linea_1, membrete_linea_2, membrete_linea_3, membrete_linea_4,
           tamano_hoja, items_por_hoja, prefijo_pedido)
        VALUES (0,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [nombre_empresa, razon_social, cuit, direccion, telefono, email, logo_url,
         membrete_linea_1, membrete_linea_2, membrete_linea_3, membrete_linea_4,
         tamano_hoja, items_por_hoja ?? 30, prefijo_pedido]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /pi/config', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /reiniciar-numeracion ────────────────────────────────
router.post('/reiniciar-numeracion', async (req, res) => {
  try {
    await pool.query(`UPDATE pi_config SET ultimo_numero_pedido = 0`);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /pi/config/reiniciar', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
