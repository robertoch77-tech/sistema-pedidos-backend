const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Pool } = require('pg');
const { registrarNotificacionIvan } = require('../services/notificacionesIvan');

const conexiones = {};

async function getConexionMayorista(mayorista_id) {
  if (conexiones[mayorista_id]) return conexiones[mayorista_id];
  const resultado = await pool.query(
    'SELECT db_connection FROM mayoristas WHERE id = $1',
    [mayorista_id]
  );
  if (!resultado.rows[0]?.db_connection) return null;
  const poolExterno = new Pool({
    connectionString: resultado.rows[0].db_connection,
    ssl: false
  });
  poolExterno.on('connect', (client) => {
    client.query("SET client_encoding TO 'LATIN1'");
  });
  conexiones[mayorista_id] = poolExterno;
  return poolExterno;
}

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
           'cantidad', pi.cantidad,'precio_unitario', pi.precio_unitario,
           'es_oferta', pi.es_oferta,'oferta_titulo', pi.oferta_titulo
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
           'cantidad', pi.cantidad,'precio_unitario', pi.precio_unitario,
           'es_oferta', pi.es_oferta,'oferta_titulo', pi.oferta_titulo
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
    const { mayorista_id } = req.body;
    if (!mayorista_id) return res.status(400).json({ mensaje: 'Falta mayorista_id' });
    const resultado = await pool.query(
      `UPDATE pedidos_web SET estado='impreso', visto_mayorista=true WHERE id=$1 AND mayorista_id=$2 RETURNING *`,
      [id, mayorista_id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Pedido no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Traer un pedido por ID (para editar borrador desde cliente)
router.get('/detalle/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { mayorista_id } = req.query;
    const condiciones = ['p.id=$1'];
    const params = [id];
    if (mayorista_id) { condiciones.push('p.mayorista_id=$2'); params.push(mayorista_id); }
    const resultado = await pool.query(
      `SELECT p.*,
         COALESCE(json_agg(json_build_object(
           'producto_id', pi.producto_id,'codigo', pi.codigo,'nombre', pi.nombre,'rubro', pi.rubro,
           'cantidad', pi.cantidad,'precio_unitario', pi.precio_unitario,
           'es_oferta', pi.es_oferta,'oferta_titulo', pi.oferta_titulo
         )) FILTER (WHERE pi.id IS NOT NULL),'[]'::json) as items
       FROM pedidos_web p
       LEFT JOIN pedidos_web_items pi ON p.id = pi.pedido_id
       WHERE ${condiciones.join(' AND ')}
       GROUP BY p.id`,
      params
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'No encontrado' });
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
        `INSERT INTO pedidos_web_items (pedido_id,producto_id,codigo,nombre,rubro,cantidad,precio_unitario,es_oferta,oferta_titulo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [pedido_id, item.producto_id||null, item.codigo||'', item.nombre||'', item.rubro||'', item.cantidad, item.precio_unitario||0, item.es_oferta||false, item.oferta_titulo||null]
      );
    }

    if (estado === 'enviado') {
      await registrarNotificacionIvan({
        mayoristaId: mayorista_id,
        tipo: 'pedido',
        referenciaId: pedido_id,
        clienteCuit: cliente_cuit,
        clienteNombre: cliente_nombre,
        titulo: `Pedido #${numero_pedido || pedido_id}`,
        resumen: `${cliente_nombre || cliente_cuit} - ${Array.isArray(items) ? items.length : 0} productos - $${Number(total_estimado || 0).toLocaleString('es-AR')}`,
        datos: {
          numero_pedido: numero_pedido || String(pedido_id),
          total: Number(total_estimado || 0),
          cantidad_items: Array.isArray(items) ? items.length : 0,
        },
      });
    }

    if (estado === 'enviado') {
      try {
        const cfgRes = await pool.query(
          `SELECT ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
                  ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta
           FROM mayoristas WHERE id = $1`,
          [mayorista_id]
        );
        const cfg = cfgRes.rows[0];

        if (cfg && cfg.ivan_activo) {
          const poolIvan = await getConexionMayorista(mayorista_id);

          const clienteRes = await poolIvan.query(
            `SELECT id_cliente FROM "viewClientes" WHERE doc_cliente = $1 LIMIT 1`,
            [cliente_cuit]
          );
          const fk_id_cliente = clienteRes.rows[0]?.id_cliente || null;

          if (fk_id_cliente) {
            const ahora = new Date().toISOString();

            const columnas = [
              'fec_pedido', 'fec_fac_pedido', 'nro_pedido', 'nro_suc_pedido', 'estado_pedido',
              'fec_estado_pedido', 'obs_pedido', 'es_remoto', 'porc_desc_pedido',
              'fk_id_producto_deposito', 'fk_id_operario', 'fk_id_vendedor',
              'fk_id_tipo_pedido', 'fk_id_cliente'
            ];
            const valores = [
              ahora, ahora, numero_pedido, cfg.ivan_id_sucursal, 'PENDIENTE',
              ahora, observaciones || '', true, descuento || 0,
              cfg.ivan_id_deposito, cfg.ivan_id_operario,
              cfg.ivan_id_vendedor, cfg.ivan_id_tipo_pedido, fk_id_cliente
            ];

            if (cfg.ivan_id_condicion_venta !== null && cfg.ivan_id_condicion_venta !== undefined) {
              columnas.push('fk_id_condicion_venta');
              valores.push(cfg.ivan_id_condicion_venta ? parseInt(cfg.ivan_id_condicion_venta) : null);
            }

            const placeholders = valores.map((_, i) => `$${i + 1}`).join(',');
            const pedidoIvanRes = await poolIvan.query(
              `INSERT INTO Pedidos (${columnas.join(', ')}) VALUES (${placeholders}) RETURNING *`,
              valores
            );
            const fk_id_pedido = pedidoIvanRes.rows[0].id_pedido;

            for (const item of items) {
              const itemRes = await poolIvan.query(
                `INSERT INTO Items_Pedidos
                   (can_item_pedido, porc_iva_item_pedido, imp_neto_item_pedido,
                    imp_int_item_pedido, porc_desc_item_pedido, fk_id_pedido)
                 VALUES ($1,$2,$3,0,0,$4)
                 RETURNING *`,
                [item.cantidad, cfg.ivan_porc_iva,
                 item.precio_unitario * item.cantidad, fk_id_pedido]
              );
              const fk_id_item = itemRes.rows[0].id_item_pedido;

              await poolIvan.query(
                `INSERT INTO Productos_x_Items_Pedidos (fk_id_producto, fk_id_item_pedido)
                 VALUES ($1,$2)`,
                [item.producto_id, fk_id_item]
              );
            }
          } else {
            console.warn(`Pedido ${numero_pedido}: cliente CUIT ${cliente_cuit} no encontrado en base de Ivan`);
          }
        }
      } catch (errorIvan) {
        console.error('Error replicando en Ivan:', errorIvan.message);
        return res.status(200).json({
          ...pedido.rows[0],
          ivan_error: true,
          ivan_mensaje: errorIvan.message
        });
      }
    }

    res.json(pedido.rows[0]);
  } catch (error) {
    console.error('Error guardando pedido:', error);
    res.status(500).json({ mensaje: 'Error al guardar el pedido' });
  }
});

// Actualizar fecha de entrega estimada
router.put('/:id/fecha-entrega', async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_entrega_estimada, mayorista_id } = req.body;
    if (!mayorista_id) return res.status(400).json({ mensaje: 'Falta mayorista_id' });
    const resultado = await pool.query(
      `UPDATE pedidos_web SET fecha_entrega_estimada=$1 WHERE id=$2 AND mayorista_id=$3 RETURNING *`,
      [fecha_entrega_estimada || null, id, mayorista_id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'No encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Actualizar pedido (editar borrador)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { descuento, total_estimado, observaciones, estado, mayorista_id, items } = req.body;
    if (!mayorista_id) return res.status(400).json({ mensaje: 'Falta mayorista_id' });
    const check = await pool.query(
      `SELECT id FROM pedidos_web WHERE id=$1 AND mayorista_id=$2`,
      [id, mayorista_id]
    );
    if (!check.rows[0]) return res.status(404).json({ mensaje: 'Pedido no encontrado' });
    await pool.query(
      `UPDATE pedidos_web SET descuento=$1,total_estimado=$2,observaciones=$3,estado=$4 WHERE id=$5 AND mayorista_id=$6`,
      [descuento, total_estimado, observaciones, estado, id, mayorista_id]
    );
    await pool.query(`DELETE FROM pedidos_web_items WHERE pedido_id=$1`, [id]);
    for (const item of items) {
      await pool.query(
        `INSERT INTO pedidos_web_items (pedido_id,producto_id,codigo,nombre,rubro,cantidad,precio_unitario,es_oferta,oferta_titulo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, item.producto_id||null, item.codigo||'', item.nombre||'', item.rubro||'', item.cantidad, item.precio_unitario||0, item.es_oferta||false, item.oferta_titulo||null]
      );
    }
    const resultado = await pool.query(`SELECT * FROM pedidos_web WHERE id=$1 AND mayorista_id=$2`, [id, mayorista_id]);
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
