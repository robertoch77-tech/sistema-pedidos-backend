const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM mayoristas WHERE activo = true');
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id/configuracion', async (req, res) => {
  try {
    const { id } = req.params;
    const { mostrar_precios, mostrar_stock, descuento_default, tamanio_hoja, items_por_hoja, numero_pedido_inicio } = req.body;
    const resultado = await pool.query(
      `UPDATE mayoristas SET 
        mostrar_precios=$1, mostrar_stock=$2, descuento_default=$3,
        tamanio_hoja=$4, items_por_hoja=$5, numero_pedido_inicio=$6
       WHERE id=$7 RETURNING *`,
      [mostrar_precios, mostrar_stock, descuento_default, tamanio_hoja, items_por_hoja, numero_pedido_inicio, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const hoy = new Date().toISOString().split('T')[0];

    const [pedidos_hoy, total_productos, total_clientes, pedidos_pendientes, ultimos_pedidos] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM pedidos WHERE mayorista_id=$1 AND DATE(fecha_pedido)=$2`, [id, hoy]),
      pool.query(`SELECT COUNT(*) FROM productos WHERE mayorista_id=$1`, [id]),
      pool.query(`SELECT COUNT(*) FROM clientes WHERE mayorista_id=$1`, [id]),
      pool.query(`SELECT COUNT(*) FROM pedidos WHERE mayorista_id=$1 AND estado IN ('pendiente','enviado')`, [id]),
      pool.query(`SELECT p.*, c.nombre as cliente_nombre FROM pedidos p JOIN clientes c ON p.cliente_id=c.id WHERE p.mayorista_id=$1 ORDER BY p.fecha_pedido DESC LIMIT 5`, [id])
    ]);

    res.json({
      stats: {
        pedidos_hoy: parseInt(pedidos_hoy.rows[0].count),
        total_productos: parseInt(total_productos.rows[0].count),
        total_clientes: parseInt(total_clientes.rows[0].count),
        pedidos_pendientes: parseInt(pedidos_pendientes.rows[0].count)
      },
      ultimos_pedidos: ultimos_pedidos.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;