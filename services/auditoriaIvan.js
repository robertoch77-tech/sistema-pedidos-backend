const pool = require('../db');

let tablasListas = null;

async function asegurarTablas() {
  if (!tablasListas) {
    tablasListas = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria_descuentos_ivan (
          id BIGSERIAL PRIMARY KEY,
          mayorista_id INTEGER NOT NULL,
          cuit VARCHAR(30) NOT NULL,
          porcentaje NUMERIC NOT NULL DEFAULT 0,
          estado VARCHAR(20) NOT NULL DEFAULT 'ok',
          mensaje TEXT,
          consultado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_auditoria_descuentos_cuit ON auditoria_descuentos_ivan (mayorista_id, cuit, consultado_en DESC)');
      await pool.query('ALTER TABLE auditoria_descuentos_ivan ALTER COLUMN porcentaje DROP NOT NULL');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria_pedidos_ivan (
          pedido_web_id BIGINT PRIMARY KEY,
          mayorista_id INTEGER NOT NULL,
          numero_pedido VARCHAR(100),
          cliente_cuit VARCHAR(30),
          estado VARCHAR(30) NOT NULL,
          pedido_ivan_id VARCHAR(100),
          mensaje TEXT,
          actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_auditoria_pedidos_estado ON auditoria_pedidos_ivan (estado, actualizado_en DESC)');
    })().catch(error => {
      tablasListas = null;
      throw error;
    });
  }
  return tablasListas;
}

async function registrarDescuento({ mayoristaId, cuit, porcentaje, estado = 'ok', mensaje = null }) {
  await asegurarTablas();
  await pool.query(
    `INSERT INTO auditoria_descuentos_ivan (mayorista_id,cuit,porcentaje,estado,mensaje)
     VALUES ($1,$2,$3,$4,$5)`,
    [mayoristaId, String(cuit || '').replace(/\D/g, ''), porcentaje == null ? null : Number(porcentaje), estado, mensaje]
  );
}

async function registrarPedido({ pedidoWebId, mayoristaId, numeroPedido, clienteCuit, estado, pedidoIvanId = null, mensaje = null }) {
  await asegurarTablas();
  await pool.query(
    `INSERT INTO auditoria_pedidos_ivan
       (pedido_web_id,mayorista_id,numero_pedido,cliente_cuit,estado,pedido_ivan_id,mensaje)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (pedido_web_id) DO UPDATE SET
       estado=EXCLUDED.estado, pedido_ivan_id=EXCLUDED.pedido_ivan_id,
       mensaje=EXCLUDED.mensaje, actualizado_en=NOW()`,
    [pedidoWebId, mayoristaId, numeroPedido, clienteCuit, estado, pedidoIvanId, mensaje]
  );
}

function sinInterrumpir(promesa, contexto) {
  Promise.resolve(promesa).catch(error => console.error(`[AUDITORIA IVAN] ${contexto}:`, error.message));
}

module.exports = { asegurarTablas, registrarDescuento, registrarPedido, sinInterrumpir };
