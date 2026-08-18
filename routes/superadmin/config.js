const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const crypto  = require('crypto');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

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
        iva_modo_defecto  VARCHAR(20) DEFAULT 'discriminar',
        alias_pago        TEXT DEFAULT '',
        cbu_pago          TEXT DEFAULT '',
        banco_pago        TEXT DEFAULT '',
        pago_public_token TEXT UNIQUE,
        creado_en         TIMESTAMPTZ DEFAULT now(),
        modificado_en     TIMESTAMPTZ DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE config_negocio ADD COLUMN IF NOT EXISTS iva_modo_defecto VARCHAR(20) DEFAULT 'discriminar'`);
    await pool.query(`ALTER TABLE config_negocio ADD COLUMN IF NOT EXISTS alias_pago TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE config_negocio ADD COLUMN IF NOT EXISTS cbu_pago TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE config_negocio ADD COLUMN IF NOT EXISTS banco_pago TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE config_negocio ADD COLUMN IF NOT EXISTS pago_public_token TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_config_pago_public_token ON config_negocio(pago_public_token)`);

    const sinToken = await pool.query(`SELECT id FROM config_negocio WHERE pago_public_token IS NULL OR pago_public_token = ''`);
    for (const row of sinToken.rows) {
      await pool.query(
        'UPDATE config_negocio SET pago_public_token=$1 WHERE id=$2',
        [crypto.randomBytes(24).toString('hex'), row.id]
      );
    }
  } catch (err) {
    console.error('config: error asegurando tablas:', err.message);
  }
}
const tablasListas = asegurarTablas();

router.use(verificarCualquierToken);

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
  iva_modo_defecto: 'discriminar',
  alias_pago:       '',
  cbu_pago:         '',
  banco_pago:       '',
  pago_public_token: '',
};

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — obtener config del negocio
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    await tablasListas;
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
router.put('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    await tablasListas;
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
      iva_modo_defecto = 'discriminar',
      alias_pago       = '',
      cbu_pago         = '',
      banco_pago       = '',
    } = req.body;

    const aliasLimpio = String(alias_pago || '').trim();
    const cbuLimpio = String(cbu_pago || '').replace(/\s/g, '');
    const bancoLimpio = String(banco_pago || '').trim();
    if (aliasLimpio && !/^[a-zA-Z0-9._-]{6,50}$/.test(aliasLimpio)) {
      return res.status(400).json({ mensaje: 'Alias inválido: usá letras, números, punto, guion o guion bajo.' });
    }
    if (cbuLimpio && !/^\d{22}$/.test(cbuLimpio)) {
      return res.status(400).json({ mensaje: 'El CBU/CVU debe tener exactamente 22 números.' });
    }
    if (bancoLimpio.length > 80) {
      return res.status(400).json({ mensaje: 'El nombre del banco es demasiado largo.' });
    }
    const pagoPublicToken = crypto.randomBytes(24).toString('hex');

    const result = await pool.query(
      `INSERT INTO config_negocio
         (cliente_id, nombre_comercial, cuit, direccion, logo_url, membrete,
          tamano_defecto, tamano_tickets, campana, whatsapp_notif, whatsapp_numero,
          iva_modo_defecto, alias_pago, cbu_pago, banco_pago, pago_public_token,
          creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())
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
         iva_modo_defecto = EXCLUDED.iva_modo_defecto,
         alias_pago       = EXCLUDED.alias_pago,
         cbu_pago         = EXCLUDED.cbu_pago,
         banco_pago       = EXCLUDED.banco_pago,
         pago_public_token = COALESCE(NULLIF(config_negocio.pago_public_token, ''), EXCLUDED.pago_public_token),
         modificado_en    = now()
       RETURNING *`,
      [
        cliente_id,
        nombre_comercial, cuit, direccion, logo_url, membrete,
        tamano_defecto, tamano_tickets,
        !!campana, !!whatsapp_notif, whatsapp_numero, iva_modo_defecto,
        aliasLimpio, cbuLimpio, bancoLimpio, pagoPublicToken,
      ]
    );

    res.json({ ok: true, config: result.rows[0] });
  } catch (err) {
    console.error('PUT /config error:', err.message);
    res.status(500).json({ mensaje: 'Error al guardar configuración', detalle: err.message });
  }
});

module.exports = router;
