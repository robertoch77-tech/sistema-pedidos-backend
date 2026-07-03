const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET — banners activos y vigentes para el home del cliente.
// Si el mayorista tiene habilitar_banners=false devuelve lista vacía, así el
// carrusel no aparece sin que el frontend necesite otra consulta (la config
// general /api/mayoristas/:id/configuracion no expone este flag).
router.get('/cliente/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const flag = await pool.query('SELECT habilitar_banners FROM mayoristas WHERE id=$1', [mayorista_id]);
    if (!flag.rows[0] || flag.rows[0].habilitar_banners !== true) return res.json([]);
    const resultado = await pool.query(
      `SELECT id, imagen_url, titulo, descripcion, link_destino, orden
       FROM banners
       WHERE mayorista_id=$1 AND activo=true
         AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)
         AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
       ORDER BY orden ASC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error banners cliente:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// GET — flag habilitar_banners para el panel del mayorista (Dashboard),
// que decide si muestra la sección Banners en el sidebar.
router.get('/habilitado/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query('SELECT habilitar_banners FROM mayoristas WHERE id=$1', [mayorista_id]);
    res.json({ habilitado: resultado.rows[0]?.habilitar_banners === true });
  } catch (error) {
    console.error('Error banners habilitado:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// GET — TODOS los banners del mayorista para el panel de gestión (sin filtro de vigencia)
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT id, mayorista_id, imagen_url, titulo, descripcion, link_destino,
              orden, activo, fecha_inicio, fecha_fin, creado_en
       FROM banners WHERE mayorista_id=$1 ORDER BY orden ASC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error banners lista:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// POST — crear banner
router.post('/', async (req, res) => {
  try {
    const { mayorista_id, imagen_url, titulo, descripcion, link_destino, orden, activo, fecha_inicio, fecha_fin } = req.body;
    if (!mayorista_id || !imagen_url)
      return res.status(400).json({ mensaje: 'Faltan mayorista_id o imagen_url' });
    const resultado = await pool.query(
      `INSERT INTO banners (mayorista_id, imagen_url, titulo, descripcion, link_destino, orden, activo, fecha_inicio, fecha_fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [mayorista_id, imagen_url, titulo || null, descripcion || null, link_destino || null,
       orden ?? 0, activo ?? true, fecha_inicio || null, fecha_fin || null]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error crear banner:', error.message);
    res.status(500).json({ mensaje: 'Error al crear el banner' });
  }
});

// PUT — editar banner
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { imagen_url, titulo, descripcion, link_destino, orden, activo, fecha_inicio, fecha_fin } = req.body;
    if (!imagen_url)
      return res.status(400).json({ mensaje: 'Falta imagen_url' });
    const resultado = await pool.query(
      `UPDATE banners SET imagen_url=$1, titulo=$2, descripcion=$3, link_destino=$4,
              orden=$5, activo=$6, fecha_inicio=$7, fecha_fin=$8
       WHERE id=$9 RETURNING *`,
      [imagen_url, titulo || null, descripcion || null, link_destino || null,
       orden ?? 0, activo ?? true, fecha_inicio || null, fecha_fin || null, id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Banner no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error editar banner:', error.message);
    res.status(500).json({ mensaje: 'Error al editar el banner' });
  }
});

// PUT — activar/desactivar banner
router.put('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      'UPDATE banners SET activo = NOT activo WHERE id=$1 RETURNING id, activo', [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Banner no encontrado' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error toggle banner:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// DELETE — eliminar banner
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query('DELETE FROM banners WHERE id=$1', [id]);
    res.json({ borradas: resultado.rowCount });
  } catch (error) {
    console.error('Error eliminar banner:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;
