'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearCache } = require('../services/ivanCondicionesCache');
const errorCliente = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });
function cargar(archivo, dependencias) {
  const modulo = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8'))(
    nombre => {
      if (!(nombre in dependencias)) throw Error('Dependencia no simulada: ' + nombre);
      return dependencias[nombre];
    }, modulo, modulo.exports);
  return modulo.exports;
}
const cascada = cargar('services/ivanCascadaOrigen.js', { '../db': {}, './ivanImagenesDatos': { errorCliente } });
const pago = cargar('services/ivanPagoTermino.js', { './ivanImagenesDatos': { errorCliente }, './ivanCascadaOrigen': cascada });
const nuevaCfg = () => ({ disponible: true, habilitado: true, activo: false, version: 1, datos: {
  perfiles: [{ id: 'preservar' }], ivan: { habilitado: true, aplicar_catalogo: true, integracion: 'cuit_reglas_v3', permitir_iva: true, con_iva: false }
} });
function entorno() {
  let cfg = nuevaCfg(), modelo = 'precio_recibido', lecturas = 0, nombres = 0, fallar = false;
  const db = { query: async () => {
    lecturas++;
    if (fallar) throw Error('Iván caído');
    return { rows: [{ id: '1934', nombre: 'Cliente', general: '23', descuento: '5' }] };
  } };
  const origen = {
    estructura: async () => ({
      clientes: { campos: ['id_cliente','porcentaje_descuento','porcentaje_descuento_items'].map(nombre => ({ nombre })) },
      productos: { campos: ['rubro','marca','tipo'].map(k => ({ nombre: 'id_producto_' + k })) },
      reglas: { campos: ['fk_id_cliente','porcentaje','fk_id_producto_rubro','fk_id_producto_marca','fk_id_producto_tipo'].map(nombre => ({ nombre })) }
    }),
    cargarReglas: async () => [],
    nombresReglas: async () => { nombres++; return []; }
  };
  const descuentos = {
    leer: async () => cfg,
    transaccion: async (id, actor, version, editar) => {
      assert.equal(id, 23); assert.equal(actor, 'mayorista');
      if (version !== cfg.version) throw errorCliente('versión cambió', 409);
      cfg = { ...await editar(cfg), version: cfg.version + 1 }; return cfg;
    }
  };
  const circuito = cargar('services/ivanCircuitoCliente.js', {
    '../db': { query: async () => ({ rows: [{ modelo_precio_catalogo: modelo, iva: '21', dto_pago_termino: '99' }] }) },
    './conexionMayorista': { getConexionMayorista: async () => db },
    './ivanDescuentosComerciales': descuentos, './ivanCondicionesOrigen': origen, './ivanCascadaOrigen': cascada,
    './ivanPagoTermino': pago, './ivanCondicionesCache': { crearCache },
    './ivanFuncionesCatalogo': { mayoristaValido: async () => 23 },
    './ivanImagenesDatos': { errorCliente, idSeguro: Number }
  });
  return { circuito, db, origen, get cfg() { return cfg; }, set cfg(v) { cfg = v; },
    get lecturas() { return lecturas; }, get nombres() { return nombres; },
    modelo: v => { modelo = v; }, fallar: v => { fallar = v; } };
}

test('pago apagado por defecto; nunca importa el dto global anterior ni modifica otro mayorista', async () => {
  const e = entorno();
  assert.deepEqual((await e.circuito.resumen(23)).pago_termino, { habilitado: false, porcentaje: '0' });
  assert.deepEqual((await e.circuito.consultarCliente(23, '20355412777')).pago_termino, { habilitado: false, porcentaje: '0' });
  const ctx = await e.circuito.contexto(23, e.db, '20355412777');
  assert.deepEqual(ctx.todas.map(r => r.porcentaje), ['23','5']);
  assert.equal((await e.circuito.resumen(24)).pago_termino, undefined);
  e.cfg.datos.ivan.pago_termino = { habilitado: true, porcentaje: '5' };
  const otro = await e.circuito.contexto(24, e.db, '20355412777');
  assert.deepEqual(otro.todas.map(r => r.porcentaje), ['23','5']);
  await assert.rejects(e.circuito.guardarPagoTermino(24, { version: 1, habilitado: true, porcentaje: '5' }), { status: 403 });
});
test('guardar conserva el resto del JSON, incrementa versión, aplica una sola vez y permite apagar o cambiar porcentaje', async () => {
  const e = entorno();
  const anterior = await e.circuito.contexto(23, e.db, '20355412777');
  await e.circuito.guardarPagoTermino(23, { version: 1, habilitado: true, porcentaje: '5' });
  assert.deepEqual(e.cfg.datos.perfiles, [{ id: 'preservar' }]); assert.equal(e.cfg.datos.ivan.con_iva, false);
  const nuevo = await e.circuito.contexto(23, e.db, '20355412777');
  assert.notEqual(nuevo, anterior); assert.deepEqual(nuevo.todas.map(r => r.porcentaje), ['23','5','5']);
  const consulta = await e.circuito.consultarCliente(23, '20355412777');
  assert.equal(consulta.version, 2);
  assert.deepEqual(consulta.pago_termino, { habilitado: true, porcentaje: '5' });
  await assert.rejects(e.circuito.guardarPagoTermino(23, { version: 1, habilitado: true, porcentaje: '7' }), { status: 409 });
  await e.circuito.guardarPagoTermino(23, { version: 2, habilitado: true, porcentaje: '7.5' });
  assert.equal((await e.circuito.contexto(23, e.db, '20355412777')).todas.at(-1).porcentaje, '7.5');
  await e.circuito.guardarPagoTermino(23, { version: 3, habilitado: false, porcentaje: '7.5' });
  assert.equal((await e.circuito.contexto(23, e.db, '20355412777')).todas.length, 2);
});
test('rechaza porcentajes inválidos y activaciones sin integración ni permiso', async () => {
  const e = entorno();
  for (const porcentaje of ['', null, -1, 101, 'texto', NaN, Infinity, {}]) {
    await assert.rejects(e.circuito.guardarPagoTermino(23, { version: 1, habilitado: true, porcentaje }));
  }
  await assert.rejects(e.circuito.guardarPagoTermino(23, { version: 1, habilitado: true, porcentaje: 0 }));
  e.cfg.habilitado = false;
  await assert.rejects(e.circuito.guardarPagoTermino(23, { version: 1, habilitado: true, porcentaje: '5' }), { status: 403 });
});
test('general y adicional salen de cada CUIT; no fija 23/5 para todos', async () => {
  const e = entorno();
  e.db.query = async (sql, [cuit]) => ({ rows: [{ id: cuit === '20355412777' ? '1934' : '2105', nombre: 'Cliente', general: cuit === '20355412777' ? '23' : '8', descuento: '0' }] });
  const a = await e.circuito.contexto(23, e.db, '20355412777');
  const b = await e.circuito.contexto(23, e.db, '27286582759');
  assert.equal(a.cliente.general, '23'); assert.equal(b.cliente.general, '8');
  assert.equal(b.cliente.id, '2105');
});
test('reutiliza condiciones y nombres; actualiza a pedido y comprueba modelo/permisos antes de usar cache', async () => {
  const e = entorno();
  await e.circuito.consultarCliente(23, '20355412777');
  await e.circuito.consultarCliente(23, '20355412777');
  assert.equal(e.lecturas, 1); assert.equal(e.nombres, 1);
  await e.circuito.consultarCliente(23, '20355412777', true);
  assert.equal(e.lecturas, 2); assert.equal(e.nombres, 2);
  e.modelo('costo_margen_iva');
  await assert.rejects(e.circuito.contexto(23, e.db, '20355412777'), { status: 409 });
  e.modelo('precio_recibido'); e.cfg.habilitado = false;
  assert.equal(await e.circuito.contexto(23, e.db, '20355412777'), null);
});
test('sin cache para diagnóstico; errores no se guardan; otros mayoristas siguen leyendo cada vez', async () => {
  const e = entorno();
  await e.circuito.contexto(23, e.db, '20355412777');
  await e.circuito.contexto(23, e.db, '20355412777', null, { sinCache: true });
  assert.equal(e.lecturas, 2);
  e.fallar(true);
  await assert.rejects(e.circuito.contexto(23, e.db, '20355412777', null, { refrescar: true }));
  e.fallar(false);
  await e.circuito.contexto(23, e.db, '20355412777'); assert.equal(e.lecturas, 4);
  await e.circuito.contexto(24, e.db, '20355412777'); await e.circuito.contexto(24, e.db, '20355412777');
  assert.equal(e.lecturas, 6);
});
test('cinco mil condiciones se cargan una vez para veinte búsquedas simultáneas', async () => {
  const e = entorno(); let cargas = 0;
  e.origen.cargarReglas = async () => { cargas++; return Array.from({ length: 5000 }, (_, n) => ({ rubro: String(n), marca: null, tipo: null, porcentaje: '8' })); };
  const contextos = await Promise.all(Array.from({ length: 20 }, () => e.circuito.contexto(23, e.db, '20355412777')));
  assert.equal(cargas, 1); assert.equal(e.lecturas, 1);
  assert.equal(contextos[0].reglas.length, 5000); assert.ok(contextos.every(c => c === contextos[0]));
});

// Oráculo decimal exacto para la respuesta simulada de NUMERIC. La consulta SQL
// existente se ejecuta solo contra este doble; esto NO valida PostgreSQL real.
function decimal(v) { const [entero, fraccion = ''] = String(v).split('.'); return [BigInt(entero + fraccion), 10n ** BigInt(fraccion.length)]; }
function importeExacto(base, reglas) {
  let [n, d] = decimal(base);
  for (const regla of reglas) { const [p, escala] = decimal(regla.porcentaje); n *= 100n * escala - p; d *= 100n * escala; }
  const centavos = (n * 100n * 2n + d) / (2n * d);
  return (centavos / 100n) + '.' + String(centavos % 100n).padStart(2, '0');
}
test('cascada 23%, 5%, pago 5% da 37392.71; rubro/marca/tipo restringen solo sus reglas, no el pago', async () => {
  const llamadas = [];
  const calcular = cargar('services/ivanCascadaOrigen.js', {
    './ivanImagenesDatos': { errorCliente },
    '../db': { query: async (sql, [json]) => {
      assert.match(sql, /WITH RECURSIVE/); llamadas.push(JSON.parse(json));
      return { rows: JSON.parse(json).map(f => ({ id: f.id, base: String(f.base), importe: importeExacto(f.base, f.reglas), pasos: [] })) };
    } }
  });
  const origen = cargar('services/ivanCondicionesOrigen.js', {
    '../db': {}, './conexionMayorista': {}, './ivanDescuentosComerciales': {}, './ivanCascadaOrigen': calcular,
    './ivanFuncionesCatalogo': {}, './ivanImagenesDatos': { errorCliente, idSeguro: Number }
  });
  const e = entorno();
  await e.circuito.guardarPagoTermino(23, { version: 1, habilitado: true, porcentaje: '5' });
  const ctx = await e.circuito.contexto(23, e.db, '20355412777');
  ctx.db = { query: async () => ({ rows: [{ id: '3149', rubro: '105', marca: '19', tipo: '23' }] }) };
  const [p] = await origen.aplicar([{ id_producto: 3149, precio_producto: '53808.27' }], ctx);
  assert.equal(p.precio_producto, 37392.71);
  const regla = { etiqueta: 'Coincidencia', porcentaje: '8', rubro: '105', marca: '19', tipo: '23' };
  const ctx2 = { ...ctx, todas: pago.agregar([...ctx.todas.slice(0, 2), regla], pago.leer(23, e.cfg)) };
  await origen.aplicar([{ id_producto: 3149, precio_producto: '53808.27' }], ctx2);
  assert.deepEqual(llamadas.at(-1)[0].reglas.map(r => r.porcentaje), ['23','5','8','5']);
  const ctx3 = { ...ctx2, db: { query: async () => ({ rows: [{ id: '3149', rubro: '105', marca: '20', tipo: '23' }] }) } };
  await origen.aplicar([{ id_producto: 3149, precio_producto: '53808.27' }], ctx3);
  assert.deepEqual(llamadas.at(-1)[0].reglas.map(r => r.porcentaje), ['23','5','5']);
});
