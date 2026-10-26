const express = require('express');
const pool = require('../../db');
const { verificarCualquierToken, verificarSoloSuperadmin } = require('./authMiddleware');
const { asegurarTablas } = require('../../services/auditoriaIvan');

const router = express.Router();
router.use(verificarCualquierToken);
router.use(verificarSoloSuperadmin);

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await asegurarTablas();
    const [descuentos, pedidos] = await Promise.all([
      pool.query(`
        SELECT a.mayorista_id, m.nombre AS mayorista, a.cuit, a.porcentaje,
               a.estado, a.mensaje, a.consultado_en
        FROM (
          SELECT DISTINCT ON (mayorista_id,cuit) * FROM auditoria_descuentos_ivan
          ORDER BY mayorista_id,cuit,consultado_en DESC,id DESC
        ) a
        LEFT JOIN mayoristas m ON m.id=a.mayorista_id
        ORDER BY CASE WHEN a.estado='error' THEN 0 WHEN a.estado IN ('sesion_vencida','sin_dato') THEN 1 ELSE 2 END,
                 a.consultado_en DESC
        LIMIT 300
      `),
      pool.query(`
        SELECT a.pedido_web_id, a.mayorista_id, m.nombre AS mayorista,
               a.numero_pedido, a.cliente_cuit, a.estado, a.pedido_ivan_id,
               a.mensaje, a.actualizado_en
        FROM auditoria_pedidos_ivan a
        LEFT JOIN mayoristas m ON m.id=a.mayorista_id
        ORDER BY a.actualizado_en DESC LIMIT 300
      `),
    ]);
    res.json({ descuentos: descuentos.rows, pedidos: pedidos.rows });
  } catch (error) {
    console.error('[CONTROL IVAN]:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el control de Iván' });
  }
});

router.get('/resumen', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await asegurarTablas();
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM clientes_roberto) AS total_clientes,
        (SELECT COUNT(*) FROM clientes_roberto WHERE estado='activo') AS activos,
        (SELECT COUNT(*) FROM clientes_roberto WHERE estado='prueba') AS prueba,
        (SELECT COUNT(*) FROM clientes_roberto WHERE estado='suspendido') AS suspendidos,
        (SELECT COUNT(*) FROM auditoria_pedidos_ivan WHERE estado='error') AS pedidos_ivan_error,
        (SELECT COUNT(*) FROM (
          SELECT DISTINCT ON (mayorista_id,cuit) estado FROM auditoria_descuentos_ivan
          ORDER BY mayorista_id,cuit,consultado_en DESC,id DESC
        ) ultimos WHERE estado='error') AS costos_ivan_error,
        (SELECT COUNT(*) FROM (
          SELECT DISTINCT ON (mayorista_id,cuit) estado FROM auditoria_descuentos_ivan
          ORDER BY mayorista_id,cuit,consultado_en DESC,id DESC
        ) ultimos WHERE estado='sesion_vencida') AS sesiones_ivan_vencidas
    `);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo cargar el resumen' });
  }
});

module.exports = router;
