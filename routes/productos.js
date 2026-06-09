const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Pool } = require('pg');

// Cache de conexiones por mayorista
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

  // La base de Ivan viene en LATIN1
  poolExterno.on('connect', (client) => {
    client.query("SET client_encoding TO 'LATIN1'");
  });

  conexiones[mayorista_id] = poolExterno;
  return poolExterno;
}

// Reemplaza ñ, acentos y el caracter roto (�) por comodin _ (1 caracter cualquiera).
function normalizar(texto) {
  return texto.replace(/[ñÑáéíóúÁÉÍÓÚ\uFFFD]/g, '_');
}

// Opciones para los selectores de marca / rubro / tipo (se piden una sola vez)
router.get('/:mayorista_id/opciones', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });

    const distinct = async (campo) => {
      const r = await poolExterno.query(
        `SELECT DISTINCT ${campo} AS valor
         FROM "viewProductos"
         WHERE ${campo} IS NOT NULL AND ${campo} <> ''
         ORDER BY ${campo}`
      );
      return r.rows.map(x => x.valor);
    };

    const [marcas, rubros, tipos] = await Promise.all([
      distinct('des_producto_marca'),
      distinct('des_producto_rubro'),
      distinct('des_producto_tipo')
    ]);

    res.json({ marcas, rubros, tipos });
  } catch (error) {
    console.error('Error opciones:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const busqueda = req.query.busqueda || '';
    const marca = req.query.marca || '';
    const rubro = req.query.rubro || '';
    const tipo = req.query.tipo || '';
    const pagina = parseInt(req.query.pagina) || 1;
    const porPagina = 50;
    const desde = (pagina - 1) * porPagina;

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });

    const condiciones = [];
    const params = [];
    let i = 1;

    if (busqueda.trim() !== '') {
      const palabras = normalizar(busqueda).trim().split(/\s+/).filter(p => p);
      for (const palabra of palabras) {
        condiciones.push(`(cod_producto ILIKE $${i}
          OR des_producto ILIKE $${i}
          OR des_producto_marca ILIKE $${i}
          OR des_producto_rubro ILIKE $${i})`);
        params.push(`%${palabra}%`);
        i++;
      }
    }
    if (marca) { condiciones.push(`des_producto_marca ILIKE $${i}`); params.push(normalizar(marca)); i++; }
    if (rubro) { condiciones.push(`des_producto_rubro ILIKE $${i}`); params.push(normalizar(rubro)); i++; }
    if (tipo)  { condiciones.push(`des_producto_tipo ILIKE $${i}`);  params.push(normalizar(tipo));  i++; }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const totalResultado = await poolExterno.query(
      `SELECT COUNT(*) FROM "viewProductos" ${where}`,
      params
    );
    const total = parseInt(totalResultado.rows[0].count);

    const productosResultado = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
       FROM "viewProductos"
       ${where}
       ORDER BY des_producto
       LIMIT ${porPagina} OFFSET ${desde}`,
      params
    );

    res.json({
      productos: productosResultado.rows,
      total,
      pagina,
      totalPaginas: Math.ceil(total / porPagina)
    });
  } catch (error) {
    console.error('Error productos:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;