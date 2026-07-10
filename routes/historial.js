const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/historial/:mayorista_id/:cuit
router.get('/:mayorista_id/:cuit', async (req, res) => {
  try {
    const { mayorista_id, cuit } = req.params;
    const { tipo } = req.query;
    const condiciones = ['mayorista_id = $1', 'cliente_cuit = $2'];
    const params = [mayorista_id, cuit];
    let i = 3;
    if (tipo) { condiciones.push(`tipo = $${i}`); params.push(tipo); i++; }
    const resultado = await pool.query(
      `SELECT id, numero_correlativo, tipo, cliente_final_nombre, cliente_final_cuit,
              cliente_final_direccion, cliente_final_telefono, forma_pago,
              monto_recibido, vuelto, items, total, ganancia_porcentaje,
              observaciones, fecha
       FROM historial_ventas
       WHERE ${condiciones.join(' AND ')}
       ORDER BY fecha DESC
       LIMIT 100`,
      params
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

// POST /api/historial
router.post('/', async (req, res) => {
  try {
    const {
      mayorista_id, cliente_cuit, tipo,
      cliente_final_nombre, cliente_final_cuit, cliente_final_direccion, cliente_final_telefono,
      forma_pago, monto_recibido, vuelto,
      items, total, ganancia_porcentaje, observaciones,
    } = req.body;
    if (!mayorista_id || !cliente_cuit) return res.status(400).json({ ok: false, mensaje: 'Faltan datos' });

    // Numero correlativo = MAX por mayorista + cuit + tipo + 1
    const tipoFinal = tipo || 'ticket';
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX(numero_correlativo), 0) AS max FROM historial_ventas
       WHERE mayorista_id = $1 AND cliente_cuit = $2 AND tipo = $3`,
      [mayorista_id, cliente_cuit, tipoFinal]
    );
    const numero_correlativo = (maxRes.rows[0]?.max || 0) + 1;

    const resultado = await pool.query(
      `INSERT INTO historial_ventas
         (mayorista_id, cliente_cuit, tipo,
          cliente_final_nombre, cliente_final_cuit, cliente_final_direccion, cliente_final_telefono,
          forma_pago, monto_recibido, vuelto,
          items, total, ganancia_porcentaje, observaciones, numero_correlativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id, numero_correlativo`,
      [
        mayorista_id, cliente_cuit, tipoFinal,
        cliente_final_nombre || null, cliente_final_cuit || null,
        cliente_final_direccion || null, cliente_final_telefono || null,
        forma_pago || null, monto_recibido || null, vuelto || null,
        JSON.stringify(items || []), total || 0, ganancia_porcentaje || 0,
        observaciones || null, numero_correlativo,
      ]
    );
    res.json({ ok: true, id: resultado.rows[0].id, numero_correlativo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar' });
  }
});

// DELETE /api/historial/:id?mayorista_id=xxx
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { mayorista_id } = req.query;
    if (!mayorista_id) return res.status(400).json({ ok: false });
    await pool.query(
      'DELETE FROM historial_ventas WHERE id = $1 AND mayorista_id = $2',
      [id, mayorista_id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
