const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compras (
        id               BIGSERIAL PRIMARY KEY,
        cliente_id       BIGINT NOT NULL,
        proveedor_id     BIGINT,
        proveedor_nombre TEXT DEFAULT '',
        numero_factura   TEXT DEFAULT '',
        tipo             TEXT DEFAULT 'simple',
        fecha            DATE DEFAULT CURRENT_DATE,
        subtotal         NUMERIC DEFAULT 0,
        iva_monto        NUMERIC DEFAULT 0,
        total            NUMERIC DEFAULT 0,
        estado           TEXT DEFAULT 'pendiente',
        observaciones    TEXT DEFAULT '',
        creado_en        TIMESTAMPTZ DEFAULT now(),
        modificado_en    TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS compras_items (
        id              BIGSERIAL PRIMARY KEY,
        compra_id       BIGINT NOT NULL,
        cliente_id      BIGINT NOT NULL,
        producto_id     BIGINT,
        es_libre        BOOLEAN DEFAULT false,
        descripcion     TEXT DEFAULT '',
        cantidad        NUMERIC DEFAULT 1,
        precio_unitario NUMERIC DEFAULT 0,
        alicuota_iva    NUMERIC DEFAULT 21,
        iva_monto       NUMERIC DEFAULT 0,
        subtotal        NUMERIC DEFAULT 0,
        total           NUMERIC DEFAULT 0
      )
    `).catch(() => {});

    // Columnas de percepciones en compras
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS descuento_pct NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS descuento_monto NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS perc_iva_pct NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS perc_iva_monto NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS iibb_pct NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS iibb_monto NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS municipal_pct NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS municipal_monto NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE compras ADD COLUMN IF NOT EXISTS percepciones_total NUMERIC DEFAULT 0`).catch(() => {});
    // Columna dto en items
    await pool.query(`ALTER TABLE compras_items ADD COLUMN IF NOT EXISTS dto NUMERIC DEFAULT 0`).catch(() => {});

    // Columna compra_id en movimientos de proveedores (si no existe)
    await pool.query(
      `ALTER TABLE cuentas_corrientes_proveedores_movimientos
       ADD COLUMN IF NOT EXISTS compra_id BIGINT`
    ).catch(() => {});

  } catch (err) {
    console.error('compras: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

function n(v) { return parseFloat(v) || 0; }

// ═══════════════════════════════════════════════════════════════
// POST /:cliente_id — cargar factura proveedor
// ═══════════════════════════════════════════════════════════════
router.post('/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const {
    proveedor_id   = null,
    proveedor_nombre = '',
    numero_factura = '',
    fecha,
    tipo           = 'simple',
    subtotal       = 0,
    iva_monto      = 0,
    total          = 0,
    observaciones  = '',
    items          = [],
    descuento_pct      = 0,
    descuento_monto    = 0,
    perc_iva_pct       = 0,
    perc_iva_monto     = 0,
    iibb_pct           = 0,
    iibb_monto         = 0,
    municipal_pct      = 0,
    municipal_monto    = 0,
    percepciones_total = 0,
  } = req.body;

  if (!n(total)) {
    return res.status(400).json({ mensaje: 'El total de la compra es requerido' });
  }

  try {
    // 1. INSERT compra
    const compraRes = await pool.query(
      `INSERT INTO compras
         (cliente_id, proveedor_id, proveedor_nombre, numero_factura,
          tipo, fecha, subtotal, iva_monto, total, estado, observaciones,
          descuento_pct, descuento_monto,
          perc_iva_pct, perc_iva_monto,
          iibb_pct, iibb_monto,
          municipal_pct, municipal_monto,
          percepciones_total,
          creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente',$10,
               $11,$12,$13,$14,$15,$16,$17,$18,$19,now(),now())
       RETURNING id`,
      [
        cliente_id,
        proveedor_id || null,
        proveedor_nombre,
        numero_factura,
        tipo,
        fecha || new Date().toISOString().slice(0, 10),
        n(subtotal).toFixed(4),
        n(iva_monto).toFixed(4),
        n(total).toFixed(4),
        observaciones,
        n(descuento_pct).toFixed(4),
        n(descuento_monto).toFixed(4),
        n(perc_iva_pct).toFixed(4),
        n(perc_iva_monto).toFixed(4),
        n(iibb_pct).toFixed(4),
        n(iibb_monto).toFixed(4),
        n(municipal_pct).toFixed(4),
        n(municipal_monto).toFixed(4),
        n(percepciones_total).toFixed(4),
      ]
    );
    const compra_id = compraRes.rows[0].id;

    // 2. Si tipo='detallada' — insertar ítems y sumar stock
    if (tipo === 'detallada' && items.length > 0) {
      for (const it of items) {
        const cantidad      = n(it.cantidad);
        const precio        = n(it.precio_unitario);
        const dto           = n(it.dto);
        const alicuota      = n(it.alicuota_iva) || 21;
        const neto          = precio * cantidad * (1 - dto / 100);
        const iva_item      = neto * (alicuota / 100);
        const subtotal_item = neto;
        const total_item    = subtotal_item + iva_item;

        await pool.query(
          `INSERT INTO compras_items
             (compra_id, cliente_id, producto_id, es_libre,
              descripcion, cantidad, precio_unitario, dto,
              alicuota_iva, iva_monto, subtotal, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            compra_id, cliente_id,
            it.producto_id || null,
            !!it.es_libre,
            it.descripcion || '',
            cantidad, precio, dto, alicuota,
            iva_item.toFixed(4),
            subtotal_item.toFixed(4),
            total_item.toFixed(4),
          ]
        );

        // Sumar stock si es producto real
        if (!it.es_libre && it.producto_id) {
          const stPrev = await pool.query(
            `SELECT COALESCE(stock_actual, 0) AS stock FROM productos_propios WHERE id=$1 AND cliente_id=$2`,
            [it.producto_id, cliente_id]
          ).catch(() => ({ rows: [{ stock: 0 }] }));
          const stockAnterior = parseFloat(stPrev.rows[0]?.stock) || 0;
          await pool.query(
            `UPDATE productos_propios
             SET stock_actual = COALESCE(stock_actual, 0) + $1,
                 modificado_en = now()
             WHERE id = $2 AND cliente_id = $3`,
            [cantidad, it.producto_id, cliente_id]
          ).catch(() => {});
          await pool.query(
            `INSERT INTO stock_movimientos
               (cliente_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
                motivo, referencia_tipo, referencia_id, creado_en)
             VALUES ($1,$2,'compra',$3,$4,$5,'Compra','compra',$6,now())`,
            [cliente_id, it.producto_id, cantidad, stockAnterior, stockAnterior + cantidad, compra_id]
          ).catch(() => {});
        }
      }
    }

    // 3. Movimiento CC proveedor (si hay proveedor_id)
    if (proveedor_id) {
      const provRes = await pool.query(
        `SELECT saldo FROM proveedores WHERE id = $1 AND cliente_id = $2`,
        [proveedor_id, cliente_id]
      );
      if (provRes.rows.length > 0) {
        const saldo_anterior = n(provRes.rows[0].saldo);
        const saldo_nuevo    = saldo_anterior + n(total);

        await pool.query(
          `INSERT INTO cuentas_corrientes_proveedores_movimientos
             (proveedor_id, cliente_id, tipo, debe, haber,
              saldo_acumulado, descripcion, numero_comprobante,
              compra_id, estado)
           VALUES ($1,$2,'compra',$3,0,$4,$5,$6,$7,'pendiente')`,
          [
            proveedor_id, cliente_id,
            n(total).toFixed(4),
            saldo_nuevo.toFixed(4),
            `Factura ${numero_factura || compra_id}`,
            numero_factura || '',
            compra_id,
          ]
        );

        await pool.query(
          `UPDATE proveedores
           SET saldo = $1, ultima_compra = now(), modificado_en = now()
           WHERE id = $2`,
          [saldo_nuevo.toFixed(4), proveedor_id]
        );
      }
    }

    // 4. Movimiento caja (egreso)
    try {
      const cajaRes = await pool.query(
        `SELECT id FROM cajas
         WHERE cliente_id = $1 AND estado = 'abierta'
         LIMIT 1`,
        [cliente_id]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        await pool.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion,
              monto, descripcion, numero_comprobante)
           VALUES ($1,$2,'gasto','egreso',$3,$4,$5)`,
          [
            caja_id, cliente_id,
            n(total),
            `Compra ${proveedor_nombre || 'proveedor'}`,
            numero_factura || '',
          ]
        );
        await pool.query(
          `UPDATE cajas
           SET total_egresos = total_egresos + $1,
               saldo_actual  = saldo_actual  - $1
           WHERE id = $2 AND cliente_id = $3`,
          [n(total), caja_id, cliente_id]
        );
      }
    } catch (err) {
      console.error('Error registrando compra en caja:', err.message);
    }

    res.json({ ok: true, compra_id });

  } catch (err) {
    console.error('POST /compras error:', err.message);
    res.status(500).json({ mensaje: 'Error al registrar compra', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — lista paginada con filtros
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar = '',
      estado,
      proveedor_id,
      fecha_desde,
      fecha_hasta,
      page  = '1',
      limit = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['cliente_id = $1'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(numero_factura ILIKE $${n} OR proveedor_nombre ILIKE $${n})`);
    }
    if (estado) {
      values.push(estado);
      where.push(`estado = $${values.length}`);
    }
    if (proveedor_id) {
      values.push(proveedor_id);
      where.push(`proveedor_id = $${values.length}`);
    }
    if (fecha_desde) {
      values.push(fecha_desde);
      where.push(`fecha >= $${values.length}`);
    }
    if (fecha_hasta) {
      values.push(fecha_hasta);
      where.push(`fecha <= $${values.length}`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, proveedor_id, proveedor_nombre, numero_factura,
                tipo, fecha, subtotal, iva_monto, total, estado, observaciones,
                descuento_pct, descuento_monto,
                perc_iva_pct, perc_iva_monto,
                iibb_pct, iibb_monto,
                municipal_pct, municipal_monto,
                percepciones_total,
                creado_en
         FROM compras
         WHERE ${whereStr}
         ORDER BY fecha DESC, creado_en DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM compras WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      compras:  dataRes.rows,
      total, pagina: pageNum, paginas, por_pagina: limitNum,
    });
  } catch (err) {
    console.error('GET /compras error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar compras', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/:id — detalle con ítems
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;

    const [compraRes, itemsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM compras WHERE id = $1 AND cliente_id = $2`,
        [id, cliente_id]
      ),
      pool.query(
        `SELECT ci.*, pp.descripcion AS producto_descripcion, pp.codigo AS producto_codigo
         FROM compras_items ci
         LEFT JOIN productos_propios pp ON pp.id = ci.producto_id AND pp.cliente_id = ci.cliente_id
         WHERE ci.compra_id = $1 AND ci.cliente_id = $2
         ORDER BY ci.id ASC`,
        [id, cliente_id]
      ),
    ]);

    if (!compraRes.rows[0]) {
      return res.status(404).json({ mensaje: 'Compra no encontrada' });
    }

    res.json({ compra: compraRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('GET /compras/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener compra', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/estado — cambiar estado
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/estado', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const { estado } = req.body;

    const ESTADOS = ['pendiente', 'pagada', 'parcial'];
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' });
    }

    const result = await pool.query(
      `UPDATE compras SET estado = $1, modificado_en = now()
       WHERE id = $2 AND cliente_id = $3 RETURNING id`,
      [estado, id, cliente_id]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Compra no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /compras/:id/estado error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar estado', detalle: err.message });
  }
});

module.exports = router;
