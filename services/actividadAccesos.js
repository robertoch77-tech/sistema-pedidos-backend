const crypto = require('crypto');
const pool = require('../db');

let tablasListas = null;

function hashSesion(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function datosDispositivo(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    ip: forwarded || req.ip || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
  };
}

async function asegurarTablas() {
  if (!tablasListas) {
    tablasListas = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sesiones_actividad (
          id BIGSERIAL PRIMARY KEY,
          sesion_hash VARCHAR(64) UNIQUE NOT NULL,
          sistema VARCHAR(20) NOT NULL,
          tipo_actor VARCHAR(30) NOT NULL,
          actor_id VARCHAR(100),
          empresa_id INTEGER,
          nombre VARCHAR(200),
          identificador VARCHAR(200),
          ip VARCHAR(100),
          user_agent VARCHAR(500),
          inicio_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ultima_actividad_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          cierre_en TIMESTAMPTZ
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sesiones_actividad_ultima ON sesiones_actividad (ultima_actividad_en DESC)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sesiones_actividad_empresa ON sesiones_actividad (sistema, empresa_id)');
    })().catch(error => {
      tablasListas = null;
      throw error;
    });
  }
  return tablasListas;
}

async function registrarInicio({ token, sistema, tipoActor, actorId, empresaId, nombre, identificador, req }) {
  await asegurarTablas();
  const { ip, userAgent } = datosDispositivo(req);
  await pool.query(`
    INSERT INTO sesiones_actividad
      (sesion_hash, sistema, tipo_actor, actor_id, empresa_id, nombre, identificador, ip, user_agent)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (sesion_hash) DO UPDATE SET ultima_actividad_en=NOW(), cierre_en=NULL
  `, [hashSesion(token), sistema, tipoActor, actorId == null ? null : String(actorId), empresaId || null, nombre || null, identificador || null, ip, userAgent]);
}

async function registrarPulso(token) {
  await asegurarTablas();
  const result = await pool.query(
    'UPDATE sesiones_actividad SET ultima_actividad_en=NOW(), cierre_en=NULL WHERE sesion_hash=$1 RETURNING id',
    [hashSesion(token)]
  );
  return result.rowCount > 0;
}

async function registrarCierre(token) {
  await asegurarTablas();
  const result = await pool.query(
    'UPDATE sesiones_actividad SET ultima_actividad_en=NOW(), cierre_en=NOW() WHERE sesion_hash=$1 RETURNING id',
    [hashSesion(token)]
  );
  return result.rowCount > 0;
}

function sinInterrumpir(promesa, contexto) {
  Promise.resolve(promesa).catch(error => console.error(`[ACTIVIDAD] ${contexto}:`, error.message));
}

module.exports = { asegurarTablas, hashSesion, registrarInicio, registrarPulso, registrarCierre, sinInterrumpir };
