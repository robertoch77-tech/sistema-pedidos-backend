const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

// ── Asegurar tablas ────────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS presupuestos (
        id                    BIGSERIAL PRIMARY KEY,
        cliente_id            BIGINT NOT NULL,
        numero                INT NOT NULL,
        numero_completo       TEXT NOT NULL,
        comprador_nombre      TEXT DEFAULT '',
        comprador_cuit        TEXT DEFAULT '',
        lista_precio_id       INT DEFAULT 1,
        dias_validez          INT DEFAULT 15,
        fecha_vencimiento     DATE,
        condiciones           TEXT DEFAULT '',
        observaciones         TEXT DEFAULT '',
        subtotal              NUMERIC DEFAULT 0,
        iva_monto             NUMERIC DEFAULT 0,
        total                 NUMERIC DEFAULT 0,
        descuento_global      NUMERIC DEFAULT 0,
        estado                TEXT DEFAULT 'borrador',
        convertido_a_venta    BOOLEAN DEFAULT false,
        venta_id              BIGINT,
        fecha                 TIMESTAMPTZ DEFAULT now(),
        creado_en             TIMESTAMPTZ DEFAULT now(),
        modificado_en         TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS presupuestos_items (
        id                    BIGSERIAL PRIMARY KEY,
        presupuesto_id        BIGINT NOT NULL,
        cliente_id            BIGINT NOT NULL,
        producto_id           BIGINT,
        es_libre              BOOLEAN DEFAULT false,
        descripcion_libre     TEXT,
        descripcion           TEXT NOT NULL DEFAULT '',
        cantidad              NUMERIC NOT NULL DEFAULT 1,
        precio_unitario       NUMERIC NOT NULL DEFAULT 0,
        descuento_porcentaje  NUMERIC DEFAULT 0,
        descuento_monto       NUMERIC DEFAULT 0,
        alicuota_iva          NUMERIC DEFAULT 21,
        iva_monto             NUMERIC DEFAULT 0,
        subtotal              NUMERIC DEFAULT 0,
        total                 NUMERIC DEFAULT 0,
        orden                 INT DEFAULT 0,
        creado_en             TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Nuevas columnas IVA / recargo
    await pool.query(`ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS recargo_global NUMERIC DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS precio_con_iva BOOLEAN DEFAULT true`).catch(() => {});

    // Historial de ediciones
    await pool.query(`
      CREATE TABLE IF NOT EXISTS presupuestos_historial (
        id BIGSERIAL PRIMARY KEY,
        presupuesto_id BIGINT NOT NULL,
        cliente_id BIGINT NOT NULL,
        usuario TEXT DEFAULT 'portal',
        accion TEXT NOT NULL,
        datos_anteriores JSONB,
        datos_nuevos JSONB,
        creado_en TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

    // analytics_eventos puede no existir — ignorar silenciosamente
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_eventos (
        id          BIGSERIAL PRIMARY KEY,
        cliente_id  BIGINT,
        tipo        TEXT,
        referencia_id BIGINT,
        datos       JSONB,
        creado_en   TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

  } catch (err) {
    console.error('presupuestos: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/dashboard — métricas del mes
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/dashboard', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [mesRes, aceptadosRes, vencidosRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS monto
         FROM presupuestos
         WHERE cliente_id = $1
           AND DATE_TRUNC('month', fecha) = DATE_TRUNC('month', NOW())`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad
         FROM presupuestos
         WHERE cliente_id = $1 AND estado = 'aceptado'`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad
         FROM presupuestos
         WHERE cliente_id = $1
           AND estado NOT IN ('convertido','rechazado')
           AND fecha_vencimiento < CURRENT_DATE`,
        [cliente_id]
      ),
    ]);

    res.json({
      presupuestos_mes_cantidad: parseInt(mesRes.rows[0].cantidad, 10),
      presupuestos_mes_monto:    parseFloat(mesRes.rows[0].monto),
      aceptados_cantidad:        parseInt(aceptadosRes.rows[0].cantidad, 10),
      vencidos_cantidad:         parseInt(vencidosRes.rows[0].cantidad, 10),
    });
  } catch (err) {
    console.error('GET presupuestos/dashboard error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener dashboard', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — listar con filtros y paginación
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar = '', estado,
      fecha_desde, fecha_hasta,
      page = '1', limit = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['p.cliente_id = $1'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(p.numero_completo ILIKE $${n} OR p.comprador_nombre ILIKE $${n} OR p.comprador_cuit ILIKE $${n})`);
    }
    if (estado) {
      values.push(estado);
      where.push(`p.estado = $${values.length}`);
    }
    if (fecha_desde) {
      values.push(fecha_desde);
      where.push(`p.fecha >= $${values.length}`);
    }
    if (fecha_hasta) {
      values.push(fecha_hasta);
      where.push(`p.fecha <= ($${values.length}::date + interval '1 day')`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT p.id, p.numero, p.numero_completo,
                p.comprador_nombre, p.comprador_cuit,
                p.subtotal, p.iva_monto, p.total,
                p.estado, p.convertido_a_venta, p.venta_id,
                p.fecha_vencimiento, p.fecha, p.creado_en
         FROM presupuestos p
         WHERE ${whereStr}
         ORDER BY p.fecha DESC, p.numero DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM presupuestos p WHERE ${whereStr}`,
        values
      ),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({
      presupuestos: dataRes.rows,
      total, pagina: pageNum, paginas, por_pagina: limitNum,
    });
  } catch (err) {
    console.error('GET /presupuestos error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar presupuestos', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cliente_id — crear presupuesto
// ═══════════════════════════════════════════════════════════════
router.post('/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    comprador_nombre = '', comprador_cuit = '',
    lista_precio_id = 1,
    dias_validez = 15,
    items = [],
    observaciones = '',
    condiciones = '',
    estado = 'borrador',
    descuento_global = 0,
    recargo_global   = 0,
    precio_con_iva   = true,
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'El presupuesto debe tener al menos un ítem' });
  }

  const descPct    = parseFloat(descuento_global) || 0;
  const recargoPct = parseFloat(recargo_global)   || 0;
  const conIva     = precio_con_iva !== false;

  try {
    // 1. Número correlativo por cliente
    const numRes = await pool.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
       FROM presupuestos WHERE cliente_id = $1`,
      [cliente_id]
    );
    const numero          = parseInt(numRes.rows[0].siguiente, 10);
    const numero_completo = `P-${String(numero).padStart(5, '0')}`;

    // 2. Calcular totales con nueva fórmula (IVA-aware)
    let sumaSubtotales = 0;
    const itemsNeto = [];
    const itemsCalc = items.map((it, idx) => {
      const cantidad = parseFloat(it.cantidad)             || 0;
      const precio   = parseFloat(it.precio_unitario)      || 0;
      const dto_pct  = parseFloat(it.descuento_porcentaje) || 0;
      const iva_pct  = parseFloat(it.alicuota_iva)         || 21;

      const precioNeto   = conIva ? precio / (1 + iva_pct / 100) : precio;
      const subtotalItem = precioNeto * cantidad * (1 - dto_pct / 100);
      sumaSubtotales += subtotalItem;
      itemsNeto.push({ iva_pct, subtotalItem, dto_pct, cantidad, precioNeto });

      return { ...it, cantidad, precio, dto_pct, iva_pct, orden: idx + 1 };
    });

    const base           = sumaSubtotales * (1 - descPct / 100);
    const baseConRecargo = base * (1 + recargoPct / 100);
    const factor         = sumaSubtotales > 0 ? baseConRecargo / sumaSubtotales : 1;

    let iva_total = 0;
    for (const { iva_pct, subtotalItem } of itemsNeto) {
      const ivaMult = conIva ? iva_pct / (100 + iva_pct) : iva_pct / 100;
      iva_total += subtotalItem * factor * ivaMult;
    }
    const total_pres = conIva ? baseConRecargo : baseConRecargo + iva_total;

    // 3. Fecha vencimiento
    const diasInt = parseInt(dias_validez, 10) || 15;
    const fechaVenc = new Date();
    fechaVenc.setDate(fechaVenc.getDate() + diasInt);
    const fechaVencStr = fechaVenc.toISOString().slice(0, 10);

    // 4. INSERT presupuesto
    const presRes = await pool.query(
      `INSERT INTO presupuestos
         (cliente_id, numero, numero_completo,
          comprador_nombre, comprador_cuit,
          dias_validez, fecha_vencimiento,
          condiciones, observaciones,
          subtotal, iva_monto, total,
          descuento_global, recargo_global,
          precio_con_iva, estado,
          fecha, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now(),now())
       RETURNING id`,
      [
        cliente_id, numero, numero_completo,
        comprador_nombre, comprador_cuit,
        diasInt, fechaVencStr,
        condiciones, observaciones,
        sumaSubtotales.toFixed(4), iva_total.toFixed(4), total_pres.toFixed(4),
        descPct.toFixed(4), recargoPct.toFixed(4), conIva, estado,
      ]
    );
    const presupuesto_id = presRes.rows[0].id;

    // 5. INSERT items
    for (const item of items) {
      await pool.query(
        `INSERT INTO presupuestos_items
           (presupuesto_id, cliente_id, producto_id,
            es_libre, descripcion, cantidad,
            precio_unitario, descuento_porcentaje,
            alicuota_iva, subtotal, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          presupuesto_id,
          cliente_id,
          item.producto_id || null,
          item.es_libre || false,
          item.descripcion || item.descripcion_libre || '',
          item.cantidad,
          item.precio_unitario,
          item.descuento_porcentaje || 0,
          item.alicuota_iva || 21,
          (item.cantidad * item.precio_unitario).toFixed(4),
          (item.cantidad * item.precio_unitario).toFixed(4),
        ]
      );
    }

    res.json({ ok: true, presupuesto_id, numero_completo, fecha_vencimiento: fechaVencStr });

  } catch (err) {
    console.error('POST /presupuestos error:', err.message, err.stack);
    res.status(500).json({ mensaje: 'Error al crear presupuesto', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/:id — detalle con items
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/:id', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;

    const [presRes, itemsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM presupuestos WHERE id = $1 AND cliente_id = $2`,
        [id, cliente_id]
      ),
      pool.query(
        `SELECT pi.*, pp.descripcion AS producto_descripcion, pp.codigo AS producto_codigo
         FROM presupuestos_items pi
         LEFT JOIN productos_propios pp ON pp.id = pi.producto_id
         WHERE pi.presupuesto_id = $1
         ORDER BY pi.orden ASC`,
        [id]
      ),
    ]);

    if (!presRes.rows[0]) {
      return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });
    }

    res.json({ presupuesto: presRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('GET /presupuestos/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener presupuesto', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/estado — cambiar estado
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/estado', async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const { estado } = req.body;

    const ESTADOS = ['borrador','enviado','aceptado','rechazado','vencido','convertido'];
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' });
    }

    const result = await pool.query(
      `UPDATE presupuestos SET estado=$1, modificado_en=now()
       WHERE id=$2 AND cliente_id=$3 RETURNING id`,
      [estado, id, cliente_id]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /presupuestos/:id/estado error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar estado', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/convertir — convertir en venta
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/convertir', async (req, res) => {
  const { cliente_id, id } = req.params;

  try {
    // 1. Obtener presupuesto + items
    const [presRes, itemsRes] = await Promise.all([
      pool.query(
        `SELECT * FROM presupuestos WHERE id=$1 AND cliente_id=$2`,
        [id, cliente_id]
      ),
      pool.query(
        `SELECT * FROM presupuestos_items WHERE presupuesto_id=$1 ORDER BY orden ASC`,
        [id]
      ),
    ]);

    const pres = presRes.rows[0];
    if (!pres) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });
    if (pres.convertido_a_venta) {
      return res.status(400).json({ mensaje: 'Este presupuesto ya fue convertido a venta', venta_id: pres.venta_id });
    }

    const items = itemsRes.rows;

    // 2. Número de venta correlativo
    const numRes = await pool.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM ventas WHERE cliente_id=$1`,
      [cliente_id]
    );
    const numero_v          = parseInt(numRes.rows[0].siguiente, 10);
    const numero_completo_v = `V-${String(numero_v).padStart(5, '0')}`;

    // 3. INSERT venta
    const ventaRes = await pool.query(
      `INSERT INTO ventas
         (cliente_id, numero, numero_completo, prefijo, tipo_comprobante,
          comprador_nombre, comprador_cuit,
          subtotal, iva_monto, total, saldo,
          estado, cobrada, anulada,
          va_a_cuenta_corriente, observaciones, fecha, creado_en, modificado_en)
       VALUES ($1,$2,$3,'V','VENTA',$4,$5,$6,$7,$8,$8,'pendiente',false,false,$9,$10,now(),now(),now())
       RETURNING id`,
      [
        cliente_id, numero_v, numero_completo_v,
        pres.comprador_nombre, pres.comprador_cuit,
        pres.subtotal, pres.iva_monto, pres.total,
        pres.va_a_cuenta_corriente || false,
        pres.observaciones || '',
      ]
    );
    const venta_id = ventaRes.rows[0].id;

    // 4. INSERT ventas_items + descontar stock
    for (const it of items) {
      await pool.query(
        `INSERT INTO ventas_items
           (venta_id, cliente_id, producto_id, es_libre, descripcion_libre,
            cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
            alicuota_iva, iva_monto, subtotal, total, orden, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
        [
          venta_id, cliente_id,
          it.producto_id || null,
          !!it.es_libre,
          it.descripcion_libre || null,
          it.cantidad, it.precio_unitario,
          it.descuento_porcentaje, it.descuento_monto,
          it.alicuota_iva, it.iva_monto,
          it.subtotal, it.total,
          it.orden,
        ]
      );

      if (!it.es_libre && it.producto_id) {
        await pool.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en=now()
           WHERE id=$2 AND cliente_id=$3`,
          [it.cantidad, it.producto_id, cliente_id]
        );
      }
    }

    // 5. Movimiento cuenta corriente (si corresponde)
    if (pres.va_a_cuenta_corriente) {
      let ccRes = await pool.query(
        `SELECT id, saldo
         FROM cuentas_corrientes_clientes
         WHERE cliente_id = $1
         AND (
           (comprador_cuit != '' AND comprador_cuit = $2)
           OR (comprador_nombre = $3)
         )
         AND activo = true
         LIMIT 1`,
        [cliente_id, pres.comprador_cuit || '', pres.comprador_nombre]
      );

      let cc_id, saldo_anterior;
      if (ccRes.rows.length === 0) {
        const nuevaCC = await pool.query(
          `INSERT INTO cuentas_corrientes_clientes
             (cliente_id, comprador_nombre, comprador_cuit, saldo, activo)
           VALUES ($1,$2,$3,0,true)
           RETURNING id, saldo`,
          [cliente_id, pres.comprador_nombre, pres.comprador_cuit || '']
        );
        cc_id = nuevaCC.rows[0].id;
        saldo_anterior = 0;
      } else {
        cc_id = ccRes.rows[0].id;
        saldo_anterior = parseFloat(ccRes.rows[0].saldo) || 0;
      }

      const saldo_nuevo = saldo_anterior + parseFloat(pres.total);

      await pool.query(
        `INSERT INTO movimientos_cuentas_corrientes
           (cuenta_corriente_id, cliente_id, tipo,
            debe, haber, saldo_acumulado,
            descripcion, numero_comprobante,
            venta_id, estado)
         VALUES ($1,$2,'venta',$3,0,$4,$5,$6,$7,'pendiente')`,
        [
          cc_id, cliente_id,
          parseFloat(pres.total).toFixed(4),
          saldo_nuevo.toFixed(4),
          `Presupuesto convertido ${numero_completo_v}`,
          numero_completo_v,
          venta_id,
        ]
      );

      await pool.query(
        `UPDATE cuentas_corrientes_clientes
         SET saldo = $1, ultima_compra = now()
         WHERE id = $2`,
        [saldo_nuevo.toFixed(4), cc_id]
      );
    }

    // 6. Marcar presupuesto como convertido
    await pool.query(
      `UPDATE presupuestos
       SET estado='convertido', convertido_a_venta=true, venta_id=$1, modificado_en=now()
       WHERE id=$2 AND cliente_id=$3`,
      [venta_id, id, cliente_id]
    );

    // 7. Movimiento de caja (si hay caja abierta)
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
             (caja_id, cliente_id, tipo,
              tipo_operacion, monto, medio_pago,
              descripcion, numero_comprobante,
              venta_id)
           VALUES ($1,$2,'venta','ingreso',
                   $3,'efectivo',$4,$5,$6)`,
          [
            caja_id,
            cliente_id,
            pres.total,
            `Presupuesto convertido ${numero_completo_v}`,
            numero_completo_v,
            venta_id,
          ]
        );
        await pool.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual = saldo_actual + $1
           WHERE id = $2`,
          [pres.total, caja_id]
        );
      }
    } catch (err) {
      console.error('Error caja al convertir presupuesto:', err.message);
    }

    res.json({ ok: true, venta_id, numero_completo: numero_completo_v });

  } catch (err) {
    console.error('PUT /presupuestos/:id/convertir error:', err.message);
    res.status(500).json({ mensaje: 'Error al convertir presupuesto', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id — actualizar presupuesto
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id', async (req, res) => {
  const { cliente_id, id } = req.params;
  const {
    comprador_nombre = '', comprador_cuit = '',
    lista_precio_id = 1, dias_validez = 15,
    items = [], observaciones = '', condiciones = '',
    estado = 'borrador', descuento_global = 0,
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'El presupuesto debe tener al menos un ítem' });
  }

  try {
    // Verificar que existe + validar estado
    const check = await pool.query(
      `SELECT id, estado, convertido_a_venta FROM presupuestos WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    if (!check.rows[0]) return res.status(404).json({ mensaje: 'Presupuesto no encontrado' });
    if (check.rows[0].convertido_a_venta) {
      return res.status(400).json({ mensaje: 'No se puede editar un presupuesto convertido a venta' });
    }
    if (check.rows[0].estado === 'enviado') {
      return res.status(400).json({ mensaje: 'No se puede editar un presupuesto enviado. Cambiá el estado a borrador primero.' });
    }

    // Recalcular totales
    let subtotal_total = 0, iva_total = 0;
    const itemsCalc = items.map((it, idx) => {
      const cantidad  = parseFloat(it.cantidad) || 0;
      const precio    = parseFloat(it.precio_unitario) || 0;
      const dto_pct   = parseFloat(it.descuento_porcentaje) || 0;
      const iva_pct   = parseFloat(it.alicuota_iva) || 21;
      const desc_glob = parseFloat(descuento_global) || 0;
      const bruto     = cantidad * precio;
      const dto_monto = bruto * (dto_pct / 100);
      const neto      = (bruto - dto_monto) * (1 - desc_glob / 100);
      const iva_monto = neto * (iva_pct / 100);
      subtotal_total += neto; iva_total += iva_monto;
      return { ...it, cantidad, precio, dto_pct, dto_monto, neto, iva_pct, iva_monto, total_item: neto + iva_monto, orden: idx + 1 };
    });
    const total_pres  = subtotal_total + iva_total;
    const diasInt     = parseInt(dias_validez, 10) || 15;
    const fechaVenc   = new Date(); fechaVenc.setDate(fechaVenc.getDate() + diasInt);
    const fechaVencStr = fechaVenc.toISOString().slice(0, 10);

    // Guardar snapshot del estado anterior para historial
    const snapAnterior = await pool.query(
      `SELECT comprador_nombre, comprador_cuit, subtotal, iva_monto, total,
              descuento_global, recargo_global, modo_iva, condiciones, observaciones, estado
       FROM presupuestos WHERE id=$1`,
      [id]
    );
    const itemsAnteriores = await pool.query(
      'SELECT descripcion, cantidad, precio_unitario, descuento_porcentaje FROM presupuestos_items WHERE presupuesto_id=$1 ORDER BY orden',
      [id]
    );
    await pool.query(
      `INSERT INTO presupuestos_historial (presupuesto_id, cliente_id, accion, datos_anteriores, datos_nuevos)
       VALUES ($1, $2, 'edicion', $3, $4)`,
      [
        id, cliente_id,
        JSON.stringify({ presupuesto: snapAnterior.rows[0], items: itemsAnteriores.rows }),
        JSON.stringify({ comprador_nombre, comprador_cuit, items: items.length, descuento_global, recargo_global, modo_iva })
      ]
    ).catch(e => console.error('Error guardando historial:', e.message));

    await pool.query(
      `UPDATE presupuestos SET
         comprador_nombre=$1, comprador_cuit=$2, lista_precio_id=$3,
         dias_validez=$4, fecha_vencimiento=$5,
         condiciones=$6, observaciones=$7,
         subtotal=$8, iva_monto=$9, total=$10, descuento_global=$11,
         estado=$12, modificado_en=now()
       WHERE id=$13 AND cliente_id=$14`,
      [
        comprador_nombre, comprador_cuit, lista_precio_id,
        diasInt, fechaVencStr, condiciones, observaciones,
        subtotal_total.toFixed(4), iva_total.toFixed(4), total_pres.toFixed(4),
        parseFloat(descuento_global).toFixed(4), estado, id, cliente_id,
      ]
    );

    // Reemplazar items
    await pool.query(`DELETE FROM presupuestos_items WHERE presupuesto_id=$1`, [id]);
    for (const it of itemsCalc) {
      await pool.query(
        `INSERT INTO presupuestos_items
           (presupuesto_id, cliente_id, producto_id, es_libre,
            descripcion_libre, descripcion,
            cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
            alicuota_iva, iva_monto, subtotal, total, orden, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())`,
        [
          id, cliente_id,
          it.es_libre ? null : (it.producto_id || null),
          !!it.es_libre,
          it.descripcion_libre || null,
          it.descripcion || '',
          it.cantidad, it.precio,
          it.dto_pct, it.dto_monto.toFixed(4),
          it.iva_pct, it.iva_monto.toFixed(4),
          it.neto.toFixed(4), it.total_item.toFixed(4),
          it.orden,
        ]
      );
    }

    res.json({ ok: true, presupuesto_id: id, fecha_vencimiento: fechaVencStr });

  } catch (err) {
    console.error('PUT /presupuestos/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar presupuesto', detalle: err.message });
  }
});

module.exports = router;
