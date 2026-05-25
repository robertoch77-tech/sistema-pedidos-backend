const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      'SELECT * FROM clientes WHERE mayorista_id = $1 AND activo = true ORDER BY nombre',
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { mayorista_id, nombre, email, telefono, direccion, ver_stock, ver_precios, descuento } = req.body;
    const resultado = await pool.query(
      `INSERT INTO clientes (mayorista_id, nombre, email, telefono, direccion, ver_stock, ver_precios, descuento)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [mayorista_id, nombre, email, telefono, direccion, ver_stock, ver_precios, descuento]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;