const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      'SELECT * FROM productos WHERE mayorista_id = $1 AND activo = true ORDER BY nombre',
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { mayorista_id, codigo, nombre, descripcion, imagen_url, precio, stock } = req.body;
    const resultado = await pool.query(
      `INSERT INTO productos (mayorista_id, codigo, nombre, descripcion, imagen_url, precio, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [mayorista_id, codigo, nombre, descripcion, imagen_url, precio, stock]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, descripcion, imagen_url, precio, stock, activo } = req.body;
    const resultado = await pool.query(
      `UPDATE productos SET codigo=$1, nombre=$2, descripcion=$3, imagen_url=$4, precio=$5, stock=$6, activo=$7
       WHERE id=$8 RETURNING *`,
      [codigo, nombre, descripcion, imagen_url, precio, stock, activo, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;