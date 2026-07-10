const express = require('express');
const router = express.Router();
const pool = require('../db');

// Guardar búsqueda sin resultado (o nuevo tipo de demanda)
router.post('/', async (req, res) => {
  try {
    const { mayorista_id, busqueda, cliente_nombre, tipo } = req.body;
    if (!mayorista_id || !busqueda || busqueda.trim().length < 2) {
      return res.json({ ok: false });
    }
    const tipofinal = tipo || 'no_encontrado';
    await pool.query(
      `INSERT INTO demanda_no_satisfecha (mayorista_id, busqueda, cliente_nombre, tipo)
       VALUES ($1, $2, $3, $4)`,
      [mayorista_id, busqueda.trim().toLowerCase(), cliente_nombre || '', tipofinal]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.json({ ok: false });
  }
});

// Consultar demanda agrupada por mayorista
router.get('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const { fecha_desde, fecha_hasta, busqueda, tipo } = req.query;
    const condiciones = ['mayorista_id = $1'];
    const params = [mayorista_id];
    let i = 2;

    if (fecha_desde) { condiciones.push(`fecha >= ($${i}::date AT TIME ZONE 'America/Argentina/Buenos_Aires')`); params.push(fecha_desde); i++; }
    if (fecha_hasta) { condiciones.push(`fecha < (($${i}::date + interval '1 day') AT TIME ZONE 'America/Argentina/Buenos_Aires')`); params.push(fecha_hasta); i++; }
    if (busqueda) { condiciones.push(`busqueda ILIKE $${i}`); params.push(`%${busqueda}%`); i++; }
    if (tipo) { condiciones.push(`tipo = $${i}`); params.push(tipo); i++; }

    const resultado = await pool.query(
      `SELECT
         busqueda,
         tipo,
         COUNT(*) as veces,
         MAX(fecha) as ultima_vez,
         array_agg(DISTINCT cliente_nombre) FILTER (WHERE cliente_nombre != '') as clientes
       FROM demanda_no_satisfecha
       WHERE ${condiciones.join(' AND ')}
       GROUP BY busqueda, tipo
       ORDER BY veces DESC, ultima_vez DESC
       LIMIT 200`,
      params
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

// Marcar búsqueda como atendida (borrar esa búsqueda específica)
router.delete('/:mayorista_id/atender', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    const { busqueda } = req.body;
    await pool.query(
      'DELETE FROM demanda_no_satisfecha WHERE mayorista_id = $1 AND busqueda = $2',
      [mayorista_id, busqueda]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.json({ ok: false });
  }
});

// Limpiar demanda (borrar todos los registros del mayorista)
router.delete('/:mayorista_id', async (req, res) => {
  try {
    const { mayorista_id } = req.params;
    await pool.query('DELETE FROM demanda_no_satisfecha WHERE mayorista_id = $1', [mayorista_id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.json({ ok: false });
  }
});

module.exports = router;