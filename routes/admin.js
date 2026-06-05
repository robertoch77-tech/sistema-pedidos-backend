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
      `SELECT id, nombre, email, codigo, activo, config_habilitada, db_connection
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
          habilitar_calculadora, descuento_1, descuento_2, descuento_3, iva, orden_pdf)
       VALUES ($1,$2,$3,$4,$5,true,false,true,true,true,true,true,false,'A4',30,1,false,0,0,0,21,'codigo')
       RETURNING id, nombre, email, codigo`,
      [nombre.trim(), email.trim().toLowerCase(), password, codigo.trim().toLowerCase(), db_connection || '']
    );
    res.json({ mayorista: resultado.rows[0], link_cliente: `/?m=${codigo.trim().toLowerCase()}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el mayorista' });
  }
});

// PUT — editar datos (nombre, email, db_connection)
router.put('/mayoristas/:id/datos', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, email, db_connection } = req.body;
    if (!nombre || !email)
      return res.status(400).json({ mensaje: 'Nombre y email son obligatorios' });
    const resultado = await pool.query(
      `UPDATE mayoristas SET nombre=$1, email=$2, db_connection=$3
       WHERE id=$4 RETURNING id, nombre, email, codigo, activo, config_habilitada, db_connection`,
      [nombre.trim(), email.trim().toLowerCase(), db_connection || '', id]
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

module.exports = router;