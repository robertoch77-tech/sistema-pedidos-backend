const express = require('express');
const router = express.Router();
const pool = require('../db');

// Mis Pedidos del cliente
router.get('/cliente/:cuit', async (req, res) => {
  try {
    const { cuit } = req.params;
    const { mayorista_id } = req.query;
    const condiciones = ['p.cliente_cuit = $1'];
    const params = [cuit];
    if (mayorista_id) { condiciones.push('p.mayorista_id = $2'); params.push(mayorista_id); }
    const resultado = await pool.query(
      `SELECT p.*,
         COALESCE(json_agg(json_build_object(
           'codigo', pi.codigo,'nombre', pi.nombre,'rubro', pi.rubro,
           'cantidad', pi.cantidad,'precio_unitario', pi.precio_unitario
         )) FILTER (WHERE pi.id IS NOT NULL),'[]'::json) as items
       FROM pedidos_web p
       LEFT JOIN pedidos_web_items pi ON p.id = pi.pedido_id
       WHERE ${condiciones.join(' AND ')}
       GROUP BY p.id ORDER BY p.fecha_pedido DESC`, params
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error mis pedidos:', error.message);
    res.json([]);
  }
});

// Conteo de pedidos sin imprimir (para el badge)
router.get('/:mayorista_id/nuevos', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT COUNT(*) FROM pedidos_web WHERE mayorista_id=$1 AND estado='enviado'`,
      [mayorista_id]
    );
    res.json({ cantidad: parseInt(resultado.rows[0].count) });
  } catch (error) {
    res.json({ cantidad: 0 });
  }
});

// Pedidos del panel del mayorista (nunca muestra borradores del cliente)
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const { estado, fecha_desde, fecha_hasta, busqueda } = req.query;
    const condiciones = ['p.mayorista_id = $1'];
    const params = [mayorista_id];
    let i = 2;

    // Excluir siempre los borradores del cliente
    if (estado && estado !== 'todos') {
      condiciones.push(`p.estado = $${i}`); params.push(estado); i++;
    } else {
      condiciones.push(`p.estado != 'borrador'`);
    }

    if (fecha_desde) { condiciones.push(`DATE(p.fecha_pedido) >= $${i}`); params.push(fecha_desde); i++; }
    if (fecha_hasta) { condiciones.push(`DATE(p.fecha_pedido) <= $${i}`); params.push(fecha_hasta); i++; }
    if (busqueda) {
      condiciones.push(`(p.numero_pedido ILIKE $${i} OR p.cliente_nombre ILIKE $${i} OR p.cliente_cuit ILIKE $${i})`);
      params.push(`%${busqueda}%`); i++;
    }

    const resultado = await pool.query(
      `SELECT p.*,
         COALESCE(json_agg(json_build_object(
           'codigo', pi.codigo,'nombre', pi.nombre,'rubro', pi.rubro,
           'cantidad', pi.cantidad,'precio_unitario', pi.precio_unitario
         )) FILTER (WHERE pi.id IS NOT NULL),'[]'::json) as items
       FROM pedidos_web p
       LEFT JOIN pedidos_web_items pi ON p.id = pi.pedido_id
       WHERE ${condiciones.join(' AND ')}
       GROUP BY p.id ORDER BY p.fecha_pedido DESC LIMIT 200`,
      params
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error pedidos:', error.message);
    res.json([]);
  }
});

// Marcar como impreso (se llama al generar el PDF)
router.put('/:id/imprimir', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `UPDATE pedidos_web SET estado='impreso', visto_mayorista=true WHERE id=$1 RETURNING *`,
      [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Guardar pedido nuevo
router.post('/', async (req, res) => {
  try {
    const { mayorista_id, cliente_cuit, cliente_nombre, numero_pedido,
            descuento, total_estimado, observaciones, tamanio_hoja, estado, items } = req.body;
    const pedido = await pool.query(
      `INSERT INTO pedidos_web
         (mayorista_id, cliente_cuit, cliente_nombre, numero_pedido, descuento,
          total_estimado, observaciones, tamanio_hoja, estado, visto_mayorista)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [mayorista_id, cliente_cuit, cliente_nombre || '', numero_pedido,
       descuento || 0, total_estimado, observaciones || '', tamanio_hoja || 'A4',
       estado || 'borrador', false]
    );
    const pedido_id = pedido.rows[0].id;
    for (const item of items) {
      await pool.query(
        `INSERT INTO pedidos_web_items (pedido_id,producto_id,codigo,nombre,rubro,cantidad,precio_unitario)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [pedido_id, item.producto_id||null, item.codigo||'', item.nombre||'', item.rubro||'', item.cantidad, item.precio_unitario||0]
      );
    }
    // TODO: si estado === 'enviado' → enviar email al mayorista
    res.json(pedido.rows[0]);
  } catch (error) {
    console.error('Error guardando pedido:', error);
    res.status(500).json({ mensaje: 'Error al guardar el pedido' });
  }
});

// Actualizar pedido (editar borrador)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { descuento, total_estimado, observaciones, estado, items } = req.body;
    await pool.query(
      `UPDATE pedidos_web SET descuento=$1,total_estimado=$2,observaciones=$3,estado=$4 WHERE id=$5`,
      [descuento, total_estimado, observaciones, estado, id]
    );
    await pool.query(`DELETE FROM pedidos_web_items WHERE pedido_id=$1`, [id]);
    for (const item of items) {
      await pool.query(
        `INSERT INTO pedidos_web_items (pedido_id,producto_id,codigo,nombre,rubro,cantidad,precio_unitario)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, item.producto_id||null, item.codigo||'', item.nombre||'', item.rubro||'', item.cantidad, item.precio_unitario||0]
      );
    }
    // TODO: si estado === 'enviado' → enviar email al mayorista
    const resultado = await pool.query(`SELECT * FROM pedidos_web WHERE id=$1`, [id]);
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;