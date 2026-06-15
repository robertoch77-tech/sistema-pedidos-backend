const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Pool } = require('pg');

const conexiones = {};

async function getConexionMayorista(mayorista_id) {
  if (conexiones[mayorista_id]) return conexiones[mayorista_id];
  const resultado = await pool.query('SELECT db_connection FROM mayoristas WHERE id=$1', [mayorista_id]);
  if (!resultado.rows[0]?.db_connection) return null;
  const poolExterno = new Pool({ connectionString: resultado.rows[0].db_connection, ssl: false });
  poolExterno.on('connect', client => client.query("SET client_encoding TO 'LATIN1'"));
  conexiones[mayorista_id] = poolExterno;
  return poolExterno;
}

router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM mayoristas WHERE activo = true');
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.get('/:id/configuracion', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      // === MODIFICADO: se agregó habilitar_productos_solicitados ===
      `SELECT mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
              habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva,
              orden_pdf, config_habilitada, pedir_clave, tamanio_hoja, items_por_hoja,
              numero_pedido_inicio, habilitar_ctas_ctes, razon_social, habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados
       FROM mayoristas WHERE id=$1`, [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.put('/:id/configuracion', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
      pedir_clave, tamanio_hoja, items_por_hoja, numero_pedido_inicio,
      habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva, orden_pdf,
      // === MODIFICADO: se agregó habilitar_productos_solicitados ===
      habilitar_ctas_ctes, habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados
    } = req.body;
    const resultado = await pool.query(
      // === MODIFICADO: se agregó habilitar_productos_solicitados=$19 y se corrió WHERE id a $20 ===
      `UPDATE mayoristas SET
        mostrar_precios=$1, mostrar_stock=$2, mostrar_marca=$3, mostrar_rubro=$4, mostrar_tipo=$5,
        pedir_clave=$6, tamanio_hoja=$7, items_por_hoja=$8, numero_pedido_inicio=$9,
        habilitar_calculadora=$10, descuento_1=$11, descuento_2=$12, descuento_3=$13, iva=$14,
        orden_pdf=$15, habilitar_ctas_ctes=$16, habilitar_demanda=$17, habilitar_ofertas=$18, habilitar_productos_solicitados=$19
       WHERE id=$20 RETURNING *`,
      [mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
       pedir_clave, tamanio_hoja, items_por_hoja, numero_pedido_inicio,
       habilitar_calculadora, descuento_1||0, descuento_2||0, descuento_3||0, iva||21,
       orden_pdf||'codigo', habilitar_ctas_ctes||false, habilitar_demanda||false, habilitar_ofertas||false, habilitar_productos_solicitados||false, id]
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
    const [pedidosHoy, sinImprimir, pedidosNuevos] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM pedidos_web WHERE mayorista_id=$1 AND estado!='borrador' AND DATE(fecha_pedido)=$2`, [id, hoy]),
      pool.query(`SELECT COUNT(*) FROM pedidos_web WHERE mayorista_id=$1 AND estado='enviado'`, [id]),
      pool.query(`SELECT id, numero_pedido, cliente_nombre, cliente_cuit, estado, fecha_pedido, total_estimado FROM pedidos_web WHERE mayorista_id=$1 AND estado='enviado' ORDER BY fecha_pedido DESC`, [id])
    ]);
    let totalProductos = 0, totalClientes = 0;
    try {
      const poolExterno = await getConexionMayorista(id);
      if (poolExterno) {
        const [prodRes, cliRes] = await Promise.all([
          poolExterno.query(`SELECT COUNT(*) FROM "viewProductos"`),
          poolExterno.query(`SELECT COUNT(*) FROM "viewClientes" WHERE es_activo=true`)
        ]);
        totalProductos = parseInt(prodRes.rows[0].count);
        totalClientes = parseInt(cliRes.rows[0].count);
      }
    } catch (e) { console.error('Error Ivan stats:', e.message); }
    res.json({
      stats: {
        pedidos_hoy: parseInt(pedidosHoy.rows[0].count),
        total_productos: totalProductos,
        total_clientes: totalClientes,
        pedidos_pendientes: parseInt(sinImprimir.rows[0].count)
      },
      ultimos_pedidos: pedidosNuevos.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/:id/resetear-clave-cliente', async (req, res) => {
  try {
    const { id } = req.params;
    const { cuit } = req.body;
    if (!cuit) return res.status(400).json({ mensaje: 'Falta el CUIT' });
    const may = await pool.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) return res.status(404).json({ mensaje: 'No encontrado' });
    const del = await pool.query('DELETE FROM claves_clientes WHERE mayorista_codigo=$1 AND cuit=$2', [may.rows[0].codigo, cuit]);
    res.json({ borradas: del.rowCount });
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

router.get('/:id/proximo-numero', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `UPDATE mayoristas SET numero_pedido_inicio = numero_pedido_inicio + 1
       WHERE id=$1 RETURNING numero_pedido_inicio - 1 AS numero`,
      [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    res.json({ numero: resultado.rows[0].numero });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;