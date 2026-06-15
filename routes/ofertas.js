const express = require('express');
const router = express.Router();
const pool = require('../db');

// ================= CLIENTE =================

// Ofertas activas y vigentes para mostrar en el catálogo
router.get('/cliente/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT o.*,
         COALESCE(json_agg(json_build_object(
           'id', oi.id, 'producto_id', oi.producto_id, 'codigo', oi.codigo,
           'descripcion', oi.descripcion, 'precio', oi.precio,
           'cantidad_minima', oi.cantidad_minima, 'cantidad', oi.cantidad
         )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) as items
       FROM ofertas o
       LEFT JOIN ofertas_items oi ON o.id = oi.oferta_id
       WHERE o.mayorista_id = $1
         AND o.activa = true
         AND (o.fecha_inicio IS NULL OR o.fecha_inicio <= CURRENT_DATE)
         AND (o.fecha_fin IS NULL OR o.fecha_fin >= CURRENT_DATE)
       GROUP BY o.id ORDER BY o.creado_en DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error ofertas cliente:', error.message);
    res.json([]);
  }
});

// Cliente: registrar consulta de "modificar combo"
router.post('/:id/consulta', async (req, res) => {
  try {
    const { id } = req.params;
    const { mayorista_id, cliente_cuit, cliente_nombre } = req.body;
    const resultado = await pool.query(
      `INSERT INTO ofertas_consultas (oferta_id, mayorista_id, cliente_cuit, cliente_nombre)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, mayorista_id, cliente_cuit || '', cliente_nombre || '']
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error guardar consulta:', error.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// ================= MAYORISTA: DASHBOARD CONSULTAS =================

// Listar consultas (modificar combo) de un mayorista
router.get('/consultas/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT c.*, o.titulo as oferta_titulo
       FROM ofertas_consultas c
       JOIN ofertas o ON o.id = c.oferta_id
       WHERE c.mayorista_id = $1
       ORDER BY c.fecha DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error listar consultas:', error.message);
    res.json([]);
  }
});

// Marcar consulta como atendida
router.put('/consultas/:id/atender', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `UPDATE ofertas_consultas SET atendida = true WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'No encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// ================= MAYORISTA: CRUD OFERTAS =================

// Listar ofertas del mayorista (panel), con sus items
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const resultado = await pool.query(
      `SELECT o.*,
         COALESCE(json_agg(json_build_object(
           'id', oi.id, 'producto_id', oi.producto_id, 'codigo', oi.codigo,
           'descripcion', oi.descripcion, 'precio', oi.precio,
           'cantidad_minima', oi.cantidad_minima, 'cantidad', oi.cantidad
         )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) as items
       FROM ofertas o
       LEFT JOIN ofertas_items oi ON o.id = oi.oferta_id
       WHERE o.mayorista_id = $1
       GROUP BY o.id ORDER BY o.creado_en DESC`,
      [mayorista_id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error listar ofertas:', error.message);
    res.json([]);
  }
});

// Crear oferta + items
router.post('/', async (req, res) => {
  try {
    const {
      mayorista_id, tipo, titulo, descripcion,
      precio, cantidad_minima,
      producto_gratis_id, codigo_gratis, descripcion_gratis, cantidad_gratis,
      porcentaje_descuento,
      fecha_inicio, fecha_fin, items
    } = req.body;

    if (!mayorista_id || !tipo || !titulo)
      return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });

    const oferta = await pool.query(
      `INSERT INTO ofertas
        (mayorista_id, tipo, titulo, descripcion, precio, cantidad_minima,
         producto_gratis_id, codigo_gratis, descripcion_gratis, cantidad_gratis,
         porcentaje_descuento, fecha_inicio, fecha_fin, activa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
       RETURNING *`,
      [mayorista_id, tipo, titulo.trim(), descripcion || '', precio || null, cantidad_minima || null,
       producto_gratis_id || null, codigo_gratis || null, descripcion_gratis || null, cantidad_gratis || null,
       porcentaje_descuento || null, fecha_inicio || null, fecha_fin || null]
    );
    const oferta_id = oferta.rows[0].id;

    for (const item of (items || [])) {
      await pool.query(
        `INSERT INTO ofertas_items (oferta_id, producto_id, codigo, descripcion, precio, cantidad_minima, cantidad)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [oferta_id, item.producto_id, item.codigo || '', item.descripcion || '',
         item.precio || null, item.cantidad_minima || null, item.cantidad || null]
      );
    }

    res.json(oferta.rows[0]);
  } catch (error) {
    console.error('Error crear oferta:', error.message);
    res.status(500).json({ mensaje: 'Error al crear la oferta' });
  }
});

// Editar oferta + items (reemplaza items)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tipo, titulo, descripcion,
      precio, cantidad_minima,
      producto_gratis_id, codigo_gratis, descripcion_gratis, cantidad_gratis,
      porcentaje_descuento,
      fecha_inicio, fecha_fin, items
    } = req.body;

    const oferta = await pool.query(
      `UPDATE ofertas SET
         tipo=$1, titulo=$2, descripcion=$3, precio=$4, cantidad_minima=$5,
         producto_gratis_id=$6, codigo_gratis=$7, descripcion_gratis=$8, cantidad_gratis=$9,
         porcentaje_descuento=$10, fecha_inicio=$11, fecha_fin=$12
       WHERE id=$13 RETURNING *`,
      [tipo, titulo.trim(), descripcion || '', precio || null, cantidad_minima || null,
       producto_gratis_id || null, codigo_gratis || null, descripcion_gratis || null, cantidad_gratis || null,
       porcentaje_descuento || null, fecha_inicio || null, fecha_fin || null, id]
    );
    if (!oferta.rows[0]) return res.status(404).json({ mensaje: 'No encontrada' });

    await pool.query(`DELETE FROM ofertas_items WHERE oferta_id=$1`, [id]);
    for (const item of (items || [])) {
      await pool.query(
        `INSERT INTO ofertas_items (oferta_id, producto_id, codigo, descripcion, precio, cantidad_minima, cantidad)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, item.producto_id, item.codigo || '', item.descripcion || '',
         item.precio || null, item.cantidad_minima || null, item.cantidad || null]
      );
    }

    res.json(oferta.rows[0]);
  } catch (error) {
    console.error('Error editar oferta:', error.message);
    res.status(500).json({ mensaje: 'Error al editar la oferta' });
  }
});

// Activar/desactivar oferta
router.put('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await pool.query(
      `UPDATE ofertas SET activa = NOT activa WHERE id=$1 RETURNING id, titulo, activa`,
      [id]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'No encontrada' });
    res.json(resultado.rows[0]);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// Eliminar oferta (cascada borra items y consultas)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM ofertas WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;