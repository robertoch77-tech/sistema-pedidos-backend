'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

function cargar(archivo, stubs) {
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../', archivo), 'utf8'))(
    nombre => Object.hasOwn(stubs, nombre) ? stubs[nombre] : require(nombre), modulo, modulo.exports);
  return modulo.exports;
}
async function servidor(t, router) {
  const app = express(); app.use(router);
  const s = app.listen(0, '127.0.0.1'); await new Promise(r => s.once('listening', r));
  t.after(() => new Promise(r => s.close(r)));
  return 'http://127.0.0.1:' + s.address().port;
}
test('conteo autenticado: no acepta otra cuenta, rol, CUIT de consulta ni sesión vencida', async t => {
  const previa = process.env.JWT_SECRET; process.env.JWT_SECRET = 'solo-pruebas-locales-sin-acceso-real';
  t.after(() => { if (previa === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previa; });
  const consultas = []; let falla = false;
  const router = cargar('routes/pedidos.js', {
    '../db': { query: async (sql, params) => {
      consultas.push({ sql, params }); if (falla) throw Error('Fallo simulado');
      return { rows: sql.includes('FROM mayoristas') ? [{ id: params[0] }] : [{ borradores: 3 }] };
    } },
    '../services/conexionMayorista': {}, '../services/ivanBultos': {}, '../services/ivanIvaCatalogo': {},
    '../services/notificacionesIvan': {}, '../services/auditoriaIvan': {}, '../services/precioCatalogoMayorista': {}
  });
  const url = await servidor(t, router);
  const consultar = (payload, extra = '') => fetch(url + '/resumen-cliente/23' + extra, { headers: payload ? {
    Authorization: 'Bearer ' + jwt.sign(payload, process.env.JWT_SECRET)
  } : {} });
  assert.equal((await consultar()).status, 401);
  assert.equal((await consultar({ tipo: 'cliente', mayorista_id: 24, cuit: '20355412777' })).status, 403);
  assert.equal((await consultar({ id: 23, tipo: 'mayorista', cuit: '20355412777' })).status, 403);
  assert.equal((await consultar({ tipo: 'cliente', mayorista_id: 23, cuit: '20355412777', exp: 1 })).status, 401);
  assert.equal(consultas.length, 0);
  const sesion = { tipo: 'cliente', mayorista_id: 23, cuit: '20-35541277-7' };
  const r = await consultar(sesion, '?cuit=20227724529&mayorista_id=24');
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { borradores: 3 });
  assert.deepEqual(consultas[1].params, [23, ['20-35541277-7', '20355412777']]);
  assert.match(consultas[1].sql, /mayorista_id=\$1.*cliente_cuit::text=ANY\(\$2::text\[\]\).*estado='borrador'/s);
  assert.ok(consultas.every(c => /^SELECT/.test(c.sql)));
  falla = true; assert.equal((await consultar(sesion)).status, 503);
});
