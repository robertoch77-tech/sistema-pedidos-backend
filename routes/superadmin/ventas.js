const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');
const { calcularTotalesIVA } = require('../../utils/calcularTotalesIVA');
const { registrarCobroCliente } = require('../../services/cobrosClientes');
const { resolverSucursalVenta } = require('../../services/sucursalVenta');
const { fallo, bloquearOperacion, bloquearCuenta, resolverCuentaVenta, cuentaDeVenta, huellaOperacion } = require('../../services/cuentaCorrienteVentas');

// ── Asegurar tablas ───────────────────────────────────────────
async function asegurarTablas() {
  try {
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
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS modo_iva         TEXT DEFAULT 'off'`).catch(() => {});
    await pool.query(`ALTER TABLE ventas ADD COLUMN IF NOT EXISTS condicion_iva    TEXT DEFAULT 'Consumidor Final'`).catch(() => {});

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
router.get('/:cliente_id', verificarClienteId, async (req, res) => {
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
router.post('/:cliente_id', verificarClienteId, async (req, res) => {
  const { cliente_id } = req.params;
  const {
    comprador_nombre = '', comprador_cuit = '',
    comprador_telefono = '', comprador_email = '',
    comprador_direccion = '', comprador_ciudad = '',
    condicion_iva = 'Consumidor Final',
    items = [],
    va_a_cuenta_corriente = false,
    observaciones = '',
    descuento_global = 0,
    recargo_global   = 0,
    precio_con_iva   = true,
    forma_pago       = 'efectivo',
    monto_recibido   = 0,
    vuelto           = 0,
    modo_iva         = 'off',
    cuenta_corriente_cliente_id = null,
    presupuesto_origen_id = null,
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'La venta debe tener al menos un ítem' });
  }
  if (forma_pago === 'cuenta_corriente' && !va_a_cuenta_corriente) {
    return res.status(400).json({ mensaje: 'Activá la cuenta corriente del cliente antes de usar esa forma de pago' });
  }
  const formaPagoFinal = va_a_cuenta_corriente ? 'cuenta_corriente' : forma_pago;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    await bloquearOperacion(client, cliente_id);
    const operacionId = String(req.headers['x-operacion-id'] || '');
    const referenciaOperacion = operacionId ? 'cc-venta:' + operacionId + ':' + huellaOperacion(req.body) : '';
    if (operacionId && !/^[a-zA-Z0-9_-]{16,100}$/.test(operacionId)) {
      throw fallo('Identificador de operación inválido.');
    }
    if (va_a_cuenta_corriente && operacionId) {
      const previa = await client.query(
        `SELECT v.id, v.numero_completo, m.referencia FROM movimientos_cuentas_corrientes m
         JOIN ventas v ON v.id=m.venta_id AND v.cliente_id=m.cliente_id
         WHERE m.cliente_id=$1 AND m.tipo='venta' AND split_part(m.referencia, ':', 1)='cc-venta'
           AND split_part(m.referencia, ':', 2)=$2`,
        [cliente_id, operacionId]);
      if (previa.rows[0]) {
        if (previa.rows[0].referencia !== referenciaOperacion) throw fallo('Esta venta ya se registró con otros datos. Revisá el comprobante antes de iniciar otra.', 409);
        await client.query('COMMIT');
        return res.json({ ok: true, venta_id: previa.rows[0].id, numero_completo: previa.rows[0].numero_completo, repetida: true });
      }
    }
    const cuentaCorrienteSeleccionada = va_a_cuenta_corriente
      ? await resolverCuentaVenta(client, cliente_id, req.body) : null;

    if (presupuesto_origen_id) {
      const presupuestoRes = await client.query(
        `SELECT id, convertido_a_venta, venta_id
         FROM presupuestos
         WHERE id = $1 AND cliente_id = $2
         FOR UPDATE`,
        [presupuesto_origen_id, cliente_id]
      );
      if (!presupuestoRes.rows[0]) {
        const error = new Error('Presupuesto de origen no encontrado');
        error.statusCode = 404;
        throw error;
      }
      if (presupuestoRes.rows[0].convertido_a_venta) {
        const error = new Error('Este presupuesto ya fue convertido a venta');
        error.statusCode = 409;
        throw error;
      }
    }

    const sucursalVentaId = await resolverSucursalVenta(client, cliente_id, req.body.sucursal_id ?? null);

    // 1. Número correlativo por cliente
    const numRes = await client.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
       FROM ventas WHERE cliente_id = $1`,
      [cliente_id]
    );
    const numero         = parseInt(numRes.rows[0].siguiente, 10);
    const numero_completo = `V-${String(numero).padStart(5, '0')}`;

    // 2. Calcular totales — función compartida (espejo de calcTotalesNew del frontend)
    const modoIvaValidado = (['off','agregar','discriminar'].includes(modo_iva) ? modo_iva : 'discriminar');
    const calc = calcularTotalesIVA(items, descuento_global, recargo_global, modoIvaValidado);

    const sumaSubtotales = calc.sumaSubtotales;
    const iva_total      = calc.ivaTotal;
    const total_venta    = calc.total;

    const itemsCalculados = items.map((it, idx) => ({
      ...it,
      cantidad: parseFloat(it.cantidad) || 0,
      precio:   parseFloat(it.precio_unitario) || 0,
      dto_pct:  parseFloat(it.descuento_porcentaje) || 0,
      iva_pct:  parseFloat(it.alicuota_iva),
      orden:    idx + 1,
    }));
    // Validar IDs antes de insertar detalles: las FK reales no permiten
    // productos inexistentes, y cada producto debe ser del mismo negocio.
    for (const it of itemsCalculados) {
      if (!it.es_libre && it.producto_id) {
        const producto = await client.query('SELECT id FROM productos_propios WHERE id=$1 AND cliente_id=$2 FOR UPDATE', [it.producto_id, cliente_id]);
        if (!producto.rows[0]) throw fallo('Uno de los productos no existe en este negocio. No se guardó la venta.');
      }
    }
    // 3. INSERT venta
    const ventaRes = await client.query(
      `INSERT INTO ventas
         (cliente_id, numero, numero_completo, prefijo, tipo_comprobante,
          comprador_nombre, comprador_cuit,
          comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad,
          subtotal, iva_monto, total, saldo,
          estado, cobrada, anulada,
          va_a_cuenta_corriente, observaciones,
          descuento_global, recargo_global, precio_con_iva,
          forma_pago, monto_recibido, vuelto, modo_iva, condicion_iva,
          fecha, creado_en, modificado_en, sucursal_id)
       VALUES ($1,$2,$3,'V','VENTA',$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$22,$23,false,$13,$14,$15,$16,$17,$18,$19,$20,$21,$24,now(),now(),now(),$25)
       RETURNING id`,
      [
        cliente_id, numero, numero_completo,
        comprador_nombre, comprador_cuit,
        comprador_telefono, comprador_email, comprador_direccion, comprador_ciudad,
        sumaSubtotales.toFixed(4), iva_total.toFixed(4), total_venta.toFixed(4),
        va_a_cuenta_corriente, observaciones,
        parseFloat(descuento_global) || 0, parseFloat(recargo_global) || 0, (modoIvaValidado === 'discriminar'),
        formaPagoFinal,
        va_a_cuenta_corriente ? 0 : (parseFloat(monto_recibido) || 0),
        va_a_cuenta_corriente ? 0 : (parseFloat(vuelto) || 0),
        modoIvaValidado,
        va_a_cuenta_corriente ? 'pendiente' : 'cobrada',
        !va_a_cuenta_corriente,
        condicion_iva,
        sucursalVentaId,
      ]
    );
    const venta_id = ventaRes.rows[0].id;
    await client.query('UPDATE ventas SET saldo=$1 WHERE id=$2 AND cliente_id=$3',
      [va_a_cuenta_corriente ? total_venta.toFixed(4) : '0', venta_id, cliente_id]);

    // 4. INSERT items + descontar stock
    for (let i = 0; i < itemsCalculados.length; i++) {
      const it   = itemsCalculados[i];
      const det  = calc.itemsDetalle[i];
      const dto_monto  = it.precio * it.cantidad * (it.dto_pct / 100);
      const neto_item  = det.neto_ajustado;
      const iva_item   = det.iva_monto;
      const total_item = det.total_item;

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
          it.dto_pct, dto_monto.toFixed(4),
          it.iva_pct, iva_item.toFixed(4),
          neto_item.toFixed(4), total_item.toFixed(4),
          it.orden,
        ]
      );

      // Descontar stock de la venta, dentro de la misma transacción
      if (!it.es_libre && it.producto_id) {
        const stPrev = await client.query(
          `SELECT COALESCE(stock_actual, 0) AS stock
           FROM productos_propios
           WHERE id=$1 AND cliente_id=$2
           FOR UPDATE`,
          [it.producto_id, cliente_id]
        );
        if (!stPrev.rows[0]) {
          const error = new Error(`Producto ${it.producto_id} no encontrado para este cliente`);
          error.statusCode = 400;
          throw error;
        }
        const stockAnterior = parseFloat(stPrev.rows[0]?.stock) || 0;
        await client.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [it.cantidad, it.producto_id, cliente_id]
        );
        await client.query(
          `INSERT INTO stock_movimientos
             (cliente_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
              motivo, referencia_tipo, referencia_id, creado_en, sucursal_id, venta_id)
           VALUES ($1,$2,'venta',$3,$4,$5,'Venta','venta',$6,now(),$7,$6)`,
          [cliente_id, it.producto_id, it.cantidad, stockAnterior, stockAnterior - it.cantidad, venta_id, sucursalVentaId]
        );
      }
    }

    // 5. Movimiento cuenta corriente (tabla nueva)
    if (va_a_cuenta_corriente) {
      const cc_id = cuentaCorrienteSeleccionada.id;
      const saldoActualizado = await client.query(
        `UPDATE cuentas_corrientes_clientes
         SET saldo = saldo + $1::numeric,
             ultima_compra = now()
         WHERE id = $2 AND cliente_id = $3
         RETURNING saldo`,
        [total_venta.toFixed(4), cc_id, cliente_id]
      );

      // 3. Insertar movimiento en tabla nueva
      await client.query(
        `INSERT INTO movimientos_cuentas_corrientes
           (cuenta_corriente_id, cliente_id, tipo,
            debe, haber, saldo_acumulado,
            descripcion, numero_comprobante,
            venta_id, estado, referencia)
         VALUES ($1,$2,'venta',$3,0,$4,$5,$6,$7,'pendiente',$8)`,
        [
          cc_id,
          cliente_id,
          total_venta.toFixed(4),
          saldoActualizado.rows[0].saldo,
          `Venta ${numero_completo}`,
          numero_completo,
          venta_id,
          referenciaOperacion
        ]
      );

    }

    // 6. Movimiento de caja (si hay caja abierta y no es cuenta corriente)
    if (!va_a_cuenta_corriente) {
      const cajaRes = await client.query(
        `SELECT id FROM cajas
         WHERE cliente_id = $1
         AND estado = 'abierta'
         ORDER BY fecha_apertura DESC
         LIMIT 1
         FOR UPDATE`,
        [cliente_id]
      );
      if (cajaRes.rows.length > 0) {
        const caja_id = cajaRes.rows[0].id;
        await client.query(
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
            formaPagoFinal,
            `Venta ${numero_completo}`,
            numero_completo,
            venta_id
          ]
        );
        await client.query(
          `UPDATE cajas
           SET total_ingresos = total_ingresos + $1,
               saldo_actual = saldo_actual + $1
           WHERE id = $2`,
          [total_venta, caja_id]
        );
      }
    }

    if (presupuesto_origen_id) {
      const convertido = await client.query(
        `UPDATE presupuestos
         SET estado = 'convertido', convertido_a_venta = true,
             venta_id = $1, modificado_en = now()
         WHERE id = $2 AND cliente_id = $3 AND convertido_a_venta = false
         RETURNING id`,
        [venta_id, presupuesto_origen_id, cliente_id]
      );
      if (!convertido.rows[0]) {
        const error = new Error('El presupuesto ya fue convertido por otra operación');
        error.statusCode = 409;
        throw error;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, venta_id, numero_completo });

  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('POST /ventas error:', err.message);
    res.status(err.statusCode || 500).json({ mensaje: err.message || 'Error al crear venta' });
  } finally {
    if (client) client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /buscar-ean/:cliente_id/:ean — busca producto por código EAN
// ═══════════════════════════════════════════════════════════════
router.get('/buscar-ean/:cliente_id/:ean', verificarClienteId, async (req, res) => {
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
router.get('/:cliente_id/dashboard', verificarClienteId, async (req, res) => {
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
router.get('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  try {
    const { cliente_id, id } = req.params;

    const [ventaRes, itemsRes] = await Promise.all([
      pool.query(
         `SELECT v.*, (SELECT m.cuenta_corriente_id FROM movimientos_cuentas_corrientes m
           WHERE m.venta_id=v.id AND m.cliente_id=v.cliente_id AND m.tipo='venta' ORDER BY m.id LIMIT 1) AS cuenta_corriente_cliente_id
         FROM ventas v WHERE v.id = $1 AND v.cliente_id = $2`,
        [id, cliente_id]
      ),
      pool.query(
        `SELECT vi.*, p.descripcion AS producto_descripcion, p.codigo AS producto_codigo
         FROM ventas_items vi
         LEFT JOIN productos_propios p ON p.id = vi.producto_id AND p.cliente_id = vi.cliente_id
         WHERE vi.venta_id = $1 AND vi.cliente_id = $2
         ORDER BY vi.orden ASC`,
        [id, cliente_id]
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

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/cobrar — marcar venta como cobrada
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/cobrar', verificarClienteId, async (req, res) => {
  let client;
  try {
    const { cliente_id, id } = req.params;
    client = await pool.connect();
    await client.query('BEGIN');
    await bloquearOperacion(client, cliente_id);
    const v = await client.query(
      'SELECT id, saldo, estado, anulada, va_a_cuenta_corriente FROM ventas WHERE id=$1 AND cliente_id=$2 FOR UPDATE', [id, cliente_id]);
    if (!v.rows[0]) throw fallo('Venta no encontrada.', 404);
    const venta = v.rows[0];
    if (venta.anulada) throw fallo('No se puede cobrar una venta anulada.');
    if (venta.estado === 'cobrada') throw fallo('La venta ya está cobrada.', 409);
    if (!venta.va_a_cuenta_corriente) throw fallo('Esta venta no tiene deuda en cuenta corriente.', 409);
    const cuentaId = await cuentaDeVenta(client, cliente_id, id);
    const medio = req.body?.medio_pago || 'efectivo';
    if (!['efectivo','transferencia','tarjeta_debito','tarjeta_credito','otro'].includes(medio)) throw fallo('Seleccioná el medio de pago recibido.');
    const resultado = await registrarCobroCliente(client, cliente_id, {
      cuenta_corriente_id: cuentaId, venta_id: id, monto_total: venta.saldo,
      medios_pago: [{ tipo: medio, monto: venta.saldo }], observaciones: 'Cobro desde Ventas'
    }, String(req.headers['x-operacion-id'] || ''));
    await client.query('COMMIT');
    res.json(resultado);
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    res.status(err.statusCode || 500).json({ mensaje: err.message });
  } finally { if (client) client.release(); }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id/anular — anular venta
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id/anular', verificarClienteId, async (req, res) => {
  let client;
  try {
    const { cliente_id, id } = req.params;
    client = await pool.connect();
    await client.query('BEGIN');
    await bloquearOperacion(client, cliente_id);

    const venta = await client.query(
      `SELECT id, estado, anulada, numero_completo, total, sucursal_id,
              va_a_cuenta_corriente,
              comprador_cuit, comprador_nombre
       FROM ventas
       WHERE id=$1 AND cliente_id=$2
       FOR UPDATE`,
      [id, cliente_id]
    );
    if (!venta.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ mensaje: 'Venta no encontrada' });
    }
    const v = venta.rows[0];
    if (v.anulada) {
      await client.query('ROLLBACK');
      return res.status(400).json({ mensaje: 'La venta ya está anulada' });
    }

    const sucursalVentaId = await resolverSucursalVenta(client, cliente_id, v.sucursal_id, { historica: true });

    await client.query(
      `UPDATE ventas SET estado = 'anulada', anulada = true, modificado_en = now(), sucursal_id=$3
       WHERE id = $1 AND cliente_id = $2`,
      [id, cliente_id, sucursalVentaId]
    );

    if (v.va_a_cuenta_corriente) {
      const cuentaId = await cuentaDeVenta(client, cliente_id, id);
      if (cuentaId) {
        const ccLock = await client.query(
          `SELECT id, saldo FROM cuentas_corrientes_clientes
           WHERE id=$1 AND cliente_id=$2
           FOR UPDATE`,
          [cuentaId, cliente_id]
        );
        if (ccLock.rows[0]) {
          const saldoActual = parseFloat(ccLock.rows[0].saldo) || 0;
          const montoVenta = parseFloat(v.total) || 0;
          const nuevoSaldo = saldoActual - montoVenta;
          await client.query(
            `UPDATE cuentas_corrientes_clientes
             SET saldo = $1, modificado_en = now()
             WHERE id = $2 AND cliente_id = $3`,
            [nuevoSaldo.toFixed(4), cuentaId, cliente_id]
          );
          await client.query(
            `INSERT INTO movimientos_cuentas_corrientes
               (cuenta_corriente_id, cliente_id, tipo, debe, haber, saldo_acumulado,
                descripcion, numero_comprobante, venta_id, estado)
             VALUES ($1,$2,'anulacion',0,$3,$4,$5,$6,$7,'procesado')`,
            [cuentaId, cliente_id, montoVenta.toFixed(4), nuevoSaldo.toFixed(4),
             `Anulación ${v.numero_completo}`, v.numero_completo, id]
          );
        }
      }
    }

    const itemsRes = await client.query(
      `SELECT producto_id, cantidad FROM ventas_items
       WHERE venta_id=$1 AND cliente_id=$2 AND producto_id IS NOT NULL`,
      [id, cliente_id]
    );
    for (const it of itemsRes.rows) {
      const stPrev = await client.query(
        `SELECT COALESCE(stock_actual, 0) AS stock FROM productos_propios
         WHERE id=$1 AND cliente_id=$2
         FOR UPDATE`,
        [it.producto_id, cliente_id]
      );
      if (stPrev.rows[0]) {
        const stockAnterior = parseFloat(stPrev.rows[0].stock) || 0;
        await client.query(
          `UPDATE productos_propios
           SET stock_actual = COALESCE(stock_actual, 0) + $1, modificado_en = now()
           WHERE id = $2 AND cliente_id = $3`,
          [it.cantidad, it.producto_id, cliente_id]
        );
        await client.query(
          `INSERT INTO stock_movimientos
             (cliente_id, producto_id, tipo, cantidad, stock_anterior, stock_posterior,
              motivo, referencia_tipo, referencia_id, creado_en, sucursal_id, venta_id)
           VALUES ($1,$2,'anulacion',$3,$4,$5,'Anulación de venta','venta',$6,now(),$7,$6)`,
          [cliente_id, it.producto_id, it.cantidad, stockAnterior, stockAnterior + Number(it.cantidad), id, sucursalVentaId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('PUT anular error:', err.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  } finally {
    if (client) client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// PUT /:cliente_id/:id — editar venta pendiente
// ═══════════════════════════════════════════════════════════════
router.put('/:cliente_id/:id', verificarClienteId, async (req, res) => {
  const { cliente_id, id } = req.params;
  const {
    comprador_nombre = '', comprador_cuit = '',
    comprador_telefono = '', comprador_email = '',
    comprador_direccion = '', comprador_ciudad = '',
    items = [],
    observaciones = '',
    descuento_global = 0,
    recargo_global   = 0,
    precio_con_iva   = true,
    forma_pago       = 'efectivo',
    monto_recibido   = 0,
    vuelto           = 0,
    modo_iva         = 'off',
  } = req.body;

  if (!items.length) {
    return res.status(400).json({ mensaje: 'La venta debe tener al menos un ítem' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await bloquearOperacion(client, cliente_id);
    const check = await client.query(
      `SELECT id, estado, anulada, total, saldo, va_a_cuenta_corriente FROM ventas WHERE id=$1 AND cliente_id=$2 FOR UPDATE`,
      [id, cliente_id]
    );
    if (!check.rows[0]) throw fallo('Venta no encontrada', 404);
    if (check.rows[0].anulada) throw fallo('No se puede editar una venta anulada');
    if (check.rows[0].estado !== 'pendiente') throw fallo('Solo se pueden editar ventas pendientes');

    const modoIvaValidado = (['off','agregar','discriminar'].includes(modo_iva) ? modo_iva : 'discriminar');
    const calc = calcularTotalesIVA(items, descuento_global, recargo_global, modoIvaValidado);

    const sumaSubtotales = calc.sumaSubtotales;
    const iva_total      = calc.ivaTotal;
    const total_venta    = calc.total;

    const itemsCalculados = items.map((it, idx) => ({
      ...it,
      cantidad: parseFloat(it.cantidad) || 0,
      precio:   parseFloat(it.precio_unitario) || 0,
      dto_pct:  parseFloat(it.descuento_porcentaje) || 0,
      iva_pct:  parseFloat(it.alicuota_iva),
      orden:    idx + 1,
    }));

    const anterior = check.rows[0];
    const cuentaId = anterior.va_a_cuenta_corriente ? await cuentaDeVenta(client, cliente_id, id) : null;
    if (cuentaId && req.body.cuenta_corriente_cliente_id != null && Number(req.body.cuenta_corriente_cliente_id) !== Number(cuentaId)) {
      throw fallo('Esta venta ya tiene un deudor registrado. No se cambió la cuenta; elegí la cuenta original para editarla.', 409);
    }
    const pagado = Math.max(0, Number(anterior.total) - Number(anterior.saldo));
    const saldoPendiente = Math.max(0, total_venta - pagado);
    if (cuentaId) {
      await bloquearCuenta(client, cliente_id, cuentaId);
      const diferencia = total_venta - Number(anterior.total);
      if (diferencia !== 0) {
        const cuenta = await client.query(
          'UPDATE cuentas_corrientes_clientes SET saldo=saldo+$1::numeric, modificado_en=now() WHERE id=$2 AND cliente_id=$3 RETURNING saldo',
          [diferencia.toFixed(4), cuentaId, cliente_id]);
        await client.query(
          `INSERT INTO movimientos_cuentas_corrientes
           (cuenta_corriente_id,cliente_id,tipo,debe,haber,saldo_acumulado,descripcion,venta_id,estado)
           VALUES($1,$2,'ajuste',$3,$4,$5,'Edición de venta pendiente',$6,'procesado')`,
          [cuentaId, cliente_id, Math.max(0,diferencia).toFixed(4), Math.max(0,-diferencia).toFixed(4), cuenta.rows[0].saldo, id]);
      }
    }

    // Revertir stock de items anteriores
    const oldItems = await client.query(
      'SELECT producto_id, cantidad FROM ventas_items WHERE venta_id=$1 AND cliente_id=$2 AND producto_id IS NOT NULL',
      [id, cliente_id]
    );
    for (const oi of oldItems.rows) {
      await client.query(
        `UPDATE productos_propios SET stock_actual = COALESCE(stock_actual, 0) + $1, modificado_en = now() WHERE id = $2 AND cliente_id = $3`,
        [oi.cantidad, oi.producto_id, cliente_id]
      );
    }

    // Actualizar venta
    await client.query(
      `UPDATE ventas SET
         comprador_nombre=$1, comprador_cuit=$2,
         comprador_telefono=$3, comprador_email=$4,
         comprador_direccion=$5, comprador_ciudad=$6,
         subtotal=$7, iva_monto=$8, total=$9, saldo=$20,
         descuento_global=$10, recargo_global=$11,
         precio_con_iva=$12, modo_iva=$13,
         forma_pago=$14, monto_recibido=$15, vuelto=$16,
         observaciones=$17, modificado_en=now()
       WHERE id=$18 AND cliente_id=$19`,
      [
        comprador_nombre, comprador_cuit,
        comprador_telefono, comprador_email,
        comprador_direccion, comprador_ciudad,
        sumaSubtotales.toFixed(4), iva_total.toFixed(4), total_venta.toFixed(4),
        parseFloat(descuento_global) || 0, parseFloat(recargo_global) || 0,
        (modoIvaValidado === 'discriminar'), modoIvaValidado,
        forma_pago,
        parseFloat(monto_recibido) || 0,
        parseFloat(vuelto) || 0,
        observaciones,
        id, cliente_id, saldoPendiente.toFixed(4),
      ]
    );

    // Reemplazar items
    await client.query(`DELETE FROM ventas_items WHERE venta_id=$1 AND cliente_id=$2`, [id, cliente_id]);
    for (let i = 0; i < itemsCalculados.length; i++) {
      const it  = itemsCalculados[i];
      const det = calc.itemsDetalle[i];
      const dto_monto  = it.precio * it.cantidad * (it.dto_pct / 100);
      const neto_item  = det.neto_ajustado;
      const iva_item   = det.iva_monto;
      const total_item = det.total_item;

      await client.query(
        `INSERT INTO ventas_items
           (venta_id, cliente_id, producto_id, es_libre, descripcion_libre,
            cantidad, precio_unitario, descuento_porcentaje, descuento_monto,
            alicuota_iva, iva_monto, subtotal, total, orden, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())`,
        [
          id, cliente_id,
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

      // Descontar stock nuevo
      if (!it.es_libre && it.producto_id) {
        const stockActualizado = await client.query(
          `UPDATE productos_propios SET stock_actual = COALESCE(stock_actual, 0) - $1, modificado_en=now() WHERE id=$2 AND cliente_id=$3`,
          [it.cantidad, it.producto_id, cliente_id]
        );
        if (!stockActualizado.rowCount) throw fallo('No se encontró un producto de esta venta para el negocio. No se guardó la edición.');
      }
    }

    // Mantener pendiente mientras no se cobre. Cambiar el medio no inventa dinero.
    if (cuentaId) {
      await client.query(`UPDATE ventas SET forma_pago='cuenta_corriente', monto_recibido=0, vuelto=0,
        cobrada=(saldo<=0.005), estado=CASE WHEN saldo<=0.005 THEN 'cobrada' ELSE 'pendiente' END
        WHERE id=$1 AND cliente_id=$2`, [id,cliente_id]);
      if (forma_pago !== 'cuenta_corriente' && saldoPendiente > 0) {
        await registrarCobroCliente(client, cliente_id, {
          cuenta_corriente_id:cuentaId,venta_id:id,monto_total:saldoPendiente,
          medios_pago:[{tipo:forma_pago,monto:saldoPendiente}],observaciones:'Cobro al editar venta'
        }, String(req.headers['x-operacion-id'] || ''));
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, venta_id: parseInt(id) });
  } catch (err) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    console.error('PUT editar venta error:', err.message);
    res.status(err.statusCode || 500).json({ mensaje: err.message || 'Error al editar venta' });
  } finally { if (client) client.release(); }
});

module.exports = router;
