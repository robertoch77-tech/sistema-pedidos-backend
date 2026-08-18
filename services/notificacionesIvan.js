const pool = require('../db');
const webpush = require('web-push');

let inicializacion;

function prepararWebPush() {
  const publicKey = process.env.IVAN_VAPID_PUBLIC_KEY;
  const privateKey = process.env.IVAN_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.IVAN_VAPID_SUBJECT || 'mailto:soporte@gestionintegralpedidos.com',
    publicKey,
    privateKey
  );
  return true;
}

async function asegurarTablas() {
  if (!inicializacion) {
    inicializacion = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notificaciones_ivan_eventos (
          id BIGSERIAL PRIMARY KEY,
          mayorista_id BIGINT NOT NULL,
          tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('pedido','mensaje')),
          referencia_id VARCHAR(120) NOT NULL,
          cliente_cuit VARCHAR(40),
          cliente_nombre VARCHAR(200),
          titulo VARCHAR(200) NOT NULL,
          resumen TEXT NOT NULL DEFAULT '',
          datos JSONB NOT NULL DEFAULT '{}'::jsonb,
          leida BOOLEAN NOT NULL DEFAULT FALSE,
          fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (mayorista_id, tipo, referencia_id)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notificaciones_ivan_mayorista_fecha
        ON notificaciones_ivan_eventos (mayorista_id, fecha DESC)
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notificaciones_ivan_suscripciones (
          id BIGSERIAL PRIMARY KEY,
          mayorista_id BIGINT NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          activa BOOLEAN NOT NULL DEFAULT TRUE,
          fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_notificaciones_ivan_suscripciones_mayorista
        ON notificaciones_ivan_suscripciones (mayorista_id, activa)
      `);
    })().catch(error => {
      inicializacion = null;
      throw error;
    });
  }
  return inicializacion;
}

async function enviarPush(mayoristaId, evento) {
  if (!prepararWebPush()) return;
  const resultado = await pool.query(
    `SELECT id, endpoint, p256dh, auth
     FROM notificaciones_ivan_suscripciones
     WHERE mayorista_id=$1 AND activa=true`,
    [mayoristaId]
  );
  const payload = JSON.stringify({
    id: evento.id,
    tipo: evento.tipo,
    titulo: evento.titulo,
    resumen: evento.resumen,
    referencia_id: evento.referencia_id,
    cliente_cuit: evento.cliente_cuit,
    cliente_nombre: evento.cliente_nombre,
  });
  await Promise.allSettled(resultado.rows.map(async sub => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload, { TTL: 60 * 60 * 12, urgency: 'high' });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.query('UPDATE notificaciones_ivan_suscripciones SET activa=false WHERE id=$1', [sub.id]);
      } else {
        console.error('[T21] Error Web Push:', error.message);
      }
    }
  }));
}

async function registrarNotificacionIvan({ mayoristaId, tipo, referenciaId, clienteCuit, clienteNombre, titulo, resumen, datos = {} }) {
  try {
    await asegurarTablas();
    const resultado = await pool.query(
      `INSERT INTO notificaciones_ivan_eventos
        (mayorista_id,tipo,referencia_id,cliente_cuit,cliente_nombre,titulo,resumen,datos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (mayorista_id,tipo,referencia_id) DO NOTHING
       RETURNING *`,
      [mayoristaId, tipo, String(referenciaId), clienteCuit || '', clienteNombre || '', titulo, resumen || '', JSON.stringify(datos)]
    );
    const evento = resultado.rows[0];
    if (evento) enviarPush(mayoristaId, evento).catch(error => console.error('[T21] Push:', error.message));
    return evento || null;
  } catch (error) {
    // Una notificacion nunca debe impedir guardar un pedido o mensaje.
    console.error('[T21] No se pudo registrar la notificacion:', error.message);
    return null;
  }
}

module.exports = { asegurarTablas, registrarNotificacionIvan };
