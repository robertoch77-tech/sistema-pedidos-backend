const express = require('express');
const router = express.Router();
const pool = require('../../db');

router.get('/historial-cambios', async (req, res) => {
  try {
    const { cliente_id, desde, hasta, campo, tipo_operacion, buscar, page = 1, limit = 50 } = req.query;
    if (!cliente_id) return res.status(400).json({ mensaje: 'cliente_id requerido' });

    const conditions = ['cliente_id = $1'];
    const params = [cliente_id];
    let idx = 2;

    if (desde) {
      conditions.push(`created_at >= $${idx}`);
      params.push(desde);
      idx++;
    }
    if (hasta) {
      conditions.push(`created_at <= $${idx}::date + interval '1 day'`);
      params.push(hasta);
      idx++;
    }
    if (campo) {
      conditions.push(`campo = $${idx}`);
      params.push(campo);
      idx++;
    }
    if (tipo_operacion) {
      conditions.push(`tipo_operacion = $${idx}`);
      params.push(tipo_operacion);
      idx++;
    }
    if (buscar) {
      conditions.push(`(codigo ILIKE $${idx} OR descripcion ILIKE $${idx})`);
      params.push(`%${buscar}%`);
      idx++;
    }

    const where = conditions.join(' AND ');
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countRes = await pool.query(`SELECT COUNT(*) FROM historial_cambios_productos WHERE ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const dataRes = await pool.query(
      `SELECT id, producto_id, codigo, descripcion, campo, valor_anterior, valor_nuevo,
              tipo_operacion, origen, created_at
       FROM historial_cambios_productos
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset]
    );

    const resumenRes = await pool.query(
      `SELECT DATE(created_at) as fecha, COUNT(*) as total
       FROM historial_cambios_productos
       WHERE cliente_id = $1
       GROUP BY DATE(created_at)
       ORDER BY fecha DESC
       LIMIT 90`,
      [cliente_id]
    );

    res.json({
      ok: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
      registros: dataRes.rows,
      resumen_fechas: resumenRes.rows
    });
  } catch (err) {
    console.error('GET /historial-cambios error:', err.message);
    res.status(500).json({ mensaje: 'Error al obtener historial', detalle: err.message });
  }
});

module.exports = router;
