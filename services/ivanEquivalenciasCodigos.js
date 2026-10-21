const pool = require('../db');
const { errorCliente } = require('./ivanImagenesDatos');
const normalizarCodigo = valor => String(valor ?? '').trim().toUpperCase();

async function configuracion(id) {
  try {
    const r = await pool.query(`SELECT
      COALESCE(to_jsonb(f)->>'equivalencias_modo','grupo') AS equivalencias_modo,
      EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.ivan_funciones_config'::regclass
        AND attname='equivalencias_modo' AND NOT attisdropped) AS equivalencias_modo_disponible
      FROM (SELECT $1::bigint AS id) m
      LEFT JOIN public.ivan_funciones_config f ON f.mayorista_id=m.id`, [id]);
    const cfg = r.rows[0];
    if (!cfg || !['grupo', 'codigos'].includes(cfg.equivalencias_modo)) throw errorCliente('No se pudo comprobar el modo de equivalencias.', 503);
    return cfg;
  } catch (e) {
    if (e.code === '42P01') return { equivalencias_modo: 'grupo', equivalencias_modo_disponible: false };
    throw e;
  }
}

function referencias(origenes) {
  if (origenes.length > 200) throw errorCliente('Consultá hasta 200 productos para sus equivalencias.');
  const porDestino = new Map();
  for (const producto of origenes) {
    const origen = normalizarCodigo(producto.cod_producto);
    if (!origen) continue;
    const lista = String(producto.equivalencia_grupo ?? '').split(/[,;\r\n]+/);
    for (const valor of lista) {
      const destino = normalizarCodigo(valor);
      if (!destino || destino === origen) continue;
      if (!porDestino.has(destino)) porDestino.set(destino, new Set());
      porDestino.get(destino).add(origen);
      if (porDestino.size > 1000) throw errorCliente('La consulta supera 1.000 códigos equivalentes. Buscá menos productos por vez.');
    }
  }
  return {
    codigos: Array.from(porDestino.keys()),
    origenesDe: codigo => Array.from(porDestino.get(normalizarCodigo(codigo)) || []),
  };
}

module.exports = { configuracion, referencias, normalizarCodigo };
