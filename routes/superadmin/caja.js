const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

// ─── TABLAS ───────────────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cajas (
        id                  BIGSERIAL PRIMARY KEY,
        cliente_id          BIGINT NOT NULL,
        sucursal_id         BIGINT,
        estado              TEXT DEFAULT 'abierta',
        turno               TEXT DEFAULT 'Único',
        abierta_por         TEXT DEFAULT '',
        fecha_apertura      TIMESTAMPTZ DEFAULT now(),
        fecha_cierre        TIMESTAMPTZ,
        saldo_inicial       NUMERIC DEFAULT 0,
        total_ingresos      NUMERIC DEFAULT 0,
        total_egresos       NUMERIC DEFAULT 0,
        saldo_actual        NUMERIC DEFAULT 0,
        saldo_final_sistema NUMERIC DEFAULT 0,
        saldo_final_real    NUMERIC DEFAULT 0,
        diferencia          NUMERIC DEFAULT 0,
        motivo_diferencia   TEXT DEFAULT '',
        observaciones       TEXT DEFAULT '',
        creado_en           TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const cajaCols = [
      ['sucursal_id',         'BIGINT'],
      ['saldo_final_sistema', 'NUMERIC DEFAULT 0'],
      ['saldo_final_real',    'NUMERIC DEFAULT 0'],
      ['diferencia',          'NUMERIC DEFAULT 0'],
      ['motivo_diferencia',   "TEXT DEFAULT ''"],
    ];
    for (const [col, tipo] of cajaCols) {
      await pool.query(`ALTER TABLE cajas ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS caja_movimientos (
        id                 BIGSERIAL PRIMARY KEY,
        caja_id            BIGINT NOT NULL,
        cliente_id         BIGINT NOT NULL,
        tipo               TEXT NOT NULL DEFAULT 'ingreso_extra',
        tipo_operacion     TEXT DEFAULT 'ingreso',
        monto              NUMERIC NOT NULL DEFAULT 0,
        medio_pago         TEXT DEFAULT 'efectivo',
        descripcion        TEXT DEFAULT '',
        numero_comprobante TEXT DEFAULT '',
        observaciones      TEXT DEFAULT '',
        venta_id           BIGINT,
        compra_id          BIGINT,
        creado_en          TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    const movCols = [
      ['tipo_operacion',     "TEXT DEFAULT 'ingreso'"],
      ['medio_pago',         "TEXT DEFAULT 'efectivo'"],
      ['numero_comprobante', "TEXT DEFAULT ''"],
      ['venta_id',           'BIGINT'],
      ['compra_id',          'BIGINT'],
    ];
    for (const [col, tipo] of movCols) {
      await pool.query(`ALTER TABLE caja_movimientos ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
  } catch (err) {
    console.error('caja: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

function n(v) { return parseFloat(v) || 0; }

// ─── GET /:cliente_id/estado ──────────────────────────────────
router.get('/:cliente_id/estado', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const cajaRes = await pool.query(
      `SELECT * FROM cajas WHERE cliente_id=$1 AND estado='abierta' ORDER BY fecha_apertura DESC LIMIT 1`,
      [cliente_id]
    );
    if (cajaRes.rows.length === 0) return res.json({ abierta: false });

    const caja = cajaRes.rows[0];
    res.json({
      abierta:         true,
      caja_id:         caja.id,
      fecha_apertura:  caja.fecha_apertura,
      saldo_inicial:   n(caja.saldo_inicial),
      total_ingresos:  n(caja.total_ingresos),
      total_egresos:   n(caja.total_egresos),
      saldo_actual:    n(caja.saldo_actual),
      turno:           caja.turno,
      abierta_por:     caja.abierta_por,
      sucursal_id:     caja.sucursal_id,
    });
  } catch (err) {
    console.error('caja estado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/desglose/:caja_id ──────────────────────
router.get('/:cliente_id/desglose/:caja_id', async (req, res) => {
  try {
    const { cliente_id, caja_id } = req.params;
    const rows = await pool.query(
      `SELECT medio_pago, tipo_operacion, COALESCE(SUM(monto),0) AS total
       FROM caja_movimientos
       WHERE caja_id=$1 AND cliente_id=$2
         AND tipo NOT IN ('apertura','cierre')
       GROUP BY medio_pago, tipo_operacion`,
      [caja_id, cliente_id]
    );

    const mapa = { efectivo: 0, transferencia: 0, cheques: 0, tarjeta: 0, otros: 0 };
    for (const r of rows.rows) {
      const mp = r.medio_pago || 'efectivo';
      const monto = n(r.total);
      const signo = r.tipo_operacion === 'egreso' ? -1 : 1;
      if (mp === 'efectivo')      mapa.efectivo      += signo * monto;
      else if (mp === 'transferencia') mapa.transferencia += signo * monto;
      else if (mp === 'cheque' || mp === 'cheque_propio' || mp === 'cheque_tercero' || mp === 'echeq')
                                   mapa.cheques       += signo * monto;
      else if (mp === 'tarjeta' || mp === 'tarjeta_debito' || mp === 'tarjeta_credito')
                                   mapa.tarjeta       += signo * monto;
      else                         mapa.otros         += signo * monto;
    }
    res.json(mapa);
  } catch (err) {
    console.error('caja desglose:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:cliente_id/abrir ──────────────────────────────────
router.post('/:cliente_id/abrir', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { sucursal_id, saldo_inicial = 0, turno = 'Único', observaciones } = req.body;

    // Verificar no haya caja abierta
    const existente = await pool.query(
      `SELECT id FROM cajas WHERE cliente_id=$1 AND estado='abierta' LIMIT 1`,
      [cliente_id]
    );
    if (existente.rows.length > 0) {
      return res.status(400).json({ error: 'Ya hay una caja abierta', caja_id: existente.rows[0].id });
    }

    const saldoIni = n(saldo_inicial);

    const cajaRes = await pool.query(
      `INSERT INTO cajas (cliente_id, sucursal_id, estado, turno, saldo_inicial, saldo_actual, observaciones)
       VALUES ($1,$2,'abierta',$3,$4,$5,$6) RETURNING id`,
      [cliente_id, sucursal_id || null, turno, saldoIni, saldoIni, observaciones || '']
    );
    const caja_id = cajaRes.rows[0].id;

    await pool.query(
      `INSERT INTO caja_movimientos (caja_id, cliente_id, tipo, tipo_operacion, monto, descripcion, medio_pago)
       VALUES ($1,$2,'apertura','ingreso',$3,'Saldo inicial apertura de caja','efectivo')`,
      [caja_id, cliente_id, saldoIni]
    );

    res.json({ ok: true, caja_id });
  } catch (err) {
    console.error('caja abrir:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:cliente_id/movimiento ─────────────────────────────
router.post('/:cliente_id/movimiento', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      caja_id, tipo = 'ingreso_extra', monto, tipo_operacion = 'ingreso',
      medio_pago = 'efectivo', descripcion, observaciones,
      numero_comprobante, venta_id, compra_id,
    } = req.body;

    if (!caja_id || !monto) return res.status(400).json({ error: 'Faltan datos requeridos' });

    await pool.query(
      `INSERT INTO caja_movimientos
         (caja_id, cliente_id, tipo, tipo_operacion, monto, medio_pago,
          descripcion, observaciones, numero_comprobante, venta_id, compra_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [caja_id, cliente_id, tipo, tipo_operacion, n(monto), medio_pago,
       descripcion || '', observaciones || '', numero_comprobante || '',
       venta_id || null, compra_id || null]
    );

    // Actualizar totales en caja
    let updateSQL;
    if (tipo_operacion === 'ingreso') {
      updateSQL = `UPDATE cajas
        SET total_ingresos = total_ingresos + $1,
            saldo_actual   = saldo_inicial + total_ingresos + $1 - total_egresos,
            creado_en      = creado_en
        WHERE id=$2 RETURNING saldo_actual`;
    } else {
      updateSQL = `UPDATE cajas
        SET total_egresos = total_egresos + $1,
            saldo_actual  = saldo_inicial + total_ingresos - (total_egresos + $1),
            creado_en     = creado_en
        WHERE id=$2 RETURNING saldo_actual`;
    }
    const upd = await pool.query(updateSQL, [n(monto), caja_id]);
    const saldo_actual = n(upd.rows[0]?.saldo_actual ?? 0);

    res.json({ ok: true, saldo_actual });
  } catch (err) {
    console.error('caja movimiento:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/:caja_id/movimientos ────────────────────
router.get('/:cliente_id/:caja_id/movimientos', async (req, res) => {
  try {
    const { cliente_id, caja_id } = req.params;
    const { tipo, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds = ['m.caja_id=$1', 'm.cliente_id=$2'];
    const params = [caja_id, cliente_id];
    if (tipo) { params.push(tipo); conds.push(`m.tipo=$${params.length}`); }

    const where = conds.join(' AND ');

    const [rows, tot] = await Promise.all([
      pool.query(
        `SELECT m.id, m.creado_en AS hora, m.tipo, m.tipo_operacion,
                m.descripcion, m.monto, m.medio_pago, m.numero_comprobante
         FROM caja_movimientos m
         WHERE ${where}
         ORDER BY m.creado_en DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM caja_movimientos m WHERE ${where}`, params),
    ]);

    res.json({ movimientos: rows.rows, total: parseInt(tot.rows[0].count, 10), pagina: parseInt(page) });
  } catch (err) {
    console.error('caja movimientos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:cliente_id/cerrar ─────────────────────────────────
router.post('/:cliente_id/cerrar', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { caja_id, saldo_final_real, motivo_diferencia, observaciones } = req.body;

    if (!caja_id) return res.status(400).json({ error: 'Falta caja_id' });

    const cajaRes = await pool.query(
      `SELECT * FROM cajas WHERE id=$1 AND cliente_id=$2 AND estado='abierta'`,
      [caja_id, cliente_id]
    );
    if (cajaRes.rows.length === 0) {
      return res.status(400).json({ error: 'Caja no encontrada o ya cerrada' });
    }
    const caja = cajaRes.rows[0];
    const saldoSistema = n(caja.saldo_actual);
    const saldoReal    = n(saldo_final_real ?? saldoSistema);
    const diferencia   = saldoReal - saldoSistema;

    await pool.query(
      `UPDATE cajas SET
         estado='cerrada',
         fecha_cierre=now(),
         saldo_final_sistema=$1,
         saldo_final_real=$2,
         diferencia=$3,
         motivo_diferencia=$4
       WHERE id=$5`,
      [saldoSistema, saldoReal, diferencia, motivo_diferencia || '', caja_id]
    );

    await pool.query(
      `INSERT INTO caja_movimientos
         (caja_id, cliente_id, tipo, tipo_operacion, monto, descripcion, medio_pago)
       VALUES ($1,$2,'cierre','egreso',0,$3,'efectivo')`,
      [caja_id, cliente_id,
       `Cierre de caja. Sistema: $${saldoSistema.toFixed(2)} Real: $${saldoReal.toFixed(2)} Dif: $${diferencia.toFixed(2)}`]
    );

    // Analytics resumen diario (best-effort)
    await pool.query(
      `INSERT INTO analytics_resumen_diario
         (cliente_id, fecha, tipo, valor, metadata)
       VALUES ($1, CURRENT_DATE, 'cierre_caja', $2, $3)`,
      [cliente_id, saldoSistema, JSON.stringify({
        caja_id, turno: caja.turno,
        total_ingresos: n(caja.total_ingresos),
        total_egresos:  n(caja.total_egresos),
        diferencia,
      })]
    ).catch(() => {});

    res.json({
      ok: true,
      diferencia,
      saldo_sistema: saldoSistema,
      saldo_real:    saldoReal,
      turno:         caja.turno,
      fecha_apertura: caja.fecha_apertura,
      saldo_inicial:  n(caja.saldo_inicial),
      total_ingresos: n(caja.total_ingresos),
      total_egresos:  n(caja.total_egresos),
    });
  } catch (err) {
    console.error('caja cerrar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/historial ───────────────────────────────
router.get('/:cliente_id/historial', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { fecha_desde, fecha_hasta, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds = ["cliente_id=$1", "estado='cerrada'"];
    const params = [cliente_id];

    if (fecha_desde) { params.push(fecha_desde); conds.push(`fecha_apertura::date >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`fecha_apertura::date <= $${params.length}`); }

    const where = conds.join(' AND ');

    const [rows, tot] = await Promise.all([
      pool.query(
        `SELECT id, turno, fecha_apertura, fecha_cierre,
                saldo_inicial, total_ingresos, total_egresos,
                saldo_final_sistema, saldo_final_real, diferencia, abierta_por
         FROM cajas WHERE ${where}
         ORDER BY fecha_cierre DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM cajas WHERE ${where}`, params),
    ]);

    res.json({ cajas: rows.rows, total: parseInt(tot.rows[0].count, 10), pagina: parseInt(page) });
  } catch (err) {
    console.error('caja historial:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
