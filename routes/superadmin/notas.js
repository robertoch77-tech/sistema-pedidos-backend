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
        cliente_id       BIGINT NOT NULL,
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
    // NOTA: cuenta_corriente_id (notas_credito/notas_debito), afecta_caja y
    // caja_movimiento_id (notas_credito), y nota_credito_id (caja_movimientos)
    // NO se agregan automáticamente. Ver SQL pendiente en el informe del ciclo.
    // El código detecta en tiempo de ejecución si existen (columnasExtra()) y
    // degrada sin fallar si todavía no fueron aplicadas.
    await pool.query(`ALTER TABLE notas_credito_items ADD COLUMN IF NOT EXISTS modo_iva TEXT DEFAULT 'agregar'`).catch(() => {});
    await pool.query(`ALTER TABLE notas_debito_items  ADD COLUMN IF NOT EXISTS modo_iva TEXT DEFAULT 'agregar'`).catch(() => {});
  } catch (err) {
    console.error('notas: error asegurando tablas:', err.message);
  }
}
asegurarTablas();

router.use(verificarCualquierToken);

function n(v) { return parseFloat(v) || 0; }
function normCuit(v) { return (v || '').replace(/\D/g, ''); }
function normNombre(v) { return (v || '').trim().toLowerCase().replace(/\s+/g, ' '); }

// ── Columnas opcionales (no se crean solas — ver SQL pendiente en el informe) ──
// Se detectan una sola vez contra el esquema real para no asumir su existencia
// silenciosamente: si faltan, las funciones que dependen de ellas se desactivan
// con un error explícito en vez de romper con un error de SQL.
let _columnasExtraPromise = null;
function columnasExtra() {
  if (!_columnasExtraPromise) {
    _columnasExtraPromise = pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN ('notas_credito','notas_debito','caja_movimientos')
         AND column_name IN ('cuenta_corriente_id','afecta_caja','caja_movimiento_id','nota_credito_id')`
    ).then(r => {
      const set = new Set(r.rows.map(row => `${row.table_name}.${row.column_name}`));
      return {
        ncCuentaCorrienteId:  set.has('notas_credito.cuenta_corriente_id'),
        ndCuentaCorrienteId:  set.has('notas_debito.cuenta_corriente_id'),
        ncAfectaCaja:         set.has('notas_credito.afecta_caja'),
        ncCajaMovimientoId:   set.has('notas_credito.caja_movimiento_id'),
        cajaMovNotaCreditoId: set.has('caja_movimientos.nota_credito_id'),
      };
    }).catch(() => ({
      ncCuentaCorrienteId: false, ndCuentaCorrienteId: false,
      ncAfectaCaja: false, ncCajaMovimientoId: false, cajaMovNotaCreditoId: false,
    }));
  }
  return _columnasExtraPromise;
}

// Si el cliente ya envió un cuenta_corriente_id (cliente elegido/creado en el
// buscador persistente), se usa DIRECTO: se bloquea con FOR UPDATE y se exige
// que exista, esté activa y sea del mismo cliente_id — nunca se vuelve a
// buscar por nombre o CUIT en ese caso. La búsqueda normalizada por CUIT/nombre
// queda solo como compatibilidad para llamadas históricas que no manden ID.
async function resolverCuentaCorriente(client, cliente_id, ccIdEnviado) {
  if (!ccIdEnviado) return null;
  const r = await client.query(
    `SELECT id, saldo FROM cuentas_corrientes_clientes
     WHERE id = $1 AND cliente_id = $2 AND activo = true
     FOR UPDATE`,
    [ccIdEnviado, cliente_id]
  );
  if (!r.rows[0]) {
    throw new Error('La cuenta corriente indicada no existe, no está activa, o no pertenece a este comercio');
  }
  return r.rows[0];
}

function calcTotales(items) {
  let subtotal = 0, total_iva = 0;
  for (const it of items) {
    const importe = n(it.cantidad) * n(it.precio_unitario) * (1 - n(it.descuento_pct) / 100);
    const alicuota = n(it.alicuota_iva);
    const modoIva = ['off', 'agregar', 'discriminar'].includes(it.modo_iva) ? it.modo_iva : 'agregar';
    const iva = modoIva === 'agregar'
      ? importe * (alicuota / 100)
      : modoIva === 'discriminar'
        ? importe * (alicuota / (100 + alicuota))
        : 0;
    const base = modoIva === 'discriminar' ? importe - iva : importe;
    it._subtotal   = base;
    it._total_item = modoIva === 'agregar' ? importe + iva : importe;
    subtotal  += base;
    total_iva += iva;
  }
  return { subtotal, total_iva, total: items.reduce((s, it) => s + n(it._total_item), 0) };
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

// ─── GET /:cliente_id/facturas-emitidas ── buscar ventas/facturas para vincular N/C
router.get('/:cliente_id/facturas-emitidas', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { buscar } = req.query;

    let query = `
      SELECT v.id AS venta_id,
             v.numero_completo AS numero_interno,
             COALESCE(NULLIF(v.numero_arca::text, ''), v.numero_completo) AS numero_arca,
             v.tipo_factura, v.cae, COALESCE(v.facturado, false) AS facturado,
             COALESCE(v.modo_iva, 'off') AS modo_iva,
             v.total AS monto_total,
             v.comprador_nombre, v.comprador_cuit, v.creado_en,
             ac.punto_venta, ac.numero
      FROM ventas v
      LEFT JOIN arca_comprobantes ac ON ac.venta_id = v.id AND ac.cliente_id = v.cliente_id
      WHERE v.cliente_id = $1 AND COALESCE(v.anulada, false) = false
    `;
    const params = [cliente_id];

    if (buscar && buscar.trim()) {
      params.push('%' + buscar.trim() + '%');
      query += ` AND (v.numero_completo ILIKE $2 OR v.numero_arca::text ILIKE $2
                      OR ac.numero_completo ILIKE $2
                      OR v.comprador_nombre ILIKE $2 OR v.comprador_cuit ILIKE $2)`;
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
      `SELECT vi.producto_id,
              COALESCE(p.descripcion, vi.descripcion_libre, '') AS descripcion,
              vi.cantidad, vi.precio_unitario,
              COALESCE(vi.descuento_porcentaje, 0) AS descuento_pct,
              COALESCE(vi.alicuota_iva, 21) AS alicuota_iva,
              vi.subtotal, vi.iva_monto
       FROM ventas_items vi
       JOIN ventas v ON v.id = vi.venta_id
       LEFT JOIN productos_propios p ON p.id = vi.producto_id AND p.cliente_id = v.cliente_id
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
  let client;
  try {
    client = await pool.connect();
    const { cliente_id } = req.params;
    const {
      tipo = 'emitida', comprador_nombre, comprador_cuit, proveedor_id,
      venta_id, compra_id, tipo_comprobante_origen, numero_comprobante_origen,
      motivo, descripcion_motivo, items = [], afecta_stock = false,
      afecta_cuenta_corriente = false, afecta_caja = false, cuenta_corriente_id: ccIdEnviado = null,
      observaciones, estado = 'emitida',
    } = req.body;

    if (afecta_caja && tipo !== 'emitida') {
      throw new Error('La devolución de caja solo aplica a notas de crédito emitidas a clientes');
    }
    const cols = await columnasExtra();
    if (estado === 'emitida' && afecta_caja && !(cols.ncCajaMovimientoId && cols.cajaMovNotaCreditoId)) {
      throw new Error('La devolución de caja requiere una actualización de base de datos pendiente (ver informe del ciclo). No se guardó nada.');
    }

    await client.query('BEGIN');
    // Serializa la numeración de N/C por cliente para evitar duplicados
    // cuando dos usuarios emiten al mismo tiempo.
    await client.query(
      'SELECT pg_advisory_xact_lock(71001, ($1::bigint % 2147483647)::int)',
      [cliente_id]
    );

    const numRes = await client.query(
      `SELECT COALESCE(MAX(numero),0)+1 AS siguiente FROM notas_credito WHERE cliente_id=$1`,
      [cliente_id]
    );
    const numero = numRes.rows[0].siguiente;
    const numero_completo = `NC-${String(numero).padStart(6, '0')}`;

    const totales = calcTotales(items);

    const notaRes = await client.query(
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

    // La base histórica puede conservar nombres anteriores (nota_credito_id,
    // cliente_id, total, descuento_porcentaje, iva_monto). Leer el esquema real
    // evita corregir una restricción por vez y mantiene compatibilidad sin borrar datos.
    const columnasRes = await client.query(
      `SELECT column_name, is_nullable, column_default, is_identity
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'notas_credito_items'
       ORDER BY ordinal_position`
    );
    const columnasTabla = new Set(columnasRes.rows.map(row => row.column_name));

    for (const it of items) {
      const descuento = n(it.descuento_pct);
      const totalItem = n(it._total_item);
      const subtotalItem = n(it._subtotal);
      const datosItem = {
        nota_id,
        nota_credito_id: nota_id,
        cliente_id,
        producto_id: it.producto_id || null,
        variante_id: it.variante_id || null,
        es_libre: it.es_libre || false,
        descripcion: it.descripcion || '',
        cantidad: n(it.cantidad),
        precio_unitario: n(it.precio_unitario),
        descuento_pct: descuento,
        descuento_porcentaje: descuento,
        alicuota_iva: n(it.alicuota_iva) || 21,
        modo_iva: ['off', 'agregar', 'discriminar'].includes(it.modo_iva) ? it.modo_iva : 'agregar',
        subtotal: subtotalItem,
        iva_monto: totalItem - subtotalItem,
        total_item: totalItem,
        total: totalItem,
      };
      const faltantes = columnasRes.rows
        .filter(col => col.is_nullable === 'NO'
          && col.column_default == null
          && col.is_identity !== 'YES'
          && col.column_name !== 'id'
          && !Object.prototype.hasOwnProperty.call(datosItem, col.column_name))
        .map(col => col.column_name);
      if (faltantes.length) {
        throw new Error(`Esquema incompatible de notas_credito_items: faltan ${faltantes.join(', ')}`);
      }
      const columnasItem = Object.keys(datosItem).filter(columna => columnasTabla.has(columna));
      const valoresItem = columnasItem.map(columna => datosItem[columna]);
      const placeholders = valoresItem.map((_, index) => `$${index + 1}`).join(',');
      await client.query(
        `INSERT INTO notas_credito_items (${columnasItem.join(',')}) VALUES (${placeholders})`,
        valoresItem
      );
    }

    // Los movimientos comerciales (CC, stock, caja) solo se ejecutan cuando la
    // nota queda 'emitida'. Un borrador puede guardar los mismos checkboxes,
    // pero no debe mover nada todavía.
    let cuenta_corriente_id = null;
    if (estado === 'emitida' && afecta_cuenta_corriente) {
      if (tipo === 'emitida') {
        let cc = await resolverCuentaCorriente(client, cliente_id, ccIdEnviado);
        if (!cc) {
          const cuitNorm = normCuit(comprador_cuit);
          const ccRes = cuitNorm
            ? await client.query(
                `SELECT id, saldo FROM cuentas_corrientes_clientes
                 WHERE cliente_id = $1
                   AND regexp_replace(comprador_cuit, '\\D', '', 'g') = $2
                   AND activo = true
                 FOR UPDATE`,
                [cliente_id, cuitNorm]
              )
            : await client.query(
                `SELECT id, saldo FROM cuentas_corrientes_clientes
                 WHERE cliente_id = $1
                   AND lower(regexp_replace(trim(comprador_nombre), '\\s+', ' ', 'g')) = $2
                   AND activo = true
                 FOR UPDATE`,
                [cliente_id, normNombre(comprador_nombre)]
              );
          if (ccRes.rows.length !== 1) {
            throw new Error(
              ccRes.rows.length === 0
                ? 'No se encontró cuenta corriente para el comprador'
                : 'Se encontró más de una cuenta corriente — no se puede determinar cuál afectar'
            );
          }
          cc = ccRes.rows[0];
        }
        cuenta_corriente_id = cc.id;
        const nuevoSaldo = (parseFloat(cc.saldo) || 0) - parseFloat(totales.total);
        await client.query(
          `UPDATE cuentas_corrientes_clientes
           SET saldo = $1, modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [nuevoSaldo.toFixed(4), cc.id, cliente_id]
        );
        await client.query(
          `INSERT INTO movimientos_cuentas_corrientes
             (cuenta_corriente_id, cliente_id, tipo, debe, haber, saldo_acumulado, descripcion, estado)
           VALUES ($1, $2, 'nota_credito', 0, $3, $4, $5, 'procesado')`,
          [cc.id, cliente_id, totales.total, nuevoSaldo.toFixed(4),
           `NC ${numero_completo} - ${motivo}`]
        );
      } else if (tipo === 'recibida' && proveedor_id) {
        await client.query(
          `UPDATE proveedores SET saldo = saldo - $1 WHERE id=$2 AND cliente_id=$3`,
          [totales.total, proveedor_id, cliente_id]
        );
      }
    }

    // Stock: devolver unidades
    if (estado === 'emitida' && afecta_stock) {
      for (const it of items) {
        if (it.producto_id) {
          await client.query(
            `UPDATE productos_propios SET stock_actual = COALESCE(stock_actual, 0) + $1, modificado_en = now()
             WHERE id = $2 AND cliente_id = $3`,
            [n(it.cantidad), it.producto_id, cliente_id]
          );
        }
      }
    }

    // Devolución efectiva de dinero: un solo movimiento de egreso de caja
    // (ya se validó arriba que las columnas necesarias existen si esto se ejecuta)
    let caja_movimiento_id = null;
    if (estado === 'emitida' && afecta_caja) {
      const cajaRes = await client.query(
        `SELECT id FROM cajas
         WHERE cliente_id = $1 AND estado = 'abierta'
         ORDER BY fecha_apertura DESC LIMIT 1
         FOR UPDATE`,
        [cliente_id]
      );
      if (!cajaRes.rows[0]) {
        throw new Error('No hay una caja abierta para registrar la devolución de dinero');
      }
      const caja_id = cajaRes.rows[0].id;
      const movRes = await client.query(
        `INSERT INTO caja_movimientos
           (caja_id, cliente_id, tipo, tipo_operacion, monto, medio_pago, descripcion, numero_comprobante, nota_credito_id)
         VALUES ($1,$2,'nota_credito','egreso',$3,'efectivo',$4,$5,$6)
         RETURNING id`,
        [caja_id, cliente_id, totales.total, `Devolución NC ${numero_completo}`, numero_completo, nota_id]
      );
      caja_movimiento_id = movRes.rows[0].id;
      await client.query(
        `UPDATE cajas
         SET total_egresos = total_egresos + $1,
             saldo_actual   = saldo_inicial + total_ingresos - (total_egresos + $1)
         WHERE id = $2`,
        [totales.total, caja_id]
      );
    }

    const setClauses = [];
    const setValues = [];
    if (cols.ncCuentaCorrienteId) { setValues.push(cuenta_corriente_id); setClauses.push(`cuenta_corriente_id=$${setValues.length}`); }
    if (cols.ncCajaMovimientoId)  { setValues.push(caja_movimiento_id);  setClauses.push(`caja_movimiento_id=$${setValues.length}`); }
    if (cols.ncAfectaCaja)        { setValues.push(afecta_caja);        setClauses.push(`afecta_caja=$${setValues.length}`); }
    if (setClauses.length) {
      setValues.push(nota_id);
      await client.query(`UPDATE notas_credito SET ${setClauses.join(', ')} WHERE id=$${setValues.length}`, setValues);
    }

    await client.query('COMMIT');

    // Analytics no forma parte de la operación comercial y no debe impedirla.
    await pool.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, valor, metadata, creado_en)
       VALUES ($1,'nc_emitida',$2,$3,now())`,
      [cliente_id, totales.total, JSON.stringify({ nota_id, numero_completo, tipo })]
    ).catch(() => {});

    res.json({ ok: true, nota_id, numero_completo });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('notas credito crear:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// ─── POST /:cliente_id/debito ─────────────────────────────────
router.post('/:cliente_id/debito', verificarClienteId, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const { cliente_id } = req.params;
    const {
      tipo = 'emitida', comprador_nombre, comprador_cuit, proveedor_id,
      venta_id, compra_id, tipo_comprobante_origen, numero_comprobante_origen,
      motivo, descripcion_motivo, items = [],
      afecta_cuenta_corriente = false, cuenta_corriente_id: ccIdEnviado = null,
      observaciones, estado = 'emitida',
    } = req.body;

    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(71002, ($1::bigint % 2147483647)::int)',
      [cliente_id]
    );

    const numRes = await client.query(
      `SELECT COALESCE(MAX(numero),0)+1 AS siguiente FROM notas_debito WHERE cliente_id=$1`,
      [cliente_id]
    );
    const numero = numRes.rows[0].siguiente;
    const numero_completo = `ND-${String(numero).padStart(6, '0')}`;

    const totales = calcTotales(items);

    const notaRes = await client.query(
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
      await client.query(
        `INSERT INTO notas_debito_items
           (nota_id, producto_id, variante_id, es_libre, descripcion,
            cantidad, precio_unitario, descuento_pct, alicuota_iva, modo_iva, subtotal, total_item)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [nota_id, it.producto_id || null, it.variante_id || null, it.es_libre || false,
         it.descripcion || '', n(it.cantidad), n(it.precio_unitario),
         n(it.descuento_pct), n(it.alicuota_iva) || 21,
         ['off', 'agregar', 'discriminar'].includes(it.modo_iva) ? it.modo_iva : 'agregar',
         it._subtotal, it._total_item]
      );
    }

    const cols = await columnasExtra();
    let cuenta_corriente_id_nd = null;
    if (estado === 'emitida' && afecta_cuenta_corriente) {
      if (tipo === 'emitida') {
        let cc = await resolverCuentaCorriente(client, cliente_id, ccIdEnviado);
        if (!cc) {
          const cuitNorm = normCuit(comprador_cuit);
          const ccRes = cuitNorm
            ? await client.query(
                `SELECT id, saldo FROM cuentas_corrientes_clientes
                 WHERE cliente_id = $1
                   AND regexp_replace(comprador_cuit, '\\D', '', 'g') = $2
                   AND activo = true
                 FOR UPDATE`,
                [cliente_id, cuitNorm]
              )
            : await client.query(
                `SELECT id, saldo FROM cuentas_corrientes_clientes
                 WHERE cliente_id = $1
                   AND lower(regexp_replace(trim(comprador_nombre), '\\s+', ' ', 'g')) = $2
                   AND activo = true
                 FOR UPDATE`,
                [cliente_id, normNombre(comprador_nombre)]
              );
          if (ccRes.rows.length !== 1) {
            throw new Error(
              ccRes.rows.length === 0
                ? 'No se encontró cuenta corriente para el comprador'
                : 'Se encontró más de una cuenta corriente — no se puede determinar cuál afectar'
            );
          }
          cc = ccRes.rows[0];
        }
        cuenta_corriente_id_nd = cc.id;
        const nuevoSaldo = (parseFloat(cc.saldo) || 0) + parseFloat(totales.total);
        await client.query(
          `UPDATE cuentas_corrientes_clientes
           SET saldo = $1, modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [nuevoSaldo.toFixed(4), cc.id, cliente_id]
        );
        await client.query(
          `INSERT INTO movimientos_cuentas_corrientes
             (cuenta_corriente_id, cliente_id, tipo, debe, haber, saldo_acumulado, descripcion, estado)
           VALUES ($1, $2, 'nota_debito', $3, 0, $4, $5, 'procesado')`,
          [cc.id, cliente_id, totales.total, nuevoSaldo.toFixed(4),
           `ND ${numero_completo} - ${motivo}`]
        );
      } else if (tipo === 'recibida' && proveedor_id) {
        await client.query(
          `UPDATE proveedores SET saldo = saldo + $1 WHERE id=$2 AND cliente_id=$3`,
          [totales.total, proveedor_id, cliente_id]
        );
      }
    }

    if (cols.ndCuentaCorrienteId) {
      await client.query(
        `UPDATE notas_debito SET cuenta_corriente_id=$1 WHERE id=$2`,
        [cuenta_corriente_id_nd, nota_id]
      );
    }

    await client.query('COMMIT');

    await pool.query(
      `INSERT INTO analytics_eventos (cliente_id, tipo, valor, metadata, creado_en)
       VALUES ($1,'nd_emitida',$2,$3,now())`,
      [cliente_id, totales.total, JSON.stringify({ nota_id, numero_completo, tipo })]
    ).catch(() => {});

    res.json({ ok: true, nota_id, numero_completo });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('notas debito crear:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
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
// Todo o nada: se bloquea la nota, se revierte CC/stock/caja y se marca
// anulada dentro de UNA sola transacción. Si cualquier paso falla, se hace
// ROLLBACK completo y la nota queda exactamente como estaba.
router.put('/:cliente_id/:tipo_nota/:id/anular', verificarClienteId, async (req, res) => {
  let client;
  try {
    const { cliente_id, tipo_nota, id } = req.params;
    const { motivo_anulacion } = req.body;
    const tabla = tipo_nota === 'debito' ? 'notas_debito' : 'notas_credito';

    client = await pool.connect();
    await client.query('BEGIN');

    const notaRes = await client.query(
      `SELECT * FROM ${tabla} WHERE id=$1 AND cliente_id=$2 FOR UPDATE`, [id, cliente_id]
    );
    if (notaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No encontrada' });
    }
    const nota = notaRes.rows[0];

    if (nota.anulada) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta nota ya fue anulada' });
    }

    // Un borrador nunca movió CC, stock ni caja — anularlo solo cambia su estado.
    if (nota.estado === 'emitida') {
      // Revertir cuenta corriente — usa la cuenta exacta que se afectó (guardada
      // en la nota si la columna existe) y, si no, exige una coincidencia única
      // por CUIT o nombre normalizado; nunca "cualquiera" del comercio.
      if (nota.afecta_cuenta_corriente) {
        let ccId = nota.cuenta_corriente_id || null;
        if (!ccId) {
          const cuitNorm = normCuit(nota.comprador_cuit);
          const fallback = cuitNorm
            ? await client.query(
                `SELECT id FROM cuentas_corrientes_clientes
                 WHERE cliente_id=$1 AND regexp_replace(comprador_cuit,'\\D','','g')=$2 AND activo=true
                 FOR UPDATE`,
                [cliente_id, cuitNorm]
              )
            : await client.query(
                `SELECT id FROM cuentas_corrientes_clientes
                 WHERE cliente_id=$1 AND lower(regexp_replace(trim(comprador_nombre), '\\s+', ' ', 'g'))=$2 AND activo=true
                 FOR UPDATE`,
                [cliente_id, normNombre(nota.comprador_nombre)]
              );
          if (fallback.rows.length !== 1) {
            throw new Error(
              fallback.rows.length === 0
                ? 'No se encontró la cuenta corriente a revertir para este comprador'
                : 'Hay más de una cuenta corriente que coincide — no se puede determinar cuál revertir'
            );
          }
          ccId = fallback.rows[0].id;
        }

        if (tipo_nota === 'credito' && nota.tipo === 'emitida') {
          await client.query(
            `INSERT INTO movimientos_cuentas_corrientes
               (cuenta_corriente_id, cliente_id, tipo, debe, haber, saldo_acumulado, descripcion, estado)
             SELECT cc.id, $3, 'anulacion_nc', $1, 0,
                    COALESCE(cc.saldo, 0) + $1,
                    $2, 'procesado'
             FROM cuentas_corrientes_clientes cc WHERE cc.id=$4`,
            [n(nota.total), `Anulación ${nota.numero_completo}`, cliente_id, ccId]
          );
          await client.query(
            `UPDATE cuentas_corrientes_clientes SET saldo = COALESCE(saldo, 0) + $1, modificado_en = now()
             WHERE id = $2`,
            [n(nota.total), ccId]
          );
        } else if (tipo_nota === 'debito' && nota.tipo === 'emitida') {
          await client.query(
            `INSERT INTO movimientos_cuentas_corrientes
               (cuenta_corriente_id, cliente_id, tipo, debe, haber, saldo_acumulado, descripcion, estado)
             SELECT cc.id, $3, 'anulacion_nd', 0, $1,
                    COALESCE(cc.saldo, 0) - $1,
                    $2, 'procesado'
             FROM cuentas_corrientes_clientes cc WHERE cc.id=$4`,
            [n(nota.total), `Anulación ${nota.numero_completo}`, cliente_id, ccId]
          );
          await client.query(
            `UPDATE cuentas_corrientes_clientes SET saldo = COALESCE(saldo, 0) - $1, modificado_en = now()
             WHERE id = $2`,
            [n(nota.total), ccId]
          );
        }
      }

      // Revertir stock si la NC lo había afectado
      if (tipo_nota === 'credito' && nota.afecta_stock) {
        await client.query(
          `UPDATE productos_propios pp SET stock_actual = COALESCE(pp.stock_actual, 0) - nci.cantidad, modificado_en = now()
           FROM notas_credito_items nci
           WHERE nci.nota_id=$1 AND nci.producto_id IS NOT NULL AND pp.id = nci.producto_id AND pp.cliente_id = $2`,
          [id, cliente_id]
        );
      }

      // Revertir devolución de caja si la NC había generado un egreso — se
      // repone en la MISMA caja donde se registró (nunca en otra "de paso"),
      // y si esa caja ya está cerrada, la anulación completa falla en vez de
      // inventar un movimiento en una caja distinta.
      if (tipo_nota === 'credito' && nota.caja_movimiento_id) {
        const movOriginal = await client.query(
          `SELECT cm.caja_id, c.estado FROM caja_movimientos cm
           JOIN cajas c ON c.id = cm.caja_id
           WHERE cm.id = $1 AND cm.cliente_id = $2
           FOR UPDATE OF c`,
          [nota.caja_movimiento_id, cliente_id]
        );
        if (!movOriginal.rows[0]) {
          throw new Error('No se encontró el movimiento de caja original de esta NC');
        }
        if (movOriginal.rows[0].estado !== 'abierta') {
          throw new Error('La caja donde se registró la devolución de esta NC ya está cerrada. Reabrila antes de anular, o revertí el movimiento manualmente.');
        }
        const caja_id = movOriginal.rows[0].caja_id;
        await client.query(
          `INSERT INTO caja_movimientos
             (caja_id, cliente_id, tipo, tipo_operacion, monto, medio_pago, descripcion, numero_comprobante, nota_credito_id)
           VALUES ($1,$2,'anulacion_nc','ingreso',$3,'efectivo',$4,$5,$6)`,
          [caja_id, cliente_id, n(nota.total), `Anulación devolución NC ${nota.numero_completo}`, nota.numero_completo, nota.id]
        );
        await client.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual    = saldo_inicial + (total_ingresos + $1) - total_egresos
           WHERE id = $2`,
          [n(nota.total), caja_id]
        );
      }
    }

    await client.query(
      `UPDATE ${tabla} SET anulada=true, estado='anulada', motivo_anulacion=$1, actualizado_en=now()
       WHERE id=$2 AND cliente_id=$3`,
      [motivo_anulacion || '', id, cliente_id]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('notas anular:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
