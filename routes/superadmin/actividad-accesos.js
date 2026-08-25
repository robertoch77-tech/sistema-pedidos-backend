const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../db');
const { verificarCualquierToken, verificarSoloSuperadmin } = require('./authMiddleware');
const { asegurarTablas, hashSesion, registrarInicio, registrarPulso, registrarCierre } = require('../../services/actividadAccesos');

const router = express.Router();

async function validarSesionCliente(req, res, next) {
  const token = req.headers['x-roberto-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sesión requerida' });

  try {
    if (String(token).startsWith('rp_')) {
      const sesion = await pool.query('SELECT cliente_id, expira_en FROM sesiones_portal WHERE token=$1', [token]);
      if (!sesion.rows[0] || Number(sesion.rows[0].expira_en) < Date.now()) {
        return res.status(401).json({ error: 'Sesión inválida o expirada' });
      }
      req.actividadClienteRobertoId = sesion.rows[0].cliente_id;
    } else {
      jwt.verify(token, process.env.JWT_SECRET);
    }
    req.actividadToken = token;
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

router.post('/pulso', validarSesionCliente, async (req, res) => {
  try {
    let encontrada = await registrarPulso(req.actividadToken);
    if (req.actividadClienteRobertoId) {
      const cliente = await pool.query(
        `SELECT id, nombre_comercial, razon_social, codigo_acceso
         FROM clientes_roberto WHERE id=$1`,
        [req.actividadClienteRobertoId]
      );
      if (cliente.rows[0]) {
        const datos = cliente.rows[0];
        if (encontrada) {
          await pool.query(
            `UPDATE sesiones_actividad
             SET actor_id=$2, empresa_id=$3, nombre=$4, identificador=$5
             WHERE sesion_hash=$1`,
            [hashSesion(req.actividadToken), String(datos.id), datos.id, datos.nombre_comercial || datos.razon_social, datos.codigo_acceso]
          );
        } else {
          await registrarInicio({
            token: req.actividadToken,
            sistema: 'roberto',
            tipoActor: 'cliente_roberto',
            actorId: datos.id,
            empresaId: datos.id,
            nombre: datos.nombre_comercial || datos.razon_social,
            identificador: datos.codigo_acceso,
            req,
          });
          encontrada = true;
        }
      }
    }
    res.json({ ok: true, registrada: encontrada });
  } catch (error) {
    console.error('[ACTIVIDAD] pulso:', error.message);
    res.json({ ok: true, registrada: false });
  }
});

router.post('/cerrar', validarSesionCliente, async (req, res) => {
  try {
    await registrarCierre(req.actividadToken);
    res.json({ ok: true });
  } catch (error) {
    console.error('[ACTIVIDAD] cierre:', error.message);
    res.json({ ok: true });
  }
});

router.get('/', verificarCualquierToken, verificarSoloSuperadmin, async (req, res) => {
  try {
    await asegurarTablas();
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
    const sistema = ['roberto', 'ivan'].includes(String(req.query.sistema)) ? String(req.query.sistema) : null;
    const { rows } = await pool.query(`
      SELECT id, sistema, tipo_actor, actor_id, empresa_id, nombre, identificador,
             inicio_en, ultima_actividad_en, cierre_en,
             (cierre_en IS NULL AND ultima_actividad_en >= NOW() - INTERVAL '3 minutes') AS en_linea,
             GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(cierre_en, ultima_actividad_en) - inicio_en)))::BIGINT AS duracion_segundos,
             CASE
               WHEN user_agent ILIKE '%Mobile%' OR user_agent ILIKE '%Android%' OR user_agent ILIKE '%iPhone%' THEN 'Celular'
               ELSE 'Computadora'
             END AS dispositivo
      FROM sesiones_actividad
      WHERE inicio_en >= NOW() - ($1::text || ' days')::interval
        AND ($2::text IS NULL OR sistema = $2)
      ORDER BY ultima_actividad_en DESC
      LIMIT 500
    `, [dias, sistema]);
    const clientes = sistema === 'ivan' ? [] : (await pool.query(`
      SELECT c.id, c.nombre_comercial AS nombre, c.cuit, c.estado,
             ultima.inicio_en AS ultimo_ingreso,
             ultima.ultima_actividad_en,
             (ultima.cierre_en IS NULL AND ultima.ultima_actividad_en >= NOW() - INTERVAL '3 minutes') AS en_linea
      FROM clientes_roberto c
      LEFT JOIN LATERAL (
        SELECT s.inicio_en, s.ultima_actividad_en, s.cierre_en
        FROM sesiones_actividad s
        WHERE s.sistema='roberto' AND s.empresa_id=c.id
        ORDER BY s.ultima_actividad_en DESC LIMIT 1
      ) ultima ON true
      ORDER BY c.nombre_comercial
    `)).rows;
    res.json({ sesiones: rows, clientes, criterio_en_linea_minutos: 3 });
  } catch (error) {
    console.error('[ACTIVIDAD] listado:', error.message);
    res.status(500).json({ error: 'No se pudo consultar la actividad' });
  }
});

module.exports = router;
