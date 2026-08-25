const express = require('express');
const router = express.Router();
const pool = require('../db');
const conexionCompartida = require('../services/conexionMayorista');

async function getConexionMayorista(mayorista_id) {
  return conexionCompartida.getConexionMayorista(mayorista_id);
}

function normalizar(texto) {
  return texto.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_');
}

// Cuentas corrientes del cliente
router.get('/:mayorista_id/ctas-ctes/:id_cliente', async (req, res) => {
  try {
    const { mayorista_id, id_cliente } = req.params;
    const { fecha_desde, fecha_hasta } = req.query;

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });

    let condiciones = [`doc_cliente = $1`];
    let params = [id_cliente];
    let i = 2;

    if (fecha_desde) { condiciones.push(`fecha_comp >= $${i}`); params.push(fecha_desde); i++; }
    if (fecha_hasta) { condiciones.push(`fecha_comp <= $${i}`); params.push(fecha_hasta); i++; }

    const resultado = await poolExterno.query(
      `SELECT id_tipo, tipo, fk_id_cliente, doc_cliente,
              importe, saldo, fecha_comp, fecha_venc,
              nro_suc_comprobante, nro_comprobante, letra
       FROM "viewClientesCtasCtes"
       WHERE ${condiciones.join(' AND ')}
       ORDER BY fecha_comp DESC`,
      params
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error('Error ctas ctes:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Buscar clientes en la base de Ivan (viewClientes)
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const busqueda = req.query.busqueda || '';
    const pagina = parseInt(req.query.pagina) || 1;
    const porPagina = 50;
    const desde = (pagina - 1) * porPagina;

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });

    let where = '';
    let params = [];

    if (busqueda.trim()) {
      const b = `%${normalizar(busqueda.trim())}%`;
      where = `WHERE (doc_cliente ILIKE $1 OR nom_fan_cliente ILIKE $1 OR raz_soc_cliente ILIKE $1)`;
      params = [b];
    }

    const totalRes = await poolExterno.query(
      `SELECT COUNT(*) FROM "viewClientes" ${where}`, params
    );
    const total = parseInt(totalRes.rows[0].count);

    const clientesRes = await poolExterno.query(
      `SELECT id_cliente, doc_cliente, nom_fan_cliente, raz_soc_cliente, es_activo
       FROM "viewClientes"
       ${where}
       ORDER BY nom_fan_cliente, raz_soc_cliente
       LIMIT ${porPagina} OFFSET ${desde}`,
      params
    );

    res.json({
      clientes: clientesRes.rows,
      total,
      pagina,
      totalPaginas: Math.ceil(total / porPagina)
    });
  } catch (error) {
    console.error('Error clientes:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
