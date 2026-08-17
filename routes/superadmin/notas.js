const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

async function asegurarTablas() {
  try {
    // ── Notas de Crédito ──────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notas_credito (
        id                         BIGSERIAL PRIMARY KEY,
        cliente_id                 BIGINT NOT NULL,
        numero                     INTEGER DEFAULT 1,
        numero_completo            TEXT DEFAULT '',
        tipo                       TEXT DEFAULT 'emitida',
        estado                     TEXT DEFAULT 'borrador',
        comprador_nombre           TEXT DEFAULT '',
        comprador_cuit             TEXT DEFAULT '',
        proveedor_id               BIGINT,
        venta_id                   BIGINT,
        compra_id                  BIGINT,
        tipo_comprobante_origen    TEXT DEFAULT '',
        numero_comprobante_origen  TEXT DEFAULT '',
        motivo                     TEXT DEFAULT '',
        descripcion_motivo         TEXT DEFAULT '',
        subtotal                   NUMERIC DEFAULT 0,
        total_iva                  NUMERIC DEFAULT 0,
        total                      NUMERIC DEFAULT 0,
        afecta_stock               BOOLEAN DEFAULT false,
        afecta_cuenta_corriente    BOOLEAN DEFAULT false,
        observaciones              TEXT DEFAULT '',
        anulada                    BOOLEAN DEFAULT false,
        motivo_anulacion           TEXT DEFAULT '',
        creado_en                  TIMESTAMPTZ DEFAULT now(),
        actualizado_en             TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notas_credito_items (
        id               BIGSERIAL PRIMARY KEY,
        nota_id          BIGINT NOT NULL,
        producto_id      BIGINT,
        variante_id      BIGINT,
        es_libre         BOOLEAN DEFAULT false,
        descripcion      TEXT DEFAULT '',
        cantidad         NUMERIC DEFAULT 1,
        precio_unitario  NUMERIC DEFAULT 0,
        descuento_pct    NUMERIC DEFAULT 0,
        alicuota_iva     NUMERIC DEFAULT 21,
        subtotal         NUMERIC DEFAULT 0,
        total_item       NUMERIC DEFAULT 0
      )
    `).catch(() => {});

    // ── Notas de Débito ───────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notas_debito (
        id                         BIGSERIAL PRIMARY KEY,
        cliente_id                 BIGINT NOT NULL,
        numero                     INTEGER DEFAULT 1,
        numero_completo            TEXT DEFAULT '',
        tipo                       TEXT DEFAULT 'emitida',
        estado                     TEXT DEFAULT 'borrador',
        comprador_nombre           TEXT DEFAULT '',
        comprador_cuit             TEXT DEFAULT '',
        proveedor_id               BIGINT,
        venta_id                   BIGINT,
        compra_id                  BIGINT,
        tipo_comprobante_origen    TEXT DEFAULT '',
        numero_comprobante_origen  TEXT DEFAULT '',
        motivo                     TEXT DEFAULT '',
        descripcion_motivo         TEXT DEFAULT '',
        subtotal                   NUMERIC DEFAULT 0,
        total_iva                  NUMERIC DEFAULT 0,
        total                      NUMERIC DEFAULT 0,
        afecta_cuenta_corriente    BOOLEAN DEFAULT false,
        observaciones              TEXT DEFAULT '',
        anulada                    BOOLEAN DEFAULT false,
        motivo_anulacion           TEXT DEFAULT '',
        creado_en                  TIMESTAMPTZ DEFAULT now(),
        actualizado_en             TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notas_debito_items (
        id               BIGSERIAL PRIMARY KEY,
        nota_id          BIGINT NOT NULL,
        producto_id      BIGINT,
        variante_id      BIGINT,
        es_libre         BOOLEAN DEFAULT false,
        descripcion      TEXT DEFAULT '',
        cantidad         NUMERIC DEFAULT 1,
        precio_unitario  NUMERIC DEFAULT 0,
        descuento_pct    NUMERIC DEFAULT 0,
        alicuota_iva     NUMERIC DEFAULT 21,
        subtotal         NUMERIC DEFAULT 0,
        total_item       NUMERIC DEFAULT 0
      )
    `).catch(() => {});

    const ncCols = [
      ['numero_completo',           "TEXT DEFAULT ''"],
      ['tipo_comprobante_origen',   "TEXT DEFAULT ''"],
      ['numero_comprobante_origen', "TEXT DEFAULT ''"],
      ['proveedor_id',              'BIGINT'],
      ['anulada',                   'BOOLEAN DEFAULT false'],
      ['motivo_anulacion',          "TEXT DEFAULT ''"],
    ];
    for (const [col, tipo] of ncCols) {
      await pool.query(`ALTER TABLE notas_credito ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
      await pool.query(`ALTER TABLE notas_debito  ADD COLUMN IF NOT EXISTS ${col} ${tipo}`).catch(() => {});
    }
  } catch (err) {
    console.error('notas: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

function n(v) { return parseFloat(v) || 0; }

function calcTotales(items) {
  let subtotal = 0, total_iva = 0;
  for (const it of items) {
    const base = n(it.cantidad) * n(it.precio_unitario) * (1 - n(it.descuento_pct) / 100);
    const iva  = base * (n(it.alicuota_iva) / 100);
    it._subtotal   = base;
    it._total_item = base + iva;
    subtotal  += base;
    total_iva += iva;
  }
  return { subtotal, total_iva, total: subtotal + total_iva };
}

// ─── GET /:cliente_id — lista con filtros ─────────────────────
router.get('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { tipo_nota = 'credito', tipo, estado, fecha_desde, fecha_hasta, buscar, page = 1, limit = 25 } = req.query;

    const tabla = tipo_nota === 'debito' ? 'notas_debito' : 'notas_credito';
    const conds = ['cliente_id=$1', 'anulada=false'];
    const params = [cliente_id];

    if (tipo)        { params.push(tipo);        conds.push(`tipo=$${params.length}`); }
    if (estado)      { params.push(estado);      conds.push(`estado=$${params.length}`); }
    if (fecha_desde) { params.push(fecha_desde); conds.push(`creado_en::date >= $${params.length}`); }
    if (fecha_hasta) { params.push(fecha_hasta); conds.push(`creado_en::date <= $${params.length}`); }
    if (estado === 'anulada') {
      // reemplazar el filtro anulada=false
      conds[1] = 'anulada=true';
    }
    if (buscar) {
      params.push(`%${buscar}%`);
      conds.push(`(numero_completo ILIKE $${params.length} OR comprador_nombre ILIKE $${params.length})`);
    }

    const where = conds.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows, tot] = await Promise.all([
      pool.query(
        `SELECT * FROM ${tabla} WHERE ${where}
         ORDER BY creado_en DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(`SELECT COUNT(*) FROM ${tabla} WHERE ${where}`, params),
    ]);

    const total = parseInt(tot.rows[0].count, 10);
    res.json({ notas: rows.rows, total, pagina: parseInt(page), paginas: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('notas lista:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/resumen ─────────────────────────────────
router.get('/:cliente_id/resumen', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [ncEm, ncRec, ndEm, ndRec] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS monto
         FROM notas_credito
         WHERE cliente_id=$1 AND tipo='emitida' AND anulada=false
           AND date_trunc('month',creado_en) = date_trunc('month',CURRENT_DATE)`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS monto
         FROM notas_credito
         WHERE cliente_id=$1 AND tipo='recibida' AND anulada=false
           AND date_trunc('month',creado_en) = date_trunc('month',CURRENT_DATE)`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS monto
         FROM notas_debito
         WHERE cliente_id=$1 AND tipo='emitida' AND anulada=false
           AND date_trunc('month',creado_en) = date_trunc('month',CURRENT_DATE)`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total),0) AS monto
         FROM notas_debito
         WHERE cliente_id=$1 AND tipo='recibida' AND anulada=false
           AND date_trunc('month',creado_en) = date_trunc('month',CURRENT_DATE)`,
        [cliente_id]
      ),
    ]);

    res.json({
      nc_emitidas:  { cantidad: parseInt(ncEm.rows[0].cantidad),  monto_mes: n(ncEm.rows[0].monto)  },
      nc_recibidas: { cantidad: parseInt(ncRec.rows[0].cantidad), monto_mes: n(ncRec.rows[0].monto) },
      nd_emitidas:  { cantidad: parseInt(ndEm.rows[0].cantidad),  monto_mes: n(ndEm.rows[0].monto)  },
      nd_recibidas: { cantidad: parseInt(ndRec.rows[0].cantidad), monto_mes: n(ndRec.rows[0].monto) },
    });
  } catch (err) {
    console.error('notas resumen:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/facturas-emitidas ── buscar facturas para vincular N/C
router.get('/:cliente_id/facturas-emitidas', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { buscar } = req.query;

    let query = `
      SELECT v.id AS venta_id, v.numero_arca, v.tipo_factura, v.cae, v.total AS monto_total,
             v.comprador_nombre, v.comprador_cuit, v.creado_en,
             ac.punto_venta, ac.numero
      FROM ventas v
      LEFT JOIN arca_comprobantes ac ON ac.venta_id = v.id AND ac.cliente_id = v.cliente_id
      WHERE v.cliente_id = $1 AND v.facturado = true
    `;
    const params = [cliente_id];

    if (buscar && buscar.trim()) {
      params.push('%' + buscar.trim() + '%');
      query += ` AND (v.numero_arca ILIKE $2 OR v.comprador_nombre ILIKE $2 OR v.comprador_cuit ILIKE $2)`;
    }
    query += ` ORDER BY v.creado_en DESC LIMIT 20`;

    const r = await pool.query(query, params);
    res.json({ facturas: r.rows });
  } catch (err) {
    console.error('facturas-emitidas error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/venta-items/:venta_id ── items de una venta para N/C
router.get('/:cliente_id/venta-items/:venta_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, venta_id } = req.params;
    const r = await pool.query(
      `SELECT vi.producto_id, vi.descripcion, vi.cantidad, vi.precio_unitario,
              COALESCE(vi.descuento, 0) AS descuento_pct,
              COALESCE(vi.alicuota_iva, 21) AS alicuota_iva,
              vi.subtotal, vi.iva_monto
       FROM ventas_items vi
       JOIN ventas v ON v.id = vi.venta_id
       WHERE vi.venta_id = $1 AND v.cliente_id = $2
       ORDER BY vi.id`,
      [venta_id, cliente_id]
    );
    res.json({ items: r.rows });
  } catch (err) {
    console.error('venta-items error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /:cliente_id/:tipo_nota/:id — detalle con items ─────
router.get('/:cliente_id/:tipo_nota/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, tipo_nota, id } = req.params;
    const tabla      = tipo_nota === 'debito' ? 'notas_debito'       : 'notas_credito';
    const tablaItems = tipo_nota === 'debito' ? 'notas_debito_items'  : 'notas_credito_items';

    const nota = await pool.query(`SELECT * FROM ${tabla} WHERE id=$1 AND cliente_id=$2`, [id, cliente_id]);
    if (nota.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });

    const items = await pool.query(`SELECT * FROM ${tablaItems} WHERE nota_id=$1 ORDER BY id`, [id]);
    res.json({ ...nota.rows[0], items: items.rows });
  } catch (err) {
    console.error('notas detalle:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:cliente_id/credito ────────────────────────────────
router.post('/:cliente_id/credito', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      tipo = 'emitida', comprador_nombre, comprador_cuit, proveedor_id,
      venta_id, compra_id, tipo_comprobante_origen, numero_comprobante_origen,
      motivo, descripcion_motivo, items = [], afecta_stock = false,
      afecta_cuenta_corriente = false, observaciones, estado = 'emitida',
    } = req.body;

    const numRes = await pool.query(
      `SELECT COALESCE(MAX(numero),0)+1 AS siguiente FROM notas_credito WHERE cliente_id=$1`,
      [cliente_id]
    );
    const numero = numRes.rows[0].siguiente;
    const numero_completo = `NC-${String(numero).padStart(6, '0')}`;

    const totales = calcTotales(items);

    const notaRes = await pool.query(
      `INSERT INTO notas_credito
         (cliente_id, numero, numero_completo, tipo, estado,
          comprador_nombre, comprador_cuit, proveedor_id,
          venta_id, compra_id, tipo_comprobante_origen, numero_comprobante_origen,
          motivo, descripcion_motivo, subtotal, total_iva, total,
          afecta_stock, afecta_cuenta_corriente, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [cliente_id, numero, numero_completo, tipo, estado,
       comprador_nombre || '', comprador_cuit || '', proveedor_id || null,
       venta_id || null, compra_id || null,
       tipo_comprobante_origen || '', numero_comprobante_origen || '',
       motivo || '', descripcion_motivo || '',
       totales.subtotal, totales.total_iva, totales.total,
       afecta_stock, afecta_cuenta_corriente, observaciones || '']
    );
    const nota_id = notaRes.rows[0].id;

    for (const it of items) {
      await pool.query(
        `INSERT INTO notas_credito_items
           (nota_id, producto_id, variante_id, es_libre, descripcion,
            cantidad, precio_unitario, descuento_pct, alicuota_iva, subtotal, total_item)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [nota_id, it.producto_id || null, it.variante_id || null, it.es_libre || false,
         it.descripcion || '', n(it.cantidad), n(it.precio_unitario),
         n(it.descuento_pct), n(it.alicuota_iva) || 21, it._subtotal, it._total_item]
      );
    }

    // CC: haber en cliente (emitida) o proveedor (recibida)
    if (afecta_cuenta_corriente) {
      if (tipo === 'emitida') {
        await pool.query(
          `INSERT INTO cuentas_corrientes_clientes_movimientos
             (cuenta_id, tipo, monto, descripcion, creado_en)
           SELECT cc.id, 'haber', $1, $2, now()
           FROM cuentas_corrientes_clientes cc WHERE cc.cliente_id=$3 LIMIT 1`,
          [totales.total, `NC ${numero_completo} - ${motivo}`, cliente_id]
        ).catch(() => {});
      } else if (tipo === 'recibida' && proveedor_id) {
        await pool.query(
          `UPDATE proveedores SET saldo = saldo - $1 WHERE id=$2`,
          [totales.total, proveedor_id]
        ).catch(() => {});
      }
    }

    // Stock: devolver unidades
    if (afecta_stock) {
      for (const it of items) {
        if (it.producto_id) {
          await pool.query(
            `UPDATE productos SET stock = stock + $1 WHERE id=$2`,
            [n(it.cantidad), it.producto_id]
          ).catch(() => {});
        }
      }
    }

    // Analytics
    await pool.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, valor, metadata, creado_en)
       VALUES ($1,'nc_emitida',$2,$3,now())`,
      [cliente_id, totales.total, JSON.stringify({ nota_id, numero_completo, tipo })]
    ).catch(() => {});

    res.json({ ok: true, nota_id, numero_completo });
  } catch (err) {
    console.error('notas credito crear:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:cliente_id/debito ─────────────────────────────────
router.post('/:cliente_id/debito', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      tipo = 'emitida', comprador_nombre, comprador_cuit, proveedor_id,
      venta_id, compra_id, tipo_comprobante_origen, numero_comprobante_origen,
      motivo, descripcion_motivo, items = [],
      afecta_cuenta_corriente = false, observaciones, estado = 'emitida',
    } = req.body;

    const numRes = await pool.query(
      `SELECT COALESCE(MAX(numero),0)+1 AS siguiente FROM notas_debito WHERE cliente_id=$1`,
      [cliente_id]
    );
    const numero = numRes.rows[0].siguiente;
    const numero_completo = `ND-${String(numero).padStart(6, '0')}`;

    const totales = calcTotales(items);

    const notaRes = await pool.query(
      `INSERT INTO notas_debito
         (cliente_id, numero, numero_completo, tipo, estado,
          comprador_nombre, comprador_cuit, proveedor_id,
          venta_id, compra_id, tipo_comprobante_origen, numero_comprobante_origen,
          motivo, descripcion_motivo, subtotal, total_iva, total,
          afecta_cuenta_corriente, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [cliente_id, numero, numero_completo, tipo, estado,
       comprador_nombre || '', comprador_cuit || '', proveedor_id || null,
       venta_id || null, compra_id || null,
       tipo_comprobante_origen || '', numero_comprobante_origen || '',
       motivo || '', descripcion_motivo || '',
       totales.subtotal, totales.total_iva, totales.total,
       afecta_cuenta_corriente, observaciones || '']
    );
    const nota_id = notaRes.rows[0].id;

    for (const it of items) {
      await pool.query(
        `INSERT INTO notas_debito_items
           (nota_id, producto_id, variante_id, es_libre, descripcion,
            cantidad, precio_unitario, descuento_pct, alicuota_iva, subtotal, total_item)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [nota_id, it.producto_id || null, it.variante_id || null, it.es_libre || false,
         it.descripcion || '', n(it.cantidad), n(it.precio_unitario),
         n(it.descuento_pct), n(it.alicuota_iva) || 21, it._subtotal, it._total_item]
      );
    }

    // CC: debe en cliente (emitida) o proveedor (recibida)
    if (afecta_cuenta_corriente) {
      if (tipo === 'emitida') {
        await pool.query(
          `INSERT INTO cuentas_corrientes_clientes_movimientos
             (cuenta_id, tipo, monto, descripcion, creado_en)
           SELECT cc.id, 'debito', $1, $2, now()
           FROM cuentas_corrientes_clientes cc WHERE cc.cliente_id=$3 LIMIT 1`,
          [totales.total, `ND ${numero_completo} - ${motivo}`, cliente_id]
        ).catch(() => {});
      } else if (tipo === 'recibida' && proveedor_id) {
        await pool.query(
          `UPDATE proveedores SET saldo = saldo + $1 WHERE id=$2`,
          [totales.total, proveedor_id]
        ).catch(() => {});
      }
    }

    await pool.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, valor, metadata, creado_en)
       VALUES ($1,'nd_emitida',$2,$3,now())`,
      [cliente_id, totales.total, JSON.stringify({ nota_id, numero_completo, tipo })]
    ).catch(() => {});

    res.json({ ok: true, nota_id, numero_completo });
  } catch (err) {
    console.error('notas debito crear:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:cliente_id/:tipo_nota/:id/estado ───────────────────
router.put('/:cliente_id/:tipo_nota/:id/estado', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, tipo_nota, id } = req.params;
    const { estado } = req.body;
    const tabla = tipo_nota === 'debito' ? 'notas_debito' : 'notas_credito';
    await pool.query(
      `UPDATE ${tabla} SET estado=$1, actualizado_en=now() WHERE id=$2 AND cliente_id=$3`,
      [estado, id, cliente_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('notas estado:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /:cliente_id/:tipo_nota/:id/anular ───────────────────
router.put('/:cliente_id/:tipo_nota/:id/anular', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, tipo_nota, id } = req.params;
    const { motivo_anulacion } = req.body;
    const tabla      = tipo_nota === 'debito' ? 'notas_debito'      : 'notas_credito';

    const notaRes = await pool.query(
      `SELECT * FROM ${tabla} WHERE id=$1 AND cliente_id=$2`, [id, cliente_id]
    );
    if (notaRes.rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    const nota = notaRes.rows[0];

    await pool.query(
      `UPDATE ${tabla} SET anulada=true, estado='anulada', motivo_anulacion=$1, actualizado_en=now()
       WHERE id=$2`,
      [motivo_anulacion || '', id]
    );

    // Revertir movimiento CC si había
    if (nota.afecta_cuenta_corriente) {
      if (tipo_nota === 'credito' && nota.tipo === 'emitida') {
        await pool.query(
          `INSERT INTO cuentas_corrientes_clientes_movimientos
             (cuenta_id, tipo, monto, descripcion, creado_en)
           SELECT cc.id, 'debito', $1, $2, now()
           FROM cuentas_corrientes_clientes cc WHERE cc.cliente_id=$3 LIMIT 1`,
          [n(nota.total), `Anulación ${nota.numero_completo}`, cliente_id]
        ).catch(() => {});
      } else if (tipo_nota === 'debito' && nota.tipo === 'emitida') {
        await pool.query(
          `INSERT INTO cuentas_corrientes_clientes_movimientos
             (cuenta_id, tipo, monto, descripcion, creado_en)
           SELECT cc.id, 'haber', $1, $2, now()
           FROM cuentas_corrientes_clientes cc WHERE cc.cliente_id=$3 LIMIT 1`,
          [n(nota.total), `Anulación ${nota.numero_completo}`, cliente_id]
        ).catch(() => {});
      }
    }

    // Revertir stock si NC con stock
    if (tipo_nota === 'credito' && nota.afecta_stock) {
      await pool.query(
        `UPDATE productos p SET stock = stock - nci.cantidad
         FROM notas_credito_items nci
         WHERE nci.nota_id=$1 AND nci.producto_id IS NOT NULL AND p.id=nci.producto_id`,
        [id]
      ).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('notas anular:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
