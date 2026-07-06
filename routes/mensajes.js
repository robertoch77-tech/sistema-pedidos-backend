const express = require('express');
const router = express.Router();
const pool = require('../db');

// Lista de hilos del mayorista — agrupa por cliente_cuit con último mensaje y no leídos
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `WITH ultimo AS (
         SELECT DISTINCT ON (cliente_cuit)
           cliente_cuit, cliente_nombre, texto AS ultimo_mensaje, fecha AS ultima_fecha
         FROM mensajes
         WHERE mayorista_id = $1
         ORDER BY cliente_cuit, fecha DESC
       ),
       sin_leer AS (
         SELECT cliente_cuit, COUNT(*)::int AS no_leidos
         FROM mensajes
         WHERE mayorista_id = $1 AND origen = 'cliente' AND leido = false
         GROUP BY cliente_cuit
       )
       SELECT u.cliente_cuit, u.cliente_nombre, u.ultimo_mensaje, u.ultima_fecha,
              COALESCE(sl.no_leidos, 0) AS no_leidos
       FROM ultimo u
       LEFT JOIN sin_leer sl USING (cliente_cuit)
       ORDER BY u.ultima_fecha DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error hilos mensajes:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Total de mensajes no leídos de origen='cliente' — para el badge del mayorista
router.get('/:mayorista_id/no-leidos/count', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT COUNT(*)::int AS total FROM mensajes
       WHERE mayorista_id = $1 AND origen = 'cliente' AND leido = false`,
      [mayorista_id]
    );
    res.json({ total: resultado.rows[0].total });
  } catch (error) {
    console.error('Error count no-leidos mayorista:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Marca como leídos los mensajes del origen opuesto al lector
// ?lector=mayorista → marca los de origen='cliente'
// ?lector=cliente   → marca los de origen='mayorista'
router.put('/:mayorista_id/:cuit/leidos', async (req, res) => {
  try {
    const { mayorista_id, cuit } = req.params;
    const lector = req.query.lector || 'mayorista';
    const origenAMarcar = lector === 'mayorista' ? 'cliente' : 'mayorista';
    await pool.query(
      `UPDATE mensajes SET leido = true
       WHERE mayorista_id = $1 AND cliente_cuit = $2 AND origen = $3 AND leido = false`,
      [mayorista_id, cuit, origenAMarcar]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marcar leídos:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Mensajes no leídos de origen='mayorista' para un cliente — para el badge en ClienteHome
router.get('/:mayorista_id/:cuit/no-leidos', async (req, res) => {
  try {
    const { mayorista_id, cuit } = req.params;
    const resultado = await pool.query(
      `SELECT COUNT(*)::int AS total FROM mensajes
       WHERE mayorista_id = $1 AND cliente_cuit = $2 AND origen = 'mayorista' AND leido = false`,
      [mayorista_id, cuit]
    );
    res.json({ total: resultado.rows[0].total });
  } catch (error) {
    console.error('Error count no-leidos cliente:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Hilo completo entre mayorista y cliente — ordenado ASC (para chat)
router.get('/:mayorista_id/:cuit', async (req, res) => {
  try {
    const { mayorista_id, cuit } = req.params;
    const resultado = await pool.query(
      `SELECT * FROM mensajes
       WHERE mayorista_id = $1 AND cliente_cuit = $2
       ORDER BY fecha ASC`,
      [mayorista_id, cuit]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error hilo mensajes:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Envía un mensaje nuevo
router.post('/', async (req, res) => {
  try {
    const { mayorista_id, cliente_cuit, cliente_nombre, texto, origen } = req.body;
    if (!mayorista_id || !cliente_cuit || !texto || !origen) {
      return res.status(400).json({ mensaje: 'Faltan campos requeridos' });
    }
    const resultado = await pool.query(
      `INSERT INTO mensajes (mayorista_id, cliente_cuit, cliente_nombre, texto, origen, leido, fecha)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       RETURNING *`,
      [mayorista_id, cliente_cuit, cliente_nombre || '', texto, origen]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error enviar mensaje:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
