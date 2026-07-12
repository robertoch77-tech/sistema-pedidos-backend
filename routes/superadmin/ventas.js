const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    // sucursal_id no tiene tabla de referencia aún — hacerlo nullable
    await pool.query(
      `ALTER TABLE ventas ALTER COLUMN sucursal_id DROP NOT NULL`
    ).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuenta_corriente (
        id               BIGSERIAL PRIMARY KEY,
        cliente_id       BIGINT NOT NULL,
        comprador_cuit   TEXT,
        comprador_nombre TEXT,
        tipo             TEXT NOT NULL,
        referencia_id    BIGINT,
        referencia_tipo  TEXT,
        descripcion      TEXT,
        monto            NUMERIC NOT NULL DEFAULT 0,
        saldo_anterior   NUMERIC DEFAULT 0,
        saldo_posterior  NUMERIC DEFAULT 0,
        fecha            TIMESTAMPTZ DEFAULT now(),
        creado_en        TIMESTAMPTZ DEFAULT now()
      )
    `);
  } catch (err) {
    console.error('Ventas: error al asegurar tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarTokenSuperAdmin);

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — listar ventas con filtros
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar = '', estado,
      fecha_desde, fecha_hasta,
      page = '1', limit = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['cliente_id = $1'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(numero_completo ILIKE $${n} OR comprador_nombre ILIKE $${n} OR comprador_cuit ILIKE $${n})`);
    }
    if (estado) {
      values.push(estado);
      where.push(`estado = $${values.length}`);
    }
    if (fecha_desde) {
      values.push(fecha_desde);
      where.push(`fecha >= $${values.length}`);
    }
    if (fecha_hasta) {
      values.push(fecha_hasta);
      where.push(`fecha <= ($${values.length}::date + interval '1 day')`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, numero, numero_completo, tipo_comprobante,
                comprador_nombre, comprador_cuit,
                subtotal, iva_monto, total, saldo,
                estado, cobrada, anulada,
                va_a_cuenta_corriente, observaciones, fecha, creado_en
         FROM ventas
         WHERE ${whereStr}
         ORDER BY fecha DESC, numero DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM ventas WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ ventas: dataRes.rows, total, pagina: pageNum, paginas, por_pagina: limitNum });
  } catch (err) {
    console.error('GET /ventas error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar ventas', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cliente_id — crear venta
// ═══════════════════════════════════════════════════════════════
router.post('/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    comprador_nombre = '', comprador_cuit = '',
    items = [],
    va_a_cuenta_corriente = false,
    observaciones = '',
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'La venta debe tener al menos un ítem' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Número correlativo por cliente
    const numRes = await client.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
       FROM ventas WHERE cliente_id = $1`,
      [cliente_id]
    );
    const numero         = parseInt(numRes.rows[0].siguiente, 10);
    const numero_completo = `V-${String(numero).padStart(5, '0')}`;

    // 2. Calcular totales por ítem
    let subtotal_venta = 0;
    let iva_total      = 0;
    const itemsCalculados = items.map((it, idx) => {
      const cantidad    = parseFloat(it.cantidad)         || 0;
      const precio      = parseFloat(it.precio_unitario)  || 0;
      const dto_pct     = parseFloat(it.descuento_porcentaje) || 0;
      const iva_pct     = parseFloat(it.alicuota_iva)    || 0;

      const subtotal_item   = cantidad * precio;
      const dto_monto       = subtotal_item * (dto_pct / 100);
      const neto            = subtotal_item - dto_monto;
      const iva_monto       = neto * (iva_pct / 100);
      const total_item      = neto + iva_monto;

      subtotal_venta += neto;
      iva_total      += iva_monto;

      return { ...it, cantidad, precio, dto_pct, dto_monto, neto, iva_pct, iva_monto, total_item, orden: idx + 1 };
    });
    const total_venta = subtotal_venta + iva_total;

    // 3. INSERT venta
    const ventaRes = await client.query(
      `INSERT INTO ventas
         (cliente_id, numero, numero_completo, prefijo, tipo_comprobante,
          comprador_nombre, comprador_cuit,
          subtotal, iva_monto, total, saldo,
          estado, cobrada, anulada,
          va_a_cuenta_corriente, observaciones, fecha, creado_en, modificado_en)
       VALUES ($1,$2,$3,'V','VENTA',$4,$5,$6,$7,$8,$8,'pendiente',false,false,$9,$10,now(),now(),now())
       RETURNING id`,
      [
        cliente_id, numero, numero_completo,
        comprador_nombre, comprador_cuit,
        subtotal_venta.toFixed(4), iva_total.toFixed(4), total_venta.toFixed(4),
        va_a_cuenta_corriente, observaciones,
      ]
    );
    const venta_id = ventaRes.rows[0].id;

    // 4. INSERT items + descontar stock
    for (const it of itemsCalculados) {
      await client.query(
        `INSERT INTO ventas_items
           (venta_id, cliente_id, producto_id, es_libre, descripcion_libre,
            cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
            alicuota_iva, iva_monto, subtotal, total, orden, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
        [
          venta_id, cliente_id,
          it.es_libre ? null : (it.producto_id || null),
          !!it.es_libre,
          it.descripcion_libre || null,
          it.cantidad, it.precio,
          it.dto_pct, it.dto_monto.toFixed(4),
          it.iva_pct, it.iva_monto.toFixed(4),
          it.neto.toFixed(4), it.total_item.toFixed(4),
          it.orden,
        ]
      );

      // Descontar stock si es producto real
      if (!it.es_libre && it.producto_id) {
        await client.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [it.cantidad, it.producto_id, cliente_id]
        );
      }
    }

    // 5. Movimiento cuenta corriente
    if (va_a_cuenta_corriente) {
      const saldoRes = await client.query(
        `SELECT COALESCE(SUM(
           CASE WHEN tipo IN ('venta','nd') THEN monto ELSE -monto END
         ), 0) AS saldo
         FROM cuenta_corriente
         WHERE cliente_id = $1 AND comprador_cuit = $2`,
        [cliente_id, comprador_cuit || '']
      );
      const saldo_anterior  = parseFloat(saldoRes.rows[0].saldo) || 0;
      const saldo_posterior = saldo_anterior + total_venta;

      await client.query(
        `INSERT INTO cuenta_corriente
           (cliente_id, comprador_cuit, comprador_nombre, tipo,
            referencia_id, referencia_tipo, descripcion,
            monto, saldo_anterior, saldo_posterior, fecha)
         VALUES ($1,$2,$3,'venta',$4,'venta',$5,$6,$7,$8,now())`,
        [
          cliente_id, comprador_cuit, comprador_nombre,
          venta_id,
          `Venta ${numero_completo}`,
          total_venta.toFixed(4),
          saldo_anterior.toFixed(4),
          saldo_posterior.toFixed(4),
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, venta_id, numero_completo });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /ventas error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear venta', detalle: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/:id — detalle con items
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;

    const [ventaRes, itemsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM ventas WHERE id = $1 AND cliente_id = $2`,
        [id, cliente_id]
      ),
      pool.query(
        `SELECT vi.*, p.descripcion AS producto_descripcion, p.codigo AS producto_codigo
         FROM ventas_items vi
         LEFT JOIN productos_propios p ON p.id = vi.producto_id
         WHERE vi.venta_id = $1
         ORDER BY vi.orden ASC`,
        [id]
      ),
    ]);

    if (!ventaRes.rows[0]) {
      return res.status(404).json({ mensaje: 'Venta no encontrada' });
    }

    res.json({ venta: ventaRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('GET /ventas/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener venta', detalle: err.message });
  }
});

module.exports = router;
