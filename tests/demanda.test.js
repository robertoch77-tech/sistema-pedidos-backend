'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret-demanda';

let ultimaQuery = null;
let resultadoQuery = { rows: [], rowCount: 0 };
const poolMock = {
  query: async (sql, params) => {
    ultimaQuery = { sql, params };
    return typeof resultadoQuery === 'function' ? resultadoQuery(sql, params) : resultadoQuery;
  },
};
require.cache[require.resolve('../db')] = { id: require.resolve('../db'), exports: poolMock, loaded: true };

const demandaRouter = require('../routes/demanda');
const { normalizarClave } = require('../routes/demanda');

function crearRes() {
  const res = { _status: 200, _body: null,
    status(code) { res._status = code; return res; },
    json(obj) { res._body = obj; return res; },
  };
  return res;
}
function crearReq(o) { return { headers: {}, params: {}, query: {}, body: {}, ...o }; }

function tokenCliente(id = 1, cuit = '20-12345678-9', mayorista_id = 10) {
  return jwt.sign({ id, cuit, tipo: 'cliente', mayorista_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
function tokenClienteCuitNumerico(id = 2, cuit = 20123456789, mayorista_id = 10) {
  return jwt.sign({ id, cuit, tipo: 'cliente', mayorista_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
function tokenMayorista(id = 10) {
  return jwt.sign({ id, tipo: 'mayorista' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function extraerHandler(method, ruta) {
  const capa = demandaRouter.stack.find(l => l.route && l.route.path === ruta && l.route.methods[method]);
  if (!capa) throw new Error(`No ${method} ${ruta}`);
  const handlers = capa.route.stack.map(s => s.handle);
  return async (req, res) => { let i = 0; const next = (e) => { if (e) throw e; const fn = handlers[i++]; if (fn) return fn(req, res, next); }; return next(); };
}

const postHandler = extraerHandler('post', '/');
const getHandler = extraerHandler('get', '/:mayorista_id');
const putHandler = extraerHandler('put', '/:mayorista_id/estado');

async function ejecutarTests() {

  // ========== SEGURIDAD JWT ==========

  { const r = crearRes(); await postHandler(crearReq({ body: { busqueda: 'test' } }), r); assert.equal(r._status, 401, 'POST sin token: 401'); }
  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista()}` }, body: { busqueda: 'test' } }), r); assert.equal(r._status, 403, 'POST mayorista: 403'); }
  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: 'Bearer invalid.jwt' }, body: { busqueda: 'test' } }), r); assert.equal(r._status, 401, 'POST JWT invalido: 401'); }
  { const t = jwt.sign({ id: -1, cuit: '20-12345678-9', tipo: 'cliente', mayorista_id: 10 }, process.env.JWT_SECRET); const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${t}` }, body: { busqueda: 'test' } }), r); assert.equal(r._status, 403, 'POST id negativo: 403'); }
  { const r = crearRes(); await getHandler(crearReq({ params: { mayorista_id: '10' } }), r); assert.equal(r._status, 401, 'GET sin token: 401'); }
  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '99' } }), r); assert.equal(r._status, 403, 'GET cross-tenant: 403'); }
  { const r = crearRes(); await putHandler(crearReq({ params: { mayorista_id: '10' } }), r); assert.equal(r._status, 401, 'PUT sin token: 401'); }
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '99' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'atendida' } }), r); assert.equal(r._status, 403, 'PUT cross-tenant: 403'); }

  // ========== CUIT: string y numerico (compatible Ivan) ==========

  // CUIT string
  { resultadoQuery = { rows: [{ id: 1 }], rowCount: 1 }; const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente(1, '20-12345678-9', 10)}` }, body: { busqueda: 'producto test' } }), r); assert.equal(r._status, 201, 'CUIT string: 201'); assert.equal(ultimaQuery.params[2], '20-12345678-9', 'CUIT string se conserva'); }

  // CUIT numerico
  { resultadoQuery = { rows: [{ id: 2 }], rowCount: 1 }; const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenClienteCuitNumerico()}` }, body: { busqueda: 'producto test' } }), r); assert.equal(r._status, 201, 'CUIT numerico: 201'); assert.equal(ultimaQuery.params[2], '20123456789', 'CUIT numerico se convierte a string'); }

  // CUIT vacio → 403
  { const t = jwt.sign({ id: 1, cuit: '', tipo: 'cliente', mayorista_id: 10 }, process.env.JWT_SECRET); const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${t}` }, body: { busqueda: 'test' } }), r); assert.equal(r._status, 403, 'CUIT vacio: 403'); }

  // CUIT null → 403
  { const t = jwt.sign({ id: 1, cuit: null, tipo: 'cliente', mayorista_id: 10 }, process.env.JWT_SECRET); const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${t}` }, body: { busqueda: 'test' } }), r); assert.equal(r._status, 403, 'CUIT null: 403'); }

  // CUIT undefined → 403
  { const t = jwt.sign({ id: 1, tipo: 'cliente', mayorista_id: 10 }, process.env.JWT_SECRET); const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${t}` }, body: { busqueda: 'test' } }), r); assert.equal(r._status, 403, 'CUIT undefined: 403'); }

  // ========== VALIDACION POST ==========

  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: '' } }), r); assert.equal(r._status, 400, 'Busqueda vacia: 400'); }
  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'a' } }), r); assert.equal(r._status, 400, 'Busqueda 1 char: 400'); }
  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'x'.repeat(121) } }), r); assert.equal(r._status, 400, 'Busqueda >120: 400'); }
  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'test', tipo: 'visto_no_comprado' } }), r); assert.equal(r._status, 400, 'Tipo visto: 400'); }
  { const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'test', tipo: 'removido_carrito' } }), r); assert.equal(r._status, 400, 'Tipo removido: 400'); }

  // ========== REGISTRO Y DEDUP ==========

  // Exito
  { resultadoQuery = { rows: [{ id: 42 }], rowCount: 1 }; const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'cano grande' } }), r); assert.equal(r._status, 201); assert.equal(r._body.id, 42); assert.ok(ultimaQuery.sql.includes('ON CONFLICT')); assert.ok(ultimaQuery.sql.includes('DO NOTHING')); }

  // Duplicado mismo bloque
  { resultadoQuery = { rows: [], rowCount: 0 }; const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'cano grande' } }), r); assert.equal(r._status, 200); assert.equal(r._body.duplicado, true, 'Duplicado mismo bloque: duplicado=true'); }

  // Body mayorista_id ignorado
  { resultadoQuery = { rows: [{ id: 99 }], rowCount: 1 }; const r = crearRes(); await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente(1, '20-12345678-9', 10)}` }, body: { busqueda: 'test prod', mayorista_id: 999 } }), r); assert.equal(ultimaQuery.params[0], 10, 'mayorista_id del JWT, no body'); }

  // Contrato SQL dedup: bloques fijos 30 min
  { resultadoQuery = { rows: [{ id: 1 }], rowCount: 1 }; await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'producto test' } }), crearRes()); assert.ok(ultimaQuery.sql.includes("date_trunc('hour', NOW())"), 'SQL date_trunc'); assert.ok(ultimaQuery.sql.includes("floor(extract(minute FROM NOW()) / 30)"), 'SQL floor(minute/30)'); }

  // ========== NORMALIZACION ==========

  { resultadoQuery = { rows: [{ id: 1 }], rowCount: 1 }; await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: '  CAÑO   Grande  ' } }), crearRes()); assert.equal(ultimaQuery.params[5], 'cano grande', 'NFD: CAÑO→cano'); }
  { resultadoQuery = { rows: [{ id: 2 }], rowCount: 1 }; await postHandler(crearReq({ headers: { authorization: `Bearer ${tokenCliente()}` }, body: { busqueda: 'café' } }), crearRes()); assert.equal(ultimaQuery.params[5], 'cafe', 'NFD: cafe→cafe'); }

  // normalizarClave exportada para verificar compatibilidad
  assert.equal(normalizarClave('CAÑO'), 'cano', 'normalizarClave: CAÑO→cano');
  assert.equal(normalizarClave('  Café   CON   Leche  '), 'cafe con leche', 'normalizarClave: acentos+espacios');

  // ========== VALIDACION GET: FECHAS CALENDARIO ==========

  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { fecha_desde: 'no-fecha' } }), r); assert.equal(r._status, 400, 'GET fecha texto: 400'); }
  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { fecha_desde: '2026-02-31' } }), r); assert.equal(r._status, 400, 'GET feb 31: 400'); }
  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { fecha_desde: '2026-13-01' } }), r); assert.equal(r._status, 400, 'GET mes 13: 400'); }
  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { fecha_desde: '2026-00-10' } }), r); assert.equal(r._status, 400, 'GET mes 00: 400'); }
  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { fecha_desde: '2026-08-30', fecha_hasta: '2026-08-01' } }), r); assert.equal(r._status, 400, 'GET desde>hasta: 400'); }
  { const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { estado: 'borrada' } }), r); assert.equal(r._status, 400, 'GET estado invalido: 400'); }

  // GET sin estado (carga todos)
  { resultadoQuery = { rows: [{ clave_normalizada: 'test', veces: 5 }], rowCount: 1 }; const r = crearRes(); await getHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, query: { fecha_desde: '2026-01-01', fecha_hasta: '2026-12-31' } }), r); assert.equal(r._status, 200); assert.ok(!ultimaQuery.sql.includes('estado ='), 'Sin estado: no filtra'); }

  // ========== PUT CON ESTADO_ANTERIOR ==========

  { resultadoQuery = { rows: [], rowCount: 3 }; const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'test', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'atendida' } }), r); assert.equal(r._status, 200); assert.equal(r._body.actualizado, 3); assert.ok(ultimaQuery.sql.includes('AND estado = $4')); }

  { resultadoQuery = { rows: [], rowCount: 2 }; const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'test', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'descartada', motivo: 'No es producto' } }), r); assert.equal(r._status, 200); assert.ok(ultimaQuery.params.includes('No es producto')); }

  { resultadoQuery = { rows: [], rowCount: 1 }; const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'test', tipo: 'no_encontrado', estado_anterior: 'atendida', estado_nuevo: 'pendiente' } }), r); assert.equal(r._status, 200); }

  // estado_anterior incorrecto → 404
  { resultadoQuery = { rows: [], rowCount: 0 }; const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'descartada', estado_nuevo: 'atendida' } }), r); assert.equal(r._status, 404, 'estado_anterior incorrecto: 404'); }

  // Mismo estado → 400
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'pendiente' } }), r); assert.equal(r._status, 400, 'Mismo estado: 400'); }

  // Sin estado_anterior → 400
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_nuevo: 'atendida' } }), r); assert.equal(r._status, 400); }

  // estado_nuevo invalido → 400
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'borrada' } }), r); assert.equal(r._status, 400); }

  // ========== MOTIVO: tipo, trim, max ==========

  // Motivo numerico → 400
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'descartada', motivo: 12345 } }), r); assert.equal(r._status, 400, 'Motivo numerico: 400'); assert.ok(r._body.mensaje.includes('texto'), 'Mensaje indica texto'); }

  // Motivo objeto → 400
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'descartada', motivo: { foo: 1 } } }), r); assert.equal(r._status, 400, 'Motivo objeto: 400'); }

  // Motivo 301 chars → 400
  { const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'descartada', motivo: 'x'.repeat(301) } }), r); assert.equal(r._status, 400, 'Motivo >300: 400'); }

  // Motivo con trim se acepta
  { resultadoQuery = { rows: [], rowCount: 1 }; const r = crearRes(); await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'descartada', motivo: '  razon valida  ' } }), r); assert.equal(r._status, 200); assert.equal(ultimaQuery.params[ultimaQuery.params.length - 1], 'razon valida', 'Motivo trimmed'); }

  // ========== NO DELETE ==========

  { const tiene = demandaRouter.stack.some(l => l.route && l.route.methods.delete); assert.equal(tiene, false, 'No DELETE'); }

  // ========== MIGRACION: lectura y verificacion ==========

  {
    const migPath = path.join(__dirname, '..', 'migrations', '002_demanda_segura.sql');
    const sql = fs.readFileSync(migPath, 'utf8');

    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS clave_normalizada'), 'Migracion: columna clave_normalizada');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS estado'), 'Migracion: columna estado');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS ventana_inicio'), 'Migracion: columna ventana_inicio');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS es_legado'), 'Migracion: columna es_legado');
    assert.ok(sql.includes("es_legado = TRUE"), 'Migracion: marca legados');
    assert.ok(sql.includes('idx_demanda_dedup'), 'Migracion: indice dedup');
    assert.ok(sql.includes('WHERE cliente_cuit IS NOT NULL'), 'Migracion: indice parcial');

    // Backfill de legados traduce acentos
    assert.ok(sql.includes('translate('), 'Migracion: usa translate() para acentos');
    assert.ok(sql.includes("'áéíóúüñàèìòùâêîôûãõäëïöü'"), 'Migracion: mapa acentos origen');
    assert.ok(sql.includes("'aeiouunaeiouaeiouaoaeiou'"), 'Migracion: mapa acentos destino');

    // busqueda NULL o vacia recibe clave gestionable
    assert.ok(sql.includes("'_vacio'"), 'Migracion: busqueda vacia → _vacio');
    assert.ok(sql.includes("busqueda IS NULL OR trim(busqueda) = ''"), 'Migracion: maneja NULL y vacia');

    // Compatibilidad: la migracion produce la misma clave que normalizarClave() para texto comun
    // Ejemplo conceptual: "CAÑO" historico → translate(lower(...)) = "caño" → translate acentos → "cano"
    // normalizarClave("CAÑO") en JS = "cano" ✓
    assert.equal(normalizarClave('CAÑO'), 'cano', 'Compatibilidad: JS CAÑO→cano');
    // La migracion SQL haria: lower("CAÑO")="caño" → translate ñ→n = "cano" ✓

    assert.ok(sql.includes("demanda_estado_valido"), 'Migracion: constraint estado');
    assert.ok(!sql.includes('DROP'), 'Migracion: no destructiva');
  }

  // ========== SQL: UPDATE filtra por estado_anterior ==========

  { resultadoQuery = { rows: [], rowCount: 1 }; await putHandler(crearReq({ headers: { authorization: `Bearer ${tokenMayorista(10)}` }, params: { mayorista_id: '10' }, body: { clave_normalizada: 'x', tipo: 'no_encontrado', estado_anterior: 'pendiente', estado_nuevo: 'atendida' } }), crearRes()); assert.ok(ultimaQuery.sql.includes('AND estado = $4')); assert.equal(ultimaQuery.params[3], 'pendiente', '$4=estado_anterior'); assert.equal(ultimaQuery.params[4], 'atendida', '$5=estado_nuevo'); }

  console.log('demanda.test.js: OK');
  console.log('  Pruebas automaticas: JWT, CUIT string/numerico/null, validacion, normalizacion, estado_anterior, motivo tipo/trim/max, lectura migracion');
  console.log('  Contrato SQL verificado: dedup bloques 30min, UPDATE WHERE estado=$4');
  console.log('  Limitacion: concurrencia PostgreSQL y bloque posterior requieren base real');
}

ejecutarTests().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
