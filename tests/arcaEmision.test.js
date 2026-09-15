const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const controles = require('../services/arcaEmision');

test('importes exactos, IVA y alicuotas: rechaza diferencias y datos invalidos', () => {
  assert.equal(controles.centavos('1.005'), 101);
  assert.equal(controles.centavos('0.10'), 10);
  controles.validarImportes('121.00', [{ alicuota: 21, base: '100', iva: '21' }]);
  controles.validarImportes('231.50', [{ alicuota: 21, base: 100, iva: 21 }, { alicuota: 10.5, base: 100, iva: 10.5 }]);
  for (const total of ['120', '122', 'NaN', '-121', '0']) {
    assert.throws(() => controles.validarImportes(total, [{ alicuota: 21, base: 100, iva: 21 }]));
  }
  assert.throws(() => controles.validarImportes(121, [{ alicuota: 21, base: 110, iva: 11 }]));
  assert.throws(() => controles.validarImportes(105, [{ alicuota: 5, base: 100, iva: 5 }]));
});

const soap = (metodo, contenido) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${metodo}Response><${metodo}Result>${contenido}</${metodo}Result></${metodo}Response></s:Body></s:Envelope>`;
const fiscal = (estado = 'A', numero = 1) => soap('FECAESolicitar', `<FeCabResp><PtoVta>4</PtoVta><CbteTipo>6</CbteTipo><Resultado>${estado}</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>${estado}</Resultado><CbteDesde>${numero}</CbteDesde><CbteHasta>${numero}</CbteHasta><CAE>70417054367476</CAE><CAEFchVto>20260923</CAEFchVto></FECAEDetResponse></FeDetResp>`);

test('SOAP: no reinicia numeracion ante respuesta vacia y no acepta CAE de otro comprobante', async () => {
  assert.equal(await controles.ultimoAutorizado(soap('FECompUltimoAutorizado', '<CbteNro>0</CbteNro>')), 0);
  await assert.rejects(() => controles.ultimoAutorizado(soap('FECompUltimoAutorizado', '')));
  await assert.rejects(() => controles.ultimoAutorizado(soap('FECompUltimoAutorizado', '<Errors><Err>error</Err></Errors><CbteNro>0</CbteNro>')));
  assert.equal((await controles.autorizacion(fiscal(), 1, 4, 6)).cae, '70417054367476');
  await assert.rejects(() => controles.autorizacion(fiscal('A', 2), 1, 4, 6));
  await assert.rejects(() => controles.autorizacion(fiscal('R'), 1, 4, 6), e => e.rechazoFiscal === true);
});

// Extrae SOLO el handler. Nunca importa la ruta (asegurarTablas), el servidor ni db.js.
function handler(pool, axios) {
  const fuente = fs.readFileSync(require.resolve('../routes/superadmin/arca'), 'utf8');
  const inicio = fuente.indexOf("router.post('/facturar/:cliente_id'");
  const fin = fuente.indexOf('// ─── POST /conciliar/', inicio);
  assert(fin > inicio);
  const contexto = { pool, axios, require: p => require(p.replace('../../services/', '../services/')),
    verificarClienteId() {}, obtenerToken: async () => ({ token: 'MOCK', sign: 'MOCK', expira: new Date('2099-01-01') }),
    facturaHabilitada: () => true, fechaComprobanteARCA: () => '20260913', alicuotaAfipId: () => 5,
    WSFE_PROD: 'mock://wsfe', WSFE_HOMO: 'mock://homo', logARCA: async () => {},
    console: { error() {} }, router: { post: (_ruta, _mw, fn) => { contexto.fn = fn; } } };
  vm.runInNewContext(fuente.slice(inicio, fin), contexto);
  return contexto.fn;
}

function escenario({ fallo, pendiente = false, existente = false, total = '121.00', emisorCompleto = true, seriePendiente = false } = {}) {
  const llamadas = [], diario = [];
  let calls = 0, released = false, commit = false;
  const db = { release() { released = true; }, async query(sql, params) {
    llamadas.push(sql);
    if (sql === fallo || (fallo && sql.includes(fallo))) throw new Error('FALLO SIMULADO');
    if (sql === 'COMMIT') commit = true;
    if (sql.includes('pg_try_advisory')) return { rows: [{ ok: true }] };
    if (sql.includes('SELECT * FROM arca_comprobantes')) return { rows: existente ? [{ cae: '70417054367476', tipo_comprobante: '6', numero_completo: 'FB-0004-00000001' }] : [] };
    if (sql.includes('SELECT id FROM arca_logs')) return { rows: pendiente ? [{ id: 1 }] : [] };
    if (sql.includes('SELECT request FROM arca_logs')) return { rows: seriePendiente ? [{ request: 'venta:8|{"modo":"produccion","cuit":"24259173554","punto":4,"tipo":6}' }] : [] };
    if (sql.includes('SELECT * FROM arca_configuracion')) return { rows: [{ condicion_iva: '1', cuit: '24259173554', punto_venta: 4, modo: 'produccion' }] };
    if (sql.includes('SELECT * FROM ventas')) return { rows: [{ total }] };
    if (sql.includes('SUM(subtotal')) return { rows: [{ alicuota: '21', base_imp: '100', iva_monto: '21' }] };
    if (sql.includes('to_jsonb(c)')) return { rows: [{ cuit: '24259173554', razon_social: 'EMISOR SIMULADO', condicion_iva: 'Responsable Inscripto', direccion_fiscal: 'Prueba 123', ingresos_brutos: 'PRUEBA', inicio_actividades: emisorCompleto ? '2000-01-01' : null }] };
    if (sql.includes('SELECT vi.*')) return { rows: [{ cantidad: 1, subtotal: '100', iva_monto: '21', precio_unitario: '100', descripcion_libre: 'Prueba' }] };
    if (sql.includes('INSERT INTO arca_comprobantes')) return { rows: [{ id: 10 }] };
    return { rows: [], rowCount: 1 };
  } };
  const pool = { connect: async () => db, async query(sql, params) {
    diario.push({ sql, params });
    if (fallo === 'DIARIO' && sql.includes('INSERT INTO arca_logs')) throw new Error('DIARIO NO DISPONIBLE');
    return { rows: [{ id: 100 }] };
  } };
  const axios = { async post(_url, xml) {
    calls++;
    if (xml.includes('FECompUltimoAutorizado')) return { data: soap('FECompUltimoAutorizado', '<CbteNro>0</CbteNro>') };
    assert(diario.some(d => d.sql.includes('INSERT INTO arca_logs')), 'diario debe persistir antes del CAE');
    if (fallo === 'TIMEOUT') throw new Error('TIMEOUT SIMULADO');
    return { data: fiscal() };
  } };
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(d) { this.body = d; return this; } };
  return { async run() { await handler(pool, axios)({ params: { cliente_id: '11' }, body: { venta_id: 7 } }, res); },
    res, llamadas, diario, get calls() { return calls; }, get released() { return released; }, get commit() { return commit; } };
}

test('handler simulado: tres escrituras atomicas y journal sin secretos', async () => {
  const s = escenario(); await s.run();
  assert.equal(s.res.body.ok, true); assert(s.commit); assert(s.released);
  assert(s.llamadas.some(q => q.includes('INSERT INTO libros_iva_ventas')));
  const journal = s.diario.find(d => d.sql.includes('INSERT INTO arca_logs')).params[1];
  assert(!journal.includes('MOCK')); assert(journal.includes('EMISOR SIMULADO'));
});

test('handler simulado: falla contable posterior al CAE hace rollback, mantiene diario y no confirma exito', async () => {
  for (const fallo of ['INSERT INTO arca_comprobantes', 'UPDATE ventas SET', 'INSERT INTO libros_iva_ventas', 'COMMIT']) {
    const s = escenario({ fallo }); await s.run();
    assert.equal(s.res.statusCode, 500); assert(s.res.body.error.includes('No reintentar'));
    assert(s.llamadas.includes('ROLLBACK')); assert(s.released); assert(!s.commit);
    assert(s.diario.some(d => d.sql.includes('UPDATE arca_logs SET exitoso=true')));
  }
});

test('handler simulado: pendiente/duplicado/IVA incorrecto no solicita un nuevo CAE', async () => {
  for (const opciones of [{ pendiente: true }, { existente: true }, { total: '120.00' }]) {
    const s = escenario(opciones); await s.run(); assert.equal(s.calls, 0); assert(s.released);
    if (opciones.existente) assert.equal(s.res.body.ya_emitida, true);
    else assert.equal(s.res.statusCode, 500);
  }
  const s = escenario({ fallo: 'DIARIO' }); await s.run(); assert.equal(s.calls, 1); assert.equal(s.res.statusCode, 500);
  const t = escenario({ fallo: 'TIMEOUT' }); await t.run(); assert.equal(t.res.statusCode, 500);
  assert(t.diario.some(d => d.sql.includes('INSERT INTO arca_logs')));
});

test('locks simulados: rechaza competidor y libera conexion al fallar', async () => {
  let liberado = false; const queries = [];
  const db = { release() { liberado = true; }, async query(q) { queries.push(q); return { rows: [{ ok: false }] }; } };
  await assert.rejects(() => controles.iniciarEmision({ connect: async () => db }, 11, 7));
  assert(liberado); assert(queries.includes('ROLLBACK'));
  await assert.rejects(() => controles.bloquearSerie(db, 'produccion', '24259173554', 4, 6));
});
test('handler simulado: bloquea datos fiscales faltantes e intento pendiente de otra venta de la misma serie', async () => {
  for (const opciones of [{ emisorCompleto: false }, { seriePendiente: true }]) {
    const s = escenario(opciones); await s.run();
    assert.equal(s.calls, 0); assert.equal(s.res.statusCode, 500); assert(s.released);
    assert(!s.diario.some(d => d.sql.includes('INSERT INTO arca_logs')));
  }
});
