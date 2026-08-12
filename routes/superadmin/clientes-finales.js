const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuentas_corrientes_clientes (
        id                     BIGSERIAL PRIMARY KEY,
        cliente_id             BIGINT NOT NULL,
        comprador_nombre       TEXT NOT NULL,
        comprador_cuit         TEXT DEFAULT '',
        comprador_razon_social TEXT DEFAULT '',
        comprador_email        TEXT DEFAULT '',
        comprador_telefono     TEXT DEFAULT '',
        comprador_whatsapp     TEXT DEFAULT '',
        comprador_direccion    TEXT DEFAULT '',
        comprador_ciudad       TEXT DEFAULT '',
        condicion_iva          TEXT DEFAULT 'Consumidor Final',
        lista_precio_id        INT DEFAULT 1,
        limite_credito         NUMERIC DEFAULT 0,
        plazo_pago_dias        INT DEFAULT 0,
        descuento_especial     NUMERIC DEFAULT 0,
        es_mostrador           BOOLEAN DEFAULT false,
        saldo                  NUMERIC DEFAULT 0,
        saldo_vencido          NUMERIC DEFAULT 0,
        bloqueado              BOOLEAN DEFAULT false,
        motivo_bloqueo         TEXT DEFAULT '',
        activo                 BOOLEAN DEFAULT true,
        ultima_compra          TIMESTAMPTZ,
        creado_en              TIMESTAMPTZ DEFAULT now(),
        modificado_en          TIMESTAMPTZ DEFAULT now()
      )
    `);

    const cols = [
      ['comprador_razon_social', 'TEXT DEFAULT \'\''],
      ['comprador_whatsapp',     'TEXT DEFAULT \'\''],
      ['comprador_direccion',    'TEXT DEFAULT \'\''],
      ['comprador_ciudad',       'TEXT DEFAULT \'\''],
      ['condicion_iva',          'TEXT DEFAULT \'Consumidor Final\''],
      ['limite_credito',         'NUMERIC DEFAULT 0'],
      ['plazo_pago_dias',        'INT DEFAULT 0'],
      ['descuento_especial',     'NUMERIC DEFAULT 0'],
      ['es_mostrador',           'BOOLEAN DEFAULT false'],
      ['saldo_vencido',          'NUMERIC DEFAULT 0'],
      ['bloqueado',              'BOOLEAN DEFAULT false'],
      ['motivo_bloqueo',         'TEXT DEFAULT \'\''],
      ['ultima_compra',          'TIMESTAMPTZ'],
    ];
    for (const [col, tipo] of cols) {
      await pool.query(`ALTER TABLE cuentas_corrientes_clientes ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS movimientos_cuentas_corrientes (
        id                    BIGSERIAL PRIMARY KEY,
        cuenta_corriente_id   BIGINT NOT NULL,
        cliente_id            BIGINT NOT NULL,
        tipo                  TEXT NOT NULL DEFAULT 'venta',
        debe                  NUMERIC DEFAULT 0,
        haber                 NUMERIC DEFAULT 0,
        saldo_acumulado       NUMERIC DEFAULT 0,
        descripcion           TEXT DEFAULT '',
        numero_comprobante    TEXT DEFAULT '',
        fecha_vencimiento     DATE,
        venta_id              BIGINT,
        estado                TEXT DEFAULT 'pendiente',
        medio_pago            TEXT DEFAULT '',
        referencia            TEXT DEFAULT '',
        observaciones         TEXT DEFAULT '',
        creado_en             TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`ALTER TABLE movimientos_cuentas_corrientes ADD COLUMN IF NOT EXISTS medio_pago TEXT DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE movimientos_cuentas_corrientes ADD COLUMN IF NOT EXISTS referencia TEXT DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE movimientos_cuentas_corrientes ADD COLUMN IF NOT EXISTS observaciones TEXT DEFAULT ''`).catch(() => {});

  } catch (err) {
    console.error('clientes-finales: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ─── DASHBOARD ────────────────────────────────────────────────
router.get('/:cliente_id/dashboard', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [actRes, deudaRes, vencidaRes, nuevosRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM cuentas_corrientes_clientes
         WHERE cliente_id=$1 AND activo=true AND bloqueado=false`, [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) FROM cuentas_corrientes_clientes
         WHERE cliente_id=$1 AND activo=true AND saldo>0`, [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) FROM cuentas_corrientes_clientes
         WHERE cliente_id=$1 AND activo=true AND saldo_vencido>0`, [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) FROM cuentas_corrientes_clientes
         WHERE cliente_id=$1 AND activo=true
           AND DATE_TRUNC('month', creado_en)=DATE_TRUNC('month', NOW())`, [cliente_id]
      ),
    ]);

    res.json({
      total_activos:   parseInt(actRes.rows[0].count,     10),
      con_deuda:       parseInt(deudaRes.rows[0].count,   10),
      deuda_vencida:   parseInt(vencidaRes.rows[0].count, 10),
      nuevos_mes:      parseInt(nuevosRes.rows[0].count,  10),
    });
  } catch (err) {
    console.error('dashboard clientes-finales error:', err.message);
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ─── GET LISTA ────────────────────────────────────────────────
router.get('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { buscar = '', activo, con_deuda, page = '1', limit = '25' } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['cliente_id = $1'];

    if (activo === 'false') where.push('activo = false');
    else if (activo === 'bloqueado') { where.push('activo = true'); where.push('bloqueado = true'); }
    else where.push('activo = true');

    if (con_deuda === 'true')  where.push('saldo > 0');
    if (con_deuda === 'false') where.push('saldo <= 0');

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(comprador_nombre ILIKE $${n} OR comprador_cuit ILIKE $${n} OR comprador_razon_social ILIKE $${n})`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, comprador_nombre, comprador_cuit, comprador_razon_social,
                comprador_email, comprador_telefono, comprador_whatsapp,
                comprador_direccion, comprador_ciudad, condicion_iva,
                lista_precio_id, saldo, saldo_vencido, bloqueado, activo,
                ultima_compra, creado_en, modificado_en,
                limite_credito, plazo_pago_dias, descuento_especial
         FROM cuentas_corrientes_clientes
         WHERE ${whereStr}
         ORDER BY comprador_nombre ASC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM cuentas_corrientes_clientes WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ clientes: dataRes.rows, total, pagina: pageNum, paginas, por_pagina: limitNum });
  } catch (err) {
    console.error('GET clientes-finales error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar clientes', detalle: err.message });
  }
});

// ─── GET DETALLE ──────────────────────────────────────────────
router.get('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const r = await pool.query(
      `SELECT * FROM cuentas_corrientes_clientes WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    if (!r.rows.length) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json({ cliente: r.rows[0] });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ─── POST CREAR ───────────────────────────────────────────────
router.post('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      comprador_nombre,
      comprador_cuit         = '',
      comprador_razon_social = '',
      comprador_email        = '',
      comprador_telefono     = '',
      comprador_whatsapp     = '',
      comprador_direccion    = '',
      comprador_ciudad       = '',
      condicion_iva          = 'Consumidor Final',
      lista_precio_id        = 1,
      limite_credito         = 0,
      plazo_pago_dias        = 0,
      descuento_especial     = 0,
      es_mostrador           = false,
    } = req.body;

    if (!comprador_nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es requerido' });

    const result = await pool.query(
      `INSERT INTO cuentas_corrientes_clientes
         (cliente_id, comprador_nombre, comprador_cuit, comprador_razon_social,
          comprador_email, comprador_telefono, comprador_whatsapp,
          comprador_direccion, comprador_ciudad, condicion_iva,
          lista_precio_id, limite_credito, plazo_pago_dias,
          descuento_especial, es_mostrador)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [cliente_id, comprador_nombre.trim(), comprador_cuit, comprador_razon_social,
       comprador_email, comprador_telefono, comprador_whatsapp,
       comprador_direccion, comprador_ciudad, condicion_iva,
       lista_precio_id || 1, limite_credito || 0, plazo_pago_dias || 0,
       descuento_especial || 0, es_mostrador || false]
    );

    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('POST clientes-finales error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear cliente', detalle: err.message });
  }
});

// ─── PUT ACTUALIZAR ───────────────────────────────────────────
router.put('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const {
      comprador_nombre,
      comprador_cuit         = '',
      comprador_razon_social = '',
      comprador_email        = '',
      comprador_telefono     = '',
      comprador_whatsapp     = '',
      comprador_direccion    = '',
      comprador_ciudad       = '',
      condicion_iva          = 'Consumidor Final',
      lista_precio_id        = 1,
      limite_credito         = 0,
      plazo_pago_dias        = 0,
      descuento_especial     = 0,
      es_mostrador           = false,
    } = req.body;

    if (!comprador_nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es requerido' });

    await pool.query(
      `UPDATE cuentas_corrientes_clientes SET
         comprador_nombre=$3, comprador_cuit=$4, comprador_razon_social=$5,
         comprador_email=$6, comprador_telefono=$7, comprador_whatsapp=$8,
         comprador_direccion=$9, comprador_ciudad=$10, condicion_iva=$11,
         lista_precio_id=$12, limite_credito=$13, plazo_pago_dias=$14,
         descuento_especial=$15, es_mostrador=$16, modificado_en=now()
       WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id, comprador_nombre.trim(), comprador_cuit, comprador_razon_social,
       comprador_email, comprador_telefono, comprador_whatsapp,
       comprador_direccion, comprador_ciudad, condicion_iva,
       lista_precio_id || 1, limite_credito || 0, plazo_pago_dias || 0,
       descuento_especial || 0, es_mostrador || false]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT clientes-finales error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar cliente', detalle: err.message });
  }
});

// ─── DELETE BAJA LÓGICA ───────────────────────────────────────
router.delete('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    await pool.query(
      `UPDATE cuentas_corrientes_clientes SET activo=false, modificado_en=now()
       WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al eliminar cliente', detalle: err.message });
  }
});

// ─── GET MOVIMIENTOS ──────────────────────────────────────────
router.get('/:cliente_id/:id/movimientos', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const { fecha_desde, fecha_hasta, tipo, buscar = '', page = '1', limit = '25' } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [id, cliente_id];
    const where  = ['cuenta_corriente_id=$1', 'cliente_id=$2'];

    if (tipo) { values.push(tipo); where.push(`tipo=$${values.length}`); }
    if (fecha_desde) { values.push(fecha_desde); where.push(`DATE(creado_en)>=$${values.length}`); }
    if (fecha_hasta) { values.push(fecha_hasta); where.push(`DATE(creado_en)<=$${values.length}`); }
    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(descripcion ILIKE $${n} OR numero_comprobante ILIKE $${n})`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT * FROM movimientos_cuentas_corrientes
         WHERE ${whereStr}
         ORDER BY creado_en DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM movimientos_cuentas_corrientes WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ movimientos: dataRes.rows, total, pagina: pageNum, paginas });
  } catch (err) {
    console.error('GET movimientos CC error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener movimientos', detalle: err.message });
  }
});

// ─── POST MOVIMIENTO ──────────────────────────────────────────
router.post('/:cliente_id/:id/movimiento', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const {
      tipo               = 'venta',
      debe               = 0,
      haber              = 0,
      descripcion        = '',
      numero_comprobante = '',
      fecha_vencimiento,
      venta_id,
      estado             = 'pendiente',
      medio_pago         = '',
      referencia         = '',
      observaciones      = '',
    } = req.body;

    const ccRes = await pool.query(
      `SELECT saldo FROM cuentas_corrientes_clientes WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    if (!ccRes.rows.length) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    const saldoAnterior = parseFloat(ccRes.rows[0].saldo) || 0;
    const debeNum       = parseFloat(debe)  || 0;
    const haberNum      = parseFloat(haber) || 0;
    const saldoActual   = saldoAnterior + debeNum - haberNum;

    await pool.query(
      `INSERT INTO movimientos_cuentas_corrientes
         (cuenta_corriente_id, cliente_id, tipo, debe, haber, saldo_acumulado,
          descripcion, numero_comprobante, fecha_vencimiento, venta_id,
          estado, medio_pago, referencia, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, cliente_id, tipo, debeNum, haberNum, saldoActual,
       descripcion, numero_comprobante, fecha_vencimiento || null, venta_id || null,
       estado, medio_pago, referencia, observaciones]
    );

    // Recalcular saldo_vencido
    const vencidoRes = await pool.query(
      `SELECT COALESCE(SUM(debe - haber), 0) AS vencido
       FROM movimientos_cuentas_corrientes
       WHERE cuenta_corriente_id=$1 AND estado='pendiente'
         AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE`,
      [id]
    );
    const saldoVencido = parseFloat(vencidoRes.rows[0].vencido) || 0;

    await pool.query(
      `UPDATE cuentas_corrientes_clientes
       SET saldo=$1, saldo_vencido=$2, modificado_en=now()
       WHERE id=$3`,
      [saldoActual, Math.max(0, saldoVencido), id]
    );

    res.json({ ok: true, saldo_actual: saldoActual });
  } catch (err) {
    console.error('POST movimiento CC error:', err.message);
    res.status(500).json({ mensaje: 'Error al registrar movimiento', detalle: err.message });
  }
});

// ─── PUT BLOQUEAR/DESBLOQUEAR ─────────────────────────────────
router.put('/:cliente_id/:id/bloquear', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const { bloqueado = true, motivo_bloqueo = '' } = req.body;
    await pool.query(
      `UPDATE cuentas_corrientes_clientes
       SET bloqueado=$3, motivo_bloqueo=$4, modificado_en=now()
       WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id, bloqueado, motivo_bloqueo]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error al bloquear cliente', detalle: err.message });
  }
});

module.exports = router;
