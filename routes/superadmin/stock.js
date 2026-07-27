const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken } = require('./authMiddleware');

// ── Asegurar tablas ────────────────────────────────────────────
async function asegurarTablas() {
  try {
    // Columnas faltantes en productos_propios
    const cols = [
      ['productos_propios', 'stock_minimo',       'NUMERIC DEFAULT 0'],
      ['productos_propios', 'precio_costo_final',  'NUMERIC DEFAULT 0'],
      ['productos_propios', 'precio_venta_1',      'NUMERIC DEFAULT 0'],
      ['productos_propios', 'proveedor_id',        'BIGINT'],
      ['productos_propios', 'rubro',               'TEXT'],
      ['productos_propios', 'marca',               'TEXT'],
      ['productos_propios', 'imagen_url',          'TEXT'],
      ['productos_propios', 'activo',              'BOOLEAN DEFAULT true'],
    ];
    for (const [tabla, col, tipo] of cols) {
      await pool.query(
        `ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${col} ${tipo}`
      ).catch(() => {});
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_movimientos (
        id               BIGSERIAL PRIMARY KEY,
        cliente_id       BIGINT NOT NULL,
        producto_id      BIGINT,
        variante_id      BIGINT,
        sucursal_id      BIGINT,
        tipo             TEXT NOT NULL,
        cantidad         NUMERIC NOT NULL DEFAULT 0,
        stock_anterior   NUMERIC DEFAULT 0,
        stock_posterior  NUMERIC DEFAULT 0,
        motivo           TEXT DEFAULT '',
        observaciones    TEXT DEFAULT '',
        numero_documento TEXT DEFAULT '',
        referencia_tipo  TEXT DEFAULT '',
        referencia_id    BIGINT,
        usuario          TEXT DEFAULT '',
        creado_en        TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_transferencias (
        id                   BIGSERIAL PRIMARY KEY,
        cliente_id           BIGINT NOT NULL,
        sucursal_origen_id   BIGINT,
        sucursal_destino_id  BIGINT,
        estado               TEXT DEFAULT 'completada',
        observaciones        TEXT DEFAULT '',
        creado_en            TIMESTAMPTZ DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_transferencias_items (
        id               BIGSERIAL PRIMARY KEY,
        transferencia_id BIGINT NOT NULL,
        cliente_id       BIGINT NOT NULL,
        producto_id      BIGINT,
        variante_id      BIGINT,
        cantidad         NUMERIC NOT NULL DEFAULT 0,
        creado_en        TIMESTAMPTZ DEFAULT now()
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
    console.error('stock: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/dashboard — métricas
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/dashboard', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [bajoRes, sinRes, valRes, activosRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS cnt FROM productos_propios
         WHERE cliente_id=$1 AND activo IS NOT FALSE
           AND stock_minimo > 0 AND stock_actual > 0
           AND stock_actual <= stock_minimo`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM productos_propios
         WHERE cliente_id=$1 AND activo IS NOT FALSE
           AND (stock_actual IS NULL OR stock_actual <= 0)`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COALESCE(SUM(stock_actual * precio_costo_final), 0) AS valor_costo,
                COALESCE(SUM(stock_actual * precio_venta_1),    0) AS valor_venta
         FROM productos_propios
         WHERE cliente_id=$1 AND activo IS NOT FALSE AND stock_actual > 0`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM productos_propios
         WHERE cliente_id=$1 AND activo IS NOT FALSE`,
        [cliente_id]
      ),
    ]);

    res.json({
      bajo_minimo:   parseInt(bajoRes.rows[0].cnt, 10),
      sin_stock:     parseInt(sinRes.rows[0].cnt, 10),
      valor_costo:   parseFloat(valRes.rows[0].valor_costo),
      valor_venta:   parseFloat(valRes.rows[0].valor_venta),
      activos:       parseInt(activosRes.rows[0].cnt, 10),
    });
  } catch (err) {
    console.error('GET stock/dashboard error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener dashboard', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id — listar stock con filtros
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      buscar = '', proveedor_id, rubro, estado_stock,
      fecha_desde, fecha_hasta,
      page = '1', limit = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['pp.cliente_id = $1', 'pp.activo IS NOT FALSE'];

    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(pp.codigo ILIKE $${n} OR pp.descripcion ILIKE $${n} OR pp.marca ILIKE $${n})`);
    }
    if (proveedor_id) {
      values.push(proveedor_id);
      where.push(`pp.proveedor_id = $${values.length}`);
    }
    if (rubro) {
      values.push(rubro);
      where.push(`pp.rubro = $${values.length}`);
    }
    if (estado_stock === 'sin_stock') {
      where.push(`(pp.stock_actual IS NULL OR pp.stock_actual <= 0)`);
    } else if (estado_stock === 'bajo') {
      where.push(`(pp.stock_minimo > 0 AND pp.stock_actual > 0 AND pp.stock_actual <= pp.stock_minimo)`);
    } else if (estado_stock === 'normal') {
      where.push(`(pp.stock_minimo = 0 OR pp.stock_actual > pp.stock_minimo)`);
      where.push(`(pp.stock_actual > 0)`);
    }
    if (fecha_desde) {
      values.push(fecha_desde);
      where.push(`pp.modificado_en >= $${values.length}`);
    }
    if (fecha_hasta) {
      values.push(fecha_hasta);
      where.push(`pp.modificado_en <= ($${values.length}::date + interval '1 day')`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT pp.id, pp.codigo, pp.descripcion, pp.marca, pp.rubro,
                pp.stock_actual, pp.stock_minimo,
                pp.precio_costo_final, pp.precio_venta_1,
                pp.imagen_url, pp.modificado_en,
                pv.nombre AS proveedor_nombre,
                (SELECT creado_en FROM stock_movimientos
                 WHERE producto_id = pp.id AND cliente_id = pp.cliente_id
                 ORDER BY creado_en DESC LIMIT 1) AS ultimo_movimiento
         FROM productos_propios pp
         LEFT JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.cliente_id = pp.cliente_id
         WHERE ${whereStr}
         ORDER BY pp.descripcion ASC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM productos_propios pp WHERE ${whereStr}`, values),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ items: dataRes.rows, total, pagina: pageNum, paginas, por_pagina: limitNum });
  } catch (err) {
    console.error('GET /stock error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar stock', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/movimientos — historial
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/movimientos', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const {
      producto_id, tipo,
      fecha_desde, fecha_hasta,
      buscar = '',
      page = '1', limit = '25',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const values = [cliente_id];
    const where  = ['sm.cliente_id = $1'];

    if (producto_id) {
      values.push(producto_id);
      where.push(`sm.producto_id = $${values.length}`);
    }
    if (tipo) {
      values.push(tipo);
      where.push(`sm.tipo = $${values.length}`);
    }
    if (fecha_desde) {
      values.push(fecha_desde);
      where.push(`sm.creado_en >= $${values.length}`);
    }
    if (fecha_hasta) {
      values.push(fecha_hasta);
      where.push(`sm.creado_en <= ($${values.length}::date + interval '1 day')`);
    }
    if (buscar.trim()) {
      values.push(`%${buscar.trim()}%`);
      const n = values.length;
      where.push(`(pp.descripcion ILIKE $${n} OR pp.codigo ILIKE $${n} OR sm.motivo ILIKE $${n})`);
    }

    const whereStr = where.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT sm.id, sm.tipo, sm.cantidad, sm.stock_anterior, sm.stock_posterior,
                sm.motivo, sm.observaciones, sm.numero_documento,
                sm.referencia_tipo, sm.referencia_id, sm.usuario, sm.creado_en,
                pp.descripcion AS producto_descripcion, pp.codigo AS producto_codigo
         FROM stock_movimientos sm
         LEFT JOIN productos_propios pp ON pp.id = sm.producto_id
         WHERE ${whereStr}
         ORDER BY sm.creado_en DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitNum, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM stock_movimientos sm
         LEFT JOIN productos_propios pp ON pp.id = sm.producto_id
         WHERE ${whereStr}`,
        values
      ),
    ]);

    const total   = parseInt(countRes.rows[0].count, 10);
    const paginas = Math.max(1, Math.ceil(total / limitNum));

    res.json({ movimientos: dataRes.rows, total, pagina: pageNum, paginas });
  } catch (err) {
    console.error('GET /stock/movimientos error:', err.message);
    res.status(500).json({ mensaje: 'Error al listar movimientos', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cliente_id/ajuste — ajuste manual
// ═══════════════════════════════════════════════════════════════
router.post('/:cliente_id/ajuste', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    producto_id,
    variante_id = null,
    sucursal_id = null,
    tipo,
    cantidad,
    motivo = '',
    observaciones = '',
    numero_documento = '',
  } = req.body;

  if (!producto_id)             return res.status(400).json({ mensaje: 'Falta producto_id' });
  if (!['ajuste_positivo', 'ajuste_negativo'].includes(tipo))
    return res.status(400).json({ mensaje: 'Tipo inválido (ajuste_positivo | ajuste_negativo)' });
  if (!cantidad || parseFloat(cantidad) <= 0)
    return res.status(400).json({ mensaje: 'Cantidad debe ser > 0' });

  const cant = parseFloat(cantidad);
  const delta = tipo === 'ajuste_positivo' ? cant : -cant;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prodRes = await client.query(
      `SELECT stock_actual FROM productos_propios WHERE id=$1 AND cliente_id=$2`,
      [producto_id, cliente_id]
    );
    if (!prodRes.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }

    const stock_anterior  = parseFloat(prodRes.rows[0].stock_actual) || 0;
    const stock_posterior = Math.max(0, stock_anterior + delta);

    await client.query(
      `UPDATE productos_propios SET stock_actual=$1, modificado_en=now()
       WHERE id=$2 AND cliente_id=$3`,
      [stock_posterior, producto_id, cliente_id]
    );

    await client.query(
      `INSERT INTO stock_movimientos
         (cliente_id, producto_id, variante_id, sucursal_id,
          tipo, cantidad, stock_anterior, stock_posterior,
          motivo, observaciones, numero_documento, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
      [
        cliente_id, producto_id, variante_id, sucursal_id,
        tipo, cant, stock_anterior, stock_posterior,
        motivo, observaciones, numero_documento,
      ]
    );

    await client.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, referencia_id, datos)
       VALUES ($1,'stock_ajuste',$2,$3)`,
      [cliente_id, producto_id, JSON.stringify({ tipo, cantidad: cant, motivo })]
    ).catch(() => {});

    await client.query('COMMIT');
    res.json({ ok: true, stock_actual: stock_posterior, stock_anterior });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /stock/ajuste error:', err.message);
    res.status(500).json({ mensaje: 'Error al aplicar ajuste', detalle: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /:cliente_id/transferencia — entre sucursales
// ═══════════════════════════════════════════════════════════════
router.post('/:cliente_id/transferencia', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    sucursal_origen_id  = null,
    sucursal_destino_id = null,
    items = [],
    observaciones = '',
  } = req.body;

  if (!items.length) return res.status(400).json({ mensaje: 'Debe incluir al menos un producto' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transferRes = await client.query(
      `INSERT INTO stock_transferencias
         (cliente_id, sucursal_origen_id, sucursal_destino_id, estado, observaciones, creado_en)
       VALUES ($1,$2,$3,'completada',$4,now())
       RETURNING id`,
      [cliente_id, sucursal_origen_id, sucursal_destino_id, observaciones]
    );
    const transferencia_id = transferRes.rows[0].id;

    for (const it of items) {
      const cant = parseFloat(it.cantidad_solicitada) || 0;
      if (cant <= 0) continue;

      await client.query(
        `INSERT INTO stock_transferencias_items
           (transferencia_id, cliente_id, producto_id, variante_id, cantidad, creado_en)
         VALUES ($1,$2,$3,$4,$5,now())`,
        [transferencia_id, cliente_id, it.producto_id, it.variante_id || null, cant]
      );

      // Stock actual del producto
      const stRes = await client.query(
        `SELECT stock_actual FROM productos_propios WHERE id=$1 AND cliente_id=$2`,
        [it.producto_id, cliente_id]
      );
      const stock_actual = parseFloat(stRes.rows?.[0]?.stock_actual) || 0;

      // Restar del origen (el stock global del producto)
      const stock_post = Math.max(0, stock_actual - cant);
      await client.query(
        `UPDATE productos_propios SET stock_actual=$1, modificado_en=now()
         WHERE id=$2 AND cliente_id=$3`,
        [stock_post, it.producto_id, cliente_id]
      );

      // Movimiento salida origen
      await client.query(
        `INSERT INTO stock_movimientos
           (cliente_id, producto_id, sucursal_id, tipo, cantidad,
            stock_anterior, stock_posterior, motivo, referencia_tipo, referencia_id, creado_en)
         VALUES ($1,$2,$3,'transferencia_salida',$4,$5,$6,'Transferencia entre sucursales','transferencia',$7,now())`,
        [cliente_id, it.producto_id, sucursal_origen_id, cant, stock_actual, stock_post, transferencia_id]
      );

      // Movimiento entrada destino
      await client.query(
        `INSERT INTO stock_movimientos
           (cliente_id, producto_id, sucursal_id, tipo, cantidad,
            stock_anterior, stock_posterior, motivo, referencia_tipo, referencia_id, creado_en)
         VALUES ($1,$2,$3,'transferencia_entrada',$4,$5,$6,'Transferencia entre sucursales','transferencia',$7,now())`,
        [cliente_id, it.producto_id, sucursal_destino_id, cant, stock_actual, stock_actual, transferencia_id]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true, transferencia_id });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /stock/transferencia error:', err.message);
    res.status(500).json({ mensaje: 'Error en transferencia', detalle: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/valorizado — reporte valorizado
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/valorizado', async (req, res) => {
  try {
    const { cliente_id } = req.params;

    const [totRes, provRes, rubroRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total_productos,
                COALESCE(SUM(stock_actual), 0) AS total_unidades,
                COALESCE(SUM(stock_actual * precio_costo_final), 0) AS valor_total_costo,
                COALESCE(SUM(stock_actual * precio_venta_1), 0) AS valor_total_venta
         FROM productos_propios
         WHERE cliente_id=$1 AND activo IS NOT FALSE AND stock_actual > 0`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COALESCE(pv.nombre, 'Sin proveedor') AS proveedor,
                COUNT(pp.id) AS productos,
                COALESCE(SUM(pp.stock_actual), 0) AS unidades,
                COALESCE(SUM(pp.stock_actual * pp.precio_costo_final), 0) AS valor_costo,
                COALESCE(SUM(pp.stock_actual * pp.precio_venta_1), 0) AS valor_venta
         FROM productos_propios pp
         LEFT JOIN proveedores pv ON pv.id = pp.proveedor_id AND pv.cliente_id = pp.cliente_id
         WHERE pp.cliente_id=$1 AND pp.activo IS NOT FALSE AND pp.stock_actual > 0
         GROUP BY pv.nombre
         ORDER BY valor_costo DESC`,
        [cliente_id]
      ),
      pool.query(
        `SELECT COALESCE(rubro, 'Sin rubro') AS rubro,
                COUNT(id) AS productos,
                COALESCE(SUM(stock_actual), 0) AS unidades,
                COALESCE(SUM(stock_actual * precio_costo_final), 0) AS valor_costo,
                COALESCE(SUM(stock_actual * precio_venta_1), 0) AS valor_venta
         FROM productos_propios
         WHERE cliente_id=$1 AND activo IS NOT FALSE AND stock_actual > 0
         GROUP BY rubro
         ORDER BY valor_costo DESC`,
        [cliente_id]
      ),
    ]);

    res.json({
      total_productos:   parseInt(totRes.rows[0].total_productos, 10),
      total_unidades:    parseFloat(totRes.rows[0].total_unidades),
      valor_total_costo: parseFloat(totRes.rows[0].valor_total_costo),
      valor_total_venta: parseFloat(totRes.rows[0].valor_total_venta),
      por_proveedor:     provRes.rows,
      por_rubro:         rubroRes.rows,
    });
  } catch (err) {
    console.error('GET /stock/valorizado error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener valorizado', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/proveedores — lista para filtros
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/proveedores', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const r = await pool.query(
      `SELECT id, nombre FROM proveedores WHERE cliente_id=$1 AND activo IS NOT FALSE ORDER BY nombre ASC`,
      [cliente_id]
    );
    res.json({ proveedores: r.rows });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /:cliente_id/rubros — lista para filtros
// ═══════════════════════════════════════════════════════════════
router.get('/:cliente_id/rubros', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const r = await pool.query(
      `SELECT DISTINCT rubro FROM productos_propios
       WHERE cliente_id=$1 AND rubro IS NOT NULL AND rubro != ''
       ORDER BY rubro ASC`,
      [cliente_id]
    );
    res.json({ rubros: r.rows.map(row => row.rubro) });
  } catch (err) {
    res.status(500).json({ mensaje: 'Error', detalle: err.message });
  }
});

module.exports = router;
