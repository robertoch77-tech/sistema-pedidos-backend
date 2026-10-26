const CACHE_TTL_MS = 5 * 60 * 1000;
const { registrarDescuento, sinInterrumpir } = require('./auditoriaIvan');
const { crearErrorCosto, registrarFalloCosto } = require('./ivanSesionCosto');
const cache = new Map();
const consultasEnCurso = new Map();

const clave = (mayoristaId, cuit) => `${mayoristaId}:${String(cuit || '').replace(/\D/g, '')}`;
const porcentajeSeguro = valor => {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 && numero <= 100 ? numero : null;
};

function guardarDescuentoItems(mayoristaId, cuit, porcentaje) {
  const tieneDato = porcentaje !== null && porcentaje !== undefined && porcentaje !== '';
  const porcentajeNormalizado = porcentajeSeguro(porcentaje);
  if (porcentajeNormalizado !== null) cache.set(clave(mayoristaId, cuit), { porcentaje: porcentajeNormalizado, verificadoEn: Date.now() });
  else cache.delete(clave(mayoristaId, cuit));
  sinInterrumpir(registrarDescuento({
    mayoristaId, cuit,
    porcentaje: porcentajeNormalizado,
    estado: porcentajeNormalizado !== null ? 'ok' : 'sin_dato',
    mensaje: porcentajeNormalizado !== null ? null : tieneDato ? 'El descuento recibido no es válido.' : 'Iván no devolvió un porcentaje de descuento',
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
         LIMIT 2`,
        [documento]
      );
      const porcentaje = porcentajeSeguro(resultado.rows[0]?.porcentaje_descuento_items);
      if (resultado.rows.length !== 1 || porcentaje === null) {
        throw crearErrorCosto(503, 'COSTO_CLIENTE_NO_VERIFICADO', 'No se pudo confirmar el descuento de tu CUIT. Reintentá la consulta de costos.');
      }
      guardarDescuentoItems(mayoristaId, cuit, porcentaje);
      return porcentaje;
    } catch (error) {
      console.error('Descuento Iván por CUIT no disponible:', error.message);
      const mensaje = 'No se pudo confirmar el descuento de tu CUIT en Iván. No se mostraron costos sin verificar.';
      registrarFalloCosto(mayoristaId, cuit, 'COSTO_CLIENTE_NO_VERIFICADO', mensaje);
      throw crearErrorCosto(503, 'COSTO_CLIENTE_NO_VERIFICADO', mensaje);
    } finally {
      consultasEnCurso.delete(cacheKey);
    }
  })();
  consultasEnCurso.set(cacheKey, consulta);
  return consulta;
}

module.exports = { guardarDescuentoItems, obtenerDescuentoItems };
