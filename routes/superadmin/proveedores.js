const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id                BIGSERIAL PRIMARY KEY,
        cliente_id        BIGINT NOT NULL,
        nombre            TEXT NOT NULL,
        nombre_corto      TEXT DEFAULT '',
        cuit              TEXT DEFAULT '',
        condicion_iva     TEXT DEFAULT 'Responsable Inscripto',
        email             TEXT DEFAULT '',
        telefono          TEXT DEFAULT '',
        whatsapp          TEXT DEFAULT '',
        sitio_web         TEXT DEFAULT '',
        contacto_nombre   TEXT DEFAULT '',
        contacto_cargo    TEXT DEFAULT '',
        direccion         TEXT DEFAULT '',
        ciudad            TEXT DEFAULT '',
        provincia         TEXT DEFAULT '',
        plazo_pago_dias   INT DEFAULT 0,
        descuento_general NUMERIC DEFAULT 0,
        moneda            TEXT DEFAULT 'ARS',
        limite_credito    NUMERIC DEFAULT 0,
        notas             TEXT DEFAULT '',
        saldo             NUMERIC DEFAULT 0,
        saldo_vencido     NUMERIC DEFAULT 0,
        activo            BOOLEAN DEFAULT true,
        ultima_compra     TIMESTAMPTZ,
        creado_en         TIMESTAMPTZ DEFAULT now(),
        modificado_en     TIMESTAMPTZ DEFAULT now()
      )
    `);

    const cols = [
      ['nombre_corto',      "TEXT DEFAULT ''"],
      ['condicion_iva',     "TEXT DEFAULT 'Responsable Inscripto'"],
      ['sitio_web',         "TEXT DEFAULT ''"],
      ['contacto_nombre',   "TEXT DEFAULT ''"],
      ['contacto_cargo',    "TEXT DEFAULT ''"],
      ['provincia',         "TEXT DEFAULT ''"],
      ['descuento_general', 'NUMERIC DEFAULT 0'],
      ['moneda',            "TEXT DEFAULT 'ARS'"],
      ['limite_credito',    'NUMERIC DEFAULT 0'],
      ['notas',             "TEXT DEFAULT ''"],
      ['saldo_vencido',     'NUMERIC DEFAULT 0'],
      ['ultima_compra',     'TIMESTAMPTZ'],
    ];
    for (const [col, tipo] of cols) {
      await pool.query(`ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuentas_corrientes_proveedores_movimientos (
        id                  BIGSERIAL PRIMARY KEY,
        proveedor_id        BIGINT NOT NULL,
        cliente_id          BIGINT NOT NULL,
        tipo                TEXT NOT NULL DEFAULT 'compra',
        debe                NUMERIC DEFAULT 0,
        haber               NUMERIC DEFAULT 0,
        saldo_acumulado     NUMERIC DEFAULT 0,
        descripcion         TEXT DEFAULT '',
        numero_comprobante  TEXT DEFAULT '',
        fecha_comprobante   DATE,
        fecha_vencimiento   DATE,
        medio_pago_id       BIGINT,
        referencia_pago     TEXT DEFAULT '',
        es_cheque           BOOLEAN DEFAULT false,
        cheque_numero       TEXT DEFAULT '',
        cheque_banco        TEXT DEFAULT '',
        cheque_fecha_cobro  DATE,
        cheque_tipo         TEXT DEFAULT '',
        estado              TEXT DEFAULT 'pendiente',
        observaciones       TEXT DEFAULT '',
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const movCols = [
      ['fecha_comprobante',  'DATE'],
      ['medio_pago_id',      'BIGINT'],
      ['referencia_pago',    "TEXT DEFAULT ''"],
      ['es_cheque',          'BOOLEAN DEFAULT false'],
      ['cheque_numero',      "TEXT DEFAULT ''"],
      ['cheque_banco',       "TEXT DEFAULT ''"],
      ['cheque_fecha_cobro', 'DATE'],
      ['cheque_tipo',        "TEXT DEFAULT ''"],
      ['observaciones',      "TEXT DEFAULT ''"],
    ];
    for (const [col, tipo] of movCols) {
      await pool.query(`ALTER TABLE cuentas_corrientes_proveedores_movimientos ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

  } catch (err) {
    console.error('proveedores: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ─── DASHBOARD ────────────────────────────────────────────────
router.get('/:cliente_id/dashboard', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const [actRes, saldoRes, vencRes, deudaRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM proveedores WHERE cliente_id=$1 AND activo=true`, [cliente_id]),
      pool.query(`SELECT COUNT(*) FROM proveedores WHERE cliente_id=$1 AND activo=true AND saldo>0`, [cliente_id]),
      pool.query(
        `SELECT COUNT(*) FROM cuentas_corrientes_proveedores_movimientos
         WHERE cliente_id=$1 AND estado='pendiente'
           AND fecha_vencimiento IS NOT NULL
           AND fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE+7`,
        [cliente_id]
      ),
      pool.query(`SELECT COALESCE(SUM(saldo),0) AS total FROM proveedores WHERE cliente_id=$1 AND activo=true AND saldo>0`, [cliente_id]),
    ]);
    res.json({
      total_activos:       parseInt(actRes.rows[0].count, 10),
      con_saldo_pendiente: parseInt(saldoRes.rows[0].count, 10),
      vencimientos_7dias:  parseInt(vencRes.rows[0].count, 10),
      total_deuda:         parseFloat(deudaRes.rows[0].total) || 0,
    });
  } catch (err) {
    console.error('dashboard proveedores error:', err.message);
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ─── GET LISTA ────────────────────────────────────────────────
router.get('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { buscar = '', activo, con_deuda, page = '1', limit = '25' } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['cliente_id=$1'];

    if (activo === 'false') where.push('activo=false');
    else                    where.push('activo=true');

    if (con_deuda === 'true')  where.push('saldo>0');
    if (con_deuda === 'false') where.push('saldo<=0');

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(nombre ILIKE $${n} OR nombre_corto ILIKE $${n} OR cuit ILIKE $${n})`);
    }

    const w = where.join(' AND ');
    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, nombre, nombre_corto, cuit, email, telefono, whatsapp,
                ciudad, provincia, saldo, saldo_vencido, activo, ultima_compra,
                plazo_pago_dias, moneda, creado_en
         FROM proveedores WHERE ${w}
         ORDER BY nombre ASC
         LIMIT $${values.length+1} OFFSET $${values.length+2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM proveedores WHERE ${w}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));
    res.json({ proveedores: dataRes.rows, total, pagina: pageNum, paginas, por_pagina: limitNum });
  } catch (err) {
    console.error('GET proveedores error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar proveedores', detalle: err.message });
  }
});

// ─── GET DETALLE ──────────────────────────────────────────────
router.get('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(
      `SELECT * FROM proveedores WHERE id=$1 AND cliente_id=$2`, [id, cliente_id]
    );
    if (!r.rows.length) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json({ proveedor: r.rows[0] });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ─── POST CREAR ───────────────────────────────────────────────
router.post('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      nombre, nombre_corto = '', cuit = '',
      condicion_iva = 'Responsable Inscripto',
      email = '', telefono = '', whatsapp = '', sitio_web = '',
      contacto_nombre = '', contacto_cargo = '',
      direccion = '', ciudad = '', provincia = '',
      plazo_pago_dias = 0, descuento_general = 0,
      moneda = 'ARS', limite_credito = 0, notas = '',
    } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es requerido' });

    const r = await pool.query(
      `INSERT INTO proveedores
         (cliente_id, nombre, nombre_corto, cuit, condicion_iva,
          email, telefono, whatsapp, sitio_web,
          contacto_nombre, contacto_cargo,
          direccion, ciudad, provincia,
          plazo_pago_dias, descuento_general, moneda, limite_credito, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [cliente_id, nombre.trim(), nombre_corto, cuit, condicion_iva,
       email, telefono, whatsapp, sitio_web,
       contacto_nombre, contacto_cargo,
       direccion, ciudad, provincia,
       plazo_pago_dias||0, descuento_general||0, moneda, limite_credito||0, notas]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error('POST proveedores error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear proveedor', detalle: err.message });
  }
});

// ─── PUT ACTUALIZAR ───────────────────────────────────────────
router.put('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const {
      nombre, nombre_corto = '', cuit = '',
      condicion_iva = 'Responsable Inscripto',
      email = '', telefono = '', whatsapp = '', sitio_web = '',
      contacto_nombre = '', contacto_cargo = '',
      direccion = '', ciudad = '', provincia = '',
      plazo_pago_dias = 0, descuento_general = 0,
      moneda = 'ARS', limite_credito = 0, notas = '',
    } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es requerido' });

    await pool.query(
      `UPDATE proveedores SET
         nombre=$3, nombre_corto=$4, cuit=$5, condicion_iva=$6,
         email=$7, telefono=$8, whatsapp=$9, sitio_web=$10,
         contacto_nombre=$11, contacto_cargo=$12,
         direccion=$13, ciudad=$14, provincia=$15,
         plazo_pago_dias=$16, descuento_general=$17, moneda=$18,
         limite_credito=$19, notas=$20, modificado_en=now()
       WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id, nombre.trim(), nombre_corto, cuit, condicion_iva,
       email, telefono, whatsapp, sitio_web,
       contacto_nombre, contacto_cargo,
       direccion, ciudad, provincia,
       plazo_pago_dias||0, descuento_general||0, moneda, limite_credito||0, notas]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT proveedores error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar proveedor', detalle: err.message });
  }
});

// ─── DELETE (baja lógica) ─────────────────────────────────────
router.delete('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    await pool.query(
      `UPDATE proveedores SET activo=false, modificado_en=now() WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al desactivar proveedor', detalle: err.message });
  }
});

// ─── GET CUENTA CORRIENTE ─────────────────────────────────────
router.get('/:cliente_id/:id/cuenta-corriente', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const { fecha_desde, fecha_hasta, tipo, buscar = '', page = '1', limit = '25' } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [id, cliente_id];
    const where  = ['proveedor_id=$1', 'cliente_id=$2'];

    if (tipo)        { values.push(tipo);           where.push(`tipo=$${values.length}`); }
    if (fecha_desde) { values.push(fecha_desde);    where.push(`DATE(creado_en)>=$${values.length}`); }
    if (fecha_hasta) { values.push(fecha_hasta);    where.push(`DATE(creado_en)<=$${values.length}`); }
    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(descripcion ILIKE $${n} OR numero_comprobante ILIKE $${n})`);
    }

    const w = where.join(' AND ');

    // Saldo actual del proveedor
    const provRes = await pool.query(
      `SELECT saldo, saldo_vencido, nombre FROM proveedores WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    if (!provRes.rows.length) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT * FROM cuentas_corrientes_proveedores_movimientos
         WHERE ${w} ORDER BY creado_en DESC
         LIMIT $${values.length+1} OFFSET $${values.length+2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM cuentas_corrientes_proveedores_movimientos WHERE ${w}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      movimientos: dataRes.rows,
      total, pagina: pageNum, paginas,
      saldo_actual:  parseFloat(provRes.rows[0].saldo)         || 0,
      saldo_vencido: parseFloat(provRes.rows[0].saldo_vencido) || 0,
      nombre:        provRes.rows[0].nombre,
    });
  } catch (err) {
    console.error('GET CC proveedor error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener cuenta corriente', detalle: err.message });
  }
});

// ─── POST MOVIMIENTO ──────────────────────────────────────────
router.post('/:cliente_id/:id/movimiento', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const {
      tipo               = 'compra',
      debe               = 0,
      haber              = 0,
      descripcion        = '',
      numero_comprobante = '',
      fecha_comprobante,
      fecha_vencimiento,
      medio_pago_id,
      referencia_pago    = '',
      es_cheque          = false,
      cheque_numero      = '',
      cheque_banco       = '',
      cheque_fecha_cobro,
      cheque_tipo        = '',
      estado             = 'pendiente',
      observaciones      = '',
    } = req.body;

    const provRes = await pool.query(
      `SELECT saldo FROM proveedores WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    if (!provRes.rows.length) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });

    const saldoAnt  = parseFloat(provRes.rows[0].saldo) || 0;
    const debeNum   = parseFloat(debe)  || 0;
    const haberNum  = parseFloat(haber) || 0;
    // Para proveedores: compras aumentan deuda (debe), pagos la reducen (haber)
    const saldoAct  = saldoAnt + debeNum - haberNum;

    await pool.query(
      `INSERT INTO cuentas_corrientes_proveedores_movimientos
         (proveedor_id, cliente_id, tipo, debe, haber, saldo_acumulado,
          descripcion, numero_comprobante, fecha_comprobante, fecha_vencimiento,
          medio_pago_id, referencia_pago, es_cheque,
          cheque_numero, cheque_banco, cheque_fecha_cobro, cheque_tipo,
          estado, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [id, cliente_id, tipo, debeNum, haberNum, saldoAct,
       descripcion, numero_comprobante,
       fecha_comprobante || null, fecha_vencimiento || null,
       medio_pago_id || null, referencia_pago, es_cheque || false,
       cheque_numero, cheque_banco, cheque_fecha_cobro || null, cheque_tipo,
       estado, observaciones]
    );

    // Recalcular saldo vencido
    const vencRes = await pool.query(
      `SELECT COALESCE(SUM(debe-haber),0) AS vencido
       FROM cuentas_corrientes_proveedores_movimientos
       WHERE proveedor_id=$1 AND estado='pendiente'
         AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE`,
      [id]
    );
    const saldoVenc = Math.max(0, parseFloat(vencRes.rows[0].vencido) || 0);

    await pool.query(
      `UPDATE proveedores SET saldo=$1, saldo_vencido=$2, modificado_en=now()
       WHERE id=$3`,
      [saldoAct, saldoVenc, id]
    );

    res.json({ ok: true, saldo_actual: saldoAct });
  } catch (err) {
    console.error('POST movimiento proveedor error:', err.message);
    res.status(500).json({ mensaje: 'Error al registrar movimiento', detalle: err.message });
  }
});

module.exports = router;
