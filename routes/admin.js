const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');

router.get('/mayoristas', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT m.*, 
        (SELECT COUNT(*) FROM clientes c WHERE c.mayorista_id = m.id) as total_clientes,
        (SELECT COUNT(*) FROM pedidos p WHERE p.mayorista_id = m.id) as total_pedidos
      FROM mayoristas m
      ORDER BY m.created_at DESC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.post('/mayoristas', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const resultado = await pool.query(
      `INSERT INTO mayoristas (nombre, email, password, activo)
       VALUES ($1, $2, $3, true) RETURNING *`,
      [nombre, email, hash]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

router.put('/mayoristas/:id/activo', async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const resultado = await pool.query(
      `UPDATE mayoristas SET activo=$1 WHERE id=$2 RETURNING *`,
      [activo, id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;