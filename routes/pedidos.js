const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/cliente/:cliente_id', async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const resultado = await pool.query(
      `SELECT p.*, 
        json_agg(json_build_object(
          'nombre', pi.nombre,
          'cantidad', pi.cantidad,
          'precio_unitario', pi.precio_unitario
        )) as items
       FROM pedidos p
       LEFT JOIN pedido_items pi ON p.id = pi.pedido_id
       WHERE p.cliente_id = $1
       GROUP BY p.id
       ORDER BY p.fecha_pedido DESC`,
      [cliente_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT p.*, c.nombre as cliente_nombre 
       FROM pedidos p
       JOIN clientes c ON p.cliente_id = c.id
       WHERE p.mayorista_id = $1 
       ORDER BY p.fecha_pedido DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { mayorista_id, cliente_id, numero_pedido, descuento, total_estimado, observaciones, tamanio_hoja, estado, items } = req.body;
    
    const pedido = await pool.query(
      `INSERT INTO pedidos (mayorista_id, cliente_id, numero_pedido, descuento, total_estimado, observaciones, tamanio_hoja, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [mayorista_id, cliente_id, numero_pedido, descuento, total_estimado, observaciones, tamanio_hoja, estado || 'pendiente']
    );

    const pedido_id = pedido.rows[0].id;

    for (const item of items) {
      await pool.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, codigo, nombre, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pedido_id, item.producto_id, item.codigo, item.nombre, item.cantidad, item.precio_unitario]
      );
    }

    res.json(pedido.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { descuento, total_estimado, observaciones, estado, items } = req.body;

    await pool.query(
      `UPDATE pedidos SET descuento=$1, total_estimado=$2, observaciones=$3, estado=$4 WHERE id=$5`,
      [descuento, total_estimado, observaciones, estado, id]
    );

    await pool.query(`DELETE FROM pedido_items WHERE pedido_id=$1`, [id]);

    for (const item of items) {
      await pool.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, codigo, nombre, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, item.producto_id, item.codigo, item.nombre, item.cantidad, item.precio_unitario]
      );
    }

    const resultado = await pool.query(`SELECT * FROM pedidos WHERE id=$1`, [id]);
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id/responsables', async (req, res) => {
  try {
    const { id } = req.params;
    const { responsable_preparo, responsable_controlo, responsable_facturo, fecha_envio } = req.body;
    const resultado = await pool.query(
      `UPDATE pedidos SET responsable_preparo=$1, responsable_controlo=$2, responsable_facturo=$3, fecha_envio=$4
       WHERE id=$5 RETURNING *`,
      [responsable_preparo, responsable_controlo, responsable_facturo, fecha_envio, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;