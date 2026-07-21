const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config_negocio (
        id                BIGSERIAL PRIMARY KEY,
        cliente_id        BIGINT NOT NULL UNIQUE,
        nombre_comercial  TEXT DEFAULT '',
        cuit              TEXT DEFAULT '',
        direccion         TEXT DEFAULT '',
        logo_url          TEXT DEFAULT '',
        membrete          TEXT DEFAULT '',
        tamano_defecto    TEXT DEFAULT 'A4',
        tamano_tickets    TEXT DEFAULT 'A4',
        campana           BOOLEAN DEFAULT true,
        whatsapp_notif    BOOLEAN DEFAULT false,
        whatsapp_numero   TEXT DEFAULT '',
        creado_en         TIMESTAMPTZ DEFAULT now(),
        modificado_en     TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});
  } catch (err) {
    console.error('config: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarTokenSuperAdmin);

const CONFIG_DEFAULT = {
  nombre_comercial: '',
  cuit:             '',
  direccion:        '',
  logo_url:         '',
  membrete:         '',
  tamano_defecto:   'A4',
  tamano_tickets:   'A4',
  campana:          true,
  whatsapp_notif:   false,
  whatsapp_numero:  '',
};

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — obtener config del negocio
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const result = await pool.query(
      `SELECT * FROM config_negocio WHERE cliente_id = $1`,
      [cliente_id]
    );

    if (!result.rows[0]) {
      return res.json({ ...CONFIG_DEFAULT, cliente_id: parseInt(cliente_id, 10) });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /config error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener configuración', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id — guardar config (upsert)
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      nombre_comercial = '',
      cuit             = '',
      direccion        = '',
      logo_url         = '',
      membrete         = '',
      tamano_defecto   = 'A4',
      tamano_tickets   = 'A4',
      campana          = true,
      whatsapp_notif   = false,
      whatsapp_numero  = '',
    } = req.body;

    const result = await pool.query(
      `INSERT INTO config_negocio
         (cliente_id, nombre_comercial, cuit, direccion, logo_url, membrete,
          tamano_defecto, tamano_tickets, campana, whatsapp_notif, whatsapp_numero,
          creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
       ON CONFLICT (cliente_id) DO UPDATE SET
         nombre_comercial = EXCLUDED.nombre_comercial,
         cuit             = EXCLUDED.cuit,
         direccion        = EXCLUDED.direccion,
         logo_url         = EXCLUDED.logo_url,
         membrete         = EXCLUDED.membrete,
         tamano_defecto   = EXCLUDED.tamano_defecto,
         tamano_tickets   = EXCLUDED.tamano_tickets,
         campana          = EXCLUDED.campana,
         whatsapp_notif   = EXCLUDED.whatsapp_notif,
         whatsapp_numero  = EXCLUDED.whatsapp_numero,
         modificado_en    = now()
       RETURNING *`,
      [
        cliente_id,
        nombre_comercial, cuit, direccion, logo_url, membrete,
        tamano_defecto, tamano_tickets,
        !!campana, !!whatsapp_notif, whatsapp_numero,
      ]
    );

    res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    console.error('PUT /config error:', err.message);
    res.status(500).json({ mensaje: 'Error al guardar configuración', detalle: err.message });
  }
});

module.exports = router;
