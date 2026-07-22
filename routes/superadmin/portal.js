const express = require('express');
const router = express.Router();
const pool = require('../../db');

// Agregar columnas de módulos si no existen en la tabla mayoristas
;(async () => {
  const cols = [
    ['habilitar_cheques', 'BOOLEAN DEFAULT false'],
    ['habilitar_caja',    'BOOLEAN DEFAULT false'],
    ['habilitar_ventas',  'BOOLEAN DEFAULT false'],
    ['habilitar_remitos',  'BOOLEAN DEFAULT false'],
    ['habilitar_stock',    'BOOLEAN DEFAULT false'],
    ['habilitar_compras',          'BOOLEAN DEFAULT false'],
    ['habilitar_autos',            'BOOLEAN DEFAULT false'],
    ['habilitar_cc_proveedores',   'BOOLEAN DEFAULT false'],
    ['habilitar_catalogo',         'BOOLEAN DEFAULT false'],
  ];
  for (const [col, def] of cols) {
    await pool.query(`ALTER TABLE mayoristas ADD COLUMN IF NOT EXISTS ${col} ${def}`).catch(() => {});
  }
})();

// Middleware: verifica que el token rp_{id}_{ts} corresponde al cliente_id del request
function verificarTokenPortal(req, res, next) {
  const token = req.headers['x-roberto-token'];
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  // Formato esperado: rp_{cliente_id}_{timestamp}
  const partes = token.split('_');
  if (partes.length < 3 || partes[0] !== 'rp') {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const tokenClienteId = partes[1];
  const clienteId = req.params.cliente_id || req.params.cid;
  if (tokenClienteId !== String(clienteId)) {
    return res.status(403).json({ error: 'Token no corresponde al cliente' });
  }
  next();
}

// GET /:codigo — público, sin auth. Verifica tipo_fuente='roberto'
router.get('/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const result = await pool.query(
      `SELECT m.id AS mayorista_id, m.nombre, m.activo, m.tipo_fuente,
              m.habilitar_mensajes, m.habilitar_notificaciones, m.habilitar_banners,
              m.habilitar_analiticas, m.habilitar_ctas_ctes, m.habilitar_cotizaciones,
              m.habilitar_cheques, m.habilitar_caja,
              m.habilitar_ventas, m.habilitar_remitos, m.habilitar_stock, m.habilitar_compras, m.habilitar_autos,
              m.habilitar_cc_proveedores,
              m.habilitar_catalogo,
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
      habilitar_cheques:        !!row.habilitar_cheques,
      habilitar_caja:           !!row.habilitar_caja,
      habilitar_ventas:         !!row.habilitar_ventas,
      habilitar_remitos:        !!row.habilitar_remitos,
      habilitar_stock:          !!row.habilitar_stock,
      habilitar_compras:        !!row.habilitar_compras,
      habilitar_autos:          !!row.habilitar_autos,
      habilitar_cc_proveedores: !!row.habilitar_cc_proveedores,
      habilitar_catalogo:       !!row.habilitar_catalogo,
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
router.get('/dashboard/:cliente_id', verificarTokenPortal, async (req, res) => {
  const { cliente_id } = req.params;

  const safeQuery = async (sql, params) => {
    try {
      const r = await pool.query(sql, params);
      return r.rows[0] || {};
    } catch { return {}; }
  };

  const safeRows = async (sql, params) => {
    try {
      const r = await pool.query(sql, params);
      return r.rows;
    } catch { return []; }
  };

  const [ventas, productos, stock, cobros, ultimasVentas, chequesPendientes] = await Promise.all([
    safeQuery(
      `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0)::numeric AS monto
       FROM ventas
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
       FROM ventas
       WHERE cliente_id = $1 AND cobrada = false`,
      [cliente_id]
    ),
    safeRows(
      `SELECT id, numero, numero_completo, comprador_nombre, total, estado, fecha
       FROM ventas
       WHERE cliente_id = $1 AND fecha::date = CURRENT_DATE
       ORDER BY fecha DESC
       LIMIT 5`,
      [cliente_id]
    ),
    safeRows(
      `SELECT id, numero, banco, titular_nombre, monto, fecha_cobro, tipo
       FROM cheques
       WHERE cliente_id = $1 AND estado = 'en_cartera' AND activo = true
       ORDER BY fecha_cobro ASC
       LIMIT 20`,
      [cliente_id]
    ),
  ]);

  res.json({
    ventas_hoy_cantidad:  ventas.cantidad    ?? 0,
    ventas_hoy_monto:     Number(ventas.monto    ?? 0),
    productos_activos:    productos.cantidad  ?? 0,
    stock_bajo_minimo:    stock.cantidad      ?? 0,
    cobros_pendientes:    Number(cobros.monto ?? 0),
    ultimas_ventas:       ultimasVentas,
    cheques_pendientes:   chequesPendientes,
  });
});

module.exports = router;
