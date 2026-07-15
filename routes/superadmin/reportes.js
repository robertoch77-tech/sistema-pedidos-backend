const express = require('express');
const router  = express.Router();
const pool    = require('../../db');
const { verificarTokenSuperAdmin } = require('./auth');

router.use(verificarTokenSuperAdmin);

// ── helpers ───────────────────────────────────────────────────
function n(v) { return parseFloat(v) || 0; }

function periodoAnterior(desde, hasta) {
  const d1 = new Date(desde);
  const d2 = new Date(hasta);
  const diff = d2 - d1;
  const ad = new Date(d1 - diff - 86400000);
  const ah = new Date(d1 - 86400000);
  return { desde: ad.toISOString().slice(0, 10), hasta: ah.toISOString().slice(0, 10) };
}

// ═══════════════════════════════════════════════════════════════
// GET /ventas/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.get('/ventas/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    fecha_desde   = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    fecha_hasta   = new Date().toISOString().slice(0, 10),
    agrupar_por   = 'dia',
    vendedor_id,
  } = req.query;

  try {
    // Filtro vendedor
    const vendedorFiltro = vendedor_id ? `AND v.vendedor_id = ${parseInt(vendedor_id)}` : '';

    // Resumen período actual
    const resQ = await pool.query(`
      SELECT
        COUNT(*)                           AS total_ventas,
        COALESCE(SUM(v.total), 0)          AS total_monto,
        COALESCE(AVG(v.total), 0)          AS ticket_promedio
      FROM ventas v
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
        ${vendedorFiltro}
    `, [cliente_id, fecha_desde, fecha_hasta]);

    // Período anterior para variación
    const ant = periodoAnterior(fecha_desde, fecha_hasta);
    const antQ = await pool.query(`
      SELECT COALESCE(SUM(v.total), 0) AS total_monto_anterior
      FROM ventas v
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
        ${vendedorFiltro}
    `, [cliente_id, ant.desde, ant.hasta]);

    const montoAct = n(resQ.rows[0].total_monto);
    const montoAnt = n(antQ.rows[0].total_monto_anterior);
    const variacion = montoAnt === 0 ? null
      : parseFloat(((montoAct - montoAnt) / montoAnt * 100).toFixed(2));

    // Por período
    const truncMap = { dia: 'day', semana: 'week', mes: 'month' };
    const trunc    = truncMap[agrupar_por] || 'day';
    const periodoQ = await pool.query(`
      SELECT
        DATE_TRUNC($4, v.fecha)::DATE  AS fecha,
        COUNT(*)                        AS cantidad,
        COALESCE(SUM(v.total), 0)       AS monto
      FROM ventas v
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
        ${vendedorFiltro}
      GROUP BY 1
      ORDER BY 1
    `, [cliente_id, fecha_desde, fecha_hasta, trunc]);

    // Por producto
    const prodQ = await pool.query(`
      SELECT
        p.descripcion,
        SUM(vi.cantidad)                   AS cantidad,
        SUM(vi.cantidad * vi.precio_unit)  AS monto,
        RANK() OVER (ORDER BY SUM(vi.cantidad * vi.precio_unit) DESC) AS ranking
      FROM ventas v
      JOIN ventas_items vi ON vi.venta_id = v.id
      LEFT JOIN productos p ON p.id = vi.producto_id
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
        ${vendedorFiltro}
      GROUP BY p.descripcion
      ORDER BY monto DESC
      LIMIT 20
    `, [cliente_id, fecha_desde, fecha_hasta]);

    // Por cliente final
    const cliQ = await pool.query(`
      SELECT
        COALESCE(cf.nombre, v.cliente_nombre, 'Sin nombre') AS nombre,
        COUNT(DISTINCT v.id)   AS cantidad,
        SUM(v.total)           AS monto,
        RANK() OVER (ORDER BY SUM(v.total) DESC) AS ranking
      FROM ventas v
      LEFT JOIN clientes_finales cf ON cf.id = v.cliente_final_id
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
        ${vendedorFiltro}
      GROUP BY 1
      ORDER BY monto DESC
      LIMIT 20
    `, [cliente_id, fecha_desde, fecha_hasta]);

    res.json({
      resumen: {
        total_ventas:        parseInt(resQ.rows[0].total_ventas),
        total_monto:         n(resQ.rows[0].total_monto),
        ticket_promedio:     n(resQ.rows[0].ticket_promedio),
        variacion_vs_anterior: variacion,
      },
      por_periodo:  periodoQ.rows.map(r => ({ fecha: r.fecha, cantidad: parseInt(r.cantidad), monto: n(r.monto) })),
      por_producto: prodQ.rows.map(r => ({ descripcion: r.descripcion, cantidad: n(r.cantidad), monto: n(r.monto), ranking: parseInt(r.ranking) })),
      por_cliente:  cliQ.rows.map(r => ({ nombre: r.nombre, cantidad: parseInt(r.cantidad), monto: n(r.monto), ranking: parseInt(r.ranking) })),
    });
  } catch (err) {
    console.error('Reportes ventas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /stock/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.get('/stock/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const { proveedor_id, rubro } = req.query;

  try {
    let filtros = '';
    const params = [cliente_id];
    if (proveedor_id) { params.push(parseInt(proveedor_id)); filtros += ` AND p.proveedor_id = $${params.length}`; }
    if (rubro)        { params.push(rubro);                   filtros += ` AND p.rubro = $${params.length}`; }

    // Resumen valorizado
    const resQ = await pool.query(`
      SELECT
        COUNT(*)                                    AS total_productos,
        COALESCE(SUM(p.stock), 0)                  AS total_unidades,
        COALESCE(SUM(p.stock * p.precio_costo), 0) AS valor_costo,
        COALESCE(SUM(p.stock * p.precio), 0)       AS valor_venta
      FROM productos p
      WHERE p.cliente_id = $1 AND p.activo = true ${filtros}
    `, params);

    const vc = n(resQ.rows[0].valor_costo);
    const vv = n(resQ.rows[0].valor_venta);
    const margen_potencial = vc === 0 ? 0 : parseFloat(((vv - vc) / vc * 100).toFixed(2));

    // Bajo mínimo
    const minQ = await pool.query(`
      SELECT p.descripcion AS producto, p.stock, p.stock_minimo AS minimo,
             (p.stock_minimo - p.stock) AS diferencia
      FROM productos p
      WHERE p.cliente_id = $1 AND p.activo = true
        AND p.stock_minimo IS NOT NULL AND p.stock < p.stock_minimo
        ${filtros}
      ORDER BY diferencia DESC
      LIMIT 50
    `, params);

    // Sin stock
    const sinQ = await pool.query(`
      SELECT p.descripcion AS producto
      FROM productos p
      WHERE p.cliente_id = $1 AND p.activo = true AND p.stock = 0 ${filtros}
      ORDER BY p.descripcion
      LIMIT 50
    `, params);

    // Por proveedor
    const provQ = await pool.query(`
      SELECT
        COALESCE(pr.nombre, 'Sin proveedor')        AS proveedor,
        COUNT(*)                                     AS productos,
        COALESCE(SUM(p.stock * p.precio_costo), 0)  AS valor
      FROM productos p
      LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
      WHERE p.cliente_id = $1 AND p.activo = true ${filtros}
      GROUP BY 1 ORDER BY valor DESC LIMIT 20
    `, params);

    // Por rubro
    const rubroQ = await pool.query(`
      SELECT
        COALESCE(p.rubro, 'Sin rubro')              AS rubro,
        COUNT(*)                                     AS productos,
        COALESCE(SUM(p.stock * p.precio_costo), 0)  AS valor
      FROM productos p
      WHERE p.cliente_id = $1 AND p.activo = true ${filtros}
      GROUP BY 1 ORDER BY valor DESC LIMIT 20
    `, params);

    // Rotación (ventas último mes)
    const rotQ = await pool.query(`
      SELECT
        p.descripcion   AS producto,
        COALESCE(SUM(vi.cantidad), 0)  AS ventas_mes,
        p.stock                         AS stock_actual,
        CASE WHEN COALESCE(SUM(vi.cantidad), 0) = 0 THEN NULL
             ELSE ROUND(p.stock / (SUM(vi.cantidad) / 30.0), 1)
        END AS dias_cobertura
      FROM productos p
      LEFT JOIN ventas_items vi ON vi.producto_id = p.id
        AND vi.creado_en >= NOW() - INTERVAL '30 days'
      WHERE p.cliente_id = $1 AND p.activo = true ${filtros}
      GROUP BY p.id, p.descripcion, p.stock
      ORDER BY ventas_mes DESC
      LIMIT 30
    `, params);

    res.json({
      resumen: {
        total_productos:   parseInt(resQ.rows[0].total_productos),
        total_unidades:    n(resQ.rows[0].total_unidades),
        valor_costo:       n(resQ.rows[0].valor_costo),
        valor_venta:       n(resQ.rows[0].valor_venta),
        margen_potencial,
      },
      bajo_minimo:   minQ.rows.map(r => ({ producto: r.producto, stock: n(r.stock), minimo: n(r.minimo), diferencia: n(r.diferencia) })),
      sin_stock:     sinQ.rows.map(r => ({ producto: r.producto })),
      por_proveedor: provQ.rows.map(r => ({ proveedor: r.proveedor, productos: parseInt(r.productos), valor: n(r.valor) })),
      por_rubro:     rubroQ.rows.map(r => ({ rubro: r.rubro, productos: parseInt(r.productos), valor: n(r.valor) })),
      rotacion:      rotQ.rows.map(r => ({ producto: r.producto, ventas_mes: n(r.ventas_mes), stock_actual: n(r.stock_actual), dias_cobertura: r.dias_cobertura ? n(r.dias_cobertura) : null })),
    });
  } catch (err) {
    console.error('Reportes stock:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /iva/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.get('/iva/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const { periodo = new Date().toISOString().slice(0, 7) } = req.query; // YYYY-MM

  const fechaDesde = `${periodo}-01`;
  const fechaHasta = new Date(new Date(fechaDesde).getFullYear(), new Date(fechaDesde).getMonth() + 1, 0)
    .toISOString().slice(0, 10);

  try {
    // IVA ventas — desde arca_comprobantes si existe, sino estimar de ventas
    const ivaVentasQ = await pool.query(`
      SELECT
        COALESCE(SUM(importe_neto_105), 0)   AS neto_105,
        COALESCE(SUM(importe_iva_105), 0)    AS iva_105,
        COALESCE(SUM(importe_neto_21), 0)    AS neto_21,
        COALESCE(SUM(importe_iva_21), 0)     AS iva_21,
        COALESCE(SUM(importe_neto_27), 0)    AS neto_27,
        COALESCE(SUM(importe_iva_27), 0)     AS iva_27
      FROM arca_comprobantes
      WHERE cliente_id = $1
        AND DATE(fecha_emision) BETWEEN $2 AND $3
        AND estado <> 'anulada'
    `, [cliente_id, fechaDesde, fechaHasta]).catch(() => ({ rows: [{}] }));

    // Si no hay arca_comprobantes, estimar de ventas (21% por defecto)
    const ventasEstQ = await pool.query(`
      SELECT COALESCE(SUM(v.total), 0) AS total
      FROM ventas v
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
    `, [cliente_id, fechaDesde, fechaHasta]);

    const row = ivaVentasQ.rows[0] || {};
    let neto21v = n(row.neto_21), iva21v = n(row.iva_21);
    const neto105v = n(row.neto_105), iva105v = n(row.iva_105);
    const neto27v  = n(row.neto_27),  iva27v  = n(row.iva_27);

    // Si arca no tiene datos, estimar
    if (neto21v === 0 && iva21v === 0) {
      const totalVentas = n(ventasEstQ.rows[0].total);
      neto21v = parseFloat((totalVentas / 1.21).toFixed(2));
      iva21v  = parseFloat((totalVentas - neto21v).toFixed(2));
    }

    const totalNetoV = neto105v + neto21v + neto27v;
    const totalIvaV  = iva105v  + iva21v  + iva27v;

    // IVA compras — desde comprobantes_compra si existe, sino estimar
    const ivaComprasQ = await pool.query(`
      SELECT
        COALESCE(SUM(neto_105), 0)   AS neto_105,
        COALESCE(SUM(iva_105), 0)    AS iva_105,
        COALESCE(SUM(neto_21), 0)    AS neto_21,
        COALESCE(SUM(iva_21), 0)     AS iva_21,
        COALESCE(SUM(neto_27), 0)    AS neto_27,
        COALESCE(SUM(iva_27), 0)     AS iva_27
      FROM comprobantes_compra
      WHERE cliente_id = $1
        AND DATE(fecha) BETWEEN $2 AND $3
        AND anulada IS NOT TRUE
    `, [cliente_id, fechaDesde, fechaHasta]).catch(() => ({ rows: [{}] }));

    const rowc = ivaComprasQ.rows[0] || {};
    const neto21c  = n(rowc.neto_21),  iva21c  = n(rowc.iva_21);
    const neto105c = n(rowc.neto_105), iva105c = n(rowc.iva_105);
    const neto27c  = n(rowc.neto_27),  iva27c  = n(rowc.iva_27);
    const totalNetoC = neto105c + neto21c + neto27c;
    const totalIvaC  = iva105c  + iva21c  + iva27c;

    const saldoBruto = totalIvaV - totalIvaC;

    res.json({
      periodo:  periodo,
      ventas: {
        total_neto: totalNetoV,
        iva_105:    iva105v,
        iva_21:     iva21v,
        iva_27:     iva27v,
        total_iva:  totalIvaV,
      },
      compras: {
        total_neto: totalNetoC,
        iva_105:    iva105c,
        iva_21:     iva21c,
        iva_27:     iva27c,
        total_iva:  totalIvaC,
      },
      resultado: {
        iva_ventas:    totalIvaV,
        iva_compras:   totalIvaC,
        saldo_a_pagar: saldoBruto > 0 ? saldoBruto : 0,
        saldo_a_favor: saldoBruto < 0 ? Math.abs(saldoBruto) : 0,
      },
    });
  } catch (err) {
    console.error('Reportes IVA:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /cobranzas/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.get('/cobranzas/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    fecha_desde = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    fecha_hasta = new Date().toISOString().slice(0, 10),
  } = req.query;

  try {
    // Resumen cobros (movimientos de caja tipo ingreso / cobro)
    const resQ = await pool.query(`
      SELECT
        COALESCE(SUM(m.monto), 0) AS total_cobrado,
        COUNT(*)                   AS cantidad_cobros
      FROM caja_movimientos m
      WHERE m.cliente_id = $1
        AND m.tipo = 'ingreso'
        AND DATE(m.fecha) BETWEEN $2 AND $3
    `, [cliente_id, fecha_desde, fecha_hasta]).catch(() => ({ rows: [{ total_cobrado: 0, cantidad_cobros: 0 }] }));

    const totalCobrado = n(resQ.rows[0].total_cobrado);
    const cantidadCobros = parseInt(resQ.rows[0].cantidad_cobros) || 0;

    // Por cliente (CC movimientos tipo cobro)
    const porCliQ = await pool.query(`
      SELECT
        COALESCE(m.comprador_nombre, 'Sin identificar')  AS nombre,
        COUNT(*)                                          AS cobros,
        COALESCE(SUM(m.monto), 0)                        AS monto
      FROM caja_movimientos m
      WHERE m.cliente_id = $1
        AND m.tipo = 'ingreso'
        AND DATE(m.fecha) BETWEEN $2 AND $3
      GROUP BY 1
      ORDER BY monto DESC
      LIMIT 20
    `, [cliente_id, fecha_desde, fecha_hasta]).catch(() => ({ rows: [] }));

    // Pendiente por CC
    const pendienteQ = await pool.query(`
      SELECT
        COALESCE(cc.comprador_nombre, 'Sin nombre')  AS cliente,
        COALESCE(SUM(cc.monto), 0)                   AS monto,
        NULL                                          AS vencimiento
      FROM cuentas_corrientes_clientes_movimientos cc
      WHERE cc.cliente_id = $1
        AND cc.tipo IN ('debe','debito')
      GROUP BY cc.comprador_nombre
      HAVING SUM(cc.monto) > 0
      ORDER BY monto DESC
      LIMIT 20
    `, [cliente_id]).catch(() => ({ rows: [] }));

    // Por medio de pago (desde caja movimientos concepto)
    const medioQ = await pool.query(`
      SELECT
        COALESCE(m.medio_pago, m.concepto, 'efectivo')  AS tipo,
        COUNT(*)                                          AS cantidad,
        COALESCE(SUM(m.monto), 0)                        AS monto
      FROM caja_movimientos m
      WHERE m.cliente_id = $1
        AND m.tipo = 'ingreso'
        AND DATE(m.fecha) BETWEEN $2 AND $3
      GROUP BY 1
      ORDER BY monto DESC
    `, [cliente_id, fecha_desde, fecha_hasta]).catch(() => ({ rows: [] }));

    res.json({
      resumen: {
        total_cobrado:   totalCobrado,
        cantidad_cobros: cantidadCobros,
        promedio:        cantidadCobros > 0 ? parseFloat((totalCobrado / cantidadCobros).toFixed(2)) : 0,
      },
      por_cliente: porCliQ.rows.map(r => ({
        nombre:    r.nombre,
        cobros:    parseInt(r.cobros),
        monto:     n(r.monto),
        pendiente: 0,
      })),
      por_medio_pago: medioQ.rows.map(r => ({
        tipo:     r.tipo,
        cantidad: parseInt(r.cantidad),
        monto:    n(r.monto),
      })),
      pendiente_cobrar: pendienteQ.rows.map(r => ({
        cliente:     r.cliente,
        monto:       n(r.monto),
        vencimiento: r.vencimiento,
      })),
    });
  } catch (err) {
    console.error('Reportes cobranzas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /rentabilidad/:cliente_id
// ═══════════════════════════════════════════════════════════════
router.get('/rentabilidad/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;
  const {
    fecha_desde = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    fecha_hasta = new Date().toISOString().slice(0, 10),
  } = req.query;

  try {
    // Ingresos por ventas
    const ingresosQ = await pool.query(`
      SELECT COALESCE(SUM(v.total), 0) AS ventas
      FROM ventas v
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
    `, [cliente_id, fecha_desde, fecha_hasta]);

    // Egresos: compras a proveedores
    const comprasQ = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS compras
      FROM comprobantes_compra
      WHERE cliente_id = $1
        AND DATE(fecha) BETWEEN $2 AND $3
        AND anulada IS NOT TRUE
    `, [cliente_id, fecha_desde, fecha_hasta]).catch(() => ({ rows: [{ compras: 0 }] }));

    // Gastos fijos / variables desde caja
    const gastosQ = await pool.query(`
      SELECT
        tipo_gasto,
        COALESCE(SUM(monto), 0) AS total
      FROM caja_movimientos
      WHERE cliente_id = $1
        AND tipo = 'egreso'
        AND DATE(fecha) BETWEEN $2 AND $3
      GROUP BY tipo_gasto
    `, [cliente_id, fecha_desde, fecha_hasta]).catch(() => ({ rows: [] }));

    let gastosFijos = 0, gastosVariables = 0;
    for (const g of gastosQ.rows) {
      if (g.tipo_gasto === 'fijo')      gastosFijos     += n(g.total);
      else if (g.tipo_gasto === 'variable') gastosVariables += n(g.total);
      else gastosVariables += n(g.total);
    }

    const ventas    = n(ingresosQ.rows[0].ventas);
    const compras   = n(comprasQ.rows[0].compras);
    const brutoBruto = ventas - compras;
    const neto       = brutoBruto - gastosFijos - gastosVariables;

    // Por producto
    const porProdQ = await pool.query(`
      SELECT
        p.descripcion,
        SUM(vi.cantidad * vi.precio_unit)               AS ventas,
        SUM(vi.cantidad * COALESCE(p.precio_costo, 0))  AS costo,
        SUM(vi.cantidad * vi.precio_unit) - SUM(vi.cantidad * COALESCE(p.precio_costo, 0)) AS margen
      FROM ventas v
      JOIN ventas_items vi ON vi.venta_id = v.id
      LEFT JOIN productos p ON p.id = vi.producto_id
      WHERE v.cliente_id = $1
        AND v.estado NOT IN ('cancelada','anulada')
        AND DATE(v.fecha) BETWEEN $2 AND $3
      GROUP BY p.descripcion
      ORDER BY margen DESC
      LIMIT 20
    `, [cliente_id, fecha_desde, fecha_hasta]);

    // Por proveedor
    const porProvQ = await pool.query(`
      SELECT
        COALESCE(pr.nombre, 'Sin proveedor')                   AS nombre,
        COALESCE(SUM(cc.total), 0)                              AS compras,
        COALESCE(SUM(vp.ventas_prov), 0)                       AS ventas_productos
      FROM proveedores pr
      LEFT JOIN comprobantes_compra cc ON cc.proveedor_id = pr.id
        AND cc.cliente_id = $1 AND DATE(cc.fecha) BETWEEN $2 AND $3
      LEFT JOIN LATERAL (
        SELECT SUM(vi.cantidad * vi.precio_unit) AS ventas_prov
        FROM ventas_items vi
        JOIN productos p2 ON p2.id = vi.producto_id AND p2.proveedor_id = pr.id
        JOIN ventas v2 ON v2.id = vi.venta_id
        WHERE v2.cliente_id = $1
          AND v2.estado NOT IN ('cancelada','anulada')
          AND DATE(v2.fecha) BETWEEN $2 AND $3
      ) vp ON true
      WHERE pr.cliente_id = $1
      GROUP BY pr.nombre
      ORDER BY compras DESC
      LIMIT 20
    `, [cliente_id, fecha_desde, fecha_hasta]).catch(() => ({ rows: [] }));

    res.json({
      ingresos: {
        ventas: ventas,
        otros:  0,
      },
      egresos: {
        compras:          compras,
        gastos_fijos:     gastosFijos,
        gastos_variables: gastosVariables,
      },
      resultado: {
        bruto:             brutoBruto,
        neto:              neto,
        margen_bruto_pct:  ventas === 0 ? 0 : parseFloat((brutoBruto / ventas * 100).toFixed(2)),
        margen_neto_pct:   ventas === 0 ? 0 : parseFloat((neto / ventas * 100).toFixed(2)),
      },
      por_producto:  porProdQ.rows.map(r => ({
        descripcion: r.descripcion,
        ventas:  n(r.ventas),
        costo:   n(r.costo),
        margen:  n(r.margen),
      })),
      por_proveedor: porProvQ.rows.map(r => ({
        nombre:           r.nombre,
        compras:          n(r.compras),
        ventas_productos: n(r.ventas_productos),
        margen:           n(r.ventas_productos) - n(r.compras),
      })),
    });
  } catch (err) {
    console.error('Reportes rentabilidad:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
