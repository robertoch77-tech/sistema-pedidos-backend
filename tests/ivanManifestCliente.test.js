'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const manifestCliente = require('../services/ivanManifestCliente');
const { crearManifest, CODIGO_LUMAC } = manifestCliente;

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
test('cada mayorista conserva su entrada de cliente y usa su logo o el predeterminado', () => {
  const base = crearManifest(CODIGO_LUMAC, 'Lumac');
  const logo = 'https://res.cloudinary.com/demo/image/upload/v123/ivan_logos/23/logo.jpg';
  const personalizado = crearManifest(CODIGO_LUMAC, 'Lumac', undefined, logo);
  assert.equal(new URL(base.start_url).searchParams.get('m'), CODIGO_LUMAC);
  assert.equal(base.start_url, personalizado.start_url);
  assert.equal(base.id, personalizado.id);
  assert.match(base.icons[0].src, /logo-login-ivan-192\.png$/);
  assert.equal(personalizado.icons[1].src,
    'https://res.cloudinary.com/demo/image/upload/c_pad,w_512,h_512,b_white,f_png/v123/ivan_logos/23/logo.jpg');
  assert.deepEqual(crearManifest(CODIGO_LUMAC, 'Lumac', undefined, 'https://ejemplo.com/logo.jpg'), base);
  const bobinar = crearManifest('bobinar', 'Bobinar');
  const logoBobinar = 'https://res.cloudinary.com/demo/image/upload/v321/ivan_logos/24/logo.png';
  const bobinarPersonalizado = crearManifest('bobinar', 'Bobinar', undefined, logoBobinar);
  assert.equal(bobinar.id, bobinarPersonalizado.id);
  assert.notEqual(base.id, bobinar.id);
  assert.match(bobinar.icons[0].src, /logo-ivan-192\.png$/);
  assert.match(bobinarPersonalizado.icons[0].src, /ivan_logos\/24\/logo\.png$/);
});

test('carga de logo admite mayoristas activos de Iván y conserva el aislamiento por cuenta', async t => {
  const jwt = require('jsonwebtoken');
  const secretoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'secreto-local-de-la-prueba-del-logo';
  t.after(() => {
    if (secretoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secretoAnterior;
  });
  const registro = [];
  let disponible = false;
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../routes/marca-mayorista.js'), 'utf8'))(
    nombre => {
      if (nombre === '../db') return { query: async (sql, args) => {
        registro.push({ sql, args });
        assert.match(sql, /activo=true AND tipo_fuente IS DISTINCT FROM 'roberto'/);
        const guardar = sql.includes('UPDATE mayoristas');
        const [id, email] = guardar ? args.slice(1) : args;
        const cuenta = (id === 23 && email === 'lumac@lumac') || (id === 24 && email === 'otro@example.com');
        return { rows: cuenta ? [{ logo_url: guardar ? args[0] : '' }] : [] };
      } };
      if (nombre === '../services/ivanManifestCliente') return manifestCliente;
      if (nombre === './imagenes-productos') return { herramientasImagenes: {
        cloudinaryConfig: () => disponible ? { cloud: 'demo' } : null,
        cloudinaryPost: async (ruta, datos) => {
          assert.equal(ruta, 'image/upload');
          assert.match(datos.file, /^data:image\/png;base64,/);
          assert.match(datos.public_id, /^ivan_logos\/(23|24)\//);
          return {
            public_id: datos.public_id,
            secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/' + datos.public_id + '.png',
          };
        },
      } };
      return require(nombre);
    }, modulo, modulo.exports);
  const app = express();
  app.use('/marca', modulo.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/marca/';
  const token = (id, email) => jwt.sign({ id, email }, process.env.JWT_SECRET);
  const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X1sAAAAASUVORK5CYII=', 'base64');
  const post = (id, autorizacion, datos = pixelPng) => {
    const body = new FormData();
    body.append('logo', new Blob([datos], { type: 'image/png' }), 'logo.png');
    return fetch(url + id + '/logo', { method: 'POST', headers: autorizacion ? { Authorization: 'Bearer ' + autorizacion } : {}, body });
  };
  const lumac = token(23, 'lumac@lumac');
  const otro = token(24, 'otro@example.com');
  assert.equal((await post(23)).status, 401);
  assert.equal((await post(24, lumac)).status, 403);
  assert.equal((await post(23, otro)).status, 403);
  assert.equal((await post(25, token(25, 'roberto@example.com'))).status, 404);
  assert.equal((await post(26, token(26, 'inactivo@example.com'))).status, 404);
  assert.equal((await post(23, lumac, Buffer.from('imagen inválida'))).status, 400);
  assert.equal((await post(23, lumac)).status, 503);
  assert.ok(registro.every(({ sql }) => !sql.includes('UPDATE mayoristas')));
  disponible = true;
  const guardado = await post(23, lumac);
  assert.equal(guardado.status, 200);
  assert.match((await guardado.json()).logo_url, /ivan_logos\/23\//);
  assert.deepEqual(registro.at(-1).args.slice(1), [23, 'lumac@lumac']);
  const guardadoOtro = await post(24, otro);
  assert.equal(guardadoOtro.status, 200);
  assert.match((await guardadoOtro.json()).logo_url, /ivan_logos\/24\//);
  assert.deepEqual(registro.at(-1).args.slice(1), [24, 'otro@example.com']);
});

test('endpoint público filtra mayorista activo de Iván y no expone configuración privada', async t => {
  const consultas = [];
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '../routes/marca-mayorista.js'), 'utf8'))(
    nombre => nombre === '../db' ? { query: async (sql, params) => {
      consultas.push({ sql, params });
      return { rows: params[0] === 'moreschi' ? [{ nombre: 'Moreschi' }] : [] };
    } } : nombre === '../services/ivanManifestCliente' ? manifestCliente : require(nombre), modulo, modulo.exports);
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
