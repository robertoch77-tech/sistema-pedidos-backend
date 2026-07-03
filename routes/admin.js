const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');

const checkAdmin = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ mensaje: 'No autorizado' });
  }
  next();
};

// GET — listar todos
router.get('/mayoristas', checkAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      // === MODIFICADO: se agregó habilitar_productos_solicitados ===
      `SELECT id, nombre, email, codigo, activo, config_habilitada, db_connection, ivan_activo, habilitar_ctas_ctes, razon_social, habilitar_demanda, habilitar_ofertas, habilitar_productos_solicitados
       FROM mayoristas ORDER BY nombre`
    );
    res.json(resultado.rows);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// POST — crear
router.post('/mayoristas', checkAdmin, async (req, res) => {
  try {
    const { nombre, email, codigo, db_connection, clave_inicial } = req.body;
    if (!nombre || !email || !codigo || !clave_inicial)
      return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
    const existe = await pool.query(
      'SELECT id FROM mayoristas WHERE codigo=$1 OR email=$2',
      [codigo.toLowerCase(), email.toLowerCase()]
    );
    if (existe.rows.length > 0)
      return res.status(400).json({ mensaje: 'Ya existe un mayorista con ese código o email' });
    const password = await bcrypt.hash(clave_inicial, 10);
    const resultado = await pool.query(
      `INSERT INTO mayoristas
         (nombre, email, password, codigo, db_connection, activo, config_habilitada,
          mostrar_precios, mostrar_stock, mostrar_marca, mostrar_rubro, mostrar_tipo,
          pedir_clave, tamanio_hoja, items_por_hoja, numero_pedido_inicio,
          habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva, orden_pdf,
          ivan_activo, habilitar_ctas_ctes, habilitar_demanda)
       VALUES ($1,$2,$3,$4,$5,true,false,true,true,true,true,true,false,'A4',30,1,false,0,0,0,21,'codigo',false,false,false)
       RETURNING id, nombre, email, codigo`,
      [nombre.trim(), email.trim().toLowerCase(), password, codigo.trim().toLowerCase(), db_connection || '']
    );
    res.json({ mayorista: resultado.rows[0], link_cliente: `/?m=${codigo.trim().toLowerCase()}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el mayorista' });
  }
});

// PUT — editar datos (nombre, email, db_connection, razon_social)
router.put('/mayoristas/:id/datos', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, db_connection, razon_social } = req.body;
    if (!nombre || !email)
      return res.status(400).json({ mensaje: 'Nombre y email son obligatorios' });
    const resultado = await pool.query(
      `UPDATE mayoristas SET nombre=$1, email=$2, db_connection=$3, razon_social=$4
       WHERE id=$5 RETURNING id, nombre, email, codigo, activo, config_habilitada, db_connection, razon_social`,
      [nombre.trim(), email.trim().toLowerCase(), db_connection || '', razon_social || null, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar' });
  }
});

// PUT — toggle activo
router.put('/mayoristas/:id/toggle', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET activo = NOT activo WHERE id=$1 RETURNING id, nombre, activo', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle config_habilitada
router.put('/mayoristas/:id/toggle-config', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET config_habilitada = NOT config_habilitada WHERE id=$1 RETURNING id, nombre, config_habilitada', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_ctas_ctes
router.put('/mayoristas/:id/toggle-ctas-ctes', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_ctas_ctes = NOT habilitar_ctas_ctes WHERE id=$1 RETURNING id, nombre, habilitar_ctas_ctes', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_demanda
router.put('/mayoristas/:id/toggle-demanda', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_demanda = NOT habilitar_demanda WHERE id=$1 RETURNING id, nombre, habilitar_demanda', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — toggle habilitar_ofertas
router.put('/mayoristas/:id/toggle-ofertas', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_ofertas = NOT habilitar_ofertas WHERE id=$1 RETURNING id, nombre, habilitar_ofertas', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// === NUEVO: PUT — toggle habilitar_productos_solicitados ===
router.put('/mayoristas/:id/toggle-productos-solicitados', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_productos_solicitados = NOT habilitar_productos_solicitados WHERE id=$1 RETURNING id, nombre, habilitar_productos_solicitados', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// GET — obtener configuración Ivan
router.get('/mayoristas/:id/ivan', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `SELECT ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
              ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta
       FROM mayoristas WHERE id=$1`,
      [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// === NUEVO: descuentos propios por cliente ===

// GET — clientes con descuentos propios de un mayorista (lee claves_clientes)
router.get('/mayoristas/:id/clientes-descuentos', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const may = await pool.query('SELECT codigo FROM mayoristas WHERE id=$1', [id]);
    if (!may.rows[0]) return res.status(404).json({ mensaje: 'Mayorista no encontrado' });
    const resultado = await pool.query(
      `SELECT cuit, descuento_1, descuento_2, descuento_3
       FROM claves_clientes WHERE mayorista_codigo=$1 ORDER BY cuit`,
      [may.rows[0].codigo]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// PUT — asignar/editar descuentos propios de un cliente (crea la fila si no existe)
router.put('/clientes/:mayorista_codigo/:cuit/descuentos', checkAdmin, async (req, res) => {
  try {
    const { mayorista_codigo, cuit } = req.params;
    const { descuento_1, descuento_2, descuento_3 } = req.body;
    const upd = await pool.query(
      `UPDATE claves_clientes SET descuento_1=$1, descuento_2=$2, descuento_3=$3
       WHERE mayorista_codigo=$4 AND cuit=$5
       RETURNING cuit, descuento_1, descuento_2, descuento_3`,
      [descuento_1 ?? null, descuento_2 ?? null, descuento_3 ?? null, mayorista_codigo, cuit]
    );
    if (upd.rows[0]) return res.json(upd.rows[0]);
    // El cliente todavía no tiene fila en claves_clientes (nunca registró clave)
    const ins = await pool.query(
      `INSERT INTO claves_clientes (mayorista_codigo, cuit, descuento_1, descuento_2, descuento_3)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING cuit, descuento_1, descuento_2, descuento_3`,
      [mayorista_codigo, cuit, descuento_1 ?? null, descuento_2 ?? null, descuento_3 ?? null]
    );
    res.json(ins.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar descuentos del cliente' });
  }
});

// PUT — toggle habilitar_descuentos_por_cliente
router.put('/mayoristas/:id/toggle-descuentos-cliente', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE mayoristas SET habilitar_descuentos_por_cliente = NOT habilitar_descuentos_por_cliente WHERE id=$1 RETURNING id, nombre, habilitar_descuentos_por_cliente', [id]
    );
    res.json(resultado.rows[0]);
  } catch (error) { res.status(500).json({ mensaje: 'Error del servidor' }); }
});

// PUT — guardar configuración Ivan
router.put('/mayoristas/:id/ivan', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
            ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta } = req.body;
    const resultado = await pool.query(
      `UPDATE mayoristas
       SET ivan_activo=$1, ivan_id_deposito=$2, ivan_id_operario=$3, ivan_id_vendedor=$4,
           ivan_id_tipo_pedido=$5, ivan_id_sucursal=$6, ivan_porc_iva=$7, ivan_id_condicion_venta=$8
       WHERE id=$9
       RETURNING id, nombre, ivan_activo, ivan_id_deposito, ivan_id_operario, ivan_id_vendedor,
                 ivan_id_tipo_pedido, ivan_id_sucursal, ivan_porc_iva, ivan_id_condicion_venta`,
      [ivan_activo||false, ivan_id_deposito||1, ivan_id_operario||null, ivan_id_vendedor||null,
       ivan_id_tipo_pedido||1, ivan_id_sucursal||1, ivan_porc_iva||21,
       ivan_id_condicion_venta||null, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar configuración Ivan' });
  }
});

module.exports = router;