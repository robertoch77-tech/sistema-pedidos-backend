'use strict';

const { errorCliente } = require('./ivanImagenesDatos');
const cascada = require('./ivanCascadaOrigen');

function disponible(id, cfg) {
  return Number(id) === 23 && cfg?.datos?.ivan?.integracion === 'cuit_reglas_v3';
}
function leer(id, cfg) {
  if (!disponible(id, cfg)) return null;
  const dato = cfg.datos.ivan.pago_termino;
  if (!dato) return { habilitado: false, porcentaje: '0' };
  if (typeof dato.habilitado !== 'boolean') throw errorCliente('Revisá el descuento por pago en término.', 409);
  return { habilitado: dato.habilitado, porcentaje: cascada.porcentaje(dato.porcentaje) };
}
function validar(datos) {
  if (typeof datos?.habilitado !== 'boolean' || !Number.isSafeInteger(datos.version) || datos.version < 0 ||
      !['string', 'number'].includes(typeof datos.porcentaje)) throw errorCliente('Indicá el porcentaje y si se aplica el pago en término.');
  const porcentaje = cascada.porcentaje(datos.porcentaje);
  if (datos.habilitado && Number(porcentaje) <= 0) throw errorCliente('Para activarlo, indicá un descuento mayor a 0%.');
  return { habilitado: datos.habilitado, porcentaje };
}
function agregar(reglas, configuracion) {
  if (!configuracion?.habilitado) return reglas;
  return [...reglas, { etiqueta: 'Descuento por pago en término', porcentaje: configuracion.porcentaje,
    rubro: null, marca: null, tipo: null }];
}

module.exports = { disponible, leer, validar, agregar };
