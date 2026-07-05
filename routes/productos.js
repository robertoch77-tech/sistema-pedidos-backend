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

// Opciones para los selectores de marca / rubro / tipo
// Acepta ?marca=X para filtrar rubros, y ?marca=X&rubro=Y para filtrar tipos
router.get('/:mayorista_id/opciones', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const marca = req.query.marca || '';
    const rubro = req.query.rubro || '';
    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });

    const distinct = async (campo, extraConds = [], extraParams = []) => {
      const baseCond = `${campo} IS NOT NULL AND ${campo} <> ''`;
      const allConds = extraConds.length ? `${baseCond} AND ${extraConds.join(' AND ')}` : baseCond;
      const r = await poolExterno.query(
        `SELECT DISTINCT ${campo} AS valor FROM "viewProductos" WHERE ${allConds} ORDER BY ${campo}`,
        extraParams
      );
      return r.rows.map(x => x.valor);
    };

    // Marcas: siempre la lista completa
    const marcas = await distinct('des_producto_marca');

    // Rubros: filtrados por marca si viene ?marca
    const rubrosConds = marca ? [`des_producto_marca ILIKE $1`] : [];
    const rubrosParams = marca ? [normalizar(marca)] : [];
    const rubros = await distinct('des_producto_rubro', rubrosConds, rubrosParams);

    // Tipos: filtrados por marca y/o rubro si vienen esos parámetros
    const tiposConds = [];
    const tiposParams = [];
    if (marca) { tiposConds.push(`des_producto_marca ILIKE $${tiposParams.length + 1}`); tiposParams.push(normalizar(marca)); }
    if (rubro) { tiposConds.push(`des_producto_rubro ILIKE $${tiposParams.length + 1}`); tiposParams.push(normalizar(rubro)); }
    const tipos = await distinct('des_producto_tipo', tiposConds, tiposParams);

    res.json({ marcas, rubros, tipos });
  } catch (error) {
    console.error('Error opciones:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Todos los productos sin paginación — solo para la descarga de listas (PDF/Excel) en MisPrecios.
// Misma query base, misma conexión Ivan (LATIN1), mismo normalizar() que el endpoint paginado.
router.get('/:mayorista_id/todos', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const busqueda = req.query.busqueda || '';
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
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const resultado = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
       FROM "viewProductos"
       ${where}
       ORDER BY des_producto`,
      params
    );

    res.json({ productos: resultado.rows, total: resultado.rows.length });
  } catch (error) {
    console.error('Error productos todos:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO (Mejora 1 — lector de código de barras, modo EAN) ===
// Busca un producto por EAN exacto. Si "viewProductos" de Ivan no tiene la
// columna ean (no todos los mayoristas la exponen), la query falla y acá lo
// atrapamos devolviendo ean_no_soportado — el frontend cae al modo texto
// (escribe el código escaneado en el buscador) sin romper nada.
router.get('/:mayorista_id/buscar-ean/:ean', async (req, res) => {
  try {
    const { mayorista_id, ean } = req.params;
    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.status(404).json({ mensaje: 'Sin conexión configurada' });
    try {
      const resultado = await poolExterno.query(
        `SELECT id_producto, cod_producto, des_producto, imagen_producto,
                precio_producto, stock_temporal, des_producto_marca,
                des_producto_rubro, des_producto_tipo
         FROM "viewProductos" WHERE ean = $1 LIMIT 1`,
        [ean]
      );
      res.json({ producto: resultado.rows[0] || null });
    } catch (errCampo) {
      // La vista no tiene columna "ean" en este mayorista — modo EAN no disponible.
      res.json({ producto: null, ean_no_soportado: true });
    }
  } catch (error) {
    console.error('Error buscar-ean:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO (Mejora 3 — cross selling) ===
// Códigos que suelen comprarse junto con los del carrito actual, calculado
// sobre el historial de pedidos en Supabase (pedidos_web/pedidos_web_items),
// cruzado con Ivan para precio/imagen vigentes. Si Ivan ya no tiene el
// producto, simplemente no aparece en el resultado.
router.get('/:mayorista_id/cross-selling', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const codigos = (req.query.codigos || '').split(',').map(c => c.trim()).filter(Boolean);
    if (codigos.length === 0) return res.json([]);

    const relacionados = await pool.query(
      `SELECT pi2.codigo, COUNT(*) AS coocurrencias
       FROM pedidos_web_items pi1
       JOIN pedidos_web p ON p.id = pi1.pedido_id
       JOIN pedidos_web_items pi2 ON pi2.pedido_id = pi1.pedido_id
       WHERE p.mayorista_id = $1
         AND pi1.codigo = ANY($2::text[])
         AND pi2.codigo IS NOT NULL AND pi2.codigo != ''
         AND pi2.codigo != ALL($2::text[])
       GROUP BY pi2.codigo
       ORDER BY coocurrencias DESC
       LIMIT 20`,
      [mayorista_id, codigos]
    );
    if (relacionados.rows.length === 0) return res.json([]);

    const poolExterno = await getConexionMayorista(mayorista_id);
    if (!poolExterno) return res.json([]);

    const codigosRelacionados = relacionados.rows.map(r => r.codigo);
    const ivanRes = await poolExterno.query(
      `SELECT id_producto, cod_producto, des_producto, imagen_producto,
              precio_producto, stock_temporal, des_producto_marca,
              des_producto_rubro, des_producto_tipo
       FROM "viewProductos" WHERE cod_producto = ANY($1::text[])`,
      [codigosRelacionados]
    );
    const porCodigo = new Map(ivanRes.rows.map(p => [p.cod_producto, p]));

    const resultado = [];
    for (const r of relacionados.rows) {
      const prod = porCodigo.get(r.codigo);
      if (prod) resultado.push(prod);
      if (resultado.length >= 5) break;
    }
    res.json(resultado);
  } catch (error) {
    console.error('Error cross-selling:', error.message);
    res.json([]);
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