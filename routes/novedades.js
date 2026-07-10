const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/novedades/cliente/:mayorista_id — activas y vigentes (para el cliente)
router.get('/cliente/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT * FROM novedades
       WHERE mayorista_id = $1
         AND activa = true
         AND (fecha_hasta IS NULL OR fecha_hasta >= CURRENT_DATE)
       ORDER BY creada_en DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// GET /api/novedades/:mayorista_id — todas las novedades (panel mayorista)
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT * FROM novedades
       WHERE mayorista_id = $1
       ORDER BY creada_en DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// POST /api/novedades — crear novedad
router.post('/', async (req, res) => {
  try {
    const {
      mayorista_id, producto_id, producto_codigo,
      producto_nombre, imagen_url, precio,
      fecha_hasta, activa,
    } = req.body;
    if (!mayorista_id || !producto_nombre) {
      return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    }
    const resultado = await pool.query(
      `INSERT INTO novedades
         (mayorista_id, producto_id, producto_codigo, producto_nombre,
          imagen_url, precio, fecha_hasta, activa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        mayorista_id,
        producto_id || null,
        producto_codigo || null,
        producto_nombre,
        imagen_url || null,
        precio || null,
        fecha_hasta || null,
        activa !== undefined ? activa : true,
      ]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// PUT /api/novedades/:id/toggle — activar/desactivar
router.put('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `UPDATE novedades SET activa = NOT activa WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'No encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// DELETE /api/novedades/:id — eliminar
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM novedades WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
