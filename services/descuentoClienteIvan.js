const CACHE_TTL_MS = 5 * 60 * 1000;
const { registrarDescuento, sinInterrumpir } = require('./auditoriaIvan');
const cache = new Map();
const consultasEnCurso = new Map();

const clave = (mayoristaId, cuit) => `${mayoristaId}:${String(cuit || '').replace(/\D/g, '')}`;
const porcentajeSeguro = valor => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.min(100, Math.max(0, numero)) : 0;
};

function guardarDescuentoItems(mayoristaId, cuit, porcentaje) {
  const tieneDato = porcentaje !== null && porcentaje !== undefined && porcentaje !== '';
  const porcentajeNormalizado = porcentajeSeguro(porcentaje);
  cache.set(clave(mayoristaId, cuit), { porcentaje: porcentajeNormalizado, verificadoEn: Date.now() });
  sinInterrumpir(registrarDescuento({
    mayoristaId, cuit,
    porcentaje: tieneDato ? porcentajeNormalizado : null,
    estado: tieneDato ? 'ok' : 'sin_dato',
    mensaje: tieneDato ? null : 'Iván no devolvió un porcentaje de descuento',
  }), 'guardar descuento');
}

async function obtenerDescuentoItems(poolExterno, mayoristaId, cuit) {
  const cacheKey = clave(mayoristaId, cuit);
  const existente = cache.get(cacheKey);
  if (existente && Date.now() - existente.verificadoEn < CACHE_TTL_MS) return existente.porcentaje;
  if (consultasEnCurso.has(cacheKey)) return consultasEnCurso.get(cacheKey);

  const consulta = (async () => {
    try {
      const documento = String(cuit || '').replace(/\D/g, '');
      const resultado = await poolExterno.query(
        `SELECT porcentaje_descuento_items
         FROM "viewClientes"
         WHERE regexp_replace(doc_cliente::text, '[^0-9]', '', 'g') = $1
           AND es_activo = true
         LIMIT 1`,
        [documento]
      );
      const porcentaje = porcentajeSeguro(resultado.rows[0]?.porcentaje_descuento_items);
      guardarDescuentoItems(mayoristaId, cuit, porcentaje);
      return porcentaje;
    } catch (error) {
      console.error('Descuento Iván por CUIT no disponible:', error.message);
      sinInterrumpir(registrarDescuento({
        mayoristaId, cuit, porcentaje: existente?.porcentaje ?? 0,
        estado: 'error', mensaje: error.message,
      }), 'error descuento');
      return existente?.porcentaje ?? 0;
    } finally {
      consultasEnCurso.delete(cacheKey);
    }
  })();
  consultasEnCurso.set(cacheKey, consulta);
  return consulta;
}

module.exports = { guardarDescuentoItems, obtenerDescuentoItems };
