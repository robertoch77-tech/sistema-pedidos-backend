const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { asegurarTablas } = require('../services/notificacionesIvan');

const router = express.Router();

function verificarMayorista(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ mensaje: 'Sesion requerida' });
  try {
    const sesion = jwt.verify(token, process.env.JWT_SECRET);
    if (sesion.tipo === 'cliente') return res.status(403).json({ mensaje: 'Acceso denegado' });
    req.mayoristaSesionId = Number(sesion.id);
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Sesion vencida' });
  }
}

function validarPropietario(req, res, next) {
  if (Number(req.params.mayorista_id) !== req.mayoristaSesionId) {
    return res.status(403).json({ mensaje: 'Acceso denegado' });
  }
  next();
}

router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.IVAN_VAPID_PUBLIC_KEY || '' });
});

router.use(verificarMayorista);

router.get('/:mayorista_id', validarPropietario, async (req, res) => {
  try {
    await asegurarTablas();
    const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 100);
    const [resultado, conteo] = await Promise.all([pool.query(
      `SELECT id,tipo,referencia_id,cliente_cuit,cliente_nombre,titulo,resumen,datos,leida,fecha
       FROM notificaciones_ivan_eventos WHERE mayorista_id=$1
       ORDER BY fecha DESC LIMIT $2`,
      [req.mayoristaSesionId, limite]
    ), pool.query(
      'SELECT COUNT(*)::int AS total FROM notificaciones_ivan_eventos WHERE mayorista_id=$1 AND leida=false',
      [req.mayoristaSesionId]
    )]);
    const noLeidas = conteo.rows[0]?.total || 0;
    res.json({ items: resultado.rows, no_leidas: noLeidas });
  } catch (error) {
    console.error('[T21] Listar:', error.message);
    res.status(500).json({ mensaje: 'No se pudieron cargar los avisos' });
  }
});

router.put('/:mayorista_id/leidas', validarPropietario, async (req, res) => {
  try {
    await asegurarTablas();
    await pool.query('UPDATE notificaciones_ivan_eventos SET leida=true WHERE mayorista_id=$1', [req.mayoristaSesionId]);
    res.json({ ok: true });
  } catch { res.status(500).json({ mensaje: 'No se pudieron actualizar los avisos' }); }
});

router.put('/:mayorista_id/:id/leida', validarPropietario, async (req, res) => {
  try {
    await asegurarTablas();
    const resultado = await pool.query(
      'UPDATE notificaciones_ivan_eventos SET leida=true WHERE id=$1 AND mayorista_id=$2 RETURNING id',
      [req.params.id, req.mayoristaSesionId]
    );
    if (!resultado.rows[0]) return res.status(404).json({ mensaje: 'Aviso no encontrado' });
    res.json({ ok: true });
  } catch { res.status(500).json({ mensaje: 'No se pudo actualizar el aviso' }); }
});

router.post('/:mayorista_id/suscripcion', validarPropietario, async (req, res) => {
  try {
    await asegurarTablas();
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ mensaje: 'Suscripcion invalida' });
    await pool.query(
      `INSERT INTO notificaciones_ivan_suscripciones (mayorista_id,endpoint,p256dh,auth,activa)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (endpoint) DO UPDATE SET
         mayorista_id=EXCLUDED.mayorista_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,
         activa=true,fecha_actualizacion=NOW()`,
      [req.mayoristaSesionId, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[T21] Suscripcion:', error.message);
    res.status(500).json({ mensaje: 'No se pudo activar la notificacion' });
  }
});

router.delete('/:mayorista_id/suscripcion', validarPropietario, async (req, res) => {
  try {
    await asegurarTablas();
    const { endpoint } = req.body || {};
    if (endpoint) await pool.query(
      'UPDATE notificaciones_ivan_suscripciones SET activa=false WHERE endpoint=$1 AND mayorista_id=$2',
      [endpoint, req.mayoristaSesionId]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ mensaje: 'No se pudo desactivar la notificacion' }); }
});

module.exports = router;
