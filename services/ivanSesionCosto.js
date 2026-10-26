'use strict';
const jwt = require('jsonwebtoken');
const { registrarDescuento, sinInterrumpir } = require('./auditoriaIvan');
const avisos = new Map();
const documento = v => String(v || '').replace(/\D/g, '');

function crearErrorCosto(status, codigo, mensaje) {
  return Object.assign(new Error(mensaje), { status, codigo, costo_cliente: true });
}

function registrarFalloCosto(mayoristaId, cuit, codigo, mensaje) {
  const doc = documento(cuit), id = Number(mayoristaId), ahora = Date.now();
  if (!Number.isSafeInteger(id) || id <= 0 || !/^\d{7,20}$/.test(doc)) return;
  const clave = id + ':' + doc + ':' + codigo;
  if (ahora - (avisos.get(clave) || 0) < 300000) return;
  for (const [k, fecha] of avisos) if (ahora - fecha >= 300000) avisos.delete(k);
  if (avisos.size >= 2000) avisos.delete(avisos.keys().next().value);
  avisos.set(clave, ahora);
  sinInterrumpir(registrarDescuento({ mayoristaId: id, cuit: doc, porcentaje: null,
    estado: codigo === 'SESION_CLIENTE_VENCIDA' ? 'sesion_vencida' : 'error', mensaje }), 'aviso de costo');
}

function validarSesionCosto(req, mayoristaId) {
  if (req.ivanSesionCosto?.mayoristaId === Number(mayoristaId)) return req.ivanSesionCosto.cliente;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const vistaCliente = req.query.vista === 'cliente';
  if (!token) {
    if (vistaCliente) throw crearErrorCosto(401, 'SESION_CLIENTE_REQUERIDA', 'Ingresá nuevamente para consultar tus costos y descuentos.');
    return null;
  }
  let sesion;
  try { sesion = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch (e) {
    if (e.name === 'TokenExpiredError') {
      // Verificar firma permite identificar el aviso, nunca conceder acceso.
      try {
        const anterior = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
        if (anterior.tipo === 'cliente' && Number(anterior.mayorista_id) === Number(mayoristaId)) {
          registrarFalloCosto(mayoristaId, anterior.cuit, 'SESION_CLIENTE_VENCIDA', 'Sesión vencida. Se bloqueó la consulta de costos sin sus descuentos.');
        }
      } catch (_) { /* Token sin firma valida: no atribuirlo a un cliente. */ }
    }
    throw crearErrorCosto(401, 'SESION_CLIENTE_VENCIDA', 'Tu sesión venció o no es válida. Ingresá nuevamente para consultar tus costos.');
  }
  if (sesion.tipo === 'cliente') {
    if (Number(sesion.mayorista_id) !== Number(mayoristaId) || !/^\d{7,20}$/.test(documento(sesion.cuit))) {
      throw crearErrorCosto(403, 'SESION_CLIENTE_INCORRECTA', 'La sesión no corresponde a este mayorista. Ingresá desde su enlace.');
    }
    req.res?.set('Cache-Control', 'no-store');
    return sesion;
  }
  if (vistaCliente) throw crearErrorCosto(403, 'SESION_CLIENTE_REQUERIDA', 'Ingresá con el CUIT del cliente para consultar sus costos.');
  // El listado general para gestion no representa un CUIT.
  if (sesion.tipo !== undefined || Number(sesion.id) !== Number(mayoristaId)) {
    throw crearErrorCosto(403, 'SESION_CLIENTE_INCORRECTA', 'La sesión no corresponde a este mayorista.');
  }
  return null;
}

module.exports = { validarSesionCosto, crearErrorCosto, registrarFalloCosto };
