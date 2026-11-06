'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
function cargar(archivo, stubs) {
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'))(
    n => n in stubs ? stubs[n] : require(n), modulo, modulo.exports);
  return modulo.exports;
}
const fallo = (m, status = 400) => Object.assign(Error(m), { status });
const datos = cargar('services/ivanClienteConsultasDatos.js', { './ivanClienteConsultasConfig': { fallo } });
const origen = { id_producto: 3149, cod_producto: '03117301', des_producto: 'Junta Chevrolet',
  precio_producto: '37392.71', des_producto_rubro: 'JUNTAS', des_producto_marca: 'CHEVROLET/GM', des_producto_tipo: 'JGO',
  descuentos_comerciales: { interno: true }, iva_catalogo: { firma: 'privada' }, stock_temporal: 22 };
const condiciones = { cliente: { cuit: '20355412777', nombre: 'Cliente propio', general: '23', extra: '5', id: 1934 },
  pago_termino: { habilitado: true, porcentaje: '5' }, reglas: Array.from({ length: 1211 }, (_, i) => ({ id: i,
    porcentaje: '8', rubro: '84', marca: '45', tipo: '17', nombres: { rubro: 'JUNTAS', marca: 'MARCA A', tipo: 'JGO' } })) };

test('lista conserva exactamente el precio final y código; no revela diagnósticos ni stock', () => {
  const p = datos.lista({ productos: [origen], total: 1, pagina: 1, totalPaginas: 1 }, {}, false).productos[0];
  assert.equal(p.precio, 37392.71); assert.equal(p.codigo, '03117301');
  assert.deepEqual(Object.keys(p).sort(), ['id', 'codigo', 'descripcion', 'rubro', 'marca', 'tipo', 'precio'].sort());
});
test('exportación completa filtra dimensiones, mantiene precios y ordena, sin truncar', () => {
  const r = datos.lista({ productos: [origen, { ...origen, id_producto: 2, precio_producto: 1, des_producto_rubro: 'OTRO' }], total: 2 }, { rubro: 'JUNTAS' }, true);
  assert.equal(r.total, 1); assert.equal(r.productos[0].precio, 37392.71);
  assert.equal(datos.lista({ productos: [{ ...origen, des_producto_rubro: 'CAÑOS' }], total: 1 }, { rubro: 'CAÑOS' }, true).total, 1);
});
test('error o respuesta parcial nunca se transforma en cero ni en lista completa', () => {
  for (const precio_producto of [null, undefined, '', 'no', Infinity, -1]) assert.throws(() => datos.lista({ productos: [{ ...origen, precio_producto }], total: 1 }, {}, true), { status: 503 });
  for (const total of [undefined, -1, 1.5, 2]) assert.throws(() => datos.lista({ productos: [origen], total }, {}, true), { status: 503 });
  assert.equal(datos.lista({ productos: [{ ...origen, precio_producto: 0 }], total: 1 }, {}, true).productos[0].precio, 0);
});
test('más de mil condiciones se consultan y filtran; null no se inventa como 0%', () => {
  const r = datos.condiciones(condiciones, { pagina: '31', busqueda: 'juntas', marca: 'MARCA A' });
  assert.equal(r.total, 1211); assert.equal(r.reglas.length, 11); assert.equal(r.general, '23'); assert.equal(r.adicional, '5'); assert.equal(r.pago_termino, '5');
  assert.equal(JSON.stringify(r).includes('1934'), false); assert.equal(JSON.stringify(r).includes('fk_id'), false);
  const sin = datos.condiciones({ ...condiciones, cliente: { ...condiciones.cliente, general: null }, pago_termino: { habilitado: false } }, {});
  assert.equal(sin.general, null); assert.equal(sin.pago_termino, null);
});
test('rechaza filtros destinados a suplantar CUIT o gestión y parámetros no escalares', () => {
  for (const q of [{ cuit: 'otro' }, { vista: 'gestion' }, { id: 99 }, { marca: ['a'] }, { pagina: '-1' }, { orden_precio: 'DROP' }]) assert.throws(() => datos.filtros(q), { status: 400 });
});

test('router HTTP: permisos, sesión, CUIT y delegación del catálogo sin escrituras', async t => {
  const anterior = process.env.JWT_SECRET; process.env.JWT_SECRET = 'prueba-local-consultas-cliente-no-produccion';
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  let cfg = { descuentos: true, pdf: true, excel: false }, mostrar = true, activo = true, duplicado = false, fallar = false;
  const llamadas = [], consultas = [], central = [];
  const catalogo = express.Router();
  catalogo.get('/:mayorista_id/:extra?', (req, res) => {
    llamadas.push({ id: req.params.mayorista_id, extra: req.params.extra, query: req.query, auth: req.headers.authorization });
    if (fallar) return res.status(409).json({ mensaje: 'No se pudo confirmar el costo', codigo: 'CONDICIONES_IVAN_REVISAR' });
    if (req.params.extra === 'opciones') return res.json({ marcas: ['CHEVROLET/GM'], rubros: ['JUNTAS'], tipos: ['JGO'], privado: 123 });
    res.json({ productos: [origen], total: 1, pagina: 1, totalPaginas: 1 });
  });
  const router = cargar('routes/cliente-consultas.js', {
    '../db': { query: async (sql, params) => { central.push({ sql, params }); return { rows: activo ? [{ id: params[0], nombre: 'Moreschi', mostrar_precios: mostrar }] : [] }; } },
    '../services/conexionMayorista': { getConexionMayorista: async id => ({ query: async (sql, params) => { consultas.push({ id, sql, params }); return { rows: duplicado ? [{ nombre: 'A' }, { nombre: 'B' }] : [{ nombre: 'Cliente propio' }] }; } }) },
    '../services/ivanClienteConsultasConfig': { leer: async () => cfg, fallo },
    '../services/ivanClienteConsultasDatos': datos,
    '../services/ivanDescuentosComerciales': { leer: async () => ({}) },
    '../services/ivanCircuitoCliente': { activo: () => true, consultarCliente: async (id, cuit, actualizar) => { consultas.push({ id, cuit, actualizar }); return condiciones; } },
    './productos': catalogo
  });
  const app = express(); app.use('/api/cliente-consultas', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/cliente-consultas';
  const token = contenido => jwt.sign(contenido, process.env.JWT_SECRET);
  const propio = token({ tipo: 'cliente', mayorista_id: 23, cuit: '20355412777' });
  const pedir = (ruta, sesion = propio, method = 'GET') => fetch(base + ruta, { method, headers: { Authorization: 'Bearer ' + sesion } });
  await t.test('sin sesión, vencida, otro mayorista y sesión de mayorista no leen datos', async () => {
    for (const [sesion, status] of [['', 401], [token({ tipo: 'cliente', mayorista_id: 23, cuit: '20355412777', exp: 1 }), 401],
      [token({ tipo: 'cliente', mayorista_id: 24, cuit: '20355412777' }), 403], [token({ id: 23, email: 'fake@prueba.local' }), 403]]) assert.equal((await pedir('/lista/23', sesion)).status, status);
    assert.equal(llamadas.length, 0); assert.equal(consultas.length, 0);
  });
  await t.test('apagado y ocultar precios bloquean también URL directa', async () => {
    cfg = { descuentos: false, pdf: false, excel: false };
    assert.equal((await pedir('/descuentos/23')).status, 403); assert.equal((await pedir('/lista/23')).status, 403);
    cfg = { descuentos: true, pdf: true, excel: false }; mostrar = false;
    assert.deepEqual(await (await pedir('/configuracion/23')).json(), { descuentos: true, pdf: false, excel: false });
    assert.equal((await pedir('/lista/23')).status, 403); mostrar = true;
    activo = false; assert.equal((await pedir('/lista/23')).status, 403); activo = true;
  });
  await t.test('CUIT firmado y formato autorizado; no acepta escrituras ni subrutas del catálogo', async () => {
    assert.equal((await pedir('/lista/23?cuit=20324574124')).status, 400);
    assert.equal((await pedir('/lista/23?vista=gestion')).status, 400);
    assert.equal((await pedir('/lista/23/todos?formato=excel')).status, 403);
    assert.equal((await pedir('/lista/23/mis-precios-custom')).status, 404);
    assert.equal((await pedir('/lista/23', propio, 'POST')).status, 404);
    assert.equal(llamadas.length, 0);
  });
  await t.test('identidad única, filtros y precios idénticos al lector; respuesta mínima y no-store', async () => {
    duplicado = true; assert.equal((await pedir('/lista/23')).status, 409); assert.equal(llamadas.length, 0); duplicado = false;
    const r = await pedir('/lista/23?marca=CHEVROLET%2FGM&pagina=1'); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    const d = await r.json(); assert.equal(d.productos[0].precio, 37392.71); assert.equal(d.cliente.cuit, '20355412777'); assert.equal(d.mayorista_id, 23);
    assert.equal(llamadas[0].auth, 'Bearer ' + propio); assert.equal(llamadas[0].id, '23'); assert.equal(llamadas[0].query.marca, 'CHEVROLET/GM');
    assert.deepEqual(consultas.at(-1).params, ['20355412777']); assert.equal(JSON.stringify(d).includes('privada'), false);
    const op = await (await pedir('/lista/23/opciones')).json(); assert.deepEqual(Object.keys(op).sort(), ['marcas', 'rubros', 'tipos']);
    assert.equal((await pedir('/lista/23/todos?formato=pdf&rubro=JUNTAS')).status, 200);
  });
  await t.test('consulta condiciones del propio CUIT; el fallo del catálogo se conserva y no estima importes', async () => {
    const r = await pedir('/descuentos/23?pagina=31&actualizar=1'); assert.equal(r.status, 200);
    assert.equal((await r.json()).reglas.length, 11); assert.deepEqual(consultas.at(-1), { id: 23, cuit: '20355412777', actualizar: true });
    fallar = true; const falloPrecio = await pedir('/lista/23'); assert.equal(falloPrecio.status, 409);
    assert.deepEqual(await falloPrecio.json(), { mensaje: 'No se pudo confirmar el costo', codigo: 'CONDICIONES_IVAN_REVISAR' });
    assert.ok(central.every(c => !/UPDATE|INSERT|DELETE/i.test(c.sql)));
  });
});

test('configuración: validación estricta y transacción con revisión; sin tocar reglas comerciales', async () => {
  let revision = '0', opciones = { descuentos: false, pdf: false, excel: false }, conflicto = false;
  const sqls = [];
  const db = { release: () => sqls.push('RELEASE'), query: async (sql, p) => {
    sqls.push(sql);
    if (/SELECT/.test(sql)) return { rows: [{ ...opciones, revision: conflicto ? '7' : revision }] };
    if (/UPDATE/.test(sql)) { revision = String(Number(revision) + 1); opciones = { descuentos: p[1], pdf: p[2], excel: p[3] }; }
    return { rows: [] };
  } };
  const servicio = cargar('services/ivanClienteConsultasConfig.js', { '../db': { connect: async () => db, query: db.query } });
  await assert.rejects(servicio.guardar(23, { descuentos: 'true', pdf: false, excel: false, revision: '0' }), { status: 400 });
  await assert.rejects(servicio.guardar(23, { descuentos: true, pdf: false, excel: false, revision: '0', precio: 1 }), { status: 400 });
  assert.equal(sqls.length, 0);
  assert.deepEqual(await servicio.guardar(23, { descuentos: true, pdf: true, excel: false, revision: '0' }), { disponible: true, descuentos: true, pdf: true, excel: false, revision: '1' });
  assert.ok(sqls.some(s => /FOR UPDATE/.test(s))); assert.ok(sqls.includes('COMMIT'));
  conflicto = true; sqls.length = 0;
  await assert.rejects(servicio.guardar(23, { descuentos: true, pdf: true, excel: true, revision: '1' }), { status: 409 });
  assert.ok(sqls.includes('ROLLBACK')); assert.ok(!sqls.some(s => /^UPDATE/.test(s)));
  const ausente = cargar('services/ivanClienteConsultasConfig.js', { '../db': { query: async () => { throw Object.assign(Error('tabla ausente'), { code: '42P01' }); } } });
  assert.deepEqual(await ausente.leer(99), { disponible: false, descuentos: false, pdf: false, excel: false, revision: '0' });
});

test('integración con el router real de productos: catálogo, lista paginada y descarga tienen el mismo importe', async t => {
  const anterior = process.env.JWT_SECRET; process.env.JWT_SECRET = 'prueba-local-delegacion-no-produccion';
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  const db = { query: async sql => {
    if (/information_schema/.test(sql)) return { rows: [] };
    if (/FROM "viewClientes"/.test(sql)) return { rows: [{ nombre: 'Cuenta propia' }] };
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ count: '1' }] };
    if (/FROM "viewProductos"/.test(sql)) return { rows: [{ ...origen, precio_producto: '100.00' }] };
    throw Error('SQL externo no previsto: ' + sql);
  } };
  const pool = { query: async sql => {
    if (/imagen_mejorada_url/.test(sql)) return { rows: [] };
    if (/dto_pago_termino/.test(sql)) return { rows: [{ dto_pago_termino: 3 }] };
    if (/modelo_precio_catalogo/.test(sql)) return { rows: [{ modelo_precio_catalogo: 'precio_recibido' }] };
    if (/mostrar_precios/.test(sql)) return { rows: [{ id: 23, mostrar_precios: true, nombre: 'Moreschi' }] };
    throw Error('SQL central no previsto: ' + sql);
  } };
  const sesion = cargar('services/ivanSesionCosto.js', { './auditoriaIvan': { registrarDescuento: async () => {}, sinInterrumpir: () => {} } });
  const motor = require('../services/precioCatalogoMayorista');
  const identidad = async p => p;
  const catalogo = cargar('routes/productos.js', {
    '../db': pool, '../services/conexionMayorista': { getConexionMayorista: async () => db },
    '../services/ivanImagenesPropias': { aplicarImagenesPropias: identidad }, '../services/ivanTextoCatalogo': { aplicarTextosCatalogo: identidad },
    '../services/ivanMarcaProducto': { aplicarMarcaProducto: identidad },
    '../services/ivanCampoEquivalencias': { resolverCampo: async () => null, seleccionGrupo: () => '', identificadorSql: s => s },
    '../services/ivanEquivalenciasCodigos': {}, '../services/descuentoClienteIvan': { obtenerDescuentoItems: async () => 5 },
    '../services/ivanSesionCosto': sesion, '../services/ivanDescuentosComerciales': { leer: async () => ({}), condicion: async () => null },
    '../services/ivanDescuentosReglas': {}, '../services/ivanIvaCatalogo': { contexto: async () => null, aplicar: identidad },
    '../services/ivanCondicionesOrigen': { desdeConfig: () => ({ permiso: false, origen: {} }) }, '../services/ivanCircuitoCliente': { activo: () => false },
    '../services/precioCatalogoMayorista': { ...motor, asegurarColumnasPrecioMayorista: async () => {} }
  });
  const consultas = cargar('routes/cliente-consultas.js', {
    '../db': pool, '../services/conexionMayorista': { getConexionMayorista: async () => db },
    '../services/ivanClienteConsultasConfig': { fallo, leer: async () => ({ pdf: true, excel: true, descuentos: false }) },
    '../services/ivanClienteConsultasDatos': datos, '../services/ivanDescuentosComerciales': {}, '../services/ivanCircuitoCliente': {}, './productos': catalogo
  });
  const app = express(); app.use('/productos', catalogo); app.use('/consultas', consultas);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { Authorization: 'Bearer ' + jwt.sign({ tipo: 'cliente', mayorista_id: 23, cuit: '20355412777' }, process.env.JWT_SECRET) };
  const pedir = async ruta => { const r = await fetch(base + ruta, { headers }); const d = await r.json(); assert.equal(r.status, 200, JSON.stringify(d)); return d; };
  const normal = await pedir('/productos/23?vista=cliente');
  const paginada = await pedir('/consultas/lista/23');
  const completa = await pedir('/consultas/lista/23/todos?formato=excel');
  assert.equal(normal.productos[0].precio_producto, 92.15);
  assert.equal(paginada.productos[0].precio, normal.productos[0].precio_producto);
  assert.equal(completa.productos[0].precio, normal.productos[0].precio_producto);
});
