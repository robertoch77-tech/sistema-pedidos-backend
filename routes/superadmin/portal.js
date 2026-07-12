const express = require('express');
const router = express.Router();
const pool = require('../../db');

// GET /:codigo — público, sin auth. Verifica tipo_fuente='roberto'
router.get('/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const result = await pool.query(
      `SELECT m.id AS mayorista_id, m.nombre, m.activo, m.tipo_fuente,
              m.habilitar_mensajes, m.habilitar_notificaciones, m.habilitar_banners,
              m.habilitar_analiticas, m.habilitar_ctas_ctes, m.habilitar_cotizaciones,
              c.id AS cliente_id, c.nombre_comercial, c.plan, c.estado,
              c.habilitar_sucursales, c.habilitar_empleados, c.arca_habilitado
       FROM mayoristas m
       LEFT JOIN clientes_roberto c ON c.mayorista_id = m.id
       WHERE m.codigo = $1
       LIMIT 1`,
      [codigo.trim()]
    );

    if (!result.rows[0]) return res.status(404).json({ mensaje: 'Código no encontrado' });
    const row = result.rows[0];

    if (row.tipo_fuente !== 'roberto') return res.status(403).json({ mensaje: 'No autorizado' });

    res.json({
      tipo_fuente:              'roberto',
      mayorista_id:             row.mayorista_id,
      cliente_id:               row.cliente_id,
      nombre_comercial:         row.nombre_comercial || row.nombre,
      plan:                     row.plan,
      habilitar_mensajes:       !!row.habilitar_mensajes,
      habilitar_notificaciones: !!row.habilitar_notificaciones,
      habilitar_banners:        !!row.habilitar_banners,
      habilitar_analiticas:     !!row.habilitar_analiticas,
      habilitar_ctas_ctes:      !!row.habilitar_ctas_ctes,
      habilitar_cotizaciones:   !!row.habilitar_cotizaciones,
      habilitar_sucursales:     !!row.habilitar_sucursales,
      habilitar_empleados:      !!row.habilitar_empleados,
      arca_habilitado:          !!row.arca_habilitado,
    });
  } catch (error) {
    console.error('Portal GET /:codigo error:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// GET /dashboard/:cliente_id — métricas del dashboard
router.get('/dashboard/:cliente_id', async (req, res) => {
  const { cliente_id } = req.params;

  const safeQuery = async (sql, params) => {
    try {
      const r = await pool.query(sql, params);
      return r.rows[0] || {};
    } catch { return {}; }
  };

  const [ventas, productos, stock, cobros] = await Promise.all([
    safeQuery(
      `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0)::numeric AS monto
       FROM ventas_roberto
       WHERE cliente_id = $1 AND fecha::date = CURRENT_DATE`,
      [cliente_id]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS cantidad
       FROM productos_roberto
       WHERE cliente_id = $1 AND activo = true`,
      [cliente_id]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS cantidad
       FROM stock_roberto
       WHERE cliente_id = $1 AND cantidad <= stock_minimo`,
      [cliente_id]
    ),
    safeQuery(
      `SELECT COALESCE(SUM(total), 0)::numeric AS monto
       FROM ventas_roberto
       WHERE cliente_id = $1 AND cobrada = false`,
      [cliente_id]
    ),
  ]);

  res.json({
    ventas_hoy_cantidad:  ventas.cantidad    ?? 0,
    ventas_hoy_monto:     Number(ventas.monto    ?? 0),
    productos_activos:    productos.cantidad  ?? 0,
    stock_bajo_minimo:    stock.cantidad      ?? 0,
    cobros_pendientes:    Number(cobros.monto ?? 0),
  });
});

module.exports = router;
