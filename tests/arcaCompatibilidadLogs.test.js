const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'routes', 'superadmin', 'arca.js'), 'utf8');

test('facturar comprueba la configuración antes de consultar intentos anteriores', () => {
  const inicio = fuente.indexOf("router.post('/facturar/:cliente_id'");
  const fin = fuente.indexOf('// ─── POST /conciliar/', inicio);
  const ruta = fuente.slice(inicio, fin);
  assert(inicio >= 0 && fin > inicio);
  assert(ruta.indexOf('SELECT * FROM arca_configuracion') < ruta.indexOf("tipo='factura_intento'"));
});

test('las búsquedas del diario fiscal aceptan columnas TEXT o JSONB', () => {
  assert.match(fuente, /request::text LIKE/);
  assert.match(fuente, /response::text NOT LIKE/);
  assert.doesNotMatch(fuente, /factura_intento[^`]+request LIKE/);
});
