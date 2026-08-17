const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

// ── Asegurar tablas ────────────────────────────────────────────
async function asegurarTablas() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS remitos (
        id                    BIGSERIAL PRIMARY KEY,
        cliente_id            BIGINT NOT NULL,
        numero                INT NOT NULL,
        numero_completo       TEXT NOT NULL,
        tipo                  TEXT NOT NULL DEFAULT 'salida',
        contraparte_tipo      TEXT DEFAULT 'cliente',
        comprador_nombre      TEXT DEFAULT '',
        comprador_cuit        TEXT DEFAULT '',
        proveedor_id          BIGINT,
        sucursal_destino_id   BIGINT,
        venta_id              BIGINT,
        compra_id             BIGINT,
        presupuesto_id        BIGINT,
        fecha_entrega         DATE,
        direccion_entrega     TEXT DEFAULT '',
        transporte            TEXT DEFAULT '',
        chofer                TEXT DEFAULT '',
        patente               TEXT DEFAULT '',
        total_bultos          INT DEFAULT 0,
        observaciones         TEXT DEFAULT '',
        estado                TEXT DEFAULT 'pendiente',
        firma_receptor        TEXT DEFAULT '',
        aclaracion_receptor   TEXT DEFAULT '',
        stock_actualizado     BOOLEAN DEFAULT false,
        convertido_a_factura  BOOLEAN DEFAULT false,
        factura_venta_id      BIGINT,
        fecha                 TIMESTAMPTZ DEFAULT now(),
        creado_en             TIMESTAMPTZ DEFAULT now(),
        modificado_en         TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS remitos_items (
        id                    BIGSERIAL PRIMARY KEY,
        remito_id             BIGINT NOT NULL,
        cliente_id            BIGINT NOT NULL,
        producto_id           BIGINT,
        variante_id           BIGINT,
        es_libre              BOOLEAN DEFAULT false,
        descripcion_libre     TEXT,
        descripcion           TEXT NOT NULL DEFAULT '',
        codigo                TEXT DEFAULT '',
        cantidad_remitida     NUMERIC NOT NULL DEFAULT 1,
        cantidad_entregada    NUMERIC,
        unidad_medida         TEXT DEFAULT 'unidad',
        venta_item_id         BIGINT,
        compra_item_id        BIGINT,
        motivo_diferencia     TEXT,
        orden                 INT DEFAULT 0,
        creado_en             TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_eventos (
        id            BIGSERIAL PRIMARY KEY,
        cliente_id    BIGINT,
        tipo          TEXT,
        referencia_id BIGINT,
        datos         JSONB,
        creado_en     TIMESTAMPTZ DEFAULT now()
      )
    `).catch(() => {});

  } catch (err) {
    console.error('remitos: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/dashboard — métricas
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/dashboard', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [mesRes, pendRes, encaminoRes, entregRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cantidad FROM remitos
         WHERE cliente_id=$1 AND DATE_TRUNC('month',fecha)=DATE_TRUNC('month',NOW())`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad FROM remitos WHERE cliente_id=$1 AND estado='pendiente'`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad FROM remitos WHERE cliente_id=$1 AND estado='en_camino'`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cantidad FROM remitos WHERE cliente_id=$1 AND estado='entregado'`,
        [cliente_id]
      ),
    ]);

    res.json({
      mes_cantidad:        parseInt(mesRes.rows[0].cantidad, 10),
      pendientes_cantidad: parseInt(pendRes.rows[0].cantidad, 10),
      en_camino_cantidad:  parseInt(encaminoRes.rows[0].cantidad, 10),
      entregados_cantidad: parseInt(entregRes.rows[0].cantidad, 10),
    });
  } catch (err) {
    console.error('GET remitos/dashboard error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener dashboard', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — listar con filtros y paginación
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar = '', tipo, estado,
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
    if (tipo) {
      values.push(tipo);
      where.push(`tipo = $${values.length}`);
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
        `SELECT id, numero, numero_completo, tipo, contraparte_tipo,
                comprador_nombre, comprador_cuit,
                estado, fecha_entrega, total_bultos,
                convertido_a_factura, factura_venta_id,
                venta_id, presupuesto_id, fecha, creado_en
         FROM remitos
         WHERE ${whereStr}
         ORDER BY fecha DESC, numero DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM remitos WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ remitos: dataRes.rows, total, pagina: pageNum, paginas, por_pagina: limitNum });
  } catch (err) {
    console.error('GET /remitos error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar remitos', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cliente_id — crear remito
// ═══════════════════════════════════════════════════════════════
router.post('/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const {
    tipo = 'salida',
    contraparte_tipo = 'cliente',
    comprador_nombre = '',
    comprador_cuit = '',
    proveedor_id = null,
    sucursal_destino_id = null,
    venta_id = null,
    compra_id = null,
    presupuesto_id = null,
    fecha_entrega = null,
    direccion_entrega = '',
    transporte = '',
    chofer = '',
    patente = '',
    total_bultos = 0,
    observaciones = '',
    items = [],
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'El remito debe tener al menos un ítem' });
  }

  try {
    const numRes = await pool.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM remitos WHERE cliente_id=$1`,
      [cliente_id]
    );
    const numero          = parseInt(numRes.rows[0].siguiente, 10);
    const numero_completo = `R-${String(numero).padStart(5, '0')}`;

    const remitoRes = await pool.query(
      `INSERT INTO remitos
         (cliente_id, numero, numero_completo, tipo, contraparte_tipo,
          comprador_nombre, comprador_cuit, proveedor_id, sucursal_destino_id,
          venta_id, compra_id, presupuesto_id,
          fecha_entrega, direccion_entrega, transporte, chofer, patente,
          total_bultos, observaciones, estado,
          fecha, creado_en, modificado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pendiente',now(),now(),now())
       RETURNING id`,
      [
        cliente_id, numero, numero_completo, tipo, contraparte_tipo,
        comprador_nombre, comprador_cuit, proveedor_id, sucursal_destino_id,
        venta_id || null, compra_id || null, presupuesto_id || null,
        fecha_entrega || null, direccion_entrega, transporte, chofer, patente,
        parseInt(total_bultos, 10) || 0, observaciones,
      ]
    );
    const remito_id = remitoRes.rows[0].id;

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      await pool.query(
        `INSERT INTO remitos_items
           (remito_id, cliente_id, producto_id, variante_id, es_libre,
            descripcion_libre, descripcion, codigo,
            cantidad_remitida, unidad_medida,
            venta_item_id, compra_item_id, orden, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,
        [
          remito_id, cliente_id,
          it.es_libre ? null : (it.producto_id || null),
          it.variante_id || null,
          !!it.es_libre,
          it.descripcion_libre || null,
          it.descripcion || '',
          it.codigo || '',
          parseFloat(it.cantidad_remitida) || 1,
          it.unidad_medida || 'unidad',
          it.venta_item_id || null,
          it.compra_item_id || null,
          idx + 1,
        ]
      );
    }

    await pool.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, referencia_id, datos)
       VALUES ($1,'remito_creado',$2,$3)`,
      [cliente_id, remito_id, JSON.stringify({ numero_completo, tipo })]
    ).catch(() => {});

    res.json({ ok: true, remito_id, numero_completo });

  } catch (err) {
    console.error('POST /remitos error:', err.message);
    res.status(500).json({ mensaje: 'Error al crear remito', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/:id — detalle con items
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;

    const [remRes, itemsRes] = await Promise.all([
      pool.query(
        `SELECT r.*,
                pp.razon_social AS proveedor_nombre
         FROM remitos r
         LEFT JOIN proveedores pp ON pp.id = r.proveedor_id AND pp.cliente_id = r.cliente_id
         WHERE r.id=$1 AND r.cliente_id=$2`,
        [id, cliente_id]
      ),
      pool.query(
        `SELECT ri.*, pr.descripcion AS producto_descripcion, pr.codigo AS producto_codigo
         FROM remitos_items ri
         LEFT JOIN productos_propios pr ON pr.id = ri.producto_id
         WHERE ri.remito_id=$1
         ORDER BY ri.orden ASC`,
        [id]
      ),
    ]);

    if (!remRes.rows[0]) {
      return res.status(404).json({ mensaje: 'Remito no encontrado' });
    }

    res.json({ remito: remRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error('GET /remitos/:id error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener remito', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/estado — cambiar estado
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/estado', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;
    const { estado, firma_receptor = '', aclaracion_receptor = '' } = req.body;

    const ESTADOS = ['pendiente', 'en_camino', 'entregado', 'parcial', 'devuelto'];
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' });
    }

    const result = await pool.query(
      `UPDATE remitos SET estado=$1, firma_receptor=$2, aclaracion_receptor=$3, modificado_en=now()
       WHERE id=$4 AND cliente_id=$5 RETURNING id`,
      [estado, firma_receptor, aclaracion_receptor, id, cliente_id]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Remito no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /remitos/:id/estado error:', err.message);
    res.status(500).json({ mensaje: 'Error al actualizar estado', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/confirmar-entrega
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/confirmar-entrega', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;
  const {
    firma_receptor = '',
    aclaracion_receptor = '',
    cantidades_entregadas = [],
  } = req.body;

  try {
    const remRes = await pool.query(
      `SELECT * FROM remitos WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    const remito = remRes.rows[0];
    if (!remito) return res.status(404).json({ mensaje: 'Remito no encontrado' });

    const itemsRes = await pool.query(
      `SELECT * FROM remitos_items WHERE remito_id=$1 ORDER BY orden ASC`,
      [id]
    );
    const items = itemsRes.rows;

    // Determinar si es entrega total o parcial
    let esParcial = false;
    for (const ce of cantidades_entregadas) {
      const item = items.find(i => i.id === ce.item_id);
      if (!item) continue;
      const entregada = parseFloat(ce.cantidad_entregada) || 0;
      const remitida  = parseFloat(item.cantidad_remitida) || 0;
      if (entregada < remitida) esParcial = true;

      await pool.query(
        `UPDATE remitos_items SET cantidad_entregada=$1, motivo_diferencia=$2 WHERE id=$3`,
        [entregada, ce.motivo_diferencia || null, item.id]
      );

      // Actualizar stock según tipo de remito
      if (!remito.stock_actualizado && remito.tipo === 'salida' && !item.es_libre && item.producto_id) {
        await pool.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en=now()
           WHERE id=$2 AND cliente_id=$3`,
          [entregada, item.producto_id, cliente_id]
        ).catch(() => {});
      } else if (!remito.stock_actualizado && remito.tipo === 'entrada' && !item.es_libre && item.producto_id) {
        await pool.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) + $1,
               modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [entregada, item.producto_id, cliente_id]
        ).catch(() => {});
      }
    }

    const nuevoEstado = esParcial ? 'parcial' : 'entregado';

    await pool.query(
      `UPDATE remitos SET estado=$1, firma_receptor=$2, aclaracion_receptor=$3,
       stock_actualizado=true, modificado_en=now()
       WHERE id=$4 AND cliente_id=$5`,
      [nuevoEstado, firma_receptor, aclaracion_receptor, id, cliente_id]
    );

    res.json({ ok: true, estado: nuevoEstado });

  } catch (err) {
    console.error('PUT /remitos/:id/confirmar-entrega error:', err.message);
    res.status(500).json({ mensaje: 'Error al confirmar entrega', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/convertir-factura
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/convertir-factura', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;

  try {
    const remRes = await pool.query(
      `SELECT * FROM remitos WHERE id=$1 AND cliente_id=$2`,
      [id, cliente_id]
    );
    const remito = remRes.rows[0];
    if (!remito) return res.status(404).json({ mensaje: 'Remito no encontrado' });
    if (remito.convertido_a_factura) {
      return res.status(400).json({ mensaje: 'Ya fue convertido a factura', venta_id: remito.factura_venta_id });
    }

    let venta_id = remito.venta_id;

    if (!venta_id) {
      const itemsRes = await pool.query(
        `SELECT * FROM remitos_items WHERE remito_id=$1 ORDER BY orden ASC`,
        [id]
      );
      const items = itemsRes.rows;

      const numRes = await pool.query(
        `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM ventas WHERE cliente_id=$1`,
        [cliente_id]
      );
      const numero_v          = parseInt(numRes.rows[0].siguiente, 10);
      const numero_completo_v = `V-${String(numero_v).padStart(5, '0')}`;

      const ventaRes = await pool.query(
        `INSERT INTO ventas
           (cliente_id, numero, numero_completo, prefijo, tipo_comprobante,
            comprador_nombre, comprador_cuit,
            subtotal, iva_monto, total, saldo,
            estado, cobrada, anulada, va_a_cuenta_corriente,
            observaciones, fecha, creado_en, modificado_en)
         VALUES ($1,$2,$3,'V','VENTA',$4,$5,0,0,0,0,'pendiente',false,false,false,$6,now(),now(),now())
         RETURNING id`,
        [
          cliente_id, numero_v, numero_completo_v,
          remito.comprador_nombre, remito.comprador_cuit,
          remito.observaciones || '',
        ]
      );
      venta_id = ventaRes.rows[0].id;

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        await pool.query(
          `INSERT INTO ventas_items
             (venta_id, cliente_id, producto_id, es_libre, descripcion_libre,
              cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
              alicuota_iva, iva_monto, subtotal, total, orden, creado_en)
           VALUES ($1,$2,$3,$4,$5,$6,0,0,0,21,0,0,0,$7,now())`,
          [
            venta_id, cliente_id,
            it.producto_id || null,
            !!it.es_libre,
            it.descripcion_libre || null,
            it.cantidad_remitida,
            idx + 1,
          ]
        );
      }

      // Descontar stock si no fue hecho al entregar
      if (!remito.stock_actualizado && remito.tipo === 'salida') {
        for (const it of items) {
          if (!it.es_libre && it.producto_id) {
            await pool.query(
              `UPDATE productos_propios
               SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en=now()
               WHERE id=$2 AND cliente_id=$3`,
              [it.cantidad_remitida, it.producto_id, cliente_id]
            ).catch(() => {});
          }
        }
        await pool.query(
          `UPDATE remitos SET stock_actualizado=true WHERE id=$1`,
          [id]
        );
      }
    }

    await pool.query(
      `UPDATE remitos SET convertido_a_factura=true, factura_venta_id=$1, modificado_en=now()
       WHERE id=$2 AND cliente_id=$3`,
      [venta_id, id, cliente_id]
    );

    res.json({ ok: true, venta_id });

  } catch (err) {
    console.error('PUT /remitos/:id/convertir-factura error:', err.message);
    res.status(500).json({ mensaje: 'Error al convertir en factura', detalle: err.message });
  }
});

module.exports = router;
