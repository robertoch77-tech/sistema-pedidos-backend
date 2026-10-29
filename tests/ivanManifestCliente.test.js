'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { crearManifest } = require('../services/ivanManifestCliente');

test('arranque e identidad separan proveedor y rol; sin tokens ni CUIT y con URLs absolutas del frontend', () => {
  const m = crearManifest('moreschi', 'Moreschi');
  assert.equal(m.start_url, 'https://sistemagestionpedidos.netlify.app/login?m=moreschi');
  assert.equal(m.id, m.start_url);
  assert.equal(new URL(m.scope).origin, new URL(m.start_url).origin);
  assert.ok(m.icons.every(i => new URL(i.src).origin === new URL(m.start_url).origin));
  assert.notEqual(m.id, crearManifest('bobinar', 'Bobinar').id);
  assert.notEqual(m.id, new URL('/login', m.scope).href);
  assert.doesNotMatch(JSON.stringify(m), /token|cuit|dashboard/i);
});
test('codifica el proveedor y rechaza orígenes ajenos; permite desarrollo local', () => {
  const m = crearManifest('a & b', 'Nombre', 'http://localhost:3000');
  assert.equal(new URL(m.start_url).searchParams.get('m'), 'a & b');
  assert.throws(() => crearManifest('moreschi', 'M', 'https://ajeno.example'), { status: 400 });
  assert.throws(() => crearManifest('moreschi', 'M', ['https://sistemagestionpedidos.netlify.app']), { status: 400 });
});
test('endpoint público filtra mayorista activo de Iván y no expone configuración privada', async t => {
  const consultas = [];
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../routes/marca-mayorista.js'), 'utf8'))(
    nombre => nombre === '../db' ? { query: async (sql, params) => {
      consultas.push({ sql, params });
      return { rows: params[0] === 'moreschi' ? [{ nombre: 'Moreschi' }] : [] };
    } } : nombre === '../services/ivanManifestCliente' ? { crearManifest } : require(nombre), modulo, modulo.exports);
  const app = express(); app.use('/marca', modulo.exports);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/marca/publico/';
  const ok = await fetch(url + 'moreschi/manifest.json');
  assert.equal(ok.status, 200); assert.match(ok.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await ok.json()).start_url, crearManifest('moreschi', 'Moreschi').start_url);
  assert.match(consultas[0].sql, /activo=true AND tipo_fuente IS DISTINCT FROM 'roberto'/);
  assert.doesNotMatch(consultas[0].sql, /db_connection|password|doc_cliente/i);
  assert.equal((await fetch(url + 'inactivo/manifest.json')).status, 404);
  assert.equal((await fetch(url + 'moreschi/manifest.json?origen=https://ajeno.example')).status, 400);
});
