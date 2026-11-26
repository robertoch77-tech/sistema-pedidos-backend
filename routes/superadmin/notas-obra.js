const express = require('express');
const pool = require('../../db');
const notas = require('../../services/notasObra');
const { verificarCualquierToken, verificarClienteId } = require('./authMiddleware');

const router = express.Router();
router.use(verificarCualquierToken);

function ejecutar(operacion, lectura = false) {
  return async (req, res) => {
    let db;
    try {
      const clienteId = notas.entero(req.params.cliente_id);
      db = await pool.connect();
      await db.query(lectura ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await notas.exigirVentas(db, clienteId);
      const resultado = await operacion(db, clienteId, req);
      await db.query('COMMIT');
      res.json(resultado);
    } catch (err) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      if (!err.statusCode) console.error('Notas de obra:', err.message);
      res.status(err.statusCode || 500).json({mensaje: err.statusCode ? err.message : 'No se pudo completar la operación de notas de obra.'});
    } finally {
      if (db) db.release();
    }
  };
}

router.get('/:cliente_id', verificarClienteId, ejecutar(async (db, clienteId, req) => {
  const { estado, q } = req.query;
  const filtros = ['n.cliente_id=$1'];
  const valores = [clienteId];
  if (estado === 'abierta') filtros.push('n.venta_id IS NULL');
  if (estado === 'finalizada') filtros.push('n.venta_id IS NOT NULL');
  if (q) {
    valores.push('%' + q + '%');
    filtros.push('(c.comprador_nombre ILIKE $2 OR c.comprador_cuit ILIKE $2 OR n.obra ILIKE $2)');
  }
  const r = await db.query(notas.cabecera + ' WHERE ' + filtros.join(' AND ') + ' ORDER BY n.actualizado_en DESC,n.id DESC',valores);
  return {notas:r.rows};
}, true));

router.post('/:cliente_id', verificarClienteId, ejecutar((db,c,req) => notas.crear(db,c,req.body)));
router.get('/:cliente_id/:id', verificarClienteId, ejecutar((db,c,req) => notas.detalle(db,c,notas.entero(req.params.id)),true));
router.post('/:cliente_id/:id/movimientos', verificarClienteId, ejecutar((db,c,req) => notas.registrar(db,c,notas.entero(req.params.id),req.body)));

module.exports = router;
