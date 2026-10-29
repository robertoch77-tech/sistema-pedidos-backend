'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

test('pago global solo por sesión del mayorista propio; actualizar cliente transmite refrescar', async t => {
  const anterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'clave-solo-prueba-local-no-produccion';
  t.after(() => { if (anterior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = anterior; });
  const llamadas = [];
  const circuito = {
    esCircuito: () => true,
    guardarPagoTermino: async (id, datos) => { llamadas.push({ id, datos }); return { version: 2 }; },
    consultarCliente: async (id, cuit, refrescar) => { llamadas.push({ id, cuit, refrescar }); return {}; }
  };
  const modulo = { exports: {} };
  const stubs = {
    '../services/conexionMayorista': {}, '../services/ivanFuncionesCatalogo': { mayoristaValido: async id => Number(id) },
    '../services/ivanDescuentosComerciales': { leer: async () => ({ habilitado: true }) },
    '../services/ivanDescuentosReglas': {}, '../services/ivanPrecioOrigen': {},
    '../services/ivanConsultaCondicion': {}, '../services/ivanCondicionesOrigen': {},
    '../services/ivanCircuitoCliente': circuito
  };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../routes/descuentos-comerciales.js'), 'utf8'))(
    nombre => nombre in stubs ? stubs[nombre] : require(nombre), modulo, modulo.exports);
  const app = express(); app.use(express.json()); app.use('/d', modulo.exports);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/d/23/origen-ivan/';
  const guardar = token => fetch(base + 'pago-termino', { method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ version: 1, habilitado: true, porcentaje: '5' }) });
  assert.equal((await guardar()).status, 401);
  assert.equal((await guardar(jwt.sign({ tipo: 'cliente', mayorista_id: 23, cuit: '20355412777' }, process.env.JWT_SECRET))).status, 401);
  assert.equal((await guardar(jwt.sign({ id: 24 }, process.env.JWT_SECRET))).status, 401);
  assert.equal(llamadas.length, 0);
  const token = jwt.sign({ id: 23 }, process.env.JWT_SECRET);
  assert.equal((await guardar(token)).status, 200);
  assert.deepEqual(llamadas[0], { id: 23, datos: { version: 1, habilitado: true, porcentaje: '5' } });
  const respuesta = await fetch(base + 'cliente?cuit=20355412777&refrescar=1', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(respuesta.status, 200); assert.equal(llamadas[1].refrescar, true);
});
