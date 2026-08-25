const express = require('express');
const pool = require('../../db');
const { verificarCualquierToken, verificarSoloSuperadmin } = require('./authMiddleware');
const { asegurarTablas } = require('../../services/auditoriaIvan');

const router = express.Router();
router.use(verificarCualquierToken);
router.use(verificarSoloSuperadmin);

router.get('/', async (req, res) => {
  try {
    await asegurarTablas();
    const [descuentos, pedidos] = await Promise.all([
      pool.query(`
        SELECT DISTINCT ON (a.mayorista_id, a.cuit)
               a.mayorista_id, m.nombre AS mayorista, a.cuit, a.porcentaje,
               a.estado, a.mensaje, a.consultado_en
        FROM auditoria_descuentos_ivan a
        LEFT JOIN mayoristas m ON m.id=a.mayorista_id
        ORDER BY a.mayorista_id, a.cuit, a.consultado_en DESC
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
  try {
    await asegurarTablas();
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM clientes_roberto) AS total_clientes,
        (SELECT COUNT(*) FROM clientes_roberto WHERE estado='activo') AS activos,
        (SELECT COUNT(*) FROM clientes_roberto WHERE estado='prueba') AS prueba,
        (SELECT COUNT(*) FROM clientes_roberto WHERE estado='suspendido') AS suspendidos,
        (SELECT COUNT(*) FROM auditoria_pedidos_ivan WHERE estado='error') AS pedidos_ivan_error
    `);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo cargar el resumen' });
  }
});

module.exports = router;
