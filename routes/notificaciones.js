const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET — notificaciones del cliente (propias + para todos)
router.get('/cliente/:mayorista_id/:cuit', async (req, res) => {
  try {
    const { mayorista_id, cuit } = req.params;
    const resultado = await pool.query(
      `SELECT * FROM notificaciones
       WHERE mayorista_id=$1 AND (cliente_cuit=$2 OR cliente_cuit IS NULL)
       ORDER BY fecha DESC LIMIT 20`,
      [mayorista_id, decodeURIComponent(cuit)]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error get notificaciones:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// GET — count de no leídas para badge
router.get('/cliente/:mayorista_id/:cuit/count', async (req, res) => {
  try {
    const { mayorista_id, cuit } = req.params;
    const resultado = await pool.query(
      `SELECT COUNT(*) FROM notificaciones
       WHERE mayorista_id=$1 AND (cliente_cuit=$2 OR cliente_cuit IS NULL) AND leida=false`,
      [mayorista_id, decodeURIComponent(cuit)]
    );
    res.json({ total: parseInt(resultado.rows[0].count) });
  } catch (error) {
    res.json({ total: 0 });
  }
});

// PUT — marcar como leída
router.put('/:id/leida', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `UPDATE notificaciones SET leida=true WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'No encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// GET — notificaciones enviadas por el mayorista (panel admin)
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT * FROM notificaciones WHERE mayorista_id=$1 ORDER BY fecha DESC LIMIT 50`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// POST — crear nueva notificación
router.post('/', async (req, res) => {
  try {
    const { mayorista_id, cliente_cuit, titulo, mensaje, tipo } = req.body;
    if (!mayorista_id || !titulo || !mensaje)
      return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    const resultado = await pool.query(
      `INSERT INTO notificaciones (mayorista_id, cliente_cuit, titulo, mensaje, tipo, leida, fecha)
       VALUES ($1,$2,$3,$4,$5,false,NOW()) RETURNING *`,
      [mayorista_id, cliente_cuit || null, titulo, mensaje, tipo || 'general']
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error crear notificacion:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
