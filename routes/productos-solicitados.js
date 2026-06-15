const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET ranking de productos solicitados (más y menos)
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const { fecha_desde, fecha_hasta, limite_mas, limite_menos } = req.query;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({ mensaje: 'Faltan fechas' });
    }

    const limMas = parseInt(limite_mas) || 100;
    const limMenos = parseInt(limite_menos) || 300;

    const baseQuery = `
      SELECT pwi.codigo, pwi.nombre, SUM(pwi.cantidad) AS total
      FROM pedidos_web_items pwi
      JOIN pedidos_web p ON p.id = pwi.pedido_id
      WHERE p.mayorista_id = $1
        AND p.estado IN ('enviado','impreso')
        AND p.fecha_pedido >= ($2::date AT TIME ZONE 'America/Argentina/Buenos_Aires')
        AND p.fecha_pedido < (($3::date + interval '1 day') AT TIME ZONE 'America/Argentina/Buenos_Aires')
      GROUP BY pwi.codigo, pwi.nombre
    `;

    const masSolicitados = await pool.query(
      `${baseQuery} ORDER BY total DESC LIMIT $4`,
      [mayorista_id, fecha_desde, fecha_hasta, limMas]
    );

    const menosSolicitados = await pool.query(
      `${baseQuery} ORDER BY total ASC LIMIT $4`,
      [mayorista_id, fecha_desde, fecha_hasta, limMenos]
    );

    res.json({
      mas_solicitados: masSolicitados.rows,
      menos_solicitados: menosSolicitados.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

module.exports = router;