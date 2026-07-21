const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheques (
        id                 BIGSERIAL PRIMARY KEY,
        cliente_id         BIGINT NOT NULL,
        tipo               TEXT DEFAULT 'tercero',
        origen             TEXT DEFAULT 'cobro_cliente',
        estado             TEXT DEFAULT 'en_cartera',
        numero             TEXT DEFAULT '',
        banco              TEXT DEFAULT '',
        sucursal_banco     TEXT DEFAULT '',
        cuenta_numero      TEXT DEFAULT '',
        cbu                TEXT DEFAULT '',
        titular_nombre     TEXT DEFAULT '',
        titular_cuit       TEXT DEFAULT '',
        monto              NUMERIC DEFAULT 0,
        moneda             TEXT DEFAULT 'ARS',
        fecha_emision      DATE,
        fecha_cobro        DATE,
        es_diferido        BOOLEAN DEFAULT false,
        fecha_deposito     DATE,
        fecha_cobro_real   DATE,
        fecha_rechazo      DATE,
        motivo_rechazo     TEXT DEFAULT '',
        banco_deposito     TEXT DEFAULT '',
        cuenta_deposito    TEXT DEFAULT '',
        endosado_a         TEXT DEFAULT '',
        endosado_a_cuit    TEXT DEFAULT '',
        fecha_endoso       DATE,
        venta_pago_id      BIGINT,
        observaciones      TEXT DEFAULT '',
        activo             BOOLEAN DEFAULT true,
        creado_en          TIMESTAMPTZ DEFAULT now(),
        actualizado_en     TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const cols = [
      ['sucursal_banco',  "TEXT DEFAULT ''"],
      ['cuenta_numero',   "TEXT DEFAULT ''"],
      ['cbu',             "TEXT DEFAULT ''"],
      ['moneda',          "TEXT DEFAULT 'ARS'"],
      ['es_diferido',     'BOOLEAN DEFAULT false'],
      ['fecha_deposito',  'DATE'],
      ['fecha_cobro_real','DATE'],
      ['fecha_rechazo',   'DATE'],
      ['motivo_rechazo',  "TEXT DEFAULT ''"],
      ['banco_deposito',  "TEXT DEFAULT ''"],
      ['cuenta_deposito', "TEXT DEFAULT ''"],
      ['endosado_a',      "TEXT DEFAULT ''"],
      ['endosado_a_cuit', "TEXT DEFAULT ''"],
      ['fecha_endoso',    'DATE'],
      ['venta_pago_id',       'BIGINT'],
      ['activo',              'BOOLEAN DEFAULT true'],
      ['origen_id',           'BIGINT'],
      ['cliente_proveedor',   "TEXT DEFAULT ''"],
    ];
    for (const [col, tipo] of cols) {
      await pool.query(`ALTER TABLE cheques ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
  } catch (err) {
    console.error('cheques: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarTokenSuperAdmin);

function n(v) { return parseFloat(v) || 0; }

// ─── GET /:cliente_id — lista con filtros ─────────────────────
router.get('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { tipo, origen, estado, fecha_cobro_desde, fecha_cobro_hasta, banco, buscar, page = 1, limit = 25 } = req.query;

    const conds = ['cliente_id=$1', 'activo=true'];
    const params = [cliente_id];

    if (tipo)               { params.push(tipo);               conds.push(`tipo=$${params.length}`); }
    if (origen)             { params.push(origen);             conds.push(`origen=$${params.length}`); }
    if (estado)             { params.push(estado);             conds.push(`estado=$${params.length}`); }
    if (banco)              { params.push(banco);              conds.push(`banco=$${params.length}`); }
    if (fecha_cobro_desde)  { params.push(fecha_cobro_desde);  conds.push(`fecha_cobro >= $${params.length}`); }
    if (fecha_cobro_hasta)  { params.push(fecha_cobro_hasta);  conds.push(`fecha_cobro <= $${params.length}`); }
    if (buscar) {
      params.push(`%${buscar}%`);
      conds.push(`(numero ILIKE $${params.length} OR titular_nombre ILIKE $${params.length})`);
    }

    const where = conds.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows, tot] = await Promise.all([
      pool.query(
        `SELECT * FROM cheques WHERE ${where}
         ORDER BY fecha_cobro ASC, creado_en DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM cheques WHERE ${where}`, params),
    ]);

    const total = parseInt(tot.rows[0].count, 10);
    res.json({ cheques: rows.rows, total, pagina: parseInt(page), paginas: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('cheques lista:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/resumen ─────────────────────────────────
router.get('/:cliente_id/resumen', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [cartera, cobrar7, vencidos, entregadosMes, porBanco] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS monto
         FROM cheques WHERE cliente_id=$1 AND estado='en_cartera' AND activo=true`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS monto
         FROM cheques WHERE cliente_id=$1 AND estado='en_cartera' AND activo=true
           AND fecha_cobro BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS monto
         FROM cheques WHERE cliente_id=$1 AND estado='en_cartera' AND activo=true
           AND fecha_cobro < CURRENT_DATE`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS monto
         FROM cheques WHERE cliente_id=$1 AND estado IN ('entregado','endosado') AND activo=true
           AND date_trunc('month', creado_en) = date_trunc('month', CURRENT_DATE)`,
        [cliente_id]
      ),
      pool.query(
        `SELECT banco, COUNT(*) AS cantidad, COALESCE(SUM(monto),0) AS monto
         FROM cheques WHERE cliente_id=$1 AND estado='en_cartera' AND activo=true
         GROUP BY banco ORDER BY monto DESC LIMIT 10`,
        [cliente_id]
      ),
    ]);

    res.json({
      en_cartera:      { cantidad: parseInt(cartera.rows[0].cantidad), monto: n(cartera.rows[0].monto) },
      a_cobrar_7dias:  { cantidad: parseInt(cobrar7.rows[0].cantidad), monto: n(cobrar7.rows[0].monto) },
      vencidos:        { cantidad: parseInt(vencidos.rows[0].cantidad), monto: n(vencidos.rows[0].monto) },
      entregados_mes:  { cantidad: parseInt(entregadosMes.rows[0].cantidad), monto: n(entregadosMes.rows[0].monto) },
      por_banco:       porBanco.rows.map(r => ({ banco: r.banco, cantidad: parseInt(r.cantidad), monto: n(r.monto) })),
    });
  } catch (err) {
    console.error('cheques resumen:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/:id — detalle ──────────────────────────
router.get('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(
      `SELECT * FROM cheques WHERE id=$1 AND cliente_id=$2 AND activo=true`,
      [id, cliente_id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('cheques detalle:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:cliente_id — crear cheque ────────────────────────
router.post('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      tipo = 'tercero', origen = 'cobro_cliente', numero, banco, sucursal_banco,
      cuenta_numero, cbu, titular_nombre, titular_cuit, monto, moneda = 'ARS',
      fecha_emision, fecha_cobro, es_diferido = false, venta_pago_id, observaciones,
    } = req.body;

    if (!numero || !banco || !titular_nombre || !monto || !fecha_emision || !fecha_cobro) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const r = await pool.query(
      `INSERT INTO cheques
         (cliente_id, tipo, origen, estado, numero, banco, sucursal_banco, cuenta_numero,
          cbu, titular_nombre, titular_cuit, monto, moneda, fecha_emision, fecha_cobro,
          es_diferido, venta_pago_id, observaciones)
       VALUES ($1,$2,$3,'en_cartera',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [cliente_id, tipo, origen, numero, banco, sucursal_banco || '', cuenta_numero || '',
       cbu || '', titular_nombre, titular_cuit || '', n(monto), moneda,
       fecha_emision, fecha_cobro, es_diferido, venta_pago_id || null, observaciones || '']
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error('cheques crear:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:cliente_id/:id/estado ──────────────────────────────
router.put('/:cliente_id/:id/estado', async (req, res) => {
  const client = await pool.connect();
  try {
    const { cliente_id, id } = req.params;
    const {
      estado, fecha_deposito, fecha_cobro_real, fecha_rechazo, motivo_rechazo,
      banco_deposito, cuenta_deposito, endosado_a, endosado_a_cuit, fecha_endoso,
      registrar_cargo_cc, monto_cargo,
    } = req.body;

    await client.query('BEGIN');

    await client.query(
      `UPDATE cheques SET
         estado=$1,
         fecha_deposito   = COALESCE($2::date, fecha_deposito),
         fecha_cobro_real = COALESCE($3::date, fecha_cobro_real),
         fecha_rechazo    = COALESCE($4::date, fecha_rechazo),
         motivo_rechazo   = COALESCE($5, motivo_rechazo),
         banco_deposito   = COALESCE($6, banco_deposito),
         cuenta_deposito  = COALESCE($7, cuenta_deposito),
         endosado_a       = COALESCE($8, endosado_a),
         endosado_a_cuit  = COALESCE($9, endosado_a_cuit),
         fecha_endoso     = COALESCE($10::date, fecha_endoso),
         actualizado_en   = now()
       WHERE id=$11 AND cliente_id=$12`,
      [estado, fecha_deposito || null, fecha_cobro_real || null, fecha_rechazo || null,
       motivo_rechazo || null, banco_deposito || null, cuenta_deposito || null,
       endosado_a || null, endosado_a_cuit || null, fecha_endoso || null,
       id, cliente_id]
    );

    // Si rechazado y se pidió registrar cargo en CC cliente
    if (estado === 'rechazado' && registrar_cargo_cc && monto_cargo) {
      await client.query(
        `INSERT INTO cuentas_corrientes_clientes_movimientos
           (cuenta_id, tipo, monto, descripcion, creado_en)
         SELECT cc.id, 'debito', $1, 'Cheque rechazado nro ' || c.numero, now()
         FROM cheques c
         JOIN cuentas_corrientes_clientes cc ON cc.cliente_id = c.cliente_id
         WHERE c.id=$2
         LIMIT 1`,
        [n(monto_cargo), id]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cheques estado:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── DELETE /:cliente_id/:id ──────────────────────────────────
router.delete('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const check = await pool.query(
      `SELECT estado FROM cheques WHERE id=$1 AND cliente_id=$2 AND activo=true`,
      [id, cliente_id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    if (check.rows[0].estado !== 'en_cartera') return res.status(400).json({ error: 'Solo se pueden eliminar cheques en cartera' });
    await pool.query(`UPDATE cheques SET activo=false, actualizado_en=now() WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('cheques delete:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
