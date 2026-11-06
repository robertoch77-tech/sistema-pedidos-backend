'use strict';
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const conexion = require('../services/conexionMayorista');
const config = require('../services/ivanClienteConsultasConfig');
const datos = require('../services/ivanClienteConsultasDatos');
const descuentos = require('../services/ivanDescuentosComerciales');
const circuito = require('../services/ivanCircuitoCliente');
const catalogo = require('./productos');
const router = express.Router();
const ruta = f => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
async function autenticar(req, id) {
  let sesion;
  try { sesion = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { throw Object.assign(config.fallo('Tu sesión venció. Ingresá nuevamente para consultar tu cuenta.', 401), { codigo: 'SESION_CLIENTE_VENCIDA' }); }
  const cuit = String(sesion.cuit || '').replace(/\D/g, '');
  if (sesion.tipo !== 'cliente' || Number(sesion.mayorista_id) !== id || !/^\d{7,20}$/.test(cuit)) throw Object.assign(config.fallo('La sesión no corresponde a este mayorista.', 403), { codigo: 'SESION_CLIENTE_INCORRECTA' });
  const cuenta = await pool.query(`SELECT id,nombre,razon_social,mostrar_precios FROM mayoristas
    WHERE id=$1 AND activo=true AND COALESCE(tipo_fuente,'ivan')<>'roberto'`, [id]);
  if (cuenta.rows.length !== 1) throw config.fallo('El mayorista no está disponible.', 403);
  req.consultaCliente = { id, cuit, mayorista: cuenta.rows[0] };
  req.consultaConfig = await config.leer(id);
}
const idValido = valor => { const id = Number(valor); if (!Number.isSafeInteger(id) || id <= 0) throw config.fallo('Mayorista inválido.'); return id; };
router.get('/configuracion/:id', ruta(async (req, res) => {
  await autenticar(req, idValido(req.params.id));
  const c = req.consultaConfig;
  res.json({ descuentos: c.descuentos, pdf: c.pdf && req.consultaCliente.mayorista.mostrar_precios === true,
    excel: c.excel && req.consultaCliente.mayorista.mostrar_precios === true });
}));
const limite = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => req.consultaCliente.id + ':' + req.consultaCliente.cuit,
  message: { mensaje: 'Esperá un momento antes de actualizar otra vez tus condiciones.' } });
router.get('/descuentos/:id', ruta(async (req, res, next) => {
  await autenticar(req, idValido(req.params.id));
  if (!req.consultaConfig.descuentos) throw config.fallo('La consulta de descuentos no está habilitada.', 403);
  next();
}), limite, ruta(async (req, res) => {
  datos.filtros(req.query);
  const cfg = await descuentos.leer(req.consultaCliente.id);
  if (!circuito.activo(cfg)) throw config.fallo('El mayorista todavía no tiene disponible esta consulta de descuentos.', 409);
  const resultado = await circuito.consultarCliente(req.consultaCliente.id, req.consultaCliente.cuit, req.query.actualizar === '1', cfg);
  res.json(datos.condiciones(resultado, req.query));
}));
const limiteExportacion = rateLimit({ windowMs: 60000, limit: 4, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => req.consultaCliente.id + ':' + req.consultaCliente.cuit,
  message: { mensaje: 'Esperá un momento antes de generar otra lista completa.' } });
router.use('/lista', ruta(async (req, res, next) => {
  const rutaLista = /^\/([1-9]\d*)(?:\/(opciones|todos))?\/?$/.exec(req.path);
  if (req.method !== 'GET' || !rutaLista) throw config.fallo('Consulta no disponible.', 404);
  await autenticar(req, idValido(rutaLista[1]));
  const cfg = req.consultaConfig;
  if (!(cfg.pdf || cfg.excel) || req.consultaCliente.mayorista.mostrar_precios !== true) throw config.fallo('La lista de precios no está habilitada.', 403);
  datos.filtros(req.query);
  const exportacion = rutaLista[2] === 'todos';
  if (exportacion && !(['pdf', 'excel'].includes(req.query.formato) && cfg[req.query.formato])) throw config.fallo('Este formato no está habilitado por el mayorista.', 403);
  req.consultaRutaLista = rutaLista;
  req.consultaExportacion = exportacion;
  next();
}), (req, res, next) => req.consultaExportacion ? limiteExportacion(req, res, next) : next(), ruta(async (req, res, next) => {
  const rutaLista = req.consultaRutaLista, exportacion = req.consultaExportacion;
  const db = await conexion.getConexionMayorista(req.consultaCliente.id);
  if (!db) throw config.fallo('No se pudo consultar tu cuenta.', 503);
  const identidad = await db.query(`SELECT COALESCE(NULLIF(BTRIM(nom_fan_cliente),''),BTRIM(raz_soc_cliente),'') AS nombre
    FROM "viewClientes" WHERE es_activo=true AND regexp_replace(doc_cliente::text,'[^0-9]','','g')=$1 LIMIT 2`, [req.consultaCliente.cuit]);
  if (identidad.rows.length !== 1) throw config.fallo('No se pudo identificar una única cuenta activa.', 409);
  const original = res.json.bind(res);
  res.json = respuesta => {
    res.json = original;
    if (res.statusCode >= 400) return original(respuesta);
    try {
      if (rutaLista[2] === 'opciones') {
        if (['marcas', 'rubros', 'tipos'].some(k => !Array.isArray(respuesta[k]) || respuesta[k].some(v => typeof v !== 'string'))) throw config.fallo('No se pudieron leer los filtros.', 503);
        return original({ marcas: respuesta.marcas, rubros: respuesta.rubros, tipos: respuesta.tipos });
      }
      return original({ ...datos.lista(respuesta, req.query, exportacion),
        mayorista_id: req.consultaCliente.id,
        cliente: { nombre: identidad.rows[0].nombre, cuit: req.consultaCliente.cuit },
        mayorista: req.consultaCliente.mayorista.razon_social || req.consultaCliente.mayorista.nombre });
    } catch (e) { return res.status(e.status || 503).json({ mensaje: e.status ? e.message : 'No se pudo preparar tu lista de precios.' }); }
  };
  // Composición del mismo lector: conserva sesión, filtros y cálculo publicado.
  // Solo permite el listado, sus opciones y GET /todos. Ninguna escritura.
  catalogo(req, res, next);
}));
router.use((e, req, res, next) => {
  if (res.headersSent) return next(e);
  res.status(e.status || 503).json({ mensaje: e.status ? e.message : 'No pudimos completar la consulta. Reintentá en unos momentos.', ...(e.codigo ? { codigo: e.codigo } : {}) });
});
module.exports = router;
