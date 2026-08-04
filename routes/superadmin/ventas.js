const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
    // sucursal_id no tiene tabla de referencia aún — hacerlo nullable
    await pool.query(
      `ALTER TABLE ventas ALTER COLUMN sucursal_id DROP NOT NULL`
    ).catch(() => {});

    // Nuevas columnas IVA / descuento / recargo
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_global NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS recargo_global   NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS precio_con_iva   BOOLEAN DEFAULT true`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS forma_pago         TEXT DEFAULT 'efectivo'`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprador_telefono TEXT DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprador_email    TEXT DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprador_direccion TEXT DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS comprador_ciudad   TEXT DEFAULT ''`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_recibido   NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS vuelto           NUMERIC DEFAULT 0`).catch(() => {});

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

router.use(verificarCualquierToken);

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
                comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad,
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
    comprador_telefono = '', comprador_email = '',
    comprador_direccion = '', comprador_ciudad = '',
    items = [],
    va_a_cuenta_corriente = false,
    observaciones = '',
    descuento_global = 0,
    recargo_global   = 0,
    precio_con_iva   = true,
    forma_pago       = 'efectivo',
    monto_recibido   = 0,
    vuelto           = 0,
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'La venta debe tener al menos un ítem' });
  }

  const descPct   = parseFloat(descuento_global) || 0;
  const recargoPct = parseFloat(recargo_global)  || 0;
  const conIva    = precio_con_iva !== false;

  try {
    // 1. Número correlativo por cliente
    const numRes = await pool.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
       FROM ventas WHERE cliente_id = $1`,
      [cliente_id]
    );
    const numero         = parseInt(numRes.rows[0].siguiente, 10);
    const numero_completo = `V-${String(numero).padStart(5, '0')}`;

    // 2. Calcular totales con nueva fórmula (IVA-aware)
    let sumaSubtotales = 0;
    const itemsNeto = [];
    const itemsCalculados = items.map((it, idx) => {
      const cantidad = parseFloat(it.cantidad)              || 0;
      const precio   = parseFloat(it.precio_unitario)       || 0;
      const dto_pct  = parseFloat(it.descuento_porcentaje)  || 0;
      const iva_pct  = parseFloat(it.alicuota_iva)          || 0;

      const precioNeto   = conIva ? precio / (1 + iva_pct / 100) : precio;
      const subtotalItem = precioNeto * cantidad * (1 - dto_pct / 100);
      sumaSubtotales += subtotalItem;
      itemsNeto.push({ iva_pct, subtotalItem, dto_pct, cantidad, precioNeto });

      return { ...it, cantidad, precio, dto_pct, iva_pct, orden: idx + 1 };
    });

    const base          = sumaSubtotales * (1 - descPct / 100);
    const baseConRecargo = base * (1 + recargoPct / 100);
    const factor        = sumaSubtotales > 0 ? baseConRecargo / sumaSubtotales : 1;

    let iva_total = 0;
    const ivaByAlic = {};
    for (const { iva_pct, subtotalItem } of itemsNeto) {
      const ivaMult = conIva ? iva_pct / (100 + iva_pct) : iva_pct / 100;
      const ivaItem = subtotalItem * factor * ivaMult;
      iva_total += ivaItem;
      ivaByAlic[iva_pct] = (ivaByAlic[iva_pct] || 0) + ivaItem;
    }
    const total_venta = conIva ? baseConRecargo : baseConRecargo + iva_total;

    // 3. INSERT venta
    const ventaRes = await pool.query(
      `INSERT INTO ventas
         (cliente_id, numero, numero_completo, prefijo, tipo_comprobante,
          comprador_nombre, comprador_cuit,
          comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad,
          subtotal, iva_monto, total, saldo,
          estado, cobrada, anulada,
          va_a_cuenta_corriente, observaciones,
          descuento_global, recargo_global, precio_con_iva,
          forma_pago, monto_recibido, vuelto,
          fecha, creado_en, modificado_en)
       VALUES ($1,$2,$3,'V','VENTA',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,'pendiente',false,false,$13,$14,$15,$16,$17,$18,$19,$20,now(),now(),now())
       RETURNING id`,
      [
        cliente_id, numero, numero_completo,
        comprador_nombre, comprador_cuit,
        comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad,
        sumaSubtotales.toFixed(4), iva_total.toFixed(4), total_venta.toFixed(4),
        va_a_cuenta_corriente, observaciones,
        descPct, recargoPct, conIva,
        forma_pago,
        parseFloat(monto_recibido) || 0,
        parseFloat(vuelto) || 0,
      ]
    );
    const venta_id = ventaRes.rows[0].id;

    // 4. INSERT items + descontar stock
    for (let i = 0; i < itemsCalculados.length; i++) {
      const it   = itemsCalculados[i];
      const neto = itemsNeto[i];
      const dto_monto  = neto.precioNeto * neto.cantidad * (neto.dto_pct / 100);
      const neto_item  = neto.subtotalItem * factor;
      const iva_item   = neto.subtotalItem * factor * (neto.iva_pct / 100);
      const total_item = neto_item + iva_item;

      await pool.query(
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
          it.dto_pct, dto_monto.toFixed(4),
          it.iva_pct, iva_item.toFixed(4),
          neto_item.toFixed(4), total_item.toFixed(4),
          it.orden,
        ]
      );

      // Descontar stock si es producto real
      if (!it.es_libre && it.producto_id) {
        await pool.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [it.cantidad, it.producto_id, cliente_id]
        );
      }
    }

    // 5. Movimiento cuenta corriente (tabla nueva)
    if (va_a_cuenta_corriente) {

      // 1. Buscar registro en tabla nueva
      let ccRes = await pool.query(
        `SELECT id, saldo, plazo_pago_dias
         FROM cuentas_corrientes_clientes
         WHERE cliente_id = $1
         AND (
           (comprador_cuit != '' AND comprador_cuit = $2)
           OR
           (comprador_nombre = $3)
         )
         AND activo = true
         LIMIT 1`,
        [cliente_id, comprador_cuit || '', comprador_nombre]
      );

      let cc_id;
      let saldo_anterior;

      // 2. Si no existe, crear registro nuevo
      if (ccRes.rows.length === 0) {
        const nuevaCC = await pool.query(
          `INSERT INTO cuentas_corrientes_clientes
             (cliente_id, comprador_nombre, comprador_cuit,
              saldo, activo)
           VALUES ($1, $2, $3, 0, true)
           RETURNING id, saldo, plazo_pago_dias`,
          [cliente_id, comprador_nombre, comprador_cuit || '']
        );
        cc_id = nuevaCC.rows[0].id;
        saldo_anterior = 0;
      } else {
        cc_id = ccRes.rows[0].id;
        saldo_anterior = parseFloat(ccRes.rows[0].saldo) || 0;
      }

      const saldo_nuevo = saldo_anterior + total_venta;

      // 3. Insertar movimiento en tabla nueva
      await pool.query(
        `INSERT INTO movimientos_cuentas_corrientes
           (cuenta_corriente_id, cliente_id, tipo,
            debe, haber, saldo_acumulado,
            descripcion, numero_comprobante,
            venta_id, estado)
         VALUES ($1,$2,'venta',$3,0,$4,$5,$6,$7,'pendiente')`,
        [
          cc_id,
          cliente_id,
          total_venta.toFixed(4),
          saldo_nuevo.toFixed(4),
          `Venta ${numero_completo}`,
          numero_completo,
          venta_id
        ]
      );

      // 4. Actualizar saldo en cabecera
      await pool.query(
        `UPDATE cuentas_corrientes_clientes
         SET saldo = $1,
             ultima_compra = now()
         WHERE id = $2`,
        [saldo_nuevo.toFixed(4), cc_id]
      );
    }

    // 6. Movimiento de caja (si hay caja abierta)
    try {
      const cajaRes = await pool.query(
        `SELECT id FROM cajas
         WHERE cliente_id = $1
         AND estado = 'abierta'
         LIMIT 1`,
        [cliente_id]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        await pool.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion,
              monto, medio_pago, descripcion,
              numero_comprobante, venta_id)
           VALUES ($1,$2,'venta','ingreso',$3,
                   $4,$5,$6,$7)`,
          [
            caja_id,
            cliente_id,
            total_venta,
            forma_pago,
            `Venta ${numero_completo}`,
            numero_completo,
            venta_id
          ]
        );
        await pool.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual = saldo_actual + $1
           WHERE id = $2`,
          [total_venta, caja_id]
        );
      }
    } catch (err) {
      console.error('Error registrando en caja:', err.message);
    }

    res.json({ ok: true, venta_id, numero_completo });

  } catch (err) {
    console.error('POST /ventas error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear venta', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /buscar-ean/:cliente_id/:ean — busca producto por código EAN
// ═══════════════════════════════════════════════════════════════
router.get('/buscar-ean/:cliente_id/:ean', async (req, res) => {
  try {
    const { cliente_id, ean } = req.params;
    const result = await pool.query(
      `SELECT id, codigo, descripcion, precio_costo,
              COALESCE(precio_venta_1, 0)     AS precio_venta_1,
              COALESCE(precio_venta_2, 0)     AS precio_venta_2,
              COALESCE(precio_venta_3, 0)     AS precio_venta_3,
              COALESCE(precio_venta_final, 0) AS precio_venta_final,
              COALESCE(stock_actual, 0)       AS stock_actual,
              COALESCE(alicuota_iva, 21)      AS alicuota_iva,
              ean
       FROM productos_propios
       WHERE ean = $1 AND cliente_id = $2 AND activo = true
       LIMIT 1`,
      [ean, cliente_id]
    );
    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json({ producto: result.rows[0] });
  } catch (err) {
    console.error('GET /buscar-ean error:', err.message);
    res.status(500).json({ mensaje: 'Error al buscar por EAN', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/dashboard — estadísticas de ventas
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/dashboard', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE fecha = CURRENT_DATE)
           AS ventas_hoy_cantidad,
         COALESCE(SUM(total) FILTER
           (WHERE fecha = CURRENT_DATE), 0)
           AS ventas_hoy_monto,
         COALESCE(SUM(total) FILTER
           (WHERE DATE_TRUNC('month', fecha) =
            DATE_TRUNC('month', CURRENT_DATE)), 0)
           AS ventas_mes_monto,
         COALESCE(
           SUM(total) FILTER (
             WHERE DATE_TRUNC('month', fecha) =
             DATE_TRUNC('month', CURRENT_DATE)
           ) /
           NULLIF(COUNT(*) FILTER (
             WHERE DATE_TRUNC('month', fecha) =
             DATE_TRUNC('month', CURRENT_DATE)
           ), 0)
         , 0) AS ticket_promedio_mes
       FROM ventas
       WHERE cliente_id = $1
       AND anulada = false`,
      [cliente_id]
    );
    const row = result.rows[0];
    res.json({
      ventas_hoy_cantidad:  parseInt(row.ventas_hoy_cantidad,  10) || 0,
      ventas_hoy_monto:     parseFloat(row.ventas_hoy_monto)       || 0,
      ventas_mes_monto:     parseFloat(row.ventas_mes_monto)        || 0,
      ticket_promedio_mes:  parseFloat(row.ticket_promedio_mes)     || 0,
    });
  } catch (err) {
    console.error('GET /ventas/dashboard error:', err.message);
    res.status(500).json({ mensaje: 'Error al cargar dashboard', detalle: err.message });
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
