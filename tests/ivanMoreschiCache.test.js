'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearCache } = require('../services/ivanCondicionesCache');

test('comparte una lectura simultánea y reutiliza hasta los 30 s, sin renovar el vencimiento por uso', async () => {
  let reloj = 0, lecturas = 0;
  const cache = crearCache({ ahora: () => reloj }), db = {};
  const cargar = async () => ({ reglas: [], lectura: ++lecturas });
  const [a, b] = await Promise.all([cache(db, '23|CUIT|1', cargar), cache(db, '23|CUIT|1', cargar)]);
  assert.equal(a, b); assert.equal(lecturas, 1);
  reloj = 29999;
  assert.equal(await cache(db, '23|CUIT|1', cargar), a);
  reloj = 30000;
  assert.notEqual(await cache(db, '23|CUIT|1', cargar), a); assert.equal(lecturas, 2);
});
test('separa CUIT, versión, mayorista y pool de conexión', async () => {
  const cache = crearCache(), a = {}, b = {};
  let lecturas = 0;
  const cargar = async () => ({ reglas: [], lectura: ++lecturas });
  for (const [db, clave] of [[a,'23|A|1'],[a,'23|B|1'],[a,'23|A|2'],[a,'24|A|1'],[b,'23|A|1']]) await cache(db, clave, cargar);
  assert.equal(lecturas, 5);
});
test('refrescar reemplaza una lectura pendiente y su respuesta tardía no pisa la nueva', async () => {
  const cache = crearCache(), db = {};
  let terminar;
  const vieja = cache(db, 'c', () => new Promise(resolve => { terminar = resolve; }));
  await Promise.resolve();
  const nueva = { reglas: [], valor: 2 };
  await cache(db, 'c', async () => nueva, true);
  terminar({ reglas: [], valor: 1 }); await vieja;
  assert.equal(await cache(db, 'c', () => { throw Error('No debe cargar'); }), nueva);
});
test('no conserva errores ni usa datos vencidos si falla su renovación', async () => {
  let reloj = 0;
  const cache = crearCache({ ahora: () => reloj }), db = {};
  await cache(db, 'c', async () => ({ reglas: [], dato: 'viejo' }));
  reloj = 30000;
  await assert.rejects(cache(db, 'c', async () => { throw Error('origen caído'); }), /origen caído/);
  const nuevo = await cache(db, 'c', async () => ({ reglas: [], dato: 'nuevo' }));
  assert.equal(nuevo.dato, 'nuevo');
});
test('limita clientes y peso sin truncar condiciones ni bloquear una lectura grande', async () => {
  let lecturas = 0;
  const cache = crearCache({ maxClientes: 2, maxReglas: 4 }), db = {};
  const cargar = async () => ({ reglas: [1,2], lectura: ++lecturas });
  await cache(db, 'a', cargar); await cache(db, 'b', cargar); await cache(db, 'c', cargar);
  await cache(db, 'a', cargar); assert.equal(lecturas, 4);
  const grande = await cache(db, 'grande', async () => ({ reglas: new Array(20) }));
  assert.equal(grande.reglas.length, 20);
  let repite = false;
  await cache(db, 'grande', async () => { repite = true; return { reglas: [] }; });
  assert.equal(repite, true);
});
